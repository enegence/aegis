import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { count } from 'drizzle-orm';
import { estateItems, contacts, switches } from '../db/schema.js';
import {
  buildExportBundle,
  decryptExportBundle,
  gatherExportPayload,
  EXPORT_SCHEMA_VERSION,
} from '../services/export.js';
import { encryptField } from '../services/field-encrypt.js';

const exportSchema = z.object({
  passphrase: z.string().min(1),
  includeConfig: z.boolean().optional().default(false),
});

const previewRestoreSchema = z.object({
  bundle: z.record(z.unknown()),
  passphrase: z.string().min(1),
});

const restoreSchema = z.object({
  bundle: z.record(z.unknown()),
  passphrase: z.string().min(1),
  confirmed: z.boolean().optional(),
  overwrite: z.boolean().optional().default(false),
});

export async function exportRoutes(app: FastifyInstance) {
  // POST /api/export — create encrypted export bundle
  app.post('/api/export', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const parse = exportSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }

    const { passphrase, includeConfig } = parse.data;

    const payload = await gatherExportPayload(
      app.db,
      app.config.fieldEncryptionKey,
      includeConfig,
    );
    const bundle = await buildExportBundle(payload, passphrase);

    return reply.send(bundle);
  });

  // POST /api/export/preview-restore — decrypt and validate, return counts only
  app.post('/api/export/preview-restore', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const parse = previewRestoreSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }

    const { bundle, passphrase } = parse.data;

    // Validate schema version before attempting decryption
    if (bundle.schemaVersion !== EXPORT_SCHEMA_VERSION) {
      return reply.status(400).send({
        error: `Unsupported schema version: ${bundle.schemaVersion}. Expected: ${EXPORT_SCHEMA_VERSION}`,
      });
    }

    let payload;
    try {
      payload = await decryptExportBundle(bundle as Parameters<typeof decryptExportBundle>[0], passphrase);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Decryption failed';
      return reply.status(400).send({ error: message });
    }

    return reply.send({
      estateItems: payload.estateItems.length,
      contacts: payload.contacts.length,
      switches: payload.switches.length,
    });
  });

  // POST /api/export/restore — decrypt, validate, and write to DB
  app.post('/api/export/restore', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const parse = restoreSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation failed', issues: parse.error.issues });
    }

    const { bundle, passphrase, confirmed, overwrite } = parse.data;

    if (!confirmed) {
      return reply.status(400).send({
        error: 'Restore requires confirmed: true in the request body',
      });
    }

    // Validate schema version before attempting decryption
    if (bundle.schemaVersion !== EXPORT_SCHEMA_VERSION) {
      return reply.status(400).send({
        error: `Unsupported schema version: ${bundle.schemaVersion}. Expected: ${EXPORT_SCHEMA_VERSION}`,
      });
    }

    let payload;
    try {
      payload = await decryptExportBundle(bundle as Parameters<typeof decryptExportBundle>[0], passphrase);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Decryption failed';
      return reply.status(400).send({ error: message });
    }

    // Check for existing data
    const [estateCount] = await app.db.select({ total: count() }).from(estateItems);
    const [contactCount] = await app.db.select({ total: count() }).from(contacts);
    const hasData = estateCount.total > 0 || contactCount.total > 0;

    if (hasData && !overwrite) {
      return reply.status(409).send({
        error: 'Database already has data. Pass overwrite: true to replace existing records.',
      });
    }

    // If overwriting, delete existing data
    if (hasData && overwrite) {
      await app.db.delete(estateItems);
      await app.db.delete(contacts);
    }

    // Restore estate items
    const fieldKey = app.config.fieldEncryptionKey;
    let restoredEstateItems = 0;
    for (const item of payload.estateItems) {
      await app.db.insert(estateItems).values({
        category: item.category,
        title: item.title,
        institutionNameEncrypted: item.institutionName
          ? encryptField(item.institutionName, fieldKey)
          : null,
        accountTypeEncrypted: item.accountType
          ? encryptField(item.accountType, fieldKey)
          : null,
        referenceHintEncrypted: item.referenceHint
          ? encryptField(item.referenceHint, fieldKey)
          : null,
        assetDescriptionEncrypted: item.assetDescription
          ? encryptField(item.assetDescription, fieldKey)
          : null,
        locationNotesEncrypted: item.locationNotes
          ? encryptField(item.locationNotes, fieldKey)
          : null,
        executorNotesEncrypted: item.executorNotes
          ? encryptField(item.executorNotes, fieldKey)
          : null,
        sensitiveFlag: item.sensitiveFlag,
        sortOrder: item.sortOrder,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(),
      });
      restoredEstateItems++;
    }

    // Restore contacts
    let restoredContacts = 0;
    for (const c of payload.contacts) {
      await app.db.insert(contacts).values({
        fullNameEncrypted: encryptField(c.fullName, fieldKey),
        relationshipEncrypted: c.relationship
          ? encryptField(c.relationship, fieldKey)
          : null,
        priorityOrder: c.priorityOrder,
        emailEncrypted: encryptField(c.email, fieldKey),
        phoneEncrypted: c.phone
          ? encryptField(c.phone, fieldKey)
          : null,
        telegramHandleEncrypted: c.telegramHandle
          ? encryptField(c.telegramHandle, fieldKey)
          : null,
        preferredChannels: c.preferredChannels,
        confirmationWindowHours: c.confirmationWindowHours,
        backupNotesEncrypted: c.backupNotes
          ? encryptField(c.backupNotes, fieldKey)
          : null,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(),
      });
      restoredContacts++;
    }

    return reply.send({
      restored: {
        estateItems: restoredEstateItems,
        contacts: restoredContacts,
        switches: 0, // switches not restored (contain mode/config state)
      },
    });
  });
}
