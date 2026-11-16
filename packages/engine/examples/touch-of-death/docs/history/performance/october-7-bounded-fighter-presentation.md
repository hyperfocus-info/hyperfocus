# October 7: bounded fighter presentation, headless comparison

**Accepted in engine source; worker default remains off.** The project combat
runtime now binds its authored fighter/accessory records through the existing
DOM-free frame-selection primitive. Primitive pose/effect presentation visits
**353 selected records instead of repeatedly searching all 3,420**. Records are
borrowed from the current frame; transforms, camera, materials and render graph
remain shared with the complete frame. Save and rollback snapshots are unchanged.
Tests cover detached frames, reordered/missing/restored records, combat states,
and the number of reads from the complete scene. The standalone FPS stays visible.

Evidence: `.local/engine-perf/worker-presentation-20261007/`.
`control` freezes the previous `ready-v3d` graph. `selected-v3` isolates this
change using exact source patches, preserving unrelated work in the same file.
It is byte-identical to `selected-v2`, which was used for the first parity run;
`selected-v3-relocation.json` records the source-file relocation and HTML hash.
The builder retains sources, patches and main/worker hashes for each artifact.
The earlier `selected-v1` includes an unrelated source edit and is not timing evidence.

Eight serial trials use A/B/B/A then B/A/A/B, four per variant, six seconds of
warmup and eighteen seconds of measurement. Both use full services, two buffers,
fresh-input scheduling, VSync off and the same saved city fight with an idle human
and local AI. Environment: Windows, i9-13900HX (32 logical CPUs), RTX 4070 Laptop
GPU through ANGLE/D3D11, Chrome 154.0.8037.58, 1366 x 768 DPR 1. These are explicitly
**headless** results; no builds, tests or profiling ran during timing. Other user
workloads and power/thermal state were not controlled. Values below are medians
of trials' fighting samples, not isolated stage benchmarks.

| Metric | Control | Selected records |
| --- | ---: | ---: |
| Fresh combat FPS | 37.54 | **41.66 (+11.0%)** |
| Frame interval p95 | 44.60 ms | **39.95 ms** |
| Frame interval p99 | 55.95 ms | **49.75 ms** |
| Input age p95 | 49.10 ms | **45.45 ms** |
| Worker compute p50 | 20.80 ms | 17.75 ms |
| Total presentation p50 | 12.40 ms | 10.35 ms |
| Main work p50 | 9.50 ms | 9.30 ms |

All trials have no runtime errors or dropped fighting simulation time. Retained
packet storage is unchanged at 1,460,224 bytes. Uncollected main-heap readings do
not establish a memory improvement; worker heap is not measured. Input age is the
same software poll-to-packet endpoint on both sides, not input-to-photon latency.
This campaign does not establish foreground performance or stable 165 FPS.

Correctness: **2,044** normal-simulation oracle comparisons and **13** captured
full-state, numeric-packet and compact-presentation comparisons match exactly.
The knockout workload covers fighting, round-result and the next fighting round.
Full-service/save/learning checks pass 38 assertions; automatic triple-buffer,
reset/restore and suspend/resume checks pass 40. Engine build, engine source/test
and app/spike typechecks, 32 focused tests / 569 assertions, changed-source lint,
source-structure and process-policy checks pass. Owned browsers retain cleanup
receipts with no processes or native windows; the shared server has no errors.

**The image gate remains open.** Ordinary parity has nine changed startup pixels
at up to 6/255; an unchanged-control A/A comparison reproduces eight pixels at
6/255 in the same startup region, with identical input manifests/state/packets.
Later ordinary captures differ by at most four pixels at 1/255. Knockout captures
also exceed the 3/255 channel limit at frames 0, 240 and 480 (5, 4 and 4/255,
respectively); none exceed 25 changed pixels. These results do not widen the
existing 100-pixel, 3/255 gate or resolve the earlier normal/worker image gate.

## Next experiments and promotion limits

Separate diagnostic runs attribute roughly 2 ms of the gain to game presentation
(mean 9.02 to 6.95 ms). Remaining targets, measured on the candidate:

- Presentation/cutaway work: 6.95 ms mean in the game presenter. Profile and reduce
  unnecessary scenery queries while preserving obstruction and shadow behavior.
- Scene application: 3.40 ms, versus only 0.39 ms compiling and 0.11 ms writing
  the packet. Avoid redundant record validation/application before changing codecs.
- Presentation snapshots: 1.33 ms. Test an engine-owned read projection while
  retaining complete independent snapshots for saves, review and rollback.
- Tail frames: simulation averages 18.39 ms in the slowest 5% of compute frames,
  with multiple fixed ticks. Navigation rebuilds and catch-up amplification need
  separate attribution; the median tick cost alone misses these spikes.

These diagnostic means overlap and are not an additive frame budget. Main work
and GPU draw work also exceed 6.06 ms here; GPU queries exclude post-processing
and display presentation. A fresh foreground campaign remains necessary to judge
the 165 Hz target. Worker default promotion still needs supported ownership for
guarded modes, stable image acceptance, graphics-context recovery, physical
controller coverage and a longer soak. The [host integration evidence](october-7-app-owned-worker-host-and-mode-boundaries.md)
records the existing mode boundaries. [Experiment reproduction](../../../../../../../spikes/persistent-world-worker/README.md)
owns headless selection, source isolation and parity commands.
