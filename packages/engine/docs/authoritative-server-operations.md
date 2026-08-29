# Authoritative server operations

This module supplies a small, provider-neutral production boundary around the authoritative server: signed one-use session identity, injectable atomic replay consumption, bounded in-process metrics and health, graceful draining, and portable checksummed/encrypted persistence backups. It uses Web Crypto and ordinary byte/JSON interfaces. No hosted service, database, or deployment platform is required.

The boundary is intentionally content-neutral. Game rules stay in room types, while an operator can replace the in-memory persistence adapter with any adapter that implements the portable snapshot contract. Inventory/economy/social/matchmaking records use the separate `DurableServiceStore` transaction contract documented in [durable MMO services](./durable-mmo-services.md).

## Wire the server

Create one operations object and pass its adapters into the authoritative server:

```ts
import { createAuthoritativeServer } from "@hyperfocus/engine/server";
import {
  createPortableMemoryPersistenceAdapter,
  createServerOperations,
} from "@hyperfocus/engine/server";

const secret = Uint8Array.fromHex(process.env.SESSION_SIGNING_KEY_HEX!);
const persistence = createPortableMemoryPersistenceAdapter();
const operations = createServerOperations({
  sessions: {
    issuer: "my-game",
    audience: "game-server",
    keys: [{ id: "2026-08", secret }],
    activeKeyId: "2026-08",
    sessionTtlMs: 15 * 60_000,
  },
  persistence,
});

const server = createAuthoritativeServer({
  auth: operations.auth,
  metrics: operations.metrics,
  persistence,
  // roomTypes, transport, and game-specific options go here.
});
```

For durable gameplay services, construct `createDurableMmoServices` over `createSqliteDurableServiceStore` (single-node) or another serializable atomic store. Wrap the same session authority with `createDurableServiceAuthAdapter` so an active durable ban rejects room admission. Keep the service store handle outside room snapshots and close it after the authoritative server has drained.

Generate at least 32 random bytes for every signing key and inject them through the deployment's secret mechanism. Do not put keys in project data, source control, backups, logs, health output, or client bundles. Terminate TLS before tokens reach this API.

The session token is a compact HMAC-SHA256 envelope containing issuer, audience, subject, nonce, issue/expiry times, key ID, and bounded JSON attributes. Verification checks the signature and every time/key boundary before returning identity. Normal authentication consumes the nonce. A second use is rejected, including concurrent attempts where exactly one verifier can win.

This is deliberately a one-use admission token, not a reusable bearer cookie. Issue a fresh token for each connection attempt. The replay store is bounded and fails closed when full; it never evicts a still-valid nonce to make room. Size `maxReplayEntries` for the maximum admissions during one token lifetime plus clock-skew overlap, and alert on `operations.auth_rejected{reason=replay}` or `reason=invalid`.

## Rotate session keys

Rotation is an explicit overlap, followed by retirement:

1. Add the new key while retaining the old key, then make the new key active with `operations.sessions.rotate([oldKey, newKey], newKey.id)`.
2. Allow at least the maximum issued token lifetime plus configured clock skew to pass.
3. Remove the old key with `operations.sessions.rotate([newKey], newKey.id)`.

New tokens are signed only by the active key. Tokens issued during the previous period remain verifiable only while their key remains in the ring. A `notBefore`/`notAfter` window can constrain each key further. Rotation rejects duplicate IDs, short secrets, empty windows, and an active ID absent from the ring.

For multiple server processes, all admission processes must share the active/overlap keys and inject one `SessionReplayStore` backend with atomic `consume(nonce, expiresAt, now)` semantics. The default store is process-local, so it is suitable for one admission process or sticky routing. Verification fails closed if an injected store errors, saturates, or returns an invalid result. `createHttpSessionReplayStore` supplies the authenticated cross-process client, and `createDeploymentControlPlaneHandler` mounts the matching route over an operator-provided atomic store.

## Deployment control plane

`@hyperfocus/engine/server` now includes one concrete authenticated HTTP protocol for the deployment-owned pieces, rather than stopping at interfaces:

- `createHttpSessionReplayStore` consumes nonces in a shared service;
- `createHttpPersistenceAdapter` reads/writes player, room, and event state through a remote durable adapter;
- `createHttpKeyManager` loads versioned session and backup key rings from an external key-management boundary;
- `createHttpRegionCoordinator` publishes regional heartbeats and acquires named leases;
- `createRegionalAutoscaler` evaluates bounded queue/utilization policy with per-region cooldown, while `createHttpCapacityActuator` calls the deployment actuator; and
- `createDeploymentControlPlaneHandler` serves those routes over injected replay, persistence, key, region, and capacity backends.

The client requires HTTPS outside localhost, authenticates every request with a bounded bearer credential, applies a timeout, and rejects invalid response shapes. The handler compares credentials without early exit, limits request bytes, validates regional/capacity payloads, and marks responses `no-store`. Put it behind deployment TLS and network policy; use separate narrowly scoped credentials, rotation, request-rate limits, audit logs, and preferably workload identity or mTLS at the proxy. The handler is deployable application code, not a database or cloud-resource provisioner: atomicity, durability, encryption at rest, replication, consensus, backups, and regional failure behavior are properties of the injected production backends and must be tested there.

