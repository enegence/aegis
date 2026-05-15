# Aegis OSS — Operations Guide

## Health Checks

### Public health endpoint

```
GET /health
```

Returns `{ "status": "ok", "version": "0.1.0", "uptime": <seconds> }`.
No authentication required. Safe to call from load balancers, uptime monitors, and Docker healthchecks.

### Detailed health endpoint (owner-only)

```
GET /api/health/details
Authorization: session cookie required (owner account)
```

Returns a structured health report with no PII or secrets:

```json
{
  "database":   { "status": "ok" },
  "worker":     { "status": "ok|degraded|unknown", "lastTickAt": "<ISO>", "lastSuccessAt": "<ISO>", "tickDurationMs": 123 },
  "storage":    { "status": "ok|error|unconfigured" },
  "notifications": { "failedCount": 0, "retryableCount": 2 },
  "activeReleaseRuns": 0,
  "pendingClaims": 0,
  "alerts": []
}
```

**Status values:**
- `database.status` — `ok` (query succeeded) or `error` (query failed)
- `worker.status` — `ok` (last tick within threshold), `degraded` (stale), `unknown` (no heartbeat recorded)
- `storage.status` — `ok` (S3 bucket configured), `unconfigured` (no S3 config), `error`

---

## Worker Heartbeat

The background worker writes a single-row upsert to `worker_heartbeats` (id = `singleton`) on every tick.

| Field | Description |
|-------|-------------|
| `lastTickAt` | Timestamp the worker started its most recent tick |
| `lastSuccessAt` | Timestamp the most recent tick completed without error |
| `lastErrorAt` | Timestamp of the most recent tick that threw an error |
| `lastErrorRedacted` | Error class name only — no stack trace, no user data |
| `tickDurationMs` | Duration of the most recent successful tick in milliseconds |

**Interpreting worker status:**
- `ok` — `lastTickAt` is within the configured stale threshold (`ALERT_WORKER_STALE_MINUTES`, default 10 minutes)
- `degraded` — worker ticked before, but `lastTickAt` is beyond the stale threshold
- `unknown` — no heartbeat row exists (worker has never run, or table is new)

To enable the worker: set `AEGIS_WORKER_ENABLED=true`.

---

## Alerts

Alerts are evaluated on every call to `/api/health/details`. They are read-only computed state — no persistent alert records.

| Type | Severity | Condition |
|------|----------|-----------|
| `worker_never_ticked` | warning | No heartbeat row exists |
| `worker_stale` | critical | `lastTickAt` older than `ALERT_WORKER_STALE_MINUTES` (default 10) |
| `notification_failures_threshold` | warning | `failed_permanent` delivery count ≥ `ALERT_FAILED_NOTIFICATION_COUNT` (default 5) |
| `stuck_release_run` | critical | Active release run older than `ALERT_STUCK_RELEASE_RUN_HOURS` (default 24) |

**Environment variables to tune thresholds:**

```
ALERT_WORKER_STALE_MINUTES=10
ALERT_FAILED_NOTIFICATION_COUNT=5
ALERT_STUCK_RELEASE_RUN_HOURS=24
```

**Resolving alerts:**

- `worker_stale` / `worker_never_ticked` — Check that `AEGIS_WORKER_ENABLED=true` and the process is running. Check server logs for `[worker] tick error:` entries.
- `notification_failures_threshold` — Check `notification_deliveries` table for `status='failed_permanent'` rows. Investigate `last_error_code` and `last_error_message_redacted`. Likely a provider API key issue.
- `stuck_release_run` — Check `release_runs` table for active/cascade_active rows older than 24h. May indicate a cascade loop. Review audit events for the run.

---

## Log Format

Aegis uses [pino](https://getpino.io/) structured JSON logging (via Fastify's built-in logger).

### Log fields

```json
{
  "level": "info",
  "time": 1747785600000,
  "msg": "...",
  "req": { "method": "GET", "url": "/health", "requestId": "req-1" },
  "res": { "statusCode": 200 }
}
```

### Redacted fields

The following fields are automatically replaced with `"[Redacted]"` in all log output:

- `password`, `passwordHash`, `sessionId`, `csrfToken`
- `req.headers.authorization`, `req.headers.cookie`
- `*.apiKey`, `*.apiSecret`, `*.secretAccessKey`, `*.accessKeyId`
- `*.s3SecretKey`, `*.s3AccessKey`, `*.packetKey`, `*.releaseKey`
- `*.encryptionKey`, `*.totpSecret`, `*.keyMaterialEncrypted`
- `*.email`, `*.phone`, `*.fullName`, `*.institutionName`
- `*.fullNameEncrypted`, `*.emailEncrypted`, `*.phoneEncrypted`

### Log levels

- `error` — Unrecoverable errors requiring attention
- `warn` — Unexpected states, retryable failures
- `info` — Normal operational events (default level)
- `debug` — Verbose detail (set `LOG_LEVEL=debug` to enable)

Set the log level with the `LOG_LEVEL` environment variable (default: `info`).
