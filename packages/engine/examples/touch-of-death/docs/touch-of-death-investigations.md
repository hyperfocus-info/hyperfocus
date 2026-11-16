# Touch of Death: 500 bounded investigations

Owner: Touch of Death product contributors. Created 2026-09-28.
Status: investigation backlog; none of these entries is a verified finding or an
instruction to implement a feature. This document owns task dispatch, not game
rules. The [game guide](touch-of-death.md) owns design; the
[delivery ledger](touch-of-death-demo.md) owns recorded acceptance. Retire completed
entries with evidence links and move confirmed outstanding defects to the owning
product backlog. Do not copy this list into another roadmap.

Designed for short, explicit assignments to the requested 5.6 Luna worker. This
does not assume that model identifier is available in the current environment.
Give a worker one ID, not this entire document. Start with investigation; only
assign a small fix once the cause and acceptance condition are clear.

## Dispatch and scope

- One worker owns one hypothesis, one reproduction and one result. Keep ordinary
  patches to one behavior and roughly one to three closely related source files.
  File count is a review heuristic, not permission to cram a redesign into one file.
- Safe initial work: source traces, doc comparisons, screenshots, deterministic
  fixtures, short videos, counters, copy candidates and local A/B prototypes.
- Escalate balance changes, combat formulas, protocol/runtime identity changes,
  persistence migrations, authentication policy, shared architecture, renderer
  rewrites and multi-system bugs. A narrow regression test or research note is
  still a useful completed investigation; do not attempt the large fix.
- Numbers in tasks are source snapshots and boundary leads. Resolve the current
  authored value and canonical contract first; a changed value is not itself a bug.
  Distinguish intended rules, implemented behavior and historical evidence.
- If a named feature is absent, report `not applicable` with search evidence.
  Do not build it merely to complete the task. If a finding duplicates another ID,
  link the shared reproduction and investigate only the distinct claim.
- Finish with `verified issue`, `no issue found`, `inconclusive`, `not applicable`,
  or `duplicate`, plus confidence and the limit of what was checked. No invented
  screenshots, successful tests, CPU counters, player reactions or video evidence.

## Parallel execution

Parallel means independent read/analysis work and isolated experiments, not many
agents editing the same game. Batch size is a resource budget, not all 500 at once.
Start with up to eight read-only workers and up to two isolated lightweight test
workers; reduce these limits if the host cannot sustain them. Run one GPU/browser
capture job per shared GPU by default. A coordinator owns integration.

| Lane | Parallel rule | Deliverable |
| --- | --- | --- |
| Source/research | Parallel reads; each worker gets distinct output paths | Cited source trace, mismatch table or proposal |
| Counter | Separate process/fixture; bounded workload; per-run counters only | Raw counts, normalized workload and parity |
| Authoring | Separate project copy per worker | Command plan, UI evidence and normalized data diff |
| Capture | Reserve browser/GPU; use headless owned automation | Original clip, input tape and evidence manifest |
| A/B | Prepare variants in parallel; compare each pair serially | Control/candidate evidence and decision |
| Fix | Exclusive ownership of touched files; integrate sequentially | Minimal diff, reproduction and targeted validation |

Use immutable snapshots of the current work, including relevant uncommitted files;
a checkout of HEAD alone may omit the actual game. Follow the `branchfs` skill when
executing against uncommitted work without changing normal local state. Never reset
or clean the user's dirty tree. Each run needs its own project copy, database,
storage/browser profile, token/account identities, output directory, and room ID
containing the task ID plus UUID. Do not reuse only a timestamp. Never touch live
accounts or upload evidence to public services as part of these investigations.

Use the `dev-server` skill for managed servers and hidden process ownership.
Workers must not restart a shared relay, replace the canonical export, edit the
canonical project, or migrate a shared database. Dispose owned browsers, sockets,
processes and scratch resources; keep evidence. Claim source-file ownership before
any edit. Conflicts return to the coordinator instead of being resolved by racing
patches. Independent proposals may touch the same conceptual area; patches may not.

## Performance and A/B evidence

Use fixed input tapes, seeds, simulation-tick counts and scene sizes. Primary
parallel-safe metrics are algorithm iterations, collision queries, entity visits,
allocations, copied/encoded bytes, draw calls, resource counts, database operations,
queue bounds and workload scaling. Call simulation ticks and loop iterations by
their real names; they are not hardware CPU cycles.

Hardware cycles and retired instructions are useful only when actual supported
counters are available and attributed to the measured process/workload. Record
CPU, runtime, counter source, privilege/support limitations and background load.
Cycles still vary with cache contention, scheduling and frequency behavior. Run
those comparisons with a reserved measurement slot, serially. If unsupported,
report unavailable and use structural counters; never convert milliseconds or
sampled profiler ticks into claimed cycles.

For every optimization, predeclare A/control, B/candidate, one changed variable,
fixed workload, warmup, repeats, primary counter, correctness invariants and
rejection criteria. First prove behavior parity. Run at least three serial A/B/B/A
blocks from fresh equivalent state; retain every raw result and explain noise.
Compare full workloads, not just a helper. Count instrumentation overhead or keep
identical instrumentation in both variants. No wall-clock/FPS improvement claim
from concurrently running workers. Time may diagnose health, but it does not
decide this backlog's performance fixes. Do not silently lower visual quality,
simulation fidelity or coverage to win a counter.

For presentation A/Bs, use the same build base, inputs, camera, viewport, audio
level and assets except the declared variable. Keep both variants reversible;
do not change canonical defaults before review. For human tests, randomize or
counterbalance order, use neutral prompts, and record participant count, task,
errors, comprehension and preference separately. Small convenience samples give
directional observations, not statistical or retention claims. Simulated users
can find functional obstacles; only real people supply taste and enjoyment evidence.
Reward proposals should improve agency, anticipation and visible accomplishment;
do not add coercive streak penalties, hidden odds or forced engagement loops.

## Worker assignment template

```text
Task: TOD-NNN (paste its single task line).
Mode: investigate; propose at most one isolated small fix.
Snapshot/build: <immutable source + project/export identity>.
Read: root AGENTS.md, nearest README, current rule owning this check.
Owned output: .local/touch-of-death/investigations/TOD-NNN/<run-id>/
Owned editable paths: <none initially, or explicit exclusive paths>.
Fixture: <seed, input tape, starting state, account/room/database isolation>.
Acceptance: <the task's named evidence and explicit pass/fail condition>.
Limits: no balance/protocol/schema/architecture changes; escalate uncertainty.
Return: status, reproduction, expected vs observed, source references,
raw evidence paths, smallest proposed fix, checks run and unresolved limits.
```

Evidence manifest: task/run ID, source snapshot/diff, project and export hashes,
runtime/content identity, environment, seed, input sequence, initial state,
exact command, observed result, artifacts and cleanup status. Videos should show
the full trigger and outcome, with simulation-frame annotations where relevant;
retain original recordings as well as edited comparisons. A screenshot alone
cannot prove a temporal behavior. Redact credentials and recovery-key contents.

Follow the owning implementation skill if a fix is assigned. UI work uses
`app-ui-standard`; editor-project changes use `hyperfocus-editor-agent`; goal-driven
product test sessions use `user-audit`; artifact taste review uses `artifact-review`.
Editor creative actions require visible UI and equivalent command coverage. Engine
research stays framework-neutral; extract only for named real consumers, a repeated
bug/manual workflow, or a measured bottleneck. Route to
[engine performance](../../../docs/developer-performance.md) for its existing evidence contract.

## Starting points and batch order

