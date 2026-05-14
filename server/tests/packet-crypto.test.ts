import { describe, it, expect } from 'vitest';
import {
  generatePacketKey,
  encryptPacketJson,
  decryptPacketJson,
  hashPlainPacket,
  hashEncryptedPacket,
} from '../src/services/packet-crypto.js';

const KEY_ID = 'test-key-001';

describe('packet crypto', () => {
  it('encrypt/decrypt round trip', () => {
    const key = generatePacketKey();
    const payload = { schemaVersion: '1.0', data: 'hello' };
    const result = encryptPacketJson(payload, key, KEY_ID);
    const decrypted = decryptPacketJson(result.ciphertext, key, result.iv, result.authTag);
    expect(decrypted).toEqual(payload);
  });

  it('wrong key fails', () => {
    const key = generatePacketKey();
    const wrongKey = generatePacketKey();
    const result = encryptPacketJson({ x: 1 }, key, KEY_ID);
    expect(() => decryptPacketJson(result.ciphertext, wrongKey, result.iv, result.authTag)).toThrow();
  });

  it('modified ciphertext fails', () => {
    const key = generatePacketKey();
    const result = encryptPacketJson({ x: 1 }, key, KEY_ID);
    const tampered = Buffer.from(result.ciphertext);
    tampered[0] ^= 0xff;
    expect(() => decryptPacketJson(tampered, key, result.iv, result.authTag)).toThrow();
  });

  it('modified auth tag fails', () => {
    const key = generatePacketKey();
    const result = encryptPacketJson({ x: 1 }, key, KEY_ID);
    const badTag = Buffer.from(result.authTag, 'base64url');
    badTag[0] ^= 0xff;
    expect(() =>
      decryptPacketJson(result.ciphertext, key, result.iv, badTag.toString('base64url')),
    ).toThrow();
  });

  it('content hash deterministic for same payload', () => {
    const payload = { b: 2, a: 1 };
    expect(hashPlainPacket(payload)).toBe(hashPlainPacket(payload));
  });

  it('content hash stable regardless of key order', () => {
    const a = { z: 26, a: 1 };
    const b = { a: 1, z: 26 };
    expect(hashPlainPacket(a)).toBe(hashPlainPacket(b));
  });

  it('encrypted object hash changes with different IV (new encrypt call)', () => {
    const key = generatePacketKey();
    const payload = { x: 1 };
    const r1 = encryptPacketJson(payload, key, KEY_ID);
    const r2 = encryptPacketJson(payload, key, KEY_ID);
    // IVs differ → ciphertexts differ → hashes differ
    expect(r1.encryptedObjectHash).not.toBe(r2.encryptedObjectHash);
  });

  it('encrypted object hash matches manual hash of ciphertext', () => {
    const key = generatePacketKey();
    const result = encryptPacketJson({ x: 1 }, key, KEY_ID);
    expect(result.encryptedObjectHash).toBe(hashEncryptedPacket(result.ciphertext));
  });

  it('generatePacketKey returns 32-byte buffer', () => {
    const key = generatePacketKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it('result includes algorithm and keyId', () => {
    const key = generatePacketKey();
    const result = encryptPacketJson({}, key, KEY_ID);
    expect(result.algorithm).toBe('aes-256-gcm');
    expect(result.keyId).toBe(KEY_ID);
  });
});
