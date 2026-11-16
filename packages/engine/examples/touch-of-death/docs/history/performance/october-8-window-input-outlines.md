# Touch of Death: path to 165 FPS — October 8, 2026

The target is **165 fresh game frames/second, 6.06 ms per refresh**. FPS counts
fresh CPU render submissions, not scanout. Current verification uses focused,
visible Chrome windows, including image and graphics-recovery checks.

## Decision

Keep the input-routing optimization and make the latency scheduler the default
inside automatic workers using `freshInput`. Explicit false flags retain the
controls. Normal-game worker ownership remains opt-in: missing feature coverage,
native-resolution soak, image repeatability, minimize/restore and package-size
gates remain open.
The previous selected-read/WASM decisions are unchanged.

The prior latency scheduler lost FPS while fresh input performed redundant host
UI work before drawing. This slice avoids unchanged pause/settings DOM writes
and controller-panel discovery during steady polls with no controller. Mode
changes, disconnects, remapping, keyboard/pointer focus, Drive and pause retain
their routing. Physical input is sampled each poll; old input never receives a
new timestamp. Browser concerns stay in the host.

## Visible combat measurements

Eight serial trials use the same frozen city/idle-human-versus-AI workload and
full services: i9-13900HX, RTX 4070 Laptop through ANGLE/D3D11, AC power, battery
saver off, High performance scheme, Chrome 154, 1366×768/DPR 1, VSync off, two
buffers, six seconds warmup and eighteen seconds measurement. One owned window
is reused with fresh page/world/storage per trial. Foreground loss invalidates
a trial. No audit builds/tests ran during timing; user workloads remained active.
Groups are medians of two trials; interval quantiles use combat frames. Keyboard
probes run after timing.

| Variant | Combat FPS | Interval p95 / p99 | Key event → draw start p95 | Host wait p50 | Main activity |
| --- | ---: | ---: | ---: | ---: | ---: |
| Previous input, timer | 83.98 | 19.75 / 26.95 ms | 45.00 ms | 4.90 ms | 61.0% |
| Cheaper input, timer | 89.95 | 18.95 / 20.75 ms | 36.00 ms | 2.90 ms | 49.1% |
| Previous input, paced pipeline | 81.06 | 16.80 / 21.20 ms | 31.50 ms | 1.30 ms | 58.7% |
| Cheaper input, paced pipeline | **98.51** | **13.20 / 16.55 ms** | **28.45 ms** | **0.10 ms** | **54.0%** |

The combined candidate gains 17.3% versus the previous timer and 21.5% versus
the previous pipeline. Timer control spread is 2.92%; pipeline control spread
is 1.08%, below the predeclared 5% limit. All eight trials have zero runtime/worker
errors and zero combat catch-up drops. Two transfer buffers remain 1,460,224
bytes. End-of-window main heaps range 28.8–55.3 MiB across variants; these are
not retained-memory or leak measurements.

Each trial has twelve actual keyboard press/release probes. Event-to-draw ends
before CPU rendering and excludes GPU work/compositing/scanout. Its short-sample
p95 is diagnostic, not a long-soak guarantee. Fixed simulation remains 60 Hz;
higher rendering rates do not remove that input quantization.
Timing isolates the named changes against the frozen graph. The separately built
`current/candidate` includes current shared-tree UI changes and passes the visible
readiness journey with scheduler flags omitted. Its FPS was not measured by this
controlled cohort; do not transfer the 98.5 FPS result to that entire source graph.

## Camera cutaway outlines

The owner clarified **faded scenery**. A generic material flag selects fragment
shader edges with clear interiors. Depth testing and instancing remain; there
are no extra entities or draw passes. Immutable edge streams are prepared once,
suppressing coplanar triangle diagonals and preserving skin/morph attributes.
Expanded vertices cost first-use CPU work and GPU memory. Curved faceted meshes
can show facet edges. The [renderer contract](../../../../../docs/first-party-3d-webgl2.md)
owns shader behavior and resource lifetime.
Authored translucency retains its ordinary material until the camera fades it
below its authored opacity; restoring that opacity removes the cutaway flag.

Matched arena captures were inspected at combat/recovery viewpoints. Fighters
and pickups remain intact; nearby cutaway surfaces resolve to thin edges.
Collision, authoritative state and saves are unchanged. This remains a visual
candidate: the owner selected the treatment, not brightness/width. The separate
outline A/B uses identical rebuilt runtime/renderer graphs, changing only the
presentation flag, in control/outline/outline/control order. Neither cohort
establishes the outline's performance cost: control spread was 6.53%, then
13.01%, exceeding the 5% gate. The repeat used 36 keyboard probes per trial;
its first control also dropped simulation catch-up time. All samples remain
retained. Do not use either cohort to claim a performance win or no regression.
These timings precede the authored-translucency correction in `candidate-v2`.

