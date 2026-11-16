# Material input versions — October 10, 2026

**Keep this candidate experimental.** It avoids deep incoming-look comparisons
on repeated owned snapshots while retaining every live resource/storage check.
The short rooftop screen has no established full-frame gain: candidates submit
100.49/100.87 frames/s between controls at 104.02/99.08. 165 Hz remains unproven.

## Attribution and ownership

A separate manual stage profile partitions runtime application. At the 60 sampled
interiors per owner, entity application takes 0.7/0.6 ms median (inline/worker),
material application 1.4/1.4 ms; ordinary endpoint material medians are 1.1/1.0 ms.
Skeleton/effect/light stages are small in this primitive rooftop fixture. These
are wall stages with observer overhead, not CPU self-time or general skinned-crowd
costs. The profile matches the compact-publication gameplay/pose reference.

The inspected applicator already avoids many writes, but visits every material,
compares its incoming look to detached cached values, then compares cached packed
values, flags and textures to live scene storage. The latter checks are necessary:
host packet reads copy into scene resource arrays, and scene APIs/direct writes
can alter them independently of the incoming frame.

The private adapter assigns an opaque token to each owned publication and a
different token to its conservative interpolated cutaway-material selection.
Producer presentation writes and packed decoding finish before tokens are issued.
The inspected display-side fighter, wardrobe, weapon and expression paths write
entities, not material looks. Sampling retains the publication's material values
while changing entity transforms, camera and time. The decoder's two reusable
slots get new tokens on every publication, even when values appear unchanged.

A binding skips only the incoming deep comparison when its token and input index
match. It still checks declared alpha mode, active material/texture resources,
packed values, flags and texture handles. Input index preserves ordered behavior
for duplicate material IDs. Unversioned application revokes the shortcut, keeping
the original mutable-input contract. Failed writes do not commit a new token.

Tokens never retain frames/resources. The window holds at most three; each
material binding additionally retains its last token and index. The window's
retained count is not a whole-runtime memory measurement. Clear/restore releases
window references; owner recreation generates distinct objects. Reusing a token
after input mutation is invalid under this private ownership contract. No public
API is promoted, and general resource/teleport epochs remain separate open work.

Texture replace/reset preserves canonical handles in the inspected runtime.
Resource mutation is not skipped by this candidate. Unit checks exercise nested
input changes with renewal, reused input storage, external packed writes, flag/
texture edits, pixel replacement, release/recreate, failed validation, declaration
alpha changes, duplicate IDs and interleaved unversioned calls. These fixtures do
not prove asynchronous resource-load images or six-arena lifecycle acceptance.

## Structural result

The instrumented actual applicator is tested at 128 and 1,024 materials, with two
forms and five texture slots per material, over 100 applications. For 1,024 held
materials, deep look calls fall from 102,400 to zero. The following remain equal:
102,400 material visits, 204,800 active-material checks, 1,024,000 active-texture
checks and 5,734,400 packed numeric comparisons. No writes/copies/backing allocations
occur in this held case. When each sample changes 1% of materials and renews the
whole input version, all deep comparisons remain; output hashes and all resource,
write/copy/allocation counts match the control.

This is fewer input reads/calls, not fewer complete material traversals. It adds
token/index checks and assignments per binding and two token objects per actual
display publication. The ordinary producer uses no input token but executes the
patched applicator's bookkeeping, so its cost is included in the browser test.
No physical cache misses, RAM-bus traffic or object-header byte sizes are measured.

## Live ABBA screen

Four serial six-second measurements after six-second warm-up and restore, visible
focused Chrome on AC with bounded wake requests; rooftop seed/checkpoint 714,
1366×768/DPR approximately 1, normal MSAA, full services, packed publication,
nominal 60 Hz producer, 16.67 ms delay, full entity loop, timer schedule and two
render buffers. Profiling/trace marks are off. No audit tests/builds overlap timing.
Both artifacts rebuild the runtime against the same frozen graph; differences are
limited to the applicator, private runtime protocol and controller option, plus
their generated runtime bundle. No rendering algorithm changes.

| Metric | A1 control | B1 versions | B2 versions | A2 control |
| --- | ---: | ---: | ---: | ---: |
| Display submissions/s | 104.02 | 100.49 | 100.87 | 99.08 |
| Display submissions | 627 | 605 | 608 | 597 |
| Reused material-input samples | — | 214 | 234 | — |
| Repeated comparable poses | 47.76% | 45.86% | 48.60% | 48.32% |
| Endpoint preparation p50 | 2.0 ms | 2.0 ms | 1.9 ms | 2.3 ms |
| Interior preparation p50 | 3.0 ms | 3.2 ms | 3.3 ms | 3.4 ms |
| Main-to-submit p50 / p95 | 7.1 / 9.3 ms | 7.4 / 9.6 ms | 7.2 / 9.7 ms | 7.3 / 10.0 ms |
| GPU draw p50 / p95 | 5.79 / 8.01 ms | 5.94 / 8.66 ms | 6.07 / 8.52 ms | 6.13 / 8.86 ms |

