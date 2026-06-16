# Notifications

Aegis sends contacts a claim link when a switch triggers. The claim portal handles verification, packet download, key view, and acknowledgement. Notification channels should carry the same minimized claim-link payload; they should not split secrets or send estate details.

For the OSS self-hosted version, outbound email is configured by bringing your own SMTP relay. Aegis Relay Escrow and Hosted deployments can handle delivery through the managed Aegis service at [aegisdms.life](https://aegisdms.life).

Configure and test at least one delivery channel before relying on a switch.

## SMTP (email)

Settings → SMTP section:

| Field | Description |
|-------|-------------|
| Host | SMTP server hostname (e.g., `smtp.gmail.com`) |
| Port | Usually 587 (STARTTLS) or 465 (SSL) |
| Username | SMTP login username |
| Password | SMTP password — stored encrypted, never displayed |
| From email | Sender address shown to recipients |
| TLS/SSL | Enable for port 465 or servers that require it |

`setup.sh` can write these values into `.env` on first install. At startup, Aegis imports those environment values into encrypted app settings if they have not already been configured in the database. Use `AEGIS_SMTP_SECURE=true` for implicit TLS/SSL, usually port 465.

After saving, use "Send test" to verify delivery before arming.

### Common providers

| Provider | Host | Port | Notes |
|----------|------|------|-------|
| Gmail | smtp.gmail.com | 587 | Requires App Password (not account password) |
| SMTP2GO | Provider dashboard | 587 | Simple SMTP-focused setup for small transactional use |
| Resend | Provider dashboard | 587 | Developer-friendly transactional email |
| Brevo | Provider dashboard | 587 | SMTP relay with broader email tooling |
| MailerSend | Provider dashboard | 587 | Transactional email with SMTP credentials |
| Mailgun | smtp.mailgun.org | 587 | Requires API-verified domain |
| Postmark | smtp.postmarkapp.com | 587 | Requires sending server |
| SendGrid | smtp.sendgrid.net | 587 | Use "apikey" as username |

If you do not want to manage SMTP credentials, DNS records, or delivery troubleshooting, use Aegis Relay/Hosted managed delivery instead.

## Telegram

Telegram is an optional secondary channel. It is useful for owners and contacts who already use Telegram, but email remains the primary OSS path because every trusted contact is expected to have an email address.

Settings → Telegram section:

| Field | Description |
|-------|-------------|
| Bot token | Token from @BotFather — stored encrypted, never displayed |
| Chat ID | Numeric ID of the chat/channel to send to |

To get your Chat ID: start your bot in Telegram, then call `https://api.telegram.org/bot<TOKEN>/getUpdates`.

## Notification types

| Type | When sent |
|------|-----------|
| Reminder | Heartbeat check-in due soon |
| Warning | Trigger approaching (warning window active) |
| Release | Contact notified of packet availability |
| Test | Manual test from Settings |

## Security

- Passwords and bot tokens are stored encrypted at rest
- Existing credentials are never returned to the UI
- Leaving the password field blank keeps the existing credential
