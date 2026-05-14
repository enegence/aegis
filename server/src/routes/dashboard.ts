import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { owner } from '../db/schema.js';
import { listSwitches } from '../services/switch-repository.js';
import { getSmtpConfig, getTelegramConfig } from '../services/notifications.js';
import type { SwitchRecord } from '../services/switch-repository.js';
import type { Switch, HealthStatus, DashboardSummary } from '@aegis/shared';

const APP_VERSION = '0.2.0';

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

    // 5. Build health object
    const health: HealthStatus = {
      status: 'ok',
      database: 'ok',
      storage: 'not_configured',
      notifications: notificationsConfigured ? 'ok' : 'not_configured',
      relay: 'not_configured',
      uptime: process.uptime(),
      version: APP_VERSION,
    };

    const summary: DashboardSummary = {
      ownerName,
      activeSwitchCount,
      warningSwitchCount,
      triggeredSwitchCount,
      nextSwitch: nextSwitch ? switchRecordToSwitch(nextSwitch) : null,
      nextActionAt: nextActionDate ? nextActionDate.toISOString() : null,
      notificationsConfigured,
      relayConfigured: false,
      storageConfigured: false,
      health,
    };

    return reply.send(summary);
  });
}
