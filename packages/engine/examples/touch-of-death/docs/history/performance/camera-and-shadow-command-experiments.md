# Camera and shadow command experiments

Historical evidence; [current guidance](../../touch-of-death-performance-audit.md) owns current status and limits.

## Camera and shadow command experiments

The normal standalone source now uses `runtime.compileViews(camera, light)`.
The engine compiles separate bounded camera and shadow commands; the renderer
accepts `shadowCommands` so camera culling cannot remove off-camera casters.
The camera volume includes toon outline expansion. Deforming skin/morph meshes
remain conservatively visible, and sphere-plane tests account for hierarchy shear.
This skips render work; it does **not** yet skip whole-scene sampling, obstruction
presentation, material discovery, scene application or simulation.

Evidence is in `.local/engine-perf/view-culling-20261006/`. Sixteen serial visible,
focused Chrome trials used the same saved city workload, 1366×768/DPR 1, VSync,
six-second warmup and eighteen-second measurement. Each host ran A/B/B/A and
B/A/A/B, with four trials per artifact. No audit builds/tests ran during timing.
The following are medians of per-trial fighting-phase statistics. The worker
uses two buffers, fresh-input requests, replay recording and live learning.

| Execution | Combat FPS | p95 / p99 interval | Main-thread occupancy |
| --- | ---: | ---: | ---: |
| Normal control | 17.34 | 81.80 / 93.80 ms | 99.83% |
| Normal camera/light commands | **20.24** | **70.10 / 81.70 ms** | 99.76% |
| Worker control | **25.85** | **55.30 / 69.50 ms** | 25.12% |
| Worker with two command streams in each packet | 24.01 | 63.70 / 72.80 ms | **16.09%** |

**Retain normal-host culling:** FPS improves 16.8%, p95 14.3% and p99 12.9%.
Median render submission falls 5.45 → 2.00 ms and draws 2,736 → 571. This is a
combined pass/culling change: the shadow pass also preserves material instancing
instead of inheriting the camera's fragmented transparency order. It is not valid
to attribute the entire improvement to rejecting offscreen instances.

**Reject the larger worker packet:** FPS falls 7.1% and p95 worsens 15.2%, despite
main-thread work falling 7.50 → 3.95 ms. Median worker compute rises 34.00 → 34.95 ms;
input age rises 42.70 → 45.15 ms (p95 61.10 → 67.30 ms). Packet capacity rises
730,112 → 1,225,760 bytes, making two buffers 1,460,224 → 2,451,520 bytes (+67.9%).
The broad light volume frequently retains every caster, so a second culling pass
can add work without rejecting any. The extra packet format and worker compilation
were removed from source; their artifacts and source copies remain in the evidence
directory, including `rejected-worker/`. The existing worker packet stays unchanged.

Correctness checks compare 602 simulation states against the standalone oracle
and six compact-presentation checkpoints. Camera culling intentionally changes the
numeric draw packet. Six rendered images differ by at most 57 of 1,049,088 pixels,
with a maximum channel difference of 3/255; these are tolerance comparisons, not
byte-identical PNGs. Repeating the unchanged renderer also changes a few pixels
(up to 12 at 1/255). Preserving its former shadow draw order did not remove the
small culling difference, so that additional sorting was not retained. No missing
geometry was observed in the inspected images. Collision state is unchanged;
this is not evidence of a new clipping fix.

The frozen `normal-candidate` is the normal-host acceptance artifact (main hash
`8cd8c79cfd0e3cb3b0eebfcaf3c8b600770e8a45b0638766dfe7047c7d889da3`). The shared
served playable is unchanged; this iteration changes source and private browser
artifacts.

A second worker screen kept the original packet and passed it as the unsorted
shadow stream, avoiding the extra worker compilation and transfer. Four serial
A/B/B/A trials produced 25.19 → 24.70 FPS, p95 60.60 → 60.90 ms and median main work
7.10 → 6.40 ms. Buffer memory stayed unchanged. This did not establish a full-loop
win, so that worker submission change was also removed. Its `batched` artifact and
injection source remain available. It passed another 602 state checks, six exact
numeric packet/presentation checkpoints and image differences of at most nine
pixels at 3/255. The private worker retains its previous behavior.

### What limits the next iteration

Three separate, unprofiled diagnostic runs (`stages-*`, one per variant) collected
bounded asynchronous GPU queries and fine CPU clocks. They are attribution samples,
not additional A/B acceptance trials. Same visible RTX 4070 Laptop GPU/ANGLE D3D11
renderer and viewport; renderer GPU time excludes post-processing and compositing.

| Mean per fighting frame | Worker control | Two command streams | One-packet shadow batching |
| --- | ---: | ---: | ---: |
| Renderer GPU time | 11.26 ms | **5.89 ms** | 10.10 ms |
| Renderer CPU submission | 4.81 ms | **1.61 ms** | 4.53 ms |
| Worker compute | 36.92 ms | 37.42 ms | 41.75 ms |
| Gameplay presentation / obstructions | 13.45 ms | 13.33 ms | 14.78 ms |
| Directed fighter presentation | 5.67 ms | 5.75 ms | 6.30 ms |
| Apply scene state | 5.52 ms | 5.63 ms | 6.26 ms |
| Compile commands | 0.43 ms | 0.80 ms | 0.42 ms |
| Packet write | 0.13 ms | 0.22 ms | 0.18 ms |

GPU samples: 303/300/268 fighting frames. CPU and GPU overlap; their durations must
not be summed. The two-stream candidate halves measured renderer GPU time while
making fresh-frame throughput worse. The small compile/write increase is directly
observed; attributing the entire FPS loss to it would overstate these data because
simulation catch-up, scheduling and background load also vary.

The next priority is **reducing the worker's sequential frame-preparation work**:
spatial candidates for obstruction/cutaway work, stable fighter/environment bindings,
and updates only for changed scene state. Retain off-camera physics and caster
correctness; draw visibility alone cannot decide which simulation work to skip.
Count visited entities, rebuilt maps, changed bindings and allocations before
splitting jobs across additional workers. Another concrete allocation candidate is
packet decode producing a fresh command object each frame while transparency scratch
is cached by command-object identity; measure that allocation before changing its
ownership. Simulation/collision reads need an explicit bounded mirror before frame
preparation can safely become an independent job. More buffers do not remove that
dependency or the roughly 34 ms median compute deadline.

Focused validation passes 76 tests/1,491 assertions, engine build, editor and
experiment typechecks, changed-source lint and the installed-package consumer smoke.
The process-policy check passes; every recorded owned-browser cleanup has no live
processes/windows, and the shared server has no unresolved errors. Bundle checks
still fail the same 168 pre-existing categories, with no new category introduced.
Source structure now has only three unrelated directory violations; the affected
engine scene/renderer files are within their limits. No shared server was replaced
and no experiment was published.