## Verification and promotion limits

- 65 focused engine tests and 29 host input tests pass, covering edge streams,
  material reset/batching, resource recovery and focus/disconnect/remapping.
  Engine, engine-test, editor-test and experiment typechecks pass. Package build,
  installed-consumer smoke, process policy and source structure pass.
- Worker scheduling passes 40 command/lifecycle checks. Visible readiness covers
  pause/resume, native tab inactivity, authoritative saves, saved situations,
  menu return, failed initialization, bounded requests and stalled producers.
  FPS remains visible, including legacy hidden-counter preferences.
- Input and outline builds each pass 721 samples per realm through KO/recovery
  and the next fight, plus 1,442 normal-standalone state-oracle checks per pair.
  Full-state, packet and compact-presentation hashes match between realms.
  Both visible image pairs pass the unchanged 100-pixel / 3-channel-unit gate.
  This does not retroactively explain the prior headless repeatability failure.
- The final current-source candidate also passes all 1,442 state-oracle checks
  and realm packet/presentation parity, but its image gate fails at frame zero:
  23 changed pixels, maximum channel difference 5. Other captured frames pass.
  A short diagnostic produces byte-identical inline/worker images at both
  checkpoints; comparing two inline runs still reproduces maximum difference 5
  (19 pixels at frame zero). Identical-packet raw redraws vary by up to 2. This
  demonstrates variation without worker execution, not a proven driver cause or
  permission to widen the gate. Final current-source image readiness remains open.
- Outline/pipeline passes three visible graphics-recovery cycles with VSync on,
  including native tab inactivity, paused restore, stale focus and timeout.
- Minimize/restore remains open. Windows foreground verification succeeds while
  Chrome's document can remain hidden; the game correctly stays suspended.
  Repeated readiness attempts and a graphics attempt reproduced this failure. Native tab
  recovery passes. `PERF_INACTIVE_MODE=window` retains the diagnostic; tab coverage
  does not count as successful minimize/restore coverage.
- Bundle limits were not raised. Main runtime native graph is +965 raw / +321
  gzip / +198 Brotli bytes over; aggregate runtime is +3,711 / +1,403 / +1,159.
  This includes the outline feature alongside prior overages. Complete native
  and rebundled receipts retain all entry-level results.
- Full-worker rollout still needs wardrobe/uploads, tutorials, opponent routines,
  online/rollback and complete host handoff. Training stays disabled during
  worker ownership. The retained original host world adds memory cost.

## Next 165 FPS work

1. Reduce worker presentation: about 5.8 ms median, within about 8.85 ms total
   worker compute in the best input cohort. Profile pose/material/entity work
   and compile separately; remove static, distant or unchanged work through
   engine primitives. Preserve full saves and reset/restore lifetimes.
2. Measure GPU and host at actual playing resolution. 98.5 FPS is not 165. Use
   controlled pass/quality A/Bs, full-loop p95/p99 and rendered comparisons;
   CPU and GPU work overlap and must not be added as serial budgets.
3. Resolve native minimize/restore and run a longer visible input/controller
   soak. Close missing worker consumers and package budgets before rollout.
4. Revisit parallel/WASM batches only for measured remaining math. Packet decode
   is already tiny. Require conversion/lifetime costs, parity and end-to-end
   input/FPS evidence for another boundary.

Evidence: `.local/engine-perf/worker-window-20261008/` retains frozen sources,
runner inputs, plans, raw trials, keyboard samples, PNGs, failures and owned-browser
cleanup. The [experiment README](../../../../../../../spikes/persistent-world-worker/README.md)
owns reproduction. Shared managed game hosting remains unchanged.

Previous: [input-latency experiments](october-8-input-latency.md),
[retained presentation](october-8-retained-presentation.md),
[powered WASM retest](october-8-powered-reference.md), and
[worker recovery](october-7-worker-recovery-resident-wasm.md).

<a id="october-7-app-owned-worker-host-and-mode-boundaries"></a>
[App-owned worker host and mode boundaries](october-7-app-owned-worker-host-and-mode-boundaries.md)

<a id="october-7-typed-authority-stream-watchdog-and-persistent-fps"></a>
[Typed authority, watchdog and persistent FPS](october-7-typed-authority-stream-watchdog-and-persistent-fps.md)
