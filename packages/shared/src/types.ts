export type PacketStatus = 'draft' | 'generated' | 'uploaded' | 'verified' | 'deleted' | 'failed';
export type StorageProvider = 's3';
export type ReleaseRunStatus = 'active' | 'cascade_active' | 'completed' | 'cancelled' | 'failed';

export type SwitchMode = 'trip' | 'heartbeat';
export type DeploymentMode = 'vault' | 'dead_drop' | 'relay_monitoring' | 'relay_escrow' | 'hosted';
export type ReadinessStatus = 'ready' | 'not_ready' | 'warning';
export type SwitchStatus =
  | 'draft' | 'armed' | 'warning' | 'triggered'
  | 'cascade_active' | 'completed' | 'cancelled' | 'paused' | 'failed';

export type ClaimStatus =
  | 'pending' | 'notified' | 'opened' | 'verified' | 'accepted'
  | 'packet_downloaded' | 'key_viewed' | 'acknowledged'
  | 'expired' | 'escalated' | 'failed';

export type EstateCategory =
  | 'Financial' | 'Real Estate' | 'Digital Assets'
  | 'Vehicles' | 'Insurance' | 'Documents' | 'Instructions';

export type NotificationChannel = 'email' | 'sms' | 'telegram';

export type AuditEventType =
  | 'setup_completed' | 'switch_armed' | 'switch_paused' | 'switch_cancelled'
  | 'check_in_completed' | 'reminder_sent' | 'reminder_failed'
  | 'packet_generated' | 'packet_uploaded' | 'packet_deleted'
  | 'trigger_reached' | 'contact_notified' | 'contact_opened_claim'
  | 'contact_verified' | 'contact_accepted' | 'packet_downloaded'
  | 'key_viewed' | 'claim_acknowledged' | 'contact_escalated'
  | 'cascade_completed' | 'relay_heartbeat_sent' | 'relay_offline_warning'
  | 'warning_started' | 'release_run_created' | 'trigger_suppressed_by_active_release_run'
  | 'notification_sent' | 'notification_failed';

export interface EstateItem {
  id: number;
  category: EstateCategory;
  title: string;
  institutionName: string | null;
  accountType: string | null;
  referenceHint: string | null;
  assetDescription: string | null;
  locationNotes: string | null;
  executorNotes: string | null;
  sensitiveFlag: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: number;
  fullName: string;
  relationship: string | null;
  priorityOrder: number;
  email: string;
  phone: string | null;
  telegramHandle: string | null;
  preferredChannels: NotificationChannel[];
  confirmationWindowHours: number;
  backupNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Switch {
  id: number;
  name: string;
  mode: SwitchMode;
  deploymentMode: DeploymentMode;
  status: SwitchStatus;
  triggerAt: string | null;
  heartbeatIntervalDays: number | null;
  nextCheckInDueAt: string | null;
  warningStartsAt: string | null;
  gracePeriodHours: number;
  warningWindowDays: number;
  lastCheckInAt: string | null;
  lastPacketSyncAt: string | null;
  lastReminderSentAt: string | null;
  lastWarningSentAt: string | null;
  lastEvaluatedAt: string | null;
  selectedContactIds: number[];
  selectedEstateItemIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: number;
  switchId: number | null;
  eventType: AuditEventType;
  actorType: 'owner' | 'system' | 'contact' | 'relay';
  actorId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  database: 'ok' | 'error';
  storage: 'ok' | 'error' | 'not_configured';
  notifications: 'ok' | 'error' | 'not_configured';
  relay: 'ok' | 'error' | 'not_configured';
  uptime: number;
  version: string;
}

export interface ReadinessCheck {
  id: string;
  label: string;
  status: ReadinessStatus;
  required: boolean;
  message: string;
  resolutionHint?: string;
}

export interface SwitchReadiness {
  switchId?: number;
  status: ReadinessStatus;
  checks: ReadinessCheck[];
}

export interface DashboardSummary {
  ownerName: string;
  activeSwitchCount: number;
  warningSwitchCount: number;
  triggeredSwitchCount: number;
  nextSwitch: Switch | null;
  nextActionAt: string | null;
  notificationsConfigured: boolean;
  relayConfigured: boolean;
  storageConfigured: boolean;
  health: HealthStatus;
}

export interface PacketSummary {
  id: number;
  switchId: number;
  releaseRunId: number | null;
  version: number;
  schemaVersion: string;
  contentHash: string;
  encryptedObjectHash: string | null;
  storageProvider: StorageProvider | null;
  storageBucket: string | null;
  storageObjectKey: string | null;
  lastVerifiedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ReleaseRunSummary {
  id: number;
  triggeringSwitchId: number;
  status: ReleaseRunStatus;
  activePacketId: number | null;
  currentContactClaimId: number | null;
  suppressedSwitchIds: number[];
  startedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface ClaimPublicSummary {
  status: ClaimStatus;
  ownerDisplayName: string;
  contactDisplayName: string | null;
  switchName: string;
  expiresAt: string;
  acceptedAt: string | null;
  packetDownloadedAt: string | null;
  keyViewedAt: string | null;
  acknowledgedAt: string | null;
}
