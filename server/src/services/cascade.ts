import { asc, eq } from 'drizzle-orm';
import { contacts } from '../db/schema.js';
import type { AegisDb } from '../db/index.js';
import { decryptField } from './field-encrypt.js';
import { writeAuditEvent } from './audit.js';
import { dispatchNotification } from './notifications.js';
import { renderTemplate } from './notification-templates.js';
import {
  getActiveReleaseRunFull,
  getReleaseRunById,
  setCurrentContactClaim,
  activateRunCascade,
  failReleaseRun,
} from '../repositories/release-run-repository.js';
import {
  createContactClaim,
  updateClaimStatus,
  getActiveClaimForRun,
  listClaimsForRun,
  type ContactClaimRecord,
} from '../repositories/contact-claim-repository.js';
import { getSwitchById, markSwitchStatus } from './switch-repository.js';

export interface CascadeConfig {
  appUrl: string;
  fieldEncryptionKey: string;
}

export interface StartCascadeResult {
  started: boolean;
  alreadyRunning: boolean;
  claimId?: number;
  reason?: string;
}

export interface EscalateResult {
  escalated: boolean;
  failed: boolean;
  newClaimId?: number;
  reason?: string;
}

type ContactRow = typeof contacts.$inferSelect;

async function getContactsByIds(db: AegisDb, ids: number[]): Promise<ContactRow[]> {
  if (ids.length === 0) return [];
  const rows = await db.select().from(contacts).orderBy(asc(contacts.priorityOrder));
  return rows.filter((r) => ids.includes(r.id));
}

async function notifyContact(
  db: AegisDb,
  config: CascadeConfig,
  contact: ContactRow,
  claimUrl: string,
  switchId: number,
): Promise<void> {
  const channels: string[] = JSON.parse(contact.preferredChannels || '["email"]');
  const { subject, body } = renderTemplate('contact_claim_notification', { claimUrl });

  for (const channel of channels) {
    if (channel === 'email') {
      const email = decryptField(contact.emailEncrypted, config.fieldEncryptionKey);
      if (email) {
        await dispatchNotification(db, {
          switchId,
          contactId: contact.id,
          channel: 'email',
          purpose: 'claim',
          to: email,
          subject,
          body,
        });
      }
    } else if (channel === 'telegram') {
      const handle = decryptField(contact.telegramHandleEncrypted, config.fieldEncryptionKey);
      if (handle) {
        await dispatchNotification(db, {
          switchId,
          contactId: contact.id,
          channel: 'telegram',
          purpose: 'claim',
          to: handle,
          body,
        });
      }
    }
  }
}

export async function startCascade(
  db: AegisDb,
  config: CascadeConfig,
  runId: number,
): Promise<StartCascadeResult> {
  const run = await getReleaseRunById(db, runId);
  if (!run) throw new Error(`Release run ${runId} not found`);

  if (run.currentContactClaimId != null) {
    return { started: false, alreadyRunning: true };
  }

  if (!run.activePacketId) {
    return { started: false, alreadyRunning: false, reason: 'no active packet' };
  }

  const sw = await getSwitchById(db, run.triggeringSwitchId);
  if (!sw) throw new Error(`Switch ${run.triggeringSwitchId} not found`);

  const orderedContacts = await getContactsByIds(db, sw.selectedContactIds);
  if (orderedContacts.length === 0) {
    await failReleaseRun(db, runId);
    await markSwitchStatus(db, sw.id, 'failed');
    await writeAuditEvent(db, {
      switchId: sw.id,
      eventType: 'cascade_failed_no_contacts',
      actorType: 'system',
      metadata: { releaseRunId: runId },
    });
    return { started: false, alreadyRunning: false, reason: 'no contacts configured' };
  }

  const firstContact = orderedContacts[0];
  const now = new Date();
  const expiresAt = new Date(now.getTime() + firstContact.confirmationWindowHours * 3600000);

  const { record: claim, rawToken } = await createContactClaim(db, {
    releaseRunId: runId,
    switchId: sw.id,
    packetId: run.activePacketId,
    contactId: firstContact.id,
    expiresAt,
  });

  const claimUrl = `${config.appUrl}/claim/${rawToken}`;

  await notifyContact(db, config, firstContact, claimUrl, sw.id);

  await updateClaimStatus(db, claim.id, { status: 'notified', notifiedAt: now });

  await activateRunCascade(db, runId, claim.id);

  await writeAuditEvent(db, {
    switchId: sw.id,
    eventType: 'cascade_started',
    actorType: 'system',
    metadata: { releaseRunId: runId, claimId: claim.id, contactId: firstContact.id },
  });

  return { started: true, alreadyRunning: false, claimId: claim.id };
}

