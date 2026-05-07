CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_encrypted` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`switch_id` integer,
	`event_type` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`switch_id`) REFERENCES `switches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `contact_claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`switch_id` integer NOT NULL,
	`packet_id` integer NOT NULL,
	`contact_id` integer NOT NULL,
	`claim_token` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notified_at` integer,
	`opened_at` integer,
	`verified_at` integer,
	`accepted_at` integer,
	`packet_downloaded_at` integer,
	`key_viewed_at` integer,
	`acknowledged_at` integer,
	`expires_at` integer NOT NULL,
	`escalated_at` integer,
	`failed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`switch_id`) REFERENCES `switches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`packet_id`) REFERENCES `packets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_claims_claim_token_unique` ON `contact_claims` (`claim_token`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`full_name_encrypted` text NOT NULL,
	`relationship_encrypted` text,
	`priority_order` integer NOT NULL,
	`email_encrypted` text NOT NULL,
	`phone_encrypted` text,
	`telegram_handle_encrypted` text,
	`preferred_channels` text DEFAULT '["email"]' NOT NULL,
	`confirmation_window_hours` integer DEFAULT 48 NOT NULL,
	`claim_pin_hash` text,
	`backup_notes_encrypted` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `encryption_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`key_material_encrypted` text NOT NULL,
	`algorithm` text NOT NULL,
	`created_at` integer NOT NULL,
	`rotated_at` integer
);
--> statement-breakpoint
CREATE TABLE `estate_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`institution_name_encrypted` text,
	`account_type_encrypted` text,
	`reference_hint_encrypted` text,
	`asset_description_encrypted` text,
	`location_notes_encrypted` text,
	`executor_notes_encrypted` text,
	`sensitive_flag` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `owner` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`display_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`password_hash` text NOT NULL,
	`totp_secret_encrypted` text,
	`totp_enabled` integer DEFAULT false NOT NULL,
	`setup_complete` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `packets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`switch_id` integer NOT NULL,
	`version` integer NOT NULL,
	`encryption_algorithm` text DEFAULT 'aes-256-gcm' NOT NULL,
	`key_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`encrypted_object_hash` text,
	`storage_provider` text,
	`storage_bucket` text,
	`storage_object_key` text,
	`storage_region` text,
	`deletion_status` text,
	`last_verified_at` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`switch_id`) REFERENCES `switches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `owner`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `switches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`mode` text NOT NULL,
	`deployment_mode` text DEFAULT 'local_only' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`trigger_at` integer,
	`heartbeat_interval_days` integer,
	`next_check_in_due_at` integer,
	`warning_starts_at` integer,
	`grace_period_hours` integer DEFAULT 72 NOT NULL,
	`warning_window_days` integer DEFAULT 3 NOT NULL,
	`last_check_in_at` integer,
	`last_packet_sync_at` integer,
	`selected_contact_ids` text DEFAULT '[]',
	`selected_estate_item_ids` text DEFAULT '[]',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
