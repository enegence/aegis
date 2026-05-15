/**
 * Notification delivery service (OSS).
 *
 * Implements:
 *  - Retry/backoff policy (attempt 1–5 with exponential delay; attempt 6+ = permanent failure)
 *  - Failure classification (permanent vs retryable)
 *  - Payload minimization: buildNotificationPayload / assertPayloadMinimized
 *  - notification_deliveries row lifecycle: queued → sending → sent/delivered/failed_*
 *  - Idempotency via contact_notification:<runId>:<contactId>:<channel> key
 *
 * Security invariants:
 *  - Payload MUST NOT contain institution names, account details, asset descriptions,
 *    executor notes, release key material, or other contacts' information.
 *  - Error messages stored in DB are always redacted (no PII).
 */

import { eq, and, lte } from 'drizzle-orm';
import { createHash } from 'crypto';
import { notificationDeliveries } from '../db/schema.js';
import type { AegisDb } from '../db/index.js';
import { checkOrSetIdempotencyKey } from './idempotency-keys.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeliveryStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed_retryable'
  | 'failed_permanent'
  | 'cancelled';

export interface NotificationDeliveryRecord {
  id: string;
  releaseRunId: number | null;
  claimId: number | null;
  contactId: number;
  channel: string;
  provider: string;
  status: DeliveryStatus;
  attemptCount: number;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  providerMessageId: string | null;
  lastErrorCode: string | null;
  lastErrorMessageRedacted: string | null;
  payloadHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDeliveryInput {
  releaseRunId?: number | null;
  claimId?: number | null;
  contactId: number;
  channel: 'email' | 'telegram';
  provider: string;
  payloadHash?: string | null;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string | null;
  errorCode?: string | null;
  errorMessageRedacted?: string | null;
  isPermanentFailure?: boolean;
}

// ─── Retry policy ─────────────────────────────────────────────────────────────

const RETRY_DELAYS_MS: number[] = [
  0,                // attempt 1: immediate
  5 * 60 * 1000,    // attempt 2: 5 minutes
  30 * 60 * 1000,   // attempt 3: 30 minutes
  2 * 60 * 60 * 1000,   // attempt 4: 2 hours
  12 * 60 * 60 * 1000,  // attempt 5: 12 hours
];

/**
 * Returns the delay in milliseconds before the next attempt, or null if max
 * attempts exceeded and the delivery should be marked failed_permanent.
 *
 * attemptCount is the current count BEFORE this attempt (0-indexed):
 *  - attemptCount = 0 → first attempt → 0 ms delay
 *  - attemptCount = 4 → fifth attempt → 12 hours
 *  - attemptCount >= 5 → null (permanent failure)
 */
export function getNextAttemptDelay(attemptCount: number): number | null {
  if (attemptCount >= RETRY_DELAYS_MS.length) return null;
  return RETRY_DELAYS_MS[attemptCount];
}

/**
 * Classify an error code or message as permanent or retryable.
 *
 * Permanent failures: invalid address, blocked, unsubscribed, 4xx non-retryable.
 * Retryable failures: timeouts, rate limits, 5xx, network errors.
 */
export function classifyFailure(errorCode: string | null | undefined): 'permanent' | 'retryable' {
  if (!errorCode) return 'retryable';

  const code = errorCode.toLowerCase();

  // Postmark / email permanent codes
  const permanentPatterns = [
    'invalid_email',
    'invalid_address',
    'hard_bounce',
    'unsubscribe',
    'spam_complaint',
    'blocked',
    'bad_emailaddress',
    '400',
    '401',
    '403',
    '406',
    '422',
    'invalid_token',
    'inactive_recipient',
    'no_credentials',
    // Telegram permanent
    'invalid_telegram_chat',
    'chat_not_found',
    'user_deactivated',
    'bot_blocked_by_user',
  ];

  for (const p of permanentPatterns) {
    if (code.includes(p)) return 'permanent';
  }

  return 'retryable';
}

// ─── Payload hash ─────────────────────────────────────────────────────────────

export function hashPayload(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

// ─── Payload minimization ─────────────────────────────────────────────────────

export interface NotificationPayloadInput {
  ownerDisplayName: string;
  claimUrl: string;
  claimExpiresAt: Date;
}

/**
 * Build a minimized notification payload for a contact claim notification.
 *
 * Includes: owner display name, high-level message, claim link, expiry, support instructions.
 * MUST NOT include: institution names, account details, asset descriptions, executor notes,
 * release key material, other contacts' info.
 */
export function buildNotificationPayload(input: NotificationPayloadInput): {
  subject: string;
  textBody: string;
  htmlBody: string;
} {
  const { ownerDisplayName, claimUrl, claimExpiresAt } = input;
  const expiryStr = claimExpiresAt.toISOString();

  const subject = `Important: ${ownerDisplayName} has designated you as a trusted contact`;

  const textBody = [
    `You have been listed as a contact in ${ownerDisplayName}'s Aegis estate plan.`,
    ``,
    `Please visit the following secure link to claim your information:`,
    ``,
    claimUrl,
    ``,
    `This link expires at: ${expiryStr}`,
    ``,
    `If you were not expecting this message, you may safely ignore it.`,
    ``,
    `For support, visit: https://aegisdms.life/support`,
  ].join('\n');

  const htmlBody = `
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="color: #0B1C2C;">You have a pending claim from ${ownerDisplayName}</h2>
      <p style="color: #4A6B8A;">
        You have been listed as a contact in <strong>${ownerDisplayName}</strong>'s Aegis estate plan.
      </p>
      <p style="color: #4A6B8A;">
        Please visit the following link to claim your information:
      </p>
      <a href="${claimUrl}"
         style="display: inline-block; background: #0B1C2C; color: #DDE8F4; padding: 12px 24px;
                text-decoration: none; border-radius: 4px; margin: 20px 0;">
        Claim your information
      </a>
      <p style="color: #8AAAC8; font-size: 12px;">This link expires at ${expiryStr}.</p>
      <p style="color: #8AAAC8; font-size: 12px;">
        If you were not expecting this, you may safely ignore this message.<br>
        For support: <a href="https://aegisdms.life/support">aegisdms.life/support</a>
      </p>
    </div>
  `;

  return { subject, textBody, htmlBody };
}

/**
 * Validates that a payload does not contain sensitive estate details.
 * Throws if any forbidden pattern is detected.
 *
 * Forbidden content:
 *  - institutionName / institutionNameEncrypted
 *  - accountType / accountTypeEncrypted
 *  - referenceHint / referenceHintEncrypted
 *  - assetDescription
 *  - locationNotes
 *  - executorNotes
 *  - release key material (base64 key-like strings)
 *
 * Note: this function checks structural field names, not encrypted blobs.
 * It is primarily a defence-in-depth check for plaintext templates.
 */
export function assertPayloadMinimized(payload: string): void {
  const forbidden = [
    'institutionName',
    'institution_name',
    'accountType',
    'account_type',
    'referenceHint',
    'reference_hint',
    'assetDescription',
    'asset_description',
    'locationNotes',
    'location_notes',
    'executorNotes',
    'executor_notes',
    'backupNotes',
    'backup_notes',
    'release_key',
    'releaseKey',
    'keyMaterial',
    'key_material',
  ];

  for (const term of forbidden) {
    if (payload.includes(term)) {
      throw new Error(
        `assertPayloadMinimized: payload contains forbidden field reference '${term}'`,
      );
    }
  }
}

// ─── Delivery lifecycle ───────────────────────────────────────────────────────

/**
 * Create a notification_deliveries row with status=queued.
 */
export async function createDelivery(
  db: AegisDb,
  input: CreateDeliveryInput,
): Promise<NotificationDeliveryRecord> {
  const rows = await db
    .insert(notificationDeliveries)
    .values({
      releaseRunId: input.releaseRunId ?? null,
      claimId: input.claimId ?? null,
      contactId: input.contactId,
      channel: input.channel,
      provider: input.provider,
      status: 'queued',
      payloadHash: input.payloadHash ?? null,
    })
    .returning();

  return rows[0] as unknown as NotificationDeliveryRecord;
}

/**
 * Attempt to send a notification, updating the delivery row based on outcome.
 *
 * - Checks idempotency key before sending (prevents duplicate sends on worker retry)
 * - Updates delivery to 'sending' before the attempt
 * - On success: 'sent' + providerMessageId
 * - On retryable failure: 'failed_retryable' + schedules nextAttemptAt
 * - On permanent failure or max attempts: 'failed_permanent'
 */
export async function attemptDelivery(
  db: AegisDb,
  deliveryId: string,
  sendFn: () => Promise<SendResult>,
): Promise<void> {
  // Load current delivery record
  const rows = await db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.id, deliveryId));

