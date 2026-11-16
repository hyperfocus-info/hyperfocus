# Persistent world worker iteration

Historical evidence; [current guidance](../../touch-of-death-performance-audit.md) owns current status and limits.

## Persistent world worker iteration

The persistent-worker hypothesis is partly supported: moving simulation and
presentation together frees most of the main thread and increases fresh-frame
throughput. It does **not** make this workload approach 165 FPS. The retained
prototype is opt-in under `spikes/persistent-world-worker`; the shared playable
and default standalone loop remain unchanged.

### Ownership and experiment boundary

The worker initializes gameplay, physics, AI, scene and directed fighter
presentation once. It then receives compact input and emits transferable numeric
render packets plus camera/HUD/audio metadata. The main thread polls input,
submits WebGL commands, draws post-processing and HUD, and schedules work.
`createSimulationMailbox` is a new framework-neutral engine primitive for the
fixed clock, coalesced continuous input and bounded discrete events. Game-specific
presentation stays in the consumer. See the [prototype and reproduction commands](../../../../../../../spikes/persistent-world-worker/README.md).

This is one persistent simulation owner, not concurrent copies of the fight.
The producer yields between jobs, with at most one input update in flight and
one, two or three transferable output buffers. Events survive input coalescing;
audio survives superseded render packets. An invariant 309,341-character combat
configuration key is excluded from HUD messages. Complete checkpoints are still
available through explicit diagnostic requests; HUD projections are not saves.
The measured compact metadata is about 25–37 KB, compared with about 335–346 KB
before omitting that invariant string. This does not remove its existing use
inside the gameplay checkpoint contract.

Two controls distinguish the changes: `baseline` is the complete standalone;
`inline` executes the identical prototype world and presentation pipeline on the
main thread. The prototype omits live-learning persistence, replay/networking,
training and full menu/save/wardrobe integration. A baseline-to-worker gain cannot
be attributed entirely to threading. The inline comparison is the better test
of thread placement.

### Visible-browser timings

Evidence: `.local/engine-perf/persistent-world-20261006/`. Eighteen serial timing
trials used the same saved city AI match, idle human, visible focused Chrome
154.0.8037.58, 1366×768/DPR 1, VSync, six-second warmup and eighteen-second sample.
Existing user background work stayed running; no audit builds, tests or profiler
ran in measurement windows. The machine is the same i9-13900HX/RTX 4070 laptop
described below. Thermal state remains unrecorded. Empty-page cadence varied
between trials and is recorded individually. These are one workload under the
current contention, not an idle/contended matrix or a claim about all manual play.

The ten-run screen was `baseline, inline, 1-buffer, 2-buffer, 3-buffer,
3-buffer, 2-buffer, 1-buffer, inline, baseline`. All worker cases use **one worker**.
Values are medians of per-trial fighting-phase summaries; busy time is CDP's
renderer main-thread task duration over the complete measurement window.

| Screen configuration | Fresh FPS | p95 interval | Main thread busy | Median frame age |
| --- | ---: | ---: | ---: | ---: |
| Full standalone | 16.91 | 109.0 ms | 99.8% | Not measured |
| Matched inline world | 18.92 | 79.9 ms | 99.7% | 36.4 ms |
| Worker, 1 buffer | 17.26 | 96.8 ms | 18.8% | 41.8 ms |
| Worker, 2 buffers | 23.26 | 73.0 ms | 22.4% | 41.0 ms |
| Worker, 3 buffers | 19.48 | 84.8 ms | 20.0% | 41.8 ms |

An adjacent **inline / worker-2 / worker-2 / inline** confirmation produced
19.48 → 21.96 FPS (+12.7%), p95 88.4 → 75.5 ms (−14.5%), and p99
105.4 → 97.3 ms. Main-thread busy time fell from 99.8% to 21.2%.
However, median latest-input age rose from 35.1 to 78.6 ms. More throughput
alone would be an incomplete success for a fighting game.

A second ABBA compared push input with requesting the latest polled input just
before each worker job. Both use two buffers and the same math:

| Two-buffer scheduling | Fresh FPS | p95 / p99 interval | Input age median / p95 | Transport ACK median / p95 |
| --- | ---: | ---: | ---: | ---: |
| Push input | 22.81 | 70.4 / 86.3 ms | 79.0 / 141.5 ms | 41.7 / 79.5 ms |
| Request fresh input | 22.46 | 75.7 / 95.3 ms | 47.3 / 84.8 ms | 4.2 / 14.9 ms |

Requesting input reduced median input age by about 40%, at a 1.5% FPS cost and
worse p95/p99 intervals (+7.6%/+10.5%). It is a useful latency option, not an
unqualified performance win. Triple buffering did not win this screen. Keep the
choices explicit rather than selecting all available cores or the largest queue.

