import { inArray, eq } from 'drizzle-orm';
import { switches, releaseRuns, workerHeartbeats } from '../db/schema.js';
import type { AegisDb } from '../db/index.js';
import type { SwitchRecord } from '../services/switch-repository.js';
import { evaluateAndTransition } from '../services/switch-engine.js';
import { processRemindersForSwitch } from '../services/reminders.js';
import { syncPacketForSwitch } from '../services/dead-drop-sync.js';
import { buildPacket } from '../services/packet-builder.js';
import { startCascade, checkAndEscalate, type CascadeConfig } from '../services/cascade.js';
import {
  type ReleaseRunRecord,
  setActivePacket,
} from '../repositories/release-run-repository.js';
import { writeAuditEvent } from '../services/audit.js';
import { purgeExpiredIdempotencyKeys } from '../services/idempotency-keys.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkerSyncConfig {
  fieldEncryptionKey: string;
  dataDir: string;
  appUrl?: string;
}

export interface WorkerOptions {
  intervalMs?: number;       // default: AEGIS_WORKER_INTERVAL_SECONDS * 1000 || 60000
  runImmediately?: boolean;  // run once on start, default false
  syncConfig?: WorkerSyncConfig;
}

export interface WorkerHandle {
  stop(): Promise<void>;
}

