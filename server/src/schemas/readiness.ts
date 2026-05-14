import { z } from 'zod';

export const ReadinessStatusSchema = z.enum(['ready', 'not_ready', 'warning']);

export const ReadinessCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: ReadinessStatusSchema,
  required: z.boolean(),
  message: z.string(),
  resolutionHint: z.string().optional(),
});

export const SwitchReadinessSchema = z.object({
  switchId: z.number().int().positive().optional(),
  status: ReadinessStatusSchema,
  checks: z.array(ReadinessCheckSchema),
});

export type ReadinessCheckOutput = z.infer<typeof ReadinessCheckSchema>;
export type SwitchReadinessOutput = z.infer<typeof SwitchReadinessSchema>;
