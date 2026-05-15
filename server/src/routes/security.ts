import type { FastifyInstance } from 'fastify';
import { eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { owner, sessions } from '../db/schema.js';
import { writeAuditEvent } from '../services/audit.js';
import { verifyPassword, hashPassword } from '../auth/password.js';
import { createSession } from '../auth/session.js';

const ConfirmTotpSchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/),
});

const DisableTotpSchema = z.object({
  password: z.string().min(1),
  code: z.string().length(6).regex(/^\d{6}$/),
});

const PasswordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12),
});

const UseRecoveryCodeSchema = z.object({
  code: z.string().min(1),
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
      .set({ totpEnabled: false, totpSecretEncrypted: null, totpRecoveryCodesEncrypted: null, updatedAt: new Date() })
      .where(eq(owner.id, req.ownerId!));

    await writeAuditEvent(db, {
      eventType: 'totp_disabled',
      actorType: 'owner',
      actorId: String(req.ownerId),
      metadata: {},
    });

    return reply.send({ totpEnabled: false });
  });

  // POST /api/security/totp/recovery/generate — generate 8 recovery codes (TOTP must be enabled)
  app.post('/api/security/totp/recovery/generate', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const db = app.db;
    const [ownerRow] = await db
      .select({ totpEnabled: owner.totpEnabled })
      .from(owner)
      .where(eq(owner.id, req.ownerId!));

    if (!ownerRow?.totpEnabled) {
      return reply.status(400).send({ error: 'TOTP must be enabled before generating recovery codes' });
    }

    const { generateRecoveryCodes, encryptRecoveryCodes } = await import('../auth/totp.js');
    const codes = generateRecoveryCodes();
    const encrypted = encryptRecoveryCodes(codes, app.config.fieldEncryptionKey);

    await db.update(owner)
      .set({ totpRecoveryCodesEncrypted: encrypted, updatedAt: new Date() })
      .where(eq(owner.id, req.ownerId!));

    await writeAuditEvent(db, {
      eventType: 'totp_recovery_codes_generated',
      actorType: 'owner',
      actorId: String(req.ownerId),
      metadata: {},
    });

    return reply.send({ codes });
  });

  // POST /api/security/totp/recovery/regenerate — invalidate old codes and generate new ones
  app.post('/api/security/totp/recovery/regenerate', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const db = app.db;
    const [ownerRow] = await db
      .select({ totpEnabled: owner.totpEnabled })
      .from(owner)
      .where(eq(owner.id, req.ownerId!));

    if (!ownerRow?.totpEnabled) {
      return reply.status(400).send({ error: 'TOTP must be enabled before regenerating recovery codes' });
    }

    const { generateRecoveryCodes, encryptRecoveryCodes } = await import('../auth/totp.js');
    const codes = generateRecoveryCodes();
    const encrypted = encryptRecoveryCodes(codes, app.config.fieldEncryptionKey);

    await db.update(owner)
      .set({ totpRecoveryCodesEncrypted: encrypted, updatedAt: new Date() })
      .where(eq(owner.id, req.ownerId!));

    await writeAuditEvent(db, {
      eventType: 'totp_recovery_codes_regenerated',
      actorType: 'owner',
      actorId: String(req.ownerId),
      metadata: {},
    });

    return reply.send({ codes });
  });

  // POST /api/security/totp/recovery/use — recover access using a recovery code (no auth required)
  app.post('/api/security/totp/recovery/use', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const parseResult = UseRecoveryCodeSchema.safeParse(req.body);
    if (!parseResult.success) return reply.status(400).send({ error: 'Recovery code required' });

    const db = app.db;
    const [ownerRow] = await db
      .select({
        id: owner.id,
        totpEnabled: owner.totpEnabled,
        totpRecoveryCodesEncrypted: owner.totpRecoveryCodesEncrypted,
      })
      .from(owner)
      .limit(1);

    if (!ownerRow) return reply.status(404).send({ error: 'Not found' });
    if (!ownerRow.totpRecoveryCodesEncrypted) {
      return reply.status(401).send({ error: 'No recovery codes configured' });
    }

    const { useRecoveryCode, encryptRecoveryCodes } = await import('../auth/totp.js');
    const remaining = useRecoveryCode(
      parseResult.data.code,
      ownerRow.totpRecoveryCodesEncrypted,
      app.config.fieldEncryptionKey,
    );

    if (remaining === null) {
      return reply.status(401).send({ error: 'Invalid recovery code' });
    }

    // Remove used code; clear if no codes remain
    const newEncrypted = remaining.length > 0
      ? encryptRecoveryCodes(remaining, app.config.fieldEncryptionKey)
      : null;

    await db.update(owner)
      .set({ totpRecoveryCodesEncrypted: newEncrypted, updatedAt: new Date() })
      .where(eq(owner.id, ownerRow.id));

    await writeAuditEvent(db, {
      eventType: 'totp_recovery_code_used',
      actorType: 'owner',
      actorId: String(ownerRow.id),
      metadata: { codesRemaining: remaining.length },
    });

    // Create a session (log them in)
    const sessionId = createSession(db, ownerRow.id);
    reply.setCookie('aegis_session', sessionId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 86400,
    });

    return reply.send({ ok: true });
  });

  // POST /api/security/password — change password
  app.post('/api/security/password', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const parseResult = PasswordChangeSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Validation failed', issues: parseResult.error.issues });
    }

    const db = app.db;
    const [ownerRow] = await db
      .select({ id: owner.id, passwordHash: owner.passwordHash })
      .from(owner)
      .where(eq(owner.id, req.ownerId!));

    if (!ownerRow) return reply.status(401).send({ error: 'Not found' });

    const currentValid = await verifyPassword(parseResult.data.currentPassword, ownerRow.passwordHash);
    if (!currentValid) {
      return reply.status(401).send({ error: 'Current password is incorrect' });
    }

    const newHash = await hashPassword(parseResult.data.newPassword);
    await db.update(owner)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(owner.id, ownerRow.id));

    // Invalidate all sessions except current
    const currentSessionId = req.cookies?.aegis_session;
    if (currentSessionId) {
      await db.delete(sessions)
        .where(
          eq(sessions.ownerId, ownerRow.id),
        );
      // Re-create the current session so user stays logged in
      // (we deleted it above, so create fresh one)
      const newSessionId = createSession(db, ownerRow.id);
      reply.setCookie('aegis_session', newSessionId, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 86400,
      });
    }

    await writeAuditEvent(db, {
      eventType: 'password_changed',
      actorType: 'owner',
      actorId: String(ownerRow.id),
      metadata: {},
    });

    return reply.send({ ok: true });
  });
}
