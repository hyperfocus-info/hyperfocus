# Security policy

## Supported releases

Security fixes are issued for the latest `0.1.x` release. Pre-release builds, source snapshots, and older patch releases must be upgraded before a fix is requested. Persisted-format fixes will preserve validated data or include an explicit migration.

## Private reporting

Do not disclose a suspected vulnerability in a public issue, discussion, chat, or game server. Use GitHub private vulnerability reporting on the canonical repository. Public package publishing is blocked until the repository owner enables that channel and names at least two maintainers who can receive its notifications.

Include the affected version and entrypoint, impact, reproduction or proof of concept, relevant deployment assumptions, and whether untrusted input is required. Do not include real secrets, player data, or destructive production actions.

## Response targets

- Automated acknowledgement: immediately from the private reporting system.
- Human triage: within three business days.
- Severity and remediation plan: within seven business days.
- Critical releases: as soon as a verified patch and regression test are available.

Maintainers coordinate an embargo with the reporter, add a regression test, run `bun run release:verify`, publish a security advisory and changelog entry, and rotate any potentially exposed release or service credentials. These targets are a release requirement; they are not a staffed 24/7 incident-response promise.

## Scope and deployment boundary

The engine accepts untrusted network frames, project/save JSON, ZIP assets, glTF data, session tokens, and persistence backups. Reports involving bounds bypasses, unsafe path handling, authentication/replay defects, cross-player disclosure, parser denial of service, cryptographic misuse, or sandbox escapes are in scope.

TLS termination, DDoS controls, OAuth/account recovery, managed database access, cloud IAM, secret distribution, host patching, and game-specific anti-cheat remain deployment responsibilities. A deployment must document those controls before claiming production readiness.
