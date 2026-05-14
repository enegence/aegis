import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type {
  PacketStorageProvider,
  UploadPacketInput,
  UploadPacketResult,
  VerifyPacketInput,
  VerifyPacketResult,
  DownloadPacketInput,
  DeletePacketInput,
} from './index.js';

export interface S3StorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  prefix?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

export function buildObjectKey(
  config: Pick<S3StorageConfig, 'prefix'>,
  switchId: number,
  version: number,
  packetId: number,
): string {
  const base = `${switchId}/${version}/${packetId}.aegis.enc`;
  return config.prefix ? `${config.prefix}/${base}` : base;
}

export class S3StorageProvider implements PacketStorageProvider {
  private client: S3Client;
  private bucket: string;
  private prefix: string | undefined;

  constructor(config: S3StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle ?? false,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.bucket = config.bucket;
    this.prefix = config.prefix;
  }

  async uploadPacket(input: UploadPacketInput): Promise<UploadPacketResult> {
    const objectKey = buildObjectKey(
      { prefix: this.prefix },
      input.switchId,
      input.version,
      input.packetId,
    );

    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: input.encryptedBytes,
        ContentLength: input.encryptedBytes.length,
        ContentType: 'application/octet-stream',
        Metadata: {
          'x-aegis-encrypted-hash': input.encryptedObjectHash,
          'x-aegis-packet-id': String(input.packetId),
        },
      }),
    );

    return {
      objectKey,
      versionId: result.VersionId,
      etag: result.ETag,
      sizeBytes: input.encryptedBytes.length,
    };
  }

  async verifyPacket(input: VerifyPacketInput): Promise<VerifyPacketResult> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: input.objectKey,
        }),
      );

      const actualSize = result.ContentLength ?? 0;
      if (actualSize !== input.expectedSizeBytes) {
        return {
          ok: false,
          reason: `size mismatch: expected ${input.expectedSizeBytes}, got ${actualSize}`,
          actualSizeBytes: actualSize,
        };
      }

      return {
        ok: true,
        actualSizeBytes: actualSize,
        versionId: result.VersionId,
      };
    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? '';
      if (name === 'NotFound' || name === 'NoSuchKey') {
        return { ok: false, reason: 'object not found' };
      }
      return { ok: false, reason: `head request failed: ${String(err)}` };
    }
  }

  async downloadPacket(input: DownloadPacketInput): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: input.objectKey,
      }),
    );

    if (!result.Body) throw new Error('Empty response body from S3');

    const chunks: Uint8Array[] = [];
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async deletePacket(input: DeletePacketInput): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: input.objectKey,
      }),
    );
  }
}
