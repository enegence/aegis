import { describe, it, expect } from 'vitest';
import { encryptField, decryptField } from '../src/services/field-encrypt.js';

const TEST_KEY = '0123456789abcdef0123456789abcdef';

describe('field encryption', () => {
  it('encrypts and decrypts a string', () => {
    const plaintext = 'Chase Bank checking account ending in 4821';
    const encrypted = encryptField(plaintext, TEST_KEY);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain(':');
    const decrypted = decryptField(encrypted, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext each time (random IV)', () => {
    const plaintext = 'same input';
    const a = encryptField(plaintext, TEST_KEY);
    const b = encryptField(plaintext, TEST_KEY);
    expect(a).not.toBe(b);
  });

  it('returns null for empty/null input', () => {
    expect(encryptField(null as any, TEST_KEY)).toBeNull();
    expect(encryptField('', TEST_KEY)).toBeNull();
    expect(decryptField(null as any, TEST_KEY)).toBeNull();
    expect(decryptField('', TEST_KEY)).toBeNull();
  });
});
