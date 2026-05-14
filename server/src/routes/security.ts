import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { owner } from '../db/schema.js';
import { writeAuditEvent } from '../services/audit.js';
import { verifyPassword } from '../auth/password.js';

const ConfirmTotpSchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/),
});

const DisableTotpSchema = z.object({
  password: z.string().min(1),
  code: z.string().length(6).regex(/^\d{6}$/),
});

export async function securityRoutes(app: FastifyInstance) {
  // POST /api/security/totp/start — generate pending TOTP secret, return to client for QR
  app.post('/api/security/totp/start', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const db = app.db;
    const { generateTotpSecret, encryptTotpSecret, totpOtpauthUrl } = await import('../auth/totp.js');

    const [ownerRow] = await db.select({ email: owner.email }).from(owner).where(eq(owner.id, req.ownerId!));
    if (!ownerRow) return reply.status(401).send({ error: 'Not found' });

    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret, app.config.fieldEncryptionKey);

    // Store as pending (not yet enabled) — overwrite any existing pending secret
    await db.update(owner)
      .set({ totpSecretEncrypted: encrypted, totpEnabled: false, updatedAt: new Date() })
      .where(eq(owner.id, req.ownerId!));

    await writeAuditEvent(db, {
      eventType: 'totp_setup_started',
      actorType: 'owner',
      actorId: String(req.ownerId),
      metadata: {},
    });

    return reply.send({
      secret,
      otpauthUrl: totpOtpauthUrl(secret, ownerRow.email),
    });
  });

  // POST /api/security/totp/confirm — verify code and enable TOTP
  app.post('/api/security/totp/confirm', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const parseResult = ConfirmTotpSchema.safeParse(req.body);
    if (!parseResult.success) return reply.status(400).send({ error: 'Invalid code format' });

    const db = app.db;
    const [ownerRow] = await db
      .select({ totpSecretEncrypted: owner.totpSecretEncrypted, totpEnabled: owner.totpEnabled })
      .from(owner)
      .where(eq(owner.id, req.ownerId!));

    if (!ownerRow?.totpSecretEncrypted) {
      return reply.status(400).send({ error: 'TOTP setup not started' });
    }

    const { verifyTotpCode } = await import('../auth/totp.js');
    const valid = verifyTotpCode(
      parseResult.data.code,
      ownerRow.totpSecretEncrypted,
      app.config.fieldEncryptionKey,
    );

    if (!valid) return reply.status(400).send({ error: 'Invalid TOTP code' });

    await db.update(owner)
      .set({ totpEnabled: true, updatedAt: new Date() })
      .where(eq(owner.id, req.ownerId!));

    await writeAuditEvent(db, {
      eventType: 'totp_enabled',
      actorType: 'owner',
      actorId: String(req.ownerId),
      metadata: {},
    });

    return reply.send({ totpEnabled: true });
  });

  // POST /api/security/totp/disable — requires password + valid TOTP code
  app.post('/api/security/totp/disable', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const parseResult = DisableTotpSchema.safeParse(req.body);
    if (!parseResult.success) return reply.status(400).send({ error: 'Password and 6-digit code required' });

    const db = app.db;
    const [ownerRow] = await db
      .select({
        passwordHash: owner.passwordHash,
        totpSecretEncrypted: owner.totpSecretEncrypted,
        totpEnabled: owner.totpEnabled,
      })
      .from(owner)
      .where(eq(owner.id, req.ownerId!));

    if (!ownerRow) return reply.status(401).send({ error: 'Not found' });

    const passwordValid = await verifyPassword(parseResult.data.password, ownerRow.passwordHash);
    if (!passwordValid) return reply.status(401).send({ error: 'Invalid password' });

    if (ownerRow.totpEnabled && ownerRow.totpSecretEncrypted) {
      const { verifyTotpCode } = await import('../auth/totp.js');
      const codeValid = verifyTotpCode(
        parseResult.data.code,
        ownerRow.totpSecretEncrypted,
        app.config.fieldEncryptionKey,
      );
      if (!codeValid) return reply.status(400).send({ error: 'Invalid TOTP code' });
    }

    await db.update(owner)
      .set({ totpEnabled: false, totpSecretEncrypted: null, updatedAt: new Date() })
      .where(eq(owner.id, req.ownerId!));

    await writeAuditEvent(db, {
      eventType: 'totp_disabled',
      actorType: 'owner',
      actorId: String(req.ownerId),
      metadata: {},
    });

    return reply.send({ totpEnabled: false });
  });
}
