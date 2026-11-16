# Touch of Death: appearance evidence

Historical evidence; [current guidance](../../touch-of-death-demo.md) owns current status and limits.

### Match variation, physical tools and controller wardrobe (2026-09-27)

The local canonical project now has ten street/rooftop starts and ten distinct
authored tool layouts. A shared session seed chooses the first location; the
saved match index advances on retries. Round recovery keeps current damage and
placements. Editable prop placements use the existing combat command and the
Match starting locations inspector. The runtime identity is `combat-v13:`.

Pickup reach includes the visible shaft. All twelve existing tools have authored
wear/fragment visuals; held light/heavy attacks use timed weapon poses and
stronger moves. Grab tech has an explicit release recovery, preventing a second
grab on the break frame. Higher AI levels use the same tech window and compare
walking around a wall with breaking it through an affordable ordinary strike.
Indirect weapon commands require the same held-item mapping as human input.

The wardrobe has category pages and one editable slot at a time, with a detached
neutral preview that cannot inherit a live KO or an arena obstruction. Retry
leads result actions; More options follows the primary action column. Local
command handoff, final artifact and browser evidence are recorded under
`.local/touch-of-death/dynamic-polish/`.

### Cosmetics, rewards, hosted identity and quality recovery (2026-09-27)

The validated canonical project now has seventeen wardrobe slots, adding movement
posture, hit reaction, decorative movement particles and player-card styling to
existing outfits, palettes, icons and intro/victory poses. All choices remain
presentation-only; a 600-tick regression compares complete physical combat and AI
state. The catalog inspector and semantic command share validation. Command
`tod-all-cosmetics-20260927` completed 1/1, persisted with dirty=false, project hash
`891a1582536ee65a6e1d373d21e6d32f8eede971b99cf0cf867a417cd9d7370a`.

Rewards provides persistent device/account daily bonuses, streaks, a free daily
wheel, random uncollected-cosmetic boxes, permanent achievements and set-completion
grants for winners and losers. Each section is revealed separately. All demo
cosmetics remain freely selectable; collection rewards equip the existing saved
wardrobe. Host transactions reject duplicate/conflicting grants and use server
time/randomness. Storage/network retry tests preserve request IDs, random draws,
later earnings and account isolation. Device balances never become account claims.
See [reward policy](../../../host/progression/README.md).

