import type { AegisDb } from '../db/index.js';
import {
  getSwitchById,
  markSwitchStatus,
  type SwitchRecord,
} from './switch-repository.js';
import { writeAuditEvent } from './audit.js';
import { assertReadyToArm } from './readiness.js';
import { startOrAttachReleaseRun } from './release-run.js';

// ─── Pure helpers ──────────────────────────────────────────────────────────────

export interface ScheduleResult {
  triggerAt: Date | null;
  warningStartsAt: Date | null;
  nextCheckInDueAt: Date | null;
}

export function calculateWarningStartsAt(
  triggerAt: Date,
  warningWindowDays: number,
): Date | null {
  if (warningWindowDays <= 0) return null;
  return new Date(triggerAt.getTime() - warningWindowDays * 86400000);
}

export function calculateNextCheckInDueAt(
  lastCheckInAt: Date,
  intervalDays: number,
): Date {
  return new Date(lastCheckInAt.getTime() + intervalDays * 86400000);
}

export function calculateInitialSchedule(
  input: {
    mode: string;
    triggerAt?: Date | null;
    heartbeatIntervalDays?: number | null;
    warningWindowDays?: number;
  },
  now: Date,
): ScheduleResult {
  if (input.mode === 'trip') {
    const triggerAt = input.triggerAt ?? null;
    const warningWindowDays = input.warningWindowDays ?? 0;
    const warningStartsAt =
      triggerAt && warningWindowDays > 0
        ? calculateWarningStartsAt(triggerAt, warningWindowDays)
        : null;
    return { triggerAt, warningStartsAt, nextCheckInDueAt: null };
  }

  // heartbeat mode
  const intervalDays = input.heartbeatIntervalDays ?? null;
  const nextCheckInDueAt =
    intervalDays != null ? calculateNextCheckInDueAt(now, intervalDays) : null;
  return { triggerAt: null, warningStartsAt: null, nextCheckInDueAt };
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

export interface SwitchEvaluation {
  shouldTransitionTo: string | null;
  reason: string;
}

function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 3600000);
}

export function evaluateSwitch(sw: SwitchRecord, now: Date): SwitchEvaluation {
  if (sw.mode === 'trip') {
    if (sw.status !== 'armed' && sw.status !== 'warning') {
      return { shouldTransitionTo: null, reason: 'status not evaluable' };
    }
    if (sw.status === 'armed') {
      if (
        sw.warningWindowDays > 0 &&
        sw.warningStartsAt != null &&
        now >= sw.warningStartsAt
      ) {
        return { shouldTransitionTo: 'warning', reason: 'warning window started' };
      }
      if (
        (sw.warningWindowDays === 0 || sw.warningStartsAt == null) &&
        sw.triggerAt != null &&
        now >= sw.triggerAt
      ) {
        return { shouldTransitionTo: 'triggered', reason: 'trigger date reached' };
      }
      return { shouldTransitionTo: null, reason: 'no transition due' };
    }
    // status === 'warning'
    if (sw.triggerAt != null && now >= sw.triggerAt) {
      return { shouldTransitionTo: 'triggered', reason: 'trigger date reached during warning' };
    }
    return { shouldTransitionTo: null, reason: 'still in warning window' };
  }

  // heartbeat mode
  if (sw.status !== 'armed' && sw.status !== 'warning') {
    return { shouldTransitionTo: null, reason: 'status not evaluable' };
  }
  if (sw.status === 'armed') {
    if (sw.nextCheckInDueAt != null && now >= sw.nextCheckInDueAt) {
      return { shouldTransitionTo: 'warning', reason: 'missed check-in' };
    }
    return { shouldTransitionTo: null, reason: 'check-in not overdue' };
  }
  // status === 'warning'
  if (
    sw.nextCheckInDueAt != null &&
    now >= addHours(sw.nextCheckInDueAt, sw.gracePeriodHours)
  ) {
    return { shouldTransitionTo: 'triggered', reason: 'grace period expired' };
  }
  return { shouldTransitionTo: null, reason: 'still within grace period' };
}

// ─── Stateful action functions ─────────────────────────────────────────────────

