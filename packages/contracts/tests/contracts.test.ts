import { describe, it, expect } from 'vitest';
import {
  PacketEnvelopeSchema,
} from '../src/packet-envelope.js';
import {
  ReleaseRunSummarySchema,
} from '../src/release-run.js';
import {
  ClaimEventSchema,
  ClaimPublicSummarySchema,
} from '../src/claim-event.js';
import {
  StorageObjectMetaSchema,
} from '../src/storage-provider.js';

const validEnvelope = {
  schemaVersion: '1.0',
  packetId: 1,
  sourceApp: 'aegis_core' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
  encryption: {
    algorithm: 'aes-256-gcm' as const,
    keyId: 'key-abc123',
    iv: 'base64ivvalue==',
    authTag: 'base64authTag==',
  },
  contentHash: 'sha256hashofplaintext',
  encryptedObjectHash: 'sha256hashofciphertext',
  storage: null,
};

describe('PacketEnvelopeSchema', () => {
  it('parses valid envelope', () => {
    const result = PacketEnvelopeSchema.safeParse(validEnvelope);
    expect(result.success).toBe(true);
  });

  it('parses envelope with storage', () => {
    const withStorage = {
      ...validEnvelope,
      storage: {
        provider: 's3' as const,
        bucket: 'my-bucket',
        objectKey: 'packets/1.bin',
        region: 'us-east-1',
      },
    };
    const result = PacketEnvelopeSchema.safeParse(withStorage);
    expect(result.success).toBe(true);
  });

  it('rejects missing schemaVersion', () => {
    const { schemaVersion: _, ...bad } = validEnvelope;
    expect(PacketEnvelopeSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects invalid sourceApp', () => {
    const bad = { ...validEnvelope, sourceApp: 'wrong_app' };
    expect(PacketEnvelopeSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects invalid algorithm', () => {
    const bad = { ...validEnvelope, encryption: { ...validEnvelope.encryption, algorithm: 'rsa' } };
    expect(PacketEnvelopeSchema.safeParse(bad).success).toBe(false);
  });
});

describe('ReleaseRunSummarySchema', () => {
  it('parses valid release run', () => {
    const run = {
      id: 1,
      triggeringSwitchId: 2,
      status: 'active' as const,
      activePacketId: null,
      currentContactClaimId: null,
      suppressedSwitchIds: [],
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: null,
      cancelledAt: null,
    };
    expect(ReleaseRunSummarySchema.safeParse(run).success).toBe(true);
  });

  it('rejects invalid status', () => {
    const bad = { id: 1, triggeringSwitchId: 1, status: 'pending', suppressedSwitchIds: [], startedAt: '2026-01-01T00:00:00.000Z', activePacketId: null, currentContactClaimId: null, completedAt: null, cancelledAt: null };
    expect(ReleaseRunSummarySchema.safeParse(bad).success).toBe(false);
  });
});

describe('ClaimEventSchema', () => {
  it('parses each valid event type', () => {
    const types = ['opened', 'verified', 'accepted', 'downloaded', 'key_viewed', 'acknowledged'] as const;
    for (const eventType of types) {
      const event = { claimId: 1, releaseRunId: 1, eventType, occurredAt: '2026-01-01T00:00:00.000Z' };
      expect(ClaimEventSchema.safeParse(event).success).toBe(true);
    }
  });

  it('rejects unknown event type', () => {
    const bad = { claimId: 1, releaseRunId: 1, eventType: 'notified', occurredAt: '2026-01-01T00:00:00.000Z' };
    expect(ClaimEventSchema.safeParse(bad).success).toBe(false);
  });
});

describe('ClaimPublicSummarySchema', () => {
  it('parses valid summary', () => {
    const summary = {
      status: 'accepted' as const,
      ownerDisplayName: 'Alice',
      contactDisplayName: 'Bob',
      switchName: 'Main Switch',
      expiresAt: '2027-01-01T00:00:00.000Z',
      acceptedAt: '2026-01-01T00:00:00.000Z',
      packetDownloadedAt: null,
      keyViewedAt: null,
      acknowledgedAt: null,
    };
    expect(ClaimPublicSummarySchema.safeParse(summary).success).toBe(true);
  });
});

describe('StorageObjectMetaSchema', () => {
  it('parses S3 metadata', () => {
    const meta = {
      provider: 's3' as const,
      bucket: 'my-bucket',
      objectKey: 'packets/1.bin',
      region: 'us-east-1',
      versionId: 'v1',
      sizeBytes: 1024,
    };
    expect(StorageObjectMetaSchema.safeParse(meta).success).toBe(true);
  });

  it('requires provider to be s3', () => {
    const bad = { provider: 'gcs', bucket: 'b', objectKey: 'k' };
    expect(StorageObjectMetaSchema.safeParse(bad).success).toBe(false);
  });
});
