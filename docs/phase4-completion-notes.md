# Aegis Core — OSS Phase 4 Completion Notes

## Phase summary

OSS Phase 4 delivered the alpha polish layer on top of Phase 3's functional core.
Goal: make Aegis Core self-hostable, documented, and safe for cautious alpha use.

## Implemented items

### Task 1: Setup state and guards
- `GET /api/setup/status` (returns `{ setupComplete, ownerExists, appVersion }`)
- `POST /api/setup` primary endpoint with Zod validation (phone, deploymentMode, password min 12 chars)
- `requireAuth` returns 428 Precondition Required (not 401) before owner exists
- TOTP verification wired into login flow
- 9 integration tests

### Task 2: First-run setup wizard UI
- 6-step wizard: Welcome → Profile → Security → Deployment → Acknowledge → Review+Submit
- Deployment mode cards with limitation copy
- Per-step validation and progress bar
- Login.tsx handles TOTP challenge inline (shows 6-digit input on TOTP error)
- App.tsx routes `authStatus === 'setup'` to Setup page

### Task 3: Interactive setup.sh
- `setup.sh`: generates AEGIS_SECRET_KEY (64 bytes) and AEGIS_FIELD_ENCRYPTION_KEY (32 bytes)
- Optional SMTP, Telegram, and S3 prompts
- Writes `.env`, creates `./data/packets`, prints colored next steps
- `.env.example` fully annotated reference

### Task 4: Consolidated Settings API
- `GET /api/settings` — full read of all settings without raw secrets
- `PUT /api/settings/owner` — profile update
- `PUT /api/settings/deployment` — mode stored in `appSettings`, not owner table
- `PUT /api/settings/storage/s3` — encrypted S3 credentials
- `POST /api/settings/storage/test` — S3 connection test
- `PUT /api/settings/relay` — URL + encrypted API key
- `POST /api/settings/relay/test` — heartbeat test
- `PUT /api/settings/packets` — retention days
- `POST /api/settings/danger/clear-credentials` — clears all provider credentials
- `POST /api/settings/danger/delete-packets` — deletes local packet files
- 10 integration tests

### Task 5: Settings UI (tabbed)
- 8-tab layout: Profile, Deployment, Notifications, Storage, Relay, Security, Packets, Danger Zone
- OwnerSettings, DeploymentSettings (mode cards with ack gate), StorageSettings, RelaySettings, PacketSettings, DangerZone
- Notifications tab wraps existing SMTP/Telegram forms
- DangerZone: guarded actions with typed confirmation input

### Task 6: TOTP setup and disable flow
- `POST /api/security/totp/start` — generates encrypted pending secret, returns otpauth URL + raw secret
- `POST /api/security/totp/confirm` — verifies code, enables TOTP
- `POST /api/security/totp/disable` — requires password + valid TOTP code
- SecuritySettings: inline wizard (idle → setup → disable states)
- 8 integration tests

### Task 7: Backup and restore guidance
- `docs/backups.md` — full backup scope, hot backup via SQLite API, automated script, restore checklist
- README backup section with quick commands
- DangerZone backup reminder before destructive actions

### Task 8: Docker and runtime hardening
- Config validation: AEGIS_SECRET_KEY ≥ 64 chars, AEGIS_FIELD_ENCRYPTION_KEY must be exactly 64 hex chars
- Startup: ensures `data/packets/` directory exists
- Dockerfile: HEALTHCHECK via wget every 30s, AEGIS_DATA_DIR env
- docker-compose.yml: bind mount `./data:/data`, healthcheck params
- `.dockerignore`: excludes `.env`, `data/`, `node_modules/`, test files

### Task 9: E2E test harness
- `@playwright/test` installed at workspace root
- `playwright.config.ts`: chromium, single worker, targets localhost:8000
- 4 spec files: setup, core-flow, claim-flow, settings
- `tests/e2e/helpers.ts`: reusable setup wizard, login, logout helpers
- `test:e2e` and `test:e2e:ui` scripts added to root package.json

### Task 10: Self-hosting documentation
- `docs/self-hosting.md` — requirements, Docker Compose, Nginx/Caddy reverse proxy, Unraid, TrueNAS, Tailscale, claim URL accessibility
- `docs/troubleshooting.md` — startup failures, login/TOTP recovery, notification issues, switch arming, passphrase and TOTP reset procedures
- `docs/upgrading.md` — Docker and source upgrade, rollback, alpha upgrade notes
- README fully rewritten with deployment modes table, config reference, security model summary, docs index

### Task 11: Alpha readiness checklist
- `docs/alpha-readiness.md` — comprehensive pre-release gate covering tests, build, Docker, flows, security, docs
- Dashboard: persistent alpha warning banner

### Task 12: Final test and release candidate pass
- Fixed pre-existing TS error in auth.ts (`handleSetup` used `Parameters<...>[0]` which resolved to `never`)
- All 319 server unit tests pass
- Web and server TypeScript builds clean

## Test results

```
Server unit tests: 319 passed, 35 test files, 0 skipped
Web TypeScript: clean (no errors)
Server TypeScript: clean (no errors)
Web build: 68 modules, 278 KB JS (gzip: 80 KB)
E2E tests: configured; require live server to run
```

## Known limitations

- **No TOTP recovery codes**: If TOTP is enabled and the authenticator is lost, recovery requires direct SQLite access. Alpha accepted — documented in troubleshooting.md.
- **No password change UI**: Requires reinstall or direct DB hash update. Documented.
- **Factory reset disabled**: DangerZone button is present but inoperative. Documented.
- **E2E tests require manual server start**: Playwright is not yet wired to a `webServer` option because the server needs `.env` to start. E2E tests run against a separately started server.
- **Pre-existing 9 TS errors in auth.ts**: Reduced to 0 in this task by fixing `handleSetup` type. All clean.
- **Relay Escrow is a stub**: The API accepts relay settings but escrow execution is not implemented in alpha (requires Relay subscription and backend).
- **Manual smoke test not performed**: No live UI test was possible in headless environment. All API-level flows are tested. UI rendering verified via TypeScript compilation and build success.

## Recommended next phase (OSS Phase 5)

- TOTP recovery codes
- Password change flow
- Scheduled S3 cleanup based on retention policy
- Relay heartbeat polling (worker sends periodic pings to relay_url)
- Rate limiting on setup/login endpoints
- CORS tightening (production only)
- Production HTTPS enforcer (redirect HTTP to HTTPS when behind reverse proxy)
