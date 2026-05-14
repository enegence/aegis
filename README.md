# Aegis Core

Open-source, self-hosted digital legacy switch (AGPL-3.0).

Aegis Core lets you organize your estate information, designate trusted contacts, and configure automated release if you become unavailable.

## What it does

- Stores encrypted estate items (financial accounts, property, digital assets, instructions)
- Manages trusted contacts with priority ordering
- Runs a dead man's switch in **trip** (date-based) or **heartbeat** (check-in) mode
- Notifies contacts via SMTP email or Telegram when a switch triggers
- Optionally integrates with [Aegis Relay](https://aegis.dms) for cloud monitoring and escrow

## Quick start

```bash
# Clone and start
git clone https://github.com/aegis-dms/aegis.git
cd aegis
docker compose up -d

# Open in browser
open http://localhost:3000
```

On first run, Aegis prompts you to create an owner account.

## Configuration

All configuration is done through the web UI. No config files required.

- **Settings → SMTP**: configure email delivery
- **Settings → Telegram**: configure Telegram bot delivery
- **Switches**: create and arm your deadman switch

## Requirements

- Docker + Docker Compose (recommended)
- Or: Node.js 20+, SQLite

## Backup

Back up both your `.env` and `data/aegis.db` together. Either one alone is not recoverable.

```bash
# Quick backup while running
cp .env backup/.env
sqlite3 data/aegis.db ".backup 'backup/aegis.db'"
```

See [docs/backups.md](docs/backups.md) for full backup, restore, and upgrade procedures.

## Documentation

- [Switches](docs/switches.md) — switch modes, lifecycle, readiness checks
- [Notifications](docs/notifications.md) — SMTP and Telegram setup
- [Deployment modes](docs/release-modes.md) — resilience options
- [Backup and restore](docs/backups.md) — data protection procedures

## Phase 2 status

Phase 2 is complete:

- Switch state machine (trip + heartbeat modes)
- Switch CRUD and action API
- Readiness checks and arming gates
- SMTP and Telegram notification providers
- Reminder and warning scheduler
- Worker polling loop
- Dashboard with live countdown
- Switch management UI
- Notification settings UI

**Phase 3** (packet generation, S3 dead-drop, contact cascade, claim portal, key delivery) is in progress.

## License

AGPL-3.0. See [LICENSE](LICENSE).
