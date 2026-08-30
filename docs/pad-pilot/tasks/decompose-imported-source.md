# Decompose imported PadPilot source

- Owner: PadPilot app and marketplace
- Deadline: before public beta
- Status: active

The initial zipper slice preserves verified source behavior and records exact
file/directory/declaration ceilings in `scripts/source-structure-baseline.json`.

Exit criteria:

- Remove both PadPilot declaration deferrals; all declarations are at most 400 lines.
  Complete: PadPilot app and Marketplace have no declaration deferral.
- Split imported production files below 1000 lines. Complete for PadPilot and
  Marketplace; generated protobuf output is excluded by deterministic-generation policy.
- Group Marketplace auth, billing, and server domains so its source root stays at
  or below 25 direct files. Complete; transaction and router suites remain green.
- Ratchet crowded directories after each ownership split; remove exceptions at 25 files.
- Preserve marketplace transaction semantics, Module public API parity, processor
  state roundtrips, and Audio Thread safety through focused tests.
