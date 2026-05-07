export type SwitchMode = 'trip' | 'heartbeat';
export type DeploymentMode = 'local_only' | 'dead_drop' | 'relay';
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
  | 'cascade_completed' | 'relay_heartbeat_sent' | 'relay_offline_warning';

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
