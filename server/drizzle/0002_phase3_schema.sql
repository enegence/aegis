-- Phase 3: Packets, Dead Drop, Release Runs, Contact Claims, Local Acknowledgements
-- release_runs and contact_claims are recreated with new schema.
-- packets gets new columns via ALTER TABLE ADD COLUMN.

-- 1. Drop old contact_claims first (references packets and release_runs)
DROP TABLE IF EXISTS `contact_claims`;--> statement-breakpoint

-- 2. Drop old release_runs
DROP TABLE IF EXISTS `release_runs`;--> statement-breakpoint

-- 3. Add new columns to packets
ALTER TABLE `packets` ADD COLUMN `release_run_id` integer REFERENCES `release_runs`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `packets` ADD COLUMN `schema_version` text NOT NULL DEFAULT '1.0';--> statement-breakpoint
ALTER TABLE `packets` ADD COLUMN `local_ciphertext_path` text;--> statement-breakpoint
ALTER TABLE `packets` ADD COLUMN `storage_version_id` text;--> statement-breakpoint

-- 4. Recreate release_runs with full Phase 3 schema
CREATE TABLE `release_runs` (
  `id`                       integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `triggering_switch_id`     integer NOT NULL,
  `status`                   text NOT NULL DEFAULT 'active',
  `active_packet_id`         integer,
  `current_contact_claim_id` integer,
  `suppressed_switch_ids`    text NOT NULL DEFAULT '[]',
  `metadata`                 text NOT NULL DEFAULT '{}',
  `started_at`               integer NOT NULL DEFAULT (unixepoch()),
  `completed_at`             integer,
  `cancelled_at`             integer,
  `created_at`               integer NOT NULL DEFAULT (unixepoch()),
  `updated_at`               integer NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (`triggering_switch_id`) REFERENCES `switches`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint

-- 5. Recreate contact_claims with claimTokenHash and releaseRunId
CREATE TABLE `contact_claims` (
  `id`                   integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `release_run_id`       integer NOT NULL,
  `switch_id`            integer NOT NULL,
  `packet_id`            integer NOT NULL,
  `contact_id`           integer NOT NULL,
  `claim_token_hash`     text NOT NULL UNIQUE,
  `status`               text NOT NULL DEFAULT 'pending',
  `notified_at`          integer,
  `opened_at`            integer,
  `verified_at`          integer,
  `accepted_at`          integer,
  `packet_downloaded_at` integer,
  `key_viewed_at`        integer,
  `acknowledged_at`      integer,
  `expires_at`           integer NOT NULL,
  `escalated_at`         integer,
  `failed_at`            integer,
  `created_at`           integer NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (`release_run_id`) REFERENCES `release_runs`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`switch_id`) REFERENCES `switches`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`packet_id`) REFERENCES `packets`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint

-- 6. Create local_acknowledgements
CREATE TABLE IF NOT EXISTS `local_acknowledgements` (
  `id`              integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner_id`        integer NOT NULL,
  `context_type`    text NOT NULL,
  `context_id`      text NOT NULL,
  `version`         text NOT NULL,
  `acknowledged_at` integer NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (`owner_id`) REFERENCES `owner`(`id`) ON UPDATE no action ON DELETE cascade
);
