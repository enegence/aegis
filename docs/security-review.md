# Security Review — Aegis Core (OSS)

**Date:** 2026-05-14
**Reviewer:** Claude / Automated (Phase 5 Task 1)
**Scope:** OSS repo (`aegis/`) — all server code through Phase 4 + Phase 5 Task 1
**Status:** Alpha baseline — not a formal security audit

---

## What Was Checked

1. Authentication flow (login, session management, CSRF, TOTP)
2. Field encryption (contacts, estate items, TOTP secrets, packet keys)
3. Audit log redaction (PII blocklist, write-time enforcement)
4. Password hashing algorithm (Argon2id)
5. Secret validation at server startup
6. Claim token security (entropy, storage as hash)
7. Packet encryption (AES-256-GCM, per-packet keys)
8. S3 credential storage (encrypted at rest in app_settings)
9. Session cookie security properties (HttpOnly, SameSite, Secure)
10. CORS configuration

---

## What Passed

| Area | Finding |
|------|---------|
| Password hashing | Argon2id — correct choice for user passwords |
| Field encryption | AES-256-GCM with IV and auth tag — all PII columns use `*Encrypted` naming convention |
| Claim tokens | 32+ bytes of entropy, stored as SHA-256 only. Plaintext never persisted. |
| Packet keys | Per-packet keys, never stored decrypted |
| Audit log | `assertNoPhiKeys` enforced at write-time. PII key patterns: email, phone, name, institution, account, password, secret, token, apiKey, keyMaterial, plaintext, executorNotes. |
| Session management | HttpOnly cookies, SameSite=Lax, logout deletes server-side session |
| CSRF protection | HMAC-SHA256 of session ID, required on all state-changing routes |
| Startup validation | Production mode rejects `change-me` secrets and short keys |
| TOTP | Secret stored encrypted, not plaintext. Disable requires password + valid code. |
| CORS | Explicit origin allowlist; no wildcard with credentials |

---

## Known Gaps (Not Blocking Alpha)

| Gap | Severity | Notes |
|-----|----------|-------|
| No login rate limiting | Medium | Argon2 latency is the only defense. Add server-level rate limiting in Phase 5. |
| No TOTP recovery codes | Medium | If the owner loses their TOTP device, manual DB intervention is required. |
| No password change flow | Low | Settings page does not yet allow password change with current-password proof. |
| Claim PIN rate limit is in-memory | Medium | Resets on server restart. Move to DB-backed in Phase 5. |
| Deterministic CSRF tokens | Low | Tokens do not expire independently; they live as long as the session. |
| Single field encryption key for all data | Medium | Key rotation requires re-encrypting all rows. No rotation tooling yet. |
| SHA-256 key derivation | Low | Using `SHA-256(rawKey)` instead of HKDF. HKDF preferred for beta. |
| Audit PII check is shallow | Low | Nested objects not recursively checked in OSS (SaaS has recursive `sanitizeAuditMetadata`). |
| No formal external audit | High | Required before any regulated-data or production-scale deployment. |

---

## Deferred Items

The following items are architectural decisions deferred to beta/GA:

- Shamir Secret Sharing for multi-party key custody
- HSM or KMS for master key storage
- Zero-knowledge hosted encryption
- Key rotation automation
- Per-user encryption keys

---

## Test Coverage Summary

| Test file | What it proves |
|-----------|----------------|
| `tests/security-baseline.test.ts` | CSRF enforcement, session invalidation, startup validation, field encryption in DB, audit log redaction, TOTP secret storage |
| `tests/auth-routes.test.ts` | Login success/fail, cookie set, CSRF token endpoint |
| `tests/totp.test.ts` | TOTP setup, confirm, login challenge, disable flow |
| `tests/audit.test.ts` | PII key rejection, valid events accepted |
| `tests/estate.test.ts` | CRUD, CSRF enforcement |
| `tests/contacts.test.ts` | CRUD, encryption |
| `tests/claim-routes.test.ts` | Claim token validation, lifecycle |
| `tests/packet-crypto.test.ts` | Encryption/decryption round-trip |

Total test count at review: 340 passing (OSS server) + 6 todos for unimplemented gaps.

---

## Sign-off

This is an **automated alpha baseline review**, not a formal security audit. The codebase implements the security invariants defined in the architecture docs. The known gaps above are documented and tracked. No gaps are undocumented or ignored.

**Recommendation:** Do not deploy to production with real user data until:
1. Login rate limiting is implemented
2. TOTP recovery codes are implemented
3. A formal security review or pen test is conducted
