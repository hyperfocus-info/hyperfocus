# PadPilot Marketplace User Stories

Canonical outcome inventory for the independently deployable PadPilot marketplace.
The service contract and local workflow remain in the
[marketplace README](../../apps/pad-pilot-marketplace/README.md). Update the
matching [coverage row](coverage-matrix.md) with every shipped story change.

PPM-CATALOG-001: As a user, I browse Module summaries, inspect details, and see
whether a compatible downloadable bundle is actually available before acting.

PPM-AUTH-001: As a user, I sign in, restore a sliding authenticated session, or
continue through a clearly labeled guest path without ambiguous account state or
client-side mutation of my audio or persisted Module state.

PPM-PUBLISH-001: As a Module publisher, I create a draft, upload one bounded bundle,
publish it, and recover the same slug after a failed transaction or file cleanup.

PPM-PURCHASE-001: As a buyer, I start one valid Checkout for a paid Module or
PadPilot plan and never receive access from an incomplete or mismatched payment.

PPM-ENTITLEMENT-001: As a buyer, I gain an entitlement exactly once after verified
payment and lose it correctly after a complete refund or terminal reversal.

PPM-ACCOUNT-001: As an account holder, I see canonical membership, token, lifetime,
and Module ownership state derived from the marketplace database.

PPM-RELEASE-001: As a PadPilot user, I receive only compatible stable or beta
release metadata and cryptographically verifiable update artifacts.

PPM-RECOVERY-001: As a user or publisher, I receive bounded actionable errors for
timeouts, unavailable bundles, failed generation, interrupted upload, and retry.

PPM-SECURITY-001: As an operator, I keep every privileged mutation behind exact
origin, authentication, size, rate, path, signature, and idempotency checks.

## Verification

The shared [PadPilot coverage matrix](coverage-matrix.md) maps each marketplace
story to executable service or UI evidence.

Related: [repository story map](../user-stories.md) and
[marketplace README](../../apps/pad-pilot-marketplace/README.md).
