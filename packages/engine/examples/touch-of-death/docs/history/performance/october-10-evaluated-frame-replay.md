# Complete evaluated-frame replay — October 10

An independent runtime reproduces every active numeric render field and camera
bit in **844 rooftop samples**: 241 ordinary samples and 181 restore/input samples,
each through inline and worker ownership. This establishes a bounded presentation
handoff for the current primitive scene. It does not implement interpolation,
prove image determinism or improve measured throughput. No production change.

## Boundary and experiment

The existing worker publishes final matrices and a HUD-only entity subset. The
host reads borrowed views and returns their buffer after drawing. Retaining those
views as interpolation history would violate ownership. The private diagnostic
instead clones the complete evaluated frame after all producer presentation
writers. A separate runtime receives that frame and the fixed project/assets;
it receives no gameplay updates, snapshots or producer render packets.

The consumer applies the frame, compiles commands and writes its own packet.
Comparison includes header, every active command/instance/light prefix, complete
material data/flags/texture handles and skeleton arrays, appearance and camera.
Resource checks remain enabled. Inputs are checked for mutation. Full packet
capacity is compared separately. Bit comparisons preserve signed zero and NaN
payloads. The actual screen draw still uses the original producer packet.

| Hypothesis | Controlled change / expected signature | Result | Decision |
| --- | --- | --- | --- |
| Complete frame is sufficient for this scene | Independent runtime, same fixed project/assets; active packet and camera exact | 844/844 exact; no frame mutation; complete state/presentation sequences equal archived controls | Proceed to an owned endpoint/interpolation experiment |
| Entire packet capacity identifies rendered state | Compare all bytes, including unused capacity | All samples differ in unused instance matrices; active fields match | Keep capacity/storage checks separate from visual identity |
| Current normal-AA redraw is repeatable | Same packet, camera and immediate redraw sequence | 16/28 non-exact raw/composited comparisons; 1–15 changed pixels, maximum channel delta 2 | Exact repeatability remains open |

These are finite correctness observations, not timing estimates or statistical
speed claims. The allocating observer includes an extra runtime, frame clones,
serialization and full scans. Its stage durations are not throughput evidence.

## Coverage and storage

Physical RTX 4070 Laptop browser, visible/focused, 1366×768, DPR 1, normal MSAA,
bounded wake requests. Rooftop `roof-compact-714`; existing corrected-clock frozen
graph, not a newly promoted clock change. Both owners retain identical full state,
packet/presentation and committed-state sequences versus their archived controls.

The ordinary capture has 241 samples at 60 requested samples/s. The 181-sample
capture at 165 requested samples/s changes viewport at 45/135, restores at 60,
pauses/resumes at 90/120 and toggles reduced motion at 150/165. These requested
capture cadences are simulated sample times, not achieved display rates.

| Per frame | Ordinary capture | Restore/input capture |
| --- | ---: | ---: |
| Entities / materials / lights applied | 3,391 / 1,702 / 8 | Same |
| Active instances | 1,946–2,121 | 1,945–1,966 |
| Active commands | 209–223 | 209–214 |
| Fixed packet capacity | 723,524 B | Same |
| Mean active packet bytes, all resource capacity retained | 373,240.50 B | 370,020.95 B |
| Mean unused packet bytes | 350,283.50 B | 353,503.05 B |
| Mean complete-frame JSON size | 1,266,756.24 B | 1,265,663.49 B |

The first whole-capacity comparison found 994 differing matrix words and was
retained as `complete-frame-60`. The follow-up `complete-frame-trace` checks
producer/consumer local transforms and world matrices at the initial sample:
they match. Its first packet difference is instance 1,999, beyond active count
1,946. Compiler buffers retain previous values in unused tails. The final
`complete-active-*` captures prove every active prefix throughout both sequences;
the comparator also has a negative test for a changed final live matrix word.

Approximately 48% of packet capacity is unused in this cohort. This is logical
storage/copy opportunity, not measured cache misses, RAM traffic or transfer time.
Earlier packet copy timings were small; this result alone cannot justify a large
performance prediction. The complete-frame object is also a poor proposed hot
transport: its JSON representation is about 1.27 MB and repeats fixed IDs and
records. JSON size is not structured-clone wire size or retained heap size.