Frame age starts when the worker samples the world and ends when the main thread
acquires that packet. Input age starts at the host's original input poll, not at
worker receipt. Received and simulation-applied input sequences are distinct.
These measurements exclude subsequent GPU/display latency and are not physical
input-to-photon latency. Only newly completed packets count as frames. The
original inline rows contain an inapplicable negative `deliveryMs` diagnostic
because acquisition preceded local computation; it is excluded from conclusions
and set to zero in the final harness. All trials recorded zero dropped catch-up
time, superseded packets and page/worker errors.

### What still blocks 165 Hz

In the fresh-input worker trials, median simulation was 5.2 ms per produced frame,
presentation 24.0 ms, and scene application/compilation/packing 5.8 ms. Simulation
p95 was 37.1 ms. The main thread still spent 7.6 ms per fresh frame on rendering,
post-processing, HUD and polling, with p95 10.7 ms. Median packet reading was
0.1 ms and accumulated synchronous input posting rounded to 0 ms at the browser's
timer precision (p95 0.1 ms). Transfer overhead is no longer the dominant cost.

The next priorities supported by this evidence are:

1. Reduce presentation work before distributing it: separate immutable scenery
   from changing entities/materials, reuse static scene records, and evaluate
   visibility/interest before expensive decoration. This prototype still samples
   all 3,420 entities and makes a full gameplay snapshot inside the worker each
   frame. Moving that work does not eliminate it. Keep rendering interest separate
   from authoritative collision, moving-platform and offscreen gameplay rules.
2. Give fixed-tick simulation a boundary independent of long presentation jobs.
   A compact dynamic-pose/grounding handoff could keep input from waiting behind
   roughly 24 ms of presentation. Prove input/state parity and transfer costs
   before partitioning further. Successive ticks of one mutable world are ordered;
   independent pose, transform, culling or query batches are the candidates for
   additional workers.
3. Split and profile the remaining main-thread rendering/compositor/HUD cost.
   Its current median alone exceeds the entire 6.06 ms target. This experiment
   does not attribute that time to a particular GPU or canvas operation.

### Bounds, correctness and package evidence

Each render packet is 730,112 bytes: two buffers retain 1,460,224 bytes and three
retain 2,190,336 bytes. This excludes worlds, assets, histories and GPU memory.
The prototype keeps the old host world and adds one persistent world, so it does
not prove a memory reduction. A separate fresh-input smoke after explicit GC
reported main/worker JS heap use of 22,661,068 / 17,591,012 bytes and backing
storage of 42,844,187 / 25,299,879 bytes. Those are single CDP samples, not allocation
rates, whole-process RSS, GPU memory, or a baseline memory comparison.

Final visible-browser correctness ran 301 frames in each mode. All **602 complete
simulation-state checks** matched the standalone `gameplay.step` oracle. Six
checkpoints matched complete numeric packet bytes and compact presentation data
between inline and worker execution. PNGs were not universally byte-identical:
two matched exactly; the others differed in 9, 36, 1 and 7 pixels out of 1,049,088,
with maximum channel differences 6, 1, 1 and 3. Raw pixel reports and screenshots
are retained; numerical parity is not described as perfect pixel parity.

The final fresh-input smoke also verified real keyboard guard input, a quit
command reaching the worker's menu state, unchanged main-world simulation,
rejection of pending requests on disposal, stopped-host rejection, and cleanup
of the owned browser and worker. The observed quit wait includes automation/GC
effects and is not used as a latency benchmark. Twelve engine boundary tests
(79 assertions), engine and prototype type checks, focused lint, engine build,
installed-package consumer and process policy passed. The public mailbox is a
small separate experimental entry: 1,113 raw / 549 gzip / 484 Brotli bytes against
1,500 / 675 / 600 ceilings. The existing experimental entry remains 23,198 raw
bytes under its unchanged 24,000-byte ceiling.

The complete repository size gate still fails the pre-existing broad runtime and
distribution overages; source-structure still has the four unrelated findings
listed in the preceding iteration. No existing ceiling was raised. This is an
experimental architecture result, not release-size acceptance or a production
worker migration.

Frozen baseline runtime SHA-256:
`bc012d7bf0348bce1fd3d7cf6cdbb4ba92a4c09840f21189f519ea2606a314fa`.
Grid/confirmation runtime (`world-original`):
`83fe6a1fcb9011e1884a695ab21b0c813652580abf22779e52dc7d62aa1d52e7`.
Fresh-input ABBA runtime (`world-timed`):
`951927c5fe3efb5c16b364983f750c1f123d5a56ad1eb929d27ea91c4becfe8d`.
Final runtime after request-failure/cleanup hardening (`world`):
`f58adbb7a65ed720e04c65eb58fc56e4d5c715d042f174e6270a5efccea03d7a`.
The last two share worker SHA-256
`48cecec6ca428a9c7278eb2d8ec00294e67581ba3e3c284f5409aa5ea34a4af9`.
The final host was rechecked for correctness and lifecycle; timing numbers belong
to the recorded timed artifacts, not a claim of identical final host bytes.
