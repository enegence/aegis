import { nanoid } from 'nanoid';
import { eq, lt } from 'drizzle-orm';
import { sessions } from '../db/schema.js';
import type { UnderwingDb } from '../db/index.js';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function createSession(db: UnderwingDb, ownerId: number): string {
  const id = nanoid(48);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  db.insert(sessions).values({
    id,
    ownerId,
    expiresAt,
    createdAt: now,
  }).run();

  return id;
}

export function validateSession(db: UnderwingDb, sessionId: string): number | null {
  const result = db.select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();

  if (!result) return null;
  if (result.expiresAt < new Date()) {
    db.delete(sessions).where(eq(sessions.id, sessionId)).run();
    return null;
  }

  return result.ownerId;
}

export function deleteSession(db: UnderwingDb, sessionId: string): void {
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

export function cleanExpiredSessions(db: UnderwingDb): void {
  db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run();
}
