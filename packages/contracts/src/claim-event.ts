import { z } from 'zod';

export const ClaimEventTypeSchema = z.enum([
  'opened', 'verified', 'accepted', 'downloaded', 'key_viewed', 'acknowledged',
]);

export const ClaimStatusSchema = z.enum([
  'pending', 'notified', 'opened', 'verified', 'accepted',
  'packet_downloaded', 'key_viewed', 'acknowledged',
  'expired', 'escalated', 'failed',
]);

export const ClaimEventSchema = z.object({
  claimId: z.number().int().positive(),
  releaseRunId: z.number().int().positive(),
  eventType: ClaimEventTypeSchema,
  occurredAt: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

export const ClaimPublicSummarySchema = z.object({
  status: ClaimStatusSchema,
  ownerDisplayName: z.string(),
  contactDisplayName: z.string().nullable(),
  switchName: z.string(),
  expiresAt: z.string().datetime(),
  acceptedAt: z.string().datetime().nullable(),
  packetDownloadedAt: z.string().datetime().nullable(),
  keyViewedAt: z.string().datetime().nullable(),
  acknowledgedAt: z.string().datetime().nullable(),
});

export type ClaimEventType = z.infer<typeof ClaimEventTypeSchema>;
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;
export type ClaimEvent = z.infer<typeof ClaimEventSchema>;
export type ClaimPublicSummaryContract = z.infer<typeof ClaimPublicSummarySchema>;