| IDs | Area | Search/read anchor |
| --- | --- | --- |
| 001–020 | Combat correctness | `packages/engine/src/combat/` |
| 021–040 | Movement and physics | `packages/engine/src/project/3d/combat-interaction/`, `combat-environment/` |
| 041–060 | AI | `packages/engine/src/project/3d/combat-ai/README.md` |
| 061–080 | Training/onboarding | `packages/engine/examples/touch-of-death/host/training/README.md`, `apps/engine-editor/src/scene3d/training/` |
| 081–100 | Replay/determinism | `packages/engine/scripts/combat-determinism/README.md`, `packages/engine/src/runtime/combat-rollback/` |
| 101–120 | Copy | `apps/engine-editor/src/scene3d/tutorial/`, `fight-hud/`, `network/` |
| 121–140 | Lore/city | Game guide; `packages/engine/examples/touch-of-death/src/presentation/city/README.md` |
| 141–160 | Visuals/camera | `packages/engine/examples/touch-of-death/src/presentation/README.md`, city source |
| 161–180 | Audio | `packages/engine/examples/touch-of-death/src/presentation/audio.ts` |
| 181–200 | Accessibility/input | `apps/engine-editor/src/scene3d/input/`, standalone menu source |
| 201–220 | Progression | `packages/engine/examples/touch-of-death/host/progression/README.md` |
| 221–240 | Wardrobe | `apps/engine-editor/src/scene3d/appearance/README.md` |
| 241–260 | Out-of-match satisfaction | Existing Rewards, fighter, replay and result panels |
| 261–280 | Social/queues | `packages/engine/examples/touch-of-death/host/{quick-play,community}/README.md` |
| 281–300 | Accounts/recovery | `packages/engine/examples/touch-of-death/host/{guest-session,profiles}/README.md` |
| 301–320 | Documentation drift | Game guide, delivery ledger, host README |
| 321–340 | Local complexity/defects | One nearby helper and its actual callers |
| 341–360 | Simulation counters | Combat/physics source and existing determinism fixtures |
| 361–380 | Render/audio/asset counters | Presentation source and exported artifact |
| 381–400 | Host/storage counters | `packages/engine/examples/touch-of-death/host/` service owners |
| 401–420 | Editor capability | Combat inspector, commands, `editor-capability-parity.ts` |
| 421–440 | Engine boundary research | Engine guide plus named consumer paths |
| 441–460 | Controlled A/B hypotheses | Existing UI/art source for the specified treatment |
| 461–480 | Video evidence | Existing replay/capture fixtures and delivery evidence |
| 481–500 | Research/test quality | Existing tests and primary external sources where specified |

Read paths above as routing hints; resolve grouped/relative names before opening.
Start independent source tasks across groups 1, 6, 11, 16 and 17. Use verified
findings to select a small reproduction batch, then reserve captures and A/Bs.
Performance candidates follow measured counters; editor and engine proposals stay
research-only until their scope is reviewed. The order below groups ownership,
not importance. External research tasks must actually browse primary sources and
record URLs/dates; this backlog does not claim that research has already happened.



## Combat correctness

- TOD-001: Check jab startup/active/recovery boundaries against the authored preset; output a frame-indexed input/contact trace.
- TOD-002: Check five-frame input buffering at both boundaries during recovery; output accepted/rejected frame cases.
- TOD-003: Check twenty-frame command-window expiry for one directional heavy; output boundary cases and source references.
- TOD-004: Check guard coverage immediately inside/outside the 120-degree arc; output contact outcomes for both seats.
- TOD-005: Check fresh parry on the first and last allowed frames; output a six-frame boundary table.
- TOD-006: Check held guard never becomes a fresh parry on a later strike; output an input-edge trace.
- TOD-007: Check chip damage rounding against chipRatio for one jab and one heavy; output expected/actual health.
- TOD-008: Check guard-break duration against authored guardBreakFrames; output the first legal recovery frame.
- TOD-009: Check parry stamina and guard restoration cannot exceed maxima; output before/after state at near-full resources.
- TOD-010: Check jab contact refunds on hit, block, whiff and repeated contact; output a resource delta matrix.
- TOD-011: Check Drive flurry strikes occur only at authored offsets 0/6/12/18; output strike/contact frame pairs.
- TOD-012: Check jab-link acceptance immediately before/inside/after its cancel window; output boundary cases.
- TOD-013: Check heavy-to-feint cancellation at authored start/end boundaries; output accepted inputs and resulting states.
- TOD-014: Check stringOnly jab links cannot start from neutral; output ordinary input reproduction and state trace.
- TOD-015: Check directional variants resolve consistently when fighters swap sides; output mirrored move IDs.
- TOD-016: Check armored escape consumes only its intended charge and survives eligible contact; output charge/contact traces.
- TOD-017: Check heavy-crushable kick armor with jab versus heavy contact; output paired same-seed combat traces.
- TOD-018: Check simultaneous lethal contacts resolve consistently for reversed seat order; output health and round outcomes.
- TOD-019: Check finishing-hit stop does not award duplicate damage or rewards across repeated frame presentation; output event counts.
- TOD-020: Check a grab interrupted during startup preserves incoming hitstun; output frame trace and a short annotated clip.

## Movement and physics

- TOD-021: Check held-jump minimum and maximum heights with identical starting state; output sampled height curves by simulation frame.
- TOD-022: Check jumping and movement remain independent when both inputs change together; output position and input traces.
- TOD-023: Check diagonal movement magnitude against axial movement over equal simulation frames; output displacement ratios.
- TOD-024: Check landing recovery permits actions on the intended first frame; output grounded/action boundary cases.
- TOD-025: Check wall-run recovery restores only the intended air-dash allowance; output charge transitions.
- TOD-026: Check dash attacks require live dashing after a delayed input arrives; output valid/expired dash cases.
- TOD-027: Check forward/backward dash-attack direction follows current stick rather than launch direction; output mirrored traces.
- TOD-028: Check charged Drive travel changes active acceleration without freezing startup; output phase and velocity samples.
- TOD-029: Check late directional influence applies only within its authored final window; output impulse vectors by input frame.
- TOD-030: Check neutral versus analog grab throws around the .3 deadzone; output release vectors just below/at/above threshold.
- TOD-031: Check grab connection rechecks range after eight startup frames; output an escape-at-boundary reproduction.
- TOD-032: Check walls obstruct grab acquisition at connection time; output clear/obstructed paired captures.
- TOD-033: Check fresh Jump/Dash grab tech at contact, +5 and +6 frames; output outcome matrix for both seats.
- TOD-034: Check pre-held Jump/Dash does not tech a later grab; output input-edge and grip traces.
- TOD-035: Check thrown fighters respect release recovery for seventeen frames; output earliest accepted attacker action.
- TOD-036: Check shallow flood scales walk/sprint/ground dash but preserves attack travel and airborne motion; output paired displacement tables.
- TOD-037: Check repeated fire-boundary crossings do not accelerate damage cadence; output enter/exit/damage frame logs.
- TOD-038: Check fire causes no hitstun, impulse or hitstop; output state deltas from one exposure tick.
- TOD-039: Check round recovery leaves fighters outside surviving collision geometry; output seed, transforms and collision evidence.
- TOD-040: Check glancing high-speed contact near destructible hit volumes for tunneling; output a deterministic input tape and contact trace.

## AI legality and observability

- TOD-041: Trace AI decision inputs for pending-opponent-input access; output the read paths and any unverified boundary.
- TOD-042: Check reaction delay at each documented difficulty using the same visible event; output queued/delivered frame differences.
- TOD-043: Check AI cannot emit a dash attack after its dash permission expires; output delayed-command gate evidence.
- TOD-044: Check AI directional dash role choices against close/far/airborne targets; output observed state and chosen move IDs.
- TOD-045: Check AI back-hop followup releases Drive before repressing; output delivered and queued button edges.
- TOD-046: Check AI travel-charge Heavy hold ends when authored acceleration stops helping; output charge/input traces.
- TOD-047: Check AI held-weapon decisions use the shared variant resolver; output call-path references and one resolved example.
- TOD-048: Check high-level pursuit reacts to visible outward velocity; output mirrored retreat scenarios and chosen inputs.
- TOD-049: Check level-nine pursuit closes continuous backpedaling through ordinary sprint/dash; output separation by simulation frame.
- TOD-050: Check identical seeds reproduce pressure-window and flank choices; output exact tactical-state hashes.
- TOD-051: Check different tactical seeds vary choices without changing legal action rules; output a bounded seed comparison.
- TOD-052: Check two observed contactless attacks discourage repeated commitment only temporarily; output memory entry/expiry frames.
- TOD-053: Check blocked and parried attacks are not counted as contactless failures; output recorder classifications.
- TOD-054: Check attack insights count actual starts rather than queued intentions; output queue/start/count reconciliation.
- TOD-055: Check shared recorders attribute contacts to the correct fighter; output a two-AI event table.
- TOD-056: Check attack-drought creation at 179/180/181 frames; output boundary snapshots and recorded reason.
- TOD-057: Check move, fighter and drought histories respect 16/16/32 bounds; output retained record counts after overflow.
- TOD-058: Check hazard-aware AI ignores inactive and occluded zones; output route choices with visibility held constant.
- TOD-059: Check AI hazard awareness respects level and 24-metre range; output just-inside/outside route comparisons.
- TOD-060: Check a necessary fire crossing remains possible and deals ordinary damage to AI; output route, exposure and health traces.

## Training and onboarding

