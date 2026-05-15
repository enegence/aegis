# Aegis Core — Release Packaging

This document describes how to create and publish a versioned release of Aegis Core.

---

## Tagging a Release

Releases are triggered by pushing a Git tag matching `v*`:

```bash
git tag v0.1.0-beta
git push origin v0.1.0-beta
```

This triggers the `.github/workflows/release.yml` CI workflow, which:

1. Runs all unit and integration tests
2. Builds the Docker image tagged `aegis-core:v0.1.0-beta`
3. Creates release artifact files (see below)
4. Opens a **draft** GitHub Release with those artifacts attached

Review and publish the draft release in the GitHub UI when ready.

---

## Release Artifacts

Each release includes:

| Artifact | Description |
|---|---|
| `docker-compose-<version>.yml` | Pinned compose file referencing the exact tagged Docker image |
| `.env.example-<version>` | Example environment variable file for that release |

These files let users reproduce an exact deployment without tracking the latest tag.

---

## Installing / Upgrading

### First install

```bash
curl -O https://github.com/your-org/aegis/releases/download/v0.1.0-beta/docker-compose-v0.1.0-beta.yml
curl -O https://github.com/your-org/aegis/releases/download/v0.1.0-beta/.env.example-v0.1.0-beta
cp .env.example-v0.1.0-beta .env
# Edit .env with your secrets
docker compose -f docker-compose-v0.1.0-beta.yml up -d
```

### Upgrading to a new version

```bash
# 1. Stop the running container
docker compose -f docker-compose-<old-version>.yml down

# 2. Pull the new release artifacts
curl -O https://github.com/your-org/aegis/releases/download/<new-version>/docker-compose-<new-version>.yml

# 3. Start the new version
docker compose -f docker-compose-<new-version>.yml up -d
```

Review the release notes for any migration steps required before upgrading.

---

## Rollback

To roll back to a previous release:

```bash
# Stop current
docker compose -f docker-compose-<current-version>.yml down

# Re-start previous version using the pinned compose file
docker compose -f docker-compose-<previous-version>.yml up -d
```

If the upgrade applied database migrations, you may need to restore from a database backup before rolling back. Always take a backup before upgrading:

```bash
# SQLite backup (default Aegis Core storage)
cp data/aegis.db data/aegis.db.backup-$(date +%Y%m%d)
```

---

## Artifact Integrity

Docker Hub image digests serve as the artifact integrity mechanism in beta. Each image is identified by a unique content-addressable digest (e.g. `sha256:abc123...`).

To verify you are running the expected image:

```bash
docker inspect aegis-core:<version> | grep -i digest
```

GPG signing of release artifacts is not implemented in beta. It will be added before the stable 1.0 release.

---

## Version Numbering

Aegis Core follows [Semantic Versioning](https://semver.org/):

- `v0.x.y-beta` — beta releases (breaking changes possible between minor versions)
- `v1.x.y` — stable releases (breaking changes only on major version bumps)

Breaking changes (schema migrations, config renames, removed API endpoints) are documented in the GitHub Release notes.
