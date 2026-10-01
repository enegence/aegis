// Wire contract for POST {relayUrl}/api/relay/packets on Aegis Relay.
// Source of truth: aegis-dms-site packages/contracts/src/relay-packet-upload.ts
// (validated server-side there). Keep the fields below identical to it.
//
// Note: this package's PacketEnvelopeSchema describes Aegis Core's LOCAL packet
// metadata (integer ids, storage block) and is intentionally not reused here;
// the upload envelope uses the SaaS envelope shape spelled out explicitly.
import { z } from 'zod';

/** Maximum decoded ciphertext size accepted by POST /api/relay/packets. */
export const RELAY_PACKET_MAX_BYTES = 10 * 1024 * 1024;

/** Maximum padded standard-base64 length for RELAY_PACKET_MAX_BYTES. */
export const RELAY_PACKET_MAX_BASE64_LENGTH = Math.ceil(RELAY_PACKET_MAX_BYTES / 3) * 4;

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export const RelayPacketEnvelopeSchema = z.object({
  version: z.literal(1),
  packetId: z.string().uuid(),
  switchId: z.string().uuid().optional(),
  userId: z.string().optional(),
  sourceApp: z.literal('aegis_core').default('aegis_core'),
  encryptionAlgorithm: z.literal('aes-256-gcm'),
  keyId: z.string().min(1).max(200),
  contentHash: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.string()).optional(),
});

export const RelayPacketUploadSchema = z.object({
  version: z.literal(1),
  relayConnectionId: z.string().uuid(),
  envelope: RelayPacketEnvelopeSchema,
  /** Standard, padded base64 of the encrypted packet bytes (IV|tag|ciphertext). */
  encryptedData: z.string()
    .min(4)
    .max(RELAY_PACKET_MAX_BASE64_LENGTH)
    .refine((value) => value.length % 4 === 0 && BASE64_RE.test(value), {
      message: 'encryptedData must be standard padded base64',
    }),
});

export const RelayPacketUploadResponseSchema = z.object({
  packet: z.object({
    id: z.string().uuid(),
    sourcePacketId: z.string().uuid(),
    version: z.number().int().min(1),
    keyId: z.string(),
    contentHash: z.string(),
    encryptedObjectHash: z.string(),
    sizeBytes: z.number().int().min(1),
    createdAt: z.string().datetime(),
  }),
  duplicate: z.boolean(),
});

export type RelayPacketEnvelope = z.infer<typeof RelayPacketEnvelopeSchema>;
export type RelayPacketUpload = z.infer<typeof RelayPacketUploadSchema>;
export type RelayPacketUploadResponse = z.infer<typeof RelayPacketUploadResponseSchema>;
