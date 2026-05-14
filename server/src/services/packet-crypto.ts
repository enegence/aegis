import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm' as const;
const KEY_BYTES = 32;
const IV_BYTES = 12;

export interface EncryptedPacketResult {
  keyId: string;
  algorithm: typeof ALGORITHM;
  iv: string;
  authTag: string;
  ciphertext: Buffer;
  contentHash: string;
  encryptedObjectHash: string;
}

export function generatePacketKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

export function hashPlainPacket(packetJson: unknown): string {
  const canonical = JSON.stringify(canonicalize(packetJson));
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function hashEncryptedPacket(ciphertext: Buffer): string {
  return createHash('sha256').update(ciphertext).digest('hex');
}

export function encryptPacketJson(
  packetJson: unknown,
  key: Buffer,
  keyId: string,
): EncryptedPacketResult {
  const contentHash = hashPlainPacket(packetJson);
  const canonical = JSON.stringify(canonicalize(packetJson));
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const chunks: Buffer[] = [];
  chunks.push(cipher.update(Buffer.from(canonical, 'utf8')));
  chunks.push(cipher.final());
  const ciphertext = Buffer.concat(chunks);
  const authTag = cipher.getAuthTag();
  const encryptedObjectHash = hashEncryptedPacket(ciphertext);

  return {
    keyId,
    algorithm: ALGORITHM,
    iv: iv.toString('base64url'),
    authTag: authTag.toString('base64url'),
    ciphertext,
    contentHash,
    encryptedObjectHash,
  };
}

export function decryptPacketJson(
  ciphertext: Buffer,
  key: Buffer,
  iv: string,
  authTag: string,
): unknown {
  const ivBuf = Buffer.from(iv, 'base64url');
  const authTagBuf = Buffer.from(authTag, 'base64url');
  const decipher = createDecipheriv(ALGORITHM, key, ivBuf);
  decipher.setAuthTag(authTagBuf);
  const chunks: Buffer[] = [];
  chunks.push(decipher.update(ciphertext));
  chunks.push(decipher.final());
  const plaintext = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(plaintext) as unknown;
}

// File format: [12 bytes IV][16 bytes authTag][N bytes ciphertext]
export function serializeEncryptedPacket(result: EncryptedPacketResult): Buffer {
  const iv = Buffer.from(result.iv, 'base64url');
  const authTag = Buffer.from(result.authTag, 'base64url');
  return Buffer.concat([iv, authTag, result.ciphertext]);
}

export interface DeserializedPacket {
  iv: string;
  authTag: string;
  ciphertext: Buffer;
}

export function deserializeEncryptedPacket(data: Buffer): DeserializedPacket {
  const iv = data.subarray(0, 12).toString('base64url');
  const authTag = data.subarray(12, 28).toString('base64url');
  const ciphertext = data.subarray(28);
  return { iv, authTag, ciphertext };
}

// Deterministic JSON serialization: sort object keys recursively.
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const obj = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(obj)
      .sort()
      .map((k) => [k, canonicalize(obj[k])]),
  );
}
