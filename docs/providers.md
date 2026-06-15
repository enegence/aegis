# Provider Configuration Guide

Practical configuration examples for storage and notification providers supported by Aegis.

---

## Storage Providers (S3-Compatible)

### AWS S3

**Endpoint format:** Leave the endpoint field blank — the SDK derives it from the region.

**Settings:**

| Field            | Value                             |
|------------------|-----------------------------------|
| Region           | `us-east-1` (or your bucket's region) |
| Bucket           | `my-aegis-backups`               |
| Prefix           | `aegis` (default)                |
| Access Key ID    | IAM key ID (`AKIA...`)           |
| Secret Access Key | IAM secret                      |
| Endpoint         | *(leave blank)*                  |
| Force Path Style | `false`                          |

**Minimum bucket policy** (restrict to Aegis prefix only):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::ACCOUNT_ID:user/aegis-user" },
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::my-aegis-backups",
        "arn:aws:s3:::my-aegis-backups/aegis/*"
      ]
    }
  ]
}
```

**CORS config** (only needed if you want browser-direct upload — Aegis server-to-server does not require CORS):

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedOrigins": ["https://your-aegis-instance.example.com"],
    "MaxAgeSeconds": 3000
  }
]
```

**Versioning:** Enable S3 Versioning for extra protection against accidental deletion.

---

### Cloudflare R2

R2 uses an account-based endpoint URL. No egress fees for data reads.

**Endpoint format:**

```
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

Replace `<ACCOUNT_ID>` with your Cloudflare account ID (found in the R2 dashboard).

**Settings:**

| Field            | Value                                                         |
|------------------|---------------------------------------------------------------|
| Endpoint         | `https://abc123def456.r2.cloudflarestorage.com`              |
| Region           | `auto`                                                        |
| Bucket           | `my-aegis-backups`                                           |
| Access Key ID    | R2 API Token ID                                              |
| Secret Access Key | R2 API Token secret                                         |
| Force Path Style | `true`                                                       |

**Create an API token** in Cloudflare dashboard → R2 → Manage API tokens. Grant "Object Read & Write" on the specific bucket.

**CORS config** (set via Cloudflare dashboard or API):

```json
[
  {
    "AllowedOrigins": ["https://your-aegis-instance.example.com"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }
]
```

**Note:** R2 does not support object versioning. Use prefix-based key naming for soft-delete safety.

---

### Backblaze B2 (S3-Compatible API)

**Endpoint format:**

```
https://s3.<REGION>.backblazeb2.com
```

Region examples: `us-west-004`, `eu-central-003`. Find your region in B2 → Buckets → Bucket Details.

**Settings:**

| Field            | Value                                           |
|------------------|-------------------------------------------------|
| Endpoint         | `https://s3.us-west-004.backblazeb2.com`       |
| Region           | `us-west-004`                                   |
| Bucket           | `my-aegis-backups`                             |
| Prefix           | `aegis`                                         |
| Access Key ID    | B2 Application Key ID                          |
| Secret Access Key | B2 Application Key                            |
| Force Path Style | `false`                                         |

**Creating application keys:** B2 Console → App Keys → Add a New Application Key. Restrict key to the specific bucket and prefix (`aegis/`) for least privilege.

**CORS:** Set in B2 bucket settings via `b2 update-bucket` CLI or API:

```json
[
  {
    "corsRuleName": "aegis",
    "allowedOrigins": ["https://your-aegis-instance.example.com"],
    "allowedHeaders": ["*"],
    "allowedOperations": ["s3_head", "s3_get", "s3_put"],
    "maxAgeSeconds": 3600
  }
]
```

**Note:** B2 charges for Class B (download) transactions. For Aegis use (infrequent reads), this is typically negligible.

---

### MinIO (Self-Hosted)

MinIO is S3-compatible and ideal for air-gapped deployments.

**Endpoint format:**

```
http://minio.example.com:9000       # HTTP
https://minio.example.com:9000      # HTTPS (recommended for production)
```

**Settings:**

| Field            | Value                              |
|------------------|------------------------------------|
| Endpoint         | `https://minio.example.com:9000`  |
| Region           | `us-east-1` (MinIO ignores region, but SDK requires a value) |
| Bucket           | `aegis`                           |
| Access Key ID    | MinIO access key                  |
| Secret Access Key | MinIO secret key                 |
| Force Path Style | `true`                            |

