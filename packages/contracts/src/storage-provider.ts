import { z } from 'zod';

export const S3StorageConfigSchema = z.object({
  endpoint: z.string().url().optional(),
  region: z.string().min(1),
  bucket: z.string().min(1),
  prefix: z.string().optional(),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  forcePathStyle: z.boolean().optional(),
});

export const StorageObjectMetaSchema = z.object({
  provider: z.literal('s3'),
  bucket: z.string().min(1),
  objectKey: z.string().min(1),
  region: z.string().optional(),
  versionId: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  contentHash: z.string().optional(),
  uploadedAt: z.string().datetime().optional(),
});

export type S3StorageConfig = z.infer<typeof S3StorageConfigSchema>;
export type StorageObjectMeta = z.infer<typeof StorageObjectMetaSchema>;