- TOD-061: Compare training README admission version statements with protocol/schema implementation; output a precise mismatch table.
- TOD-062: Check training rejects incompatible contentId before play; output host response and visible recovery path.
- TOD-063: Check training rejects incompatible trainingVersion before appearance data is applied; output rejection evidence.
- TOD-064: Check a second human joining starts a fresh attempt at frame zero; output attempt IDs and starting snapshots.
- TOD-065: Check reset consent accepts only the other authenticated partner; output proposer/partner response cases.
- TOD-066: Check reset requests expire at the documented boundary; output clock-controlled acceptance cases.
- TOD-067: Check declining a reset leaves the current attempt playable; output state and short UI clip.
- TOD-068: Check accepting swap reverses both authenticated seats exactly once; output seat maps before/after.
- TOD-069: Check old-attempt inputs cannot affect a reset attempt; output injected stale input and unchanged-state proof.
- TOD-070: Check disconnect cancels pending training consent; output proposal state and reconnect UI evidence.
- TOD-071: Check training.revision fences out-of-order lifecycle snapshots; output reordered snapshot outcomes.
- TOD-072: Check appearance changes during practice match current documented freeze/update rules; output policy references and a clip.
- TOD-073: Check training mode never publishes ratings or winner claims; output observed message types for one completed attempt.
- TOD-074: Check local training reset restores the intended health, stun and positions through engine rules; output state ownership trace.
- TOD-075: Inventory visible instructions for movement, Jump, Drive and Interact against actual bindings; output missing or stale labels.
- TOD-076: Check one newcomer can discover a grab and a grab escape using existing UI; output action count and recorded confusion points.
- TOD-077: Check one newcomer can distinguish held guard from fresh parry using existing feedback; output a short evidence clip.
- TOD-078: Check directional move explanations match the actual direction resolver after side switches; output text-to-behavior pairs.
- TOD-079: Draft an A/B replacing one paragraph of parry instruction with a six-frame demonstration; output paired mockups and comprehension criterion.
- TOD-080: Draft an A/B for one failed-training-attempt hint using the recorded failure cause; output concise variants and retry-success metric.

## Replay and network determinism

- TOD-081: Check replay metadata records the combat-v18 runtime identity; output metadata and loader comparison.
- TOD-082: Check recordings from an incompatible runtime fail with a recoverable explanation; output rejection/UI evidence.
- TOD-083: Check repeated replay of one seed/input tape yields identical complete checkpoint hashes; output frame/hash table.
- TOD-084: Check Bun/browser parity for launcher/chase/followup contacts in the existing determinism fixture; output exact first-divergence report.
- TOD-085: Check the native-math negative control still detects divergence; output failing frame and changed state fields.
- TOD-086: Check rollback across a fresh parry restores button edges and resources exactly; output baseline/delayed hash comparison.
- TOD-087: Check rollback across Drive release/repress preserves AI reaction queues; output queue and simulation hashes.
- TOD-088: Check rollback across a grab-tech boundary preserves grip state; output baseline/delayed frame comparison.
- TOD-089: Check rollback across the first earned KO restores host collision masks correctly; output masks and full checkpoint hashes.
- TOD-090: Check corpse checkpoint restore ordering matches documented host-transform ownership; output call-order references.
- TOD-091: Check replay seeking through a second KO restores corpse contacts exactly; output solver/contact equality evidence.
- TOD-092: Check rollback history bounds release obsolete corpse worlds; output retained checkpoint/world counts over repeated rounds.
- TOD-093: Check portable corpse capture is not mistaken for transferable solver history; output persistence/rollback call-site classification.
- TOD-094: Check delayed inputs converge through fire damage and flood movement; output exact state comparison at a fixed frame.
- TOD-095: Check replay seeking restores fire cadence and water-entry debounce; output event-frame comparison.
- TOD-096: Check pause and repeated presentation do not advance hazard simulation cadence; output live-step versus event counts.
- TOD-097: Check all relay routes admit Interact consistently with ordinary move commands; output private/training/community/Quick Play/judge matrix.
- TOD-098: Check reconnect within grace retains the original seat and match identity; output authentication and seat snapshots.
- TOD-099: Check explicit leave cannot reattach through reconnect grace; output terminal-departure message sequence.
- TOD-100: Check exported rematch starts a new match while replaying the previous match remains stable; output match IDs, hashes and a two-client clip.


## Concise UI copy and show-not-tell

- TOD-101 — Audit the first sound prompt for one clear choice per control; deliver a screenshot and minimal copy diff proposal.
- TOD-102 — Compare Start match wording with the displayed AI difficulty; report any ambiguity with menu and resulting-match evidence.
- TOD-103 — Audit guided-fight introduction for sentences that repeat visible actions; propose deletions with annotated screenshots.
- TOD-104 — Check each guide phase names the actual current input, including remapped controls; output a label-to-binding table.
- TOD-105 — Check skipped guide phases are described as skipped rather than mastered; capture skip and later progress states.
- TOD-106 — Review guide-loss text for actionable retry guidance without promising success; provide the current text and one shorter candidate.
- TOD-107 — Compare Practice guidance with the removed side dash-attack bucket; cite each obsolete instruction found or the checked locations.
- TOD-108 — Check back-hop follow-up guidance states that Drive needs a fresh press; attach the instruction and input-event example.
- TOD-109 — Audit Interact hints for grab, pickup, throw and empty reach context; output four labeled screenshots.
- TOD-110 — Check gray unavailable timing feedback is never described as early or late; capture one unavailable attempt and its explanation.
- TOD-111 — Review damage versus feedback wording so stronger effects do not falsely promise extra damage; produce a claim-to-rule table.
- TOD-112 — Check Rematch and Next opponent labels communicate retained versus rerolled AI difficulty; provide menu-to-result evidence.
- TOD-113 — Audit Quick Play connection warnings for a concrete recovery action and unsupported blame; propose minimal replacement strings.
- TOD-114 — Check unrated interruption copy does not call bilateral quality termination an attributed loss; attach result and rating evidence.
- TOD-115 — Review replay version-mismatch copy for the incompatible version and next usable action; provide one concise draft.
- TOD-116 — Audit wardrobe save/equip confirmation for duplicate filler and unclear persistence claims; capture before, confirmation and reload.
- TOD-117 — Check upload copy clearly states immediate sharing using concise language; supply the visible consent text and sharing-state evidence.
- TOD-118 — Review AI insights labels for observations presented as inferred causes or automatic learning; provide a supported wording diff.
- TOD-119 — Inventory internal implementation labels exposed in ordinary menus; deliver exact strings, screenshots and player-facing replacements.
- TOD-120 — Audit the five longest player-facing help strings for removable filler; provide exact current/proposed text and prove every input condition remains stated or visibly demonstrated.

## Lore and inhabited-city representation

- TOD-121 — Compare visible setting text with elite ownership above governments; report contradictory claims with canonical citations.
- TOD-122 — Inspect existing clues for invented memory-erasure mechanisms; inventory supported, ambiguous and unsupported statements without adding lore.
- TOD-123 — Review environmental clues for compulsory exposition; map which clues can be ignored while normal play continues.
- TOD-124 — Check city signage presents inhabited places rather than explicit combat-room menus; deliver an annotated sign inventory.
- TOD-125 — Inspect surveillance props for an ordinary-infrastructure appearance; capture existing examples and flag unusually explicit exposition.
- TOD-126 — Compare charcoal architecture and orange public infrastructure against the approved palette; provide a district contact sheet.
- TOD-127 — Audit red environmental accents for competing non-danger meanings; output screenshots paired with each prop's actual behavior.
- TOD-128 — Audit blue institutional technology cues for consistent use across existing districts; provide a material-and-prop inventory.
- TOD-129 — Check white pickup outlines remain distinguishable from ordinary white city markings; record three cluttered pickup views.
- TOD-130 — Compare district silhouettes with labels hidden; create a blind screenshot set for human district recognition.
- TOD-131 — Check transit and market details imply usable public/service spaces; identify existing believable examples and specific disconnected props.
- TOD-132 — Inspect residential scenes for everyday-use details already represented by authored props; deliver evidence without proposing a new population system.
- TOD-133 — Check construction warning presentation matches the existing collapse hazard; pair warning-state images with the actual collapse sequence.
- TOD-134 — Inspect industrial and utility clues for grounded machinery rather than supernatural explanations; report only concrete contradictions.
- TOD-135 — Check the concealed utility clue is discoverable without a mandatory investigation step; record the ordinary traversal route past it.
- TOD-136 — Verify scenery occupants do not read as additional attackable fighters; annotate silhouette, placement and targeting evidence.
- TOD-137 — Inspect the apartment breach for a meaningful adjacent space rather than an unexplained void; capture both sides of the opening.
- TOD-138 — Check the underground passage visually communicates its entrances and connected route; produce a single traversal clip and marked map.
- TOD-139 — Verify visible arena damage survives round recovery as the city-memory premise specifies; provide matched pre/post-round views.
- TOD-140 — Design a one-prop A/B test for an existing city clue's visibility; retain lore and collision geometry and score noticeability without prompting.