Configured hosts use Clerk OAuth JWT verification before issuing one-use game
tokens. The package includes Railway Dockerfile/configuration and readiness, with
one replica and PostgreSQL through `DATABASE_URL`. Accounts, profiles, ratings,
rewards, social records and uploads use the linked database. The game service needs
no persistent disk volume. Keys are runtime environment variables, never packaged.
Local runs without `DATABASE_URL` retain SQLite and guest admission. Local accounts
are not automatically imported or merged into public Clerk accounts. See
[deployment acceptance](../../../host/package/README.md#railway)
for live status; automated authentication uses signed test JWTs.

Quality monitoring follows the owner's clarified policy: host input debt and probe
misses are proxies. Unilateral sustained degradation shows a live warning without
attributing a ranked loss. Both independently monitored connections degrading for
ten seconds permits an unrated no-contest; host pauses/recovery reset evidence.
Client assertions cannot select a winner. Terminal disconnect concessions remain
separate. Private/profile and training protocols are 4; community is 10 and Quick
Play is 8, rejecting old clients that cannot decode expanded appearance or answer
probes. Controller navigation now reaches both wardrobe and reward dialogs and
stays within the open dialog; phone-width checks do not claim physical-device QA.

Editor Build/download and the portable package verifier produced
`.local/touch-of-death/releases/intent-20260927-0548/` with HTML SHA-256
`242597a5f1d1b59519dd001cd2bcb63719f19adb7e67f94c26a4c3512e3f6c04`
and runtime SHA-256
`b4a3508121af5e6bedadc265857d2f7d5487a45423ccf9ffb311de4bc4d27b2c`.
The prior HTML is preserved. Native browser actions pass daily claim, staged
reveal, wheel, box, Equip, wardrobe controls and reload at desktop and 390 pixels.
The offline reward test fixes one RNG draw to fund the real box transaction; it
does not inject balances or completion. Two packaged-host browser accounts claim
independently: A's 50 coins leave B at zero, then B independently claims 50.
Evidence: `.local/touch-of-death/intent-20260927-export/{intent-export.json,online.json}`.
No browser/host errors or visible automation windows were reported; the isolated
host and browser trees were cleaned up.

The final package also passes a physical Quick Play set: both browser players
choose and save seventeen explicit wardrobe selections, then ordinary keyboard
movement and 39 attacks earn a complete set. Both remote profiles retain all
seventeen selections. The host commits ratings 1012/988 and account rewards
60/40 coins, with one completed set each and no client damage/state injection.
Evidence: `intent-20260927-export/earned-set.json`. The shared guest demo at
`http://127.0.0.1:8801` now serves the same final HTML/content identity. Its existing
`community.sqlite` was identified through an ordinary guest cookie/account lookup
before refresh and retained; no account credential was printed or packaged.
See `intent-20260927-export/shared-host.json` for the served-hash and clean-host
checks. The isolated acceptance host was stopped; the shared demo/editor remain.

Validation: 360 scene3d tests pass, editor application/test types pass, 68 quality/
community/Quick Play tests pass, and focused auth/reward/cosmetic tests pass.
Engine build and external installed-package consumer pass; process policy reports
zero violations. The broad editor ship gate stops at 38 test failures (1,174 pass,
37 skip); the final-source suite rerun records 1,181 pass, 37 skip and 37 failures
in `intent-20260927-export/editor-suite.log`, involving the script-browser boundary
and Website tests. Representative untouched Website HTTP/commerce tests reproduce 403
instead of their expected authenticated status in isolation. Later broad browser/
package gates were skipped by that failure; the game-specific artifact checks
above ran separately. Engine bundle budgets still fail (runtime raw 3,114,387
versus 2,602,000); source structure reports the existing PadPilot evaluator count
38 versus 36. No ceilings were raised. These failures, public internet/live OAuth
and physical phone/controller acceptance prevent a full-release claim.

### Curated Entrance and Victory poses (2026-09-24)

This slice gives a losing player another way to express an identity without
changing combat permissions. Existing outfits, named presets, account profiles
and replay appearance already provided the storage path; the missing pieces were
authored pose choices, visible previews and safe match presentation.

Candidate ranking for this pass, in descending priority:

| Candidate | Player impact / frequency | Novice and expert value | Risk / testability | Decision |
| --- | --- | --- | --- | --- |
| Entrance and victory choices | Identity visible every set | Expression independent of skill | Low mechanical risk; phase and checkpoint tests | Implement |
| Save, online and replay consistency for those choices | Trust on every return or shared recording | Same identity across modes | Existing contracts; real browser set and reload | Implement as part of the same slice |
| Movement/hit animation variants | High expression frequency | Must preserve contact readability | Larger visual and timing audit | Defer |
| Uploaded art in replays | Sharing and identity | Useful to both audiences | Revocation/offline policy unresolved | Defer |
| More particles and finished character art | Strong visual appeal | Can also obscure defense | Asset and readability work | Defer |

The implementation adds Entrance and Victory to the source preset and canonical
project, with Respect bow, Salute and Fists up. Each is previewable in Your fighter
without advancing simulation. Catalog validation, the visible editor form and
`scene3d.set-appearance-catalog` share the same phase/style contract. Presets,
online profiles and recordings use existing selection IDs. Defaults are Salute
for entrance and Fists up for victory; old catalogs retain their legacy intro.

Engine ownership is `project/3d/appearance`, `combat-match` and the gameplay
presentation adapter. Editor ownership is `scene3d/appearance`, the Touch of Death
wardrobe preset and `standalone-3d`. Poses affect evaluated transforms only.
Victory is restricted to the terminal match winner, confirmed online; live round
results, Practice, the loser, physics, attack phases and resources are unchanged.
Review reproduced stale victory transforms on reused frames when selections were
cleared or countdown resumed. A regression now checks restoration before phase
dispatch; ordinary live frames incur no victory-pose cloning.

Packaged browser review then caught a second issue: Quick Play reset to neutral
fighters when its host published the result, discarding the visible winner and
equipped appearance. Metadata tests alone did not catch this. The connection now
retains only a confirmed terminal match and its frozen seat appearance through
the result screen; searching or leaving clears it. Saving sends no further input,
and a nonterminal concession cannot invent a victory. Eighteen connection,
community and training tests (201 assertions) pass, including a physical
first-to-three set, result retention and search cleanup. The `v2` evidence preserves
the failed visual boundary; it must not be cited as complete victory acceptance.
The next screenshot exposed the shared result layout's opaque menu backdrop.
Result presentation now preserves a clear view of the fighters with shaded text
areas; the main menu retains its background. Quick Play no longer repeats a stale
Saving message after the host result panel has already confirmed the outcome.

Canonical request `tod-curated-poses-20260924` dry-ran, persisted and reloaded via
the editor-command workflow. Only two catalog slots changed: all preceding slots
and the 54 assets are unchanged. Project hash is
`cfd90e716f8f1163332e8fac70b7e6190e30e7da8519010cfa11ca8f4be4980f`.
The visible editor Build/download produced the corrected candidate with HTML
SHA-256 `620f167c36770819ecb73668028f6de1a910814f8090f553e3b42ea47b600e7d`.
Its content ID is
`combat-v5:e07fb29d780474b61b76977979a791d8c8ddc18036741b4e07bc1fdffa6bffed`.
Older-content recordings still require their matching retained export.

Final-source checks: 205 engine 3D tests / 19,842 assertions, 45 editor appearance,
wardrobe, replay and parity tests / 1,833 assertions; 18 connection tests / 201
assertions and 15 presentation tests / 112 assertions. Engine/editor test types,
engine/editor builds, installed engine consumer and process policy pass.
The engine bundle budgets still fail; source structure also reports the existing
PadPilot evaluator file-count excess (38 versus baseline 36). Neither limit was
raised. These checks do not establish public release readiness.

The final v4 package passes 12 browser checks and two read-only SQLite checks
outside the checkout. Two independent guests save/reload named outfits, preview
different gestures and earn a 3–0 Quick Play result with real movement and 39 jab
attempts. The desktop result screenshot visibly shows the selected salute on the
standing winner and the defeated opponent still down. Native Play again clears
the terminal scene. The downloaded recording preserves both pose selections;
durable profiles agree. Narrow-screen result controls remain usable, but the pane
occupies most of that viewport, so this run does not certify mobile celebration
visibility. No browser or host errors remain; owned test processes were cleaned up.
That pass refreshed the shared loopback demo to identical v4 HTML and retained its account
database. Release and extracted payload hashes agree; the release contains no
account database or credentials.

Manual acceptance checklist:

1. Open Your fighter, choose different Entrance/Victory options and preview both.
   Cancel must discard drafts; Save fighter and named outfits must survive reload.
2. Join Quick Play from two independent browsers with different saved fighters.
   Confirm each introduction reflects its own choices.
3. Move into range and attack using real controls. Block, hit and win a full set
   through physical contacts. Poses must not interrupt live attacks or recovery.
4. Confirm only the set winner poses, then rematch: no victory pose may linger.
5. Download the replay and check each fighter retains its recorded selections.
6. Load the canonical project in the editor and export again; reject stale runtime
   or project/asset mismatches before packaging.

Changelog: added free Entrance/Victory choices and previews; carried selections
through saved outfits, online identity and replay; fixed stale victory transforms
when reusing rendered frames, premature Quick Play result resets and opaque
result backgrounds. Evidence and release receipts live under
`.local/touch-of-death/pose-cosmetics-audit/`; the first candidate is retained under
`v1`; it, `v2` and `v3` are superseded by `export-v4`.

### Recorded fighter identity and wardrobe (2026-09-24)

The replay loop reproduced combat but discarded the fighters' names and catalog
outfits. This made shared matches less recognizable and weakened the expression
loop. It ranked above new cosmetic slots: it affects every saved personalized
match, has a small presentation-only boundary and is directly testable. Uploaded
image replay was deferred because offline pixels need explicit hide/revocation
semantics; it is still a distinct unresolved requirement.

New client downloads attach a version-one appearance envelope in recording seat
order. Names, icons and catalog choices are captured once when a fighter or
spectator session starts. Result retention preserves the original appearance
through lobby edits; a new pairing captures anew. Exported values are detached.
No account IDs, revisions, credentials, remote URLs or uploaded pixels enter this
metadata. Existing input recording and simulation protocols remain unchanged.

The replay controller validates metadata before constructing the game, and the
appearance host resolves each recorded seat against its authored actor/catalog
before reset. Unknown options, invalid names and extra fields reject safely.
Playback, seeking and takeover apply the recorded presentation; old files without
metadata retain authored defaults. Local wardrobe and account saves are unchanged.
The replay chooser states that uploaded pictures are omitted.

Validation: 152 focused replay/appearance/network tests passed, 1,295 assertions;
editor source/test types, build and validated Build/download passed. Twelve
browser checks on the external packaged host saved distinct jacket/vest fighters,
landed a native attack, downloaded/imported the recording and sought to its end.
The replay combat snapshot exactly matches the captured live snapshot, including
health 100/92; recursive comparison reports zero differences. Screenshot review
confirms both outfits and names. Native takeover moves the fighter and retains
identity; legacy fallback and invalid catalog rejection pass. No browser errors
or failed requests occurred. Owned browser/isolated-host cleanup is complete.

Evidence is `.local/touch-of-death/replay-appearance-audit/`; the clean candidate is
`.local/touch-of-death/releases/replay-appearance-20260924/`. HTML SHA is
`989183d189557f3a00889eb0789c2c6f76be62ead0a6c35d10307ca148870d4d`; its source
project hash and combat identity are unchanged. The runtime is 1,209,488 bytes.
The shared guest host serves this export. No project or generated HTML was patched.
Public hosting/account recovery, hardware qualification, finished art, uploaded
image replays, animation/particle expression and package size gates remain open.

Manual check: save different looks on two clients, join a private match, land a
hit and Save replay. Leave, Watch a replay, seek to that hit, then take over each
side with ordinary movement/attack controls. Confirm names/outfits persist while
choices change the fight. A legacy file should show defaults; an unknown outfit
choice should produce an import error without changing current progress.
Changelog: replay downloads now retain initial fighter names, icons and authored
outfits across playback, seeking and takeover, with legacy-file compatibility.

### First-visit fighter continuity (2026-09-24)

The previous package audit found a concrete onboarding failure: saving a device
fighter still joined as a generic Guest until a separate publication action.
Ranked candidates were (1) first-visit continuity, frequent and directly testable;
(2) public identity recovery, high impact but dependent on hosted operations;
(3) additional cosmetic content, valuable but unable to repair the broken journey.
This loop selected the first item and preserved the combat rules and project data.

The client offers only a genuinely saved device name, icon and outfit. The host
validates and durably initializes revision zero before admission; existing profiles
stay unchanged. Drafts and unsaved defaults are not published. Loading, failed
reads and pending writes produce explicit errors. Manual replacement waits for a
durable acknowledgement. Failed initialization no longer invokes child-room leave
before admission, which could otherwise interrupt an untouched private room.

Browser verification caught a second failure: the private waiting dialog made
the publication button behind it inert. The existing profile controls now move
inside the active dialog and return to the live panel when it closes. A regression
checks keyboard focus and the single-node lifecycle. No duplicate profile state
or new editor capability was introduced.

Focused validation: 184 appearance/network/training/upload tests and 66 host
tests passed (1,571 and 10,116 assertions). The final modal regression matrix has
14 passing tests and 149 assertions. Source, test and scoped host types pass;
editor build and validated Build/download pass. Process policy has zero violations.
The repository source-structure gate still reports the unrelated PadPilot evaluator
at 38 files against its 36-file baseline; no baseline was raised.

Final packaged browser acceptance passed 13 checks with zero page errors or failed
requests: initialization before the peer joins, remote name/outfit, actual attack
contact confirmed by both peers, existing-profile preservation, keyboard publication
inside the modal and reload persistence. Desktop and 390px screenshots show readable,
reachable controls. Both owned browsers and isolated hosts were cleaned up.
Evidence is `.local/touch-of-death/profile-onboarding-audit/`; the prior modal failure
is retained. The clean package at
`.local/touch-of-death/releases/demo-loop-final-20260924/` has identical payload
hashes to the tested external installation and an empty data directory.
HTML SHA-256 is `818b73f20e5111b801192e6afafcf2421794e8b9367598247a457f6a6127e72a`.
The shared guest host now serves that exact export. Public deployment, recoverable
accounts, hardware/internet acceptance, finished character art and bundle-size
ceilings remain release gaps; local acceptance does not establish Steam quality.

Manual verification: save a named outfit in Your fighter; create a guest private
room; confirm the name before a friend joins; approach and hit through ordinary
controls. Leave, save a different device outfit and rejoin: the host fighter must
remain unchanged. Activate Use saved fighter online inside the waiting dialog,
wait for success, then reload and rejoin to confirm the replacement persists.
Try an unsaved draft and a failed storage write: neither may publish silently.

Changelog: saved fighters initialize new hosted profiles; existing profiles are
preserved; explicit replacement remains available in private waiting rooms;
initialization failures cannot accidentally close an untouched room. Matching
profile/community/Quick Play/training versions are now 3/8/7/3.

### Portrait resize evidence correction (2026-09-24)

The Quick Play narrow screenshot initially showed stretched fighters because the
fixture resized its viewport while animation frames were paused, then captured
the previous desktop frame. This falsifies that screenshot as camera evidence;
it does not demonstrate a renderer defect. No production change was needed.

Native rendering of the current `3febe9...` export correctly updates backing
dimensions at DPR 2 from 2560x1600 to 780x1688 and back, with increasing rendered
frame counts and normal fighter proportions. Evidence and fresh screenshots:
`.local/touch-of-death/quick-upload-ui/resize.json`, `resize-narrow.png` and
`resize-restored.png`; the old image is preserved as `stale-frame-narrow.png`.
The shared guest capture helper now advances frames and asserts backing/CSS
aspect and uniform pixel scaling after each resize. Guest and Quick Play upload
fixtures use it. A separate helper run passes four assertions at DPR 1 in
`quick-upload-ui/resize-helper/result.json`. Three camera tests (22 assertions)
also pass for portrait/landscape fitting and camera transitions. Browser errors
and owned process/window leftovers are empty. The old uploaded-fight narrow
image proves control layout only; native resize images provide the camera proof.
This is desktop-browser resize evidence, not physical-phone input qualification.

### Previous clothing-print candidate (2026-09-24)

Game HTML SHA-256:
`d9ad20a066c3ac4c7327e0678d050069919642c90136c57838740473e9ea5430`.
Embedded runtime SHA-256:
`5aebe1e0aa1ea40f0653cef75a9a4460aebdb61284f465323b9a1934270e5ba5`
(1,275,046 bytes). Canonical project SHA-256:
`1dc29c1bdfae259d3b6ce0faafd9893b850b323d525fe570194ee91fd9b22998`.
The runtime matches a fresh source build; the HTML comes from editor Build/download.

Audit: uploaded pictures could be reviewed and shared, but could not be worn.
The existing renderer accepted RGBA textures, while the portable runtime lacked
bounded replacement/reset and the wardrobe lacked explicit texture permissions.
The source rig already had UVs. Account storage, room requests and the wardrobe
inspector could support the feature without changing combat architecture.

Candidates for this pass, ranked by player impact, encounter frequency, usefulness
across skill levels, risk and testability:

| Rank | Candidate | Impact / frequency / audience | Risk / evidence |
| --- | --- | --- | --- |
| 1 | Wear approved clothing prints with durable receipts | High / every community fight / all skill levels | Medium; ownership, revision and browser tests |
| 2 | Clear stale pixels on hide, block, revocation and fighter reassignment | High / conditional but essential to trust / all players | Medium; asynchronous and two-renderer regression tests |
| 3 | Author dedicated targets and replace textures without changing combat | High for creators / every authored print / players and contributors | Low–medium; command rollback, editor controls and physical-state equality |
| 4 | Dedicated chest emblems and placement editing | Medium / optional expression / all players | More mesh/UV authoring; deferred |
| 5 | Animated prints and particle variants | Lower near-term / optional / all players | More readability and resource risk; deferred |

Selected the first three as one coherent player journey. Engine scene/runtime
texture replacement validates before mutation, copies pixels, preserves handles
and restores authored pixels. Each renderer drops obsolete GPU resources on its
next frame, even when the material stops using the texture. The optional catalog
`textureSlots` allow only dedicated opaque actor materials and declared texture
IDs. Existing palettes intentionally tint the image; alpha cannot hide the body.

The host upload service stores approved owned equipment in its existing serialized
revision/receipt lane. Rejection/removal clears references atomically; legacy
records migrate on write. Room equipment commands default to denied and this relay
permits them only in the waiting queue. Even empty-list readers receive invalidation,
so first-time equipment appears for peers. Gallery and background reads share one
bounded queue; stale responses cannot restore hidden or revoked presentation.

The editor exposes add/edit/remove image targets through the existing Apply
transaction. New wardrobe setup reserves a 128-square white texture per fighter.
The existing canonical project was upgraded through three validated commands,
request `tod-approved-top-print-20260924-01`, then reopened clean. Combat settings
and input bindings are unchanged. This uncovered and fixed explicit texture IDs
being silently slugified: supplied IDs now remain exact or reject before mutation.
Real editor verification also exposed a responsive navigation defect: a desktop
dock narrower than 900 pixels hid both the 3D side panels and their mobile-only
chooser. The chooser now follows container width and reserves its own row, without
resetting saved layouts. Objects → actor → Inspector → Custom image targets works
through visible controls at 1440 and 390 pixels.

Verification:

- 82 focused tests / 2,214 assertions pass across upload host/UI, catalog,
  editor authoring/parity, texture cooking and physical player/AI combat.
- 80 network regression tests / 683 assertions pass. Texture primitive tests
  passed 58 / 1,327 assertions before the final cache regression; the final
  renderer suite passes 19 / 126 assertions, including two-renderer cleanup.
- Editor and engine typechecks, build and installed-package consumer pass.
  Canonical reopen verifies seven persistence/content invariants.
- Image request-queue bound/copy tests pass 2 / 9 assertions. The editor layout fix
  passes 10 / 79 assertions; desktop/narrow screenshots and cleanup are recorded in
  `equipment-editor-result.json` and `equipment-editor-{desktop,narrow}.png` beside
  the game evidence. No forced hidden clicks or CSS overrides were used.
- Final-candidate three-browser acceptance passes 18 checks with no page errors,
  using native file selection and moderator controls,
  keyboard equip, same-owner reload, physical approach/jab and peer rendering.
  Checkerboard screenshots show UV mapping on the actual torso and sleeves;
  the 390-pixel controls remain readable. A real jab reduces defender health to 92.
  All three owned browser trees close with no processes or visible windows remaining.
  Evidence: `.local/touch-of-death/uploads-ui/equipment-result.json`,
  `equipment-torso.png`, `equipment-ui-narrow.png`, `equipment-persistence.json`.
  No damage/stun injection is used.
- Existing bundle ceilings still fail; no ceilings were raised. Source structure
  retains only the unrelated PadPilot evaluator directory excess (38/36).

Manual verification checklist:

1. Join a community room. Submit a PNG/JPEG and confirm pending images cannot be worn.
2. In the separate moderator page, preview and approve it. Refresh the owner's list,
   select Top print and activate Wear with Enter. Wait for the host save acknowledgement.
3. Reload and rejoin as the same account; refresh and confirm Top print remains equipped.
4. With another player, queue and Ready. Use ordinary movement and jab controls to
   make physical contact. Confirm the patterned torso remains attached through motion,
   resources/health react normally and defensive cues stay visible.
5. Hide uploaded images, then unhide. Block the owner, then unblock. Confirm the print
   disappears immediately and only returns after a permitted fresh read.
6. Reject or remove the equipped picture. Confirm peers lose the print and the owner's
   saved equipment clears. Retry a failed write with its original request identity.
7. In the editor, inspect the target's material/placeholder and try an invalid shared
   binding. Apply must reject without changing the catalog; save/reopen/export the valid one.

Remaining boundaries: prints currently belong to community-room account equipment,
not local outfit presets, Quick Play, private sets, training or replay files. A write
admitted just before a bout can finish during that transition; equipment is not frozen
into bout metadata. Separate emblem placement and late-spectator print acceptance
remain next work. Public hosting/authentication/TURN, reconnect/disconnect policy,
character art and cross-device acceptance still block the larger demo release.

Changelog: wear approved pictures as saved Top prints; expose editable image targets;
preserve explicit authored texture IDs; clear revoked/hidden textures and late reads;
retain identical player/AI combat while equipping and removing prints; keep 3D
Objects/Inspector navigation reachable inside narrow desktop docks.

### Earlier wardrobe and profile candidate (2026-09-24)

HTML SHA-256: `ff9db83920d3cc2dc3ccd60184242f27346d2f85d6678c3e904b2a8e0b6dd112`.
The managed preview at `http://127.0.0.1:8800` serves these exact bytes with
`Cache-Control: no-store`; an owned browser opened the live wardrobe preview.
Export Build/download also passed the full embedded-runtime freshness check.

The player gap was personal identity: every newcomer previously used the same
stand-in, with no durable outfit to keep or share after losing. This pass adds
three connected changes: authored interchangeable appearance, device outfit
saves with a live preview, and authenticated host profiles visible to other
players. Existing renderer variants avoid a new avatar or physics architecture.
The editor owns catalog authoring; the engine owns portable validation and frame
composition; host services own durable identity. All demo options are free.

Canonical request `tod-free-demo-wardrobe-20260924-01` completed one
`scene3d.setup-wardrobe` command and persisted a clean project with hash
`fda0377c48bfd70ef494bfdf3cfdfc3a50ea27969e20e13857f51d1fab52795d`.
Fresh reload verifies eleven slots, two actors and eight ordinary GLB assets.
Combat and project settings are unchanged. The source setup, editor inspector,
validated command and export use the same catalog; no generated HTML or canonical
project file was hand-edited. Before/plan/handoff/after evidence is under
`.local/touch-of-death/wardrobe/`.

Focused appearance, network, HUD, community and Quick Play verification passes
143 tests with 11,575 assertions. This includes 600 real-input simulation ticks
with AI and physical contacts: different rendered outfits preserve identical
combat snapshots and physics checkpoints. Failure coverage includes malformed
catalog/profile data, missing references, undo/rollback, failed and uncertain
writes, stale revisions and native keyboard input. A malformed host outfit now
interrupts the connection recoverably instead of throwing out of the render loop.
Editor source/test typechecks, engine build and installed-consumer verification
pass. Process policy passes 3,714 files with zero violations. Bundle ceilings
remain failing, and source structure still reports the unrelated PadPilot
evaluator baseline; no ceilings were raised.

The final export passes eight local wardrobe checks and twelve two-client online
checks: native equip, named outfit save/wear, real page reload, Escape discard,
explicit host publication, peer appearance/name/chat labels, queue/readiness,
physical combat and profile rejoin. Distinct jacket/crest and vest/bun choices
render in both clients. Desktop and 390px layouts were visually reviewed. Ten
read-only SQLite checks find exact names, icons and selections at revision one
with one durable receipt each. Four additional managed-preview checks verify the
served artifact. No browser errors or owned browser processes/windows remain.
Evidence: `browser-result.json`, `online-result.json`, `persistence.json` and
`preview.json` in the wardrobe directory.
The same final export also passes all nineteen four-client Quick Play checks:
39 real keyboard attacks earn a full first-to-three set, ratings persist at
1012/988, the other match remains isolated, and a 2,519-frame replay supports
download/import/takeover. Evidence is the current
`.local/touch-of-death/quick-play-ui/result.json`; all four browser trees cleaned up.

Manual verification:

1. Choose Your fighter. Change a top, hair, color, name and icon; inspect the live
   preview. Save a named outfit, change it, then Wear the saved outfit.
2. Save fighter and reload the page. Verify the name and outfit remain. Make an
   unsaved change and press Escape; reopening restores the saved choice.
3. Open two clients, join a winner-stays room as Watch, and choose Use saved fighter
   online. Verify both approved names and
   outfits, then join the queue and ready with ordinary controls.
4. Land actual attacks and defend. Verify appearance never changes movement,
   contact rules, resources or the visibility of defensive cues. Leave and rejoin;
   verify the host profile remains.
5. In the editor Wardrobe inspector, edit an option label or palette, Apply, Undo
   and Redo. Save/reload and build through the normal editor workflow.

Changelog: added free mix-and-match clothing, hair, faces and palettes; live
fighter preview and three named device outfits; explicit durable online profile
publication; profile names/icons in social views and fighter nameplates; matching
editor authoring/commands; recoverable rejection of incompatible host selections.

Remaining expression work includes higher-quality character art, uploaded
emblems/textures, particle/animation variants and cosmetic replay fidelity.
Public hosting/accounts, rated disconnect recovery, voice, shared training and
release bundle reductions remain required by the full demo goal.
