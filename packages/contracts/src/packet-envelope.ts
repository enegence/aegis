import { z } from 'zod';

export const PacketEncryptionMetaSchema = z.object({
  algorithm: z.literal('aes-256-gcm'),
  keyId: z.string().min(1),
  iv: z.string().min(1),
  authTag: z.string().min(1),
});

export const PacketStorageMetaSchema = z.object({
  provider: z.literal('s3'),
  bucket: z.string().min(1),
  objectKey: z.string().min(1),
  region: z.string().optional(),
  versionId: z.string().optional(),
});

export const PacketEnvelopeSchema = z.object({
  schemaVersion: z.string().min(1),
  packetId: z.number().int().positive(),
  sourceApp: z.literal('aegis_core'),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  encryption: PacketEncryptionMetaSchema,
  contentHash: z.string().min(1),
  encryptedObjectHash: z.string().min(1),
  storage: PacketStorageMetaSchema.nullable(),
});

export type PacketEncryptionMeta = z.infer<typeof PacketEncryptionMetaSchema>;
export type PacketStorageMeta = z.infer<typeof PacketStorageMetaSchema>;
export type PacketEnvelope = z.infer<typeof PacketEnvelopeSchema>;
