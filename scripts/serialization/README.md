# Serialization comparisons

Run from the repository root:

```sh
bun run test:serialization
bun run bench:serialization
bun run bench:serialization --storage-only
bun run bench:serialization --workload replay
bunx tsc --noEmit -p scripts/serialization/tsconfig.json
```

The benchmark uses engine combat input/recording and portable-backup contracts,
Harness event validation, PadPilot's existing PluginState schema, and the real
review-store API. Replays use the production Touch of Death archive codec.
`schema/candidates.proto` contains experiment-only alternatives;
regenerate with `bun scripts/serialization/generate.ts`. PadPilot owns its fixture
at the private app export `@hyperfocus/pad-pilot-app/serialization-workload`.

Candidates must round-trip identically before timing; backup tests restore through
the existing checksum boundary. Trials run serial paired ABBA/BAAB, with raw and
gzip-6 variants. Reports retain samples, process CPU, retained heap deltas, byte
counts and explicitly estimated bandwidth thresholds. Storage trials include
file fsync/read/decode and SQLite WAL/checkpoint footprints on disposable fixtures.
They never open user databases. Temporary files and reports stay in `.local/`.

Machine context uses [performance helpers](../../packages/performance/README.md).
Unrecorded thermal/power/contention context prevents cross-run timing conclusions.
Batch-mean p95 is not per-event tail latency; retained heap is not allocation or GC
profiling. Warm file reads do not establish cold-device performance. Synthetic
recordings and repeated presets do not certify native DAW/replay acceptance.

[Policy](../../docs/serialization.md) owns adoption gates;
[evidence](../../docs/serialization-evidence.md) owns current decisions. This runner
is a repeatable comparison, not an automatic migration or a speed assertion in CI.

## Convert protobuf and JSON

```sh
bun run protobuf:convert to-json --format replay --input match.pb --output match.json
bun run protobuf:convert to-protobuf --format replay --input match.json --output match.pb
bun run protobuf:convert to-json --format value --input data.pb --output data.json
bun run protobuf:convert to-protobuf --proto path/message.proto --type example.Message --input data.json --output data.pb
bun run protobuf:convert to-json --proto path/message.proto --type example.Message --input data.pb --output data.json
bun run protobuf:convert to-json --descriptor schema.pb --type example.Message --input data.pb --output data.json
```

Raw protobuf is not self-describing: provide the original schema and fully
qualified message type. `--include DIR` adds import roots; repeat as needed.
Descriptor sets must include imported files (`protoc --include_imports`).
Schema conversion uses standard ProtoJSON: bytes become Base64, 64-bit integers
become decimal strings, and enums use names. Unknown JSON fields reject. The
registry resolves `Any` when its message type is included in the schema set.
Unknown wire fields and original byte ordering cannot survive a JSON round trip.
External compression/framing must be removed first; this command converts one
message, not an arbitrary stream or an entire VST host container.

`--format replay` handles the versioned HFRP archive and ordinary replay JSON;
`--format value` handles the shared HFPB Value envelope and ordinary JSON.
Raw `.proto` mode does not strip these envelopes. Input/output default to a
64 MiB bound (`--max-bytes` overrides it); replay's own 20 MiB bound still applies.
The output path must not exist. Decode/validation errors leave the source intact
and create no output. Run `--help` for options.
