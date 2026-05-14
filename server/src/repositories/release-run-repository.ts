import { eq, isNull, or } from 'drizzle-orm';
import { releaseRuns } from '../db/schema.js';
import type { AegisDb } from '../db/index.js';

export interface ReleaseRunRecord {
  id: number;
  triggeringSwitchId: number;
  status: string;
  activePacketId: number | null;
  currentContactClaimId: number | null;
  suppressedSwitchIds: number[];
  metadata: Record<string, unknown>;
  startedAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function parseJson<T>(val: string | null | undefined, fallback: T): T {
  try {
    return val ? (JSON.parse(val) as T) : fallback;
  } catch {
    return fallback;
  }
}

function rowToRecord(row: typeof releaseRuns.$inferSelect): ReleaseRunRecord {
  return {
    id: row.id,
    triggeringSwitchId: row.triggeringSwitchId,
    status: row.status,
    activePacketId: row.activePacketId ?? null,
    currentContactClaimId: row.currentContactClaimId ?? null,
    suppressedSwitchIds: parseJson<number[]>(row.suppressedSwitchIds, []),
    metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? null,
    cancelledAt: row.cancelledAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getReleaseRunById(db: AegisDb, id: number): Promise<ReleaseRunRecord | null> {
  const rows = await db.select().from(releaseRuns).where(eq(releaseRuns.id, id));
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function getActiveReleaseRunFull(db: AegisDb): Promise<ReleaseRunRecord | null> {
  const rows = await db
    .select()
    .from(releaseRuns)
    .where(
      or(
        eq(releaseRuns.status, 'active'),
        eq(releaseRuns.status, 'cascade_active'),
      ),
    )
    .limit(1);
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function createReleaseRunFull(
  db: AegisDb,
  triggeringSwitchId: number,
): Promise<ReleaseRunRecord> {
  const rows = await db
    .insert(releaseRuns)
    .values({ triggeringSwitchId })
    .returning();
  return rowToRecord(rows[0]);
}

export async function addSuppressedSwitchId(
  db: AegisDb,
  runId: number,
  switchId: number,
): Promise<void> {
  const run = await getReleaseRunById(db, runId);
  if (!run) return;
  const ids = [...new Set([...run.suppressedSwitchIds, switchId])];
  await db
    .update(releaseRuns)
    .set({
      suppressedSwitchIds: JSON.stringify(ids),
      updatedAt: new Date(),
    })
    .where(eq(releaseRuns.id, runId));
}

export async function setActivePacket(
  db: AegisDb,
  runId: number,
  packetId: number,
): Promise<void> {
  await db
    .update(releaseRuns)
    .set({ activePacketId: packetId, updatedAt: new Date() })
    .where(eq(releaseRuns.id, runId));
}

export async function setCurrentContactClaim(
  db: AegisDb,
  runId: number,
  claimId: number | null,
): Promise<void> {
  await db
    .update(releaseRuns)
    .set({ currentContactClaimId: claimId, updatedAt: new Date() })
    .where(eq(releaseRuns.id, runId));
}

export async function completeReleaseRun(db: AegisDb, runId: number): Promise<void> {
  await db
    .update(releaseRuns)
    .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
    .where(eq(releaseRuns.id, runId));
}

export async function cancelReleaseRun(db: AegisDb, runId: number): Promise<void> {
  await db
    .update(releaseRuns)
    .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(releaseRuns.id, runId));
}

export async function activateRunCascade(
  db: AegisDb,
  runId: number,
  claimId: number,
): Promise<void> {
  await db
    .update(releaseRuns)
    .set({ status: 'cascade_active', currentContactClaimId: claimId, updatedAt: new Date() })
    .where(eq(releaseRuns.id, runId));
}

export async function failReleaseRun(db: AegisDb, runId: number): Promise<void> {
  await db
    .update(releaseRuns)
    .set({ status: 'failed', updatedAt: new Date() })
    .where(eq(releaseRuns.id, runId));
}
