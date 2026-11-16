# Pale Reach evaluation

Game owner: [Pale Reach](../../src/scene3d/pale-reach/README.md).
Taste: [art constitution](../../src/scene3d/pale-reach/ART.md).
The current delivery and repair accounting are in `RESULTS.md` beside this file.

Ordinary generation/evaluation now has one entrypoint:

```text
bun run art:run apps/engine-editor/verification/pale-reach/art-workflow.json <new-version>
```

Use `--plan` to inspect prerequisites and `--resume` for an interrupted, unchanged
run. The [shared runner](../../../../scripts/game-art/README.md) owns sequencing,
managed URLs, hashing, logs and recovery. Its final `review` step archives the
candidate media in the existing review store and writes `<version>/review-manifest.json`.
It leaves the current human review queue intact. The scripts below remain useful
for focused diagnosis; copying this folder is not the new-game workflow.

From repository root, use a fresh output version for every changed artifact:

```text
bun apps/engine-editor/verification/pale-reach/build.ts <version>
bun .agents/skills/dev-server/scripts/dev.ts start pale-reach --json
bun apps/engine-editor/verification/pale-reach/capture.ts <returned-url> <version> --full
bun apps/engine-editor/verification/pale-reach/evaluation-build.ts <version>
bun apps/engine-editor/verification/pale-reach/capture-catalogue.ts <returned-url> <version>-matched
bun apps/engine-editor/verification/pale-reach/capture-feedback.ts <returned-url> <version>
bun apps/engine-editor/verification/pale-reach/verify-input.ts <returned-url> <version>
bun apps/engine-editor/verification/pale-reach/package-review.ts <version>
bun .agents/skills/dev-server/scripts/dev.ts start pale-reach-review --json
```

Run GPU capture commands sequentially. The managed game serves only generated
HTML/JS/media/JSON under `.local/pale-reach`; open `/<version>/index.html`.
Builds enforce known direction recipes, selected shell bytes, complete replay
reachability, contact/rig/camera gates and canonical editor command validation.
They begin at ROUGH. Packaging hashes actual files, validates all 20 planned
asset/action evidence rows and archives exact bytes with the existing
artifact-review/review-store SQLite implementation. It can establish CANDIDATE
completeness only. Human grading never comes from those checks.

`baseline-v2` freezes the first complete replay before visual repairs. Its
`replay.json` is the matched input authority. The evaluation adapter rebuilds an
archived source version and changes only its capture camera. Both sides use the
same adapter hash; fixed phase strips give exact simulation-frame comparisons.
Videos use real elapsed time, retain tick/wall timestamps and decode captured
frames with bounded seeks. The live follow-camera comparison is separate from the fixed-camera test.

The review service uses `.local/pale-reach/review/manifest.json` and its existing
`feedback.sqlite`. The initial queue has version-hidden Motion A/B. Packaging
registers the complete evidence queue in the same database and writes
`<version>/review-manifest.json`; copy that manifest to `review/manifest.json` and restart only
`pale-reach-review` when switching the visible queue. Never replace the database.
The game and review surfaces are independent of concurrent Touch of Death work.

The shared capture host creates explicit phase strips in the same pass as clips.
`capture-phases.ts` remains a repair tool for old captures without those strips.
Frozen input lives in the checked-in corpus and is hash-verified before use. A fresh
checkout does not need `.local/pale-reach/baseline-v2`, historical study images, or
an old manifest to build, capture and package a candidate. Taste receipts retain
the owner's preference for the baseline gait; rerunning does not reverse it.

Focused checks:

```text
bun test apps/engine-editor/src/scene3d/pale-reach/traversal.test.ts apps/engine-editor/verification/pale-reach/checks.test.ts
bunx tsc --noEmit -p apps/engine-editor/verification/pale-reach/tsconfig.json
bun run art:check apps/engine-editor/src/scene3d/pale-reach/corpus/constraints.json
bun run check:process-policy
```

`ledger.jsonl`, immutable build/capture snapshots, recorded rejection reports and
the final `quality.json` separate generation attempts, objective failures, agent
repair rounds and scoped human feedback. Token/cost data were unavailable; do not
infer them from wall time. No isolated control run or weaker-model run occurred.
