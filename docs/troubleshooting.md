# Aegis Core — Troubleshooting

## Server won't start

### FATAL: AEGIS_SECRET_KEY is not set or too short

Generate a strong key:

```bash
openssl rand -hex 64
```

Add to `.env`:

```
AEGIS_SECRET_KEY=<output from above>
```

### FATAL: AEGIS_FIELD_ENCRYPTION_KEY must be exactly 64 hex characters

Generate a 32-byte key:

```bash
openssl rand -hex 32
```

It must be exactly 64 hex characters (a-f, 0-9). Do not use the base64 form.

### Port already in use

Change the port in `.env`:

```
AEGIS_PORT=8080
```

Update your reverse proxy or open the new port.

### Can't find meta/_journal.json

Drizzle migrations are missing. This happens when upgrading across major versions without running the migration tool. Check the upgrade guide and run:

```bash
npm run db:migrate
```

---

## Login issues

### "Invalid password"

- Double-check the passphrase you set during setup.
- Passphrase is case-sensitive and stored hashed — it cannot be recovered.
- To reset: see "Resetting a lost passphrase" below.

### TOTP code rejected

- Ensure your authenticator app is time-synced. TOTP codes expire every 30 seconds.
- The server accepts codes within a ±1 window (±30 seconds of tolerance).
- If you lost your authenticator: see "Recovering a locked TOTP account" below.

### "Setup required" (428) when trying to log in

The owner account has not been created yet. Navigate to the root URL and complete the setup wizard.

---

## Notification issues

### Emails not sending

1. Go to Settings → Notifications → Email (SMTP).
2. Verify host, port, and credentials.
3. Click "Test Notification" to send a test email.
4. Check your spam folder.
5. For Gmail: you must use an App Password, not your regular password. Enable 2FA in your Google account and generate an App Password.
6. For Postmark / Mailgun: use port 587 with STARTTLS (`Use TLS/SSL` unchecked).

### Telegram not delivering

1. Confirm your bot token is correct (create via @BotFather).
2. Confirm your chat ID is correct — it must be a numeric ID, not a username.
3. Send `/start` to your bot if you haven't already.
4. Click "Test Notification" in Settings → Notifications → Telegram.

---

## Switch issues

### Switch won't arm

Readiness checks must all pass before a switch can be armed. Common blockers:

- **No contacts configured**: Add at least one contact in the Contacts section.
- **No estate items**: Add at least one estate item.
- **No packet generated**: The worker must have run at least once to build a packet. Check that `AEGIS_WORKER_ENABLED=true` in your `.env`.
- **No storage configured** (Dead Drop mode): Configure S3 credentials in Settings → Storage.

### Heartbeat not updating

- Ensure you are clicking "Check In" on the dashboard, not just loading the page.
- Verify the switch is armed.
- Check the Audit Log for recent heartbeat events.

### Worker not running

Verify in your docker-compose.yml or environment:

```
AEGIS_WORKER_ENABLED=true
```

---

## Storage issues

### Dead Drop upload fails

1. Verify your S3 credentials in Settings → Storage → Test Connection.
2. Check that your bucket exists and the access key has write permissions.
3. For MinIO: enable "Force path-style URLs" in Storage settings.
4. For Cloudflare R2: endpoint should be `https://<account-id>.r2.cloudflarestorage.com`.
5. Check your bucket's CORS configuration if uploads are made from a browser.

---

## Database issues

### Database is locked / SQLITE_BUSY

Another process is holding the database. Stop all Aegis instances before running maintenance commands.

### Database corruption

Restore from a backup. See [backups.md](backups.md).

---

## Resetting a lost passphrase

There is no password reset UI in alpha. To reset:

1. Back up your database and `.env` (even if you can't log in, the data may be recoverable later).
2. Stop Aegis.
3. Delete `data/aegis.db`.
4. Restart Aegis — it will prompt for a new owner account.
5. Reconfigure your estate, contacts, and switches from scratch, or restore from a backup.

Alternatively, use the SQLite CLI to update the password hash directly (requires generating an Argon2id hash):

```bash
# This is an advanced operation — back up first
sqlite3 data/aegis.db "UPDATE owner SET password_hash='<new-hash>' WHERE id=1;"
```

---

## Recovering a locked TOTP account

If you lose access to your authenticator app:

```bash
# Disable TOTP directly in the database
sqlite3 data/aegis.db "UPDATE owner SET totp_enabled=0, totp_secret_encrypted=NULL WHERE id=1;"
```

Then log in with your passphrase.

---

## Getting help

- [GitHub Issues](https://github.com/aegis-dms/aegis/issues)
- [Aegis DMS Site](https://aegis.dms) for Relay and Hosted support
