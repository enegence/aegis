import { inArray } from 'drizzle-orm';
import { switches } from '../db/schema.js';
import type { AegisDb } from '../db/index.js';
import type { SwitchRecord } from '../services/switch-repository.js';
import { evaluateAndTransition } from '../services/switch-engine.js';
import { processRemindersForSwitch } from '../services/reminders.js';
import { syncPacketForSwitch } from '../services/dead-drop-sync.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkerSyncConfig {
  fieldEncryptionKey: string;
  dataDir: string;
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

  return result;
}

// ─── startWorker ──────────────────────────────────────────────────────────────

export function startWorker(db: AegisDb, options?: WorkerOptions): WorkerHandle {
  const intervalMs =
    options?.intervalMs ??
    parseInt(process.env.AEGIS_WORKER_INTERVAL_SECONDS ?? '60') * 1000;

  const syncConfig = options?.syncConfig;
  let running = true;

  if (options?.runImmediately) {
    runWorkerOnce(db, new Date(), syncConfig).catch(console.error);
  }

  const timer = setInterval(async () => {
    if (!running) return;
    try {
      await runWorkerOnce(db, new Date(), syncConfig);
    } catch (err) {
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
