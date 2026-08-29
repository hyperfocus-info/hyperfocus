# VST Quality Gates

Updated: 2026-08-29

PadPilot audio work is complete only when rendered samples, processor-owned state, and host behavior agree. UI screenshots, protobuf round-trips, and source-contract tests are supporting evidence, not proof that a VST behaves correctly.

## Product routing contract

- Nodes are serial inside a chain.
- Active chains are parallel and receive the same post-input-gain source.
- Muted chains do not render. When any chain is soloed, only unmuted soloed chains render.
- A node's `mix` crossfades that node's processed output against its input. A chain's `mix` crossfades that chain's processed output against its source.
- The parallel-chain sum is divided by the number of rendered chains. This preserves unity for transparent, empty, or fully bypassed parallel chains instead of multiplying the dry signal by rack count. An entirely unconfigured graph is transparent dry; a configured rack with no rendered chains is silent on its wet path.
- Master wet/dry is applied once, after the normalized rack result: `output = rack * wet + input * (1 - wet)`.
- Master output gain is applied after master wet/dry.
- Selecting a ready Module without the `fx-graph` capability ramps the graph to dry, then stops processing it. Selecting an `fx-graph` Module resumes through the same five-millisecond structural ramp.

This is a safety-first averaging model. Adding a rendered parallel chain changes the contribution of existing chains. A future summing model may use explicit per-chain send gains, but it must preserve transparent unity and ship with migrated state plus new native tests.

## Why this contract exists

Commercial rack products establish two useful conventions. Ableton Effect Rack chains receive the same input and their outputs are mixed; Snap Heap exposes explicit lane gain/mix, mute, and solo, and its own parallel-effect examples put a clean lane beside a 100%-wet effect lane. PadPilot therefore must not accidentally pass full dry through every lane and then add another full dry path at master level.

VST bypass and persistence are processor responsibilities. Steinberg requires plug-ins to perform bypass and preserve it in state. JUCE's `getStateInformation` contract says the returned block must contain all internal state and parameters needed by `setStateInformation`. FL Studio also has wrapper diagnostics specifically for processor-state and noisy-output failures. These are host contracts, not UI concerns.

## Native audio acceptance matrix

Every affected graph change needs deterministic native coverage at the closest rendered-sample boundary.

| Case | Required result |
| --- | --- |
| One empty chain | Output equals input; maximum absolute error `<= 1e-6` |
| Eight empty parallel chains | Output equals input; no `+18.06 dB` multiplication |
| Master wet/dry `0` | Sample-identical dry after control application |
| Node bypass | Same steady-state render as the node's input |
| Node mute | Silence for that serial lane contribution |
| Node solo | Only the selected node path participates in its chain |
| Chain mute/solo | Rendered audio follows the visible topology state |
| Only configured chain muted | Wet rack is silent; an entirely unconfigured graph remains transparent dry |
| Non-FX Module selected | FX graph reaches transparent dry, then becomes quiescent |
| Silence input | Finite output; no NaN, infinity, DC burst, or self-oscillation outside an explicitly tested generator |
| Legal block partitions | Equivalent steady-state render for small, uneven, and oversized host blocks |
| Restore | Restored canonical state and steady-state render match the saved instance |

Level assertions must name the reference point and tolerance. “Sounds different” is not a regression test. For nonlinear or time-varying DSP, use stable properties such as finite bounds, expected RMS/peak range, impulse timing, spectral-band energy, or seeded repeatability.

## Realtime control acceptance

For every interactive FX field, verify this complete ledger:

1. UI mutation updates canonical processor-owned Module state.
2. The processor validates the state and revision.
3. A bounded `AudioCommand` covers the field, or the change uses the quiescent structural replacement path.
4. The graph applies the command without allocation, locking, I/O, logging, or JavaScript.
5. A native test applies that exact command and observes the promised sample change.
6. Saving and restoring retains the value.

Adding a protobuf field or a toggle handler without steps 3–5 creates a cosmetic control. Source-string assertions may guard the ledger's wiring, but cannot replace the rendered-audio assertion.

## Persistence acceptance

Canonical state lives in `PadPilotAudioProcessor`; WebView state is a cache. The host snapshot must cover selected Module and Preset, bounded per-Module payloads and accepted revisions, FX/Recut/Analyzer state, automation bindings and parameter values, controller configuration, editor view cache, and managed-media recovery records.

Schema version 8 stores the normalized positions of all three master parameters and 16 macro slots as one exact-size, finite `[0, 1]` snapshot. Older snapshots may omit it; new snapshots may not provide a partial list.

Use layered proof. Product-host priority is FL Studio 2026; FL Studio 21 is the compatibility floor. Passing both is strong Image-Line coverage, not proof for hosts with different state-call ordering, buses, automation, suspend/resume, or block scheduling.

1. Native codec tests reject malformed or oversized state and round-trip each typed payload.
2. Processor-boundary tests mutate state, call `getStateInformation`, restore into a fresh processor through `setStateInformation`, and compare state plus render.
3. FL Studio 2026 loads a saved project in a fresh process and passes measured offline renders plus the manual interaction matrix.
4. FL Studio 21 independently loads equivalent version-native fixtures and produces compatible results.
5. pluginval strictness 10 exercises parameter fuzzing and repeated state restoration.
6. Steinberg validator runs extensive VST3 conformance tests.

