# Touch of Death visual evidence

Latest: [wardrobe and bridge finish](wardrobe-bridge-finish/README.md) addresses
alternate hair/footwear, textile construction, combat expression, telemetry finish
and native bridge composition. Its comparisons, rejections and validation remain
candidate evidence, separate from owner-approved qualities below.

[Art Constitution](../touch-of-death-art-constitution.md) owns decisions. GOOD denotes the named approved quality or selected direction; it is not blanket asset approval. CANDIDATE has no inferred approval. No GOLDEN has been designated.

[Forearm constraints](constraints.json) bind the accepted geometry and [receipt](forearm-approval.json). [Idle/run acceptance](idle-run-approval.json) locks the repair and restrained running direction in idle-run-v3. New action candidates do not reopen those qualities. Exact bytes and SHA-256 hashes survive local build deletion.

| Example | Scope / reason | Status |
| --- | --- | --- |
| [fighter-competition](fighter-competition.25efe1130b4c.png) | Owner selected the long-line C massing. A/B/D/E/F are unselected alternatives, not bad assets. | owner-selected direction |
| [arena-competition](arena-competition.89ae70fa2f66.png) | Owner selected a bridge as the large upper framing form above an open combat lane. | owner-selected direction |
| [heavy-direction-b](heavy-direction-b.6cf42c6de5e9.webm) | Chosen over measured cross A and compact counter C. Old forearms and locomotion in this version are not accepted. | owner-selected direction |
| [impact-direction-b](impact-direction-b.4d78115034e4.webm) | Owner selected the broader burst at the same contact. This does not approve the entire old character or rig. | owner-selected direction |
| [oversized-forearms](oversized-forearms.af10dfd3e027.png) | Nearly uniform .152m diameter forearms dominate wrists, fists and clothed upper arms. | owner-rejected |
| [rejected-locomotion](rejected-locomotion.6886c30752aa.webm) | Short full-cycle length, guard-held arms and abrupt transitions create an inferior walk/run. The separate neutral clip was also frozen by zero travel input. | owner-rejected |
| [baseline-heavy-contact](baseline-heavy-contact.0eea0898fd60.png) | Small fighters, long necks, similar strike silhouettes and foreground props compete with the exchange. | agent diagnosis |
| [repaired-character](repaired-character.87ce0024e987.png) | Owner accepted these forearms. This does not approve the face, costume finish, animation or whole character. | owner-accepted quality |
| [repaired-locomotion](repaired-locomotion.99c566cf055d.webm) | Cadence improved but flat boots, independently generated foot targets and guarded arms still fail the intended motion quality. | owner requested revision |
| [repaired-locomotion-gameplay](repaired-locomotion-gameplay.863066628e9f.webm) | Preserve this moving reference alongside the isolated clip; objective reach checks did not establish satisfactory movement. | owner requested revision |
| [universal-walk-reference](universal-walk-reference.d77d5136bb70.webm) | Actual Quaternius UAL1 Walk_Loop on its source mannequin, rendered by the engine. Source timing and provenance are in the build evidence. | reference, not asset approval |
| [universal-jog-reference](universal-jog-reference.988131cb131f.webm) | Actual UAL1 Jog_Fwd_Loop supplies joint arcs, recovery and foot articulation; its long reach needs adaptation to gameplay speed. | reference, not asset approval |
| [universal-walk-candidate](universal-walk-candidate.512897d1de49.webm) | Preserve the broadly liked transfer direction and forearms. This is not approval of every pose or finished locomotion. | owner: mostly good direction; run repair required |
| [universal-jog-candidate](universal-jog-candidate.5ff29a8cb2f2.webm) | Keep the source-based direction; the reversed knee is explicitly BAD and retained separately. Complete jog motion is not approved. | owner: mostly good direction; run repair required |
| [candidate-heavy-contact](candidate-heavy-contact.6a058b615ecc.png) | Open lane, larger body scale, authored load/contact, quieter HUD. The local physics envelope differs from the canonical game. | awaiting owner review |
| [run-knee-before](run-knee-before.d78ec7faa042.png) | Stale knee-position hint after ankle reach compression reverses the trailing knee. Valid lengths did not establish anatomical correctness. | owner identified defect |
| [run-knee-repaired](run-knee-repaired.396cbeb10b85.png) | Forward hinge plane preserved after stride adaptation; compare to the same phase before repair. Forearms and overall motion direction retained. | awaiting owner review |
| [run-knee-repaired-clip](run-knee-repaired-clip.1617b3e32afd.webm) | Full stride and transition checks reject reversed knee flexion. This does not establish complete motion approval. | awaiting owner review |
| [motion-set-before-heavy](motion-set-before-heavy.5867d5a37b21.png) | The rising fist extends into a straight overhead salute after contact; the guard also intersects the torso in this phase. | agent diagnosis |
| [motion-set-heavy-repair](motion-set-heavy-repair.34eebe38afe1.png) | Keeps the selected deep load and rising strike while retracting through a bent elbow, supporting a toe pivot and tracking the opponent with the head. | awaiting owner review |
| [motion-set-jab-repair](motion-set-jab-repair.9ff6cc34ad43.webm) | UAL Punch_Jab supplies joint arcs with contact retimed to the existing startup. Fixed proportions and combat timing are preserved. | awaiting owner review |
| [motion-set-hit-repair](motion-set-hit-repair.b192ce575232.webm) | Reaction begins on actual damage, freezes through native hitstop and preserves recoil through flight; light hits use a smaller, shorter response. | awaiting owner review |
| [motion-set-transition-repair](motion-set-transition-repair.154e3a92c188.webm) | Smooth wrists and bounded yaw did not establish valid elbow behavior. Keep this older candidate as a counterexample, not a successful stop reference. | superseded after owner identified idle arm flip |
| [owner-idle-arm](owner-idle-arm.875f2539cd1a.png) | A moving elbow bend target survived while the wrist returned to guard, folding the arm above its shoulder. Wrist-only continuity checks missed it. | owner identified defect |
| [owner-run-exaggerated](owner-run-exaggerated.718ee28c771e.png) | The slower game stride retained the fast source clip's high knee recovery, deep hip compression and torso sway. | owner rejected exaggerated movement |
| [idle-elbow-before](idle-elbow-before.154e927401ff.png) | Twenty running ticks followed by 35 stopped ticks leave the old elbow above its shoulder. The after image uses identical input and camera. | agent reproduction of owner defect |
| [idle-elbow-after](idle-elbow-after.c0a2a40c6cdb.png) | Resolved elbows blend with hands through the complete stop; the hand returns to guard with the elbow below the shoulder. Accepted forearm geometry is unchanged. | owner-accepted quality |
| [restrained-run](restrained-run.562e00726006.webm) | Source stride adaptation now also reduces vertical effort, body sway, arm swing and foot roll while retaining cadence and forward knee mechanics. | owner-accepted quality |
| [idle-stop-cycle](idle-stop-cycle.473a2287a52b.webm) | Three different stop phases expose complete elbow behavior instead of relying on isolated idle or wrist-only checks. | owner-accepted quality |
| [full-set-dash](full-set-dash.024bffa02519.webm) | Actual input sequence uses move identities, dash load and recovery instead of collapsing them into light/heavy poses. | new action motion; not owner-approved |
| [full-set-wall](full-set-wall.9f2431534943.webm) | Contact state drives wall-side support and transition to wall-jump motion; physics still owns displacement. | new action motion; not owner-approved |
| [full-set-long-weapon](full-set-long-weapon.d0060d86d73b.webm) | The shared shaft stays within both arm reach volumes; the native contact clip includes damage and hit stop. | new action motion; not owner-approved |
| [full-set-weapon-run](full-set-weapon-run.600bedcbf6ef.webm) | A selected tool and a moving gait are both required. Held wrists replace gait elbow hints as one chain. | new action motion; not owner-approved |
| [full-set-heavy-tool](full-set-heavy-tool.ee69a42a991e.png) | Load, downward commitment and recovery use a shared two-hand grip. Wider isolated framing retains the raised tool tip. | new action motion; not owner-approved |
| [full-set-short-contact](full-set-short-contact.f469b8a11ac4.png) | The first cross target stayed too close to the guard to communicate a strike. Contact extension is now checked explicitly, alongside limb continuity. | agent-rejected contact readability |

