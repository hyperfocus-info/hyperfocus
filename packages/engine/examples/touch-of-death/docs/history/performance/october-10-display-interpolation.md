# Owned display interpolation — October 10, 2026

**165 Hz fresh motion remains unproven.** A private complete-scene interpolation
path now renders real rooftop endpoints and intermediate poses. Removing redundant
object copies fixes a large publication cost, but the live trials produce **zero
interpolated poses**: available endpoints are too old for the 16.67 ms display
delay. More submissions do not establish fresher motion. Nothing is promoted.

## Boundary and work removed

The producer still performs fixed-step gameplay and complete presentation. It
publishes the evaluated frame plus local fighter motion, root/yaw, attachment and
expression inputs. The host retains two owned endpoints and one working frame.
Interior samples coordinate entity TRS, camera and fighter reconstruction; they
do not interpolate final skin matrices or advance simulation. Audio drains once
per publication. Samples and compiled commands are borrowed until the next sample.

The first prototype clones the full frame in the producer, again on host
publication, and again for working storage. The follow-up borrows producer data
until synchronous `postMessage` finishes cloning, adopts the exclusively owned
received message, and reuses working entities/camera. Inline publication still
copies borrowed presenter data. Resource application and renderer checks remain.
The worker still sends the full object graph and the existing numeric packet.

| Hypothesis | Controlled change / expected signature | Evidence | Decision |
| --- | --- | --- | --- |
| Local-motion history can reconstruct this real scene | Render endpoints and midpoint; compare original packets, camera and repeated samples | 968 endpoint and 484 numeric-repeat checks pass across final short/restore captures | Keep private component; broader correctness open |
| Duplicate clones dominate host publication | Adopt worker-owned records and reuse working storage; fewer full graph copies | 419 live publications adopted, zero host publication clones, two working clones and 417 reuses; median publication about 1 ms | Keep experimental ownership path |
| A nominal 60 Hz producer plus 16.67 ms delay supplies live interiors | Independent display IDs, alpha, source timestamps and pose identities | 1,127 follow-up submissions; zero interpolated poses | This schedule does not deliver the intended fresh motion |
| Packet equality proves image repeatability | Repeat midpoint with identical numeric packet/camera under normal MSAA | Final restore images: 8/8 non-exact, at most 16 pixels / channel delta 2 | Exact within-version AA repeatability remains open |

The copy counts directly establish avoided work. Timing cohorts below are
descriptive health checks, not randomized paired optimization evidence. There is
no gain confidence interval: elapsed-time gameplay differs between trials.
Logical storage and clone counts are not measured cache misses or RAM-bus traffic.

## Correctness coverage

Final ownership captures contain 61 ordinary and 181 restore/input publications
per owner (inline and worker): 484 total, with independent gameplay/pose oracles.
All 968 endpoint comparisons retain every active packet field, complete resource
arrays and exact camera bits. All 484 repeated numeric samples and synthetic
once-only audio checks pass. Inline source poisoning passes 242 times; worker
adoption retains prior endpoints across later producer captures. Complete producer
sequences and every sampled intermediate pose hash match the copying prototype.
Maximum measured limb-length error is 1.23e-15.

The restore schedule changes viewport at samples 45/135, restores at 60, pauses
and resumes at 90/120 and toggles reduced motion at 150/165. Each owner has 52
midpoints distinct from both endpoints in that sequence. These are manual sample
times (60/165 requested samples per simulated second), not achieved display rates.

Epoch/rewind, viewport, mode, membership, excessive span and unsupported animation
or KO cause explicit snaps. Resources/topology are fixed in this experiment;
complete resource-replacement and teleport writer protocols remain unimplemented.
Cutaway union is conservative only at the endpoints; intermediate-camera
occlusion is unvalidated. Equipped weapons, skinned crowds, effects, dense/KO
collision, six arenas and sustained memory/thermal acceptance remain open.
Preserving producer endpoints does not repair earlier restore-history failures.

Earlier copying-version images had 13/14 non-exact repeats (maximum 20 pixels,
channel delta 4). Final owned-restore images have 8/8 non-exact repeats. These
include held/snap samples as well as interiors. Numeric repeatability passes;
complete GL-history equivalence and production-AA determinism do not follow.
No new AA-off result is claimed.

## Live stage and motion observations

Each version has two serial trials, six seconds warm-up, checkpoint restore, then
six seconds measured. Physical RTX 4070 Laptop, visible/focused Chrome,
1366×768/DPR 1, normal MSAA, full services, provenance/diagnostics on, timer input
scheduling and two packet buffers. AC is required; bounded wake requests and
boundary power samples are retained. Empty-page intervals remain about 6.06 ms.
CPU clock/temperature and hardware memory counters are unobserved. Other user
workloads remain running; no builds/tests or other audit browsers overlap timing.

