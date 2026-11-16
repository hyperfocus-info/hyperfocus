# October 10: real fighter endpoint capture

**Decision:** retain the private observer and owned samples for interpolation
integration. No production change or throughput improvement is established.
The normal-AA standalone image gate remains failed.

## Boundary and ownership

The observer captures the actual directed presenter's motion, root, yaw, weapon
identity/definition and immutable rig basis. It reconstructs body transforms from
invalid scratch values and compares joints and transforms exactly. Flexible
weapon parts belong to the later attachment writer, not the body presenter; their
visibility and visible transforms receive a separate reconstruction check. Hidden
attachment transforms are deliberately not treated as visible-pose evidence.

The first observer incorrectly assigned those flexible parts to the body and
failed during startup. The recorder also initially retained the inline producer's
reused array, overwriting old samples; worker structured cloning had masked that
ownership error. Retention now copies before the next frame and checks every
endpoint tick against its frame provenance. Failure screenshots, browser errors
and cleanup receipts remain saved. The runner now surfaces startup errors directly.

## Measured coverage

Two inline/worker cohorts use the same seeded rooftop and corrected experimental
clock: 241 samples at logical 60 Hz, and 181 at logical 165 Hz with restore, pause,
viewport and reduced-motion changes. These are untimed manual captures, not live
165 Hz performance. Across both owners they provide 844 complete gameplay/pose
oracle checks, 1,688 fighter endpoint reconstructions and 121,536 body entity
checks. Restore changes the provenance epoch; both owners retain identical samples.

The 60 Hz cohort exactly matches the archived control's complete state and
packet/presentation sequence. Its two fighters each change pose 184 times and
repeat 56 times. Neither cohort contains an equipped weapon or KO: visible
attachment and KO interpolation coverage is zero. Separate component tests of a
long tool do not fill that real-game coverage gap.

The observer encodes about 51 KB per sample, including repeated rig basis and
reference transforms. This is JSON diagnostic size, not measured structured-clone
traffic or a proposed transport. The final contract should separate immutable
resources, motion inputs and diagnostic reference output, then measure ownership,
copy and allocation costs. The observer is unsuitable for throughput trials.

## Image gate

All 13 owner/control checkpoint pairs pass the existing normal-AA tolerance
(100 changed pixels, maximum channel difference 3). The 60 Hz owner pairs and
archived-control comparisons are exact; two restore-owner comparisons differ by
8–9 pixels, maximum difference 2.

Broader standalone-image comparisons fail. At the final 60 Hz checkpoint they
differ by 50–52 pixels, maximum difference 10. A fresh unmodified control reproduces
that failure; observer-vs-control standalone images pass tolerance. Its cause is
not yet isolated, and this does not waive the production gate.

The scheduled-resize standalone comparisons were invalid because the standalone
image oracle did not receive matching viewport dimensions. The runner now rejects
that combination before launch. Their raw images remain for diagnosis; the
same-viewport inline/worker comparisons and simulation checks remain valid.

## Evidence and next work

The captured worker inputs now pass 844 body endpoint reconstructions in Bun,
with maximum scalar difference 3.56e-15 from the browser reference. Seven weights
per pair produce 5,880 samples: 2,370 interpolated, 1,820 held, 1,676 endpoint and
14 restore snaps. These are sample classifications, not distinct visual presents.
Held inputs remain exact; maximum bone-length error is 2.61e-15 m. Samples at
weights 1e-6 / 1-1e-6 stay within 6.03e-7 m of the adjacent endpoint positions.
The full 60 Hz replay contains 240 fixed advances but ends at combat tick 186;
the report preserves both clocks. No simulation ticks are invented by blending.

The image investigation now distinguishes more than one discrepancy. AA-off
inline/worker images are exact at all three checkpoints. The standalone oracle
is also exact at the two later checkpoints, removing the normal-AA difference of
10 there. However, one startup standalone image differs by 12,442 pixels with
visibly different fighter poses. Matching source, workload and complete
state/presentation hashes are retained in `fighter-aa-isolation.json`. AA-off is
a diagnostic and does not clear the production-AA gate.

A private directed-history reset at photo restore was then tested using a saved
later checkpoint. It did not fix that cohort's independent image mismatch:
67–78 pixels differ, maximum channel difference 42, in both control and candidate.
The paired standalone PNGs remain identical before/after the reset. That candidate
is unpromoted; this result does not establish the cause of the separate startup
pose discrepancy. The subsequent [submission comparison](october-10-submission-parity.md)
separates main-pass compilation, reference presenter history and residual AA
variation. The original production-AA failures remain failed.

Local root: `.local/engine-perf/fixed-render-fifo-20261009/roof/`. Retain until the
interpolation and image-gate decisions are resolved. `fighter-endpoint-owners/`
contains the frozen build and patches. `fighter-owned-endpoints-{60,restore}`
receipts retain samples, basis, provenance, images, summaries and cleanup.
`fighter-owned-endpoints-*-interpolation.json` retains the body replay; the
`fighter-oracle-aa-off` and `fighter-late-restore-{control,reset}` families retain
the new image diagnostics and cleanup. `fighter-restore-reset-results.json`
records the reset comparison. `fighter-fresh-control-60`, `fighter-endpoint-image-plan.json` and
`fighter-fresh-oracle-control-plan.json` retain the image failure and control
checks. `fighter-endpoint-source-check.json` records
only two changed source modules; the unused source mailbox entry disappears while
its built runtime stays identical.

Seventeen presentation tests / 390 assertions and TypeScript checking pass. The managed
server reports no unresolved errors; owned-browser cleanup receipts are empty.

The [presentation runner](../../../../../../../spikes/persistent-world-worker/presentation/README.md)
owns reproduction. Complete the downstream appearance/expression/particle boundary
after resolving the oracle differences above. Teleport,
resource/membership replacement, equipped weapons and KO still need explicit
invalidation evidence. Live scheduling, input latency, memory/copy costs and
six-arena/stress acceptance remain open. **165 Hz fresh gameplay remains unproven.**
