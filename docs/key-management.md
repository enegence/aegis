# Key Management — Aegis Core (OSS)

Last updated: 2026-05-14
Status: Alpha — Phase 5 baseline

---

## Current Alpha Model

Aegis Core uses **local key management only**. No Shamir Secret Sharing. No HSM. No zero-knowledge claims. The server holds all keys.

---

## Keys in Use

### Field Encryption Key (`AEGIS_FIELD_ENCRYPTION_KEY`)

- **Purpose:** Encrypts all PII fields in the database (contact names, emails, phones, estate institution names, executor notes, etc.)
- **Format:** Must be exactly 64 hex characters (32 bytes) in production
- **Storage:** Environment variable only. Never persisted in the database.
- **Derivation:** SHA-256 of the raw key string → 32-byte AES key
- **Algorithm:** AES-256-GCM
- **Where used:**
  - `server/src/services/field-encrypt.ts` — `encryptField` / `decryptField`
  - TOTP secret encryption/decryption
  - Packet key encryption/decryption
- **What is encrypted:**
  - `contacts`: fullName, relationship, email, phone, telegramHandle, backupNotes
  - `estate_items`: institutionName, accountType, referenceHint, assetDescription, locationNotes, executorNotes
  - `owner`: totpSecretEncrypted
  - `app_settings`: S3 access key ID, secret access key (marked `encrypted = true`)
  - `encryption_keys`: keyMaterialEncrypted (per-packet keys)

### Secret Key (`AEGIS_SECRET_KEY`)

- **Purpose:** HMAC for CSRF token derivation and cookie signing
- **Format:** Minimum 64 characters in production
- **Storage:** Environment variable only
- **Where used:**
  - `server/src/auth/csrf.ts` — HMAC-SHA256 of session ID
  - `@fastify/cookie` — signs cookie value to prevent tampering

### Session Token (in-process)

- **Purpose:** Identifies an authenticated session
- **Format:** nanoid(48) — 48 random characters
- **Storage:** `sessions` table in SQLite (by reference, not secret)
- **Lifetime:** 24 hours from creation
- **Security properties:** Random enough to be unguessable; deleted on logout

### Packet Key (per-packet)

- **Purpose:** Encrypts the packet contents (estate items, contact info for release)
- **Format:** 32 random bytes
- **Storage:** Encrypted with the field encryption key and stored in `encryption_keys`
- **Lifecycle:**
  ```
  generatePacketKey() → 32 random bytes
  encryptField(key.toString('base64'), fieldEncryptionKey) → stored in encryption_keys
  ...release event...
  loadPacketKey(db, keyId) → reads encrypted key from DB
  decryptField(encryptedKeyMaterial, fieldEncryptionKey) → base64 key string
  → returned to verified contact in /api/claim/:token/key-view response
  → NOT stored anywhere after delivery
  ```

### Claim Token (per-claim)

- **Purpose:** One-time URL token for a contact to access their claim
- **Format:** nanoid(32) or crypto.randomBytes(32) as hex — high entropy
- **Storage:** SHA-256 hash stored in `contact_claims.claim_token_hash`. Plaintext never persisted.
- **Transmission:** Included in outbound notification URL only. Not in any log.

### TOTP Secret (per-owner)

- **Purpose:** Seed for TOTP second factor
- **Storage:** Encrypted with field encryption key and stored in `owner.totp_secret_encrypted`
- **Plaintext:** Only exists in-memory during setup response (shown once to user for QR scan)

---

## Trust Model

```
Owner (device) ──────► Server Process
                            │
                   ┌────────┴────────┐
                   ▼                 ▼
          Field Encryption Key    Secret Key
          (env var)               (env var)
                   │
         ┌─────────┴──────────┐
         ▼                    ▼
   SQLite DB fields      S3 Packets
   (ciphertext only)     (ciphertext only)
```

**Trust chain:** Everything depends on the field encryption key environment variable. If the host is compromised and the attacker reads env vars, all data can be decrypted.

---

## Alpha Limitations

| Feature | Status |
|---------|--------|
| Shamir Secret Sharing | Not implemented |
| HSM-backed key storage | Not implemented |
| Per-user derived keys | Not implemented (single key for all data) |
| Key rotation | Not implemented (would require re-encrypting all rows) |
| Zero-knowledge guarantees | Not implemented (server holds the key) |
| TOTP recovery codes | Implemented (Phase 5 Task 10) |

---

## What Changes in Beta / GA

1. **HKDF key derivation** — switch from `SHA-256(rawKey)` to `HKDF-SHA256` with context string for key derivation (already done in SaaS; OSS pending).
2. **TOTP recovery codes** — implemented in Phase 5 Task 10; generated at setup, stored as hashed values, single-use.
3. **Key rotation path** — migration script to re-encrypt all fields with a new key.
4. **Consider HSM for packet key custody** — move `encryption_keys` table to a managed KMS (Vault, AWS KMS) for production deployments.

---

## Security Non-Negotiables

1. `AEGIS_FIELD_ENCRYPTION_KEY` is NEVER written to the database, logs, or audit events.
2. `AEGIS_SECRET_KEY` is NEVER returned in any API response.
3. Packet keys are NEVER stored decrypted. They are decrypted transiently in memory for key-view delivery only.
4. Claim tokens are NEVER stored as plaintext. SHA-256 hash only.
5. TOTP secrets are NEVER returned after initial setup (only the derived otpauth URL is shown again).
