# Decompose imported PadPilot source

- Owner: PadPilot app and marketplace
- Deadline: before public beta
- Status: active

The initial zipper slice preserves verified source behavior and records exact
file/directory/declaration ceilings in `apps/pad-pilot/scripts/source-structure-baseline.json`.

Exit criteria:

- Remove both PadPilot declaration deferrals; all declarations are at most 400 lines.
- Split imported production files below 1000 lines; generated protobuf output is
  excluded by deterministic-generation policy or reduced at schema ownership.
- Ratchet crowded directories after each ownership split; remove exceptions at 25 files.
- Preserve marketplace transaction semantics, Module public API parity, processor
  state roundtrips, and Audio Thread safety through focused tests.
