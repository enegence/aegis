import { z } from 'zod';

export const ReleaseRunStatusSchema = z.enum([
  'active', 'cascade_active', 'completed', 'cancelled', 'failed',
]);

export const ReleaseRunSummarySchema = z.object({
  id: z.number().int().positive(),
  triggeringSwitchId: z.number().int().positive(),
  status: ReleaseRunStatusSchema,
  activePacketId: z.number().int().positive().nullable(),
  currentContactClaimId: z.number().int().positive().nullable(),
  suppressedSwitchIds: z.array(z.number().int()),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
});

export type ReleaseRunStatus = z.infer<typeof ReleaseRunStatusSchema>;
export type ReleaseRunSummaryContract = z.infer<typeof ReleaseRunSummarySchema>;
