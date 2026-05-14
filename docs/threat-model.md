# Threat Model (Phase 3)

## What Aegis Core protects against

- **Data at rest exposure**: All PII fields are AES-256-GCM encrypted. An attacker with DB access but not the field encryption key cannot read contact info, estate details, or packet keys.
- **Packet interception**: Packets uploaded to S3 are encrypted before upload. An attacker with S3 read access gets ciphertext only.
- **Unauthorized claim access**: Claim tokens are 32 bytes of entropy, stored only as SHA-256. Brute force is infeasible.
- **PIN brute force**: Failed PIN attempts are counted in-memory; after 5 failures the claim is locked.
- **Audit log PII leakage**: Audit events are validated at write time. Any metadata key matching known PII patterns (email, name, phone, etc.) raises an error before the event is written.

## What Aegis Core does NOT protect against

- **Compromise of the host machine**: If an attacker has access to the running server process or environment variables, they can read the field encryption key and decrypt all data.
- **Loss of the host with no Dead Drop**: Vault mode requires the local server to be online for release. If it goes offline permanently, contacts cannot access the packet.
- **Dead Drop without Relay Escrow key custody**: Contacts can download the encrypted packet from S3 but cannot decrypt it if the local server is offline and no key escrow exists.
- **Social engineering**: Aegis does not verify that the person using a claim link is the intended contact.
- **Side-channel attacks**: No protections beyond standard Node.js crypto library defaults.

## Trust model

| Actor | Trust level |
|-------|-------------|
| Owner (authenticated) | Full trust — can arm, configure, cancel runs |
| Contact (claim token) | Limited trust — can only progress their own valid claim |
| System (worker) | Internal trust — runs under same process, no separate auth |
| Relay (Phase 4+) | Configurable trust — bounded by escrow contract |

## Limitations of Phase 3

- Local key release only — server must be online to serve key-view
- No Shamir Secret Sharing
- No zero-knowledge proofs
- No HSM or hardware key storage
- PIN rate limit is in-memory — restarts reset the counter
