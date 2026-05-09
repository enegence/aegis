import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, asc } from 'drizzle-orm';
import { estateItems } from '../db/schema.js';
import { encryptField, decryptField } from '../services/field-encrypt.js';

const createSchema = z.object({
  category: z.string().min(1),
  title: z.string().min(1).max(500),
  institutionName: z.string().max(500).nullable().optional(),
  accountType: z.string().max(200).nullable().optional(),
  referenceHint: z.string().max(200).nullable().optional(),
  assetDescription: z.string().max(5000).nullable().optional(),
  locationNotes: z.string().max(5000).nullable().optional(),
  executorNotes: z.string().max(5000).nullable().optional(),
  sensitiveFlag: z.boolean().optional().default(false),
  sortOrder: z.number().optional().default(0),
});

const updateSchema = createSchema.partial();

function decryptItem(item: typeof estateItems.$inferSelect, key: string) {
  return {
    id: item.id,
    category: item.category,
    title: item.title,
    institutionName: decryptField(item.institutionNameEncrypted, key),
    accountType: decryptField(item.accountTypeEncrypted, key),
    referenceHint: decryptField(item.referenceHintEncrypted, key),
    assetDescription: decryptField(item.assetDescriptionEncrypted, key),
    locationNotes: decryptField(item.locationNotesEncrypted, key),
    executorNotes: decryptField(item.executorNotesEncrypted, key),
    sensitiveFlag: item.sensitiveFlag,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function estateRoutes(app: FastifyInstance) {
  const key = app.config.fieldEncryptionKey;

  app.get('/api/estate-items', {
    preHandler: [app.requireAuth],
  }, async (_req, reply) => {
    const items = await app.db.select().from(estateItems)
      .orderBy(asc(estateItems.sortOrder), asc(estateItems.id));
    return reply.send(items.map(i => decryptItem(i, key)));
  });

  app.get('/api/estate-items/:id', {
    preHandler: [app.requireAuth],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [item] = await app.db.select().from(estateItems)
      .where(eq(estateItems.id, parseInt(id)));
    if (!item) return reply.status(404).send({ error: 'Not found' });
    return reply.send(decryptItem(item, key));
  });

  app.post('/api/estate-items', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const body = createSchema.parse(req.body);
    const now = new Date();

    const [created] = await app.db.insert(estateItems).values({
      category: body.category,
      title: body.title,
      institutionNameEncrypted: encryptField(body.institutionName ?? null, key),
      accountTypeEncrypted: encryptField(body.accountType ?? null, key),
      referenceHintEncrypted: encryptField(body.referenceHint ?? null, key),
      assetDescriptionEncrypted: encryptField(body.assetDescription ?? null, key),
      locationNotesEncrypted: encryptField(body.locationNotes ?? null, key),
      executorNotesEncrypted: encryptField(body.executorNotes ?? null, key),
      sensitiveFlag: body.sensitiveFlag,
      sortOrder: body.sortOrder,
      createdAt: now,
      updatedAt: now,
    }).returning();

    return reply.status(201).send(decryptItem(created, key));
  });

  app.put('/api/estate-items/:id', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateSchema.parse(req.body);
    const now = new Date();

    const updates: Record<string, unknown> = { updatedAt: now };
    if (body.category !== undefined) updates.category = body.category;
    if (body.title !== undefined) updates.title = body.title;
    if (body.institutionName !== undefined) updates.institutionNameEncrypted = encryptField(body.institutionName ?? null, key);
    if (body.accountType !== undefined) updates.accountTypeEncrypted = encryptField(body.accountType ?? null, key);
    if (body.referenceHint !== undefined) updates.referenceHintEncrypted = encryptField(body.referenceHint ?? null, key);
    if (body.assetDescription !== undefined) updates.assetDescriptionEncrypted = encryptField(body.assetDescription ?? null, key);
    if (body.locationNotes !== undefined) updates.locationNotesEncrypted = encryptField(body.locationNotes ?? null, key);
    if (body.executorNotes !== undefined) updates.executorNotesEncrypted = encryptField(body.executorNotes ?? null, key);
    if (body.sensitiveFlag !== undefined) updates.sensitiveFlag = body.sensitiveFlag;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

    const [updated] = await app.db.update(estateItems)
      .set(updates)
      .where(eq(estateItems.id, parseInt(id)))
      .returning();

    if (!updated) return reply.status(404).send({ error: 'Not found' });
    return reply.send(decryptItem(updated, key));
  });

  app.delete('/api/estate-items/:id', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = await app.db.delete(estateItems)
      .where(eq(estateItems.id, parseInt(id)))
      .returning();
    if (deleted.length === 0) return reply.status(404).send({ error: 'Not found' });
    return reply.status(204).send();
  });
}
