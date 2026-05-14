import { desc, eq } from 'drizzle-orm';
import { auditEvents } from '../db/schema.js';
import type { AegisDb } from '../db/index.js';
import type { AuditEvent } from '../../../packages/shared/src/types.js';

export interface AuditInput {
  switchId?: number | null;
  eventType: string;
  actorType: 'owner' | 'system' | 'contact' | 'relay';
  actorId?: string | null;
  metadata?: Record<string, unknown> | null;
}

const PII_KEY_PATTERNS = [
  'email', 'phone', 'name', 'institution', 'account',
  'password', 'secret', 'token', 'apikey', 'keymaterial',
  'plaintext', 'executornotes',
];

function assertNoPhiKeys(metadata: Record<string, unknown>): void {
  for (const key of Object.keys(metadata)) {
    const lower = key.toLowerCase();
    if (PII_KEY_PATTERNS.some(p => lower.includes(p))) {
      throw new Error(`Audit metadata contains PII-like key: "${key}"`);
    }
  }
}

export async function writeAuditEvent(db: AegisDb, input: AuditInput): Promise<void> {
  if (input.metadata) {
    assertNoPhiKeys(input.metadata);
  }

  await db.insert(auditEvents).values({
    switchId: input.switchId ?? null,
    eventType: input.eventType,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  });
}

export async function getAuditEvents(
  db: AegisDb,
  options?: { switchId?: number; limit?: number },
): Promise<AuditEvent[]> {
  const query = db
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt));

  let rows;
  if (options?.switchId !== undefined) {
    rows = await query.where(eq(auditEvents.switchId, options.switchId));
  } else {
    rows = await query;
  }

  if (options?.limit !== undefined) {
    rows = rows.slice(0, options.limit);
  }

  return rows.map(row => ({
    id: row.id,
    switchId: row.switchId ?? null,
    eventType: row.eventType as AuditEvent['eventType'],
    actorType: row.actorType as AuditEvent['actorType'],
    actorId: row.actorId ?? null,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  }));
}
