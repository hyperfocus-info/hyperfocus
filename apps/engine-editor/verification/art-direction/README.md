# Touch of Death art evaluation

Owner decisions and grammar: [Art Constitution](../../../../packages/engine/examples/touch-of-death/docs/touch-of-death-art-constitution.md).
Source/runtime findings: [diagnosis (temporary; prune after findings are promoted)](../../../../.local/touch-of-death/reports/art-diagnosis.tmp.md).
Selected and rejected examples: [visual corpus](../../../../packages/engine/examples/touch-of-death/docs/touch-of-death-art-corpus/README.md).
Review scenes remain bounded experiments. The reviewed fighter generators and
action presenter also enter the canonical game through the
[directed fighter integration](../../../../packages/engine/examples/touch-of-death/src/presentation/art-direction/integration/README.md).
The [directed weapon workflow](weapons/README.md) adds per-intent motion,
heavy/flexible handling, actual frame-data comparisons and enforced generation
plans. Its authored weapon data also feeds city generation. The integration shares
its rig while preserving the canonical game's physics, camera and combat data.

For complete arena/Theater recordings use [arena capture acceptance](../arena-capture/README.md).
The [service construction review](service-court/README.md) bounds common workwear,
component tool materials and one existing entrance, with native matched combat.
Its default is native offline 60 fps with source-clock, decoded packet, framing,
lighting and audiovisual timing gates; ordinary art studies retain their declared
sampling rate and do not substitute for arena acceptance.

From repository root:

```text
bun apps/engine-editor/verification/art-direction/baseline.ts <managed-game-url> <new-output-directory>
bun apps/engine-editor/verification/art-direction/baseline.ts <managed-game-url> <new-output-directory> --defenses
bun apps/engine-editor/verification/art-direction/baseline.ts <managed-game-url> <new-output-directory> --occlusion <saved-source-snapshot.json>
bun apps/engine-editor/verification/art-direction/build.ts <new-candidate-directory>
bun apps/engine-editor/verification/art-direction/capture.ts <candidate-directory>
bun apps/engine-editor/verification/art-direction/prepare-review.ts <candidate-directory>
bun apps/engine-editor/verification/art-direction/build-slice.ts <new-slice-directory>
bun apps/engine-editor/verification/art-direction/build-slice.ts <new-comparison-directory> --reference
bun apps/engine-editor/verification/art-direction/compare-locomotion.ts <new-comparison-directory> <prior-slice-directory>
bun apps/engine-editor/verification/art-direction/compare-locomotion.ts <new-comparison-directory> <prior-slice-directory> --all-motion
bun apps/engine-editor/verification/art-direction/validate-slice.ts <slice-directory>
bun apps/engine-editor/verification/art-direction/capture-slice.ts <slice-directory>
bun apps/engine-editor/verification/art-direction/capture-motion.ts <slice-directory>
bun apps/engine-editor/verification/art-direction/capture-motion.ts <slice-directory> --locomotion-only
bun apps/engine-editor/verification/art-direction/capture-motion.ts <slice-directory> --selected-motion
bun apps/engine-editor/verification/art-direction/capture-repair.ts <slice-directory>
bun apps/engine-editor/verification/art-direction/package-review.ts <slice-directory>
bun apps/engine-editor/verification/art-direction/package-review.ts <slice-directory> --locomotion-only
bun apps/engine-editor/verification/art-direction/package-review.ts <slice-directory> --animations-only
bun apps/engine-editor/verification/art-direction/verify-record.ts <record.json> <feedback.sqlite> [previous-record.json]
bun test packages/engine/examples/touch-of-death/src/presentation/art-direction
bun test apps/engine-editor/verification/art-direction/verify-record.test.ts
bun run test:game-art
```

`build` validates each portable declaration through engine preflight and an
editor command session. `capture` uses owned headless Chrome and the production
WebGL2 renderer, emits five views per fighter and all three arena compositions,
and fails on browser errors. Study poses are explicit evaluation-frame rotation
overrides; the static declaration alone does not encode those limb rotations.
`prepare-review` archives exact rendered bytes in the existing review-store
SQLite implementation. No grade is inferred or entered by preparing a queue.
The baseline `--defenses` mode restores explicit isolated parry, tech, armor and
DI snapshots through public photo capture. It captures the exported game's HUD
and effects without advancing combat; these are labeled visual fixtures, not
evidence that a native player executed a defense or understood the feedback.
`--occlusion` stages guard, extended parry contact, foreground traffic and a
camera-inside-car stress view. Reuse one saved source snapshot for matched
builds. The interior stress view deliberately crops the fighters; it tests
remaining scenery edges, not normal gameplay framing.

`build-slice` enforces [durable forearm constraints](../../../../packages/engine/examples/touch-of-death/docs/touch-of-death-art-corpus/constraints.json)
before emitting artifacts and writes an `art-constraints.json` receipt. Its
`constraints.ts` also rejects changed scene bindings or scale. This protection
does not require the ignored v14 directory or local feedback database. The shared
[constraint tool](../../../../scripts/game-art/README.md) owns the byte checks;
the constitution and corpus retain the approval scope.

