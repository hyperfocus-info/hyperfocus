# FX CHAIN SFX - PRO Backend Gap

Updated: 2026-08-29

## Current state
The native backend now has a fixed-capacity `8 x 8` FX graph:
- up to 8 parallel chains
- up to 8 serial nodes per chain
- actual chain/node ordering from `FxChainState`
- actual per-node meter peaks and waveform snapshots feeding the protobuf visualizer path
- 19 addable node types whose interactive controls have observable native behavior
- two tempo-syncable public LFOs and 16 fixed-capacity modulation routes

This closes the earlier hard limitation where only one effective processor per chain existed.

## Remaining gaps

### Structural apply path
Structural protobuf commits use a click-free dry-ramp handshake around the bounded in-place apply.
The Audio Thread crossfades the current graph to transparent dry input using preallocated scratch,
publishes completion atomically, and never waits. The writer then suspends processing, waits for active
graph readers to leave, applies the replacement, and releases the graph. Processing resumes with a
sample ramp from dry into the replacement graph. If a host is not calling the Audio Thread, the writer
uses a bounded 100 ms acknowledgement window before applying while playback is already idle.

This removes the former abrupt dry-block discontinuity. A future immutable off-thread graph builder may
still reduce message-thread apply latency, but it is no longer required to prevent clicks or RT blocking.

### Command surface consistency
The public UI no longer exposes the legacy `setParam` bridge. FX UI changes use authenticated
`fx-graph` and `automation` capability handles; internal fixed-size `AudioCommand` values remain the
Script Thread-to-Audio Thread transport after ScriptHost verifies Module identity and grants.

### DSP behavior polish
The 8x8 graph applies rendered-chain count compensation after summing parallel chains. Empty, transparent,
or bypassed rendered racks therefore preserve unity at every legal chain count. An unconfigured graph remains
transparent, while a configured rack with no rendered chains has a silent wet path. Native coverage pins the
eight-chain and only-chain-muted cases.
The safety-first averaging policy and future migration constraints are documented in `docs/pad-pilot/vst-quality-gates.md`.

The shipped control registry exposes only parameters with native behavior. Protobuf fields remain
reserved for preset/wire compatibility but are not interactive controls until their DSP exists:

- convolver stretch/reverse/trim/high-pass/low-pass
- delay grain mode/size/density/spray/pitch
- reverb shimmer
- compressor knee/sidechain HPF/lookahead/multiband
- noise-gate sidechain listen
- chorus voice count

Convolver is addable with a per-node managed IR reference and a truthful Blend control. Browser bytes and
native paths enter through `PadPilot.IO.importFile` under the `impulse-response` category, are capped at
25 MiB, persist deduplicated fallback media within a 32 MiB aggregate budget, heal the managed cache on restore, and load while the graph is
structurally faded to dry. Stretch, reverse, trim, and filtering remain wire-compatible but hidden.
Phaser now runs a fixed-capacity all-pass cascade; Rotary Speaker splits horn/drum bands and
applies independent slew, amplitude, and bounded Doppler modulation; Pitch Drift uses bounded preallocated
variable-delay modulation. Their public controls, realtime parameter IDs, telemetry, and state restore paths
map to those named algorithms.

Reverse uses two preallocated stereo window banks and never resizes during processing. Tremolo reuses the
native modulation processor for smoothed sine/triangle/square/random amplitude motion. Saturation runs a
dedicated custom path with Soft Clip, Tube, Transistor, and Fold characters. Delay now maps low/high cut,
width, saturation, and Clean/Tape/BBD/Digital character fields. EQ maps low shelf, bell, and high shelf
frequencies independently. The modulation matrix advances two fixed LFO slots and applies bounded routes
once per block without allocations, locks, I/O, logging, or JavaScript on the Audio Thread.

Delay-bearing tempo sync (delay time, reverb pre-delay, and chorus voice delay) is intentionally
bounded to divisions through `1/4T` (at most one beat). Native delay storage is allocated in
`prepareToPlay` for three seconds at the active sample rate, which preserves that contract down to
20 BPM at 192 kHz without Audio Thread allocation. LFO-rate sync retains the full division list.

Native coverage now exercises graph restore, repeated chain/node reorder with observable DSP,
PresetStore protobuf round-trip into the graph, malformed-float rejection, tail estimation, and
sample-identical rendering across small, uneven, and oversized host block partitions. Partition
coverage includes delay, random auto-pan, modulated reverb, pro modulation partition invariance, audible
difference from bypass, and managed Convolver impulse/bypass/restore. High-rate
coverage exercises free and synced delay storage at 192 kHz/20 BPM; response tests cover long
reverb decay and broadband EQ master gain.

VST3 exposes no tail-change notification, and hosts may cache the first tail value they observe. The
processor therefore advertises one stable 3,600-second upper bound from construction instead of a
dynamic exact value. The per-state estimator adds tails for serial nodes, takes the longest parallel
chain, and proves the bound covers eight maximum-feedback delay nodes; it must not be wired directly
to the host contract unless the plugin format gains a reliable invalidation mechanism.

## Files driving the remaining work
- `apps/pad-pilot/plugin/audio/convolver-module-graph.h`
- `apps/pad-pilot/plugin/audio/convolver-module-graph.cpp`
- `apps/pad-pilot/plugin/audio/fx-state-validation.h`
- `apps/pad-pilot/plugin/core/pad-pilot-processor-automation.cpp`
- `apps/pad-pilot/plugin/core/pad-pilot-processor-runtime.cpp`
- `apps/pad-pilot/plugin/runtime/fx-chain-proto.cpp`
- `apps/pad-pilot/plugin/runtime/fx-graph-native-tests.cpp`

