---
name: vst-quality
description: Audit, implement, or review PadPilot audio behavior and host persistence with measurable DSP, realtime-control, state-roundtrip, and VST-host gates. Use for FX routing, bypass, wet/dry, gain, Module audio ownership, save/restore, DAW compatibility, or release-readiness work; do not use for UI-only styling.
---

# VST Quality

Read `docs/pad-pilot/vst-quality-gates.md` before changing audio or persistence behavior. Treat it as PadPilot's acceptance contract.

## Evidence standard

Trace the whole path that owns the behavior:

`UI intent -> canonical processor state -> bounded realtime command or quiescent graph replacement -> rendered samples -> host save/restore`

Do not call a feature working because its UI state changed, its protobuf serialized, or a source-string contract passed. Prove the closest observable boundary:

- Audio behavior: deterministic native render with explicit sample/gain expectation.
- Realtime control: change state through the actual command type, then assert rendered audio changes.
- Persistence: mutate meaningful state, invoke the host save/restore boundary, and compare canonical state plus rendered output after restore.
- Host compatibility: treat FL Studio 2026 as primary product host and FL Studio 21 as compatibility floor; run both measured golden-project renders plus the manual interaction matrix. Run pluginval strictness 10 and Steinberg validator extensive as independent conformance/fuzz gates.

If a validator or target host is unavailable, report that layer as unproven. Never silently downgrade the gate.

## Mandatory audio contracts

For affected routing, cover applicable cases: transparent unity, zero-wet sample-identical dry, bypass sample-identical after its bounded ramp, mute silence, solo isolation, silence finite, maximum legal rack count, variable block partitions, and state restore producing the same steady-state render.

Parallel racks receive the same source. Any summing policy must be explicit and tested; transparent active racks may not multiply dry gain.

Keep Audio Thread work allocation-free, lock-free, non-blocking, and free of JavaScript or logging. Preallocate in `prepareToPlay`; use atomics/FIFOs for control changes.

## Commands

Run the narrow red test first, then the relevant suite:

```text
bun.cmd run --cwd apps/pad-pilot test:plugin-native
bun.cmd run --cwd apps/pad-pilot test:plugin-contracts
bun.cmd run --cwd apps/pad-pilot bootstrap:vst-validators
bun.cmd run --cwd apps/pad-pilot validate:fl-studio
bun.cmd run --cwd apps/pad-pilot validate:vst3
```

After any `apps/pad-pilot/scripts` edit, also run the app typecheck and `bun.cmd test apps/pad-pilot/scripts`.

When a failure exposes a reusable cross-layer pattern, append it through `apps/pad-pilot/scripts/update-correctness-skill.ts`; include symptom, root cause, fix pattern, regression test, and files.