export async function checkAndEscalate(
  db: AegisDb,
  config: CascadeConfig,
  runId: number,
  now: Date = new Date(),
): Promise<EscalateResult> {
  const run = await getReleaseRunById(db, runId);
  if (!run) throw new Error(`Release run ${runId} not found`);

  const activeClaim = await getActiveClaimForRun(db, runId);
  if (!activeClaim) {
    return { escalated: false, failed: false, reason: 'no active claim' };
  }

  if (!activeClaim.notifiedAt) {
    return { escalated: false, failed: false, reason: 'claim not yet notified' };
  }

  const contactRow = await db.select().from(contacts).where(eq(contacts.id, activeClaim.contactId));
  const contact = contactRow[0];
  if (!contact) throw new Error(`Contact ${activeClaim.contactId} not found`);

  const deadline = new Date(
    activeClaim.notifiedAt.getTime() + contact.confirmationWindowHours * 3600000,
  );

  if (now < deadline) {
    return { escalated: false, failed: false };
  }

  // Timeout exceeded — escalate
  await updateClaimStatus(db, activeClaim.id, { status: 'escalated', escalatedAt: now });

  const sw = await getSwitchById(db, run.triggeringSwitchId);
  if (!sw) throw new Error(`Switch ${run.triggeringSwitchId} not found`);

  const allClaims = await listClaimsForRun(db, runId);
  const triedContactIds = new Set(allClaims.map((c) => c.contactId));

  const orderedContacts = await getContactsByIds(db, sw.selectedContactIds);
  const nextContact = orderedContacts.find((c) => !triedContactIds.has(c.id));

  if (!nextContact) {
    await failReleaseRun(db, runId);
    await markSwitchStatus(db, sw.id, 'failed');
    await writeAuditEvent(db, {
      switchId: sw.id,
      eventType: 'cascade_failed_all_contacts_exhausted',
      actorType: 'system',
      metadata: { releaseRunId: runId },
    });
    return { escalated: false, failed: true };
  }

  const newExpiresAt = new Date(now.getTime() + nextContact.confirmationWindowHours * 3600000);

  const { record: newClaim, rawToken } = await createContactClaim(db, {
    releaseRunId: runId,
    switchId: sw.id,
    packetId: activeClaim.packetId,
    contactId: nextContact.id,
    expiresAt: newExpiresAt,
  });

  const claimUrl = `${config.appUrl}/claim/${rawToken}`;

  await notifyContact(db, config, nextContact, claimUrl, sw.id);

  await updateClaimStatus(db, newClaim.id, { status: 'notified', notifiedAt: now });

  await setCurrentContactClaim(db, runId, newClaim.id);

  await writeAuditEvent(db, {
    switchId: sw.id,
    eventType: 'cascade_escalated',
    actorType: 'system',
    metadata: {
      releaseRunId: runId,
      previousClaimId: activeClaim.id,
      newClaimId: newClaim.id,
      newContactId: nextContact.id,
    },
  });

  return { escalated: true, failed: false, newClaimId: newClaim.id };
}
