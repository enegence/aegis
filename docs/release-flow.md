# Release Flow

This document describes the full release lifecycle from switch trigger to contact acknowledgement.

## Overview

```
Switch triggers
  → Release run created (one active run at a time)
  → Packet generated and set as active
  → Cascade started: first contact notified
  → Contact opens claim link → verifies → accepts → downloads packet → views key → acknowledges
  → Release run completed, switch marked completed
```

## Contact cascade stages

| Stage | Description |
|-------|-------------|
| `pending` | Claim created, not yet notified |
| `notified` | Notification sent to contact |
| `opened` | Contact opened the claim link |
| `verified` | Identity verified (PIN or confirmation) |
| `accepted` | Contact accepted responsibility |
| `packet_downloaded` | Encrypted packet downloaded |
| `key_viewed` | Decryption key retrieved |
| `acknowledged` | Contact confirmed receipt — run complete |
| `escalated` | Timed out, escalated to next contact |
| `expired` | Claim window elapsed |
| `failed` | Unable to complete |

## Escalation

If a contact does not acknowledge within their `confirmationWindowHours`, the current claim is marked `escalated` and the next contact (by `priorityOrder`) is notified. If all contacts are exhausted, the release run is marked `failed` and the switch is marked `failed`.

## Suppressed triggers

If a second switch triggers while a release run is already active, its trigger is suppressed and its switch ID is added to `suppressedSwitchIds` on the active run. Only one release run is active at a time.

## Claim URL

The claim URL sent to contacts is:

```
{appUrl}/claim/{rawToken}
```

The raw token is generated as 32 random bytes (hex). Only the SHA-256 hash is stored in the DB. The raw token never persists after notification.

## Completion

When a contact reaches `acknowledged`, the release run status is set to `completed` and the triggering switch is set to `completed`.

## Cancellation

The owner can cancel an active release run via `POST /api/release/runs/:id/cancel`. This marks the run `cancelled` and the switch `cancelled`.
