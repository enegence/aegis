import { randomBytes, createHash } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { contactClaims } from '../db/schema.js';
import type { AegisDb } from '../db/index.js';

export type ClaimStatus =
  | 'pending'
  | 'notified'
  | 'opened'
  | 'verified'
  | 'accepted'
  | 'packet_downloaded'
  | 'key_viewed'
  | 'acknowledged'
  | 'expired'
  | 'escalated'
  | 'failed';

export const TERMINAL_CLAIM_STATUSES: ClaimStatus[] = [
  'acknowledged',
  'expired',
  'escalated',
  'failed',
];

export interface ContactClaimRecord {
  id: number;
  releaseRunId: number;
  switchId: number;
  packetId: number;
  contactId: number;
  claimTokenHash: string;
  status: ClaimStatus;
  notifiedAt: Date | null;
  openedAt: Date | null;
  verifiedAt: Date | null;
  acceptedAt: Date | null;
  packetDownloadedAt: Date | null;
  keyViewedAt: Date | null;
  acknowledgedAt: Date | null;
  expiresAt: Date;
  escalatedAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
}

export interface CreateClaimInput {
  releaseRunId: number;
  switchId: number;
  packetId: number;
  contactId: number;
  expiresAt: Date;
}

export interface CreateClaimResult {
  record: ContactClaimRecord;
  rawToken: string;
}

export type UpdateClaimFields = Partial<{
  status: ClaimStatus;
  notifiedAt: Date;
  openedAt: Date;
  verifiedAt: Date;
  acceptedAt: Date;
  packetDownloadedAt: Date;
  keyViewedAt: Date;
  acknowledgedAt: Date;
  escalatedAt: Date;
  failedAt: Date;
}>;

export function hashClaimToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function rowToRecord(row: typeof contactClaims.$inferSelect): ContactClaimRecord {
  return {
    id: row.id,
    releaseRunId: row.releaseRunId,
    switchId: row.switchId,
    packetId: row.packetId,
    contactId: row.contactId,
    claimTokenHash: row.claimTokenHash,
    status: row.status as ClaimStatus,
    notifiedAt: row.notifiedAt ?? null,
    openedAt: row.openedAt ?? null,
    verifiedAt: row.verifiedAt ?? null,
    acceptedAt: row.acceptedAt ?? null,
    packetDownloadedAt: row.packetDownloadedAt ?? null,
    keyViewedAt: row.keyViewedAt ?? null,
    acknowledgedAt: row.acknowledgedAt ?? null,
    expiresAt: row.expiresAt,
    escalatedAt: row.escalatedAt ?? null,
    failedAt: row.failedAt ?? null,
    createdAt: row.createdAt,
  };
}

export async function createContactClaim(
  db: AegisDb,
  input: CreateClaimInput,
): Promise<CreateClaimResult> {
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashClaimToken(rawToken);

  const rows = await db
    .insert(contactClaims)
    .values({
      releaseRunId: input.releaseRunId,
      switchId: input.switchId,
      packetId: input.packetId,
      contactId: input.contactId,
      claimTokenHash: tokenHash,
      status: 'pending',
      expiresAt: input.expiresAt,
    })
    .returning();

  return { record: rowToRecord(rows[0]), rawToken };
}

export async function getClaimById(
  db: AegisDb,
  id: number,
): Promise<ContactClaimRecord | null> {
  const rows = await db.select().from(contactClaims).where(eq(contactClaims.id, id));
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function getClaimByTokenHash(
  db: AegisDb,
  tokenHash: string,
): Promise<ContactClaimRecord | null> {
  const rows = await db
    .select()
    .from(contactClaims)
    .where(eq(contactClaims.claimTokenHash, tokenHash));
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function updateClaimStatus(
  db: AegisDb,
  id: number,
  fields: UpdateClaimFields,
): Promise<void> {
  await db.update(contactClaims).set(fields).where(eq(contactClaims.id, id));
}

export async function getActiveClaimForRun(
  db: AegisDb,
  runId: number,
): Promise<ContactClaimRecord | null> {
  const rows = await db
    .select()
    .from(contactClaims)
    .where(eq(contactClaims.releaseRunId, runId))
    .orderBy(contactClaims.createdAt);

  const active = rows.find((r) => !TERMINAL_CLAIM_STATUSES.includes(r.status as ClaimStatus));
  return active ? rowToRecord(active) : null;
}

export async function listClaimsForRun(
  db: AegisDb,
  runId: number,
): Promise<ContactClaimRecord[]> {
  const rows = await db
    .select()
    .from(contactClaims)
    .where(eq(contactClaims.releaseRunId, runId))
    .orderBy(contactClaims.createdAt);
  return rows.map(rowToRecord);
}