Use a new directory for changed bytes. Baseline source snapshots remain separate
from staged contact fixtures. Rendering tests do not imply taste approval.
`quality.ts` rejects missing domain evidence, stale-byte approval, missing critics,
unresolved golden qualities and changed accepted fields without a reopen source.
`verify-record` hashes real evidence, compares it to the immutable archived bundle,
and requires matching saved owner feedback for promotion. Local SQLite remains a
trusted owner-controlled store, not a remote authentication boundary. Selection,
including selection of B heavy/B impact, is not finished-asset approval.

Run GPU capture commands sequentially. Motion recording follows wall-clock time
and retains frame timestamps; neutral locomotion must actually advance. The
comparison's native transition sequences use the existing WebM frame-sequence
exporter with explicit simulation timestamps. Rendering every catch-up tick in
a wall-clock recorder could starve capture and emit a header-only file. The
comparison now decodes each recording and rejects missing video or too few samples.
Its metadata separates simulation playback duration from encoding elapsed time. The
owner rejected the first forearms and locomotion: never use v8 as a positive
character/locomotion precedent. `repair-review.html` keeps the rejected version
beside the new candidate. Run `capture-repair` after the ordinary image capture.

The local slice changes collision size/reach, attack root travel and movement
speed to test the selected human proportions. It is not a canonical balance
migration or a drop-in exported game. Native combat still owns damage, stun,
hit stop and audio events. Resolving that integration is required before delivery.

The owner accepted v14 forearm proportions only and requested locomotion revision
against the existing Quaternius Universal Animation Library. `--reference` adds
the source skinned mannequin for direct native comparison; ordinary builds include
the sampled motion bank without that mannequin. The source path, GLB hash, CC0 attribution, original
durations and measured travel accompany the build. The adapter preserves C's limb
lengths and accepted forearm meshes. `compare-locomotion` checks new forearm bytes
against the durable v14 lock, independently of which previous version is compared;
its fresh recordings avoid inheriting old playback capture defects.
For a bounded gait repair, the locomotion-only modes capture three standard clips
each for walk and jog, and package only the locomotion domain. The full-cycle test and runtime
validator now reject backward knee flexion; a reachable foot alone is insufficient.

Current status: silhouette/composition, costume identity, B heavy and B impact
development selections made; v14 forearms and the idle-run-v3 repair accepted in
their named scopes. The expanded action set remains a candidate. No GOLDEN
production asset. Engine abstractions remain unchanged until the slice
demonstrates which constraints actually improve its result.

The full motion repair keeps those choices. `universal-combat.ts` transfers the
library jab's joint arcs and small idle weight shifts; source contact is warped to
the actual move startup and separate hit/whiff recoveries. The rising heavy keeps
B's load and release with a bent-elbow withdrawal and rear-toe pivot. The head
tracks independently of the torso. Light/heavy reactions use separate strength
and stun duration, including launch and landing. State transitions advance in
combat time so repeated renders and hitstop cannot advance their pose.

Stopping retains the last gait's pose speed while actual speed and guard weight
settle; changing run to walk and guard simultaneously caused the measured wrist
jump that the new native sequence rejects. WASD runs; Shift+WASD walks at 1.6 m/s
in this 3 m/s slice. This does not retune the canonical game's movement.

`--selected-motion` records idle, walk, jog, light, heavy and both hit reactions
in neutral/gameplay/contact contexts, with strips, without reopening A/B/C taste
competitions. `--all-motion` requires `--reference` at build time and records the
same phases before/source/after plus actual movement/attack transitions; it adds
`animation-review.html`. Library cross/chest-hit clips are narrow motion references,
not replacement heavy intent or approved assets. `--animations-only` packages the
seven animation domains. `archive-corpus.ts <candidate-name> --motion-set` retains
a bounded subset of before/after evidence as BAD diagnosis/CANDIDATE examples.

For the owner's later idle-arm/run-amplitude repair, `capture-motion`,
`compare-locomotion` and `package-review` accept `--idle-run`. This captures idle,
walk and jog with three repeated run/stop comparisons, then packages those three
domains. It does not reopen heavy/impact choices. The actual-source tests sweep
120 stop phases and bound the rejected run extremes; native validation checks
solved elbow continuity and settled elbow height at six stop phases. Wrist-only
checks missed this defect. `archive-corpus <candidate-name> --idle-run` retains
the owner's screenshots, reproduced failure and matched repair evidence.

The [complete animation set workflow](full-set/README.md) extends this consumer
to traversal, all native move IDs, defense/reactions, grapples, and all city weapon
families. Use `--full-actions` to build its playable review scene. The ordinary
small slice remains available for comparisons against the accepted idle/run.