[Machine-readable corpus](corpus.json). The [complete-set workflow](../../../../../../apps/engine-editor/verification/art-direction/full-set/README.md) produces the exhaustive coverage map, native validation, all frame strips, clips and immutable SQLite review versions.

## Directed weapon correction

[Owner feedback](weapon-direction-feedback.json) preserves the positive overall direction and the specific weapon corrections. New results remain candidates.

| Example | Scope / reason | Status |
| --- | --- | --- |
| [weapon-blunt-samey](weapon-blunt-samey.fad1af505cf5.webm) | The old heavy baton path barely separated its load and exit from the light. Owner requested unmistakable high-damage commitment. | owner requested correction of named quality |
| [weapon-heavy-samey](weapon-heavy-samey.59699960e03f.webm) | The previous heavy tool shared the light attack path and did not communicate its damage/commitment. Owner requested differentiation. | owner requested correction of named quality |
| [weapon-flexible-before](weapon-flexible-before.528e119e42fb.webm) | Only the free handle lagged the held one; there was no receiving hand, catch or persistent handle transfer. | owner requested correction of named quality |
| [weapon-heavy-smash](weapon-heavy-smash.971ec8c03bd2.webm) | Raised load, deep compression and low follow-through now accompany high damage, long recovery and stamina cost. | weapon revision; not owner-approved |
| [weapon-blunt-rise](weapon-blunt-rise.9eea7da77972.webm) | The loaded rising heavy uses both hands and a lower start than the short horizontal light. | weapon revision; not owner-approved |
| [weapon-flexible-transfer](weapon-flexible-transfer.3e3a3f083cdd.webm) | Independent chain/free-handle direction, right-to-left catch, left orbit and return catch preserve both handle identities. | weapon revision; not owner-approved |
| [weapon-blade-rise](weapon-blade-rise.2e93f2c4e5f6.png) | The blade rises from a low loaded edge; its source job stays anti-air while the path is weapon-specific. | weapon revision; not owner-approved |
| [weapon-blade-lunge](weapon-blade-lunge.2ea3d4c697f8.png) | The same kit routes forward input to a narrow point lunge instead of reusing the rising cut. | weapon revision; not owner-approved |
| [theater knockout regression](theater-regressions/README.md) | Matched native pose exposes the former standing-root conversion burying a defeated fighter. Root framing passed; native pose alignment now gates capture. | mechanical repair candidate; not art approval |