**TLS note:** MinIO in production must use TLS. Use a valid certificate (Let's Encrypt, or a self-signed CA added to your system trust store). The Aegis server uses Node.js's default TLS verification — self-signed certs will fail unless you set `NODE_EXTRA_CA_CERTS` to your CA bundle.

**Bucket creation:**

```bash
mc alias set local https://minio.example.com:9000 ACCESSKEY SECRETKEY
mc mb local/aegis
mc anonymous set none local/aegis   # private — no public access
```

**CORS config:**

```bash
mc cors set local/aegis --config '{
  "CORSRules": [{
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedOrigins": ["https://your-aegis-instance.example.com"],
    "MaxAgeSeconds": 3000
  }]
}'
```

---

## SMTP / Email Notification Providers

### Common Patterns

Aegis Core OSS uses SMTP (STARTTLS or SSL/TLS) for email delivery. Self-hosted users provide their own relay credentials. Aegis Relay Escrow and Hosted deployments can use managed Aegis delivery instead.

The recommended order for self-hosted users is:

1. Use an existing mailbox/provider SMTP account, with Gmail as the simplest documented preset for many home users.
2. Use a transactional SMTP provider if reliability and deliverability matter more than setup simplicity.
3. Use a self-hosted mail server only if you already know how to operate DNS, SPF, DKIM, DMARC, and mail reputation.

All providers below work with standard SMTP settings.

**Configuration fields:**

| Field      | Purpose                              |
|------------|--------------------------------------|
| Host       | SMTP server hostname                 |
| Port       | 587 (STARTTLS) or 465 (SSL)         |
| User       | SMTP username / login email          |
| Password   | SMTP password or API key             |
| From Email | Sender address shown to recipients   |
| Secure     | `true` for port 465 (SSL), `false` for 587 (STARTTLS) |

---

### Gmail (App Passwords)

**Requires:** 2-Step Verification enabled on the Google account.

1. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Create an App Password for "Mail"
3. Use the 16-character generated password (not your account password)

| Field      | Value                                |
|------------|--------------------------------------|
| Host       | `smtp.gmail.com`                    |
| Port       | `587`                               |
| User       | `yourname@gmail.com`                |
| Password   | 16-char App Password                |
| From Email | `yourname@gmail.com`                |
| Secure     | `false` (uses STARTTLS on port 587) |

**Note:** Gmail limits outgoing email to ~500/day for personal accounts. For higher volume, use Google Workspace or a dedicated SMTP provider.

---

### SendGrid

1. Create an API key at [app.sendgrid.com/settings/api_keys](https://app.sendgrid.com/settings/api_keys) with "Mail Send" permission.
2. Verify your sender domain or single sender email.

| Field      | Value                          |
|------------|--------------------------------|
| Host       | `smtp.sendgrid.net`           |
| Port       | `587`                         |
| User       | `apikey` (literal string)     |
| Password   | Your SendGrid API key         |
| From Email | Your verified sender address  |
| Secure     | `false`                       |

---

### Mailgun

1. Add and verify your domain in the Mailgun dashboard.
2. Find SMTP credentials under Sending → Domain Settings → SMTP credentials.

| Field      | Value                                    |
|------------|------------------------------------------|
| Host       | `smtp.mailgun.org`                      |
| Port       | `587`                                   |
| User       | `postmaster@mg.yourdomain.com`          |
| Password   | Mailgun SMTP password                   |
| From Email | `aegis@mg.yourdomain.com`              |
| Secure     | `false`                                 |

**EU region:** Use `smtp.eu.mailgun.org` as the host.

---

### Postmark

1. Create a Server in Postmark and get the Server API Token.
2. Verify your sender signature.

| Field      | Value                              |
|------------|------------------------------------|
| Host       | `smtp.postmarkapp.com`            |
| Port       | `587`                             |
| User       | Your Postmark Server API Token    |
| Password   | Your Postmark Server API Token    |
| From Email | Your verified sender address      |
| Secure     | `false`                           |

**Note:** Both username and password are the same Server API Token.

---

### Self-Hosted MX (Postfix / Exim)

For fully self-hosted mail. Ensure proper SPF, DKIM, and DMARC records are set on your domain.

| Field      | Value                              |
|------------|------------------------------------|
| Host       | `mail.yourdomain.com`             |
| Port       | `587` (STARTTLS) or `25`          |
| User       | SMTP username                     |
| Password   | SMTP password                     |
| From Email | `aegis@yourdomain.com`           |
| Secure     | `false`                           |

**Port 25** is blocked by most cloud providers (AWS, GCP, Azure). Use port 587 with STARTTLS or run on a VPS that allows port 25.

---

### Testing SMTP

Use the Settings → Notifications → Test button to send a test email. This calls `POST /api/settings/notifications/test` with `{ channel: "email" }`.

**Common SMTP errors:**

| Error                        | Likely cause                                                |
|------------------------------|-------------------------------------------------------------|
| `550 SPF check failed`       | Your From Email domain lacks an SPF record, or you're sending from an unauthorized server |
| `535 Authentication failed`  | Wrong username/password, or App Password not generated      |
| `Connection refused`         | Wrong host/port, or port blocked by firewall/ISP            |
| `530 Must issue STARTTLS`    | Port 587 requires STARTTLS — set Secure to `false` (not `true`) |
| `SSL handshake failed`       | Port 465 requires Secure = `true`; or certificate mismatch |
| `421 Too many connections`   | Provider rate limit — reduce frequency or use a transactional SMTP service |

**SPF record example** (add to DNS for your domain):

```
TXT  @  "v=spf1 include:sendgrid.net ~all"
```

**DKIM:** Follow your provider's DNS verification steps. Postmark and SendGrid provide the exact CNAME/TXT records to add.