If a layer is unavailable, record it as unproven. Serialization code existing is not evidence that FL Studio called it at the correct lifecycle boundary or that runtime DSP received the restored state.

## FL Studio release gate

Primary target: FL Studio 2026. Compatibility floor: FL Studio 21. Projects must be created independently in each version; never assume a newer `.flp` is a valid older-host fixture.

`validation/fl-studio/fixture-instructions.md` defines two golden projects per host. Tested protobuf Preset codes create the exact graphs; no hand-built eight-chain state is accepted as the fixture contract. `validate:fl-studio` launches each host as a fresh process through Image-Line's diagnostic command-line render mode, checks sample-aligned unity and two dry segments, wet effect audibility, sample-aligned restored-wet repeatability, non-finite samples, clipping, duration, sample rate, channels, and FL21/FL26 level parity. Sample comparison prevents polarity or channel corruption from passing on peak/RMS alone. Chain mute is not falsely advertised as host-automatable: native graph tests prove it automatically and the FL editor smoke matrix proves the host interaction. The runner writes immutable WAV/report evidence under `build/fl-studio-validation/`.

Automated renders do not prove editor interaction. Complete this manual smoke matrix in FL Studio 2026 for every release candidate and in FL Studio 21 when host-facing code changes:

Use a known stereo WAV peaking near `-18 dBFS`; disable mixer parallel routing around the test insert.

1. Insert a fresh Release PadPilot VST3. Confirm one empty chain and eight empty chains both retain the input level within `0.01 dB`.
2. Add an obviously measurable effect. Toggle node bypass/mute/solo, chain mute/solo, Dry Compare, and master wet/dry. Each action must match the routing contract.
3. Switch from FX to Analyzer or another Module while audio plays. The signal must ramp cleanly to dry and remain dry. Switch back and confirm the FX state returns.
4. Save a project with a non-default selected Module, Preset, rack topology, node controls, automation assignments, and imported media. Exit FL Studio completely, reopen, and compare every value plus audible/rendered behavior.
5. Repeat save/restore once with the editor closed and once with it open. Test duplicate plugin instances so state cannot bleed between instances.
6. Render offline and realtime. Compare duration, peak/RMS, channel polarity, tails, and absence of non-finite samples or bursts.
7. Preserve the FL Studio diagnostic report and `%APPDATA%/PadPilot/logs/padpilot-backend.log` with the release evidence.

## Automated commands

```text
bun run test:plugin-native
bun run test:plugin-contracts
bun run bootstrap:vst-validators
bun run prepare:fl-studio-validation
bun run validate:fl-studio
bun run validate:vst3
```

`bootstrap:vst-validators` installs pinned, checksum-verified pluginval and builds a commit-pinned Steinberg validator under ignored `build/vst-validators/`; it performs no global package installation. `validate:vst3` discovers those tools automatically and fails closed when either is missing. Use `--only pluginval` or `--only steinberg` only for a deliberately scoped local run. Default pluginval strictness is 10 and Steinberg extensive mode is on; lower settings are diagnostics, not release gates.

The repo-local `$vst-quality` skill teaches agents to apply this document. Stable failures also belong in `.agents/skills/correctness/references/known-findings.md`, updated through `apps/pad-pilot/scripts/update-correctness-skill.ts`.

## AI workflow

AI does not need subjective listening to catch this class of defect. Convert audio behavior into deterministic signals and invariants first: constants for gain math, impulses for timing/tails, seeded noise or tones for spectral behavior, and save-render-restore comparisons for state. Human listening remains the final product check, not the first correctness oracle.

For unfamiliar DSP or host behavior, research primary sources and record the exact product decision before coding. Avoid copying another product's surface without defining PadPilot's math. Keep fixture generation deterministic and store compact metrics or WAV hashes when they improve review; do not commit large renders without a clear need.

## Primary references

- [JUCE AudioProcessor state contract](https://docs.juce.com/master/classjuce_1_1AudioProcessor.html)
- [Steinberg VST3 persistence sequence](https://steinbergmedia.github.io/vst3_dev_portal/pages/FAQ/Persistence.html)
- [Steinberg VST3 processing and bypass](https://steinbergmedia.github.io/vst3_dev_portal/pages/FAQ/Processing.html)
- [Steinberg VST3 Plug-in Test Host](https://steinbergmedia.github.io/vst3_dev_portal/pages/What%2Bis%2Bthe%2BVST%2B3%2BSDK/Plug-in%2BTest%2BHost.html)
- [Steinberg validator source and CLI](https://github.com/steinbergmedia/vst3_public_sdk/blob/master/samples/vst-hosting/validator/source/validator.cpp)
- [Tracktion pluginval](https://github.com/Tracktion/pluginval)
- [FL Studio Plugin Wrapper](https://www.image-line.com/fl-studio-learning-content/fl-studio-online-manual/html/plugins/wrapper.htm)
- [FL Studio command-line rendering](https://www.image-line.com/fl-studio-learning/fl-studio-beta-online-manual/html/fformats_save_export.htm)
- [Ableton Instrument, Drum, and Effect Racks](https://www.ableton.com/en/live-manual/12/instrument-drum-and-effect-racks/)
- [Kilohearts Snap Heap](https://kilohearts.com/docs/snap_heap)
- [Kilohearts parallel Snap Heap examples](https://kilohearts.com/blog/useful_vocal_effects_you_can_make_in_snap_heap)
