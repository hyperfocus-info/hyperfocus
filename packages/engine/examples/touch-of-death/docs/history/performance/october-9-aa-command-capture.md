# October 9: identical-packet AA redraws

**Production-AA repeatability remains unresolved.** One synchronous redraw changes
six raw pixels by up to 13/255 despite identical captured GL initial state, calls
and uploaded argument bytes. The matching AA-off diagnostic is exact. This
narrows the failure beyond packet construction, but does not identify a driver
defect or establish complete GPU-state equality. No visual tolerance is relaxed.

## Controlled diagnostic

Rooftop seed 714, visible focused Chrome 154, RTX 4070 through ANGLE/D3D11,
1366 by 768, DPR approximately 1. Normal contexts report four samples, one sample
buffer, dithering enabled and `preserveDrawingBuffer:false`. Each inline/worker
owner advances the same 61-frame sequence and captures checkpoints 0 and 60.
Each checkpoint renders the same packet nine times. Adjacent draws are compared
in both raw WebGL and composited Canvas images.

These are manual readback diagnostics, never throughput measurements. All saved
state, numeric-packet, full presentation and independent pose sequences agree
between owners. The 64 image comparisons in a cohort represent 32 redraw
transitions, each observed in two layers; they are not independent trials.

Raw receipts, frozen artifacts, full command lists, uploaded-data hashes, PNGs,
pixel reports and cleanup receipts live in
`.local/engine-perf/raster-commands-20261009/`.

| Hypothesis / controlled variable | Expected signature | Measured result | Decision |
| --- | --- | --- | --- |
| Capture wrapper plus an asynchronous hash boundary between redraws | A diagnostic observer may change the failure | `roof-default`: all 64 image comparisons exact | Observer confound; preserve but do not use as proof of deterministic normal AA |
| Synchronous redraws without command capture | The original variation remains observable | `roof-sync-unrecorded`: one worker transition changes 65 pixels; raw maximum 1, composited maximum 2 | Reproduces variation within the existing gate |
| Synchronous redraws with captured commands | Changed commands/uploads would explain changed images | `roof-sync-recorded`: worker frame 60, draw 7 to 8; six pixels differ, raw maximum 13, composited maximum 12; initial-state and command hashes agree | Existing maximum-3 gate fails; narrower localization, not root cause |
| Same synchronous recorded fixture, AA disabled | A non-AA source would still vary | `roof-sync-aaoff-recorded`: all 64 comparisons exact | Supports AA-specific diagnosis; cannot pass production-AA acceptance |
| Explicit four-sample RGBA8/depth24 target, resolved to an AA-off default canvas | If default-target ownership alone causes the variation, redraws should become exact | `roof-explicit-msaa-recorded`: one transition still varies; raw four pixels / maximum 2, composited three pixels / maximum 2, equal captured state/commands | Not a deterministic fix; all 64 adjacent comparisons and eight normal-AA-reference layer comparisons pass this short tolerance gate |

The failing pair records 34,025 GL calls per draw, including 2,543 instanced draw
calls, 254,336 copied argument bytes and one `bufferSubData`; no texture upload
occurs. Changed pixels span x=184–943, y=104–404. The captured stream and its
selected initial state contain no changing uniform, frame index or uploaded
buffer between those two draws. No JavaScript `await` separates their draws or
image copies. Dithering-off already failed in the earlier raster campaign.

An independent CPU decode of the saved PNGs with the installed `pngjs` 5.0.0
reproduces the pixel counts and maximum differences (`changed-pixels-cpu-decoded.json`).
All six pixels in the maximum-13 raw failure have unchanged alpha 255, so a
low-alpha unpremultiply amplification does not explain that event. The smaller
explicit-target raw differences have unchanged alpha 181. Browser PNG decoding
and the comparison canvas are therefore not the source of these saved differences.

## Scope and unresolved evidence

The app-owned recorder wraps renderer-used mutating GL entry points. It preserves
native receivers/return values, snapshots typed arguments and records selected
bindings, masks, depth/blend/cull/sample state. Per draw it is bounded to 100,000
calls and 32 MiB of copied arguments; a capture allows at most eight repeats.
Each context has its own resource IDs. Previously resident mesh/texture contents,
shader binaries, all texture-unit state and backend resource scheduling are not
fully captured. Equal hashes are therefore stronger than packet equality, not a
complete WebGL replay proof. Readbacks, state queries, copies and hashing perturb
execution; rare differences do not estimate a population failure rate.

The explicit-target diagnostic retains four-sample rendering, with separate
color/depth renderbuffers and a color-only resolve. It redirects only default
framebuffer binds; shadow targets remain unchanged. The short comparison differs
from normal-AA reference images by at most 2/255 across four pixels. It does not
establish independent-session repeatability, general visual parity or throughput.
The visible lifecycle probe verifies resolved pixels, binding/method restoration
on success and injected failure, bounded disposal, fixed-size resize rejection
and a new owner after context recovery. The first probe requested restoration
inside loss-event dispatch and timed out; the corrected probe yields before
restoration, and both logs/cleanup receipts remain saved.

Remaining discriminators include default-framebuffer history, alpha/unpremultiply
and the Canvas2D copy boundary, then relevant ANGLE/GPU trace evidence. Explicit
target ownership alone did not eliminate variation in this test. The helper is
manual, fixed-size and deliberately rejects resize; it is not a production path.
Production AA still needs controlled initial history and identical warm-up across
repeated independent sessions, including depot and full combat/KO sequences.

The first capture comparator incorrectly included owner-local diagnostic filenames.
The shared comparator now excludes diagnostic `renders` metadata while preserving
the selected state/packet/image gates. `roof-default-revalidated.json` records the
offline correction; the original failed collector log remains retained.

## Reproduction

Use the persistent-worker runner's `roof-sync` frozen artifact with
`PERF_ROOT=.local/engine-perf/raster-commands-20261009`, the rooftop workload,
`PERF_ARTIFACTS=roof-sync,roof-sync`, `PERF_CAPTURE_HZ=60`,
`PERF_CHECKPOINTS=0,60`, `PERF_PROVENANCE=1`, `PERF_COUNT_VISUAL_CHANGES=1`,
`PERF_IMAGE_LAYERS=1`, `PERF_RENDER_REPEATS=8`, `PERF_RENDER_COMMANDS=1`,
`PERF_HEADLESS=0`, `PERF_EXPECT_RENDERER=RTX 4070` and a unique `PERF_PREFIX`.
Run `verify.ts`; select `PERF_RASTER_MODE=default` or the diagnostic `aa-off`.
For the explicit target use the `roof-explicit-msaa` artifact, `aa-off` default
context and `PERF_EXPLICIT_MSAA=1`; the receipt verifies four target samples.

Run `verification/render-repeat-report.ts` with `PERF_RENDER_REPORT_MODE=plan`,
then `image-parity.ts` using the generated `PERF_IMAGE_BATCH`. Rerun the report
without plan mode to correlate adjacent images and captured command hashes.
The runner README owns these flags and bounds. Raw commands are required for
further diagnosis; the summary alone cannot establish equivalent resource state.
