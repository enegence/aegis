# Key Management (Phase 3 — Local Release)

## Current model

Phase 3 uses **local key release only**. No Shamir Secret Sharing. No zero-knowledge claims.

### Field encryption key

- Set via `AEGIS_FIELD_ENCRYPTION_KEY` environment variable (must be 32+ chars)
- Used to encrypt all PII fields at rest (contacts, estate items)
- Used to encrypt packet decryption keys in the `encryption_keys` table
- Never logged, never included in audit events

### Packet key

- A fresh 32-byte random key is generated for each packet
- Stored as `base64(key)` encrypted with the field encryption key
- Stored in `encryption_keys` table with `purpose = 'packet_encryption'`
- Returned to verified contacts via `POST /api/claim/:token/key-view`
- Never included in audit event metadata

### Key lifecycle

```
generatePacketKey() → 32 random bytes
encryptField(key.toString('base64'), fieldKey) → stored in encryption_keys
...release event...
loadPacketKey(db, keyId) → encrypted key material
decryptField(encryptedKeyMaterial, fieldKey) → base64 key string
→ returned to contact in key-view response (not stored)
```

## What is NOT in Phase 3

- No Shamir Secret Sharing or threshold key recovery
- No "zero knowledge" guarantees — the server holds the key
- No relay escrow (key held by a third party) — that is Phase 4+
- No plaintext packet delivery — contacts must decrypt locally

## Hosted mode note (future)

For Hosted mode (Phase 4+), server-managed release will use a separate key hierarchy. The local release model described here applies to OSS Core only.
