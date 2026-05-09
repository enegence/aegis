import { z } from 'zod';

export const SwitchParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const CreateSwitchInputSchema = z
  .object({
    name: z.string().min(1),
    mode: z.enum(['trip', 'heartbeat']),
    deploymentMode: z
      .enum(['vault', 'dead_drop', 'relay_monitoring', 'relay_escrow', 'hosted'])
      .default('vault'),
    triggerAt: z.string().datetime().optional(),
    heartbeatIntervalDays: z.number().int().min(1).optional(),
    gracePeriodHours: z.number().int().min(1).default(72),
    warningWindowDays: z.number().int().min(0).default(3),
    selectedContactIds: z.array(z.number().int().positive()).default([]),
    selectedEstateItemIds: z.array(z.number().int().positive()).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.mode === 'trip') {
      if (!data.triggerAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['triggerAt'],
          message: 'triggerAt is required for trip mode',
        });
      } else {
        const triggerDate = new Date(data.triggerAt);
        if (triggerDate <= new Date()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['triggerAt'],
            message: 'triggerAt must be in the future',
          });
        }
      }
    }
    if (data.mode === 'heartbeat' && data.heartbeatIntervalDays === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['heartbeatIntervalDays'],
        message: 'heartbeatIntervalDays is required for heartbeat mode',
      });
    }
  });

export const UpdateSwitchInputSchema = z
  .object({
    name: z.string().min(1).optional(),
    mode: z.enum(['trip', 'heartbeat']).optional(),
    deploymentMode: z
      .enum(['vault', 'dead_drop', 'relay_monitoring', 'relay_escrow', 'hosted'])
      .optional(),
    triggerAt: z.string().datetime().optional(),
    heartbeatIntervalDays: z.number().int().min(1).optional(),
    gracePeriodHours: z.number().int().min(1).optional(),
    warningWindowDays: z.number().int().min(0).optional(),
    selectedContactIds: z.array(z.number().int().positive()).optional(),
    selectedEstateItemIds: z.array(z.number().int().positive()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === 'trip' && data.triggerAt !== undefined) {
      const triggerDate = new Date(data.triggerAt);
      if (triggerDate <= new Date()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['triggerAt'],
          message: 'triggerAt must be in the future',
        });
      }
    }
  });

export const ArmSwitchInputSchema = z.object({});
export const PauseSwitchInputSchema = z.object({});
export const CancelSwitchInputSchema = z.object({});
export const CheckInInputSchema = z.object({});

export type CreateSwitchInput = z.infer<typeof CreateSwitchInputSchema>;
export type UpdateSwitchInput = z.infer<typeof UpdateSwitchInputSchema>;
export type ArmSwitchInput = z.infer<typeof ArmSwitchInputSchema>;
export type PauseSwitchInput = z.infer<typeof PauseSwitchInputSchema>;
export type CancelSwitchInput = z.infer<typeof CancelSwitchInputSchema>;
export type CheckInInput = z.infer<typeof CheckInInputSchema>;
export type SwitchParams = z.infer<typeof SwitchParamsSchema>;
