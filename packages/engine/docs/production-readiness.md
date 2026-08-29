# Production readiness evidence

Repository checks prove engine behavior on their runners. They do not prove that a particular deployment has survived production traffic, that its operators can respond, or that an independent assessor reviewed it. Production and public-package claims therefore require a release-specific evidence file and fail closed when that file is absent or incomplete.

Use `bun run certify:package` for a public package and `bun run certify:mmo` for a production MMO deployment. Set `RELEASE_EVIDENCE_FILE` to the JSON document. The publish workflow expects `release-evidence/v<version>.json`, so the current `0.0.1` package cannot publish merely because unit tests pass.

Both claims require:

- the exact package version and SHA-256 artifact digest;
- a current passing Chromium, Firefox, and WebKit matrix with desktop and touch-mobile profiles;
- a current independent security assessment with no unresolved high or critical findings and a report digest;
- an enabled private vulnerability-reporting channel, a public HTTPS security policy, at least two distinct maintainers, and a recorded compatibility review.

An MMO claim additionally requires:

- a recent real production canary lasting at least 30 minutes, serving non-zero bounded traffic, with rollback exercised;
- a recent game-specific soak lasting at least six hours;
- a recent incident drill covering replay-store partition, cross-process replay, graceful drain, corrupt backup, encrypted restore, and signing-key rotation;
- deployment attestations for TLS, a shared atomic replay store, external key management, remote durable storage, autoscaling, and multi-region coordination;
- distinct primary and secondary on-call operators, an escalation policy, a runbook, and a restore drill within 90 days.

Evidence URLs must use HTTPS. Timestamps and digests make a claim auditable, but the validator does not fetch or endorse the linked records. The protected release environment must restrict approval to people who verify those records.

The validator's accepted fields are exercised in `scripts/production-readiness.test.ts`. Do not copy its `.invalid` example URLs into release evidence.
