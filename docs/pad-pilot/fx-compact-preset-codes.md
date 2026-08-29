# FX Compact Preset Codes

The FX Module accepts a paste-safe representation of a complete PadPilot FX Preset. Use the file-input button beside **Chain Presets**, paste the code, and choose **Apply State**.

## Wire contract

Version 1 is:

```text
ppfx1:<canonical Base64 of protobuf PresetFile bytes>
```

`PresetFile` is defined in `apps/pad-pilot/utils/proto/fx-chain.proto`. Its `module_id` must be `fx`; its `schema_version` must be supported; its `state` field contains protobuf `FxChainState` bytes with the same schema version. The code is called compact because protobuf replaces verbose JSON field names with a binary schema. Base64 makes those bytes safe to paste and adds roughly one third to their size. Version 1 does not use gzip, zstd, or another compression algorithm.

Never change the meaning of `ppfx1`. A future compression or envelope change requires a new prefix such as `ppfx2`.

## Apply and persistence behavior

Applying a code replaces the working graph through the same canonical Module-state path used by normal FX edits. The provider advances the host-owned revision before sending it to the processor, so pasted revisions cannot roll host state backward. The operation enters undo history and clears `selectedPresetId` because a pasted envelope is not necessarily installed in the user's Preset library.

The DAW project can save the applied canonical state immediately. Choose **Save New** afterward only when the Preset should also appear in the reusable user Preset library.

Critical audio state never goes to `localStorage`. The modal owns only its temporary text and validation error.

## Admission rules

The UI rejects a code before changing state when any of these checks fail:

- exact `ppfx1:` prefix and canonical padded Base64;
- 512 KiB maximum decoded envelope;
- non-empty FX Module and matching supported envelope/state schema versions;
- Preset name at most 256 UTF-8 bytes and ID at most 128 UTF-8 bytes;
- non-empty protobuf state; and
- finite numeric values throughout the decoded state.

Normal FX graph normalization still enforces the eight-chain, eight-node-per-chain, two-modulator, and sixteen-route caps. Native processor validation remains the final authority.

## Deterministic FL Studio fixtures

`bun run prepare:fl-studio-validation` generates two binary Preset envelopes and matching code files under `validation/fl-studio/`:

- `fl-validation-unity.preset` and `fl-validation-unity.preset-code.txt` — eight active empty chains at unity;
- `fl-validation-controls.preset` and `fl-validation-controls.preset-code.txt` — one fully wet EQ chain with a `997 Hz`, `+12 dB`, `Q 1.1` bell.

`apps/pad-pilot/scripts/generate-fl-studio-validation-presets.test.ts` decodes both representations and pins their measurable state. This prevents validation setup instructions from drifting away from a state the plugin can actually load.