## Visual and camera evidence

- TOD-141 — Inventory the current authored starting courts and capture each using the same resolution and settings; deliver a framing contact sheet with build identity.
- TOD-142 — Check countdown-to-play camera continuity for a visible snap; provide frame-indexed video around the transition.
- TOD-143 — Check both fighters remain visible at maximum tested horizontal separation; provide replay inputs and worst-framing screenshots.
- TOD-144 — Check high launcher exchanges retain both fighters within useful framing; record one fixed replay with HUD-safe bounds marked.
- TOD-145 — Inspect camera behavior beneath the roof catwalk; capture any occlusion or clipping with the exact scene position.
- TOD-146 — Check underground stairs for camera penetration or abrupt clearance movement; deliver a repeatable traversal clip.
- TOD-147 — Verify moving train occlusion fades scenery without unnecessary camera retraction; compare camera traces and paired frames from one replay.
- TOD-148 — Inspect static supporting-floor clearance for underside pops; attach the smallest route and camera-position evidence.
- TOD-149 — Check faded obstacles retain readable physical surfaces and shadows; provide opaque/faded pairs at identical positions.
- TOD-150 — Inspect remaining legacy bright box-edge cages near fighter ankles; report entity IDs and screenshots if present.
- TOD-151 — Compare attack startup silhouettes for forward, back and neutral dash roles; produce equal-scale keyframe sheets.
- TOD-152 — Check impact particles originate at actual contacts and follow force direction; annotate five fixed-replay contacts.
- TOD-153 — Inspect dust placement during stairs, landing and airborne movement; report mismatched emitter origins with frame evidence.
- TOD-154 — Check low-stamina hunch and grayscale communicate depletion before critical values; capture a fixed resource-level sequence.
- TOD-155 — Inspect low-health effects for obscured spacing or defensive resources; deliver matched full-health/critical screenshots.
- TOD-156 — Verify held weapons follow the blended victory pose; capture the final strike through celebration for two weapon types.
- TOD-157 — Inspect get-up separation for supported continuous motion rather than sideways snapping; provide position samples and video.
- TOD-158 — Check terminal loser and winner poses remain correct when the last strike launches both fighters; provide one reproducible finish.
- TOD-159 — Design an A/B camera-shake amplitude test using identical replay inputs; score target tracking and count obscured simulation frames.
- TOD-160 — Design an A/B impact-particle density test with identical combat state; compare contact recognition and particle/draw counts, not elapsed runtime.

## Audio and combat feedback

- TOD-161 — Inventory authored combat audio cue bindings against combat-audio-config.ts; report missing or unused bindings with asset IDs.
- TOD-162 — Compare ordinary and alternate footstep cues for unwanted repetition; deliver a fixed-route recording with event counts.
- TOD-163 — Check sprint audio ends when sprint input or eligibility ends; provide the input and audio-event sequence.
- TOD-164 — Compare light and heavy landing cues against actual landing conditions; provide paired clips and triggering state.
- TOD-165 — Check swing audio occurs on attacks that whiff without falsely playing impact cues; capture a no-contact attack sequence.
- TOD-166 — Compare hit, block and parry recordings for recognizable differences; create blinded samples for human labeling.
- TOD-167 — Check parry feedback appears at hands and tech feedback at the collision surface; deliver synchronized audio/video annotations.
- TOD-168 — Compare guard-depletion fractures with guard-break audio onset; provide frame-aligned resource, visual and cue evidence.
- TOD-169 — Check counterhit, launch and death feedback remain distinguishable within busy combat; provide three labeled fixed-replay excerpts.
- TOD-170 — Inspect wood and metal weapon contacts for the correct material cue; output a weapon-material-to-event table and clips.
- TOD-171 — Check weapon break audio fires once per break rather than repeating while debris moves; report cue counts and break events.
- TOD-172 — Check environmental warning and collapse sounds use their separate bindings; capture a complete warning-to-collapse sequence.
- TOD-173 — Verify traffic contacts use the intended heavy-contact presentation; pair one traffic strike with its cue log.
- TOD-174 — Check nearby-fire one-shots stay bounded during continuous exposure; report contact and sound-event counts per simulation-frame interval.
- TOD-175 — Check water-entry audio retriggers on genuine re-entry without repeating every grounded frame; provide three-entry event evidence.
- TOD-176 — Inspect rollback replay for duplicate impact sounds; compare confirmed combat-event IDs with emitted cue counts.
- TOD-177 — Check music, SFX and voice controls independently affect their intended channels; provide recorded level comparisons and setting values.
- TOD-178 — Check countdown and fight cues align with visible match states; deliver frame-indexed video with cue-event annotations.
- TOD-179 — Design an A/B music-gain test holding replay and SFX gain constant; score critical-cue recognition using blinded samples.
- TOD-180 — Design an A/B cue-mix test for one busy exchange; measure clipping, peak levels and cue recognition without claiming simulated human preference.

## Accessibility and input

- TOD-181 — Check the sound-first prompt is fully operable by keyboard alone; capture focus order and the route into the optional guide.
- TOD-182 — Check controller navigation reaches settings, phase skip and whole-guide skip; record input events and focused controls.
- TOD-183 — Verify menu confirmation presses do not leak into the opening combat action; provide menu and first-play-frame input evidence.
- TOD-184 — Inspect pause/settings access during each guided phase; output a phase-by-phase availability table.
- TOD-185 — Check focus returns to a meaningful control after closing settings; capture keyboard and controller routes separately.
- TOD-186 — Check text remains readable at 200% browser zoom on the exported game; report clipped controls with viewport dimensions.
- TOD-187 — Inspect connected-controller phone layout for clipped menus and HUD; report device evidence or explicitly mark physical-device testing unavailable.
- TOD-188 — Check controller disconnect presents a clear recovery path without stuck held inputs; capture disconnect, reconnect and resumed control.
- TOD-189 — Compare left and right fighter resource readability against bright and dark city backgrounds; deliver contrast-oriented screenshots.
- TOD-190 — Check early, late, on-time and unavailable feedback has usable distinctions beyond color alone; inventory current shape/text/motion cues.
- TOD-191 — Verify reduced-motion settings affect the documented shake, zoom and blur behaviors; compare identical replay excerpts and configuration values.
- TOD-192 — Check reduced-motion presentation preserves the distinction between hit, block and parry; create matched feedback samples for review.
- TOD-193 — Inspect flashing and bloom in the busiest existing effects sequence; document frame luminance changes without asserting medical safety.
- TOD-194 — Check mute/deafen and denied microphone permission leave ordinary play and room navigation usable; record the complete recovery journey.
- TOD-195 — Inspect keyboard bindings for labels that disagree with current actions; output a binding-to-visible-prompt comparison.
- TOD-196 — Check analog stick release and small neutral drift do not leave grab/DI intent visually stuck; record raw input and interpreted action states.
- TOD-197 — Verify replay seek and either-side takeover remain reachable with controller-only navigation; provide a complete short evidence clip.
- TOD-198 — Check Practice diagnostics are optional and do not cover required controls at a small supported viewport; provide diagnostics-on/off screenshots.
- TOD-199 — Design an A/B timing-cue shape test preserving timing windows and colors; score recognition using identical attempts and human review.
- TOD-200 — Design an A/B focus-indicator visibility test on one existing menu; hold navigation behavior fixed and record selection errors per completed route.


## Rewards and progression correctness

Anchors: `packages/engine/examples/touch-of-death/host/progression/README.md`, `apps/engine-editor/src/scene3d/rewards/{model,panel,client}.ts`.