`validateOnCallRoster` is a startup/readiness guard for a time-bounded primary/secondary schedule. It rejects the same person or paging target in both roles and requires HTTPS runbook and escalation links. It proves the process received a structurally active roster; it cannot hire operators, test that a paging vendor delivered an alert, or replace an incident drill.

## Health and metrics

Publish `operations.health()` as JSON from an operator-only or appropriately protected endpoint. Supply live server counts when available:

```ts
const health = operations.health({
  rooms: server.rooms().length,
  players: server.presence.count(),
});
```

The response has stable lifecycle signals:

- `live` is true until shutdown finishes.
- `ready` is true only while new work is accepted. Remove the instance from load balancing when it becomes false.
- `status` and `state` distinguish `ok`, `draining`, and `stopped`.
- `inFlight`, `completedWork`, uptime, counts, persistence availability, bounded metric summaries, and metric cardinality diagnostics are included.

Metrics are structured counters, gauges, and histograms backed by the existing bounded metrics primitive. Series and tag limits prevent unbounded label growth. They are snapshots rather than a required observability vendor: serialize them to JSON, scrape them, or bridge them to the metrics system of your choice.

## Drain on shutdown

Track externally admitted work with `operations.drain.begin(kind)` or `operations.drain.run(kind, operation)`. The release callback is idempotent and must run in a `finally` block when using `begin` directly.

On `SIGTERM` or the platform's equivalent:

```ts
await operations.drain.shutdown(
  () => server.stop(),
  { drainTimeoutMs: 30_000, stopTimeoutMs: 30_000 },
);
```

`shutdown` immediately changes readiness to false and refuses new tracked work, waits for current work up to the bounded drain timeout, then invokes the server stop callback under its own timeout. Repeated shutdown calls share one promise. The returned evidence reports duration, completed work, a timeout flag, and work still pending at the drain deadline. Always retain this evidence in operator logs. A drain timeout does not skip the stop callback.

The controller can track HTTP admission, authentication, background persistence, or other work at the integration boundary. Existing work that is not registered with it cannot be observed or awaited.

## Backup and restore

`createPortableMemoryPersistenceAdapter()` provides the reference portable adapter. It bounds player, room, event, record, depth, node, and total backup sizes. Its snapshots contain only versioned JSON data; they do not contain runtime code or provider-specific metadata. `createSqlitePersistenceAdapter(options)` implements that same portable boundary for one durable Bun node with WAL, full synchronous commits, a busy timeout, transactional event batches, coherent export, and validate-before-swap replacement.

```ts
const bytes = await operations.backup({ createdAt: Date.now() });
// Write `bytes` using your platform's atomic file/object replacement operation.
```

The backup is canonical UTF-8 JSON with a SHA-256 checksum over its format, version, timestamp, and canonical snapshot. Equal state and `createdAt` produce byte-identical backups. This checksum detects corruption but is not a signature. `createEncryptedPortablePersistenceBackup` and `encryptPortableBackup` add a versioned AES-256-GCM envelope with authenticated metadata; restore accepts a key ring so keys can overlap during rotation and rejects tampering or unknown keys before mutating persistence. Supply exact 32-byte keys through external key management. The API returns bytes instead of choosing a filesystem, bucket, or database, so the operator still controls durable remote storage, access, scheduling, and retention. The memory adapter alone is not durable.

Restore before admitting traffic with `restorePortablePersistenceBackup(persistence, bytes)`, or drain/stop the operations object before calling `operations.restore(bytes)`. Restore validates format, version, field set, checksum, counts, byte sizes, JSON depth/nodes, IDs, duplicates, and all records before the adapter's atomic replacement boundary. A failed validation or checksum leaves current state unchanged.

For a durable custom backend, implement `PortablePersistenceAdapter`. `exportPortableSnapshot()` must observe one coherent state, and `replacePortableSnapshotAtomic()` must commit the fully validated snapshot as one transaction or equivalent pointer/version swap. The returned JSON format remains portable across storage providers.

Operationally:

1. While accepting traffic, call `operations.backup`; it is tracked, so a concurrent graceful shutdown waits for it. The adapter snapshot itself must be coherent.
2. If policy requires a stopped-world backup, drain first and call the lower-level `createPortablePersistenceBackup(persistence, options)` helper.
3. Atomically store the returned bytes under a new name/version.
4. Verify retention and perform periodic restore drills in an isolated process.
5. To restore production, remove readiness, finish draining, validate and restore, then start a fresh accepting process.

Durable service backups are a separate checksummed envelope because inventory, wallet, guild, moderation, chat, audit, idempotency, and matchmaking records do not belong in the room/player/event snapshot schema. The generic `encryptPortableBackup`/`decryptPortableBackup` helpers can wrap those bytes too. During shutdown: remove readiness, stop new matchmaking/service mutations, drain authoritative work, create both backups, encrypt them, atomically persist them, then close SQLite. Restore and validate both envelopes before accepting signed sessions. The deployment control-plane protocol can connect remote replay, persistence, key, lease, and capacity services, but this repository does not create hosted resources, select a cloud database/KMS/fleet provider, schedule backups, or supply multi-node transaction/consensus semantics. Those remain explicit deployment choices rather than hidden hosted dependencies.
