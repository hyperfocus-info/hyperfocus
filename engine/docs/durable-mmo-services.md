# Durable MMO Services and Matchmaking

`@hyperfocus/engine/server` includes a provider-neutral asynchronous service layer for inventory, integer-denominated economy balances, guild membership, moderation, retained chat, matchmaking tickets, and audit history. The interfaces depend on `DurableServiceStore`, not a hosted product.

```ts
import {
  SignedSessionAuthority,
  createAuthoritativeServer,
  createDurableMmoServices,
  createDurableServiceAuthAdapter,
  createSqliteDurableServiceStore,
} from "@hyperfocus/engine/server";

const secret = Uint8Array.fromHex(process.env.SESSION_SIGNING_KEY_HEX!);
const sessionAuthority = new SignedSessionAuthority({
  issuer: "my-game",
  audience: "game-server",
  keys: [{ id: "2026-08", secret }],
  activeKeyId: "2026-08",
  sessionTtlMs: 15 * 60_000,
});
const store = createSqliteDurableServiceStore({ path: "./data/services.sqlite" });
const services = createDurableMmoServices(store);
const auth = createDurableServiceAuthAdapter(sessionAuthority, services);
const server = createAuthoritativeServer({ auth, /* rooms and transport */ });
```

The memory implementation is bounded reference infrastructure for tests and short-lived single-process development. The Bun SQLite implementation uses WAL, full synchronous commits, a configurable busy timeout, and `BEGIN IMMEDIATE` for every service operation. A different database can implement the same five-operation transaction boundary: `get`, `put`, `delete`, ordered `scan`, and `nextSequence`, plus coherent export and validate-before-swap replacement.

## Transaction and identity rules

- Inventory grants/consumption, wallet transfers, guild membership changes, moderation changes, chat writes/retention, ticket matching, and admission claims commit with their audit record and idempotency result in one transaction.
- Economy and inventory amounts are positive safe integers and bounded below JavaScript's unsafe range. Transfers lock both balances in one store transaction; insufficient funds write neither side.
- Mutations that could be retried accept a caller-owned idempotency key. Repeating the same key and input returns the stored result; changing input under that key fails. The configured record limit fails closed instead of silently losing replay protection.
- IDs are bounded, portable text. Store-generated entity IDs combine a monotonic store sequence with injected random text. SQLite uniqueness constraints are the final collision boundary.
- Public methods receive actor/player IDs because transport policy is application-owned. Never accept those IDs directly from an unverified client. Bind them to `SignedSessionIdentity.subject` or the `userId` returned by the AuthAdapter.
- `createDurableServiceAuthAdapter` consumes the existing HMAC one-use session and checks a durable active ban before authoritative-room admission. Chat checks active ban and mute records inside the same transaction as insertion.

Audit records identify the actor, operation, subject, timestamp, idempotency key where present, and bounded JSON details. They are append-only through the service API. Export them to longer-retention operator storage before reaching configured store limits; do not place secrets, raw session tokens, chat credentials, or private authentication material in audit details.

## Pagination and retention

Inventory, guild membership, moderation, chat, and audit lists return `{ items, nextCursor }`. Cursors are opaque store keys and scans are deterministic. Page size, guild size, JSON depth/nodes, record bytes, chat length, per-channel chat retention, idempotency count, and ticket lifetimes are bounded.

Chat history is newest-first and deletes the oldest entry in the same transaction when a channel exceeds its configured retention. Retention is not archival or legal-hold support. If the game's policy requires durable moderation evidence, copy the relevant audit/chat records to an access-controlled archive before deletion.

## Reconnect-safe matchmaking

`matchmaking.enqueue` records one active ticket per player. A reconnect can call `ticketForPlayer` or enqueue again with a new retry key and receives the still-valid waiting/matched ticket rather than losing queue position. `match` deterministically selects the oldest waiting tickets, marks them matched, and persists a short-lived random room handoff token. `claim` atomically verifies that token, player, ticket state, and expiry, then records a claimed state; retrying the same claim idempotency key returns its prior admission result.

The handoff is a low-rate control-plane capability, not an authoritative-server session token. After claim, issue a fresh signed one-use session for the room join and pass the claimed `roomId` to the normal server admission path. Send both only over TLS. A ticket database shared by several matchmaking processes must provide the same serializable transaction behavior; a per-process memory store cannot coordinate them.

## Backup boundary

Service records do not fit the existing room/player/event `PortablePersistenceAdapter` snapshot without weakening that schema. They therefore use a separate documented envelope:

- `createDurableServiceBackup(store, createdAt)` exports canonical JSON with format `hyperfocus-durable-services-backup`, version 1, ordered records/sequences, and SHA-256 checksum.
- `restoreDurableServiceBackup(store, bytes)` validates the envelope, checksum, record buckets/keys, JSON bounds, duplicate keys, record count, and byte limit before calling atomic replacement.
- Failed parsing, corruption, or replacement leaves the previous state intact.

Wrap the returned bytes with the server module's `encryptPortableBackup` AES-256-GCM envelope, then store them using the deployment's atomic object/file replacement, access control, retention, and off-host replication. The inner checksum detects accidental corruption; the authenticated outer envelope detects tampering and hides content. Keys and durable storage remain external. Drain writes or use a coherent store snapshot, verify each backup, and run isolated restore drills.

For SQLite, prefer the service backup API over copying the main database file while WAL writes are active. If an operator uses SQLite's native online backup API instead, preserve the database, WAL/checkpoint semantics, and test restoration with the same Bun/SQLite version. One SQLite file is a durable single-node boundary, not a multi-region database.

## Evidence and remaining production work

The tests race concurrent transfers, prove conservation and idempotent replay, reopen SQLite, inject corrupt JSON, fault transactions to prove rollback, tamper with checksummed backups, restore active matchmaking handoffs, and run a sustained 10,000-transfer service workload with bounded chat/state counts.

The engine does not supply OAuth/account recovery, a managed database/KMS/fleet account, cross-region consensus semantics, queue skill/rating policy, abuse classification, legal retention policy, a backup scheduler/destination, or staffed moderation. The server package now supplies authenticated HTTP adapters and a matching control-plane handler for remote persistence, shared replay, external key rings, regional leases, and capacity actuation, but operators must inject and operate the real provider backends. Those remain explicit replaceable deployment and game-policy responsibilities.
