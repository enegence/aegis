import type { FastifyInstance } from 'fastify';
import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { eq } from 'drizzle-orm';
import { contacts } from '../db/schema.js';
import {
  hashClaimToken,
  getClaimByTokenHash,
  updateClaimStatus,
  type ContactClaimRecord,
  type ClaimStatus,
} from '../repositories/contact-claim-repository.js';
import {
  getReleaseRunById,
  completeReleaseRun,
} from '../repositories/release-run-repository.js';
import { getPacketById, loadPacketKey } from '../repositories/packet-repository.js';
import { decryptField } from '../services/field-encrypt.js';
import { markSwitchStatus } from '../services/switch-repository.js';
import { writeAuditEvent } from '../services/audit.js';

// In-memory rate limiter for PIN verification (per claim ID)
const pinFailureCount = new Map<number, number>();
export const MAX_PIN_FAILURES = 5;

const TERMINAL_STATUSES = new Set<ClaimStatus>([
  'acknowledged', 'expired', 'escalated', 'failed',
]);

async function lookupActiveClaim(
  app: FastifyInstance,
  token: string,
  reply: { status: (code: number) => { send: (body: unknown) => void }; send: (body: unknown) => unknown },
): Promise<ContactClaimRecord | null> {
  if (!token || token.length < 10) {
    reply.status(404).send({ error: 'Not found' });
    return null;
  }

  const tokenHash = hashClaimToken(token);
  const claim = await getClaimByTokenHash(app.db, tokenHash);

  if (!claim) {
    reply.status(404).send({ error: 'Not found' });
    return null;
  }

  if (TERMINAL_STATUSES.has(claim.status)) {
    reply.status(403).send({ error: 'Claim is no longer active' });
    return null;
  }

  if (claim.expiresAt < new Date()) {
    reply.status(403).send({ error: 'Claim has expired' });
    return null;
  }

  return claim;
}

function toPublicSummary(claim: ContactClaimRecord) {
  return {
    claimId: claim.id,
    status: claim.status,
    expiresAt: claim.expiresAt.toISOString(),
    openedAt: claim.openedAt?.toISOString() ?? null,
    verifiedAt: claim.verifiedAt?.toISOString() ?? null,
    acceptedAt: claim.acceptedAt?.toISOString() ?? null,
    packetDownloadedAt: claim.packetDownloadedAt?.toISOString() ?? null,
    keyViewedAt: claim.keyViewedAt?.toISOString() ?? null,
    acknowledgedAt: claim.acknowledgedAt?.toISOString() ?? null,
  };
}

const ACCEPTED_OR_LATER = new Set<ClaimStatus>([
  'accepted', 'packet_downloaded', 'key_viewed', 'acknowledged',
]);