- TOD-201 — Compare completed-set coin grants against the documented 40 plus 20 for winning; output a device/account outcome matrix.
- TOD-202 — Check spectator, replay, training and no-contest reward exclusion separately; output before/after balances and result identities.
- TOD-203 — Check a daily claim immediately before and after UTC rollover with an injected clock; output claim receipts and balances.
- TOD-204 — Check consecutive-day bonus progression through its 110-coin cap; output exact expected/actual amounts.
- TOD-205 — Check a missed day resets only the daily bonus; output currency, collection and achievement state diffs.
- TOD-206 — Check repeated daily-claim request IDs cannot grant twice; output a receipt and balance trace.
- TOD-207 — Check wheel threshold values with controlled random inputs against advertised odds; output boundary cases, without statistical timing claims.
- TOD-208 — Check wheel odds remain visible before the player commits a spin; output a short exported-game video.
- TOD-209 — Check wheel access before claiming the daily reward matches visible guidance; output a UI/state transition table.
- TOD-210 — Check a box draws only uncollected options with controlled random inputs; output pool membership and selected-item evidence.
- TOD-211 — Check an exhausted box pool spends no coins and provides a useful next action; output state diff and screenshot.
- TOD-212 — Check insufficient currency cannot produce a box debit or item; output rejected-command state diff.
- TOD-213 — Check each of the four achievements becomes claimable at its exact threshold; output threshold-minus-one/threshold cases.
- TOD-214 — Check achievement claims remain single-use after reopening storage; output persisted receipt evidence.
- TOD-215 — Check loss of an online reward response retains the same retry identity; output request sequence and final balance.
- TOD-216 — Check a retried old claim returns current balance after a later set reward; output ordered receipt/balance evidence.
- TOD-217 — Check two-player set grants roll back together on an injected storage failure; output both account snapshots.
- TOD-218 — Check device rewards never populate a fresh host account balance; output isolated-device/account snapshots.
- TOD-219 — Check locked get-up ownership is enforced both by wardrobe controls and profile publication; output paired UI/API evidence.
- TOD-220 — Compare SQLite and PostgreSQL reward contract tests for missing equivalent scenarios; output a coverage-gap list without provisioning services.

## Wardrobe, identity and collection delight

Anchors: `apps/engine-editor/src/scene3d/appearance/README.md`, `wardrobe-pages.ts`, `packages/engine/examples/touch-of-death/host/profiles/README.md`, `packages/engine/examples/touch-of-death/host/uploads/README.md`.

- TOD-221 — Check every catalog slot is reachable through the horizontal wardrobe tabs; output a slot-to-tab inventory and navigation video.
- TOD-222 — Check Q/E typing in the name and outfit fields never changes category; output keyboard evidence.
- TOD-223 — Check L1/R1 navigation keeps the selected wardrobe tab visible at narrow widths; output controller video.
- TOD-224 — Check Save, Cancel and preview remain visible for the largest option group; output desktop/narrow screenshots.
- TOD-225 — Check Cancel and Escape discard all draft appearance changes; output saved-state diff and reopening video.
- TOD-226 — Check a failed wardrobe save retains the draft for retry; output fault-injected before/after screenshots.
- TOD-227 — Check all three named outfit slots survive reload independently; output slot contents before and after reload.
- TOD-228 — Check an outfit containing an unowned get-up cannot bypass collection locking; output load/save/publication outcomes.
- TOD-229 — Check intro and victory previews match the corresponding live authored poses; output matched-frame comparison clips.
- TOD-230 — Check previewing draft effects does not mutate the active fight frame; output frame-state diff across preview open/close.
- TOD-231 — Check preview failure restores the original scene frame; output a bounded injected-render-failure reproduction.
- TOD-232 — Check silhouette readability for each existing clothing choice in the same arena/camera; output a labeled contact sheet.
- TOD-233 — Check existing palette choices remain distinguishable against the same arena background; output paired fighter screenshots.
- TOD-234 — Check option labels distinguish visually identical-looking thumbnails; output confusing pairs with concise label alternatives.
- TOD-235 — Check first online import preserves the saved outfit while substituting an unowned get-up; output device/host field diffs.
- TOD-236 — Check unsaved wardrobe drafts never publish on first online join; output profile payload and resulting appearance.
- TOD-237 — Check collection Equip visibly changes the saved fighter but does not silently publish online; output a two-surface video.
- TOD-238 — Check new guest display names remain stable after reload and restart; output name snapshots without exposing credentials.
- TOD-239 — Check uploaded images appear on their intended material without UV distortion; output standard-grid image screenshots per existing target.
- TOD-240 — Check removed or rejected equipped images clear the corresponding appearance; output two-client invalidation video and metadata diff.

## Out-of-match motivation and satisfaction

Anchors: existing Rewards, Your fighter, outfit previews, replay controls and Quick Play result controls. A/B tasks produce reviewable variants and a comparison protocol, not new progression systems.

- TOD-241 — Trace the first completed set to the first visible reward acknowledgement; output video with every required click counted.
- TOD-242 — Check whether a first loss communicates earned coins as clearly as a first win; output equivalent result-screen captures.
- TOD-243 — Compare current reward reveal copy with one concise alternative; output an A/B mockup and comprehension question.
- TOD-244 — Compare current collection reveal with a larger existing-item preview; output two local mockups and an item-recognition measure.
- TOD-245 — Compare current collection-to-Equip placement with one direct-action arrangement; output mockups and navigation-step counts.
- TOD-246 — Check whether players can inspect earned cosmetics after declining another match; output the existing exit-to-wardrobe journey.
- TOD-247 — Check whether the next permanent achievement is understandable without reading all achievement copy; output annotated screenshots.
- TOD-248 — Compare achievement progress shown as current text versus a compact count; output A/B mockups with the same reward values.
- TOD-249 — Check claimed achievements still communicate permanent accomplishment after reload; output claimed/unclaimed screenshot pairs.
- TOD-250 — Audit missed-day messaging for guilt or implied lost possessions; output exact strings and neutral concise replacements where justified.
- TOD-251 — Check the used daily-wheel state clearly permits leaving without suggesting another paid attempt; output visible copy and available controls.
- TOD-252 — Check daily UTC reset guidance is understandable across two selected time zones; output conversion/comprehension cases without changing reward tuning.
- TOD-253 — Compare current completed-collection state with a fighter-preview-led state; output A/B mockups and player preference prompts.
- TOD-254 — Check whether opening Rewards during exploration interrupts or obscures a desired wardrobe action; output click-path evidence.
- TOD-255 — Compare current outfit-save acknowledgement with an immediate saved-look thumbnail; output reviewable variants using the same outfit.
- TOD-256 — Check existing entrance/victory previews offer satisfying self-expression without needing a match; output a short preview-session video.
- TOD-257 — Compare the current post-set replay action placement with one clearer placement; output A/B mockups and replay-discovery success criteria.
- TOD-258 — Check existing replay sharing copy explains what the saved file contains with minimal words; output exact text and a shorter accurate draft.
- TOD-259 — Identify one existing noncombat customization choice supported by documented lore; output the source-to-visual mapping and any representation gap.
- TOD-260 — Record a voluntary five-action out-of-match session using only existing features; output video, action counts and observed dead ends, without retention claims.

## Social, Quick Play and community

Anchors: `packages/engine/examples/touch-of-death/host/quick-play/README.md`, `packages/engine/examples/touch-of-death/host/community/README.md`, `apps/engine-editor/src/scene3d/network/{social-panel,quick-play/panel}.ts`.

- TOD-261 — Check Online Quick Play and local AI Quickmatch labels make opponent type clear; output entry-screen screenshot and concise alternatives if needed.
- TOD-262 — Check canceling search before assignment removes the ticket; output queue state and UI evidence.
- TOD-263 — Check cancellation racing with assignment shows the assigned match instead of a false cancellation; output deterministic event trace.
- TOD-264 — Check accept/decline controls remain usable with keyboard and controller; output one video per input method.
- TOD-265 — Check the fifteen-second acceptance expiry displays an explicit next action; output injected-clock state sequence.
- TOD-266 — Check declining a match never silently starts another search; output queue/UI state trace.
- TOD-267 — Check incompatible region or content identities never pair despite widened rating tolerance; output policy fixture results.
- TOD-268 — Check equal candidate choices preserve the documented oldest-viable-player policy; output deterministic ticket fixtures.
- TOD-269 — Check result rating deltas appear only after durable completion; output fault-injected save-state screenshots.
- TOD-270 — Check Play again starts a deliberate fresh search after a result; output result-to-search video and ticket IDs.
- TOD-271 — Check a host interruption shows no rating change or invented winner; output account and result-state diffs.
- TOD-272 — Check community queue order after a normal winner-stays result matches documented rotation; output three-player event trace.
- TOD-273 — Check temporarily disconnected community members are skipped without losing reserved membership prematurely; output injected-clock queue states.
- TOD-274 — Check community restart clears readiness and restores eligible queue order; output persistence/reopen state comparison.
- TOD-275 — Check queue/ready write failures keep actionable feedback until a later successful action; output UI screenshots across background updates.
- TOD-276 — Check Enter sends chat while focused text input never moves a fighter; output controlled two-client video.
- TOD-277 — Check chat text renders markup-like input literally; output local hostile-string fixture and rendered screenshot.
- TOD-278 — Check mute and block differ as documented across two rooms; output three-account visibility matrix.
- TOD-279 — Check reporting a retained message preserves its real host content and clearly says unreviewed; output redacted record and UI evidence.
- TOD-280 — Check leaving a room revokes image/chat access while retaining social preferences; output membership and reconnect evidence.

