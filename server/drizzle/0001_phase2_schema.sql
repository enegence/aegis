-- Phase 2 schema migration

-- Add new columns to switches table
ALTER TABLE `switches` ADD COLUMN `last_reminder_sent_at` integer;--> statement-breakpoint
ALTER TABLE `switches` ADD COLUMN `last_warning_sent_at` integer;--> statement-breakpoint
ALTER TABLE `switches` ADD COLUMN `last_evaluated_at` integer;--> statement-breakpoint

-- Recreate app_settings with updated schema (SQLite can't ALTER column types)
DROP TABLE `app_settings`;--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`encrypted` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint

-- Create notification_events table
CREATE TABLE `notification_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`switch_id` integer,
	`contact_id` integer,
	`channel` text NOT NULL,
	`purpose` text NOT NULL,
	`status` text NOT NULL,
	`external_id` text,
	`failure_reason` text,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`switch_id`) REFERENCES `switches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint

-- Create release_runs table
CREATE TABLE `release_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`switch_id` integer NOT NULL,
	`status` text DEFAULT 'active_pending_packet' NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`cancelled_at` integer,
	FOREIGN KEY (`switch_id`) REFERENCES `switches`(`id`) ON UPDATE no action ON DELETE no action
);
