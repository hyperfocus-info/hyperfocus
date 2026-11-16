# October 10: renderer submission parity

**Decision:** keep the allocating submission observer as private correctness
instrumentation. No optimization is promoted. Production-AA parity still fails;
165 Hz fresh gameplay remains unproven.

## Controlled diagnostic

The retained rooftop checkpoint starts at combat tick 186. Two logical 60 Hz
samples per owner use visible, focused Chrome on the RTX 4070, 1366×768/DPR 1.
These are untimed correctness captures, not throughput trials. The frozen
`clock-rounding` graph is the source control. The worker and inline gameplay,
numeric packets and full presentation sequences remain identical across the
reference and combined diagnostic, including the separate normal-AA run.

Snapshots are owned copies taken at `renderer.render`, before buffer reuse. They
include per-instance transforms, skin/morph state, material bindings/values,
appearance, draw order, lights, camera and render options for each pass. They do
not establish equal uploaded geometry, GL state, driver execution or postprocessing.

| Diagnostic | Submission evidence | Image result | Decision |
| --- | --- | --- | --- |
| Original, AA off | Common transforms/materials/lights/options match. Main pass retains 1,957 instances versus standalone 1,095/1,097; shared draw order differs. Shadow submissions match. | Both owners differ from standalone by 78/67 pixels, maximum channel difference 42, at the right edge. | Main compilation is a concrete confound. |
| Uncropped standalone, AA off | Inline inputs match fully. Worker reference differs in 58 instance transforms in both passes. | Inline is exact at both frames; worker differs by 6,322/6,195 pixels, maximum 249/248. | The edge mismatch disappears when main compilation matches; a separate reference pose failure is exposed. |
| Presenter reset plus uncropped standalone, AA off | Captured inputs match on both owners, both frames. | All four comparisons are pixel-exact. | A usable diagnostic reference at this checkpoint, not production acceptance. |
| Same combined diagnostic, normal AA | Captured inputs still match. | Inline/native: 20/18 changed pixels, maximum 2/4. Worker/native: 12/0, maximum 2/0. Inline/worker: 16/10, maximum 2/4. | Existing maximum-3 gate fails. Retain failure. |

The earlier reset-only diagnostic did not repair the right-edge error. Together,
these results separate main-pass compilation from presenter-history contamination;
they do not establish that every startup/load discrepancy has the same cause.
The uncropped change affects membership and draw order together. The follow-up
below isolates order. Disabling culling is an oracle experiment,
not a proposed performance fix. Normal-AA residuals are not explained merely by
matching these high-level snapshots, nor by exact AA-off images.

Next prototype bounded stable batch ordering and repair the presenter's
[restore/load/reset continuity boundary](october-10-presenter-lifecycle.md)
before using it as an independent image oracle.
Retest original production-AA failures after their causes are fixed; this result
does not rehabilitate rejected culling, caching or shadow candidates.

## Membership versus ordering

A second private candidate retains the camera compiler's exact membership but
filters it from the full command list, preserving the latter's batch/instance
order. Presenter reset remains enabled. Both owners retain 1,095/1,097 instances
in 178 commands, with the same transforms, bindings, materials, camera, lights
and shadow submission as the original culled reference. Only main draw order
differs in the captured inputs. All four AA-off image comparisons are exact.
Thus the tested right-edge discrepancy is ordering-dependent; it does not require
restoring the 862/860 removed objects.

The compiler creates batches on first surviving instance. A portable three-instance
fixture reproduces the consequence: full order `[0,2,1]` becomes `[1,2]` after
culling instance 0, whereas filtering the original order yields `[2,1]`. The
relevant compiler/renderer/transparency source files match the frozen graph.
Equal-depth or blended geometry could explain the image sensitivity; the exact
affected geometry and raster mechanism have not yet been identified.

Normal AA remains failed: inline/native differences are 7/10 pixels, maximum 4/4;
worker/native 7/0, maximum 4/0; inline/worker 0/10, maximum 0/4. Gameplay and full
packet/presentation sequences still match the original control. No timing was
performed: this diagnostic compiles twice and clones buffers, so it is not an
efficient implementation. A production candidate must preserve bounded capacity,
stable ordering across culling changes and material/mesh/instance replacement,
and demonstrate a full-loop benefit without relaxing the AA gate.

Additional evidence prefixes are `submission-reset-retained-order-late-aa-off`
and `submission-reset-retained-order-late-normal-aa`; the corresponding artifact
is `submission-reset-retained-order`. Their submission reports include
`controlStandalone` comparisons against the original culled reference. Pixel plans
are `submission-retained-order{,-normal}-image-plan.json`. Five diagnostic tests /
26 assertions and scoped TypeScript checking pass; all owned browsers are closed.

## Transparency batching follow-up

Offline replay of the unchanged production transparency sorter explains a large
part of command expansion at these two saved rooftop samples. The analyzer
reconstructs command boundaries from captured bindings/order, requires their
count to match the original packet, verifies identical sorter source in the
frozen build, and checks source ownership and instance membership. Both inline
and worker captures produce the same structural results.

| Main surface work | Full packet | Culled standalone |
| --- | ---: | ---: |
| Compiled commands | 208 | 178 |
| Commands after depth sorting | 897–898 | 511–512 |
| Opaque commands | 131 | 117 |
| Transparent instances | 1,461 | 791–793 |
| Transparent commands | 766–767 | 394–395 |
| Adjacent splits differing only in material handle | 682–683 | 353–355 |
| Optimistic transparent runs ignoring all material differences | 84 | 40–41 |

