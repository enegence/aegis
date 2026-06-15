# Packet Mirror Mode

Packet Mirror mode encrypts your release packet and uploads it to an S3-compatible bucket while you are alive. Your contacts can download the mirrored ciphertext after a release event.

This mode is separate from the future Aegis Dead Drop API service. Packet Mirror is storage-only; Dead Drop is reserved for the managed relay/API release system.

## What gets uploaded

- The encrypted packet binary (AES-256-GCM ciphertext + IV + auth tag)
- No plaintext content is ever uploaded
- No credentials, passwords, secrets, or SMTP/S3 keys are included in the packet

## What does NOT get uploaded

- Your field encryption key
- The packet decryption key (stored locally in the `encryption_keys` table)
- App settings, session data, or admin credentials

## How encryption works

1. A random 32-byte AES-256-GCM key is generated for each packet.
2. The packet JSON is canonicalized (key-sorted) and encrypted.
3. The encrypted binary is: `[12B IV][16B authTag][N bytes ciphertext]`.
4. The packet key is encrypted using your field encryption key and stored in the local DB.
5. The encrypted binary is uploaded to S3 with an `x-aegis-encrypted-hash` metadata tag.

## If your local host is offline

Your contacts can still download the encrypted packet from S3. However, the decryption key lives on your local server. If the server is permanently offline, contacts cannot decrypt the packet without the key.

**Limitation:** Packet Mirror without Relay Escrow only protects the encrypted packet copy. For full offline release capability, Relay Escrow holds the key/release flow in escrow.

## Verification

The worker periodically re-verifies the S3 object by checking its size and `ETag`. If verification fails, a `packet_uploaded` re-upload is attempted.

## Staleness conditions

A packet is considered stale and re-synced when:
- No packet exists for the switch
- The switch was updated after the packet was created
- The packet has no `storageObjectKey` (never uploaded)
- `lastVerifiedAt` is older than 24 hours
