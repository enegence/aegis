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

import { eq, and, gt } from 'drizzle-orm';
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
 * Check if a key exists; if not, insert it and return { found: false }.
 * If found and not expired, return { found: true, result }.
 *
 * This is the main helper: call it before performing an idempotent action.
 * If found === false, perform the action and optionally call setIdempotencyKey
 * with the result. If found === true, return the cached result.
 */
export async function checkOrSetIdempotencyKey(
  db: AegisDb,
  key: string,
  scope: string,
  opts?: { resultJson?: unknown; ttlMs?: number },
): Promise<IdempotencyKeyResult> {
  const existing = await checkIdempotencyKey(db, key);
  if (existing.found) return existing;

  await setIdempotencyKey(db, key, scope, opts?.resultJson, opts?.ttlMs);
  return { found: false, result: null };
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
    .where(and(
      gt(now, idempotencyKeys.expiresAt as any),
    ))
    .returning();
  return rows.length;
}
