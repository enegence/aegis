import { createHmac, randomBytes } from 'crypto';
import { encryptField, decryptField } from '../services/field-encrypt.js';

// RFC 6238 TOTP — 30-second window, SHA-1, 6 digits
// Compatible with standard authenticator apps (Google Authenticator, Authy, etc.)

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function base32Encode(buf: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  while (output.length % 8 !== 0) output += '=';
  return output;
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function encryptTotpSecret(secret: string, fieldKey: string): string {
  const encrypted = encryptField(secret, fieldKey);
  if (!encrypted) throw new Error('Failed to encrypt TOTP secret');
  return encrypted;
}

export function totpOtpauthUrl(secret: string, email: string): string {
  const label = encodeURIComponent(`Aegis:${email}`);
  const issuer = encodeURIComponent('Aegis');
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export function generateTotpCode(secretBase32: string): string {
  const counter = Math.floor(Date.now() / 1000 / 30);
  return hotp(base32Decode(secretBase32), counter);
}

export function verifyTotpCode(
  code: string,
  encryptedSecretOrBase32: string,
  fieldKey: string,
): boolean {
  // Try decrypting first; if it fails, treat as raw base32 (for tests)
  let secretBase32: string;
  try {
    const decrypted = decryptField(encryptedSecretOrBase32, fieldKey);
    secretBase32 = decrypted ?? encryptedSecretOrBase32;
  } catch {
    secretBase32 = encryptedSecretOrBase32;
  }

  const secret = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / 30);

  // Accept current window ±1 (30-second tolerance)
  for (const offset of [-1, 0, 1]) {
    if (hotp(secret, counter + offset) === code) return true;
  }
  return false;
}
