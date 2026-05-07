import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function deriveKey(key: string): Buffer {
  return createHash('sha256').update(key).digest();
}

export function encryptField(plaintext: string | null, key: string): string | null {
  if (!plaintext) return null;

  const derivedKey = deriveKey(key);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, derivedKey, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptField(ciphertext: string | null, key: string): string | null {
  if (!ciphertext) return null;

  const parts = ciphertext.split(':');
  if (parts.length !== 3) return null;

  const [ivHex, authTagHex, encrypted] = parts;
  const derivedKey = deriveKey(key);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
