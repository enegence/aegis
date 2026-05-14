import { and, eq, isNull } from 'drizzle-orm';
import { switches, releaseRuns } from '../db/schema.js';
import type { AegisDb } from '../db/index.js';

export interface SwitchRecord {
  id: number;
  name: string;
  mode: string;
  deploymentMode: string;
  status: string;
  triggerAt: Date | null;
  heartbeatIntervalDays: number | null;
  nextCheckInDueAt: Date | null;
  warningStartsAt: Date | null;
  gracePeriodHours: number;
  warningWindowDays: number;
  lastCheckInAt: Date | null;
  lastPacketSyncAt: Date | null;
  lastReminderSentAt: Date | null;
  lastWarningSentAt: Date | null;
  lastEvaluatedAt: Date | null;
  selectedContactIds: number[];
  selectedEstateItemIds: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ReleaseRunRecord {
  id: number;
  triggeringSwitchId: number;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
}

export interface CreateSwitchData {
  name: string;
  mode: string;
  deploymentMode?: string;
  triggerAt?: Date | null;
  heartbeatIntervalDays?: number | null;
  gracePeriodHours?: number;
  warningWindowDays?: number;
  selectedContactIds?: number[];
  selectedEstateItemIds?: number[];
}

export interface UpdateSwitchData {
  name?: string;
  mode?: string;
  deploymentMode?: string;
  triggerAt?: Date | null;
  heartbeatIntervalDays?: number | null;
  gracePeriodHours?: number;
  warningWindowDays?: number;
  selectedContactIds?: number[];
  selectedEstateItemIds?: number[];
}

export interface MarkSwitchStatusPatch {
  lastCheckInAt?: Date | null;
  lastReminderSentAt?: Date | null;
  lastWarningSentAt?: Date | null;
  lastEvaluatedAt?: Date | null;
  nextCheckInDueAt?: Date | null;
  warningStartsAt?: Date | null;
}

function parseIds(val: string | null | undefined): number[] {
  if (!val) return [];
  try {
    return JSON.parse(val) as number[];
  } catch {
    return [];
  }
}

function rowToSwitchRecord(row: typeof switches.$inferSelect): SwitchRecord {
  return {
    id: row.id,
    name: row.name,
    mode: row.mode,
    deploymentMode: row.deploymentMode,
    status: row.status,
    triggerAt: row.triggerAt ?? null,
    heartbeatIntervalDays: row.heartbeatIntervalDays ?? null,
    nextCheckInDueAt: row.nextCheckInDueAt ?? null,
    warningStartsAt: row.warningStartsAt ?? null,
    gracePeriodHours: row.gracePeriodHours,
    warningWindowDays: row.warningWindowDays,
    lastCheckInAt: row.lastCheckInAt ?? null,
    lastPacketSyncAt: row.lastPacketSyncAt ?? null,
    lastReminderSentAt: row.lastReminderSentAt ?? null,
    lastWarningSentAt: row.lastWarningSentAt ?? null,
    lastEvaluatedAt: row.lastEvaluatedAt ?? null,
    selectedContactIds: parseIds(row.selectedContactIds),
    selectedEstateItemIds: parseIds(row.selectedEstateItemIds),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToReleaseRunRecord(row: typeof releaseRuns.$inferSelect): ReleaseRunRecord {
  return {
    id: row.id,
    triggeringSwitchId: row.triggeringSwitchId,
    status: row.status,
    createdAt: row.createdAt,
    completedAt: row.completedAt ?? null,
    cancelledAt: row.cancelledAt ?? null,
  };
}

export async function listSwitches(db: AegisDb): Promise<SwitchRecord[]> {
  const rows = await db.select().from(switches);
  return rows.map(rowToSwitchRecord);
}

export async function getSwitchById(db: AegisDb, id: number): Promise<SwitchRecord | null> {
  const rows = await db.select().from(switches).where(eq(switches.id, id));
  if (rows.length === 0) return null;
  return rowToSwitchRecord(rows[0]);
}

export async function createSwitch(db: AegisDb, input: CreateSwitchData): Promise<SwitchRecord> {
  const result = await db
    .insert(switches)
    .values({
      name: input.name,
      mode: input.mode,
      deploymentMode: input.deploymentMode ?? 'vault',
      triggerAt: input.triggerAt ?? null,
      heartbeatIntervalDays: input.heartbeatIntervalDays ?? null,
      gracePeriodHours: input.gracePeriodHours ?? 72,
      warningWindowDays: input.warningWindowDays ?? 3,
      selectedContactIds: JSON.stringify(input.selectedContactIds ?? []),
      selectedEstateItemIds: JSON.stringify(input.selectedEstateItemIds ?? []),
    })
    .returning();

  return rowToSwitchRecord(result[0]);
}

export async function updateSwitch(
  db: AegisDb,
  id: number,
  input: UpdateSwitchData,
): Promise<SwitchRecord> {
  const patch: Partial<typeof switches.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) patch.name = input.name;
  if (input.mode !== undefined) patch.mode = input.mode;
  if (input.deploymentMode !== undefined) patch.deploymentMode = input.deploymentMode;
  if (input.triggerAt !== undefined) patch.triggerAt = input.triggerAt;
  if (input.heartbeatIntervalDays !== undefined) patch.heartbeatIntervalDays = input.heartbeatIntervalDays;
  if (input.gracePeriodHours !== undefined) patch.gracePeriodHours = input.gracePeriodHours;
  if (input.warningWindowDays !== undefined) patch.warningWindowDays = input.warningWindowDays;
  if (input.selectedContactIds !== undefined) {
    patch.selectedContactIds = JSON.stringify(input.selectedContactIds);
  }
  if (input.selectedEstateItemIds !== undefined) {
    patch.selectedEstateItemIds = JSON.stringify(input.selectedEstateItemIds);
  }

  const result = await db
    .update(switches)
    .set(patch)
    .where(eq(switches.id, id))
    .returning();

  return rowToSwitchRecord(result[0]);
}

export async function deleteSwitch(db: AegisDb, id: number): Promise<void> {
  await db.delete(switches).where(eq(switches.id, id));
}

export async function markSwitchStatus(
  db: AegisDb,
  id: number,
  status: string,
  patch?: MarkSwitchStatusPatch,
): Promise<SwitchRecord> {
  const update: Partial<typeof switches.$inferInsert> = {
    status,
    updatedAt: new Date(),
  };

  if (patch) {
    if (patch.lastCheckInAt !== undefined) update.lastCheckInAt = patch.lastCheckInAt;
    if (patch.lastReminderSentAt !== undefined) update.lastReminderSentAt = patch.lastReminderSentAt;
    if (patch.lastWarningSentAt !== undefined) update.lastWarningSentAt = patch.lastWarningSentAt;
    if (patch.lastEvaluatedAt !== undefined) update.lastEvaluatedAt = patch.lastEvaluatedAt;
    if (patch.nextCheckInDueAt !== undefined) update.nextCheckInDueAt = patch.nextCheckInDueAt;
    if (patch.warningStartsAt !== undefined) update.warningStartsAt = patch.warningStartsAt;
  }

  const result = await db
    .update(switches)
    .set(update)
    .where(eq(switches.id, id))
    .returning();

  return rowToSwitchRecord(result[0]);
}

export async function getActiveReleaseRun(db: AegisDb): Promise<ReleaseRunRecord | null> {
  const rows = await db
    .select()
    .from(releaseRuns)
    .where(and(isNull(releaseRuns.completedAt), isNull(releaseRuns.cancelledAt)));

  if (rows.length === 0) return null;
  return rowToReleaseRunRecord(rows[0]);
}

export async function createReleaseRun(db: AegisDb, switchId: number): Promise<ReleaseRunRecord> {
  const result = await db
    .insert(releaseRuns)
    .values({ triggeringSwitchId: switchId })
    .returning();

  return rowToReleaseRunRecord(result[0]);
}
