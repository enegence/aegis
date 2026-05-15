-- Phase 5 Task 5: worker_heartbeats table for operational health monitoring.
-- Single-row upsert table (id = 'singleton').
-- lastErrorRedacted stores only error type/code — no stack traces, no user data.

CREATE TABLE IF NOT EXISTS `worker_heartbeats` (
  `id`                   text PRIMARY KEY NOT NULL DEFAULT 'singleton',
  `last_tick_at`         integer,
  `last_success_at`      integer,
  `last_error_at`        integer,
  `last_error_redacted`  text,
  `tick_duration_ms`     integer
);