## Cosmetics and particles

The [common service construction pass](service-construction/README.md) retains
matched jacket/tool/entrance images, two rejected repair iterations and a native
sound-on exchange. Its new positive examples remain CANDIDATE; its result records
the factory changes and the limits of their demonstrated transfer.

The [cosmetic contract](../touch-of-death-cosmetics.md) records the owner's theatrical legendary direction and subsequent physical-technology requirement. [This result record](cosmetics-result.json) binds the first four-tier collection to source hashes, native 60 fps gameplay/contact evidence, critic findings and capture repairs. The following are scoped negative examples or candidates; none establishes whole-asset approval.

| Example | Scope | Status |
| --- | --- | --- |
| [cosmetics-floor-discs](cosmetics-floor-discs.37aa7ee6f9a9.png) | decorative emission and signal ownership | agent diagnosis |
| [cosmetics-flat-panel-clipping](cosmetics-flat-panel-clipping.6c45d13621da.png) | garment surface attachment | agent-rejected iteration |
| [cosmetics-forge-flecks](cosmetics-forge-flecks.c7073d2e802c.png) | warm foot-anchored decoration below separate dash cues | awaiting owner review |
| [cosmetics-stormfold-front](cosmetics-stormfold-front.1ed5eb55d3ed.png) | legendary garment construction, front | awaiting owner review |
| [cosmetics-stormfold-side](cosmetics-stormfold-side.3d0cdd1d2034.png) | legendary garment construction, side | awaiting owner review |
| [cosmetics-arc-wake](cosmetics-arc-wake.6a49566aaf43.webm) | legendary movement energy, native 60 fps video-only study | prior candidate; visible equipment and approved lore explanation unresolved |
| [cosmetics-impact-priority](cosmetics-impact-priority.473cc816f85a.webm) | decoration alongside the selected radial contact grammar | awaiting owner review |
| [cosmetics-reduced-motion](cosmetics-reduced-motion.f10f62a5b3af.png) | native reduced-motion setting suppresses decorative emission | verified behavior, not taste approval |


The [lore and construction gap pass](lore-construction-gaps/README.md) records
owner-selected arena telemetry, repaired face/boots, a second component-material
tool and the remaining city/wardrobe limitations. Its exact rendered versions
remain CANDIDATE; only the telemetry lore basis is approved.
