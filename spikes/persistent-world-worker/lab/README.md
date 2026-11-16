# Touch of Death performance lab

One private diagnostic artifact, two embedded arenas, one active configuration.

The [one-hour preparation swarm](../../../packages/engine/examples/touch-of-death/docs/touch-of-death-preparation-swarm.md)
owns the latest retained preparation, writer-revision and equivalent-executor
evidence. Its native image oracle records identical reset/sample/draw history;
strict pixel failures still block promotion. `retainedPreparation=changed-lists`
and `rays=soa-js` are opt-in native contrasts in the same configurable artifact.
`runner/native-matrix.ts <plan.json> verify|timing` schedules bounded serial ABBA
blocks; same-artifact repeats may reference original image evidence without
retrying it. The saved report distinguishes diagnostic recommendations from defaults.

The next native contrast is `materialIdentity=original|revisions` with
`nativePipeline=worker-interpolated`. The builder connects checked producer
material revisions to display input reuse while preserving live material/texture
validation, external-state repair and retained sampling. The candidate still
visits every material; sparse changed-material traversal is not implemented.
Revisions add eight payload bytes per material/publication. The world normalizer
retains another sixteen bytes/material and scans each publication; raw revision
copies, token writes, endpoint/full-producer storage and transport payloads are
reported separately. It preserves one publication issuer across endpoint/full
fallback so material identity cannot change camera interpolation. Failed display
publication clears the complete presentation history before recovery.
Engine and playable defaults are unchanged.
Run `bun test spikes/persistent-world-worker/lab/build/materials/native-material-revisions.test.ts`
and the native config/oracle tests before browser qualification. These changes
were authored under a local-file-only restriction; their remote evidence must
establish correctness before any timing or promotion claim. The
[remote follow-up](../../../packages/engine/examples/touch-of-death/docs/touch-of-death-preparation-swarm.md#remote-follow-up)
distinguishes the uploaded source from subsequent local repairs.

Native verification requires four ordered A1/B1/B2/A2 receipts, complete SHA-256
identities and finite integer renderer counters. Each algorithm must reproduce
its own images from the same state and evaluated-frame inputs. Cross-algorithm
PNG and command equality are separate diagnostics, not acceptance requirements
(user decision, 2026-10-18). Missing frame hashes cannot establish data equivalence.
A matching but noncanonical
history does not qualify: the v2 checkpoint/reset, four endpoint times and three
sample times must match the declared sequence. Complete archived v2 receipts
remain readable. Reset-race probes record their extra clears, publications and
samples separately and cannot qualify ordinary timing history.
Interpolated captures reject a hidden or empty postprocess overlay, whose retained
pixels do not represent the active WebGL source. New captures retain RGBA hashes and dimensions,
read synchronously beside the PNG outside timing. Those hashes distinguish pixel
variation from encoding variation; failed exact PNG comparisons still block
promotion. They do not prove raw WebGL state, HUD or physical presentation.

New native receipts copy the primary image and four redraws in one synchronous
sequence after each cold reset, before awaiting any digest. Every primary/redraw
raw WebGL RGBA and postprocess RGBA hash must repeat exactly within each
algorithm, across both resets. This catches adjacent-frame variation even when
the four primary PNGs match. The receipt includes changed-pixel coordinates,
channel deltas, attempted/executed/omitted draws, actual context AA/sample count,
viewport and drawing-buffer dimensions. Missing redraw evidence, changed geometry
or a diagnostic ablation cannot qualify normal timing; archived receipts remain
readable without acquiring this new qualification.
An artifact/configuration hash groups repeated algorithms across A/B labels;
assigning another label does not permit the same algorithm to render differently.
The scheduling mode participates in that identity and canonical history.
`PERF_NATIVE_RASTER_SCHEDULE=yielded-v1` retains an adversarial digest-yield interval;
the default `synchronous-v1` is required for qualification. Missing or mixed
schedules fail closed. Owned frame, camera and normalized live scene/command
packet snapshots immediately before the primary and around redraws must also
remain identical; exact pixels alone cannot conceal changed inputs.
Final qualification runs after owned-browser cleanup against its completed error
and failed-response receipts. Failed captures still retain a failing final gate;
missing evidence or unexpected resource/runtime errors cannot qualify.

For an untimed hidden reproduction, reuse the managed game server's returned URL,
the frozen artifact and checkpoint. Set both saved configurations to the same
file when isolating one algorithm. Each invocation needs a fresh evidence root:

```powershell
$env:PERF_NATIVE_ROOT = '.local/engine-perf/<run>/<variant>'
New-Item -ItemType Directory -Path $env:PERF_NATIVE_ROOT | Out-Null
Copy-Item '.local/engine-perf/preparation-swarm-20261017/checkpoint.json' "$env:PERF_NATIVE_ROOT/checkpoint.json"
$env:PERF_NATIVE_ARTIFACT = '.local/engine-perf/preparation-swarm-20261017/artifact/index.html'
$env:PERF_NATIVE_CONTROL_PATH = '.local/engine-perf/preparation-swarm-20261017/candidate.json'
$env:PERF_NATIVE_CANDIDATE_PATH = $env:PERF_NATIVE_CONTROL_PATH
$env:PERF_URL = '<managed-server-url>/game/'
$env:PERF_SLICE_ISOLATED = '1'
$env:PERF_NATIVE_HEADLESS = '1'
$env:PERF_NATIVE_RASTER = 'control'
bun.cmd spikes/persistent-world-worker/lab/runner/playable-native.ts verify saved
```

`PERF_NATIVE_RASTER=control|dither-off|msaa-off|transparent-off|transparent-blend-off|transparent-depth-off`
selects independent single-toggle diagnostics against the same baseline, never
cumulative changes. The last two preserve every draw, temporarily bypass one GL
feature only for default-target blended draws, and restore it immediately;
separate counters record each bypass. These ablations cannot qualify production
timing even when exact.
The default for `verify` is `control`. The probe currently owns the
`worker-interpolated` capture path; other paths lack the required data/redraw
receipts and fail qualification. Headless mode is restricted to `verify`/`smoke`,
uses 1366×768 CSS pixels, records actual DPR, and makes no focus, physical
presentation or performance claim. All image reads stay outside timing.

The native artifact supports `aa=msaa|off`: MSAA remains the default, while `off`
passes the public renderer's `antialias:false` context option at construction.
Changing it requires a full reload. This adds no spatial target, extra draw or
copy; native `spatial` is rejected because that path is not integrated. Verify a
named `off` configuration with the unmodified `control` probe, recording actual
sample count and draw coverage. Exact single-sample output is a configuration
remedy for repeatable diagnostics; it does not repair MSAA or establish accepted
gameplay image quality and performance.
After registering a saved run, `bun.cmd spikes/persistent-world-worker/lab/runner/raster/preview.ts <saved-run-url> <new-output-root>`
checks the actual served `aa=off` page without replacing its response. It records
startup readiness, the frozen artifact identity, context AA, frame/tick advance,
errors, screenshot and browser cleanup; this is an untimed startup check.

The latest [unchanged-transform sampling audit](../../../packages/engine/examples/touch-of-death/docs/touch-of-death-entity-sampling-audit.md)
compares `producerSampling=detached|immutable-trs` with the owned journal fixed on
both sides. The latter requires `producerTransforms=owned-journal` and a world
reset. Eight serial trials do not justify a default change; detached remains
recommended. The report owns its saved plan, 75-option artifact and raw evidence.

The active [165 Hz campaign audit](../../../packages/engine/examples/touch-of-death/docs/touch-of-death-165-campaign.md)
tracks the later request for parallel candidate development and serial timings.
Use `screen.ts --fresh-motion --phase campaign --plan <saved-plan.json> --output
<new-evidence-root>` for at most four named contrasts per batch. Plans distinguish
work-preserving candidates from gameplay, visual and latency-policy changes.
Candidate source development may run in parallel; throughput browsers, builds,
tests and captures do not overlap. Archived artifacts identify earlier results;
only one lab artifact is active. No candidate is automatically promoted.

The [producer audit](../../../packages/engine/examples/touch-of-death/docs/touch-of-death-producer-audit.md)
isolates producer costs and records the engine axis-aligned ray strategy. The
existing runner accepts `--fresh-motion --phase producer-screen` (24 serial
simulation/VFX/query-cache trials) and `--phase producer-optimization` (8 serial
hoisted/axis-aligned trials), each with 5 s warmup and 10 s measurement. Both fix
compact publication and working-frame reuse. Use a fresh `--output` directory;
neither command automatically starts another phase. Untimed parity uses
`smoke.ts --compact-reuse --producer-rays --output <directory>`.
The normal playable and engine defaults are unchanged. The lab baseline uses the
original renderer/material comparisons with full-object display publication and
the retained ray/VAO fixes. It is an instrumented comparison baseline, not a claim
of identical ordinary-playable throughput. `pipeline=packet` restores direct
packet rendering; `owner` selects inline or worker execution.

From the repository root:

```powershell
bun.cmd spikes/persistent-world-worker/lab/build.ts
bun.cmd .agents/skills/dev-server/scripts/dev.ts start touch-of-death-lab --json
bun.cmd spikes/persistent-world-worker/lab/smoke.ts
bun.cmd spikes/persistent-world-worker/lab/proof.ts
bun.cmd spikes/persistent-world-worker/lab/screen.ts
```

Use the supervisor's returned URL. `PERF_URL` overrides the runner URL if its port
differs. Open `/lab/?arena=rooftop` or `/lab/?arena=depot`. The panel stages related
changes and applies them atomically. It provides baseline/checkpoint reset, named
presets, JSON import/export, effective settings and historical gaps. The URL's
`config` parameter contains the same versioned JSON as export/import.

`registry.ts` is the contract shared by the UI, URL and runner. Automation uses
`globalThis.__todLab`: `status`, `stage`, `commit`, `apply`, `reset`, `baseline`,
`preset`, `export`, `import`, `snapshot`, `samples`, `clearSamples`, `graphics` and
`publications`. `reset({manual:true})` enables untimed `capture(timeMs,image)`;
`apply(config,{reset:true,manual:false})` returns to automatic execution.

The bounded producer transform follow-up uses `entityApplication=original` or
`retained-input`, applied by a world reset inside the existing worker. It changes
producer application only; display application and resource validation remain.
The [audit](../../../packages/engine/examples/touch-of-death/docs/touch-of-death-entity-application-audit.md)
recommends `original`. Reproduce its eight ABBA trials with
`screen.ts --fresh-motion --phase entity-application --output <new-evidence-root>`.
Untimed parity uses `smoke.ts --compact-reuse --producer-entities --output <directory>`;
`--verify-saved` rechecks retained receipts without opening another browser.

`status.requested` includes staged intent; `applied` is the committed contract;
`effective` reflects disabled parent subsystems. World/worker epochs expose reset
scope. Live options preserve those owners. World resets recreate gameplay in the
same realm and clear input/events, display history, identity, dictionaries and
queries. Worker scheduling, transport, pool and ownership changes restart the
worker. Renderer/AA/shader changes replace GPU resources in the same context.
Spatial/off use a single-sample scene target; the final canvas's actual MSAA
attributes remain separately reported. They do not claim a no-AA canvas context.

The named `PERF_BROWSER_PROFILE` values in the registry are owned browser launches,
separate from rAF/timer scheduling. Flags and observed cadence are recorded; their
presence never proves physical presentation or that a browser limit was removed.
The original screen uses a headless browser. The explicitly requested
`--fresh-motion` follow-up uses a visible browser with native foreground checks;
both own their process trees. No global OS/driver settings are changed.

Output lives under `.local/engine-perf/touch-of-death-lab/` (`PERF_ROOT` override):
the single `lab/index.html`, frozen source/manifest, `configuration.json`,
`option-inventory.json`, `historical-inventory.json`, `smoke/` and `screen/`.
The builder consumes named local archived graphs and checkpoints; it fails on
missing inputs or changed integration anchors. This is a local diagnostic build,
not a standalone distribution recipe without those archives.
`build.ts --check-graph` checks the same complete source integration without
writing or compiling an artifact; use it before rebuilding changed recipes.

The screen uses 3 s warmup then 5 s measurement from the same seeded reset,
interleaving baselines in one serial rooftop sequence. It repeats only the top
three findings once in ABBA order. Drift-explained findings are marked inconclusive
and receive no further investigation. A completed screen refuses an accidental
second run. It never changes settings to chase a result.

A deliberate later reproduction reuses the same artifact with a new evidence
directory, without rebuilding:

```powershell
bun.cmd spikes/persistent-world-worker/lab/screen.ts --output .local/engine-perf/touch-of-death-lab/screen-repro
```

The bounded fresh-motion mode reuses that artifact. `--phase primary` runs only
the compact-publication, material-revision and shadow-batching contrasts: ABBA
in rooftop and depot, 24 trials, each with 5 seconds warmup and 10 seconds timing.
It restores the checkpoint and clears display history again after warmup.
`--phase diagnostic` is the one four-trial rooftop object-adoption contrast;
`--phase images` is an untimed, same-version 1-second repeatability lane. Every
phase refuses a previously started output directory. Use `--output` for an
explicit reproduction, not an automatic retry. The optional combination phases
accept only the already measured compatible controls and are not automatically
run. They were skipped in the delivered campaign because image gates failed.

```powershell
bun.cmd spikes/persistent-world-worker/lab/screen.ts --fresh-motion --phase primary --output .local/engine-perf/touch-of-death-lab/fresh-motion-repro
```

The [follow-up report](../../../packages/engine/examples/touch-of-death/docs/touch-of-death-performance-lab-follow-up.md)
owns conclusions and exact evidence paths. Each raw trial records artifact/source
identity, configuration, focus, asynchronous GPU validity and counters. Runner
sources are archived with each phase. `runner/analyze-fresh-motion.ts` performs
offline analysis of the delivered campaign and never launches another trial.

The subsequent [working-frame implementation](../../../packages/engine/examples/touch-of-death/docs/touch-of-death-working-frame-reuse.md)
uses the existing `workingFrame: "reuse"` option. It creates writable entity/camera
storage lazily for interior interpolation and preserves owned array bindings
across publications; endpoint/snap displays need no working storage. The clone
baseline stays available. `smoke.ts --working-frame --output <new-directory>`
runs its focused untimed frame/reset/image checks. `screen.ts --fresh-motion
--phase working-frame --output <new-directory>` runs only clone versus reuse,
ABBA in rooftop and depot: eight 5-second-warmup/10-second-measurement trials.
Completed outputs are retained, and strict image decoding remains a separate lane.

The [retained-copy audit](../../../packages/engine/examples/touch-of-death/docs/touch-of-death-retained-copy-audit.md)
owns the `owned-reuse-experimental` preset and its lack of a demonstrated
fresh-motion gain. `publication=owned` requires worker transport; inline requests
are rejected because their arrays remain producer-owned. `smoke.ts --retained-copy`
checks frozen adopted inputs, reset/frame parity and image repeats; `screen.ts
--fresh-motion --phase retained-copy --output <new-directory>` compares reuse alone
against reuse plus adoption in eight ABBA trials. The recommended diagnostic
configuration remains baseline plus `workingFrame=reuse`.

The subsequent [compact-with-reuse audit](../../../packages/engine/examples/touch-of-death/docs/touch-of-death-compact-reuse-audit.md)
measured about 94% more fresh poses with existing compact publication, but depot
exact image repeatability still blocks promotion. `smoke.ts --compact-reuse`
checks cross-format frame parity and immutable received packet bytes;
`screen.ts --fresh-motion --phase compact-reuse --output <new-directory>` runs
eight ABBA trials with reuse on both sides. The existing offline analyzer accepts
`<evidence-directory> --phase compact-reuse`. The artifact and original baseline
are unchanged; reuse alone remains the recommended configuration.

The [raster repeatability audit](../../../packages/engine/examples/touch-of-death/docs/touch-of-death-raster-repeatability-audit.md)
fixes a lab facade bug that overwrote draw-recorder hooks every frame. Dispatch
strategies now change only at a primitive-mode transition. The existing image
failure remains open. `runner/verify-raster.ts --output <new-directory>` uses the
artifact's bounded untimed raw/post redraw recorder and asserts draw coverage;
`runner/analyze-raster.ts <evidence-root>` audits its saved bytes and observations.
Pass/per-draw readback modes are depot-specific diagnostics, never normal play or
timing controls. The report owns their constraints and unresolved attribution.

Counters are diagnostic overhead, not calibrated production cost. Material buffer
bytes describe logical comparison capacity, not retained heap; copy bytes count
packet/compact buffers, excluding opaque full-object structured-clone bytes.
Heap observations are boundary readings, not allocation rates. GPU times exclude
Canvas2D/HUD/compositing and overlap CPU work. `smoke.ts` owns all image reads;
`screen.ts` never captures, traces, synchronously reads back or forces GPU completion.

Focused validation:

The ordinary playable also has a native maximized lane in
`runner/playable-native.ts`. It reuses this lab's browser, focus, awake, profiler
and experiment registry owners; it does not substitute compact arena payloads.
`PERF_NATIVE_ROOT` selects a new evidence directory, `PERF_URL` the managed game
URL, and `PERF_NATIVE_ARTIFACT` an existing exported HTML. `prepare` captures a
canonical match checkpoint; copy the saved checkpoint for exact reproduction.
`timing <resolution|post|scene|simulation|hud|shadows>` runs one serial ABBA block
with 5-second warmup and 10-second samples. All new timing windows are visible,
maximized and use native DPR. Old lane dimensions remain explicit for historical
reproduction.

`build/playable-native.ts` adds bounded stage/GPU instrumentation and the existing
`hudEntities` and `primitiveLookup` strategies to one ordinary-playable diagnostic
artifact. It leaves engine and production defaults unchanged. Use `verify
<hudSelected|primitiveSlots>` before their `timing` blocks. `dom hudSelected`
separately checks the DOM HUD omitted by canvas captures. `profile` and `idle`
are separate diagnostic lanes; never pool them with throughput samples.
`runner/analyze-native.ts <evidence-root>` summarizes completed blocks and image
checks. The [native-window audit](../../../packages/engine/examples/touch-of-death/docs/touch-of-death-native-performance-audit.md)
owns results, limitations and the execution plan.
Worker profiles explicitly resume after checkpoint restore, pause after capture,
and save `activity.json`; a nonadvancing service tick counter fails the profile.

The ordinary artifact also contains `renderView`, `workPolicy`, `wasm`, `simd`,
`worker` and `interpolation` contrasts. Their controls are declared in the same
runner; they are not six different builds. `PERF_NATIVE_CANDIDATE_PATH` accepts a
registry-validated JSON object for `timing saved` / `verify saved`. Only the
implemented ordinary-lane keys are accepted; the worker host currently rejects
the inline-only bounded panel scheduler. Worker trials use the existing owner
with three buffers and all gameplay services. Manual image oracles disable those
services to match the synchronous photo-capture oracle; that is never a timed
optimization. Restores clear presentation history and rebase the simulation
clock before measurement.

`rays renderView` captures eight ordered real-query batches outside timing.
Pass the resulting `batches.json` as `PERF_RAY_CAPTURE` to
`wasm-cutaways/throughput.ts` for the separate JS/scalar/SIMD/two-worker replay.
It includes packing, transport and result validation, but excludes live gameplay
and rendering. The [four-path audit](../../../packages/engine/examples/touch-of-death/docs/touch-of-death-four-paths-audit.md)
owns the frozen artifact identities, full-loop comparisons and remaining gaps.

The [retained-presentation slice](../retained-presentation/README.md) uses this
same ordinary runner for `retainedJs`, `retainedWasm`, `retainedSimd`,
`retainedWorker` and `retainedPool`. All executors share one frozen artifact and
output ABI. Its audit records full-frame, allocation, worker-latency and MSAA
gates; it does not promote a production default.

```powershell
bun.cmd test spikes/persistent-world-worker/lab
bun.cmd x tsc -p spikes/persistent-world-worker/lab/tsconfig.json
bun.cmd run check:process-policy
```

## Saved native runs

Follow the swarm [access and retention handoff](../../../docs/harness/swarm.md#access-and-retention-handoff)
for progress/final URLs and explicit production-versus-experiment status.
After the native artifact, checkpoint and saved configs exist, register the run
with the managed saved-run surface; registration neither builds nor benchmarks:

```powershell
bun.cmd .agents/skills/dev-server/scripts/dev.ts start touch-of-death-runs --json
bun.cmd spikes/persistent-world-worker/lab/shared-native.ts <run-root> <returned-server-url>
```

The command returns playable, status and evidence URLs. `?preset=control`,
`?preset=combined` and the default `?preset=exploration` use the saved `control.json`,
`candidate.json` and `diagnostic-recommended.json`. The route verifies the frozen
HTML hash and injects configuration/checkpoint startup only into its served copy.
It is an interactive preview, not a timing result. Registration is retained under
`PERF_LAB_ROOT/runs`; files survive worker/browser shutdown, with no cloud compute.
Local access requires the workstation and shared server; restart that surface to
restore access without rerunning the swarm. Do not prune a shared run silently.

The historical inventory explicitly distinguishes switches, retained fixed work,
external fixtures and implementation gaps. It does **not** claim every historical
experiment is integrated. See the product's
[bounded report](../../../packages/engine/examples/touch-of-death/docs/touch-of-death-performance-lab.md).