  if (rows.length === 0) {
    throw new Error(`Delivery record ${deliveryId} not found`);
  }

  const delivery = rows[0];

  // Skip if already in a terminal state
  if (['sent', 'delivered', 'failed_permanent', 'cancelled'].includes(delivery.status)) {
    return;
  }

  // Check idempotency key to prevent duplicate sends
  const idemKey = `notification_delivery:${deliveryId}:attempt:${delivery.attemptCount + 1}`;
  const idem = await checkOrSetIdempotencyKey(db, idemKey, 'notification_delivery', {
    ttlMs: 24 * 60 * 60 * 1000, // 24h TTL
  });

  if (idem.found) {
    // This exact attempt already ran — skip silently
    return;
  }

  const now = new Date();
  const nextAttemptCount = delivery.attemptCount + 1;

  // Mark as sending
  await db
    .update(notificationDeliveries)
    .set({
      status: 'sending',
      attemptCount: nextAttemptCount,
      lastAttemptAt: now,
      updatedAt: now,
    })
    .where(eq(notificationDeliveries.id, deliveryId));

  let result: SendResult;
  try {
    result = await sendFn();
  } catch (err) {
    // Unexpected throw — treat as retryable
    result = {
      ok: false,
      errorCode: 'unexpected_error',
      errorMessageRedacted: 'unexpected_error',
      isPermanentFailure: false,
    };
  }

