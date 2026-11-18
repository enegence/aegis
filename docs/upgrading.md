# Underwing Core: Upgrading

## Upgrading from Aegis Core

Aegis Core is now Underwing Core. An existing install keeps working after the upgrade with no edits to `.env` and no file moves. This is what changes and what you will see.

**Start it the same way you always have.** With Docker Compose, use `./start.sh`, or run `docker compose up -d --build --remove-orphans`. The Compose service is now called `underwing` (it was `aegis`). `--remove-orphans` replaces the old `aegis` container; without it the old container keeps running, holds the port and the database, and the new one cannot start cleanly. Use `docker compose logs underwing` to read logs afterwards.

**Your `.env` keeps working.** Settings are now named `UNDERWING_*`. The old `AEGIS_*` names are still read. For each old name in use, the server logs one line at start, for example:

```
[config] AEGIS_SECRET_KEY is the old name for UNDERWING_SECRET_KEY. It still works; rename it in your .env when convenient.
```

The line names the variable and never prints its value. To clear the warnings, rename the variables in `.env` (keep every value exactly as it is) and restart. If both names are set, the new one wins. Do not change `UNDERWING_SECRET_KEY` or `UNDERWING_FIELD_ENCRYPTION_KEY` values: the field encryption key is what decrypts your data.

| Old name | New name |
|----------|----------|
| `AEGIS_PORT` | `UNDERWING_PORT` |
| `AEGIS_HOST` | `UNDERWING_HOST` |
| `AEGIS_HOST_PORT` | `UNDERWING_HOST_PORT` |
| `AEGIS_APP_URL` | `UNDERWING_APP_URL` |
| `AEGIS_DB_PATH` | `UNDERWING_DB_PATH` |
| `AEGIS_DATA_DIR` | `UNDERWING_DATA_DIR` |
| `AEGIS_SECRET_KEY` | `UNDERWING_SECRET_KEY` |
| `AEGIS_FIELD_ENCRYPTION_KEY` | `UNDERWING_FIELD_ENCRYPTION_KEY` |
| `AEGIS_SMTP_HOST` | `UNDERWING_SMTP_HOST` |
| `AEGIS_SMTP_PORT` | `UNDERWING_SMTP_PORT` |
| `AEGIS_SMTP_USER` | `UNDERWING_SMTP_USER` |
| `AEGIS_SMTP_PASSWORD` | `UNDERWING_SMTP_PASSWORD` |
| `AEGIS_SMTP_FROM` | `UNDERWING_SMTP_FROM` |
| `AEGIS_SMTP_SECURE` | `UNDERWING_SMTP_SECURE` |
| `AEGIS_TELEGRAM_BOT_TOKEN` | `UNDERWING_TELEGRAM_BOT_TOKEN` |
| `AEGIS_TELEGRAM_CHAT_ID` | `UNDERWING_TELEGRAM_CHAT_ID` |
| `AEGIS_S3_ENDPOINT` | `UNDERWING_S3_ENDPOINT` |
| `AEGIS_S3_REGION` | `UNDERWING_S3_REGION` |
| `AEGIS_S3_BUCKET` | `UNDERWING_S3_BUCKET` |
| `AEGIS_S3_ACCESS_KEY_ID` | `UNDERWING_S3_ACCESS_KEY_ID` |
| `AEGIS_S3_SECRET_ACCESS_KEY` | `UNDERWING_S3_SECRET_ACCESS_KEY` |
| `AEGIS_S3_PREFIX` | `UNDERWING_S3_PREFIX` |
| `AEGIS_WORKER_ENABLED` | `UNDERWING_WORKER_ENABLED` |
| `AEGIS_WORKER_INTERVAL_SECONDS` | `UNDERWING_WORKER_INTERVAL_SECONDS` |
| `AEGIS_RELAY_HEARTBEAT_SECONDS` | `UNDERWING_RELAY_HEARTBEAT_SECONDS` |

**Your database stays where it is.** New installs use `data/underwing.db`. If `data/aegis.db` exists and `data/underwing.db` does not, the server keeps using `data/aegis.db` and logs one line saying so. Nothing is moved, copied or created beside it. Wherever this documentation says `data/underwing.db`, use `data/aegis.db` on such an install. If you want the new file name, stop the server, rename `aegis.db` (and any `aegis.db-wal` and `aegis.db-shm` beside it) to `underwing.db`, set `UNDERWING_DB_PATH` to match if you set a path, and start again. This is optional.

**You sign in once more.** The session cookie is now `underwing_session`, so the browser's old session is not recognised. Sign in again; nothing else is lost. Your saved theme choice carries over.

**Mirrored packets stay reachable.** Packets already mirrored to S3 keep their object keys (old default prefix `aegis`, suffix `.aegis.enc`); each packet's exact key is stored in the database and is what verify, download and delete use. A prefix you already saved stays in effect. New installs default to the prefix `underwing`, and new uploads everywhere end in `.underwing.enc`. If your bucket policy only allows `*.aegis.enc` object names, widen it to cover `.underwing.enc` under your prefix.

**Names recipients see.** A packet downloaded from the claim page is now named `underwing-packet-<id>.underwing.enc` (it was `aegis-packet-<id>.bin`). The contents and the way it is decrypted are unchanged.

**Existing two-factor entries keep working.** New enrolments show up in the authenticator app as "Underwing Core".

**Backups made before the rename restore as before.** The export format has not changed.

## Before you upgrade

1. **Back up everything.** See [backups.md](backups.md).
2. Read the release notes for the version you are upgrading to.
3. Note the current version: `curl http://localhost:8000/health | jq .version`

## Docker Compose upgrade

```bash
# 1. Back up database and .env
cp .env backup/.env
sqlite3 data/underwing.db ".backup 'backup/underwing.db'"

# 2. Pull the new image
docker compose pull

# 3. Restart the container
docker compose up -d --remove-orphans

# 4. Verify
curl http://localhost:8000/health
```

Underwing Core runs database migrations automatically on startup. If the container starts and the health endpoint returns `"status": "ok"`, the upgrade succeeded.

## Manual / source upgrade

```bash
# 1. Back up
cp .env backup/.env
sqlite3 data/underwing.db ".backup 'backup/underwing.db'"

# 2. Pull changes
git pull

# 3. Install dependencies
npm install

# 4. Build
npm run build

# 5. Run migrations
npm run db:migrate

# 6. Restart server
# (stop existing process, then:)
node server/dist/index.js
```

## Checking migration status

```bash
# List applied migrations
sqlite3 data/underwing.db "SELECT * FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 10;"
```

## Rollback procedure

If an upgrade fails:

1. Stop Underwing Core: `docker compose stop`
2. Restore database: `cp backup/underwing.db data/underwing.db`
3. Restore `.env`: `cp backup/.env .env`
4. Revert to previous image: edit `docker-compose.yml` to pin the previous version, or `git checkout <previous-tag>`
5. Restart: `docker compose up -d`
6. Report the issue on GitHub with the error output from `docker compose logs underwing`.

## Alpha release notes

Alpha releases (0.x.x) may include breaking schema changes. Always back up before upgrading alpha versions.

Between alpha versions:

- Database migrations run automatically.
- `.env` format is stable within Phase 4 (new optional vars only).
- Cookie/session format may change — existing sessions may be invalidated, requiring re-login.
- No data migration is provided for alpha-to-alpha changes that affect encrypted fields (all fields continue to use the same `UNDERWING_FIELD_ENCRYPTION_KEY`).
