# MMO Readiness

`@hyperfocus/engine` has the first authoritative-server foundation for MMO-ish browser games, but it should still be described carefully.

The current target is 1000 total CCU across authoritative room or zone shards, with a recommended 100 players per managed public room. This is not a promise of 1000 co-visible players in one room, a managed account platform, staffed live operations, or managed fleet hosting. The architecture keeps that path open while giving small teams a server-owned simulation loop, binary replication, interest management, signed session admission, portable persistence operations, bounded durable gameplay services and matchmaking, telemetry, and a deployable Bun WebSocket server.

## Current Split

- `@hyperfocus/engine/net`: small-session networking, P2P helpers, rollback input exchange, shared metadata, and authoritative-client helpers.
- `@hyperfocus/engine/server`: Bun-first authoritative room and zone runtime for server-owned state.
- `@hyperfocus/engine/protocol`: DOM-free schema, snapshot, delta, and message helpers shared by clients and servers.
- `@hyperfocus/engine/core`: deterministic DOM-free primitives that can run in tooling or server tests.

## Why P2P Is Not The MMO Path

P2P rollback is useful for small competitive sessions where each client can run the same deterministic simulation. It is a poor MMO backbone because clients cannot be trusted to own world truth, all peers cannot receive all world state, and disconnects or cheating become central product risks.

MMO-ish play needs a server to own:

- join permission
- player identity
- simulation updates
- accepted inputs
- replicated snapshots and deltas
- area-of-interest filtering
- reconnect and duplicate-login policy
- persistence timing
- health and load metrics

## What Is Ready

- Headless server clock with fixed tick rate and catch-up cap.
- Authoritative room and zone lifecycle with restored room snapshots, final persistence, and disposal hooks.
- WebSocket server shell with health and stats endpoints.
- Memory account backend compatible with the auth adapter contract.
- Provider-neutral async inventory, integer economy/atomic transfer, guild, moderation, retained chat, matchmaking, idempotency, pagination, and audit contracts with a bounded memory reference and Bun SQLite implementation.
- Explicit opt-in dev auth adapter (`devMode: true`) plus pluggable production auth interface.
- HMAC-signed one-use session identities with expiry, overlapping key rotation, canonical encoding, bounded local replay protection, and an injectable fail-closed atomic replay store for multiple admission processes.
- Memory persistence adapter plus pluggable persistence interface.
- Canonical checksummed JSON backups, AES-256-GCM/key-ring envelopes, and validate-before-commit atomic restore through a provider-neutral portable persistence adapter.
- SQLite persistence adapter for Bun server deployments.
- Checksummed portable durable-service backups with validate-before-swap restore, plus reconnect-safe persistent matchmaking tickets and short-lived admission handoffs.
- Structured bounded health/metric snapshots and graceful drain control with timeout/completion evidence.
- Presence index with duplicate-login replacement.
- Interest grid with visibility enter/leave and caps.
- MMO 1000 preset for 10 managed public shards with least-loaded admission by default and fill-first admission for lobby/social entry flows.
- Binary schema snapshots and top-level deltas.
- Entity replicator with sequence numbers, ack tracking, and byte budgets.
- Room-bucket replication scheduling so active rooms share delta slots.
- Shard router interface for local static zones plus pluggable handoff transport.
- HTTP handoff helper for cross-process shard transfer experiments.
- Fleet placement helper for capacity and region-aware zone placement.
- WebTransport datagram message adapter for environments that provide WebTransport sessions.
- Server-side AABB physics world for simple authoritative collision and gravity.
- Load tests for 100 clients over 1,000 entities.
- Authenticated HTTP clients plus a matching deployable control-plane handler for shared replay consumption, remote persistence, external key rings, regional heartbeats/leases, and capacity actuation.
- Bounded cooldown-aware regional autoscaling policy and a two-person active on-call roster startup guard.

## Still Not Included

- Hosted account service, OAuth provider, or password-hardening policy.
- Provisioned/operated replay, database, KMS, object storage, fleet, and consensus services. The HTTP control plane connects these provider backends but does not create them.
- A backup scheduler/retention policy, multi-node database transaction implementation, or cross-region ticket-consensus implementation.
- Cross-region matchmaking policy/rating, staffed moderation/abuse classification, legal retention policy, or managed social services.
- A provider-specific Agones, Kubernetes, or managed-fleet actuator; the generic autoscaler calls an injected actuator.
- Native UDP server transport.
- Full rigid-body physics engine.

## Claim Boundary

Use "1000 total CCU across authoritative room/zone shards" only when the game runs through `@hyperfocus/engine/server`, uses bounded interest-filtered replication, and passes its project-specific load target. Do not describe the engine as 1000 co-visible players in one room or as a full MMO platform. A production MMO claim additionally requires `bun run certify:mmo` with release-specific canary, six-hour game soak, incident, independent-security, infrastructure, restore, and staffed on-call evidence.

Keep public hotspots split across rooms or zones before they become one crowded collision and replication problem. Use bounded interest radius, social hub level-of-detail, and backlog monitoring to keep load visible while events or hubs spike.

The operations primitives remove hosted-vendor coupling; they do not remove operational responsibility. A multi-process deployment can use the included authenticated control-plane protocol, but must back it with shared atomic nonce consumption, coordinated key distribution, a serializable shared service store, durable snapshot storage, TLS/network policy, monitoring, tested regional lease semantics, restore drills, and real primary/secondary staffing. See [authoritative server operations](./authoritative-server-operations.md) for admission/deployment sequencing and [durable MMO services](./durable-mmo-services.md) for service, matchmaking, SQLite, and backup boundaries.

## Simulation And Feel Boundary

The engine MMO path supports server-authorized timing, deterministic state updates, interest-filtered replication, and client-side interpolation. Games own ability kits, AI persona, boss rules, impact style, audio choices, animation meaning, and combat tuning.

Client feel should be RAF-owned where possible: particles, indicators, shockwaves, charge rings, and other cosmetic motion may interpolate on the browser render clock while server state authorizes semantic timing and hit results. JS owns RAF, timers, input snapshots, Canvas submission, and Web Audio policy. WASM may be considered only for deterministic numeric kernels after typed inputs and benchmarks prove the win.
