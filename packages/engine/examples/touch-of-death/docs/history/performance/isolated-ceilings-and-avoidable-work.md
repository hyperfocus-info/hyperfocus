# Isolated ceilings and avoidable work

Historical evidence; [current guidance](../../touch-of-death-performance-audit.md) owns current status and limits.

## Isolated ceilings and avoidable work

This earlier campaign measures the baseline before the material and sight-volume
changes above. Its timings are a separate session and are not a before/after pair
with the newer focused measurements.

The new [scene ceiling probes](../../../../../../../spikes/scene-ceiling/README.md) separate
real city simulation, scene preparation, packet conversion and cached drawing.
These measure **local isolated limits**, not an absolute hardware ceiling or fresh
gameplay FPS. Nothing from these probes is enabled in the shared playable.

Evidence: `.local/engine-perf/ceiling-20261006/`. The instrumented artifact hash is
`0d18d079701bdfe32bc54efd519e2419098f3efb2f057d71d54f2af606203f1a`.
It freezes the previously measured source/asset graph and starts from the saved
city workload, advances 300 ticks and checkpoints fighting frame 99. This state
contains 3,420 entities, 1,724 evaluated materials and 2,070 submitted instances.
Camera compilation retains 745 instances; the broad light volume retains 2,070.

Measurements use Chrome 154.0.8037.58, RTX 4070 Laptop GPU through ANGLE/D3D11,
i9-13900HX/32 logical CPUs, approximately 64 GiB RAM, 1366x768/DPR 1 and Bun 1.4.2.
The visible browser is focused. Existing background work remains; power/thermal
state is unrecorded. No audit builds/tests overlap timing. Four serial trials per
mode use mirrored forward/reverse order. Renderer trials warm for 1.5 seconds
and measure for four; CPU trials warm for 30 iterations and measure 120. The
tables give medians of per-trial statistics; raw p50/p95/p99 and samples remain
in the evidence folder.

### What the renderer can sustain independently

These redraw the same already prepared combat state. The GPU column covers only
the renderer context, excluding post-processing/compositing. CPU and GPU durations
overlap and must not be added. Every mode except `with-post-hud` omits those two
callbacks. Near-refresh results cannot establish an uncapped renderer maximum.

| Visible browser mode | Redraws/s | CPU p50 / p95 | GPU p50 / p95 | Interval p95 / p99 |
| --- | ---: | ---: | ---: | ---: |
| Loaded page, no probe drawing | 156.55 | 0 / 0 ms | n/a | 9.72 / 12.10 ms |
| Legacy shared camera/shadow commands | 116.46 | 7.85 / 11.08 ms | 6.92 / 9.64 ms | 12.35 / 18.07 ms |
| Current camera/light commands | **156.95** | **1.45 / 5.50 ms** | **3.73 / 6.55 ms** | 9.12 / 12.95 ms |
| Current commands + post-processing/HUD | **125.72** | **4.58 / 7.03 ms** | 3.56 / 5.26 ms | 12.77 / 18.24 ms |
| Omit shadows | 161.04 | 0.80 / 3.29 ms | 1.78 / 4.95 ms | 6.95 / 12.49 ms |
| Omit outlines | 159.91 | 1.10 / 5.11 ms | 3.12 / 5.78 ms | 7.45 / 12.23 ms |
| Half linear resolution | 158.67 | 1.35 / 4.75 ms | 3.35 / 6.04 ms | 8.00 / 12.49 ms |
| 1024 shadow map | 158.56 | 1.30 / 5.82 ms | 3.49 / 6.34 ms | 8.25 / 14.33 ms |

The current scene is not fundamentally a 20-FPS drawing workload. Nevertheless,
post-processing/HUD and tail latency prevent a demonstrated sustained 165 FPS even
with all preparation removed. The loaded-page cadence itself varies under this
machine's existing workload. Resolution/pass cuts are diagnostic quality changes,
not accepted optimizations. Large GPU-query tails and the near-refresh cap make
small redraw-rate differences unsuitable for ranking candidates by themselves.

### What preparing a fresh frame costs

| Visible browser operation | CPU p50 | CPU p95 | CPU p99 |
| --- | ---: | ---: | ---: |
| Simulation advance, one 60-Hz tick | 1.70 ms | 2.51 ms | 4.50 ms |
| Sample the scene | 0.80 ms | 1.95 ms | 4.81 ms |
| Export gameplay snapshot | 0.90 ms | 1.51 ms | 2.64 ms |
| Full preparation of frozen combat state | **25.23 ms** | **31.42 ms** | **38.21 ms** |
| Preparation with obstruction stage omitted | 17.38 ms | 22.06 ms | 25.41 ms |
| Preparation with directed fighter stage omitted | 18.88 ms | 24.82 ms | 28.07 ms |
| Preparation with scene application omitted | 17.95 ms | 23.78 ms | 29.61 ms |
| Reapply an already prepared unchanged frame | **4.28 ms** | 5.46 ms | 7.47 ms |
| Same reapplication, omitting material updates | **1.40 ms** | 2.05 ms | 2.72 ms |
| Compile unchanged camera/light commands | 0.75 ms | 0.95 ms | 1.12 ms |
| Write cached render packet | 0.020 ms | 0.033 ms | 0.036 ms |
| Read cached render packet | 0.014 ms | 0.017 ms | 0.023 ms |

Full preparation includes sampling, gameplay presentation, snapshot, appearance,
directed fighters and scene application; the other rows overlap it. Removal
deltas are optimistic bounds and are **not additive stage timings**. Obstruction
instrumentation directly measures a 6.50-ms median inside normal preparation.
Repeated state can benefit caches more than moving gameplay. Packet operations
batch 32 calls and use hot buffers: they exclude messaging, ownership handoff,
scheduling and cold-cache contention.

