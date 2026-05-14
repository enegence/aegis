import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const owner = sqliteTable('owner', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  displayName: text('display_name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  timezone: text('timezone').notNull().default('UTC'),
  passwordHash: text('password_hash').notNull(),
  totpSecretEncrypted: text('totp_secret_encrypted'),
  totpEnabled: integer('totp_enabled', { mode: 'boolean' }).notNull().default(false),
  setupComplete: integer('setup_complete', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  ownerId: integer('owner_id').notNull().references(() => owner.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const estateItems = sqliteTable('estate_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  category: text('category').notNull(),
  title: text('title').notNull(),
  institutionNameEncrypted: text('institution_name_encrypted'),
  accountTypeEncrypted: text('account_type_encrypted'),
  referenceHintEncrypted: text('reference_hint_encrypted'),
  assetDescriptionEncrypted: text('asset_description_encrypted'),
  locationNotesEncrypted: text('location_notes_encrypted'),
  executorNotesEncrypted: text('executor_notes_encrypted'),
  sensitiveFlag: integer('sensitive_flag', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fullNameEncrypted: text('full_name_encrypted').notNull(),
  relationshipEncrypted: text('relationship_encrypted'),
  priorityOrder: integer('priority_order').notNull(),
  emailEncrypted: text('email_encrypted').notNull(),
  phoneEncrypted: text('phone_encrypted'),
  telegramHandleEncrypted: text('telegram_handle_encrypted'),
  preferredChannels: text('preferred_channels').notNull().default('["email"]'),
  confirmationWindowHours: integer('confirmation_window_hours').notNull().default(48),
  claimPinHash: text('claim_pin_hash'),
  backupNotesEncrypted: text('backup_notes_encrypted'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const switches = sqliteTable('switches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  mode: text('mode').notNull(),
  deploymentMode: text('deployment_mode').notNull().default('vault'),
  status: text('status').notNull().default('draft'),
  triggerAt: integer('trigger_at', { mode: 'timestamp' }),
  heartbeatIntervalDays: integer('heartbeat_interval_days'),
  nextCheckInDueAt: integer('next_check_in_due_at', { mode: 'timestamp' }),
  warningStartsAt: integer('warning_starts_at', { mode: 'timestamp' }),
  gracePeriodHours: integer('grace_period_hours').notNull().default(72),
  warningWindowDays: integer('warning_window_days').notNull().default(3),
  lastCheckInAt: integer('last_check_in_at', { mode: 'timestamp' }),
  lastPacketSyncAt: integer('last_packet_sync_at', { mode: 'timestamp' }),
  lastReminderSentAt: integer('last_reminder_sent_at', { mode: 'timestamp' }),
  lastWarningSentAt: integer('last_warning_sent_at', { mode: 'timestamp' }),
  lastEvaluatedAt: integer('last_evaluated_at', { mode: 'timestamp' }),
  selectedContactIds: text('selected_contact_ids').default('[]'),
  selectedEstateItemIds: text('selected_estate_item_ids').default('[]'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// releaseRuns defined before packets to avoid forward-reference issues.
// activePacketId / currentContactClaimId are plain integers (no FK) to break
// the circular reference with packets / contact_claims.
export const releaseRuns = sqliteTable('release_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  triggeringSwitchId: integer('triggering_switch_id').notNull().references(() => switches.id, { onDelete: 'no action' }),
  status: text('status').notNull().default('active'), // active | cascade_active | completed | cancelled | failed
  activePacketId: integer('active_packet_id'),         // no FK — circular ref broken at app layer
  currentContactClaimId: integer('current_contact_claim_id'), // no FK — circular ref
  suppressedSwitchIds: text('suppressed_switch_ids').notNull().default('[]'), // JSON int[]
  metadata: text('metadata').notNull().default('{}'),  // JSON, redacted only — no PII
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  cancelledAt: integer('cancelled_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const packets = sqliteTable('packets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  switchId: integer('switch_id').notNull().references(() => switches.id, { onDelete: 'cascade' }),
  releaseRunId: integer('release_run_id').references(() => releaseRuns.id, { onDelete: 'set null' }),
  version: integer('version').notNull(),
  schemaVersion: text('schema_version').notNull().default('1.0'),
  encryptionAlgorithm: text('encryption_algorithm').notNull().default('aes-256-gcm'),
  keyId: text('key_id').notNull(),
  contentHash: text('content_hash').notNull(),
  encryptedObjectHash: text('encrypted_object_hash'),
  localCiphertextPath: text('local_ciphertext_path'),
  storageProvider: text('storage_provider'),
  storageBucket: text('storage_bucket'),
  storageObjectKey: text('storage_object_key'),
  storageRegion: text('storage_region'),
  storageVersionId: text('storage_version_id'),
  deletionStatus: text('deletion_status'),
  lastVerifiedAt: integer('last_verified_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// claimTokenHash stores SHA-256(claimToken). The raw token only travels in
// outbound notification URLs and is never persisted after claim creation.
export const contactClaims = sqliteTable('contact_claims', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  releaseRunId: integer('release_run_id').notNull().references(() => releaseRuns.id),
  switchId: integer('switch_id').notNull().references(() => switches.id),
  packetId: integer('packet_id').notNull().references(() => packets.id),
  contactId: integer('contact_id').notNull().references(() => contacts.id),
  claimTokenHash: text('claim_token_hash').notNull().unique(),
  status: text('status').notNull().default('pending'),
  notifiedAt: integer('notified_at', { mode: 'timestamp' }),
  openedAt: integer('opened_at', { mode: 'timestamp' }),
  verifiedAt: integer('verified_at', { mode: 'timestamp' }),
  acceptedAt: integer('accepted_at', { mode: 'timestamp' }),
  packetDownloadedAt: integer('packet_downloaded_at', { mode: 'timestamp' }),
  keyViewedAt: integer('key_viewed_at', { mode: 'timestamp' }),
  acknowledgedAt: integer('acknowledged_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  escalatedAt: integer('escalated_at', { mode: 'timestamp' }),
  failedAt: integer('failed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const auditEvents = sqliteTable('audit_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  switchId: integer('switch_id').references(() => switches.id),
  eventType: text('event_type').notNull(),
  actorType: text('actor_type').notNull(),
  actorId: text('actor_id'),
  metadata: text('metadata'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Key-value settings store.
// S3 storage keys: s3_endpoint, s3_region, s3_bucket, s3_prefix,
//   s3_access_key_id_encrypted, s3_secret_access_key_encrypted,
//   s3_force_path_style, packet_retention_days
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  encrypted: integer('encrypted', { mode: 'boolean' }).notNull().default(false),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const notificationEvents = sqliteTable('notification_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  switchId: integer('switch_id').references(() => switches.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  channel: text('channel').notNull(),
  purpose: text('purpose').notNull(),
  status: text('status').notNull(),
  externalId: text('external_id'),
  failureReason: text('failure_reason'),
  sentAt: integer('sent_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const encryptionKeys = sqliteTable('encryption_keys', {
  id: text('id').primaryKey(),
  purpose: text('purpose').notNull(),
  keyMaterialEncrypted: text('key_material_encrypted').notNull(),
  algorithm: text('algorithm').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  rotatedAt: integer('rotated_at', { mode: 'timestamp' }),
});

export const localAcknowledgements = sqliteTable('local_acknowledgements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerId: integer('owner_id').notNull().references(() => owner.id, { onDelete: 'cascade' }),
  contextType: text('context_type').notNull(), // 'relay_escrow' | 'hosted' | 'deployment_mode'
  contextId: text('context_id').notNull(),     // e.g. switch ID or mode name
  version: text('version').notNull(),          // terms/policy version string
  acknowledgedAt: integer('acknowledged_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});
