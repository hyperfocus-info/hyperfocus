# Serialization and persistence

Prefer schema-owned protobuf when a measured storage, bandwidth, streaming or
schema-evolution benefit justifies it. Adoption is per workload, not a blanket
JSON replacement. Keep the current representation until equivalent A/B evidence
supports changing it, including cold storage. In particular, preserve the
engine's specialized binary input/replication codecs unless a full-loop comparison
shows a win. Protobuf is not inherently faster, smaller or more CPU-intensive.
Decision: user clarification on 2026-10-07 supersedes the earlier blanket migration.
Current measured decisions and reproduction commands live in
[serialization evidence](serialization-evidence.md).

Prioritize VST plugin state, Touch of Death replay archives, SQL backups and other
large disk-bound payloads; bandwidth-constrained communications; event streams;
and contracts expected to evolve over time. These are candidates, not exemptions
from measurement. Small preferences and CPU-bound hot paths have no presumption
of benefit. PadPilot's existing typed protobuf state/streams remain in place.

## Ownership and representation

Own schemas beside the domain contract. Generate TypeScript codecs with the
PadPilot `@bufbuild/protobuf` toolchain and generate native codecs when native
code consumes that schema. Never hand-edit generated bindings. Share codecs
through manifest-backed package exports; engine-facing codecs stay framework
neutral and host I/O stays with the host.

Use `Codec<T>` and byte-based utilities from
[`@hyperfocus/serialization`](../packages/serialization/README.md). Stable domain
schemas should have named messages. The bounded dynamic Value codec is a comparison
candidate, not a performance shortcut: it retains field names and dynamic type
overhead. Retain domain validators. Do not wrap JSON text in a
protobuf string/bytes field or use ProtoJSON as the persisted format.

Store bytes directly in files, SQLite BLOBs, IndexedDB and binary-capable
transports. Only string-only boundaries use the versioned Base64 text adapter.
Keep queryable relational columns relational and raw media as raw bytes.
Protobuf does not require converting scalar columns or in-memory objects.
For streams, define framing, message kind, bounds, cancellation/backpressure and
revision/order semantics in the owning protocol; protobuf alone supplies none of
those transport guarantees. Serialization stays off PadPilot's Audio Thread.

## Compatibility and validation

After a workload passes its evidence gate, preserve existing saved data through
explicit legacy readers and transactional or atomic upgrades. New writes may use
protobuf after the matching readers are deployed. Do not bulk-rewrite live data
as a benchmark. Use disposable copies and keep rollback possible.
Identify format/version explicitly; malformed or unsupported protobuf must not
fall back to JSON or silently reset valid state. Test old data, restart, failed
migration rollback, mixed-version behavior and the actual consumer boundary.
Do not delete originals before validating and committing the replacement.

Keep field numbers stable, reserve removed numbers/names and model presence when
missing differs from zero/false/empty. Define numeric precision, unknown enum and
unknown-field behavior for each contract. Validate decoded domain values and bound
bytes and nested structures before accepting them. These follow the
[protobuf evolution rules](https://protobuf.dev/programming-guides/proto3/).
Do not treat arbitrary protobuf output as canonical identity/signature bytes;
the owner must define and test canonicalization separately.

JSON remains the baseline where no worthwhile protobuf benefit has been shown,
and at boundaries that require it: third-party protocols and webhooks,
language/tool manifests such as `package.json`, established public interchange
formats and explicitly requested human-readable exports. Preserve raw signed
external payloads when their bytes matter. Document the exact boundary and reason
in its owner; an external JSON API does not exempt internal copies or caches.
Human-facing diagnostics and source text may remain text. Existing code alone is
not evidence of optimality; a `*.json` extension alone decides neither format.

## Adoption evidence for every workload

Do not assume protobuf encodes/decodes faster, uses more CPU, or is always smaller.
Compare JSON, named-message protobuf, and the current specialized binary codec
(where one exists) on representative small/large and sparse/dense payloads
with identical meaning, validation, compression, batching and transport behavior.
Measure encode/decode CPU time, allocation/GC, final stored/transferred bytes,
throughput and full-operation median/p95/tail latency. Include schema mapping,
UTF-8/Base64, framing and I/O costs; report cold startup/bundle cost when relevant.
For archives/backups, compare both uncompressed and equally compressed variants,
including compression CPU and restore time. Compress before encryption. Measure
actual files/SQLite pages/WAL and durable commits separately from encoded size;
codec-only timings do not establish a disk or network speedup. Derive bandwidth
break-even estimates from byte savings and added CPU, label them as estimates,
then verify the target link with representative batching and backpressure.

Verify parity first, then run warmups and repeated serial A/B/B/A trials in the
same environment. Use the existing
[performance evidence helpers](../packages/performance/README.md); keep raw runs
in the nearest `.local/`. Record the workload, evidence and decision beside the
owner. Before adoption, state the owner-specific byte/latency/CPU budget and
acceptable regression; report mixed results rather than collapsing them into a
single throughput claim. Schema evolution may justify an explicit tradeoff even
without speed gains, but needs old/new-reader and unknown-field tests and a
documented reason. Timing evidence is separate from deterministic correctness
gates. Incomplete environment context, a synthetic fixture, or codec-only results
support a candidate, not a default rollout.
