# Security Checklist — Aegis Core (OSS)

Last updated: 2026-05-14
Reviewer: Automated (Claude / Phase 5 Task 1)
Status: Alpha — see Known Limitations

---

## Authentication

**Required behavior:** Single-owner login via password + optional TOTP. Session cookie is HttpOnly, SameSite=Lax. Default secrets rejected in production.

**Implemented files:**
- `server/src/auth/password.ts` — Argon2id hashing and verification
- `server/src/auth/session.ts` — nanoid session IDs, expiry enforcement, delete on logout
- `server/src/routes/auth.ts` — `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
- `server/src/config.ts` — startup validation rejects `change-me` or short secrets in `NODE_ENV=production`

**Tests proving behavior:**
- `server/tests/auth-routes.test.ts` — login success/reject, cookie present, 401 on wrong password
- `server/tests/security-baseline.test.ts` — fabricated session rejected, startup validation rejects weak secrets
- `server/tests/auth.test.ts` — Argon2 round-trip

**Manual review notes:** In-memory SQLite session store. No refresh token rotation. Single-device only.

**Known limitations:**
- No account lockout after repeated failed passwords (only TOTP attempts have locking at the claim-level)
- Sessions do not rotate on privilege change
- No multi-device session listing/revocation UI

---

## Session Management

**Required behavior:** Sessions have a 24-hour TTL. Expired sessions are deleted on access. Logout invalidates the session server-side.

**Implemented files:**
- `server/src/auth/session.ts` — `SESSION_TTL_MS = 24h`, `validateSession` deletes expired rows, `deleteSession`
- `server/src/db/schema.ts` — `sessions` table with `expiresAt`

**Tests proving behavior:**
- `server/tests/security-baseline.test.ts` — logout invalidates session (subsequent request → 401), fabricated session ID → 401

**Known limitations:**
- No sliding expiry (session does not extend on activity)
- No periodic cleanup of old expired sessions (they accumulate until accessed)

---

## CSRF Protection

**Required behavior:** All state-changing API routes require `X-CSRF-Token` matching an HMAC-SHA256 of the session ID. Token is derived deterministically from the session — no storage needed.

**Implemented files:**
- `server/src/auth/csrf.ts` — `deriveCsrfToken(sessionId, secret)` using HMAC-SHA256
- `server/src/auth/plugin.ts` — `requireCsrf` decorator checks `x-csrf-token` header
- Routes that use `requireCsrf`: estate, contacts, switches, packets, security, settings

**Tests proving behavior:**
- `server/tests/auth-routes.test.ts` — `GET /api/csrf` returns 64-char token, requires auth
- `server/tests/security-baseline.test.ts` — no CSRF token → 403, invalid token → 403, valid token → accepted
- `server/tests/estate.test.ts` — POST requires CSRF

**Known limitations:**
- CSRF tokens do not expire independently (tied to session lifetime)
- OSS uses deterministic derivation (same token for same session); SaaS uses time-based tokens

---

## Password Reset

**Required behavior:** OSS does not have a password reset flow — single-owner, no email. Password can only be changed via the settings page (requires current password proof).

**Implemented files:** Not applicable (OSS has no email delivery for reset)

**Tests proving behavior:** N/A

**Known limitations:**
- No password reset for OSS (by design — single-owner, local server)
- If the owner loses their password, they must reset the DB manually
- Password change via settings not yet implemented (documented in Phase 5)

---

## TOTP

**Required behavior:** TOTP setup via `/api/security/totp/start` (returns secret), `/api/security/totp/confirm` (enables), `/api/security/totp/disable` (requires password + code). TOTP secret stored encrypted.

**Implemented files:**
- `server/src/auth/totp.ts` — `generateTotpSecret`, `verifyTotpCode`, `encryptTotpSecret`, `decryptTotpSecret`
- `server/src/routes/security.ts` — start/confirm/disable endpoints
- `server/src/routes/auth.ts` — TOTP challenge on login

**Tests proving behavior:**
- `server/tests/totp.test.ts` — full TOTP flow: start, confirm, login challenge, disable
- `server/tests/security-baseline.test.ts` — secret stored encrypted (not plaintext), disable requires password

**Known limitations:**
- No TOTP recovery codes (documented gap; login is impossible if device is lost)
- Recovery requires manual DB intervention in the alpha

---

## TOTP Recovery Codes

**Required behavior:** Not yet implemented.

**Implemented files:** None

**Tests proving behavior:** `server/tests/security-baseline.test.ts` — `it.todo`

**Known limitations:**
- TOTP recovery codes are not implemented in alpha
- If the owner loses their TOTP device, manual DB reset is the only recovery path

---

## Password Change

**Required behavior:** Not yet implemented in OSS settings.

**Implemented files:** None

**Tests proving behavior:** `server/tests/security-baseline.test.ts` — `it.todo`

**Known limitations:** Password change requiring current-password proof is not implemented

---

## Field Encryption

**Required behavior:** All PII fields are AES-256-GCM encrypted at rest. The field encryption key is never stored in the DB, never logged, never included in audit events.

**Implemented files:**
- `server/src/services/field-encrypt.ts` — `encryptField` / `decryptField` using AES-256-GCM, SHA-256 derived key
- `server/src/db/schema.ts` — all `*Encrypted` column names for contacts and estate items
- Estate routes, contact routes — encrypt on write, decrypt on read

**Tests proving behavior:**
- `server/tests/security-baseline.test.ts` — `institutionName` and `executorNotes` not plaintext in DB, `email` and `fullName` not plaintext in DB
- `server/tests/estate.test.ts` (field-level tests not present; see security baseline)

**Known limitations:**
- Key is derived via SHA-256 (not HKDF); adequate for alpha but HKDF preferred for beta
- No key rotation path (rotating would require re-encrypting all rows)
- All fields share one key (no per-field or per-user key isolation)

---

## Packet Encryption

**Required behavior:** Packets are AES-256-GCM encrypted before storage. Per-packet keys stored encrypted in `encryption_keys` table. Packet key never stored in plaintext.

**Implemented files:**
- `server/src/services/packet-crypto.ts` — `buildEncryptedPacket`, `decryptPacket`
- `server/src/db/schema.ts` — `encryption_keys` table

**Tests proving behavior:**
- `server/tests/packet-crypto.test.ts` — encryption and decryption round-trip
- `server/tests/packet-builder.test.ts` — builder produces encrypted output

**Known limitations:** Key stored in `encryption_keys` encrypted by the same field encryption key. Compromise of one = compromise of all.

---

## Release-Run Authorization

**Required behavior:** Release runs are triggered by the worker only after a switch passes its trigger condition. Only one active release run per switch at a time.

**Implemented files:**
- `server/src/services/release-run.ts`
- `server/src/services/cascade.ts`
- `server/src/db/schema.ts` — `release_runs` table

**Tests proving behavior:**
- `server/tests/release-routes.test.ts`
- `server/tests/release-run.test.ts`

**Known limitations:** No manual admin override for stuck release runs in the UI.

---

## Claim Token Safety

**Required behavior:** Claim tokens are 32 bytes of entropy. Stored only as SHA-256 in the DB. Raw token travels only in outbound notification URLs, never logged.

**Implemented files:**
- `server/src/db/schema.ts` — `contact_claims.claim_token_hash` (comment documents this invariant)
- `server/src/services/cascade.ts` — token generation and hashing
- `server/src/routes/claim.ts` — token validated by hash lookup

**Tests proving behavior:**
- `server/tests/claim-routes.test.ts` — claim token validation
- `server/tests/cascade.test.ts`

**Known limitations:**
- Claim brute-force rate limiting is in-memory only (resets on restart)
- No claim expiry shortening after partial use

---

## Contact Verification

**Required behavior:** Contact claim flow requires token-based verification. PIN verification is optional and also token-gated.

**Implemented files:**
- `server/src/routes/claim.ts` — claim endpoints
- `server/src/db/schema.ts` — `contact_claims` table with status lifecycle

**Tests proving behavior:** `server/tests/claim-routes.test.ts`

**Known limitations:** Claim PIN brute-force throttling is not yet implemented (see `it.todo` in security-baseline)

---

## Relay Linking

**Required behavior (Phase 4+ only):** Not yet in OSS Phase 4.

**Known limitations:** Relay Escrow linking uses the SaaS authorization-code flow; OSS Phase 5 will add the auth-code exchange endpoint.

---

## API Key Handling

**Required behavior:** Dead Drop API keys (future). Relay API keys exist in SaaS only. No API keys in OSS URL query strings.

**Known limitations:** OSS does not issue or store API keys in Phase 4/5. Heartbeat auth for relay connections lives entirely in SaaS.

---

## Audit Log Redaction

**Required behavior:** `writeAuditEvent` rejects any metadata with PII-like keys (email, phone, name, institution, account, password, secret, token, apiKey, keyMaterial, plaintext, executorNotes). Events with invalid metadata are not written.

**Implemented files:**
- `server/src/services/audit.ts` — `assertNoPhiKeys` checks metadata before insert

**Tests proving behavior:**
- `server/tests/audit.test.ts` — PII key rejection for email, phoneNumber, secretKey, apiKey
- `server/tests/security-baseline.test.ts` — audit events via app contain no plaintext PII

**Known limitations:**
- Blocklist approach (known PII keys). New fields not on the list could slip through.
- Nested object PII keys are not recursively checked (shallow check only in OSS).

---

## Admin Route Authorization

**Required behavior:** OSS has no admin routes (single-owner model). All routes require session auth.

**Known limitations:** N/A

---

## Billing Webhook Validation

**Required behavior:** N/A — OSS has no billing.

---

## Storage Credential Handling

**Required behavior:** S3 credentials stored encrypted in `app_settings` table. Access key ID and secret access key stored with `encrypted = true`.

**Implemented files:**
- `server/src/services/storage/` — S3 client initialization reads from encrypted settings
- `server/src/db/schema.ts` — `app_settings` with `encrypted` flag

**Tests proving behavior:** `server/tests/storage-s3.test.ts`

**Known limitations:** Credentials are encrypted at rest but decrypted in memory at runtime.

---

## Notification Payload Minimization

**Required behavior:** Notification events in the DB store contact ID references, not plaintext email/phone. `notificationEvents` table has no plaintext recipient column.

**Implemented files:**
- `server/src/db/schema.ts` — `notification_events` has `contactId` FK but no `recipientEmail` column

**Tests proving behavior:** `server/tests/notifications.test.ts`

**Known limitations:** The rendered notification email bodies (in-memory before sending) contain the decrypted email address. This is necessary for delivery.

---

## Rate Limiting

**Required behavior:** Login, claim, and setup endpoints are rate-limited.

**Implemented files:** NOT IMPLEMENTED. No rate limiting exists for any endpoint (login, TOTP, claim PIN verification, setup). This is a known gap before beta.

**Tests proving behavior:** `server/tests/security-baseline.test.ts` — `it.todo` for claim PIN throttle

**Known limitations:** Rate limiting is entirely absent. No in-process counters, no middleware, no token-bucket logic. All endpoints (login, claim PIN, TOTP, password reset) are unlimited. Critical gap — must be addressed before beta.

---

## Backup/Export Handling

**Required behavior:** Not yet implemented.

**Known limitations:** Data export and secure deletion are Phase 5 items.

---

## Account Deletion

**Required behavior:** Not yet implemented.

**Known limitations:** Factory reset clears data but does not zero encrypted fields before deletion.
