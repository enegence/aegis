-- Phase 5 Task 3: notification_deliveries table for delivery tracking, retry, and backoff.
-- Status values: queued | sending | sent | delivered | failed_retryable | failed_permanent | cancelled
-- payloadHash allows detecting content changes without storing the payload itself.

CREATE TABLE IF NOT EXISTS `notification_deliveries` (
  `id`                         text PRIMARY KEY NOT NULL,
  `release_run_id`             integer REFERENCES `release_runs`(`id`) ON DELETE cascade,
  `claim_id`                   integer,
  `contact_id`                 integer NOT NULL,
  `channel`                    text NOT NULL,
  `provider`                   text NOT NULL,
  `status`                     text NOT NULL DEFAULT 'queued',
  `attempt_count`              integer NOT NULL DEFAULT 0,
  `last_attempt_at`            integer,
  `next_attempt_at`            integer,
  `provider_message_id`        text,
  `last_error_code`            text,
  `last_error_message_redacted` text,
  `payload_hash`               text,
  `created_at`                 integer NOT NULL DEFAULT (unixepoch()),
  `updated_at`                 integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notification_deliveries_release_run_id_idx`
  ON `notification_deliveries`(`release_run_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notification_deliveries_status_next_attempt_idx`
  ON `notification_deliveries`(`status`, `next_attempt_at`);
