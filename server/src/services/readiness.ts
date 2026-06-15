import { eq } from 'drizzle-orm';
import { appSettings, owner } from '../db/schema.js';
import type { AegisDb } from '../db/index.js';
import type { ReadinessCheck, SwitchReadiness } from '@aegis/shared';
import type { SwitchRecord } from './switch-repository.js';

// ─── Individual check helpers ─────────────────────────────────────────────────

async function checkOwnerSetupComplete(db: AegisDb): Promise<ReadinessCheck> {
  const rows = await db.select({ setupComplete: owner.setupComplete }).from(owner);
  const isComplete = rows.length > 0 && rows[0].setupComplete === true;
  return {
    id: 'owner_setup_complete',
    label: 'Owner setup complete',
    status: isComplete ? 'ready' : 'not_ready',
    required: true,
    message: isComplete
      ? 'Owner account is configured.'
      : 'Owner setup has not been completed.',
    resolutionHint: isComplete
      ? undefined
      : 'Complete the initial setup wizard to configure your account.',
  };
}

function checkAtLeastOneContactSelected(sw: SwitchRecord): ReadinessCheck {
  const hasContacts = sw.selectedContactIds.length > 0;
  return {
    id: 'at_least_one_contact_selected',
    label: 'At least one contact selected',
    status: hasContacts ? 'ready' : 'not_ready',
    required: true,
    message: hasContacts
      ? `${sw.selectedContactIds.length} contact(s) selected.`
      : 'No contacts have been selected for this switch.',
    resolutionHint: hasContacts
      ? undefined
      : 'Add at least one trusted contact and assign them to this switch.',
  };
}

function checkSwitchScheduleValid(sw: SwitchRecord): ReadinessCheck {
  const now = new Date();

  if (sw.mode === 'trip') {
    if (!sw.triggerAt) {
      return {
        id: 'switch_schedule_valid',
        label: 'Switch schedule valid',
        status: 'not_ready',
        required: true,
        message: 'Trip switch has no trigger date set.',
        resolutionHint: 'Set a future trigger date for this trip switch.',
      };
    }
    if (sw.triggerAt <= now) {
      return {
        id: 'switch_schedule_valid',
        label: 'Switch schedule valid',
        status: 'not_ready',
        required: true,
        message: 'Trip switch trigger date is in the past.',
        resolutionHint: 'Update the trigger date to a future date.',
      };
    }
    return {
      id: 'switch_schedule_valid',
      label: 'Switch schedule valid',
      status: 'ready',
      required: true,
      message: `Trigger scheduled for ${sw.triggerAt.toISOString()}.`,
    };
  }

  // heartbeat mode
  const intervalDays = sw.heartbeatIntervalDays;
  if (intervalDays == null || intervalDays < 1) {
    return {
      id: 'switch_schedule_valid',
      label: 'Switch schedule valid',
      status: 'not_ready',
      required: true,
      message: 'Heartbeat switch has no valid interval set (must be >= 1 day).',
      resolutionHint: 'Set a heartbeat interval of at least 1 day.',
    };
  }

  return {
    id: 'switch_schedule_valid',
    label: 'Switch schedule valid',
    status: 'ready',
    required: true,
    message: `Heartbeat interval is ${intervalDays} day(s).`,
  };
}

async function checkNotificationProviderConfigured(db: AegisDb): Promise<ReadinessCheck> {
  // Check for SMTP host setting OR Telegram chatId setting
  const smtpRow = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, 'smtp.host'));

  const telegramRow = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, 'telegram.chatId'));

  const hasSmtp = smtpRow.length > 0 && smtpRow[0].value != null && smtpRow[0].value !== '';
  const hasTelegram =
    telegramRow.length > 0 && telegramRow[0].value != null && telegramRow[0].value !== '';

  const configured = hasSmtp || hasTelegram;

  return {
    id: 'notification_provider_configured',
    label: 'Notification provider configured',
    status: configured ? 'ready' : 'warning',
    required: false,
    message: configured
      ? 'At least one notification provider is configured.'
      : 'No notification provider (SMTP or Telegram) is configured.',
    resolutionHint: configured
      ? undefined
      : 'Configure SMTP or Telegram settings so contacts can be notified when the switch triggers.',
  };
}

