// Mirrors aegis-dms-site packages/contracts/src/heartbeat.ts. Keep them identical.
import { z } from 'zod';

export const DeploymentModeSchema = z.enum([
  'vault', 'dead_drop', 'relay_monitoring', 'relay_escrow', 'hosted'
]);

/**
 * Versioned relay telemetry. The interval is a bounded client hint only;
 * liveness is always based on the server receipt timestamp.
 */
export const HeartbeatMetadataSchema = z.object({
  contractVersion: z.literal(1).default(1),
  heartbeatIntervalSeconds: z.number().int().min(60).max(86400).optional(),
}).strict();

export const HeartbeatSchema = z.object({
  version: z.literal(1),
  relayConnectionId: z.string().uuid(),
  timestamp: z.string().datetime(),
  mode: DeploymentModeSchema,
  switchCount: z.number().int().min(0),
  sequence: z.number().int().min(0).max(2147483647).optional(),
  metadata: HeartbeatMetadataSchema.optional(),
});

export type DeploymentMode = z.infer<typeof DeploymentModeSchema>;
export type Heartbeat = z.infer<typeof HeartbeatSchema>;