## Accounts, persistence and recovery

Anchors: `packages/engine/examples/touch-of-death/host/guest-session/README.md`, `packages/engine/examples/touch-of-death/host/profiles/README.md`, `packages/engine/examples/touch-of-death/host/README.md`.

- TOD-281 — Check expired leases and unavailable guest identities show distinct recovery guidance; output response-code-to-copy mapping.
- TOD-282 — Check a rejected identity request never silently creates a replacement guest; output cookie metadata and identity-state evidence, with secrets redacted.
- TOD-283 — Check clearing a test guest cookie creates a new identity without transferring rewards or rating; output anonymized account snapshots.
- TOD-284 — Check recovery preparation preserves the previously active key until confirmation; output isolated-service acceptance matrix.
- TOD-285 — Check an expired pending recovery key cannot replace the active key; output injected-clock prepare/confirm results.
- TOD-286 — Check the recovery download explains the original-host requirement concisely; output file metadata and UI copy audit without key contents.
- TOD-287 — Check canceling before recovery confirmation does not claim protection is active; output canceled-journey video.
- TOD-288 — Check confirmed recovery restores profile, rating, collection and social preferences together; output anonymized state comparison.
- TOD-289 — Check a recovery file from another host is rejected with useful guidance; output two-isolated-host results.
- TOD-290 — Check lost recovery responses can retry the same key successfully; output request sequence without credential values.
- TOD-291 — Check failed connection eviction prevents recovery from publishing a fresh cookie; output injected-failure response metadata.
- TOD-292 — Check recovery revokes old leases and active access before the replacement session becomes usable; output ordered lifecycle trace.
- TOD-293 — Check concurrent restores leave only the final cookie valid; output deterministic two-request validity results.
- TOD-294 — Check profile stale-revision failures preserve local edits and explain retry; output two-edit conflict video and revisions.
- TOD-295 — Check an uncertain profile save can retry without duplicate revisions; output request/receipt/revision trace.
- TOD-296 — Check initial-profile storage failure does not consume a fighter seat; output admission failure and room-capacity state.
- TOD-297 — Check duplicate-login messaging describes replacement and the next usable action; output two-browser sign-in sequence.
- TOD-298 — Check Clerk-configured mode disables guest recovery without implying guest accounts were migrated; output discovery/UI contract comparison.
- TOD-299 — Check unreadable device appearance storage blocks accidental default publication; output injected-corruption admission evidence.
- TOD-300 — Compare documented restart durability against each existing account store's reopen coverage; output a profile/rating/reward/social/upload/recovery coverage table.


## 16. Documentation against implementation — source lane

- TOD-301 — Compare the documented runtime identity with the current identity constant and exported artifact; report which claims are historical versus stale.
- TOD-302 — Compare the controls table against default bindings; list mismatches with source locations.
- TOD-303 — Compare documented move costs with authored project values; produce a value/source table without retuning.
- TOD-304 — Check the Random AI label against its seeded distribution; report whether the documented rare level-9 outcome matches code.
- TOD-305 — Trace “once per round” escape wording to reset conditions; document any contradictory help text.
- TOD-306 — Compare directional guard explanations with the actual angle convention; attach a diagram derived from a fixture.
- TOD-307 — Compare weapon damage and chip claims against both light and heavy move data; record exact arithmetic.
- TOD-308 — Compare grapple-tech help with the fresh-press admission rule; identify wording that implies holding works.
- TOD-309 — Check the advertised three-second post-KO window against simulation ticks and pause exclusions; explain the clock used.
- TOD-310 — Compare persistent-round claims with reset fields; produce a retained/reset state table.
- TOD-311 — Check recovery-key instructions against activation requirements; identify any path that implies download alone activates recovery.
- TOD-312 — Compare reconnect documentation with page reload and host restart behavior; cite the precise supported boundary.
- TOD-313 — Compare spectator capacity and retained-history claims with current configuration; distinguish defaults from host overrides.
- TOD-314 — Check voice-report wording against stored metadata; flag any suggestion that audio is recorded or reviewed.
- TOD-315 — Check replay documentation for uploaded artwork omissions; identify places promising unsupported fidelity.
- TOD-316 — Compare shared-image visibility language against hide, block and revoke behavior; return one truth table.
- TOD-317 — Check portable-host instructions for checkout-only paths; verify each referenced packaged file exists.
- TOD-318 — Audit current game-guide links for missing targets and obsolete anchors; return exact broken links.
- TOD-319 — Classify release-ledger statements as historical evidence or current guarantees; propose labels only where readers could confuse them.
- TOD-320 — Trace one documented acceptance command end-to-end; report stale arguments, working-directory assumptions and expected outputs.

## 17. Local complexity and obvious code defects — source lane

- TOD-321 — Inspect one combat input adapter for duplicate normalization; show whether both passes can change the same value.
- TOD-322 — Inspect one menu handler for unreachable branches; provide a call-path proof before proposing deletion.
- TOD-323 — Find one repeated authored-ID literal in city setup; establish whether it represents one identity or coincidental text.
- TOD-324 — Inspect fighter appearance setup for mutation of shared material references; reproduce with two contrasting outfits.
- TOD-325 — Check setup helpers for partial mutation before validation fails; retain a failing declaration fixture if found.
- TOD-326 — Inspect one optional numeric setting for truthiness defaults that discard zero; test omitted, zero and positive values.
- TOD-327 — Inspect one bounded numeric setting for NaN/infinity admission; report validator and runtime behavior separately.
- TOD-328 — Check one state switch for an unhandled terminal case; give a minimal event sequence reaching it.
- TOD-329 — Inspect one async menu action for duplicate submission; capture resulting requests and state transitions.
- TOD-330 — Check one event listener owner for balanced removal on teardown; count registrations across repeated mounting.
- TOD-331 — Check one subscription callback for stale selected-fighter state; reproduce by switching fighters before completion.
- TOD-332 — Inspect error catches on one save path for swallowed failures; demonstrate whether success UI appears incorrectly.
- TOD-333 — Inspect one array mutation during iteration in gameplay code; prove whether elements can be skipped.
- TOD-334 — Check one nearest-target comparison for deterministic tie handling; replay equal-distance candidates in different insertion orders.
- TOD-335 — Check one degree/radian boundary in camera or combat authoring; compare a known right-angle fixture.
- TOD-336 — Check one local/world coordinate conversion used by tools; compare translated and rotated scene fixtures.
- TOD-337 — Inspect one non-null assertion on imported project data; trace validation and retain a malformed-input reproduction if reachable.
- TOD-338 — Find one helper with a single trivial caller; propose inlining only if it removes indirection without mixing responsibilities.
- TOD-339 — Inspect one large condition for equivalent duplicate predicates; provide a truth table before simplifying.
- TOD-340 — Find one unused compatibility branch; identify the last supported producer before recommending removal or retention.

## 18. Simulation work budgets — counter lane

