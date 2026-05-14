# Storage Setup (S3-Compatible Dead Drop)

Configure an S3-compatible bucket to enable Dead Drop mode.

## Required settings (set via Settings → Storage)

| Key | Description |
|-----|-------------|
| `s3_region` | AWS region (e.g. `us-east-1`) |
| `s3_bucket` | Bucket name |
| `s3_access_key_id_encrypted` | Access key ID (encrypted at rest) |
| `s3_secret_access_key_encrypted` | Secret access key (encrypted at rest) |

## Optional settings

| Key | Description |
|-----|-------------|
| `s3_endpoint` | Custom endpoint URL (for MinIO, Backblaze, Cloudflare R2, etc.) |
| `s3_prefix` | Key prefix within the bucket (default: `aegis`) |
| `s3_force_path_style` | `true` for MinIO and other path-style providers |
| `packet_retention_days` | Packet expiry in days (0 = no expiry) |

## Object key format

Packet objects are stored at:

```
{prefix}/{switchId}/{version}/{packetId}.aegis.enc
```

## Bucket policy

Minimum required permissions:
- `s3:PutObject`
- `s3:HeadObject`
- `s3:GetObject`
- `s3:DeleteObject`

Credentials are encrypted using the field encryption key before storage. They are only decrypted in-memory during sync operations and are never included in audit logs.

## Compatible providers

Any S3-compatible provider works: AWS S3, MinIO, Backblaze B2, Cloudflare R2, Wasabi.
For non-AWS endpoints, set `s3_endpoint` and `s3_force_path_style=true` as needed.