Within the candidate, repeated endpoints prepare in 1.5/1.4 ms median versus
2.2/2.1 ms for other endpoints. Those groups differ in whether publication occurs
and what state is selected; they are descriptive, not independently controlled
timing proof. Only 448/1,213 candidate display samples (36.93%) reuse an input
token. Candidate windows create 534/540 tokens during measurement, retain three
window tokens each and still scan 1,702 material records per display.

| Hypothesis | Expected signature | Evidence / uncertainty | Decision |
| --- | --- | --- | --- |
| Owned input versions avoid redundant deep comparison | Held input calls disappear while resources remain checked | Structural fixture confirms exactly that; changing-input control remains identical | Supported bounded mechanism |
| This improves overall fresh display capacity | Repeatable gains beyond control drift | Paired effects −3.39% / +1.81%; control spread 4.87%, candidate 0.38%; only two live pairs | Inconclusive, no promotion |
| The cache preserves evaluated instructions | Exact endpoints, repeats, restores and resource repair | 968 endpoint / 484 numeric-repeat checks pass, plus focused mutation tests | Bounded correctness pass |
| Same-version normal-AA images are exact | Zero changed pixels | 12/14 non-exact repeats, at most 20 pixels/channel delta 2 | Repeatability remains open |

Candidate submission intervals p50/p95/p99/p99.9 are
`9.90/13.70/17.10/32.10 ms` and `9.90/13.60/16.70/18.30 ms`.
98.34% / 97.03% exceed 6.0606 ms. Longest repeat runs are 27/26 after the first
pose. All 2,437 GPU queries are valid; they exclude post/HUD/compositor and must
not be added to CPU durations as serial stages. Candidate pose-age medians are
30.1/30.3 ms and applied-input age proxies 44.1/43.6 ms; neither is physical
presentation or measured input-to-visible response. Observed step IDs have no
interior gaps; 358–360 fixed steps are observed per six-second trial.

These elapsed-time health runs have different later workloads and no reliable
acceptance confidence interval. In-window clocks/contention, CPU temperature,
working set, allocation rate and sustained retained memory remain unrecorded.
Candidate heap-used endpoints of 51.2→72.4 MB and 44.3→71.1 MB are not leak or
retention evidence. Short p99.9 is effectively the observed maximum.

## Reproduction and next experiment

Raw root: `.local/engine-perf/application-input-versions-20261010/roof/`.
`application-short` owns the separate profile; `versions-short` and
`versions-restore` own candidate correctness; `versions-abba-plan.json`, complete
display/producer rows and `screen-summary.json` own the live comparison.
Source graphs/patches, structural counters, images and wake/cleanup receipts remain.

Use the [integrated display workflow](../../../../../../../spikes/persistent-world-worker/presentation/README.md#integrated-display-experiment).
Set `PERF_REBUILD_RUNTIME=1` before recipe and build for both artifacts. Control
uses `PERF_DISPLAY_MATERIAL_VERSIONS=0`, candidate `1`; both use packed transport,
full entities, producer 60 Hz, delay 16.666666666666668 ms and profile off. Run the
control,candidate,candidate,control sequence with four `worker-2-fresh`/`timer`
settings. Use new output prefixes. Stage profiling requires a separate build with
`PERF_DISPLAY_PROFILE=1` and the same runtime rebuild setting.

Run `incremental/material-structure.ts` with `PERF_MATERIAL_MODE=control`, then
`versions` in the same explicit root. Focused contract commands:

```powershell
bun.cmd test spikes/persistent-world-worker/incremental/material-input-versions.test.ts
$env:PERF_MATERIAL_LAYOUT='versions'
bun.cmd test --preload ./spikes/persistent-world-worker/incremental/material-words-preload.ts packages/engine/src/project/3d/runtime/materials.test.ts spikes/persistent-world-worker/incremental/material-storage.test.ts
```

The restore correctness capture briefly overlapped an accidentally launched broad
repository test command, which was interrupted and verified terminal before
throughput began. Its incidental timings are excluded; exact state/pose checks
remain valid. That interrupted command is not a passing repository gate.
All 18 cleanup receipts are empty; all ten wake requests released without expiry
or suspected sleep. Some receipts refer to the same browser. The shared managed
server stays running.

Focused verification passes: 46 presentation/version/trace tests with 562
assertions; the patched legacy applicator and storage fixtures pass another
seven tests with 85 assertions. The experiment TypeScript check passes, and the
process-policy check reports zero violations across 4,893 files. These checks
cover this private experiment, not the broad repository or six-arena gates.

Next test per-material producer versions derived from its existing exact input
comparisons, rather than invalidating all material inputs at every publication.
The inspected world order is sample, game presentation, appearance/motion,
directed presentation, runtime application, compile/packet write, then private
publication packing. There is no subsequent material writer in that synchronous
path. Derive revisions during the existing application comparison; still bind
them to producer identity and restore/load lifetime, and choose the matching
per-material revision for the interior cutaway union. Preserve live resource checks
and count any added revision arrays, serialization and tracking work. This is an
experiment proposal, not the final library architecture or a proven optimization.
The [completed follow-up](october-10-material-input-revisions.md) records its
preparation improvement, full-loop uncertainty and remaining checks.