export interface WorkerRunResult {
  evaluated: number;
  transitioned: number;
  notificationsSent: number;
  errors: number;
  ranAt: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadEvaluableSwitches(db: AegisDb): Promise<SwitchRecord[]> {
  const rows = await db
    .select()
    .from(switches)
    .where(inArray(switches.status, ['armed', 'warning']));

  return rows.map(row => ({
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
    selectedContactIds: (() => {
      try { return JSON.parse(row.selectedContactIds ?? '[]') as number[]; }
      catch { return []; }
    })(),
    selectedEstateItemIds: (() => {
      try { return JSON.parse(row.selectedEstateItemIds ?? '[]') as number[]; }
      catch { return []; }
    })(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

// ─── Worker restart recovery ──────────────────────────────────────────────────

/**
 * On startup, recover active/paused release runs.
 *
 * This ensures that if the worker restarts mid-cascade, it resumes from the
 * current state rather than starting fresh (which could duplicate notifications).
 * The actual deduplication for notifications/uploads is enforced by idempotency
 * keys checked in the cascade/packet build layers.
 */
export async function recoverActiveReleaseRuns(db: AegisDb): Promise<number> {
  const rows = await db
    .select()
    .from(releaseRuns)
    .where(inArray(releaseRuns.status, ['active', 'cascade_active', 'paused']));

  if (rows.length === 0) return 0;

  const runIds = rows.map((r) => r.id);

  await writeAuditEvent(db, {
    eventType: 'worker_recovery_started',
    actorType: 'system',
    metadata: { activeRunCount: rows.length, runIds },
  });

  // The worker tick loop naturally picks up active/cascade_active runs
  // via loadActiveReleaseRuns() on the next tick — no explicit re-queue needed.

  await writeAuditEvent(db, {
    eventType: 'worker_recovery_completed',
    actorType: 'system',
    metadata: { activeRunCount: rows.length, runIds },
  });

  return rows.length;
}

// ─── Release run cascade helpers ──────────────────────────────────────────────

async function loadActiveReleaseRuns(db: AegisDb): Promise<ReleaseRunRecord[]> {
  const rows = await db
    .select()
    .from(releaseRuns)
    .where(inArray(releaseRuns.status, ['active', 'cascade_active']));

  return rows.map((r) => ({
    id: r.id,
    triggeringSwitchId: r.triggeringSwitchId,
    status: r.status,
    activePacketId: r.activePacketId ?? null,
    currentContactClaimId: r.currentContactClaimId ?? null,
    suppressedSwitchIds: (() => {
      try { return JSON.parse(r.suppressedSwitchIds ?? '[]') as number[]; }
      catch { return []; }
    })(),
    metadata: (() => {
      try { return JSON.parse(r.metadata ?? '{}') as Record<string, unknown>; }
      catch { return {}; }
    })(),
    startedAt: r.startedAt,
    completedAt: r.completedAt ?? null,
    cancelledAt: r.cancelledAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

async function progressReleaseRuns(
  db: AegisDb,
  now: Date,
  syncConfig: WorkerSyncConfig,
): Promise<void> {
  const activeRuns = await loadActiveReleaseRuns(db);
  if (activeRuns.length === 0) return;

  const cascadeConfig: CascadeConfig = {
    appUrl: syncConfig.appUrl ?? 'http://localhost:8000',
    fieldEncryptionKey: syncConfig.fieldEncryptionKey,
  };

  for (const run of activeRuns) {
    try {
      if (run.activePacketId == null) {
        // Build and attach packet — required before cascade can start
        try {
          const packet = await buildPacket(
            db,
            syncConfig.fieldEncryptionKey,
            syncConfig.dataDir,
            run.triggeringSwitchId,
          );
          await setActivePacket(db, run.id, packet.id);
        } catch (err) {
          console.error(`[worker] failed to build packet for run ${run.id}:`, err);
        }
        continue; // cascade starts on next tick
      }

      // Start cascade if not yet started
      if (run.currentContactClaimId == null) {
        await startCascade(db, cascadeConfig, run.id);
        continue; // escalation check on next tick
      }

      // Check and escalate timed-out claims
      await checkAndEscalate(db, cascadeConfig, run.id, now);
    } catch (err) {
      console.error(`[worker] error in cascade for release run ${run.id}:`, err);
    }
  }
}

// ─── Heartbeat persistence ─────────────────────────────────────────────────────

async function upsertHeartbeatTick(db: AegisDb, now: Date): Promise<void> {
  try {
    await db
      .insert(workerHeartbeats)
      .values({ id: 'singleton', lastTickAt: now })
      .onConflictDoUpdate({
        target: workerHeartbeats.id,
        set: { lastTickAt: now },
      });
  } catch {
    // Non-fatal — heartbeat table may not exist yet (pre-migration)
  }
}

async function upsertHeartbeatSuccess(db: AegisDb, now: Date, durationMs: number): Promise<void> {
  try {
    await db
      .insert(workerHeartbeats)
      .values({ id: 'singleton', lastTickAt: now, lastSuccessAt: now, tickDurationMs: durationMs })
      .onConflictDoUpdate({
        target: workerHeartbeats.id,
        set: { lastSuccessAt: now, tickDurationMs: durationMs },
      });
  } catch {
    // Non-fatal
  }
}

async function upsertHeartbeatError(db: AegisDb, now: Date, errorRedacted: string): Promise<void> {
  try {
    await db
      .insert(workerHeartbeats)
      .values({ id: 'singleton', lastTickAt: now, lastErrorAt: now, lastErrorRedacted: errorRedacted })
      .onConflictDoUpdate({
        target: workerHeartbeats.id,
        set: { lastErrorAt: now, lastErrorRedacted: errorRedacted },
      });
  } catch {
    // Non-fatal
  }
}

// ─── runWorkerOnce ─────────────────────────────────────────────────────────────

export async function runWorkerOnce(
  db: AegisDb,
  now: Date = new Date(),
  syncConfig?: WorkerSyncConfig,
): Promise<WorkerRunResult> {
  const result: WorkerRunResult = {
    evaluated: 0,
    transitioned: 0,
    notificationsSent: 0,
    errors: 0,
    ranAt: now,
  };

  const activeSwitches = await loadEvaluableSwitches(db);

  for (const sw of activeSwitches) {
    try {
      const previousStatus = sw.status;

      // 1. Evaluate and transition
      const updatedSwitch = await evaluateAndTransition(db, sw.id, now);
      result.evaluated += 1;

      if (updatedSwitch.status !== previousStatus) {
        result.transitioned += 1;
      }

      // 2. Process reminders/warnings for this switch
      const reminderResult = await processRemindersForSwitch(db, updatedSwitch, now);
      result.notificationsSent += reminderResult.sent;

      // 3. Dead-drop sync for eligible deployment modes (armed/warning only)
      if (syncConfig && (updatedSwitch.status === 'armed' || updatedSwitch.status === 'warning')) {
        const deadDropModes = new Set(['dead_drop', 'relay_monitoring', 'relay_escrow']);
        if (deadDropModes.has(updatedSwitch.deploymentMode)) {
          await syncPacketForSwitch(db, updatedSwitch.id, syncConfig.fieldEncryptionKey, syncConfig.dataDir);
        }
      }

    } catch (err) {
      console.error(`[worker] error processing switch ${sw.id}:`, err);
      result.errors += 1;
    }
  }

  // 4. Progress active release runs (cascade loop)
  if (syncConfig?.fieldEncryptionKey) {
    await progressReleaseRuns(db, now, syncConfig);
  }

  return result;
}

// ─── startWorker ──────────────────────────────────────────────────────────────

export function startWorker(db: AegisDb, options?: WorkerOptions): WorkerHandle {
  const intervalMs =
    options?.intervalMs ??
    parseInt(process.env.AEGIS_WORKER_INTERVAL_SECONDS ?? '60') * 1000;

  const syncConfig = options?.syncConfig;
  let running = true;
  let tickCount = 0;
  const PURGE_INTERVAL_TICKS = 100;

  // Recovery: on startup, find and log any in-flight release runs so the worker
  // can resume from current state without restarting from scratch.
  recoverActiveReleaseRuns(db).catch((err) =>
    console.error('[worker] recovery error:', err),
  );

  if (options?.runImmediately) {
    runWorkerOnce(db, new Date(), syncConfig).catch(console.error);
  }

  const timer = setInterval(async () => {
    if (!running) return;
    const tickStart = Date.now();
    const now = new Date();
    await upsertHeartbeatTick(db, now);
    try {
      await runWorkerOnce(db, now, syncConfig);
      const durationMs = Date.now() - tickStart;
      await upsertHeartbeatSuccess(db, now, durationMs);
      tickCount += 1;
      if (tickCount % PURGE_INTERVAL_TICKS === 0) {
        purgeExpiredIdempotencyKeys(db).catch((err) =>
          console.error('[worker] purge idempotency keys error:', err),
        );
      }
    } catch (err) {
      const errorRedacted = err instanceof Error ? err.constructor.name : 'UnknownError';
      await upsertHeartbeatError(db, now, errorRedacted);
      console.error('[worker] tick error:', err);
    }
  }, intervalMs);

  return {
    async stop() {
      running = false;
      clearInterval(timer);
    },
  };
}
