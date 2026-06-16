# Aegis Core

Open-source, self-hosted digital legacy switch (AGPL-3.0-only).

Aegis Core lets you organize your estate information, designate trusted contacts, and configure automated release if you become unavailable or incapacitated.

## What it does

- Stores encrypted estate items (financial accounts, property, digital assets, executor instructions)
- Manages trusted contacts with priority ordering and per-contact notification channels
- Runs a dead man's switch in **trip** (date-based) or **heartbeat** (check-in) mode
- Notifies contacts with a claim link when a switch triggers
- Generates encrypted release packets and delivers decryption keys to verified contacts
- Optionally integrates with [Aegis Relay](https://aegisdms.life) for cloud monitoring, escrow, and managed delivery

## What it is NOT

- Not a password manager — estate data is stored encrypted, not zero-knowledge
- Not a legal executor — Aegis delivers information; legal authority must be established separately
- Not a guaranteed delivery system — see [Deployment modes](#deployment-modes)
- Not a service — Aegis Core runs on your own infrastructure

## Deployment modes

| Mode | Storage | Release | Requirement |
|------|---------|---------|-------------|
| **Vault** | Local disk | This host must be reachable | None |
| **Packet Mirror** | S3-compatible | Packet copy survives host loss | S3 credentials |
| **Relay Monitoring** | Local or S3 | This host must still execute | Aegis Relay subscription |
| **Relay Escrow** | Relay server | Relay executes if host is gone | Aegis Relay subscription |
| **Hosted** | Aegis cloud | Fully managed | Aegis Hosted subscription |

Vault Mode is the default. **It does not guarantee automated release if this host goes offline.**

## Quick start

### Docker Compose (recommended)

```bash
git clone https://github.com/aegis-dms/aegis.git
cd aegis

# Generate secrets and write .env interactively
./setup.sh

# Start
./start.sh

# Open
open http://localhost:8000
```

### Without Docker

```bash
git clone https://github.com/aegis-dms/aegis.git
cd aegis
cp .env.example .env   # Edit .env with your secrets
npm install
npm run build
npm run db:migrate
node server/dist/index.js
```

## First-run setup

On first visit, Aegis prompts you to create an owner account. No config files beyond `.env` are required.

After setup, the Settings page lets you configure:

- Notification providers (SMTP, Telegram)
- S3-compatible storage for Packet Mirror mode
- Relay connection (if subscribed)
- Two-factor authentication (TOTP)

## Configuration reference

See [`.env.example`](.env.example) for all available variables.

| Variable | Required | Default |
|----------|----------|---------|
| `AEGIS_SECRET_KEY` | Yes | — |
| `AEGIS_FIELD_ENCRYPTION_KEY` | Yes | — |
| `AEGIS_DB_PATH` | Yes | `/data/aegis.db` |
| `AEGIS_DATA_DIR` | Yes | `/data` |
| `AEGIS_APP_URL` | Yes | `http://localhost:8000` |
| `AEGIS_PORT` | No | `8000` |
| `AEGIS_HOST_PORT` | No | `8000` |
| `AEGIS_HOST` | No | `0.0.0.0` |

Generate secrets with `./setup.sh` or manually:

```bash
# Session secret (min 64 chars)
openssl rand -hex 64

# Field encryption key (exactly 64 hex chars)
openssl rand -hex 32
```

## Backup

**Back up `.env` and `data/aegis.db` together.** Either alone is not recoverable.

```bash
# Hot backup while running
cp .env backup/.env
sqlite3 data/aegis.db ".backup 'backup/aegis.db'"
```

See [docs/backups.md](docs/backups.md) for full backup, restore, and upgrade procedures.

## Security model

- All PII stored encrypted at rest using AES-256-GCM (`AEGIS_FIELD_ENCRYPTION_KEY`)
- Session cookies are HttpOnly, SameSite=Lax, Secure in production
- CSRF protection on all state-changing endpoints
- Password hashed with Argon2id
- Optional TOTP second factor
- Audit log of all owner and claim actions
- **No zero-knowledge model in alpha** — server holds the field encryption key

See [docs/threat-model.md](docs/threat-model.md) and [docs/key-management.md](docs/key-management.md).

## Documentation

| Guide | Description |
|-------|-------------|
| [Self-hosting](docs/self-hosting.md) | Requirements, reverse proxy, Unraid, VPN notes |
| [Notification setup](docs/notifications.md) | SMTP and Telegram configuration |
| [Storage setup](docs/storage-setup.md) | S3, R2, MinIO, B2 |
| [Packet Mirror](docs/packet-mirror.md) | S3-backed encrypted packet copy |
| [Release modes](docs/release-modes.md) | Vault, Packet Mirror, Relay, Hosted |
| [Key management](docs/key-management.md) | Encryption model, release flow |
| [Threat model](docs/threat-model.md) | What Aegis protects against and doesn't |
| [Backup and restore](docs/backups.md) | Data protection procedures |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and fixes |
| [Upgrading](docs/upgrading.md) | Version upgrade procedure |
| [Switches](docs/switches.md) | Switch modes, lifecycle, readiness |

## Requirements

- Docker 24+ and Docker Compose v2 (recommended)
- OR Node.js 20+, SQLite

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