  const updateNow = new Date();

  if (result.ok) {
    await db
      .update(notificationDeliveries)
      .set({
        status: 'sent',
        providerMessageId: result.providerMessageId ?? null,
        lastErrorCode: null,
        lastErrorMessageRedacted: null,
        updatedAt: updateNow,
      })
      .where(eq(notificationDeliveries.id, deliveryId));
    return;
  }

  // Failure path
  const isPermanent =
    result.isPermanentFailure ??
    classifyFailure(result.errorCode) === 'permanent';

  if (isPermanent) {
    await db
      .update(notificationDeliveries)
      .set({
        status: 'failed_permanent',
        lastErrorCode: result.errorCode ?? null,
        lastErrorMessageRedacted: result.errorMessageRedacted ?? null,
        updatedAt: updateNow,
      })
      .where(eq(notificationDeliveries.id, deliveryId));
    return;
  }

  // Retryable — check if max attempts exceeded
  const delayMs = getNextAttemptDelay(nextAttemptCount);
  if (delayMs === null) {
    await db
      .update(notificationDeliveries)
      .set({
        status: 'failed_permanent',
        lastErrorCode: result.errorCode ?? 'max_attempts_exceeded',
        lastErrorMessageRedacted: 'max_attempts_exceeded',
        updatedAt: updateNow,
      })
      .where(eq(notificationDeliveries.id, deliveryId));
    return;
  }

  const nextAttemptAt = new Date(updateNow.getTime() + delayMs);
  await db
    .update(notificationDeliveries)
    .set({
      status: 'failed_retryable',
      nextAttemptAt,
      lastErrorCode: result.errorCode ?? null,
      lastErrorMessageRedacted: result.errorMessageRedacted ?? null,
      updatedAt: updateNow,
    })
    .where(eq(notificationDeliveries.id, deliveryId));
}

/**
 * Find all failed_retryable deliveries that are past their nextAttemptAt time.
 * Used by the worker to recover and retry failed deliveries.
 */
export async function findRetryableDeliveries(
  db: AegisDb,
  now: Date = new Date(),
): Promise<NotificationDeliveryRecord[]> {
  const rows = await db
    .select()
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.status, 'failed_retryable'),
        lte(notificationDeliveries.nextAttemptAt as any, now),
      ),
    );

  return rows as unknown as NotificationDeliveryRecord[];
}

/**
 * Find all queued deliveries ready to send.
 */
export async function findQueuedDeliveries(
  db: AegisDb,
): Promise<NotificationDeliveryRecord[]> {
  const rows = await db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.status, 'queued'));

  return rows as unknown as NotificationDeliveryRecord[];
}