- TOD-341 — Count broadphase candidate pairs per tick in sparse and dense city fixtures; report scaling against active bodies.
- TOD-342 — Count narrowphase tests per confirmed contact; identify repeated tests for the same pair within one tick.
- TOD-343 — Count swept-collision iterations for fast traffic impacts; verify a fixed cap and preserved contact outcomes.
- TOD-344 — Count static-collider visits while both fighters idle; compare with the same scene during movement.
- TOD-345 — Count grapple candidate evaluations per Interact press; check whether distant props receive unnecessary exact tests.
- TOD-346 — Count pickup shaft-distance calculations per prompt update; compare with actual pickup execution work.
- TOD-347 — Count AI observation queries per decision tick; identify duplicate world reads without changing observation access.
- TOD-348 — Count AI candidate moves evaluated by difficulty; compare output legality and bounded work on identical snapshots.
- TOD-349 — Count wall-traversal surface queries per airborne tick; report redundant queries with identical inputs.
- TOD-350 — Count ragdoll constraint solves per body and tick; compare awake and settled post-KO states.
- TOD-351 — Count moving-platform support checks for stationary riders; test whether unrelated platforms increase work linearly.
- TOD-352 — Count destructible-panel contact checks before and after breakage; verify broken inactive geometry stops participating appropriately.
- TOD-353 — Count snapshot objects and arrays created per fixed simulation window; separate steady state from initialization.
- TOD-354 — Count bytes copied when retaining rollback history; report bytes per fighter per retained tick.
- TOD-355 — Count resimulated ticks for a scripted late-input sequence; compare necessary rewind depth with actual replay work.
- TOD-356 — Count retained interaction-history entries over repeated practice resets; establish whether retention has a bound.
- TOD-357 — Count temporary vector allocations in one hot contact helper; propose one local reuse experiment with aliasing checks.
- TOD-358 — Count full entity scans performed by one confirmed simulation step; attribute each scan to its caller.
- TOD-359 — Count simulation work with optional diagnostics enabled and disabled; verify identical state hashes at every tick.
- TOD-360 — Compare 1x, 2x and 4x prop fixtures using operation counts; identify the first unexpectedly superlinear subsystem.

## 19. Rendering, audio and asset budgets — counter lane

- TOD-361 — Count draw calls for the same saved camera with item outlines enabled and disabled; retain matching screenshots.
- TOD-362 — Count shadow-casting objects visible and outside the camera; report avoidable submissions without changing the scene.
- TOD-363 — Count rendered triangles for base fighters versus wardrobe variants; identify a single disproportionate cosmetic.
- TOD-364 — Count unique materials after repeated item-outline authoring; verify reapplication does not multiply material entries.
- TOD-365 — Count GLB bytes and mesh primitives for one cooked fighter detail; compare a small geometry candidate with silhouette evidence.
- TOD-366 — Count decoded texture bytes per wardrobe preview; check whether closing the preview releases its owned resources.
- TOD-367 — Count GPU resources across repeated match/menu transitions; distinguish retained shared assets from leaked instances.
- TOD-368 — Count effect entities evaluated after their visible lifetime ends; compare with the intended fixed pool.
- TOD-369 — Count matrix recomputations for static city objects per frame; locate repeated work without proposing a renderer rewrite.
- TOD-370 — Count DOM mutations from unchanged HUD values; compare a fixed idle replay with resource-changing combat.
- TOD-371 — Count HUD formatting allocations per rendered frame; test a local memoization candidate only if repeated work is demonstrated.
- TOD-372 — Count audio nodes created by a fixed hit sequence; verify nodes disconnect after their tails finish.
- TOD-373 — Count simultaneous environmental voices near fire and water; verify cadence/debounce bounds under repeated contacts.
- TOD-374 — Count WAV bytes and decoded samples for cooked combat cues; flag duplicate payloads with identical hashes.
- TOD-375 — Count looped-music decoded bytes separately from transfer bytes; preserve sample-boundary continuity in any candidate.
- TOD-376 — Compare native export bytes with debug source maps on and off; attribute the difference by artifact section.
- TOD-377 — Count duplicate embedded asset hashes in the standalone export; report reachable duplicates rather than filename similarities.
- TOD-378 — Count reachable runtime module bytes for the game export; identify editor-only code pulled into the playable graph.
- TOD-379 — Count canvas backing pixels at supported quality levels; compare UI legibility at matching logical viewport dimensions.
- TOD-380 — Count visible, culled and submitted city objects on three fixed camera routes; retain per-route counters and screenshots.

## 20. Host, transport and storage budgets — counter lane

- TOD-381 — Count encoded input bytes per fixed 600-tick fight; separate payload, framing and retransmissions.
- TOD-382 — Count snapshot/delta bytes for idle versus prop-heavy combat; identify fields repeatedly sent unchanged.
- TOD-383 — Count outbound messages per confirmed result; verify retries do not create unnecessary duplicate broadcasts.
- TOD-384 — Count retained spectator-history bytes at the retention boundary; verify old entries are evicted.
- TOD-385 — Count catch-up batches and maximum queued bytes for a late spectator; verify backpressure remains bounded.
- TOD-386 — Count database queries per Quick Play result; identify duplicate reads within a single transaction.
- TOD-387 — Count rows touched by one reward grant; compare first application with idempotent retry.
- TOD-388 — Count profile writes during wardrobe preview versus explicit publish; demonstrate that drafts do not persist remotely.
- TOD-389 — Count database rows examined for queue matching at three queue sizes; inspect the query plan for avoidable full scans.
- TOD-390 — Count live session records after repeated guest reconnects; verify replaced sessions stop accumulating.
- TOD-391 — Count WebSocket listeners and timers after room disposal; retain a resource inventory before and after.
- TOD-392 — Count per-member voice signaling messages as room size grows; report the supported capacity and expected growth.
- TOD-393 — Count uploaded-image bytes read for repeated profile views; distinguish cache hits from fresh storage access.
- TOD-394 — Count image derivative storage per upload; verify deletion/revocation cleanup against documented retention.
- TOD-395 — Count gzip operations during repeated HTML requests; confirm compression occurs at the intended lifecycle boundary.
- TOD-396 — Count replay file bytes by inputs, metadata and appearance; identify the dominant contributor without altering compatibility.
- TOD-397 — Count log entries produced by an idle room over a fixed tick window; flag unbounded repetitive diagnostics.
- TOD-398 — Count failed-auth resource allocations before rejection; verify malformed requests cannot create rooms or durable profiles.
- TOD-399 — Count retained matchmaking entries after cancellation and disconnect; verify cleanup for each terminal path.
- TOD-400 — Compare SQLite and PostgreSQL result/reward effects on the same event fixture; report semantic differences alongside query counts.

## 21. Existing editor capability audit — authoring lane

- TOD-401 — Recreate one authored light move through visible Combat controls and DOM-free commands; compare normalized portable data.
- TOD-402 — Recreate one directional-guard setting through both editor surfaces; verify one undo restores the prior value.
- TOD-403 — Change one wall-traversal stamina value through both surfaces; verify export preserves the authored value.
- TOD-404 — Assign one held tool and its light/heavy moves through the inspector; compare with the equivalent command plan.
- TOD-405 — Replace a tool model while retaining collider and durability data; record which existing editor controls suffice.
- TOD-406 — Author one moving platform through available editor controls; list the exact missing operation if it requires code.
- TOD-407 — Author one destructible panel through existing scene/physics controls; compare its exported state with the game fixture.
- TOD-408 — Recreate one city start location with ordinary scene editing; verify the match-layout reference stays valid.
- TOD-409 — Change one impact-effect material through the editor; verify combat state is unchanged over a fixed input sequence.
- TOD-410 — Replace one cooked combat cue through Combat audio; verify fallback behavior when the optional cue is cleared.
- TOD-411 — Change one wardrobe palette through visible authoring controls; verify independent materials remain independent after export.
- TOD-412 — Add one wardrobe variant through existing catalog controls; check whether its unlock reference can be authored without raw JSON.
- TOD-413 — Inspect authoring support for a Get up animation choice; identify the smallest missing control or command, if any.
- TOD-414 — Inspect authoring support for entrance/victory preview duration; separate supported authored values from runtime-only constants.
- TOD-415 — Recreate one practice lesson's target move using existing controls; report where lesson content still requires source edits.
- TOD-416 — Inspect whether tutorial focus masks/arrows are portable authored data; provide a capability map, not a new overlay system.
- TOD-417 — Inspect whether one city sign can be edited and localized through the editor; demonstrate the shortest current route.
- TOD-418 — Run Touch of Death setup on a populated scratch project; compare retained objects and the single-undo result.
- TOD-419 — Run a model-upgrade helper twice on a scratch project; verify editable scene data and assets do not duplicate.
- TOD-420 — Audit the capability-parity registry for one game-authoring action discovered above; link the missing or existing enforcement test.

## 22. Possible engine boundaries — research lane, no extraction

