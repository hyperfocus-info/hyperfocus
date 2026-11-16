# Serialization

Portable protobuf codecs, with explicit host adapters. No application,
UI, or credential ownership lives here. Repository policy is in
[serialization guidance](../../docs/serialization.md).

For schema-aware protobuf/JSON conversion in either direction, use the repository
[`protobuf:convert` command](../../scripts/serialization/README.md#convert-protobuf-and-json).

`encodeValue(value)` / `decodeValue(bytes)` encode bounded dynamic records as
the wire format of `google.protobuf.Value` with an `HFPB` version-1 prefix. The
owned schema uses repeated entries to preserve keys such as `__proto__` through
JavaScript codecs. Regenerate bindings with `bun run --cwd packages/serialization generate`.
These use protobuf fields,
not JSON text inside a binary wrapper. Use generated domain messages for stable
schemas and high-rate traffic; `Codec<T>` is the common byte interface.
`createValueCodec({ parse })` retains a domain validator around dynamic records.

`readStoredValue` accepts legacy JSON strings or current protobuf bytes; a binary
decode failure never falls back. `normalizeValue` validates/copies JSON-shaped
values, omitting undefined object fields and mapping undefined array slots to null.
Numbers must be finite; negative zero normalizes to zero. Cycles, non-plain objects
and unpaired Unicode surrogates are rejected. Readers still
need their domain validation. Defaults cap encoded bytes at 16 MiB, nesting at 64
and value nodes at one million; owners may pass explicit limits.

`@hyperfocus/serialization/text` provides `encodeStoredText` / `decodeStoredText`
for string-only boundaries explicitly selected for a protobuf experiment or rollout.
`encodeStoredText` writes `hf:pb:1:` plus canonical Base64; legacy
JSON remains readable. Files, database payloads and binary frames use bytes.
The envelope identifies the encoding, not the domain schema version. Keep schema
versions in the owning contract and preserve existing data during migrations.

`encodeStorageValue(value, { encoding })` keeps JSON as its default; protobuf must
be explicit. The JSON baseline uses native `JSON.stringify` semantics unless limits
are supplied. Explicit limits enable normalization and bounds for either encoding.
`readStoredBytes` recognizes file envelopes or legacy UTF-8 JSON; `readValueFrame`
also handles ArrayBuffer and offset views. Both reject corrupt identified protobuf.

The `/http` adapter sends `application/vnd.hyperfocus.value+protobuf` and reads that
format or JSON with streaming byte/chunk limits. The `/sqlite` adapter provides
`upgradeSqliteValues(db, columns, options)` for an explicitly authorized migration:
all selected TEXT rows convert in one immediate transaction, paged by rowid;
existing BLOBs remain untouched. It requires rowid tables with safe integer rowids, never changes schemas
or version markers, and rejects invalid rows unless `invalid: "preserve"` is explicit.
Hosts own migration approval, backups, markers and domain validation.

Run `bun run test:serialization` for boundary and real-consumer parity checks;
`bun run bench:serialization` compares domain codecs, equal compression, file saves
and SQLite footprints. See [measured decisions](../../docs/serialization-evidence.md).
The smaller synthetic probe is `bun run --cwd packages/serialization benchmark`;
its JSON baseline omits protobuf normalization overhead, so it is diagnostic only.
