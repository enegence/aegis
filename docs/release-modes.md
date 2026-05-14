# Deployment Modes

A deployment mode determines how resilient your release is to server unavailability. Choose honestly based on your threat model.

## Vault

**Current Phase 2 status: Available**

Stores and organizes your legacy information locally. Notifies contacts when the switch triggers — but only if this machine is online at that time.

**Limitation:** If this machine is destroyed, offline, or inaccessible when the switch trips, release cannot proceed automatically. This mode does not guarantee delivery.

Use if: you want to organize your information and are comfortable with manual or manual-assisted release.

## Dead Drop

**Current Phase 2 status: Not yet implemented (Phase 3)**

An encrypted packet is uploaded to S3-compatible storage while you are alive. Your release material survives if this server is lost.

Notification still requires either this server or a configured relay.

## Relay Monitoring

**Current Phase 2 status: Available via Aegis Relay (SaaS)**

The Aegis Relay SaaS monitors your heartbeats and alerts designated contacts when you go offline. Your local server may still be needed to release the packet.

Relay Monitoring detects offline status but **cannot release your material on its own** — that requires Relay Escrow.

## Relay Escrow

**Current Phase 2 status: Available via Aegis Relay (SaaS)**

The Aegis Relay SaaS holds an encrypted copy of your release material and can execute your release policy if you remain offline beyond the configured threshold. Requires explicit trust acknowledgement in the SaaS portal.

This is the highest-resilience self-hosted option. You are trusting Aegis DMS servers with your encrypted material.

## Hosted

**Current Phase 2 status: Available via Aegis Hosted (SaaS)**

Fully managed by Aegis DMS. No local server required. All storage, monitoring, and release is handled server-side.

---

## Phase 2 limitations

Phase 2 supports switch state management, reminders, warnings, and state transitions. The following are **not yet implemented** and arrive in Phase 3:

- Encrypted packet generation
- S3/R2 dead-drop sync
- Contact cascade and claim portal
- Release-key delivery
- Relay-assisted cascade
