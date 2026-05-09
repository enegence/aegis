import { and, desc, eq, gte } from 'drizzle-orm';
import { notificationEvents, owner } from '../db/schema.js';
import type { AegisDb } from '../db/index.js';
import type { SwitchRecord } from './switch-repository.js';
import { markSwitchStatus } from './switch-repository.js';
import { dispatchNotification } from './notifications.js';
import { renderTemplate } from './notification-templates.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function isWithin24Hours(target: Date, now: Date): boolean {
  const diff = target.getTime() - now.getTime();
  return diff >= 0 && diff <= TWENTY_FOUR_HOURS_MS;
}

function isOlderThan24Hours(date: Date | null, now: Date): boolean {
  if (date === null) return true;
  return now.getTime() - date.getTime() > TWENTY_FOUR_HOURS_MS;
}

async function getOwnerEmail(db: AegisDb): Promise<string | null> {
  const rows = await db
    .select({ email: owner.email })
    .from(owner)
    .limit(1);
  return rows[0]?.email ?? null;
}

async function hasRecentNotificationEvent(
  db: AegisDb,
  switchId: number,
  purpose: string,
  since: Date,
): Promise<boolean> {
  const rows = await db
    .select({ id: notificationEvents.id })
    .from(notificationEvents)
    .where(
      and(
        eq(notificationEvents.switchId, switchId),
        eq(notificationEvents.purpose, purpose as 'test' | 'reminder' | 'warning' | 'triggered'),
        gte(notificationEvents.createdAt, since),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function processRemindersForSwitch(
  db: AegisDb,
  sw: SwitchRecord,
  now: Date,
): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;

  const ownerEmail = await getOwnerEmail(db);

  // Helper: send a notification and update the appropriate timestamp
  async function sendNotification(opts: {
    purpose: 'reminder' | 'warning' | 'triggered';
    templatePurpose: Parameters<typeof renderTemplate>[0];
    templateData: Parameters<typeof renderTemplate>[1];
    timestampPatch: 'lastReminderSentAt' | 'lastWarningSentAt';
  }): Promise<void> {
    const { subject, body } = renderTemplate(opts.templatePurpose, opts.templateData);

    const to = ownerEmail ?? 'owner@localhost';

    // Dispatch to email channel if possible (dispatchNotification handles skipped gracefully)
    await dispatchNotification(db, {
      switchId: sw.id,
      channel: 'email',
      purpose: opts.purpose,
      to,
      subject,
      body,
    });

    // Check the actual result recorded in notification_events
    const recentEvents = await db
      .select({ status: notificationEvents.status })
      .from(notificationEvents)
      .where(
        and(
          eq(notificationEvents.switchId, sw.id),
          eq(notificationEvents.purpose, opts.purpose),
        ),
      )
      .orderBy(desc(notificationEvents.createdAt))
      .limit(1);
    const lastEvent = recentEvents[0];

    if (lastEvent?.status === 'skipped') {
      skipped += 1;
    } else {
      sent += 1;
    }

    // Update the switch timestamp regardless of delivery outcome
    await markSwitchStatus(db, sw.id, sw.status, {
      [opts.timestampPatch]: now,
    });
  }

  const windowSince = new Date(now.getTime() - TWENTY_FOUR_HOURS_MS);

  if (sw.mode === 'trip') {
    // ── Armed + warningStartsAt within 24h ─────────────────────────────────────
    if (
      sw.status === 'armed' &&
      sw.warningStartsAt !== null &&
      isWithin24Hours(sw.warningStartsAt, now) &&
      isOlderThan24Hours(sw.lastReminderSentAt, now)
    ) {
      const alreadySent = await hasRecentNotificationEvent(db, sw.id, 'reminder', windowSince);
      if (!alreadySent) {
        await sendNotification({
          purpose: 'reminder',
          templatePurpose: 'owner_trip_reminder',
          templateData: {
            switchName: sw.name,
            mode: sw.mode,
            nextActionAt: sw.warningStartsAt.toISOString(),
          },
          timestampPatch: 'lastReminderSentAt',
        });
        return { sent, skipped };
      }
    }

    // ── Warning status, first warning notice ───────────────────────────────────
    if (sw.status === 'warning' && sw.lastWarningSentAt === null) {
      const alreadySent = await hasRecentNotificationEvent(db, sw.id, 'warning', windowSince);
      if (!alreadySent) {
        await sendNotification({
          purpose: 'warning',
          templatePurpose: 'owner_warning_started',
          templateData: { switchName: sw.name },
          timestampPatch: 'lastWarningSentAt',
        });
        return { sent, skipped };
      }
    }

    // ── Triggered status, first trigger notice ─────────────────────────────────
    if (sw.status === 'triggered' && sw.lastWarningSentAt === null) {
      const alreadySent = await hasRecentNotificationEvent(db, sw.id, 'triggered', windowSince);
      if (!alreadySent) {
        await sendNotification({
          purpose: 'triggered',
          templatePurpose: 'owner_trigger_reached_local_only',
          templateData: { switchName: sw.name },
          timestampPatch: 'lastWarningSentAt',
        });
        return { sent, skipped };
      }
    }
  } else if (sw.mode === 'heartbeat') {
    // ── Armed + nextCheckInDueAt within 24h ────────────────────────────────────
    if (
      sw.status === 'armed' &&
      sw.nextCheckInDueAt !== null &&
      isWithin24Hours(sw.nextCheckInDueAt, now) &&
      isOlderThan24Hours(sw.lastReminderSentAt, now)
    ) {
      const alreadySent = await hasRecentNotificationEvent(db, sw.id, 'reminder', windowSince);
      if (!alreadySent) {
        await sendNotification({
          purpose: 'reminder',
          templatePurpose: 'owner_heartbeat_reminder',
          templateData: {
            switchName: sw.name,
            nextActionAt: sw.nextCheckInDueAt.toISOString(),
          },
          timestampPatch: 'lastReminderSentAt',
        });
        return { sent, skipped };
      }
    }

    // ── Warning status, first warning notice ───────────────────────────────────
    if (sw.status === 'warning' && sw.lastWarningSentAt === null) {
      const alreadySent = await hasRecentNotificationEvent(db, sw.id, 'warning', windowSince);
      if (!alreadySent) {
        await sendNotification({
          purpose: 'warning',
          templatePurpose: 'owner_warning_started',
          templateData: { switchName: sw.name },
          timestampPatch: 'lastWarningSentAt',
        });
        return { sent, skipped };
      }
    }

    // ── Triggered status, first trigger notice ─────────────────────────────────
    if (sw.status === 'triggered' && sw.lastWarningSentAt === null) {
      const alreadySent = await hasRecentNotificationEvent(db, sw.id, 'triggered', windowSince);
      if (!alreadySent) {
        await sendNotification({
          purpose: 'triggered',
          templatePurpose: 'owner_trigger_reached_local_only',
          templateData: { switchName: sw.name },
          timestampPatch: 'lastWarningSentAt',
        });
        return { sent, skipped };
      }
    }
  }

  return { sent, skipped };
}
