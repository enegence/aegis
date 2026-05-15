-- Phase 5 Task 2: idempotency_keys table for release-run deduplication.
-- Keys are scoped to prevent cross-domain collisions.
-- expiresAt is optional; expired keys should be cleaned up by a periodic job.

CREATE TABLE IF NOT EXISTS `idempotency_keys` (
  `key`         text PRIMARY KEY NOT NULL,
  `scope`       text NOT NULL,
  `result_json` text,
  `created_at`  integer NOT NULL DEFAULT (unixepoch()),
  `expires_at`  integer
);