The last row is not a valid merge or performance result. Material differences
include flags, emissive color, metallic/roughness and UV settings. Only 111–112
full-packet boundaries (42 culled) have equal material flags and differ solely
in base color among recorded numeric fields. A tint-only change therefore cannot
remove most observed splits. The figures exclude shadow, outline and post draws;
do not equate them with total GL draw counts from another checkpoint.

This motivates a bounded per-instance material-table experiment that preserves
depth order and batches only compatible render state, textures, geometry and
skeletons. Before rendering such a candidate, capture complete texture bindings
and resource identities, prove the ordered instance stream and per-instance
material values, then run AA-off diagnostics and the unchanged production-AA
gate. Only paired full-loop timing can establish a speedup; current preparation
and browser cadence limits still apply. No runtime candidate is implemented here.

The inspection found a diagnostic defect: older snapshots read
`materialTextureHandles[handle]`, omitting the five-slot material stride. Their
claims of material equality cover numeric fields/flags but **do not prove texture
binding equality**. The recorder now copies all five slots at the correct offset;
the comparison reports `materialTextureSlotsCompared:false` for legacy captures.
This does not change their saved image results, transforms, membership or ordering
evidence. Texture contents/residency still need separate resource evidence.
Nine diagnostic tests / 45 assertions and the focused TypeScript check pass.

Run the offline analysis against retained inputs:

```powershell
$env:PERF_ROOT='.local/engine-perf/fixed-render-fifo-20261009/roof'
$env:PERF_PREFIX='submission-late-aa-off'
bun.cmd spikes/persistent-world-worker/verification/submission-batches.ts
```

`submission-late-aa-off-batching.json` retains all eight owner/sample results,
ordered instance identities, material-field differences and sorter hash. This
adds no browser timing trial and does not alter earlier parity failures.

### Complete bindings and bounded run planner

A fresh `binding-probe` capture repeats the same two AA-off rooftop checkpoints
with all five texture slots recorded. Full gameplay/packet/presentation sequences
match `submission-late-aa-off`; owner images match exactly. Packet and standalone
material texture handles now compare completely at these samples. Texture pixel
contents and residency are not part of this capture.

Requiring identical material flags and all texture handles, in addition to mesh,
skeleton and command flags, leaves **91–92 transparent runs** in the full packet
and **47–48** in the culled standalone. These runs preserve the original depth
order. Unlike the material-ignoring bound, they retain draw-state compatibility;
numeric material parameters still need a per-instance GPU table.

`rendering/material-runs.ts` implements this private planning stage with four
bounded reusable typed arrays. It borrows the already sorted input, leaves its
matrices/order untouched, and retains each transparent instance's material ID.
It recomputes compatibility from current flags/texture handles on every call;
there is no invalidation cache. Outputs expire on the next call, and only returned
transparent ranges contain valid material IDs. Capacity, inactive materials and
overlapping/incomplete ranges fail visibly. The consumer retains responsibility
for texture/resource validity and GPU upload lifetime.

The offline analyzer independently derives compatible run counts, then expands
the planner's runs and checks ordered material identities against all **9,012**
captured transparent-instance occurrences (two samples, two modes, two owners).
Full-packet planning storage is 31,312 backing bytes; JS object overhead and GPU
tables are excluded. Six planner/analyzer tests / 34 assertions and the focused
TypeScript check pass. No allocation-rate, planning-time or throughput claim is
made; no material-table shader or new GPU drawing path exists yet.

Next implementation gate: preserve this ordered stream while fetching every
numeric material parameter per instance, leaving opaque/outline/shadow paths
intact. Verify restored/replaced materials and textures, skinned geometry and
cutaway behavior; then compare controlled AA-off and production-AA images before
paired timing. Extra shader fetches and uploads may erase the draw-count benefit.

The new artifact was rebuilt from `submission-probe/sources.json` and its HTML,
using the updated diagnostic helper. Capture prefix: `binding-late-aa-off`;
workload: `fighter-late-checkpoint.json`; options: visible RTX 4070, checkpoints
`0,1`, capture rate 60, provenance, retained state/presentation sequences and
standalone submissions enabled. Run the same offline command above with this
prefix for `binding-late-aa-off-batching.json`; use
`PERF_SUBMISSION_CONTROL=submission-late-aa-off` with `submission-results.ts`
to verify state/packet continuity. Both owned browsers closed with empty cleanup
receipts, and the shared server has no unresolved errors.

## Evidence and reproduction

Local root: `.local/engine-perf/fixed-render-fifo-20261009/roof/`. Retain until image
gates and interpolation integration are resolved. The `submission-probe`,
`submission-uncropped` and `submission-reset-uncropped` directories retain builds,
manifests, frozen source graphs and applied recipes. Capture prefixes are
`submission-late-aa-off`, `submission-uncropped-late-aa-off`,
`submission-reset-uncropped-late-aa-off` and
`submission-reset-uncropped-late-normal-aa`. Each retains owner samples, images,
submission reports and cleanup. `submission{,-reset,-normal}-image-plan.json`
retains all pixel comparisons, including failed ones. No throughput uncertainty
interval is appropriate for these four-frame correctness cohorts.

The [worker runner](../../../../../../../spikes/persistent-world-worker/README.md)
owns commands. Three diagnostic tests / nine assertions and scoped TypeScript
checking pass. All capture/pixel browsers have empty process/window cleanup
receipts; the shared server reports no unresolved errors.
