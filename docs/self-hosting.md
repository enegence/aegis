# Aegis Core — Self-Hosting Guide

## Requirements

| Component | Minimum |
|-----------|---------|
| Docker | 24+ (or Docker Desktop) |
| Docker Compose | v2+ (bundled with Docker Desktop) |
| RAM | 256 MB |
| Disk | 1 GB (more for large estate / many packets) |
| Ports | 8000 (or custom) exposed on your network |

Alternatively, run without Docker: Node.js 20+, SQLite.

## Docker Compose install (recommended)

```bash
# 1. Clone the repository
git clone https://github.com/aegis-dms/aegis.git
cd aegis

# 2. Run the interactive setup script to generate your .env
./setup.sh

# 3. Start the server
docker compose up -d

# 4. Open in your browser
open http://localhost:8000
```

On first visit, the setup wizard guides you through creating an owner account. No config files beyond `.env` are needed.

## Environment variables

All configuration is through `.env`. See [`.env.example`](../.env.example) for the full reference.

Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `AEGIS_SECRET_KEY` | Yes | Session secret (min 64 chars). Generate with `openssl rand -hex 64`. |
| `AEGIS_FIELD_ENCRYPTION_KEY` | Yes | Field encryption key (exactly 64 hex chars = 32 bytes). Generate with `openssl rand -hex 32`. |
| `AEGIS_DB_PATH` | Yes | SQLite database path. Default: `/data/aegis.db` (inside container). |
| `AEGIS_DATA_DIR` | Yes | Data directory for packet files. Default: `/data`. |
| `AEGIS_APP_URL` | Yes | Your public-facing URL, used in claim notification links. |
| `AEGIS_PORT` | No | Port to listen on. Default: `8000`. |
| `AEGIS_HOST` | No | Bind address. Default: `0.0.0.0`. |

Notification and storage credentials are configured in the Settings UI after first login, not in `.env`.

## Reverse proxy

Aegis is designed to run behind a reverse proxy (Nginx, Caddy, Traefik) for HTTPS termination.

**Nginx example:**

```nginx
server {
    listen 443 ssl;
    server_name aegis.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/aegis.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/aegis.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Caddy example:**

```caddyfile
aegis.yourdomain.com {
    reverse_proxy localhost:8000
}
```

**Important:** Set `AEGIS_APP_URL=https://aegis.yourdomain.com` in your `.env` so claim notification links are correct.

## Unraid

1. In Community Applications, search for Aegis or create a custom Docker container.
2. Map port `8000` to your preferred host port.
3. Map a host path to `/data` for persistent storage.
4. Set environment variables: `AEGIS_SECRET_KEY`, `AEGIS_FIELD_ENCRYPTION_KEY`, `AEGIS_APP_URL`, `NODE_ENV=production`.
5. Start the container and visit the mapped port.

## TrueNAS Scale / Kubernetes

Use the Docker Compose file as a reference. Set `restart: unless-stopped` and mount `/data` to a persistent dataset.

## Private access (Tailscale / VPN)

Aegis can be restricted to your Tailscale network for extra security:

- Set `AEGIS_HOST=0.0.0.0` and bind Aegis to your Tailscale IP.
- Or run Aegis on `localhost:8000` and expose only via Tailscale with its built-in reverse proxy.

**Important:** If contacts need to open claim URLs from outside your network, those URLs must be publicly reachable (or contacts must also be on your VPN/Tailscale network).

## Claim URL accessibility

When a switch triggers, Aegis sends contacts a claim URL like:

```
https://aegis.yourdomain.com/claim/<token>
```

This URL must be reachable by the contact without any login. If Aegis is not publicly accessible, contacts cannot open claims. Plan your network accordingly.

## Updating Aegis

See [upgrading.md](upgrading.md) for step-by-step upgrade instructions.

## See also

- [Backup and restore](backups.md)
- [Notification setup](notifications.md)
- [Storage setup](storage-setup.md)
- [Release modes](release-modes.md)
- [Troubleshooting](troubleshooting.md)
