import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3StorageProvider, buildObjectKey } from '../src/services/storage/s3-storage.js';

// Mock the entire @aws-sdk/client-s3 module
vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn();
  const S3Client = vi.fn(function S3Client() {
    return { send: mockSend };
  });
  const PutObjectCommand = vi.fn(function PutObjectCommand(args) {
    return { _type: 'PutObject', ...args };
  });
  const HeadObjectCommand = vi.fn(function HeadObjectCommand(args) {
    return { _type: 'HeadObject', ...args };
  });
  const GetObjectCommand = vi.fn(function GetObjectCommand(args) {
    return { _type: 'GetObject', ...args };
  });
  const DeleteObjectCommand = vi.fn(function DeleteObjectCommand(args) {
    return { _type: 'DeleteObject', ...args };
  });
  return {
    S3Client,
    PutObjectCommand,
    HeadObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    __mockSend: mockSend,
  };
});

const config = {
  region: 'us-east-1',
  bucket: 'test-bucket',
  prefix: 'packets',
  accessKeyId: 'test-key-id',
  secretAccessKey: 'test-secret',
};

describe('buildObjectKey', () => {
  it('includes prefix, switchId, version, packetId', () => {
    const key = buildObjectKey({ prefix: 'pkt' }, 1, 2, 3);
    expect(key).toBe('pkt/1/2/3.aegis.enc');
  });

  it('omits prefix when not set', () => {
    const key = buildObjectKey({ prefix: undefined }, 1, 2, 3);
    expect(key).toBe('1/2/3.aegis.enc');
  });
});

describe('S3StorageProvider', () => {
  let provider: S3StorageProvider;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mod = await import('@aws-sdk/client-s3');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockSend = (mod as any).__mockSend as ReturnType<typeof vi.fn>;
    mockSend.mockReset();
    provider = new S3StorageProvider(config);
  });

  it('uploadPacket calls PutObject with encrypted bytes', async () => {
    mockSend.mockResolvedValueOnce({ ETag: '"abc"', VersionId: 'v1' });

    const encryptedBytes = Buffer.from('encrypted data');
    const result = await provider.uploadPacket({
      switchId: 1,
      packetId: 10,
      version: 2,
      encryptedBytes,
      encryptedObjectHash: 'sha256hash',
    });

    expect(mockSend).toHaveBeenCalledOnce();
    const call = mockSend.mock.calls[0][0];
    expect(call.Bucket).toBe('test-bucket');
    expect(call.Key).toBe('packets/1/2/10.aegis.enc');
    expect(call.Body).toBe(encryptedBytes);
    expect(result.objectKey).toBe('packets/1/2/10.aegis.enc');
    expect(result.versionId).toBe('v1');
    expect(result.sizeBytes).toBe(encryptedBytes.length);
  });

  it('uploadPacket does not include credentials in object metadata', async () => {
    mockSend.mockResolvedValueOnce({});
    await provider.uploadPacket({
      switchId: 1, packetId: 1, version: 1,
      encryptedBytes: Buffer.from('x'),
      encryptedObjectHash: 'h',
    });
    const call = mockSend.mock.calls[0][0];
    expect(JSON.stringify(call.Metadata ?? {})).not.toContain('secret');
    expect(JSON.stringify(call.Metadata ?? {})).not.toContain('accessKey');
  });

  it('verifyPacket returns ok when size matches', async () => {
    mockSend.mockResolvedValueOnce({ ContentLength: 100, VersionId: 'v1' });

    const result = await provider.verifyPacket({ objectKey: 'packets/1/1/1.aegis.enc', expectedSizeBytes: 100 });
    expect(result.ok).toBe(true);
    expect(result.actualSizeBytes).toBe(100);
    expect(result.versionId).toBe('v1');
  });

  it('verifyPacket returns failed when size mismatches', async () => {
    mockSend.mockResolvedValueOnce({ ContentLength: 50 });
    const result = await provider.verifyPacket({ objectKey: 'k', expectedSizeBytes: 100 });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('size mismatch');
  });

  it('verifyPacket returns failed when object not found', async () => {
    const err = new Error('not found');
    (err as NodeJS.ErrnoException & { name: string }).name = 'NotFound';
    mockSend.mockRejectedValueOnce(err);
    const result = await provider.verifyPacket({ objectKey: 'missing', expectedSizeBytes: 0 });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('not found');
  });

  it('deletePacket calls DeleteObject', async () => {
    mockSend.mockResolvedValueOnce({});
    await provider.deletePacket({ objectKey: 'packets/1/1/1.aegis.enc' });
    expect(mockSend).toHaveBeenCalledOnce();
    const call = mockSend.mock.calls[0][0];
    expect(call.Key).toBe('packets/1/1/1.aegis.enc');
  });
});
