# Switches

A switch is the core runtime unit of Aegis Core. It defines when and how your legacy information is released.

## Switch modes

### Heartbeat mode

You check in on a regular interval (e.g., every 7 days). If a check-in is missed, Aegis enters a warning window and eventually triggers.

- Good for: ongoing monitoring without a fixed end date
- Requires: regular manual check-ins or automated heartbeat

### Trip mode

You set a fixed trigger date and time. When that date passes without being cancelled or paused, the switch trips.

- Good for: scheduled releases tied to a specific event
- Requires: you to cancel or extend before the date if still alive

## Switch lifecycle

```
draft → armed → (warning) → triggered → cascade_active → completed
                          ↘ cancelled
             ↘ paused → armed
```

| Status | Meaning |
|--------|---------|
| `draft` | Created but not armed |
| `armed` | Active and monitoring |
| `warning` | Trigger imminent; warning period active |
| `triggered` | Trigger time reached; preparing cascade |
| `cascade_active` | Contacting recipients |
| `completed` | All contacts acknowledged |
| `paused` | Manually paused; not monitoring |
| `cancelled` | Permanently stopped |
| `failed` | Cascade failed |

## Actions

| Action | Valid from | Description |
|--------|-----------|-------------|
| Arm | `draft`, `paused` | Start/resume monitoring |
| Pause | `armed`, `warning` | Suspend monitoring temporarily |
| Cancel | `draft`, `armed`, `paused`, `warning` | Permanently stop switch |
| Check in | `armed`, `warning` | Reset heartbeat timer |
| Evaluate | any | Force evaluation (dev/test) |

## Readiness checks

Before arming, Aegis checks:

- Email verified
- Notification provider configured (SMTP or Telegram)
- At least one contact selected
- At least one estate item selected (warning if none)
- For trip mode: trigger date is in the future
- For heartbeat mode: heartbeat interval set

Checks marked `not_ready` block arming. Checks marked `warning` are informational.
