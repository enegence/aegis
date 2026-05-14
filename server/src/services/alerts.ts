/**
 * Operational alerting service (Phase 5 Task 5).
 *
 * Reads DB state to determine if any operational conditions require attention.
 * Does NOT send alerts — detection only. Sending is Task 11.
 *
 * Alert shapes contain no PII — only system-level operational data.
 */

import { eq, count, and, lte, inArray } from 'drizzle-orm';
import type { AegisDb } from '../db/index.js';
import { workerHeartbeats, notificationDeliveries, releaseRuns, appSettings } from '../db/schema.js';

export interface Alert {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string; // no PII
  raisedAt: Date;
}

// Thresholds (can be env-overridden in future)
const WORKER_STALE_MINUTES = parseInt(process.env.ALERT_WORKER_STALE_MINUTES ?? '10', 10);
const FAILED_NOTIFICATION_THRESHOLD = parseInt(process.env.ALERT_FAILED_NOTIFICATION_COUNT ?? '5', 10);
const STUCK_RELEASE_RUN_HOURS = parseInt(process.env.ALERT_STUCK_RELEASE_RUN_HOURS ?? '24', 10);

/**
 * Returns active operational alerts derived from current DB state.
 * No in-memory state — all conditions evaluated from DB on each call.
 */
export async function getActiveAlerts(db: AegisDb): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const now = new Date();

  // ── 1. Worker heartbeat staleness ────────────────────────────────────────────
  try {
    const [heartbeat] = await db
      .select()
      .from(workerHeartbeats)
      .where(eq(workerHeartbeats.id, 'singleton'));

    if (!heartbeat || heartbeat.lastTickAt == null) {
      alerts.push({
        type: 'worker_never_ticked',
        severity: 'warning',
        message: 'Worker has never recorded a heartbeat. Worker may not be running.',
        raisedAt: now,
      });
    } else {
      const staleMs = WORKER_STALE_MINUTES * 60 * 1000;
      const msSinceLastTick = now.getTime() - heartbeat.lastTickAt.getTime();
      if (msSinceLastTick > staleMs) {
        const minutesAgo = Math.floor(msSinceLastTick / 60000);
        alerts.push({
          type: 'worker_stale',
          severity: 'critical',
          message: `Worker last ticked ${minutesAgo} minutes ago (threshold: ${WORKER_STALE_MINUTES} minutes).`,
          raisedAt: now,
        });
      }
    }
  } catch {
    // Table may not exist yet (fresh install before migration)
  }

  // ── 2. Failed notification threshold ─────────────────────────────────────────
  try {
    const [failRow] = await db
      .select({ c: count() })
      .from(notificationDeliveries)
      .where(eq(notificationDeliveries.status, 'failed_permanent'));

    const failCount = Number(failRow?.c ?? 0);
    if (failCount >= FAILED_NOTIFICATION_THRESHOLD) {
      alerts.push({
        type: 'notification_failures_threshold',
        severity: 'warning',
        message: `${failCount} permanent notification delivery failures (threshold: ${FAILED_NOTIFICATION_THRESHOLD}).`,
        raisedAt: now,
      });
    }
  } catch {
    // Table may not exist
  }

  // ── 3. Stuck release runs ─────────────────────────────────────────────────────
  try {
    const stuckThreshold = new Date(now.getTime() - STUCK_RELEASE_RUN_HOURS * 60 * 60 * 1000);
    const [stuckRow] = await db
      .select({ c: count() })
      .from(releaseRuns)
      .where(
        and(
          inArray(releaseRuns.status, ['active', 'cascade_active']),
          lte(releaseRuns.startedAt, stuckThreshold),
        ),
      );

    const stuckCount = Number(stuckRow?.c ?? 0);
    if (stuckCount > 0) {
      alerts.push({
        type: 'stuck_release_run',
        severity: 'critical',
        message: `${stuckCount} release run(s) active for more than ${STUCK_RELEASE_RUN_HOURS} hours.`,
        raisedAt: now,
      });
    }
  } catch {
    // Table may not exist
  }

  return alerts;
}
