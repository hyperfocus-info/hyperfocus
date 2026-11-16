# @hyperfocus/review-store

A privileged Bun SQLite primitive for AI output and human feedback. Marketing
artifact review and Synaesthetic evaluation use the same persistence contract;
hosts own their screens, authorization, payload validation, and database lifecycle.
There is no browser persistence, export flow, grading vocabulary, or HTTP server
in this package.

```ts
import { Database } from "bun:sqlite";
import { createReviewStore } from "@hyperfocus/review-store";

const database = new Database("reviews.sqlite");
const reviews = createReviewStore({ database });
const identity = { namespace: "music", assetId: "room-flip", version: "v1" };
reviews.registerAsset({ ...identity, contentHash: "host-computed-content-digest", metadata: { title: "Room flip" } });
const result = reviews.saveFeedback({ ...identity, expectedRevision: 0,
  payload: { grade: "B", sections: [{ start: 2, end: 5, note: "Keep this texture" }] } });
// Handle result.status === "conflict" using result.feedback, never silently overwrite.
database.close();
```

`registerAsset` fixes the namespace/asset/version identity, content hash, JSON
metadata and optional media bytes permanently. Repeating exactly the same
registration is idempotent; different metadata or bytes require a new version.
When `content` is supplied, its SHA-256 hex digest must equal `contentHash`. Store
bytes for host-independent media delivery. Metadata-only assets support hosts
which already own durable media storage; their content digest is the host's
responsibility. New versions start with no feedback even if their bytes match.

`saveFeedback` appends a complete JSON snapshot under the exact asset version and
reviewer (`owner` by default). `expectedRevision: 0` creates the first snapshot;
later saves must match the current revision. Immediate SQLite transactions serialize
the comparison and insert across connections. Old snapshots remain queryable.
These methods can participate in a surrounding host transaction for migrations.

`hasAsset` checks identity existence without loading media bytes. `readAsset`
returns metadata and optional bytes. `listVersions` filters by namespace
and optional asset ID, in registration order. `readFeedback` returns the latest
snapshot or null. `listFeedback` returns latest snapshots per asset/version/reviewer;
`history` returns every revision in insertion order, oldest first. Both accept
namespace with optional assetId, version, and reviewerId filters. Every returned
record includes createdAt; insertion order remains deterministic when timestamps
tie. Hosts should namespace independent review domains and carry domain-specific
scores, comments, section anchors, and run IDs inside the JSON payload.

Tables use the `hf_review_` prefix and do not replace host tables or change host
SQLite pragmas. Mutations reject feedback for missing assets and expose no update
or delete operation. Hosts remain responsible for database backups and access.

JSON remains the default. `createReviewStore({ database, encoding: "protobuf" })`
is an explicit comparison option: it atomically upgrades existing TEXT metadata
and feedback to bounded protobuf BLOBs and selects binary writes. Both formats
remain readable; invalid legacy rows abort the whole upgrade. Use disposable copies
for A/B tests; selecting the option on an existing store is a data migration.
The [serialization evidence](../../docs/serialization-evidence.md) does not justify
changing the default for these dynamic records.

Run `bun test packages/review-store` for immutable versions, archived annotations,
reopen durability, stale writes across connections, isolation, and host rollback.
