import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { auditEvents } from '../db/schema.js';

const PII_REDACT_KEYS = new Set([
  'email', 'phone', 'name', 'institution', 'account',
  'password', 'secret', 'token', 'apikey', 'keymaterial',
  'plaintext', 'executornotes',
]);

function redactMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const lower = k.toLowerCase();
      if (PII_REDACT_KEYS.has(lower) || Array.from(PII_REDACT_KEYS).some((p) => lower.includes(p))) {
        out[k] = '[redacted]';
      } else {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return null;
  }
}

export async function auditRoutes(app: FastifyInstance) {
  // GET /api/audit-log
  app.get('/api/audit-log', {
    preHandler: [app.requireAuth],
  }, async (req, reply) => {
    const { switchId, limit } = req.query as { switchId?: string; limit?: string };
    const limitN = limit ? Math.min(parseInt(limit, 10), 500) : 100;

    let query = app.db
      .select()
      .from(auditEvents)
      .orderBy(desc(auditEvents.createdAt));

    let rows;
    if (switchId) {
      rows = await query.where(eq(auditEvents.switchId, parseInt(switchId, 10)));
    } else {
      rows = await query;
    }

    const events = rows.slice(0, limitN).map((r) => ({
      id: r.id,
      switchId: r.switchId ?? null,
      eventType: r.eventType,
      actorType: r.actorType,
      actorId: r.actorId ?? null,
      metadata: redactMetadata(r.metadata),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));

    return reply.send({ events, total: events.length });
  });

  // GET /api/audit-log/export — redacted JSON export
  app.get('/api/audit-log/export', {
    preHandler: [app.requireAuth],
  }, async (_req, reply) => {
    const rows = await app.db
      .select()
      .from(auditEvents)
      .orderBy(desc(auditEvents.createdAt));

    const events = rows.map((r) => ({
      id: r.id,
      switchId: r.switchId ?? null,
      eventType: r.eventType,
      actorType: r.actorType,
      actorId: r.actorId ?? null,
      metadata: redactMetadata(r.metadata),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));

    return reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', 'attachment; filename="aegis-audit-log.json"')
      .send(JSON.stringify({ exportedAt: new Date().toISOString(), events }, null, 2));
  });
}
