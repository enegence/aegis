import type { AegisDb } from '../db/index.js';
import {
  getActiveReleaseRunFull,
  createReleaseRunFull,
  addSuppressedSwitchId,
  type ReleaseRunRecord,
} from '../repositories/release-run-repository.js';
import { writeAuditEvent } from './audit.js';

export type ReleaseRunReason = 'trip_triggered' | 'heartbeat_missed' | 'manual_test';

export interface ReleaseRunStartResult {
  run: ReleaseRunRecord;
  created: boolean;
  suppressed: boolean;
}

export async function startOrAttachReleaseRun(
  db: AegisDb,
  input: {
    triggeringSwitchId: number;
    reason: ReleaseRunReason;
  },
): Promise<ReleaseRunStartResult> {
  const { triggeringSwitchId, reason } = input;

  const existing = await getActiveReleaseRunFull(db);

  if (existing) {
    await addSuppressedSwitchId(db, existing.id, triggeringSwitchId);

    await writeAuditEvent(db, {
      switchId: triggeringSwitchId,
      eventType: 'trigger_suppressed_by_active_release_run',
      actorType: 'system',
      metadata: {
        triggeringSwitchId,
        activeReleaseRunId: existing.id,
        reason,
      },
    });

    return { run: existing, created: false, suppressed: true };
  }

  const run = await createReleaseRunFull(db, triggeringSwitchId);

  await writeAuditEvent(db, {
    switchId: triggeringSwitchId,
    eventType: 'release_run_created',
    actorType: 'system',
    metadata: { triggeringSwitchId, releaseRunId: run.id, reason },
  });

  return { run, created: true, suppressed: false };
}
