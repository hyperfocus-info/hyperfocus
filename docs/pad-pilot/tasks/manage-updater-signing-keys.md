# Manage Updater Signing Keys

- Owner: Release engineering/security
- Deadline: Before the first public automatic-update release
- Status: Open; manifests currently verify against one public key embedded in the updater

## Problem

Update manifests and patch contents are cryptographically verified, but the client trusts one compile-time public key. There is no production lifecycle for planned rotation, emergency revocation, overlapping trust windows, or auditable release provenance.

Until this task is complete, a key compromise requires shipping a new trusted client through an out-of-band channel.

## Exit Criteria

- Release signing uses offline-protected private keys; private key material never enters source control or Marketplace runtime storage.
- Signed metadata identifies the key, release channel, platform, architecture, exact base version, target version, artifact hash, and expiry.
- Clients accept an overlap window for planned key rotation and reject unknown, expired, revoked, or wrong-channel keys.
- A separately protected trust-root or equivalent signed policy can revoke a release key without trusting that compromised key.
- Monotonic version policy rejects rollback to an older vulnerable build unless an explicit signed recovery policy allows it.
- CI records reproducible artifact hashes, signer identity, signing time, and publication provenance.
- Native tests cover current/next key overlap, unknown key, revoked key, tampered metadata, expired metadata, rollback, and recovery rotation.
