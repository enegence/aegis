# Aegis Core — Backup and Restore

## What to back up

Aegis Core stores everything in two places:

| Path | Contents | Required for restore |
|------|----------|---------------------|
| `.env` | Encryption keys, session secret, provider credentials | **Yes** — without this, the database is unrecoverable |
| `data/aegis.db` | All application state: owner account, estate items, contacts, switches, packets, audit log | **Yes** |
| `data/packets/` | Local packet archives (if Vault or Dead Drop mode, before upload) | Recommended |
| `docker-compose.yml` (if customized) | Custom port, volume, or network config | Recommended |

## Critical warning

**Your `.env` and your database must be backed up together.** All sensitive fields in the database are encrypted with the key in `.env` (`AEGIS_FIELD_ENCRYPTION_KEY`). A database backup without the corresponding `.env` cannot be decrypted. A `.env` without a database backup loses all your application state.

Store both in a secure, offline location — a password manager's secure note or an encrypted archive on external media.

## Backup commands

### Full backup (recommended)

```bash
# Stop the container first for a consistent DB snapshot
docker compose stop

# Copy everything needed
cp .env backup/.env
cp docker-compose.yml backup/docker-compose.yml
cp data/aegis.db backup/aegis.db
cp -r data/packets/ backup/packets/ 2>/dev/null || true

# Restart
docker compose start
```

### Hot backup (while running)

SQLite supports online backup with the `.backup` command. To create a safe copy while Aegis is running:

```bash
sqlite3 data/aegis.db ".backup 'backup/aegis.db'"
```

This uses SQLite's built-in backup API which handles concurrent writes safely.

### Automated backup script

```bash
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR="./backups/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"
cp .env "$BACKUP_DIR/.env"
cp docker-compose.yml "$BACKUP_DIR/docker-compose.yml" 2>/dev/null || true
sqlite3 data/aegis.db ".backup '$BACKUP_DIR/aegis.db'"
cp -r data/packets/ "$BACKUP_DIR/packets/" 2>/dev/null || true
echo "Backup complete: $BACKUP_DIR"
```

Save as `backup.sh`, make executable (`chmod +x backup.sh`), and run via cron or manually before updates.

## S3 / Dead Drop backups

If you use Dead Drop mode, packets are uploaded to S3-compatible storage. The S3 bucket contains encrypted packet archives. These are useful only if you also have:

1. The encryption key (`AEGIS_FIELD_ENCRYPTION_KEY` in `.env`)
2. The packet metadata from the database (`data/aegis.db`)

Back up your S3 bucket separately using your provider's tools (e.g., `aws s3 sync`). S3 does not replace a database backup.

## Restore procedure

### To a new server

1. Install Docker and Docker Compose on the new server.
2. Clone or copy the Aegis directory.
3. Restore your `.env`: `cp backup/.env .env`
4. Restore your database: `mkdir -p data && cp backup/aegis.db data/aegis.db`
5. Restore packet files (if any): `cp -r backup/packets/ data/packets/`
6. Start Aegis: `docker compose up -d`
7. Verify by logging in and checking that your switches and estate items appear.

### Recovery checklist

- [ ] `.env` restored with correct keys
- [ ] `data/aegis.db` restored
- [ ] `data/packets/` restored (if applicable)
- [ ] Login successful
- [ ] Switches visible with correct state
- [ ] Estate items visible
- [ ] Notifications configured (SMTP/Telegram credentials in Settings)

## What is NOT backed up automatically

- **Relay API key** — stored encrypted in the database; backed up with `aegis.db`
- **SMTP/Telegram credentials** — stored encrypted in the database; backed up with `aegis.db`
- **S3 credentials** — stored encrypted in the database; backed up with `aegis.db`

All credentials are backed up as part of the database, but they are only usable if you also restore the corresponding `.env` with the field encryption key.

## Upgrade procedure

Before upgrading Aegis to a new version:

1. Run a full backup.
2. Pull the new image: `docker compose pull`
3. Restart: `docker compose up -d`
4. Check the [CHANGELOG](../CHANGELOG.md) for migration notes.

Aegis runs database migrations automatically on startup. If a migration fails, restore your backup and report the issue.

## See also

- [Self-hosting guide](self-hosting.md)
- [Docker configuration](../Dockerfile)