| Metric | Copying trial 1 / 2 | Copy-elided trial 1 / 2 |
| --- | ---: | ---: |
| Producer acquisitions / measured window | 129 / 127 | 212 / 207 |
| Display submissions/s | 22.80 / 23.76 | 94.89 / 91.97 |
| Interpolated submissions | 0 / 0 | 0 / 0 |
| Repeated comparable poses | 20.44% / 24.48% | 68.48% / 68.59% |
| Longest repeat run after first pose | 5 / 5 | 26 / 25 |
| Main publication p50 | 29.3 / 30.0 ms | 1.0 / 1.0 ms |
| Display preparation p50 | 2.2 / 2.1 ms | 1.9 / 1.9 ms |
| Producer metadata p50 | 11.3 / 11.6 ms | 0.3 / 0.3 ms |
| Producer start through postMessage return p50 | Uninstrumented | 16.0 / 16.6 ms |
| Synchronous postMessage wall p50 | Uninstrumented | 5.60 / 5.70 ms |
| CPU WebGL submission p50 | 2.5 / 2.5 ms | 2.5 / 2.5 ms |
| Main update start through submit p50 | 35.0 / 35.5 ms | 5.8 / 6.0 ms |
| Asynchronous whole-render GPU p50 | 8.35 / 8.15 ms | 6.44 / 6.63 ms |
| Pose age at CPU submit p50 / p95 | 81.3 / 93.2; 82.5 / 106.3 ms | 39.7 / 54.5; 41.2 / 55.8 ms |
| Input-sample-to-submit proxy p50 | 127.4 / 128.0 ms | 52.6 / 54.9 ms |

Input timing is a proxy, not measured visible response. GPU queries are
asynchronous and all follow-up samples are valid; their range excludes post,
HUD and compositor. CPU/GPU can overlap: do not add these durations into a
serial frame budget. Message delivery includes serialization/decode/queueing and
is not pure waiting. No physical screen presentations were observed.

Follow-up submit intervals, p50/p95/p99/p99.9:
`8.50/17.10/19.00/26.50 ms` and `8.70/17.40/21.70/30.40 ms`.
Intervals exceeding 6.0606 ms: 96.85% / 98.56%; exceeding 1.5 budgets:
46.76% / 47.47%. These are CPU-submission thresholds, not measured display
deadline misses. Short-run p99.9 is effectively the observed maximum.
Both windows contain 359 distinct observed fixed-step IDs without interior gaps;
they contain only 180/174 changed submitted poses. Interpolation creates no ticks.

Main JS heap used grows 66.8→98.1 MB and 95.2→134.7 MB in the follow-up windows.
Those boundary samples do not measure retained memory or working set. GC,
allocation attribution, independent sessions, paired uncertainty, longer tails
and thermal stability still need evidence.

## Reproduce and next milestone

Raw data, complete source graphs/manifests, per-display rows, worker post-call
samples, images, power and cleanup receipts:
`.local/engine-perf/display-interpolation-20261010/roof/`.
Final manual prefixes: `integrated-owned-short`, `integrated-owned-restore`.
Live prefixes: `live-health`, `live-owned-health`; their `*-plan.json` files own
exact cohorts. Retain earlier failed/slow prototypes separately.
The [presentation experiment README](../../../../../../../spikes/persistent-world-worker/presentation/README.md#integrated-display-experiment)
owns build/capture/live commands. Summaries use `display-results.ts` and
`display-live-results.ts`; image plans are `display-image-plan.json` and
`owned-image-plan.json`. Exact equality requires zero changed pixels, regardless
of the old image tool's tolerance-based exit status.

Verification: 26 focused tests / 449 assertions and focused TypeScript pass.
All 24 cleanup receipts are empty (some describe the same owned browser), and all
14 wake requests released without expiry or suspected sleep. The shared managed
server stays running. A new packet-comparison negative test covers live tails,
appearance, material data/flags/texture handles and skeleton storage.

Next test: compact dynamic presentation data with stable resident identities,
starting with Float64 to preserve endpoint math. Measure packing, boundary calls,
logical copy bytes, decode/application, allocations and complete frame behavior.
Keep resource validation and bounded ownership. Accept only exact endpoint and
same-version numeric repeats, unchanged gameplay/audio, explicit invalidations
and measured live interiors with latency reported. Compare a longer display delay
and alternate input scheduling separately; neither is implemented here. A final
library layout cannot be selected from this fixed-resource rooftop prototype.