Even with free simulation and rendering, the measured preparation method produces
only about **40 fresh states/second**. It needs roughly **4.2x** improvement merely
to fit the whole 6.06-ms target, before reserving time for other work. Simulation
is fixed at 60 Hz: 1.70 ms/tick would amortize to approximately 0.62 ms per 165-Hz
display frame if evenly scheduled. Raising simulation to 165 Hz is not required
by this display target.

### Visible versus headless

Four repeated headless trials per selected mode use the same artifact, viewport
and reported RTX/ANGLE renderer. They are a separate serial lane, so changing
background load can affect the difference; these are not causal estimates of
headless overhead.

| Isolated operation | Visible | Headless |
| --- | ---: | ---: |
| Current cached scene redraws/s | 156.95 | 163.54 |
| Cached scene + post-processing/HUD redraws/s | 125.72 | 117.38 |
| Preparation CPU p50 / p95 | 25.23 / 31.42 ms | 23.08 / 27.26 ms |
| Simulation tick CPU p50 | 1.70 ms | 1.75 ms |
| Unchanged frame application CPU p50 | 4.28 ms | 4.10 ms |

The expensive preparation work occurs in the actual visible browser. Headless is
not its exclusive cause. Headless also reverses the small fresh/stable packet
submission timing difference (1.20 / 1.50 ms), reinforcing that avoided allocation
is established while a reliable throughput gain is not. The shader/pass variants
must still face a full-loop acceptance test if implemented.

### Which obvious safeguards are present, and which are missing

- **Present:** transform setters reject identical values; the frozen structural
  probe rebuilds zero world matrices. Normal camera culling rejects 1,325 of
  2,070 instances while retaining off-camera shadow casters. Navigation has its
  spatial index; worker packets/input already have bounded queues and ownership.
- **Missing above those primitives:** the frozen frame still requests position,
  rotation, scale, mesh and material binding updates for all 3,420 entities, plus
  3,992 visibility updates. Late render culling does not prevent this earlier work.
- **Material dirtiness:** all 1,724 frozen material updates leave packed floats
  and flags unchanged. Across 30 advancing frames, **51,695/51,720 (99.95%)** do so.
  These counts exclude texture descriptor equality; any actual dirty contract must
  also preserve texture replacement, variants, fade transitions and other inputs.
  Skipping unchanged materials has an isolated opportunity of about 2.88 ms here.
- **Obstruction locality:** existing radius/rotated-box broadphase is present,
  but it still scans all entities/materials, rebuilds identity/follower maps and
  calls the obstruction predicate 1,978 times. It reaches **70,739 local ray tests**
  for the frozen frame and **2,106,828 across 30 advancing frames**. This concerns
  render fading, not collision resolution. Camera culling cannot simply replace
  the sightline query because foreground/off-camera occluders still matter.
- **Packet/cache boundary:** fresh decoding creates a new command object, while
  transparency scratch is cached by that object's identity. The visible probe
  records roughly 629 cache misses per four-second trial versus zero after warmup
  with a stable object. At capacity 3,992 each miss creates at least 495,840 bytes
  of dense typed-array storage before lights/optional appearance and JS arrays.
  Stable identity gives 1.55 -> 1.45 ms median submission, p95 4.80 -> 3.90 ms, and
  157.48 -> 160.04 redraws/s. This proves avoidable allocation, **not** an accepted
  full-worker throughput win. Decode itself still allocates views in both modes.

Opacity classification also needs care. Although 1,493 of 1,525 blend-marked
materials have GPU opacity 1.0, only 62 used materials pass this probe's texture,
instance-alpha, additive and outline exclusions. Making just those opaque reduces
camera/outline draws 456 -> 244, but changes **328,759/1,049,088 pixels**, maximum
channel difference 151/255. Depth-write/order semantics change. The candidate is
not visually equivalent and was not adopted; this is not evidence of a clipping fix.

### Next experiments, ordered by value

1. Establish a complete unchanged-material contract and stable scene bindings;
   compare revisions or changed handles against the current descriptor rebuild.
   Validate textures, variants, fades and state parity, then measure moving combat.
2. Bound obstruction work by the camera-to-fighter/pickup sight volume and retain
   stable identity/follower bindings. Count tested candidates/rays and preserve
   articulated-limb, pickup, ceiling and fade behavior before timing the full loop.
3. Profile directed fighter preparation with prebound entity references; distinguish
   pose math from whole-scene searches. Keep engine contracts generic.
4. Separate HUD and post-processing/context-copy costs. Their combined cached
   redraw result already misses 165 Hz; preparation alone cannot finish the goal.
5. Test renderer-owned reusable transparency scratch with actual worker packets.
   Then split independent numeric batches across workers and measure 1/2/4/8 jobs,
   including transfer, synchronization, input age and contention. More cores or
   a third buffer cannot shorten the existing sequential preparation job by itself.

Validation covers 144 measured cases (four trials each: 13 visible rendering,
12 visible CPU, five headless rendering and six headless CPU modes), plus separate
smoke and structural runs. CPU probes assert unchanged gameplay state or repeated
simulation endpoints. Pixel comparison deliberately rejects the opacity candidate.
Focused spike typechecking and the process-policy check pass; all owned browser
cleanup records have no remaining processes/windows, and the shared server has no
unresolved errors. These are experiment checks, not production acceptance or new
collision coverage. The shared playable remains unchanged.