- TOD-421 — Map duplicated pickup-target selection consumers; show whether prompt and execution already share one implementation.
- TOD-422 — Inventory game-specific identifiers in portable combat code; distinguish intentional preset data from accidental engine coupling.
- TOD-423 — Compare moving-platform rider handling in two real consumers; recommend sharing only if both need the same contract.
- TOD-424 — Compare destructible-contact handling across named fixtures/consumers; identify a repeated bug before proposing a shared helper.
- TOD-425 — Map repeated rollback snapshot copying code; document ownership and lifetime differences that might prevent unification.
- TOD-426 — Check whether deterministic target tie-breaking already has an engine utility; compare semantics before recommending reuse.
- TOD-427 — Compare replay seek/checkpoint logic with another real engine consumer; report common invariants and incompatible requirements.
- TOD-428 — Inspect whether item-outline isolation is generic presentation logic or game art policy; recommend keeping the art policy local.
- TOD-429 — Map wardrobe attachment-following consumers; identify the smallest framework-neutral contract only if duplication is real.
- TOD-430 — Compare combat cue fallback resolution at its callers; establish whether a local helper is sufficient.
- TOD-431 — Inspect game-specific progression/reward constants in shared modules; name the host-owned policy boundary.
- TOD-432 — Trace account/storage imports reachable from engine combat; report any privileged dependency crossing the portable boundary.
- TOD-433 — Compare binary combat schema use across room types; identify an unnecessary game-local wire representation if present.
- TOD-434 — Inspect physical interaction diagnostic records for reused portable structure; separate observation data from game UI text.
- TOD-435 — Compare seeded-layout selection with another shipped seeded-selection consumer; report whether shared code would actually simplify both.
- TOD-436 — Map repeated input fresh-press detection; test semantic differences between combat, menus and replay before proposing reuse.
- TOD-437 — Inspect presentation-only frame mutation boundaries; identify one mutation that could contaminate saved/simulation state.
- TOD-438 — Compare asset-cooking setup transactions; document one recurring manual failure that a small shared helper could prevent.
- TOD-439 — Search engine exports for an existing primitive behind a game-local math helper; prove equivalence on edge cases before reuse.
- TOD-440 — Take the strongest extraction candidate from this section and write a one-page keep-local/share decision with named consumers and migration cost.

## 23. Controlled presentation A/B hypotheses — A/B lane

- TOD-441 — Compare current pickup hint with icon-plus-tool-name wording; score correct pickup attempts and mistaken targets on the same scene.
- TOD-442 — Compare two weapon-durability indicator treatments; ask viewers to predict the next break point from matched clips.
- TOD-443 — Compare current guard-break cue with one shape-only variation; score recognition with color removed.
- TOD-444 — Compare current failed-tech feedback with one shorter caption; score whether viewers identify the missed action without coaching.
- TOD-445 — Compare current launch-steering lesson copy with one annotated demonstration; score correct partial-stick execution on the same task.
- TOD-446 — Compare current Practice entry label with one concrete action label; record first-choice accuracy for a stated training goal.
- TOD-447 — Compare current Random AI description with one explicit range/chance treatment; test whether users predict its independence from selected difficulty.
- TOD-448 — Compare two health-divider contrasts; score quarter-health estimates from identical damaged states.
- TOD-449 — Compare current low-stamina feedback with one static reduced-motion treatment; score recognition and visual discomfort reports separately.
- TOD-450 — Compare two post-match replay entry labels; score whether users can find their last match without prompting.
- TOD-451 — Compare current outfit preview framing with one closer crop; score silhouette recognition while preserving the same model and lighting.
- TOD-452 — Compare current Get up preview with one replay button placement; count accidental equip actions and successful replays.
- TOD-453 — Compare current collection progress wording with one concrete remaining-item count; test comprehension without changing rewards.
- TOD-454 — Compare current reward reveal with one shorter animation variant; record voluntary replays, skip use and delight ratings separately.
- TOD-455 — Compare current box-purchase confirmation with one before/after currency display; score correct understanding of the cost before committing.
- TOD-456 — Compare two room ready-state indicators; count mistaken assumptions about who still needs to accept.
- TOD-457 — Compare current microphone-entry treatment with one clearer muted-state icon; score correct state identification before speaking.
- TOD-458 — Compare current recovery-key guidance with one step illustration; score understanding of download versus activation.
- TOD-459 — Compare two city route markings on the same geometry; count correct route choices while checking the hidden-exam tone.
- TOD-460 — Compare two impact-audio mixes at matched loudness and identical visuals; collect hit-type identification and preference separately.

## 24. Reproducible video and evidence coverage — capture lane

- TOD-461 — Record the same launcher interaction from attacker and defender views; include input history and tick-aligned contact markers.
- TOD-462 — Record partial versus full analog launch influence from one saved state; retain input magnitudes beside each clip.
- TOD-463 — Record a successful grapple tech and a one-tick-late attempt; show the fresh-press boundary without editing out recovery.
- TOD-464 — Record wood shortening and metal retaining reach under matched contacts; include durability and shaft overlays in an evidence copy.
- TOD-465 — Record a dropped tool losing its support surface; retain the state snapshot proving the second fall.
- TOD-466 — Record a full round transition with broken scenery and worn tools visible; annotate retained versus reset state.
- TOD-467 — Record a terminal match defeat beside a nonterminal round defeat; show recovery and winner-emote differences.
- TOD-468 — Record the same street crossing under each supported camera-quality setting; retain viewport and renderer configuration.
- TOD-469 — Record entering and leaving a moving lift with both fighters; include support-body IDs in diagnostics.
- TOD-470 — Record one complete guided-fight phase skip and replay journey; show which completion flags are stored.
- TOD-471 — Record an AI decision that appears anticipatory; pair it with the observation trace before calling it illegal.
- TOD-472 — Record replay seek and takeover of both fighters from the same file; retain hashes at the seek points.
- TOD-473 — Record an exported two-client reconnect within grace; include independent room/client identifiers and authoritative result evidence.
- TOD-474 — Record hidden-tab grace expiry in a disposable match; show the restored-tab UI and durable concession record.
- TOD-475 — Record a spectator joining mid-set and leaving; prove neither action takes a fighter seat or changes the result.
- TOD-476 — Record one reward grant, reload and re-open journey; pair the reveal with the durable inventory change.
- TOD-477 — Record outfit draft, cancel, save and publish as separate actions; show which viewers observe each state.
- TOD-478 — Record a controller-only menu-to-match-to-replay journey; preserve focus indicators and controller mapping metadata.
- TOD-479 — Record reduced-motion and standard feedback on identical replay inputs; provide uncropped side-by-side evidence.
- TOD-480 — Audit ten existing evidence clips for build identity, seed, controls and full outcome; list which claims cannot be reproduced.

## 25. Small research and verification-quality tasks — research lane

- TOD-481 — Map existing tests to the documented physical-combat acceptance bullets; identify one uncovered invariant without writing redundant tests.
- TOD-482 — Inspect one passing combat test for assertions that only mirror implementation constants; propose a behavioral replacement scenario.
- TOD-483 — Inspect one replay test for cross-runtime coverage; state which browser/runtime pairs are actually demonstrated.
- TOD-484 — Inspect one browser test for fixed sleeps masking missing readiness; propose an observable readiness condition.
- TOD-485 — Inspect one network test for room/token collisions under parallel execution; verify UUID-scoped identities and cleanup ownership.
- TOD-486 — Inspect one screenshot test for unstable camera/seed/animation state; produce a deterministic fixture recipe.
- TOD-487 — Check one bug reproduction against both source preview and current standalone export; report artifact drift before changing code.
- TOD-488 — Search existing issue/evidence records for one newly reported symptom; link duplicates and preserve the stronger reproduction.
- TOD-489 — Inspect one fixture for impossible combat state that weakens its claim; replace the setup proposal with legal input history.
- TOD-490 — Identify one stale skipped test in the game path; document its blocker and whether current code still reproduces it.
- TOD-491 — Research one referenced fighter's training feedback using official footage/docs; cite the exact interaction and propose one local comparison.
- TOD-492 — Research one referenced game's post-match replay discovery using primary evidence; separate observation from a Touch of Death hypothesis.
- TOD-493 — Research one collection-preview interaction in a named game using official footage; report how it exposes ownership without adding pressure.
- TOD-494 — Research one accessibility pattern for fighting-game resource feedback from a primary source; propose a bounded compatibility test.
- TOD-495 — Research one city-reference scene for navigable vertical layering; provide timestamps and one applicable visual principle without copying assets.
- TOD-496 — Research one city-reference scene for surveillance embedded in ordinary infrastructure; compare it with a current game screenshot.
- TOD-497 — Research one official browser profiling route for process-attributed retired instructions/cycles on the available host; record support or unavailability.
- TOD-498 — Audit one performance report for counter provenance and workload normalization; reject sampled profiler ticks mislabeled as CPU cycles.
- TOD-499 — Review five completed investigations for evidence-to-claim accuracy; flag inferred causes presented as observed facts.
- TOD-500 — Rank the verified findings from one completed batch by player impact, confidence and fix scope; nominate only isolated, reproducible small changes.
