/**
 * Tests for notification payload minimization (OSS).
 *
 * Covers:
 *  - buildNotificationPayload includes owner display name, claim link, expiry
 *  - buildNotificationPayload does NOT include institution names, account details, executor notes
 *  - assertPayloadMinimized throws on forbidden field names
 *  - assertPayloadMinimized passes on minimal payload
 *  - hashPayload produces a deterministic SHA-256 hex digest
 */

import { describe, it, expect } from 'vitest';
import {
  buildNotificationPayload,
  assertPayloadMinimized,
  hashPayload,
} from '../src/services/notification-delivery.js';

const SAMPLE_INPUT = {
  ownerDisplayName: 'Jane Smith',
  claimUrl: 'https://aegisdms.life/claim/abc123',
  claimExpiresAt: new Date('2026-06-01T12:00:00Z'),
};

describe('buildNotificationPayload', () => {
  it('includes owner display name', () => {
    const { subject, textBody, htmlBody } = buildNotificationPayload(SAMPLE_INPUT);
    expect(subject).toContain('Jane Smith');
    expect(textBody).toContain('Jane Smith');
    expect(htmlBody).toContain('Jane Smith');
  });

  it('includes claim link', () => {
    const { textBody, htmlBody } = buildNotificationPayload(SAMPLE_INPUT);
    expect(textBody).toContain(SAMPLE_INPUT.claimUrl);
    expect(htmlBody).toContain(SAMPLE_INPUT.claimUrl);
  });

  it('includes expiry date', () => {
    const { textBody, htmlBody } = buildNotificationPayload(SAMPLE_INPUT);
    expect(textBody).toContain('2026-06-01T12:00:00.000Z');
    expect(htmlBody).toContain('2026-06-01T12:00:00.000Z');
  });

  it('does NOT include institution name', () => {
    const { subject, textBody, htmlBody } = buildNotificationPayload(SAMPLE_INPUT);
    const combined = subject + textBody + htmlBody;
    expect(combined).not.toContain('institutionName');
    expect(combined).not.toContain('institution_name');
    expect(combined).not.toContain('Chase Bank');
    expect(combined).not.toContain('Vanguard');
  });

  it('does NOT include account type or reference hint fields', () => {
    const { textBody, htmlBody } = buildNotificationPayload(SAMPLE_INPUT);
    const combined = textBody + htmlBody;
    expect(combined).not.toContain('accountType');
    expect(combined).not.toContain('account_type');
    expect(combined).not.toContain('referenceHint');
    expect(combined).not.toContain('reference_hint');
  });

  it('does NOT include executor notes or asset description fields', () => {
    const { textBody, htmlBody } = buildNotificationPayload(SAMPLE_INPUT);
    const combined = textBody + htmlBody;
    expect(combined).not.toContain('executorNotes');
    expect(combined).not.toContain('executor_notes');
    expect(combined).not.toContain('assetDescription');
    expect(combined).not.toContain('asset_description');
  });

  it('does NOT include key material fields', () => {
    const { textBody, htmlBody } = buildNotificationPayload(SAMPLE_INPUT);
    const combined = textBody + htmlBody;
    expect(combined).not.toContain('keyMaterial');
    expect(combined).not.toContain('key_material');
    expect(combined).not.toContain('releaseKey');
    expect(combined).not.toContain('release_key');
  });

  it('passes assertPayloadMinimized for the generated text body', () => {
    const { textBody } = buildNotificationPayload(SAMPLE_INPUT);
    expect(() => assertPayloadMinimized(textBody)).not.toThrow();
  });

  it('passes assertPayloadMinimized for the generated html body', () => {
    const { htmlBody } = buildNotificationPayload(SAMPLE_INPUT);
    expect(() => assertPayloadMinimized(htmlBody)).not.toThrow();
  });
});

describe('assertPayloadMinimized', () => {
  it('does not throw on clean payload', () => {
    const clean = 'You have a pending claim. Click here to claim your info.';
    expect(() => assertPayloadMinimized(clean)).not.toThrow();
  });

  it('throws if payload contains institutionName', () => {
    const payload = 'Your account at institutionName: Chase Bank';
    expect(() => assertPayloadMinimized(payload)).toThrow(/institutionName/);
  });

  it('throws if payload contains institution_name', () => {
    const payload = 'institution_name: Chase Bank';
    expect(() => assertPayloadMinimized(payload)).toThrow(/institution_name/);
  });

  it('throws if payload contains accountType', () => {
    const payload = 'accountType: savings';
    expect(() => assertPayloadMinimized(payload)).toThrow(/accountType/);
  });

  it('throws if payload contains executorNotes', () => {
    const payload = 'executorNotes: Please call the lawyer first.';
    expect(() => assertPayloadMinimized(payload)).toThrow(/executorNotes/);
  });

  it('throws if payload contains assetDescription', () => {
    const payload = 'assetDescription: 1234 Main St property';
    expect(() => assertPayloadMinimized(payload)).toThrow(/assetDescription/);
  });

  it('throws if payload contains key_material', () => {
    const payload = 'key_material: AAAAAABBBBBBCCCCCC==';
    expect(() => assertPayloadMinimized(payload)).toThrow(/key_material/);
  });

  it('throws if payload contains releaseKey', () => {
    const payload = 'releaseKey: some-key-value';
    expect(() => assertPayloadMinimized(payload)).toThrow(/releaseKey/);
  });
});

describe('hashPayload', () => {
  it('returns a 64-character hex string', () => {
    const hash = hashPayload('hello world');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic (same input → same hash)', () => {
    const a = hashPayload('test message');
    const b = hashPayload('test message');
    expect(a).toBe(b);
  });

  it('differs for different inputs', () => {
    const a = hashPayload('message A');
    const b = hashPayload('message B');
    expect(a).not.toBe(b);
  });
});
