# October 7: app-owned worker host and mode boundaries

Historical evidence; [current guidance](../../touch-of-death-performance-audit.md) owns current status and limits.

## October 7: app-owned worker host and mode boundaries

**Prepared `ready-v3d`; worker default remains off.** The runtime now belongs to
`apps/engine-editor/src/standalone/world/`. The optional `entry-world.ts` builds
the controller and worker directly. The standalone host supplies typed bindings
for rendering, input, review, audio, storage, scheduling and cleanup; mutable
preferences/capture state remain live accessors. The generated source adapter
has been removed. Engine mailbox, simulation and render-packet contracts remain
framework-free and unchanged. The normal entry imports the controller contract
only as a type, and the builder verifies zero worker-owner modules in that bundle.
The shared diagnostic GPU timer lives in the existing repository-only
`@hyperfocus/performance/browser-gpu-timer` export, used by both this controller
and the scene-ceiling probe. Both browser consumers resolve/build successfully.

Ownership guards prevent online/spectator sessions, replay-file playback,
guided fights/tutorials, opponent routines, appearance changes and AI reports
from mutating or reading the dormant local world. Source launchers communicate
unavailability; the owning commands also reject access. Custom behaviors and
active local modes require standard execution. Saved exchange load/save, replay
and retry continue through the worker. Reduced-motion changes now reach every
worker presentation frame instead of being captured only at initialization.
FPS stays visible in both entries, including stopped/waiting states.

The focused browser journey verifies disabled mode launchers, reopening a saved
exchange, an unchanged dormant world, and toggling motion reduction both ways,
as well as all previous lifecycle/failure cases. Full-service state and durable
learning pass 38 checks; automatic triple-buffer pressure, commands and repeated
suspension pass 40. Focused tests pass 35 tests / 248 assertions; actual app/spike
typechecking, changed-source lint, source-structure and process-policy checks
pass. This recorded run retained two `directionMode` fixture errors; the repository
audit subsequently corrected those comparisons. A guard initially blocked the explicit manual renderer oracle;
the corrected candidate permits that capture-only read and was verified again.

`host-final-parity` compares `ready-v2` inline with `ready-v3c` in a worker:
**602** normal-simulation comparisons and six complete-state, numeric-packet
and compact-presentation checkpoints match exactly. Normal-renderer image
acceptance still fails without changing its tolerance: frames 60/120/180 match
exactly; frame 0 differs in nine pixels at 1/255; frame 240 differs in **107**
pixels at up to 3/255; frame 300 differs in five pixels at 1/255. The existing
limit is 100 pixels and 3/255. Older knockout receipts have not been promoted
to evidence for this candidate.

Fresh foreground timing uses eight serial worker trials A/B/B/A then B/A/A/B,
followed by four normal/worker A/B/B/A trials. All twelve retain native foreground
and have no runtime errors. Both variants show FPS, use full services and the same
city checkpoint, 1366×768 DPR 1, six-second warmup and eighteen-second samples.
No audit builds/tests run during timing; other workloads and power/thermal state
remain uncontrolled. The table reports medians of trials' fighting samples.

| Metric | `ready-v2` (n=4) | Candidate (n=4) | Normal v3 (n=2) | Candidate (n=2) |
| --- | ---: | ---: | ---: | ---: |
| Fresh combat FPS | 81.73 | 82.57 | 61.27 | 79.94 |
| Frame interval p95 | 18.30 ms | 18.25 ms | 22.30 ms | 18.35 ms |
| Frame interval p99 | 24.15 ms | 24.20 ms | 25.55 ms | 24.45 ms |
| Input age p95 | 24.20 ms | 24.15 ms | 16.25 ms | 24.25 ms |
| Main work p50 | 5.20 ms | 5.20 ms | 14.15 ms | 5.25 ms |
| Worker compute p50 | 10.05 ms | 10.00 ms | — | 10.15 ms |

There is no material timing regression from this integration batch. The fresh
normal/worker comparison retains a **30.5%** FPS advantage. Input-age endpoints
still differ between those pipelines; this is not evidence of lower input latency.
No fighting simulation time is dropped, and two render buffers retain 1,460,224
bytes. Uncollected heap readings vary with GC and do not establish a memory gate.
For the next FPS experiment, the worker's roughly **6.95 ms presentation** and
**1.90 ms compile/packet** medians are larger targets than its **1.40 ms simulation**
median. Main work still has little headroom against 6.06 ms. Treat those overlapping
stages separately and retain full-loop FPS/tail/input-age acceptance.

Evidence remains in `.local/engine-perf/worker-readiness-20261007/`. The final
`ready-v3d` relocates the shared GPU helper and is **byte-identical** to the
`ready-v3c` used for all twelve timing trials and final browser/parity receipts.
`ready-v3d-relocation.json` proves complete HTML identity; `ready-v3d-readiness.json`
binds those receipts and source graphs. Runtime SHA-256 is
`65467f83c0f039747142ab03ea31341f3a71e060552df5c3241d6280724fd9f2`, worker SHA-256 is
`b6897b8fa5a2f7f129c7f10f0ca667569b39ebe0f709ea05962a0fbdda23ee4d`, and HTML SHA-256 is
`fa5beb3691e88811221f983855ff51b98225db8d93fbb9e4d38480d55fbae6bd`.
`host-candidate`, `ready-v3` and `ready-v3b` retain intermediate runs.

Promotion still needs supported ownership for the guarded modes, the image gate,
graphics-context recovery, physical-controller coverage and a longer soak.
An app-owned implementation removes the generated-adapter limitation; it does
not make missing capabilities available or establish stable 165 FPS.
