# Threat Model — Aegis Core (OSS)

Last updated: 2026-05-14
Status: Alpha — Phase 5 baseline

---

## Overview

Aegis Core is a single-owner, self-hosted digital legacy release system. The owner configures switches, contacts, and estate information on their private server. When a switch triggers, the system notifies designated contacts and releases an encrypted information packet.

---

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Owner (authenticated session) | Fully trusted. Can configure all data, arm/disarm switches, manage contacts. |
| Contact (claim token) | Partially trusted. Can only act on their specific active claim via a one-time token. |
| System worker | Internal. Runs in-process. Same trust as the server itself. |
| S3 storage | Untrusted storage. Only receives ciphertext. No ability to decrypt. |
| SMTP/Telegram provider | Untrusted transport. Receives plaintext notification content (email subject/body). Does not receive encryption keys or account credentials. |
| Relay (SaaS) | External. OSS monitoring sends heartbeat; escrow (Phase 4+) trusts Relay to hold encrypted material. |

---

## Attack Surfaces

### 1. Authentication endpoint (`POST /api/auth/login`)
- **Threat:** Brute-force password guessing
- **Mitigation:** Argon2id password hashing (computationally expensive). TOTP optional second factor.
- **Gap:** No rate limiting on login endpoint. Relies on Argon2 latency only.

### 2. Claim portal (`GET /api/claim/:token/...`)
- **Threat:** Claim token guessing or brute force
- **Mitigation:** Tokens are 32 random bytes (SHA-256 stored). Guessing is computationally infeasible.
- **Gap:** Claim PIN brute force limited only in-memory; resets on restart.

### 3. Database file
- **Threat:** Direct file system access exposes encrypted data
- **Mitigation:** All PII fields encrypted with AES-256-GCM. Attacker needs both DB and field encryption key.
- **Gap:** Keys are environment variables on the same host. Compromise of host = compromise of all data.

### 4. S3/R2 storage bucket
- **Threat:** Bucket public exposure or credential leak
- **Mitigation:** Packets are AES-256-GCM encrypted before upload. Ciphertext is useless without the packet key.
- **Gap:** If S3 credentials and the encryption key are both leaked, packets can be decrypted.

### 5. Outbound notifications
- **Threat:** Notification content leaks PII to provider
- **Mitigation:** Notification bodies contain claim URLs and basic context, not estate account data. Providers never receive encryption keys.
- **Gap:** Email subject/body contain the contact's name and a time-sensitive URL. Email provider can see this.

### 6. Audit log
- **Threat:** Audit events accumulate PII over time
- **Mitigation:** `assertNoPhiKeys` enforces a blocklist of PII key names before any audit event is written.
- **Gap:** Shallow key check only; nested PII in complex metadata structures might not be caught.

### 7. CSRF attacks
- **Threat:** Cross-site request forgery via malicious page
- **Mitigation:** All state-changing requests require `X-CSRF-Token` header (HMAC of session ID).
- **Gap:** CSRF tokens are deterministic (same session = same token). Not time-bounded.

### 8. Session hijacking
- **Threat:** Session cookie stolen (XSS, network interception)
- **Mitigation:** HttpOnly cookie (no JS access). Secure flag in production. SameSite=Lax.
- **Gap:** No HSTS enforcement at app level (depends on reverse proxy). No certificate pinning.

---

## In-Scope Threats

- Unauthenticated access to owner data (auth bypass)
- Claim token interception or guessing (claim spoofing)
- Data exfiltration via DB file access
- Storage bucket exfiltration
- PII leakage into audit logs
- CSRF-based state modification
- Weak secrets in production config

---

## Out-of-Scope Threats (Alpha)

- Host OS compromise (root access to server)
- Supply chain attacks (dependencies)
- HSM-level key protection
- Side-channel attacks
- Social engineering of contacts
- Physical access to server hardware
- Denial-of-service attacks

---

## Known Gaps (to address before beta)

1. **No login rate limiting.** An attacker can attempt passwords rapidly; only Argon2 latency limits them.
2. **No TOTP recovery codes.** If the owner loses their TOTP device, they cannot log in without DB intervention.
3. **No password reset flow.** Lost password requires manual DB reset.
4. **Claim PIN rate limit is in-memory.** Server restart resets the counter.
5. **Single field encryption key.** Compromise of `AEGIS_FIELD_ENCRYPTION_KEY` decrypts all fields for all users.
6. **Deterministic CSRF tokens.** Not time-bounded; valid for the session lifetime.
7. **OSS has no relay link security model yet.** Auth-code exchange is Phase 5.

---

## Mitigations Summary

| Risk | Mitigation | Residual Risk |
|------|------------|---------------|
| Auth bypass | Argon2id + optional TOTP | No lockout on failed attempts |
| Data at rest exposure | AES-256-GCM field + packet encryption | Single key for all data |
| Claim spoofing | 32-byte random token stored as hash | PIN rate limit resets on restart |
| CSRF | HMAC-signed session-bound token | Token not time-bounded |
| Storage exposure | Encrypted before upload | Key on same host |
| PII in audit log | Write-time blocklist enforcement | Shallow check, not recursive |
