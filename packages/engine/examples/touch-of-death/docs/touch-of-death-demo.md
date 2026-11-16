# Touch of Death browser demo delivery

[The design guide](touch-of-death.md#accepted-demo-direction-2026-09-24) owns
accepted product decisions. This document owns implementation order, missing
integration and release evidence. Dated older candidates below are historical.

## October 7 test candidate

Current status: **RISKY**. The bounded single-player loop is functional, but
measured rendering remains a P1 for a combat-feel test. Do not infer readiness
from the smoke test or the healthy public endpoint.

The prepared artifact is `C:/Users/MindOverMelee/TouchOfDeath-Test-20261007-rc4`.
Its `game.html` SHA-256 is
`46616932bb23611fd3c8fd9d89821843fddc35b9e10c9b2090f106a7a121d4a9`;
content identity is
`combat-v38:4121689a9c63423cb0fd4d22a5ee723280d502236a729e3105a5dbe312bade0f`.
The source/runtime pairing is checked at packaging time. The working tree has
concurrent unrelated changes; acceptance belongs to this immutable artifact.

The October 6 audit found and repaired three delivery/play failures:

- Portable packaging incorrectly requested browser hydration for the 268 MiB
  inventory. It now reads the canonical pair without that copy, accepts the
  existing streamed-music export, and serves its 42 verified music files. Initial
  uncompressed HTML is 17,520,727 bytes; the host also negotiates gzip.
- A bench and its authored fading trim collapsed the combat camera from its
  fitted position to roughly 11 cm from the target. Scenery cutaways now recognize
  trim and distinguish a supporting floor from a low prop beside the target.
- Beginner AI could fall from a roof and circle below it indefinitely. Stair
  pursuit now detours around taller risers, aims within the tread, and survives
  the brief contact gap caused by auto-step. The original failing seeded match
  then completed; existing climb/drop/doorway checks also pass at levels 1/3/5/9.

Presentation profiling exposed repeated full-scene material and fighter-part
lookups, plus scans of static scenery for possible platform riders. Local indexed
lookups and filtering reduce the measured Practice median from about 85–97 ms
to 48.6–48.7 ms; p95 remains 60.3–60.5 ms. Serial control/candidate/candidate/control
captures and fixed-scene image parity support the improvement. This is still
roughly 20 FPS on an i9-13900HX / RTX 4070 laptop, Chrome 154 headless, 1366×768,
high-performance power profile. It is a remaining P1, not an acceptable frame-rate
claim for the tester's different machine. A wider renderer/simulation rewrite was
deliberately excluded from this feature-frozen preparation.

Final extracted-host acceptance (`golden-final-verified/results.json`) completed
three consecutive real level-one first-to-three sets in 52.5, 60.2 and 66.2 seconds,
with pause/resume, score/health reset, rematches, result-to-title and reload.
The fresh profile needed no developer state; no uncaught browser errors or failed
required requests occurred. The served document digest matches the artifact.
However the actual combat run measured median 60.8 ms and p95 103 ms per frame
(about 16 FPS median), confirming the performance risk beyond Practice. Audio
continued through rematches with bounded tracked voices. A manufactured terminal
win checked the winner UI and rematch spam separately; it is not counted as a
natural player victory. Six natural complete sets passed across the repaired
candidates, with three on this exact final artifact.

Focused evidence: 49 delivery/runtime tests, 35 presentation tests, 20 camera/route
tests and five city-AI integration tests pass; the earlier combat/match/interaction/
audio selection passed 192 tests. Counts overlap and are not a single repository
gate. Process policy reports 4,784 files and zero violations. Known optional local
receipt-import 404s are identified separately; public HTTPS never requests that
development endpoint.

The public URL is [tod.hyperfocus.info](https://tod.hyperfocus.info/). It was healthy
when inspected, but still served September 30 deployment
`03875315-b1b0-4ca4-9687-9572ee34fc2e`, with `combat-v31`, not this candidate.
No deployment or account/database migration was performed. Do not hand out the
old URL as evidence that these repairs have shipped.
The candidate's local `data` folder retains the disposable QA SQLite database:
automatic approval review rejected its removal without a specific reason.
The generated `.dockerignore` excludes `data` and `*.sqlite*` from Railway builds.
All manifested game, host, project and policy bytes were rechecked after testing.

Evidence lives under `.local/touch-of-death/test-readiness/`: native screenshots,
golden-path JSON, reproduction states, CPU profiles, HTTP/music digests and test
logs. The [functional smoke command](../host/README.md)
and [short session/preflight](touch-of-death-playtests.md#october-7-2026-bounded-single-player-test)
own repeatable verification and operator instructions. Physical controller,
remote hardware, subjective audio mix and exhaustive arena traversal remain
unverified. The broader editor typecheck also reports the unrelated optional
editor hook in `scripts/game-art/verification/verify-playable-editor.ts:26`; the targeted host,
package/smoke and engine typechecks pass. The existing level-nine continuous-ToD
expectation also fails outside the default level-one slice; no balance change was
made to satisfy it.

## Release outcome

A newcomer opens the exported browser game, creates a recognizable fighter,
joins friends or Quick Play, completes a responsive match, watches and rotates
through a room, retries a confusing exchange, and returns with their profile
intact. A losing player can participate socially and enjoy customization without
being required to win. All demo cosmetics are free. Payments are outside this
demo. The browser game is deployed on Railway with PostgreSQL; the complete
public OAuth and social journey still needs real-account acceptance. The
[package README](../host/package/README.md#railway) owns
the deployed URL, verification evidence and remaining release limits.

### Owner decisions applied (2026-09-27)

The [design guide](touch-of-death.md#hosting-accounts-replay-cost-and-connection-quality-2026-09-27)
owns the updated requirements: retain the evolving art style; complete all
remaining cosmetic categories; add daily bonuses/streaks, wheels, achievements
and incremental unlocks; use randomized boxes; retain simple exact-version
replay compatibility; defer situation bookmarks/shared drills; deploy on Railway
with Clerk OAuth; enforce the specified sustained connection-quality loss policy;
and support phone browsers with connected controllers, with on-screen gameplay
controls deferred. Its progression research separates sources from inference.

Implementation now includes Clerk admission, Railway package configuration,
progression and the remaining catalog cosmetic categories. The owner's subsequent
quality clarification requires warnings/recovery for unilateral proxies and
corroboration for automatic no-contest; the host implements bilateral sustained
degradation as an unrated interruption, never an attributed proxy-based loss.
Public deployment/live OAuth, real internet and phone/controller acceptance still
need delivery evidence. See the implementation and artifact evidence below.
Imported replacement character art is no longer a release prerequisite. Uploaded
replay artwork remains an unanswered, separate policy decision. Historical entries
below describe their dated candidates: older references to undecided hosting,
box semantics, required replacement art or missing features subsequently delivered
must not override this section or the current delivery matrix.

## Delivery order and acceptance

| Work | Authoritative completion evidence | Current gap |
| --- | --- | --- |
| Independent fighters | Two host input streams independently move, guard, parry, attack and tech through the same physical adapter; AI path still passes; phone browsers support connected controllers | Shared input and defense regressions pass; exported two-browser controls prove hit/block/Drive and full sets. Standard Gamepad API local AI and online independent-seat hit/block/disconnect acceptance pass; physical controllers, phone browsers and cross-device acceptance remain |
| Network bout | Two browser clients finish a bout with actual contacts; delay/reordering converges; history exhaustion visibly stalls and recovers; incompatible content rejects admission; unilateral quality proxies warn and corroborated degradation can end unrated | Exported physical sets, live fighter recovery and confirmed replay inputs pass locally; host probe/debt warnings and bilateral no-contest have focused tests. Actual packet-loss telemetry, real internet quality, cross-device testing and Railway acceptance remain |
| Rooms and spectators | Invite joins, late spectator catches up, queue position persists, ready/AFK decisions and capped winner rotation work across reconnects | Exported three-member recovery, independent spectator recovery, physical contacts, concession and timeout rotation pass. Guest authentication is implemented; public deployment and broader network/device acceptance remain |
| Quick Play | Connection/skill criteria select valid opponents, search can cancel/reconnect, duplicate results cannot change rating twice | Local exported pairing, physical sets, recovery, durable concession ratings and replay takeover pass. Guest identity and downloaded-key recovery are implemented; public hosting and internet/device qualification remain |
| Profile and wardrobe | Shared-rig outfit preview, equip, saved presets and identity survive reload; remote peers see the same equipped appearance, subject to hide/block/moderation; all cosmetic categories preserve combat readability and mechanics | Seventeen-slot canonical wardrobe adds movement/hit style, particles and player cards to existing appearance/poses; editor controls, saved presets, host profiles and catalog replays share selections. Simulation invariance passes 600 ticks. Evolving procedural art is accepted. Clerk admission is implemented; uploaded-image replay policy and live public-account/device acceptance remain |
| Progression | Daily bonuses/streaks, reward wheels, achievements and randomized cosmetic rewards introduce one unlock at a time with frequent progress, including for losing players | Implemented device/account saves, UTC daily streaks, free wheel, uniform uncollected cosmetic boxes, four achievements and trusted set rewards; focused retry, restart, duplicate outcome and UI tests pass. Human pacing and public-service acceptance remain |
| Communication | Room text and opt-in voice work between clients; mute/block apply immediately; denied microphone access leaves play usable | Exported text and opt-in voice pass three-browser acceptance, including denied permission, mute/deafen, bilateral block and physical fighting. Participant voice reports also pass packaged browser acceptance and persist across host restart. Public TURN, physical audio devices and operational moderation remain missing |
| Replay takeover | Exported replay reproduces an exchange and permits either side to take over before it; version mismatch is explicit | Exported save/load, retained recent recording, playback/seek/either-side keyboard takeover and Chrome/Bun physical state equality pass. Standard Gamepad API navigation, seek and takeover pass. Other browsers, physical controllers and uploaded-image replay appearance remain |
| Two-player training | Both people control their fighters, reset a shared scenario and switch roles; resources and defenses match versus rules | Exported physical block/hit/KO, mutual reset/swap, held-input release, replay takeover and live recovery pass. Broader device acceptance remains; arbitrary bookmarks and shared drills are roadmap work |
| Uploaded expression | Bounded raster upload has a local preview, explicit immediate sharing, hide/block/report and later moderator removal | Unreviewed Top prints and profile emblems share immediately, save/reload and carry through community, Quick Play, private fights and training; private spectators select current fighters and training swaps preserve ownership. Reports persist and hide/block/revocation clear them. Uploaded-image replays and public moderator operations remain missing |
| Portable authoring and release | Relevant settings have visible editor controls and equivalent commands; canonical save/reload/export preserves behavior; exported candidate works outside checkout | Must be proven for every new authored feature |

Do not mark a row complete using a test of a lower layer alone. Keep failed and
missing evidence explicit. Changes to scope or date require a product decision;
do not silently replace accepted features with mock screens.

## After the demo

Pricing and purchase integration for the selected randomized cosmetic boxes,
arbitrary situation bookmarks and shared drills, on-screen touch gameplay,
larger-scale public operations, full community-created clothing/marketplace and native platform
acceptance remain roadmap work. Source-available contribution instructions should
point to validated asset/editor workflows and focused tests; do not assume future
volunteers will deliver critical demo dependencies.

## Delivery history

Dated implementation and acceptance records follow. Earlier status claims do not override the current candidate and delivery matrix above.

- <a id="september-30-arena-evidence"></a>[September 30 arena evidence](history/delivery/arena.md#september-30-arena-evidence)
- <a id="living-city-fair-reactions-and-movement-feedback-2026-09-27"></a>[Living city, fair reactions and movement feedback (2026-09-27)](history/delivery/combat.md#living-city-fair-reactions-and-movement-feedback-2026-09-27)
- <a id="match-variation-physical-tools-and-controller-wardrobe-2026-09-27"></a>[Match variation, physical tools and controller wardrobe (2026-09-27)](history/delivery/appearance.md#match-variation-physical-tools-and-controller-wardrobe-2026-09-27)
- <a id="post-ko-flow-and-controller-menu-refinement-2026-09-27"></a>[Post-KO flow and controller menu refinement (2026-09-27)](history/delivery/combat.md#post-ko-flow-and-controller-menu-refinement-2026-09-27)
- <a id="movement-impact-readability-and-local-profiling-2026-09-27"></a>[Movement, impact readability and local profiling (2026-09-27)](history/delivery/combat.md#movement-impact-readability-and-local-profiling-2026-09-27)
- <a id="cosmetics-rewards-hosted-identity-and-quality-recovery-2026-09-27"></a>[Cosmetics, rewards, hosted identity and quality recovery (2026-09-27)](history/delivery/appearance.md#cosmetics-rewards-hosted-identity-and-quality-recovery-2026-09-27)
- <a id="compact-quick-play-results-2026-09-24"></a>[Compact Quick Play results (2026-09-24)](history/delivery/matchmaking.md#compact-quick-play-results-2026-09-24)
- <a id="curated-entrance-and-victory-poses-2026-09-24"></a>[Curated Entrance and Victory poses (2026-09-24)](history/delivery/appearance.md#curated-entrance-and-victory-poses-2026-09-24)
- <a id="voice-participant-reports-delivered-2026-09-24"></a>[Voice participant reports: delivered (2026-09-24)](history/delivery/online.md#voice-participant-reports-delivered-2026-09-24)
- <a id="independent-online-controllers-2026-09-24"></a>[Independent online controllers (2026-09-24)](history/delivery/combat.md#independent-online-controllers-2026-09-24)
- <a id="uploaded-artwork-in-replays-implementation-boundary-2026-09-24"></a>[Uploaded artwork in replays: implementation boundary (2026-09-24)](history/delivery/uploads.md#uploaded-artwork-in-replays-implementation-boundary-2026-09-24)
- <a id="https-origin-readiness-2026-09-24"></a>[HTTPS origin readiness (2026-09-24)](history/delivery/delivery.md#https-origin-readiness-2026-09-24)
- <a id="recovery-keys-implementation-and-acceptance-2026-09-24"></a>[Recovery keys: implementation and acceptance (2026-09-24)](history/delivery/recovery.md#recovery-keys-implementation-and-acceptance-2026-09-24)
- <a id="guest-expiry-diagnostics-preceding-recovery-keys-2026-09-24"></a>[Guest expiry diagnostics, preceding recovery keys (2026-09-24)](history/delivery/recovery.md#guest-expiry-diagnostics-preceding-recovery-keys-2026-09-24)
- <a id="controller-replay-and-seek-draft-repair-2026-09-24"></a>[Controller replay and seek-draft repair (2026-09-24)](history/delivery/replay.md#controller-replay-and-seek-draft-repair-2026-09-24)
- <a id="gapless-music-candidate-and-validated-export-2026-09-24"></a>[Gapless music candidate and validated export (2026-09-24)](history/delivery/audio.md#gapless-music-candidate-and-validated-export-2026-09-24)
- <a id="smaller-music-encodings-rejected-for-loop-timing-2026-09-24"></a>[Smaller music encodings rejected for loop timing (2026-09-24)](history/delivery/audio.md#smaller-music-encodings-rejected-for-loop-timing-2026-09-24)
- <a id="download-payload-audit-and-next-optimization-2026-09-24"></a>[Download payload audit and next optimization (2026-09-24)](history/delivery/audio.md#download-payload-audit-and-next-optimization-2026-09-24)
- <a id="review-the-last-online-match-after-leaving-2026-09-24"></a>[Review the last online match after leaving (2026-09-24)](history/delivery/delivery.md#review-the-last-online-match-after-leaving-2026-09-24)
- <a id="first-match-choice-and-stable-menu-order-2026-09-24"></a>[First-match choice and stable menu order (2026-09-24)](history/delivery/combat.md#first-match-choice-and-stable-menu-order-2026-09-24)
- <a id="recorded-fighter-identity-and-wardrobe-2026-09-24"></a>[Recorded fighter identity and wardrobe (2026-09-24)](history/delivery/appearance.md#recorded-fighter-identity-and-wardrobe-2026-09-24)
- <a id="compressed-demo-delivery-2026-09-24"></a>[Compressed demo delivery (2026-09-24)](history/delivery/delivery.md#compressed-demo-delivery-2026-09-24)
- <a id="first-visit-fighter-continuity-2026-09-24"></a>[First-visit fighter continuity (2026-09-24)](history/delivery/appearance.md#first-visit-fighter-continuity-2026-09-24)
- <a id="portable-local-host-package-2026-09-24"></a>[Portable local host package (2026-09-24)](history/delivery/delivery.md#portable-local-host-package-2026-09-24)
- <a id="full-suite-socket-recovery-isolation-2026-09-24"></a>[Full-suite socket recovery isolation (2026-09-24)](history/delivery/recovery.md#full-suite-socket-recovery-isolation-2026-09-24)
- <a id="exported-file-acceptance-and-release-gate-2026-09-24"></a>[Exported-file acceptance and release gate (2026-09-24)](history/delivery/delivery.md#exported-file-acceptance-and-release-gate-2026-09-24)
- <a id="uploaded-appearance-in-private-fights-and-training-2026-09-24"></a>[Uploaded appearance in private fights and training (2026-09-24)](history/delivery/uploads.md#uploaded-appearance-in-private-fights-and-training-2026-09-24)
- <a id="full-health-conversion-physical-feasibility-2026-09-24"></a>[Full-health conversion: physical feasibility (2026-09-24)](history/delivery/learning.md#full-health-conversion-physical-feasibility-2026-09-24)
- <a id="cashout-coaching-follows-the-authored-string-2026-09-24"></a>[Cashout coaching follows the authored string (2026-09-24)](history/delivery/learning.md#cashout-coaching-follows-the-authored-string-2026-09-24)
- <a id="tech-lesson-learning-from-visible-feedback-2026-09-24"></a>[Tech lesson: learning from visible feedback (2026-09-24)](history/delivery/learning.md#tech-lesson-learning-from-visible-feedback-2026-09-24)
- <a id="reporting-an-encountered-image-during-quick-play-2026-09-24"></a>[Reporting an encountered image during Quick Play (2026-09-24)](history/delivery/uploads.md#reporting-an-encountered-image-during-quick-play-2026-09-24)
- <a id="immediate-upload-sharing-owner-decision-implemented-2026-09-24"></a>[Immediate upload sharing: owner decision implemented (2026-09-24)](history/delivery/uploads.md#immediate-upload-sharing-owner-decision-implemented-2026-09-24)
- <a id="practice-discovery-and-factual-missed-attempt-feedback-2026-09-24"></a>[Practice discovery and factual missed-attempt feedback (2026-09-24)](history/delivery/learning.md#practice-discovery-and-factual-missed-attempt-feedback-2026-09-24)
- <a id="practice-control-handoff-and-upward-coaching-2026-09-24"></a>[Practice control handoff and upward coaching (2026-09-24)](history/delivery/learning.md#practice-control-handoff-and-upward-coaching-2026-09-24)
- <a id="export-entry-separation-locally-verified-2026-09-24"></a>[Export entry separation: locally verified (2026-09-24)](history/delivery/delivery.md#export-entry-separation-locally-verified-2026-09-24)
- <a id="quick-play-image-controls-locally-verified-2026-09-24"></a>[Quick Play image controls: locally verified (2026-09-24)](history/delivery/uploads.md#quick-play-image-controls-locally-verified-2026-09-24)
- <a id="profile-emblem-locally-verified-2026-09-24"></a>[Profile emblem: locally verified (2026-09-24)](history/delivery/uploads.md#profile-emblem-locally-verified-2026-09-24)
- <a id="portrait-resize-evidence-correction-2026-09-24"></a>[Portrait resize evidence correction (2026-09-24)](history/delivery/appearance.md#portrait-resize-evidence-correction-2026-09-24)
- <a id="uploaded-outfit-continuity-audit-2026-09-24"></a>[Uploaded outfit continuity audit (2026-09-24)](history/delivery/uploads.md#uploaded-outfit-continuity-audit-2026-09-24)
- <a id="hosted-guest-entry-locally-verified-2026-09-24"></a>[Hosted guest entry: locally verified (2026-09-24)](history/delivery/delivery.md#hosted-guest-entry-locally-verified-2026-09-24)
- <a id="contributor-package-compatibility-repair-2026-09-24"></a>[Contributor package compatibility repair (2026-09-24)](history/delivery/delivery.md#contributor-package-compatibility-repair-2026-09-24)
- <a id="fresh-combat-v5-replay-acceptance-2026-09-24"></a>[Fresh combat-v5 replay acceptance (2026-09-24)](history/delivery/replay.md#fresh-combat-v5-replay-acceptance-2026-09-24)
- <a id="export-dependency-and-release-gate-audit-2026-09-24"></a>[Export dependency and release-gate audit (2026-09-24)](history/delivery/delivery.md#export-dependency-and-release-gate-audit-2026-09-24)
- <a id="background-sessions-and-terminal-close-policy-2026-09-24"></a>[Background sessions and terminal close policy (2026-09-24)](history/delivery/recovery.md#background-sessions-and-terminal-close-policy-2026-09-24)
- <a id="live-connection-recovery-and-durable-concessions-2026-09-24"></a>[Live connection recovery and durable concessions (2026-09-24)](history/delivery/recovery.md#live-connection-recovery-and-durable-concessions-2026-09-24)
- <a id="previous-clothing-print-candidate-2026-09-24"></a>[Previous clothing-print candidate (2026-09-24)](history/delivery/appearance.md#previous-clothing-print-candidate-2026-09-24)
- <a id="earlier-exported-image-review-candidate-2026-09-24"></a>[Earlier exported image-review candidate (2026-09-24)](history/delivery/uploads.md#earlier-exported-image-review-candidate-2026-09-24)
- <a id="earlier-exported-upload-storage-candidate-2026-09-24"></a>[Earlier exported upload-storage candidate (2026-09-24)](history/delivery/uploads.md#earlier-exported-upload-storage-candidate-2026-09-24)
- <a id="earlier-exported-room-voice-candidate-2026-09-24"></a>[Earlier exported room-voice candidate (2026-09-24)](history/delivery/online.md#earlier-exported-room-voice-candidate-2026-09-24)
- <a id="earlier-exported-shared-training-candidate-2026-09-24"></a>[Earlier exported shared-training candidate (2026-09-24)](history/delivery/online.md#earlier-exported-shared-training-candidate-2026-09-24)
- <a id="earlier-wardrobe-and-profile-candidate-2026-09-24"></a>[Earlier wardrobe and profile candidate (2026-09-24)](history/delivery/appearance.md#earlier-wardrobe-and-profile-candidate-2026-09-24)
- <a id="earlier-exported-quick-play-candidate-2026-09-24"></a>[Earlier exported Quick Play candidate (2026-09-24)](history/delivery/matchmaking.md#earlier-exported-quick-play-candidate-2026-09-24)
- <a id="quick-play-backend-preparation-2026-09-24"></a>[Quick Play backend preparation (2026-09-24)](history/delivery/matchmaking.md#quick-play-backend-preparation-2026-09-24)
- <a id="earlier-exported-community-candidate-2026-09-24"></a>[Earlier exported community candidate (2026-09-24)](history/delivery/online.md#earlier-exported-community-candidate-2026-09-24)
- <a id="community-prerequisites-and-determinism-decision-2026-09-24"></a>[Community prerequisites and determinism decision (2026-09-24)](history/delivery/online.md#community-prerequisites-and-determinism-decision-2026-09-24)
- <a id="previous-exported-deterministic-combat-candidate-2026-09-24"></a>[Previous exported deterministic combat candidate (2026-09-24)](history/delivery/online.md#previous-exported-deterministic-combat-candidate-2026-09-24)
- <a id="exported-session-recovery-candidate-2026-09-24"></a>[Exported session-recovery candidate (2026-09-24)](history/delivery/recovery.md#exported-session-recovery-candidate-2026-09-24)
- <a id="exported-replay-candidate-2026-09-24"></a>[Exported replay candidate (2026-09-24)](history/delivery/replay.md#exported-replay-candidate-2026-09-24)
- <a id="network-foundation"></a>[Network foundation](history/delivery/online.md#network-foundation)
- <a id="recording-prerequisite-evidence-2026-09-24"></a>[Recording prerequisite evidence (2026-09-24)](history/delivery/verification.md#recording-prerequisite-evidence-2026-09-24)
- <a id="editor-views"></a>[Editor views](history/delivery/verification.md#editor-views)
- <a id="verification-baseline"></a>[Verification baseline](history/delivery/verification.md#verification-baseline)
