import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, asc } from 'drizzle-orm';
import { contacts } from '../db/schema.js';
import { encryptField, decryptField } from '../services/field-encrypt.js';

const createSchema = z.object({
  fullName: z.string().min(1).max(300),
  relationship: z.string().max(200).nullable().optional(),
  priorityOrder: z.number().int().min(1),
  email: z.string().email(),
  phone: z.string().max(50).nullable().optional(),
  telegramHandle: z.string().max(200).nullable().optional(),
  preferredChannels: z.array(z.enum(['email', 'sms', 'telegram'])).optional().default(['email']),
  confirmationWindowHours: z.number().int().min(1).max(720).optional().default(48),
  backupNotes: z.string().max(5000).nullable().optional(),
});

const updateSchema = createSchema.partial();

const reorderSchema = z.object({
  order: z.array(z.number().int()),
});

function decryptContact(c: typeof contacts.$inferSelect, key: string) {
  return {
    id: c.id,
    fullName: decryptField(c.fullNameEncrypted, key)!,
    relationship: decryptField(c.relationshipEncrypted, key),
    priorityOrder: c.priorityOrder,
    email: decryptField(c.emailEncrypted, key)!,
    phone: decryptField(c.phoneEncrypted, key),
    telegramHandle: decryptField(c.telegramHandleEncrypted, key),
    preferredChannels: JSON.parse(c.preferredChannels),
    confirmationWindowHours: c.confirmationWindowHours,
    backupNotes: decryptField(c.backupNotesEncrypted, key),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export async function contactRoutes(app: FastifyInstance) {
  const key = app.config.fieldEncryptionKey;

  app.get('/api/contacts', {
    preHandler: [app.requireAuth],
  }, async (_req, reply) => {
    const rows = await app.db.select().from(contacts)
      .orderBy(asc(contacts.priorityOrder));
    return reply.send(rows.map(c => decryptContact(c, key)));
  });

  app.get('/api/contacts/:id', {
    preHandler: [app.requireAuth],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [contact] = await app.db.select().from(contacts)
      .where(eq(contacts.id, parseInt(id)));
    if (!contact) return reply.status(404).send({ error: 'Not found' });
    return reply.send(decryptContact(contact, key));
  });

  app.post('/api/contacts', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const body = createSchema.parse(req.body);
    const now = new Date();

    const [created] = await app.db.insert(contacts).values({
      fullNameEncrypted: encryptField(body.fullName, key)!,
      relationshipEncrypted: encryptField(body.relationship ?? null, key),
      priorityOrder: body.priorityOrder,
      emailEncrypted: encryptField(body.email, key)!,
      phoneEncrypted: encryptField(body.phone ?? null, key),
      telegramHandleEncrypted: encryptField(body.telegramHandle ?? null, key),
      preferredChannels: JSON.stringify(body.preferredChannels),
      confirmationWindowHours: body.confirmationWindowHours,
      backupNotesEncrypted: encryptField(body.backupNotes ?? null, key),
      createdAt: now,
      updatedAt: now,
    }).returning();

    return reply.status(201).send(decryptContact(created, key));
  });

  app.put('/api/contacts/:id', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateSchema.parse(req.body);
    const now = new Date();

    const updates: Record<string, unknown> = { updatedAt: now };
    if (body.fullName !== undefined) updates.fullNameEncrypted = encryptField(body.fullName, key);
    if (body.relationship !== undefined) updates.relationshipEncrypted = encryptField(body.relationship ?? null, key);
    if (body.priorityOrder !== undefined) updates.priorityOrder = body.priorityOrder;
    if (body.email !== undefined) updates.emailEncrypted = encryptField(body.email, key);
    if (body.phone !== undefined) updates.phoneEncrypted = encryptField(body.phone ?? null, key);
    if (body.telegramHandle !== undefined) updates.telegramHandleEncrypted = encryptField(body.telegramHandle ?? null, key);
    if (body.preferredChannels !== undefined) updates.preferredChannels = JSON.stringify(body.preferredChannels);
    if (body.confirmationWindowHours !== undefined) updates.confirmationWindowHours = body.confirmationWindowHours;
    if (body.backupNotes !== undefined) updates.backupNotesEncrypted = encryptField(body.backupNotes ?? null, key);

    const [updated] = await app.db.update(contacts)
      .set(updates)
      .where(eq(contacts.id, parseInt(id)))
      .returning();

    if (!updated) return reply.status(404).send({ error: 'Not found' });
    return reply.send(decryptContact(updated, key));
  });

  app.put('/api/contacts/reorder', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const body = reorderSchema.parse(req.body);

    for (let i = 0; i < body.order.length; i++) {
      await app.db.update(contacts)
        .set({ priorityOrder: i + 1, updatedAt: new Date() })
        .where(eq(contacts.id, body.order[i]));
    }

    const rows = await app.db.select().from(contacts)
      .orderBy(asc(contacts.priorityOrder));
    return reply.send(rows.map(c => decryptContact(c, key)));
  });

  app.delete('/api/contacts/:id', {
    preHandler: [app.requireAuth, app.requireCsrf],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = await app.db.delete(contacts)
      .where(eq(contacts.id, parseInt(id)))
      .returning();
    if (deleted.length === 0) return reply.status(404).send({ error: 'Not found' });
    return reply.status(204).send();
  });
}