export async function claimRoutes(app: FastifyInstance) {
  // GET /api/claim/:token — public summary (no auth required)
  app.get('/api/claim/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const claim = await lookupActiveClaim(app, token, reply);
    if (!claim) return;

    const contactRows = await app.db
      .select({ claimPinHash: contacts.claimPinHash })
      .from(contacts)
      .where(eq(contacts.id, claim.contactId));
    const pinRequired = !!contactRows[0]?.claimPinHash;

    return reply.send({ ...toPublicSummary(claim), pinRequired });
  });

  // POST /api/claim/:token/open — contact visits the claim link
  app.post('/api/claim/:token/open', async (req, reply) => {
    const { token } = req.params as { token: string };
    const claim = await lookupActiveClaim(app, token, reply);
    if (!claim) return;

    const now = new Date();
    await updateClaimStatus(app.db, claim.id, {
      status: 'opened',
      openedAt: claim.openedAt ?? now,
    });

    await writeAuditEvent(app.db, {
      switchId: claim.switchId,
      eventType: 'claim_opened',
      actorType: 'contact',
      metadata: { claimId: claim.id, releaseRunId: claim.releaseRunId },
    });

    return reply.send({ ok: true });
  });

  // POST /api/claim/:token/verify — verify identity (PIN or no-PIN confirmation)
  app.post('/api/claim/:token/verify', async (req, reply) => {
    const { token } = req.params as { token: string };
    const claim = await lookupActiveClaim(app, token, reply);
    if (!claim) return;

    // Rate limit: reject immediately if already locked
    const failures = pinFailureCount.get(claim.id) ?? 0;
    if (failures >= MAX_PIN_FAILURES) {
      return reply.status(429).send({ error: 'Too many failed verification attempts' });
    }

    const contactRows = await app.db
      .select({ claimPinHash: contacts.claimPinHash })
      .from(contacts)
      .where(eq(contacts.id, claim.contactId));
    const pinHash = contactRows[0]?.claimPinHash ?? null;

    if (pinHash) {
      const { pin } = (req.body ?? {}) as { pin?: string };
      if (!pin) {
        pinFailureCount.set(claim.id, failures + 1);
        return reply.status(400).send({ error: 'PIN required' });
      }

      const submitted = createHash('sha256').update(pin).digest('hex');
      if (submitted !== pinHash) {
        const newCount = failures + 1;
        pinFailureCount.set(claim.id, newCount);
        if (newCount >= MAX_PIN_FAILURES) {
          return reply.status(429).send({ error: 'Too many failed verification attempts' });
        }
        return reply.status(403).send({ error: 'Invalid PIN' });
      }

      pinFailureCount.delete(claim.id);
    }

    const now = new Date();
    await updateClaimStatus(app.db, claim.id, {
      status: 'verified',
      verifiedAt: claim.verifiedAt ?? now,
    });

    await writeAuditEvent(app.db, {
      switchId: claim.switchId,
      eventType: 'claim_verified',
      actorType: 'contact',
      metadata: { claimId: claim.id, releaseRunId: claim.releaseRunId },
    });

    return reply.send({ ok: true });
  });

  // POST /api/claim/:token/accept — contact accepts responsibility
  app.post('/api/claim/:token/accept', async (req, reply) => {
    const { token } = req.params as { token: string };
    const claim = await lookupActiveClaim(app, token, reply);
    if (!claim) return;

    if (!claim.verifiedAt) {
      return reply.status(400).send({ error: 'Identity must be verified before accepting' });
    }

    const now = new Date();
    await updateClaimStatus(app.db, claim.id, {
      status: 'accepted',
      acceptedAt: claim.acceptedAt ?? now,
    });

    await writeAuditEvent(app.db, {
      switchId: claim.switchId,
      eventType: 'claim_accepted',
      actorType: 'contact',
      metadata: { claimId: claim.id, releaseRunId: claim.releaseRunId },
    });

    return reply.send({ ok: true });
  });

  // GET /api/claim/:token/packet — download encrypted packet
  app.get('/api/claim/:token/packet', async (req, reply) => {
    const { token } = req.params as { token: string };
    const claim = await lookupActiveClaim(app, token, reply);
    if (!claim) return;

    if (!ACCEPTED_OR_LATER.has(claim.status)) {
      return reply.status(403).send({ error: 'Packet not yet accessible — accept claim first' });
    }

    const run = await getReleaseRunById(app.db, claim.releaseRunId);
    if (!run || (run.status !== 'active' && run.status !== 'cascade_active')) {
      return reply.status(403).send({ error: 'Release run is not active' });
    }

    const packet = await getPacketById(app.db, claim.packetId);
    if (!packet?.localCiphertextPath || !existsSync(packet.localCiphertextPath)) {
      return reply.status(404).send({ error: 'Packet file not found' });
    }

    const fileData = readFileSync(packet.localCiphertextPath);

    await updateClaimStatus(app.db, claim.id, {
      status: 'packet_downloaded',
      packetDownloadedAt: claim.packetDownloadedAt ?? new Date(),
    });

    await writeAuditEvent(app.db, {
      switchId: claim.switchId,
      eventType: 'claim_packet_downloaded',
      actorType: 'contact',
      metadata: { claimId: claim.id, releaseRunId: claim.releaseRunId, packetId: claim.packetId },
    });

    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="aegis-packet-${claim.packetId}.bin"`)
      .send(fileData);
  });

  // POST /api/claim/:token/key-view — retrieve release key (local release only)
  app.post('/api/claim/:token/key-view', async (req, reply) => {
    const { token } = req.params as { token: string };
    const claim = await lookupActiveClaim(app, token, reply);
    if (!claim) return;

    if (!claim.packetDownloadedAt) {
      return reply.status(403).send({ error: 'Packet must be downloaded before viewing key' });
    }

    const packet = await getPacketById(app.db, claim.packetId);
    if (!packet) {
      return reply.status(404).send({ error: 'Packet not found' });
    }

    const encryptedKeyMaterial = await loadPacketKey(app.db, packet.keyId);
    if (!encryptedKeyMaterial) {
      return reply.status(404).send({ error: 'Release key not found' });
    }

    const keyBase64 = decryptField(encryptedKeyMaterial, app.config.fieldEncryptionKey);
    if (!keyBase64) {
      return reply.status(500).send({ error: 'Key decryption failed' });
    }

    const now = new Date();
    await updateClaimStatus(app.db, claim.id, {
      status: 'key_viewed',
      keyViewedAt: claim.keyViewedAt ?? now,
    });

    // Audit event MUST NOT include key material
    await writeAuditEvent(app.db, {
      switchId: claim.switchId,
      eventType: 'claim_key_viewed',
      actorType: 'contact',
      metadata: { claimId: claim.id, releaseRunId: claim.releaseRunId, packetId: claim.packetId },
    });

    return reply.send({
      keyBase64,
      algorithm: 'aes-256-gcm',
      warning: 'This key is shown once. Store securely. Use with the downloaded packet file.',
    });
  });

  // POST /api/claim/:token/acknowledge — contact confirms receipt
  app.post('/api/claim/:token/acknowledge', async (req, reply) => {
    const { token } = req.params as { token: string };
    const claim = await lookupActiveClaim(app, token, reply);
    if (!claim) return;

    if (!claim.keyViewedAt) {
      return reply.status(400).send({ error: 'Key must be viewed before acknowledging receipt' });
    }

    const now = new Date();
    await updateClaimStatus(app.db, claim.id, {
      status: 'acknowledged',
      acknowledgedAt: now,
    });

    await completeReleaseRun(app.db, claim.releaseRunId);
    await markSwitchStatus(app.db, claim.switchId, 'completed');

    await writeAuditEvent(app.db, {
      switchId: claim.switchId,
      eventType: 'claim_acknowledged',
      actorType: 'contact',
      metadata: { claimId: claim.id, releaseRunId: claim.releaseRunId },
    });

    return reply.send({ ok: true, message: 'Receipt acknowledged. Release run completed.' });
  });
}