export async function armSwitch(db: AegisDb, id: number): Promise<SwitchRecord> {
  const sw = await getSwitchById(db, id);
  if (!sw) throw new Error(`Switch ${id} not found`);
  if (sw.status !== 'draft' && sw.status !== 'paused') {
    throw new Error(
      `Cannot arm switch in status '${sw.status}'. Expected 'draft' or 'paused'.`,
    );
  }

  await assertReadyToArm(db, sw);

  const now = new Date();
  const schedule = calculateInitialSchedule(
    {
      mode: sw.mode,
      triggerAt: sw.triggerAt,
      heartbeatIntervalDays: sw.heartbeatIntervalDays,
      warningWindowDays: sw.warningWindowDays,
    },
    now,
  );

  const patch: Parameters<typeof markSwitchStatus>[3] = {
    warningStartsAt: schedule.warningStartsAt,
    nextCheckInDueAt: schedule.nextCheckInDueAt,
  };

  // For heartbeat: set lastCheckInAt = now as the baseline
  if (sw.mode === 'heartbeat') {
    patch.lastCheckInAt = now;
  }

  const updated = await markSwitchStatus(db, id, 'armed', patch);

  await writeAuditEvent(db, {
    switchId: id,
    eventType: 'switch_armed',
    actorType: 'owner',
  });

  return updated;
}

export async function pauseSwitch(db: AegisDb, id: number): Promise<SwitchRecord> {
  const sw = await getSwitchById(db, id);
  if (!sw) throw new Error(`Switch ${id} not found`);
  if (sw.status !== 'armed' && sw.status !== 'warning') {
    throw new Error(
      `Cannot pause switch in status '${sw.status}'. Expected 'armed' or 'warning'.`,
    );
  }

  const updated = await markSwitchStatus(db, id, 'paused');

  await writeAuditEvent(db, {
    switchId: id,
    eventType: 'switch_paused',
    actorType: 'owner',
  });

  return updated;
}

export async function cancelSwitch(db: AegisDb, id: number): Promise<SwitchRecord> {
  const sw = await getSwitchById(db, id);
  if (!sw) throw new Error(`Switch ${id} not found`);

  const nonCancellable = ['triggered', 'cascade_active', 'completed', 'cancelled'];
  if (nonCancellable.includes(sw.status)) {
    throw new Error(
      `Cannot cancel switch in status '${sw.status}'.`,
    );
  }

  const updated = await markSwitchStatus(db, id, 'cancelled');

  await writeAuditEvent(db, {
    switchId: id,
    eventType: 'switch_cancelled',
    actorType: 'owner',
  });

  return updated;
}

export async function checkIn(db: AegisDb, id: number): Promise<SwitchRecord> {
  const sw = await getSwitchById(db, id);
  if (!sw) throw new Error(`Switch ${id} not found`);
  if (sw.status !== 'armed' && sw.status !== 'warning') {
    throw new Error(
      `Cannot check in switch in status '${sw.status}'. Expected 'armed' or 'warning'.`,
    );
  }

  const now = new Date();
  const intervalDays = sw.heartbeatIntervalDays;
  const newNextCheckInDueAt =
    intervalDays != null ? calculateNextCheckInDueAt(now, intervalDays) : null;

  const updated = await markSwitchStatus(db, id, 'armed', {
    lastCheckInAt: now,
    nextCheckInDueAt: newNextCheckInDueAt,
  });

  await writeAuditEvent(db, {
    switchId: id,
    eventType: 'check_in_completed',
    actorType: 'owner',
  });

  return updated;
}

export async function evaluateAndTransition(
  db: AegisDb,
  id: number,
  now: Date = new Date(),
): Promise<SwitchRecord> {
  const sw = await getSwitchById(db, id);
  if (!sw) throw new Error(`Switch ${id} not found`);

  const evaluation = evaluateSwitch(sw, now);

  if (evaluation.shouldTransitionTo !== null) {
    const newStatus = evaluation.shouldTransitionTo;

    if (newStatus === 'triggered') {
      await startOrAttachReleaseRun(db, {
        triggeringSwitchId: id,
        reason: sw.mode === 'heartbeat' ? 'heartbeat_missed' : 'trip_triggered',
      });
    } else if (newStatus === 'warning') {
      await writeAuditEvent(db, {
        switchId: id,
        eventType: 'warning_started',
        actorType: 'system',
      });
    }

    // Update switch status and lastEvaluatedAt
    const updated = await markSwitchStatus(db, id, newStatus, {
      lastEvaluatedAt: now,
    });
    return updated;
  }

  // No transition — just update lastEvaluatedAt
  const updated = await markSwitchStatus(db, id, sw.status, {
    lastEvaluatedAt: now,
  });
  return updated;
}
