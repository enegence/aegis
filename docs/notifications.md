# Notifications

Aegis sends notifications via SMTP (email) or Telegram. Configure at least one provider before arming a switch.

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

After saving, use "Send test" to verify delivery before arming.

### Common providers

| Provider | Host | Port | Notes |
|----------|------|------|-------|
| Gmail | smtp.gmail.com | 587 | Requires App Password (not account password) |
| Mailgun | smtp.mailgun.org | 587 | Requires API-verified domain |
| Postmark | smtp.postmarkapp.com | 587 | Requires sending server |
| SendGrid | smtp.sendgrid.net | 587 | Use "apikey" as username |

## Telegram

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
