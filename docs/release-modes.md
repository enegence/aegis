# Release Modes — Aegis Core

Last updated: 2026-05-14
Status: Phase 5 baseline (all modes from Phase 3 onward)

---

## Overview

A **release mode** (also called **deployment mode**) determines where your release material is stored and how it is released when your switch triggers. Choose based on your resilience requirements and trust model.

Mode is set at switch level. Valid values: `vault | dead_drop | relay_monitoring | relay_escrow`

> **Hosted mode** (`hosted`) is managed by Aegis DMS Site (SaaS) and is not available in self-hosted OSS.

---

## Vault

**`deploymentMode: "vault"`**

Your switch information lives entirely on this local server. When the switch triggers, the server generates a notification with a claim URL. Contacts follow that URL to access the release material.

**Trust model:** You trust the local server. No third parties involved in storage or release.

**What Aegis stores:** Everything (estate items, contacts, packets) on the local SQLite DB + local filesystem or S3.

**What you retain:** The physical/network access to the server.

**Release path:**
1. Worker detects trigger condition
2. Server generates encrypted packet, uploads if storage configured
3. Server sends claim notifications
4. Contact follows claim URL to this server
5. This server verifies the claim and serves the packet key

**Limitation:** If this machine is offline, destroyed, or inaccessible when the switch trips, release cannot proceed automatically. The server must be reachable at claim time.

**Use when:** You want to organize your information and are comfortable with the server being online for release.

---

## Dead Drop

**`deploymentMode: "dead_drop"`**

Your encrypted packet is uploaded to S3-compatible storage while you are alive. If this server disappears, the ciphertext survives in S3.

**Trust model:** You trust S3/R2 to store ciphertext. You trust no one else with the key.

**What Aegis stores:** Encrypted packet in S3. Packet key on this server (in `encryption_keys`). Contacts/estate on this server.

**What you retain:** The server (for key-view delivery) and S3 credentials.

**Release path:**
1. Packet synced to S3 at arm time (and periodically)
2. Worker detects trigger
3. Notifications sent with claim URL pointing to this server
4. This server verifies claim and serves the packet key
5. Contact uses key to decrypt their copy of the packet from S3

**Limitation:** S3 has the ciphertext but not the key. This server still needs to be alive to serve the key. If both the server AND S3 survive, contacts can decrypt. If the server dies, they have the packet but not the key.

**Use when:** You want material to survive server loss, but are comfortable with the server being required for key delivery.

---

## Relay Monitoring

**`deploymentMode: "relay_monitoring"`**

The Aegis Relay SaaS monitors your heartbeats and alerts contacts if your instance goes silent. Your local server still handles packet storage and key delivery.

**Trust model:** You trust Aegis Relay to accurately report offline status. You do not trust it with your keys or data.

**What Aegis Relay stores:** Heartbeat timestamps, connection metadata. No keys, no estate data.

**What you retain:** Keys, estate data, and the local server.

**Release path (via Relay monitoring):**
1. Your OSS instance sends periodic heartbeats to Relay SaaS
2. If heartbeats stop, Relay sends offline alerts to configured contacts
3. Contacts use those alerts as a cue to contact each other or follow up
4. Actual packet release still requires this server to be accessible

**Limitation:** Relay Monitoring does NOT release your packet. It only detects and alerts. Release still requires this server to be online.

**Use when:** You want a third-party watchdog to alert contacts if you go offline, but you control your own keys and release.

---

## Relay Escrow

**`deploymentMode: "relay_escrow"`**

The Aegis Relay SaaS holds an encrypted copy of your release material. If you remain offline beyond the configured threshold, Relay can execute the release directly — without requiring your local server.

**Trust model:** You trust Aegis Relay to hold encrypted material and execute your release policy. This is the highest-trust mode. You are trusting the Aegis DMS SaaS with encrypted data.

**What Aegis Relay stores:** Encrypted release material (escrow packet), your release policy, escrow contact list.

**What you retain:** The encryption key (theoretically). In practice, for v1, Relay can decrypt because it holds both the material and the key (server-side encryption).

**Release path (via Relay Escrow):**
1. Your OSS instance links to Relay via auth-code exchange (Phase 5)
2. You upload encrypted escrow material to Relay
3. Relay monitors heartbeats
4. If offline threshold exceeded → Relay executes release policy directly
5. Contacts receive claim notifications from Relay's servers
6. Relay serves the packet key to verified contacts

**Alpha limitation:** No zero-knowledge escrow in v1. Relay SaaS can decrypt your material. This will be documented in the consent acknowledgement UI.

**Use when:** You want maximum resilience — your release proceeds even if your server is permanently offline.

---

## Comparison Table

| Mode | Local server required for release? | Third-party stores keys? | Resilience to server loss |
|------|-------------------------------------|--------------------------|---------------------------|
| vault | Yes | No | Low |
| dead_drop | Yes (for key) | No (S3 = ciphertext only) | Medium (packet survives) |
| relay_monitoring | Yes | No | Low (alerts only) |
| relay_escrow | No | Yes (Relay SaaS) | High |

---

## Notes on Deprecated / Invalid Values

The following mode values are NOT valid and must not appear in code or DB:

- `local_only` — old name for vault; replaced by `vault`
- `relay` — ambiguous old name; replaced by `relay_monitoring` or `relay_escrow`