async function checkModeLimitationsAcknowledged(
  db: AegisDb,
  sw: SwitchRecord,
): Promise<ReadinessCheck> {
  if (sw.deploymentMode !== 'vault') {
    return {
      id: 'mode_limitations_acknowledged',
      label: 'Mode limitations acknowledged',
      status: 'ready',
      required: false,
      message: `Deployment mode is '${sw.deploymentMode}'.`,
    };
  }

  const ackRow = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, 'ack:vault_mode_limitations'));

  const acknowledged =
    ackRow.length > 0 && ackRow[0].value != null && ackRow[0].value !== '';

  return {
    id: 'mode_limitations_acknowledged',
    label: 'Mode limitations acknowledged',
    status: acknowledged ? 'ready' : 'warning',
    required: false,
    message: acknowledged
      ? 'Vault mode limitations have been acknowledged.'
      : 'Vault mode limitations have not been acknowledged.',
    resolutionHint: acknowledged
      ? undefined
      : 'Review and acknowledge the limitations of vault mode (no remote storage, no relay monitoring).',
  };
}

function checkStorageConfiguredForDeadDrop(sw: SwitchRecord): ReadinessCheck {
  if (sw.deploymentMode === 'dead_drop') {
    return {
      id: 'storage_configured_for_dead_drop',
      label: 'Storage configured for Packet Mirror',
      status: 'not_ready',
      required: true,
      message: 'Packet Mirror mode requires external S3-compatible storage configuration.',
      resolutionHint: 'Configure storage in Settings or switch to vault mode.',
    };
  }

  return {
    id: 'storage_configured_for_dead_drop',
    label: 'Storage configured for Packet Mirror',
    status: 'ready',
    required: false,
    message: `Deployment mode is '${sw.deploymentMode}' — no external storage required.`,
  };
}

function checkPacketGenerationPlaceholder(): ReadinessCheck {
  return {
    id: 'packet_generation_placeholder',
    label: 'Packet generation',
    status: 'warning',
    required: false,
    message: 'Automated packet generation is not yet available (Phase 3).',
    resolutionHint: 'Packet generation will be available in Phase 3. You can still arm the switch manually.',
  };
}

function checkClaimPortalReachableOrAcknowledged(): ReadinessCheck {
  return {
    id: 'claim_portal_reachable_or_acknowledged',
    label: 'Claim portal reachable or acknowledged',
    status: 'warning',
    required: false,
    message: 'The claim portal is not yet available (Phase 3).',
    resolutionHint: 'The claim portal will be available in Phase 3. Contacts will need it to receive their packets.',
  };
}

// ─── Aggregate readiness check ─────────────────────────────────────────────────

export async function checkSwitchReadiness(
  db: AegisDb,
  sw: SwitchRecord,
): Promise<SwitchReadiness> {
  const checks: ReadinessCheck[] = await Promise.all([
    checkOwnerSetupComplete(db),
    Promise.resolve(checkAtLeastOneContactSelected(sw)),
    Promise.resolve(checkSwitchScheduleValid(sw)),
    checkNotificationProviderConfigured(db),
    checkModeLimitationsAcknowledged(db, sw),
    Promise.resolve(checkStorageConfiguredForDeadDrop(sw)),
    Promise.resolve(checkPacketGenerationPlaceholder()),
    Promise.resolve(checkClaimPortalReachableOrAcknowledged()),
  ]);

  // Determine overall status
  const hasNotReady = checks.some((c: ReadinessCheck) => c.required && c.status === 'not_ready');
  const hasWarning = checks.some((c: ReadinessCheck) => c.status === 'warning');

  let status: 'ready' | 'not_ready' | 'warning';
  if (hasNotReady) {
    status = 'not_ready';
  } else if (hasWarning) {
    status = 'warning';
  } else {
    status = 'ready';
  }

  return {
    switchId: sw.id,
    status,
    checks,
  };
}

// ─── Arming gate ───────────────────────────────────────────────────────────────

export async function assertReadyToArm(db: AegisDb, sw: SwitchRecord): Promise<void> {
  const readiness = await checkSwitchReadiness(db, sw);

  if (readiness.status === 'not_ready') {
    const failedChecks = readiness.checks
      .filter(c => c.required && c.status === 'not_ready')
      .map(c => `[${c.id}] ${c.message}`)
      .join('; ');

    throw new Error(
      `Switch is not ready to arm. Failed required checks: ${failedChecks}`,
    );
  }
}