No portable performance tracks, physical-body frame records or engine effect
particles were exercised. Game cosmetics represented as ordinary entities are
included. Skinned procedural locomotion can depend on runtime presentation
configuration/history; this primitive-scene pass does not establish its boundary.
Dynamic mesh/texture replacement, resource versions, scene membership changes,
teleport, equipped weapons, KO, six arenas and sustained memory remain uncovered.
Preserving producer output also preserves its existing presenter history; this
does not repair previously observed restore-history differences.

## Reproduce and evidence

Raw captures, source graphs/manifests, packets' hashes, per-frame comparisons,
PNGs, pixel reports and cleanup/wake receipts:
`.local/engine-perf/evaluated-frame-replay-20261010/roof/`.
The two early investigative captures remain separate from the final 844 checks.

```powershell
$env:PERF_ROOT='.local/engine-perf/evaluated-frame-replay-20261010/roof'
$env:PERF_FROZEN_SOURCES='.local/engine-perf/fixed-render-fifo-20261009/roof/clock-rounding/sources.json'
$env:PERF_BASE_HTML='.local/engine-perf/fixed-render-fifo-20261009/roof/clock-rounding/index.html'
bun.cmd spikes/persistent-world-worker/presentation/frame-replay-recipe.ts
$env:PERF_SOURCE_PATCHES="$env:PERF_ROOT/frame-replay-patches.json"
bun.cmd spikes/persistent-world-worker/build.ts frame-replay-active
$env:PERF_ARTIFACTS='frame-replay-active,frame-replay-active'
$env:PERF_PREFIX='complete-active-60'
$env:PERF_WORKLOAD='.local/engine-perf/worker-arena-campaign-20261008/workloads/roof-compact-714/workload.json'
$env:PERF_FRAME_REPLAY='1'
$env:PERF_PROVENANCE='1'
$env:PERF_RETAIN_STATE_SEQUENCE='1'
$env:PERF_COUNT_VISUAL_CHANGES='1'
$env:PERF_CAPTURE_HZ='60'
$env:PERF_CHECKPOINTS='0,60,240'
$env:PERF_IMAGE_LAYERS='1'
$env:PERF_KEEP_AWAKE='1'
$env:PERF_EXPECT_RENDERER='RTX 4070'
bun.cmd spikes/persistent-world-worker/verify.ts
$env:PERF_REPLAY_REFERENCE='.local/engine-perf/fixed-render-fifo-20261009/roof/producer-clock-60'
bun.cmd spikes/persistent-world-worker/presentation/frame-replay-results.ts
```

For restore: prefix `complete-active-restore`, capture Hz `165`, checkpoints
`0,60,120,180`, and `PERF_INPUT_SCHEDULE` set to
`.local/engine-perf/fixed-render-fifo-20261009/roof/fighter-endpoint-schedule.json`.
Reference prefix is the same archive directory's `fighter-owned-endpoints-restore`.
Run from a fresh environment so unrelated `PERF_*` options do not carry over.
Use the shared managed server; the retained run used `http://127.0.0.1:8798/game/`.

`image-plan.json` contains eight raw/composited same-version comparison plans;
run `image-parity.ts` with `PERF_IMAGE_BATCH` pointing there. Interpret zero changed
pixels as exact; the older tolerance gate does not establish determinism. No
complete GL-history equivalence or physical scanout is asserted by these redraws.

Verification: three focused tests/19 assertions and the focused TypeScript check
pass. Process policy reports zero violations; managed-server errors are empty.
All 16 cleanup receipts have no remaining owned processes/windows (eight image
receipts describe one shared comparison browser). All eight capture wake requests
were released without expiry or suspected sleep. The shared server remains running.

Next milestone: retain two owned, versioned presentation endpoints and reconstruct
display poses using local fighter motion, coordinated camera/HUD time and explicit
discontinuity snaps. Deliver audio/events once per producer publication. Compare
against the current schedule before optimizing the transport layout. Measure
distinct simulation ticks, visual poses, pose age and latency separately. Do not
blend final skin matrices or infer new simulation steps from interpolated motion.
