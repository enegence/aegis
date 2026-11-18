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
    expect(key).toBe('pkt/1/2/3.underwing.enc');
  });

  it('omits prefix when not set', () => {
    const key = buildObjectKey({ prefix: undefined }, 1, 2, 3);
    expect(key).toBe('1/2/3.underwing.enc');
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
    expect(call.Key).toBe('packets/1/2/10.underwing.enc');
    expect(call.Body).toBe(encryptedBytes);
    expect(result.objectKey).toBe('packets/1/2/10.underwing.enc');
    expect(result.versionId).toBe('v1');
    expect(result.sizeBytes).toBe(encryptedBytes.length);
  });

  it('uploadPacket keeps the object metadata keys that existing mirrors carry', async () => {
    mockSend.mockResolvedValueOnce({});
    await provider.uploadPacket({
      switchId: 1, packetId: 7, version: 1,
      encryptedBytes: Buffer.from('x'),
      encryptedObjectHash: 'hash-abc',
    });
    const call = mockSend.mock.calls[0][0];
    expect(call.Metadata).toEqual({
      'x-aegis-encrypted-hash': 'hash-abc',
      'x-aegis-packet-id': '7',
    });
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

    const result = await provider.verifyPacket({ objectKey: 'packets/1/1/1.underwing.enc', expectedSizeBytes: 100 });
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
    await provider.deletePacket({ objectKey: 'packets/1/1/1.underwing.enc' });
    expect(mockSend).toHaveBeenCalledOnce();
    const call = mockSend.mock.calls[0][0];
    expect(call.Key).toBe('packets/1/1/1.underwing.enc');
  });
});

// Packets mirrored before the rename sit under the old default prefix with the
// old suffix. Their exact key is stored on the packet row at upload time, so a
// provider configured with today's naming must use that stored key untouched.
describe('packets mirrored before the rename', () => {
  const LEGACY_KEY = 'aegis/3/1/7.aegis.enc';
  let provider: S3StorageProvider;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mod = await import('@aws-sdk/client-s3');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockSend = (mod as any).__mockSend as ReturnType<typeof vi.fn>;
    mockSend.mockReset();
    provider = new S3StorageProvider({ ...config, prefix: 'underwing' });
  });

  it('are verified at their stored key', async () => {
    mockSend.mockResolvedValueOnce({ ContentLength: 42 });
    const result = await provider.verifyPacket({ objectKey: LEGACY_KEY, expectedSizeBytes: 42 });
    expect(result.ok).toBe(true);
    expect(mockSend.mock.calls[0][0].Key).toBe(LEGACY_KEY);
  });

  it('are downloaded from their stored key', async () => {
    async function* body() { yield new Uint8Array([1, 2, 3]); }
    mockSend.mockResolvedValueOnce({ Body: body() });
    const bytes = await provider.downloadPacket({ objectKey: LEGACY_KEY });
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(mockSend.mock.calls[0][0].Key).toBe(LEGACY_KEY);
  });

  it('are deleted at their stored key', async () => {
    mockSend.mockResolvedValueOnce({});
    await provider.deletePacket({ objectKey: LEGACY_KEY });
    expect(mockSend.mock.calls[0][0].Key).toBe(LEGACY_KEY);
  });

  it('new uploads from the same provider use the new suffix', async () => {
    mockSend.mockResolvedValueOnce({});
    const result = await provider.uploadPacket({
      switchId: 3, packetId: 8, version: 2,
      encryptedBytes: Buffer.from('x'),
      encryptedObjectHash: 'h',
    });
    expect(result.objectKey).toBe('underwing/3/2/8.underwing.enc');
  });
});
