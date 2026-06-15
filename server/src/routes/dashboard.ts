import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { owner, packets, auditEvents } from '../db/schema.js';
import { listSwitches } from '../services/switch-repository.js';
import { getSmtpConfig, getTelegramConfig } from '../services/notifications.js';
import { getActiveReleaseRunFull } from '../repositories/release-run-repository.js';
import type { SwitchRecord } from '../services/switch-repository.js';
import type { Switch, HealthStatus, DashboardSummary } from '@aegis/shared';
import { APP_VERSION } from '../version.js';

function switchRecordToSwitch(sw: SwitchRecord): Switch {
  return {
    id: sw.id,
    name: sw.name,
    mode: sw.mode as Switch['mode'],
    deploymentMode: sw.deploymentMode as Switch['deploymentMode'],
    status: sw.status as Switch['status'],
    triggerAt: sw.triggerAt ? sw.triggerAt.toISOString() : null,
    heartbeatIntervalDays: sw.heartbeatIntervalDays,
    nextCheckInDueAt: sw.nextCheckInDueAt ? sw.nextCheckInDueAt.toISOString() : null,
    warningStartsAt: sw.warningStartsAt ? sw.warningStartsAt.toISOString() : null,
    gracePeriodHours: sw.gracePeriodHours,
    warningWindowDays: sw.warningWindowDays,
    lastCheckInAt: sw.lastCheckInAt ? sw.lastCheckInAt.toISOString() : null,
    lastPacketSyncAt: sw.lastPacketSyncAt ? sw.lastPacketSyncAt.toISOString() : null,
    lastReminderSentAt: sw.lastReminderSentAt ? sw.lastReminderSentAt.toISOString() : null,
    lastWarningSentAt: sw.lastWarningSentAt ? sw.lastWarningSentAt.toISOString() : null,
    lastEvaluatedAt: sw.lastEvaluatedAt ? sw.lastEvaluatedAt.toISOString() : null,
    selectedContactIds: sw.selectedContactIds,
    selectedEstateItemIds: sw.selectedEstateItemIds,
    createdAt: sw.createdAt.toISOString(),
    updatedAt: sw.updatedAt.toISOString(),
  };
}

/**
 * Pick the soonest action date for a switch.
 * - Trip mode: warningStartsAt (if in warning) or triggerAt
 * - Heartbeat mode: nextCheckInDueAt
 */
function getSwitchActionDate(sw: SwitchRecord): Date | null {
  if (sw.mode === 'heartbeat') {
    if (sw.status === 'warning' && sw.nextCheckInDueAt) {
      return new Date(sw.nextCheckInDueAt.getTime() + sw.gracePeriodHours * 3600000);
    }
    return sw.nextCheckInDueAt ?? null;
  }

  return sw.triggerAt ?? null;
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard', {
    preHandler: [app.requireAuth],
  }, async (_req, reply) => {
    const db = app.db;

    // 1. Get owner name
    const ownerRows = await db.select({ displayName: owner.displayName }).from(owner);
    const ownerName = ownerRows[0]?.displayName ?? 'Unknown';

    // 2. Get all switches and compute counts
    const allSwitches = await listSwitches(db);

    const activeStatuses = new Set(['armed', 'warning']);
    const activeSwitches = allSwitches.filter(sw => activeStatuses.has(sw.status));
    const activeSwitchCount = activeSwitches.length;
    const warningSwitchCount = allSwitches.filter(sw => sw.status === 'warning').length;
    const triggeredSwitchCount = allSwitches.filter(sw => sw.status === 'triggered').length;

    // 3. Find next switch (soonest action date among armed/warning)
    let nextSwitch: SwitchRecord | null = null;
    let nextActionDate: Date | null = null;

    for (const sw of activeSwitches) {
      const actionDate = getSwitchActionDate(sw);
      if (!actionDate) continue;
      if (nextActionDate === null || actionDate < nextActionDate) {
        nextActionDate = actionDate;
        nextSwitch = sw;
      }
    }

    // 4. Check notifications configured
    const smtpConfig = await getSmtpConfig(db);
    const telegramConfig = await getTelegramConfig(db);
    const notificationsConfigured = smtpConfig !== null || telegramConfig !== null;

    // 5. Latest packet
    const latestPacketRows = await db
      .select()
      .from(packets)
      .orderBy(desc(packets.createdAt))
      .limit(1);
    const latestPacket = latestPacketRows[0]
      ? {
          id: latestPacketRows[0].id,
          version: latestPacketRows[0].version,
          storageProvider: latestPacketRows[0].storageProvider ?? null,
          storageObjectKey: latestPacketRows[0].storageObjectKey ?? null,
          lastVerifiedAt: latestPacketRows[0].lastVerifiedAt?.toISOString() ?? null,
          createdAt: latestPacketRows[0].createdAt.toISOString(),
        }
      : null;

    // 6. Active release run
    const activeRun = await getActiveReleaseRunFull(db);
    const activeReleaseRun = activeRun
      ? { id: activeRun.id, status: activeRun.status, triggeringSwitchId: activeRun.triggeringSwitchId }
      : null;

    // 7. Recent audit events
    const recentAuditRows = await db
      .select({ eventType: auditEvents.eventType, createdAt: auditEvents.createdAt })
      .from(auditEvents)
      .orderBy(desc(auditEvents.createdAt))
      .limit(5);
    const recentAuditEvents = recentAuditRows.map((r) => ({
      eventType: r.eventType,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));

    // 8. Build health object
    const health: HealthStatus = {
      status: 'ok',
      database: 'ok',
      storage: latestPacket?.storageObjectKey ? 'ok' : 'not_configured',
      notifications: notificationsConfigured ? 'ok' : 'not_configured',
      relay: 'not_configured',
      uptime: process.uptime(),
      version: APP_VERSION,
    };

    const summary: DashboardSummary & {
      latestPacket: typeof latestPacket;
      activeReleaseRun: typeof activeReleaseRun;
      recentAuditEvents: typeof recentAuditEvents;
    } = {
      ownerName,
      activeSwitchCount,
      warningSwitchCount,
      triggeredSwitchCount,
      nextSwitch: nextSwitch ? switchRecordToSwitch(nextSwitch) : null,
      nextActionAt: nextActionDate ? nextActionDate.toISOString() : null,
      notificationsConfigured,
      relayConfigured: false,
      storageConfigured: latestPacket?.storageObjectKey != null,
      health,
      latestPacket,
      activeReleaseRun,
      recentAuditEvents,
    };

    return reply.send(summary);
  });
}
