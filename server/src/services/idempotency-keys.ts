/**
 * Idempotency key service for release-run deduplication.
 *
 * Keys are scoped to prevent cross-domain collisions.
 * Expired keys are treated as absent (caller should set new key).
 *
 * Usage:
 *   const result = await checkOrSetIdempotencyKey(db, {
 *     key: `packet_generation:${switchId}:${version}`,
 *     scope: 'packet_generation',
 *     ttlMs: 7 * 24 * 60 * 60 * 1000,
 *   });
 *   if (result.found) { return result.result; }
 *   // ... do work ...
 *   await setIdempotencyKeyResult(db, key, result);
 */

import { eq, and, lt } from 'drizzle-orm';
import { idempotencyKeys } from '../db/schema.js';
import type { AegisDb } from '../db/index.js';

export interface IdempotencyKeyResult {
  found: boolean;
  result: unknown | null;
}

/**
 * Check if an idempotency key exists and is not expired.
 * If found, returns the stored result (or null if no result was stored).
 * If not found or expired, returns { found: false }.
 */
export async function checkIdempotencyKey(
  db: AegisDb,
  key: string,
): Promise<IdempotencyKeyResult> {
  const now = new Date();
  const rows = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key))
    .limit(1);

  if (rows.length === 0) return { found: false, result: null };

  const row = rows[0];
  // Treat expired key as absent
  if (row.expiresAt && row.expiresAt <= now) {
    return { found: false, result: null };
  }

  const result = row.resultJson ? JSON.parse(row.resultJson) as unknown : null;
  return { found: true, result };
}

/**
 * Set an idempotency key with an optional result and TTL.
 * If the key already exists, this is a no-op (the existing record wins).
 */
export async function setIdempotencyKey(
  db: AegisDb,
  key: string,
  scope: string,
  resultJson?: unknown,
  ttlMs?: number,
): Promise<void> {
  const expiresAt = ttlMs ? new Date(Date.now() + ttlMs) : null;
  const resultStr = resultJson !== undefined ? JSON.stringify(resultJson) : null;

  try {
    await db.insert(idempotencyKeys).values({
      key,
      scope,
      resultJson: resultStr,
      expiresAt: expiresAt ?? undefined,
    });
  } catch {
    // Key already exists — no-op (idempotent insert)
  }
}

/**
 * Atomically claim an idempotency key using INSERT OR IGNORE (SQLite).
 *
 * - Expired keys are deleted first so a fresh insert can proceed.
 * - INSERT OR IGNORE (via .onConflictDoNothing()) atomically claims the row.
 * - Uses RETURNING to detect whether our insert won the race:
 *     • Inserted row returned  → we claimed it → { found: false }
 *     • No row returned (conflict) → already existed → read it and return { found: true, result }
 *
 * Only the first inserter gets found: false. All subsequent callers get found: true.
 */
export async function checkOrSetIdempotencyKey(
  db: AegisDb,
  key: string,
  scope: string,
  opts?: { resultJson?: unknown; ttlMs?: number },
): Promise<IdempotencyKeyResult> {
  const now = new Date();
  const expiresAt = opts?.ttlMs ? new Date(Date.now() + opts.ttlMs) : null;
  const resultStr = opts?.resultJson !== undefined ? JSON.stringify(opts.resultJson) : null;

  // Delete expired key first so the insert below can claim it fresh
  await db.delete(idempotencyKeys).where(
    and(
      eq(idempotencyKeys.key, key),
      lt(idempotencyKeys.expiresAt as any, now),
    ),
  );

  // Atomically insert; returns the inserted row only if the insert succeeded (no conflict)
  const inserted = await db.insert(idempotencyKeys).values({
    key,
    scope,
    resultJson: resultStr,
    expiresAt: expiresAt ?? undefined,
  }).onConflictDoNothing().returning();

  if (inserted.length > 0) {
    // We claimed the key — caller should proceed with work
    return { found: false, result: null };
  }

  // Key already existed — read the current state
  const rows = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key))
    .limit(1);

  if (rows.length === 0) {
    // Edge case: row was deleted between our insert attempt and this read (e.g. concurrent purge)
    return { found: false, result: null };
  }

  const row = rows[0];
  const result = row.resultJson ? JSON.parse(row.resultJson) as unknown : null;
  return { found: true, result };
}

/**
 * Delete an idempotency key (e.g. for testing or explicit retry).
 */
export async function deleteIdempotencyKey(db: AegisDb, key: string): Promise<void> {
  await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
}

/**
 * Purge all expired idempotency keys (called by maintenance worker tick).
 */
export async function purgeExpiredIdempotencyKeys(db: AegisDb): Promise<number> {
  const now = new Date();
  const rows = await db
    .delete(idempotencyKeys)
    .where(lt(idempotencyKeys.expiresAt as any, now))
    .returning();
  return rows.length;
}
