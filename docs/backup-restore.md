# Backup and Restore

Aegis OSS provides an encrypted export/restore feature so you can safely back up all your data and move it between instances.

## Overview

Export creates a single encrypted JSON file containing:
- Your owner profile (name, email, timezone — no password hash)
- All estate items (decrypted, then re-encrypted into the bundle with your passphrase)
- All contacts (decrypted, then re-encrypted)
- Switch metadata (name, mode, status — not secrets or packet contents)
- Packet metadata (not packet contents or encryption keys)
- Release run metadata
- Audit event metadata (event types and timestamps only)
- Optionally: app settings (excluding raw storage credentials)

**Not included:**
- Your session tokens
- Raw password hash
- Packet contents (the actual files/secrets inside packets)
- Packet encryption keys
- Raw storage credentials (S3 access key / secret key)

## Export

### Via API

```http
POST /api/export
Cookie: aegis_session=<your-session>
X-CSRF-Token: <csrf-token>
Content-Type: application/json

{
  "passphrase": "your-strong-passphrase-here",
  "includeConfig": false
}
```

**Response:** A JSON export bundle (save the full response body).

### Export bundle format

```json
{
  "schemaVersion": "aegis-export-2026-05-01",
  "createdAt": "2026-05-14T12:00:00.000Z",
  "appVersion": "0.4.0-alpha",
  "encryption": {
    "algorithm": "aes-256-gcm",
    "kdf": "argon2id",
    "salt": "<hex>",
    "iv": "<hex>",
    "authTag": "<hex>"
  },
  "payloadHash": "<sha256 hex of plaintext payload>",
  "encryptedPayload": "<hex>"
}
```

The payload is encrypted using AES-256-GCM. The key is derived from your passphrase using argon2id (memory cost: 64 MB, time cost: 3 iterations). The `payloadHash` is a SHA-256 of the plaintext payload, verified after decryption to detect corruption.

### Passphrase warning

**You cannot recover your export without the passphrase.** There is no recovery mechanism. Store your passphrase securely (e.g., in a password manager) alongside the export file.

## Preview restore

Before performing a restore, you can preview what would be imported without making any changes to the database:

```http
POST /api/export/preview-restore
Cookie: aegis_session=<your-session>
X-CSRF-Token: <csrf-token>
Content-Type: application/json

{
  "bundle": <paste the full bundle JSON here>,
  "passphrase": "your-strong-passphrase-here"
}
```

**Response:**

```json
{
  "estateItems": 12,
  "contacts": 3,
  "switches": 2
}
```

No database changes are made during preview.

## Restore

> **Strongly recommended:** Create a fresh export of your current data before restoring from a backup. Restore with `overwrite: true` deletes existing estate items and contacts.

```http
POST /api/export/restore
Cookie: aegis_session=<your-session>
X-CSRF-Token: <csrf-token>
Content-Type: application/json

{
  "bundle": <paste the full bundle JSON here>,
  "passphrase": "your-strong-passphrase-here",
  "confirmed": true,
  "overwrite": false
}
```

### Restore behavior

| Scenario | Result |
|----------|--------|
| Empty DB, `confirmed: true` | Restores estate items and contacts |
| DB has data, `overwrite: false` (default) | Returns `409 Conflict` with error message |
| DB has data, `overwrite: true` | Deletes existing estate items and contacts, then restores from bundle |
| Wrong passphrase | Returns `400` decryption error |
| Wrong `schemaVersion` | Returns `400` schema version error |
| Missing `confirmed: true` | Returns `400` confirmation required error |

### What restore imports

- Estate items (re-encrypted with current instance's field encryption key)
- Contacts (re-encrypted with current instance's field encryption key)

Switches are not restored (they contain mode/configuration state that may be incompatible with a new instance). Release runs, packets, and audit events are also not restored (they are historical records tied to the source instance).

## Security notes

- Export bundles are safe to store on untrusted media (they require your passphrase to decrypt)
- The bundle never contains your password hash or session tokens
- The `payloadHash` field allows verifying bundle integrity
- argon2id KDF makes brute-force of the passphrase expensive — use a strong passphrase
- A passphrase-protected bundle is your only recovery option if the instance is lost

## Regular backup recommendation

Schedule regular exports as part of your operational routine:
- Before any Aegis upgrade
- After adding significant amounts of data
- At least monthly for active instances

Store exports in a location separate from your Aegis instance (e.g., encrypted cloud storage, offline USB drive).
