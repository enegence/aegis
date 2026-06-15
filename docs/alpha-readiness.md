# Aegis Core — Alpha Readiness Checklist

Run this checklist before making an alpha deployment available to yourself or others.

## Unit tests

```bash
cd server && npx vitest run
```

- [ ] All 319+ server unit tests pass
- [ ] No skipped tests hiding failures

## Build

```bash
npm run build
```

- [ ] Web build succeeds (no TypeScript errors blocking build)
- [ ] Server TypeScript compiles cleanly (run `cd server && npx tsc --noEmit`)

## Docker

```bash
docker compose build
docker compose up -d
curl http://localhost:8000/health
```

- [ ] Docker image builds successfully
- [ ] Container starts and `/health` returns `{"status":"ok"}`
- [ ] Health check passes (`docker compose ps` shows `healthy`)

## Fresh install

Using a fresh database (or `docker compose down -v && docker compose up -d`):

- [ ] Navigating to the root URL shows the setup wizard
- [ ] `/api/setup/status` returns `{"ownerExists":false}`
- [ ] All state-changing API routes return 428 before setup
- [ ] Setup wizard completes and lands on dashboard
- [ ] Login works after logout

## Core functionality

- [ ] Estate items can be created, viewed, edited, deleted
- [ ] Contacts can be created, viewed, edited, deleted
- [ ] Switches can be created with correct mode options
- [ ] Switch readiness gates block arming until requirements met
- [ ] Dashboard shows live countdown and check-in button
- [ ] Check-in updates last check-in timestamp
- [ ] Audit log records all owner actions

## Notifications

- [ ] SMTP credentials can be saved (masked after save)
- [ ] Telegram credentials can be saved (masked after save)
- [ ] Test notification sends successfully (or shows clear failure)
- [ ] Test notification does not reveal stored credentials in the UI

## Packet generation

- [ ] Worker generates packet after estate items seeded (may require `AEGIS_WORKER_ENABLED=true`)
- [ ] Packet appears in dashboard/packets list
- [ ] Packet file exists on disk in `data/packets/`

## S3 / Packet Mirror (if enabled)

- [ ] S3 credentials can be saved (access key masked after save)
- [ ] Test connection succeeds
- [ ] Worker uploads packet to S3 in Packet Mirror mode
- [ ] Packet is not readable without encryption key

## Claim simulation

- [ ] Triggered switch creates contact claims
- [ ] Claim URL opens claim portal
- [ ] Invalid claim token returns 4xx (not 500)
- [ ] Claim state machine enforces step order: verified → accepted → downloaded → key viewed → acknowledged
- [ ] Acknowledge step completes claim

## Settings UI

- [ ] Settings page loads and shows all 8 tabs
- [ ] Secret fields show masked status (not raw values) after save
- [ ] TOTP setup flow generates QR-compatible secret
- [ ] TOTP enable/disable works with valid code
- [ ] Deployment mode card shows correct limitations
- [ ] Danger Zone shows backup reminder before actions

## Security checks

- [ ] Server refuses to start in production with default secrets
- [ ] CSRF token required on all state-changing requests
- [ ] `/api/settings` requires authentication
- [ ] Audit log does not contain plaintext PII, packet data, or credentials
- [ ] `GET /api/settings` response does not contain raw passwords or API keys

## Deployment modes

- [ ] Vault Mode copy accurately describes limitations (not guaranteed release if host offline)
- [ ] Packet Mirror copy mentions S3 requirement
- [ ] Relay Monitoring copy clarifies it does not execute release without Relay Escrow
- [ ] Relay Escrow copy mentions Relay subscription requirement

## Documentation

- [ ] `docs/self-hosting.md` exists and covers Docker, reverse proxy
- [ ] `docs/backups.md` covers `.env` + database backup warning
- [ ] `docs/release-modes.md` describes all modes accurately
- [ ] `docs/troubleshooting.md` covers common failure scenarios
- [ ] `docs/upgrading.md` covers upgrade procedure
- [ ] README includes quick start, config reference, backup warning

## Pre-release sign-off

Before tagging an alpha release:

- [ ] All checklist items above verified
- [ ] No hardcoded test credentials in production code paths
- [ ] No TODO/FIXME comments in security-critical code
- [ ] Version number updated in `server/src/routes/health.ts`
- [ ] Git tag created: `git tag -a v0.4.0-alpha -m "OSS Phase 4 alpha"`
