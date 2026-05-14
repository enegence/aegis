# Aegis Core — Upgrading

## Before you upgrade

1. **Back up everything.** See [backups.md](backups.md).
2. Read the release notes for the version you are upgrading to.
3. Note the current version: `curl http://localhost:8000/health | jq .version`

## Docker Compose upgrade

```bash
# 1. Back up database and .env
cp .env backup/.env
sqlite3 data/aegis.db ".backup 'backup/aegis.db'"

# 2. Pull the new image
docker compose pull

# 3. Restart the container
docker compose up -d

# 4. Verify
curl http://localhost:8000/health
```

Aegis runs database migrations automatically on startup. If the container starts and the health endpoint returns `"status": "ok"`, the upgrade succeeded.

## Manual / source upgrade

```bash
# 1. Back up
cp .env backup/.env
sqlite3 data/aegis.db ".backup 'backup/aegis.db'"

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
sqlite3 data/aegis.db "SELECT * FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 10;"
```

## Rollback procedure

If an upgrade fails:

1. Stop Aegis: `docker compose stop`
2. Restore database: `cp backup/aegis.db data/aegis.db`
3. Restore `.env`: `cp backup/.env .env`
4. Revert to previous image: edit `docker-compose.yml` to pin the previous version, or `git checkout <previous-tag>`
5. Restart: `docker compose up -d`
6. Report the issue on GitHub with the error output from `docker compose logs aegis`.

## Alpha release notes

Alpha releases (0.x.x) may include breaking schema changes. Always back up before upgrading alpha versions.

Between alpha versions:

- Database migrations run automatically.
- `.env` format is stable within Phase 4 (new optional vars only).
- Cookie/session format may change — existing sessions may be invalidated, requiring re-login.
- No data migration is provided for alpha-to-alpha changes that affect encrypted fields (all fields continue to use the same `AEGIS_FIELD_ENCRYPTION_KEY`).
