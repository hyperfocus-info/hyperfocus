# Touch of Death: uploads evidence

Historical evidence; [current guidance](../../touch-of-death-demo.md) owns current status and limits.

### Uploaded artwork in replays: implementation boundary (2026-09-24)

Audit: this is missing behavior, not a texture-rendering regression. Replay
appearance v1 deliberately retains only initial names, icons and catalog choices;
it rejects account IDs, remote URLs and extra fields. Playback leaves the online
room, while uploaded-image reads require current room membership/audience and
clear on departure. Reusing the live equipment loader would either fail access
or weaken those rules. Private/training equipment can also change during a bout;
the initial appearance must not be described as frame-by-frame cosmetic history.

The pending product choice is revocable, host-checked artwork versus permanent
embedded copies. Offline copies cannot honor later host removal or blocking.
Recommended implementation, if host-checked replay artwork is selected:

- The game service stores a bounded match-media manifest with initial seat/slot,
  upload/content identity and authorized viewers; the replay carries an opaque
  reference, never an access credential or an arbitrary fetch URL.
- The game offers explicit loading from the matching authenticated host, with
  catalog fallback offline. Hide remains immediately available. Host removal,
  rejection and bilateral blocking are rechecked, including while viewing.
- The service owns authorization, persistence and revocation; the game owns replay
  presentation and consent. Portable engine recording, physics and the editor's
  authored project model remain unchanged. No new editor view is justified for
  this account-media operation; existing texture-slot authoring remains its input.

Acceptance must include a real recorded fight, import/seek/either-side takeover,
correct initial seat binding, offline fallback, forged-reference denial, late-read
fencing, Hide, and moderator removal while playback is active. Keep this feature
open until its policy and complete journey are delivered; current downloaded
replays continue to omit uploaded pictures.

### Uploaded appearance in private fights and training (2026-09-24)

Audit: community/Quick Play supported images, but friends' bouts and shared
training omitted the host wrapper and client capability gates. The same account
therefore lost its visible expression when switching modes. Existing upload,
social membership, blocking and report services were sufficient; engine or
project changes were unnecessary.

Ranked candidates: (1) share existing images across those modes: high-frequency
continuity benefit, bounded integration risk, direct browser/persistence checks;
(2) record appearance in replays: useful but requires a separate recording asset
lifetime policy; (3) add more cosmetic asset categories: valuable later, but does
not repair disappearing equipment. Only the first was selected.

Private and training hosts now advertise explicit room-image capability with
bounded blocked-owner/error metadata. Current fighters share images with room
members; private spectators explicitly choose a fighter before block/report.
Membership cleanup covers failed admission, departure and disposal. Training
reset/swap, actor reassignment and transport changes fence old requests. Hide
combines local preferences with host blocks; reporting never requires displaying
pixels. Cosmetic equipment may change continuously in these modes because their
relay has no between-round phase; Pictures warns that combat continues.
Quick Play retains its idle/result equipment restriction.

Implementation stays in application profile/training wire contracts, the
`uploads/friends-room.ts` host wrapper, relay composition and the existing
connection/upload/panel modules. Profile and training protocol 2, community 7
and Quick Play 6 reject incompatible clients. Combat identity, replay simulation,
canonical project data and authored tuning are unchanged.

Validation: 166 app tests / 1,434 assertions and 63 host tests / 10,094 assertions
pass. App source/test types, scoped relay types, engine/editor builds and process
policy pass. Source structure still fails only the existing unrelated PadPilot
38-file directory against its 36-file baseline; no limits were raised.
Validated editor commands and Build/download produced
`8fdad3b6e064c19bfbe4f1ad185fe0a6492b9dd6749399355fd2ab7df98e1766`;
complete runtime comparison passes (1,206,263 bytes). Canonical project hash
remains `1dc29c1bdfae259d3b6ce0faafd9893b850b323d525fe570194ee91fd9b22998`.

The isolated exported journey passes 19 browser checks: immediate private
sharing/equipment, physical jab, spectator target choice, hidden metadata-only
report, block, reload, training carryover/unblock, physical training hit, mutual
swap/reset and departure cleanup. Two read-only SQLite checks prove one durable
report and unchanged pending equipment; a captured-state check verifies the
swapped owner's print/emblem on `actor-copy`. Desktop and 390px views were
reviewed. Zero page/request/host errors; all three browsers and the isolated host
were cleaned up. The idle shared demo was restarted and serves the exact export.
Evidence: `.local/touch-of-death/friends-images-ui/`. An initial fixture clicked
behind the correctly opened interruption modal; its failure is preserved and
the rerun uses visible Return to local play. Transport-outage and moderator
revocation were not rerun in this browser journey; focused host/client tests
cover those paths, with broader live-device acceptance still open.

Manual check: join a private fight, open Pictures, share and wear a print/emblem.
Confirm a peer sees it through a real hit. Hide it, report using metadata only,
then block. Reload and join training with the same identities; confirm the block
persists. Unblock, mutually swap sides and reset, check whose fighter wears the
image, then leave and confirm the local fighter has no downloaded artwork.

Changelog: account prints/emblems now follow players into private fights and
shared training, with spectator targeting, continuous cosmetic equipment changes
and the existing hide/block/report controls.

### Reporting an encountered image during Quick Play (2026-09-24)

Audit: immediate sharing worked, but Quick Play hid the gallery during combat,
leaving only hide/block at the point of encounter. Selected one high-leverage
fix: a compact live report chooser using existing equipment metadata and report
commands. Reusing the entire editing gallery would obscure combat and expose
unrelated actions; changing host authority or moderation rules was unnecessary.

**Report opponent image** is available during fights and paired screens. The
player selects an equipped image and reason, then sends explicitly. Local Hide
remains enabled; the chooser requests no raster. Shared images are labeled
unreviewed. The fight continues and Close returns focus to the arena. Pair,
transport and image changes clear stale selections; failed saves retry the exact
request. Blocks are respected and never silently undone. No simulation, project,
wire version or host API changes were needed.

Validation: 59 tests / 462 assertions pass, with editor source/test types, engine
build and process policy. Source structure still reports only the unrelated
PadPilot directory baseline. Final export
`3c2de941e98f465a8cf2ce3d62faef652bbc3765df26ed85db687e3e12d765ef`
passes complete runtime comparison (1,201,457 bytes); canonical project hash
remains `1dc29c1bdfae259d3b6ce0faafd9893b850b323d525fe570194ee91fd9b22998`.

The exported two-player journey passes 24 browser checks and two read-only SQLite
checks: real contact before/after reporting, one metadata list and one report with
zero image reads while hidden, native keyboard submission/close, restored guard,
stale-target cleanup and exactly one durable report. The image remains unreviewed
and equipped: reporting is not moderation. Desktop/390px evidence is readable;
the open form covers much of the narrow fight and explicitly says play continues.
Native screen-reader speech and nonvisual combat remain untested.

The shared loopback demo at `http://127.0.0.1:8801` now serves the current export
with Play as guest. Four additional browser checks prove matching artifact hash,
native guest Quick Play entry and leave without developer credentials. No public
hosting was provisioned. Isolated hosts/browsers cleaned; no browser/request/host
errors. Evidence: `.local/touch-of-death/live-image-report-ui/`. Failed fixture
assumptions about accessible labels and restored results, plus a stale startup
HTML mismatch, are preserved separately from the passing final run.

Manual check: encounter a shared print/emblem in Quick Play, enable Hide, choose
Report opponent image, select the image/reason and send. Keep Hide enabled and
confirm images stay absent. Close, guard and strike without clicking the arena.
Leave and start a new search; the former report selection must disappear.

Changelog: added live image reporting that respects hidden images and current
opponent identity; restored direct local guest access to the current export.
Public deployment, broader device qualification and the full demo gate remain open.

### Immediate upload sharing: owner decision implemented (2026-09-24)

The owner selected immediate visibility with hide/report, replacing the earlier
owner-only-until-approval default. Local previews remain local until **Share image**.
Shared images retain truthful `pending` review state and display **Shared
(unreviewed)**. They can be worn as Top prints and Profile emblems immediately.
Eligible room members/current Quick Play opponents can view and report them;
existing membership, bilateral blocking and explicit host audience checks remain.
Reports do not falsely approve or remove images. Trusted rejection deletes pixels,
clears equipment and invalidates clients afterward. File validation and limits
are unchanged. This section supersedes earlier approval-only acceptance notes.

Smallest coherent changes span host service/report authorization, shared equipment
validation, gallery/equipped rendering and copy. Community protocol 6 and Quick
Play protocol 5 reject clients with the former approval-only interpretation.
Combat identity, authored data and replay mechanics remain unchanged. No editor
project mutation is needed: uploads and review are account/service state.

Validation: 93 focused app/host tests / 10,312 assertions pass, covering immediate
unreviewed peer reads/equipment/reporting, SQLite reopen, exact retries, failed
saves, denied audiences, old clients and removal. Editor source/test types pass.
Final export `609a6b68a825b7b4d94f9700d6c64fad5a3561a7b530d11230770f2075834782`
was produced through validated editor commands and Build/download; complete
runtime source comparison passes (1,196,542 bytes). Canonical project hash remains
`1dc29c1bdfae259d3b6ce0faafd9893b850b323d525fe570194ee91fd9b22998`.

Two guest browsers plus the later moderator page pass 28 real browser checks and
two read-only SQLite checks. Native sharing, pending peer display/report, both
equipment slots, reload, a real Quick Play jab, native block/unblock, persistent
blocking, hide/unhide and final rejection all pass. The report persists once;
rejection leaves no equipped references. Desktop/390px screenshots were reviewed.
No page/request/host errors or owned process leaks remain. Evidence:
`.local/touch-of-death/immediate-upload-ui/`. The idle shared relay was restarted
with matching protocols; its process tree has no visible windows.

Manual check: in a friends' room, choose a PNG/JPEG and verify the draft remains
local. Share, wear both slots and have a second player view/report it before
moderator approval. Reload, enter Quick Play and land a real hit. Hide, block,
unblock and reload the block preference. Reject from the host review page and
verify neither client can restore the image by toggling hide or reloading.

Changelog: player-shared images are immediately visible and wearable, labeled
unreviewed, with durable reporting and existing hide/block/removal controls.
Public moderation operations and hosted internet/device acceptance remain open.

### Quick Play image controls: locally verified (2026-09-24)

Audit: the host accepts durable social blocks and filters uploaded pictures, but
Quick Play exposes only session-wide Hide uploaded images. Its gallery report
receipt tells players to use Block without offering that action in this mode.
Separately, a host can enable profile emblems without authored clothing slots,
but the gallery then shows the emblem slot without a Wear button.

Ranked candidates: (1) visible opponent block/unblock, high impact whenever an
unwanted image appears and directly testable through existing host policy;
(2) repair emblem-only equipment, smaller reach but a proven capability/UI
contradiction with a one-condition fix; (3) matchmaking avoidance, deferred because
social blocking does not currently promise opponent exclusion and changing queue
policy needs separate acceptance. Select the first two. No engine primitive,
authored project mutation, payment or combat permission change is needed.

The gallery regression reproduces for absent and empty texture-slot lists while
the existing mixed print/emblem case passes. Wear now uses the negotiated slot
list, and capability withdrawal removes the action. The exported control now
blocks/unblocks the current opponent from paired offer/result screens and the
live bar. It uses the existing durable social preference, not matchmaking
avoidance. Blocking hides immediately; unblocking waits for host state. Send/save
failures and confirmation timeouts offer retry. Pair changes discard pending
local overrides. All account state stays in the host; the app owns controls.

Implementation owners: `apps/engine-editor/src/scene3d/network/quick-play/image-block.ts`
owns the control, `network/panel.ts` mounts it and `network/connection.ts` restricts
commands to the current paired opponent. `scene3d/uploads/panel.ts` owns negotiated
equipment choices. `scene3d/input/ui-keyboard.ts` and `src/standalone-3d.ts` own
native focus routing. Existing host Quick Play/social services supply persistence
and visibility without modification.

The first exported keyboard journey found a real default-action bug: the live
Block button received focus, but the standalone mapped-key handler prevented
Enter's native activation. Panel input suppression alone did not protect browser
button behavior. The failed artifact `216434...` and ten preceding successful
checks are recorded in `.local/touch-of-death/quick-block-ui/native-enter-failure.json`.
Do not treat mouse-only activation or DOM click tests as acceptance of this path.

The corrected standalone focus boundary protects native buttons, selectors and
disclosures while leaving canvas combat input available. Final export SHA-256
`dd44757fa262f1359f4d4af4417994aaf354765a75bd086b4cc7cfc827d013a8`
passes 25 browser checks in `.local/touch-of-death/quick-block-ui/result.json`:
real keyboard jab contact, native Enter block, native Space unblock, correct
opponent ownership, retained owner artwork, persistence through guest reload and
another match, explicit undo, hide/show, moderator revocation and cleanup.
Fresh 390px screenshots show controls fitting below the fighters with no overflow.
This is desktop-browser resize evidence, not physical-phone qualification.
No browser/host errors or owned process/window leftovers remain.

The app network/uploads/HUD/replay/input matrix passes 192 tests; the host
Quick Play/social/upload audit passes 24 tests / 5,024 assertions. Focus ownership
unit tests establish routing; native activation is established by the browser
journey. Editor source/test types, engine build, installed-consumer build/recovery
and process policy pass. Bundle ceilings still fail, and source structure retains
the unrelated PadPilot 38/36 directory violation. No limits were raised.
The canonical project hash and combat content ID remain unchanged.

Manual checklist: join a supported Quick Play host with two browsers, with one
fighter wearing an approved print and emblem. Approach and jab with actual
controls. Focus Block opponent images and press Enter; both opponent images must
clear while the owner's own view remains. Press Space on Unblock; approved
images return after acknowledgement. Block again, leave, reload and rematch:
the block must persist without preventing pairing. Explicitly unblock, then
revoke the image in the moderator screen; Hide/Show must not restore it.

Changelog: Quick Play now provides durable opponent-image block/unblock with
honest scope and save failures. Native fight UI buttons retain keyboard
activation. Emblem-only hosts expose the same Wear workflow as clothing slots.

### Profile emblem: locally verified (2026-09-24)

Audit: approved clothing prints now follow players into Quick Play, but personal
identity still uses a fixed icon. A separate chest badge would require new
geometry and changes to combat attachment posing. A nameplate emblem reuses the
existing visible identity surface and bounded image pipeline with less risk.

Selected changes: (1) host-advertised account equipment slot `profile-emblem`,
using the existing approval, four-slot bound and durable equipment; (2) nameplate
canvas presentation beside the player's name with the ordinary icon as fallback;
(3) reuse the gallery, request lane and visibility lifecycle so clothing prints
and emblems work together. No engine primitive or canonical project value is
needed: this is host-owned account state rendered by the application.

Acceptance requires native submission/approval/equip, simultaneous clothing print
and emblem during physical contact, correct fighter ownership, saved references
after reload, and immediate hide/block/revoke cleanup without stale restoration.
Hosts must explicitly advertise emblem support before offering or displaying it.
Fresh export `281415061d4e9e19ef1d05c3c6c8d3e16d0e60c2392e7ed394f3f9efa620b49f`
passes 19 browser checks in `.local/touch-of-death/profile-emblem-ui/result.json`:
native submission and approval, both saved equipment references after reload,
community-to-Quick-Play continuity, exact approved pixels on the authenticated
fighter's nameplate, simultaneous clothing print and real keyboard jab contact,
hide/show, live revocation without stale restoration, and leave cleanup. Blocking
is covered by host/app tests, not this browser journey. Fresh narrow captures
verify rendering aspect and reachable controls, not physical-phone qualification.
Owned browsers and isolated host left no processes, visible windows or errors.

The host matrix passes 100 tests / 10,471 assertions; app network, uploads, HUD
and replay pass 164 tests / 1,392 assertions. Scoped types, engine build and
installed-consumer creation/build/preview/recovery pass. Existing bundle ceilings
still fail; no limits were raised. Canonical project bytes and combat content ID
are unchanged. Community protocol is now v5 and Quick Play v4, rejecting older
clients that cannot read the new explicit emblem capability.

Manual checklist: approve a submitted image, equip it as Top print and Profile
emblem, reload and join Quick Play with another browser. Approach and jab using
ordinary controls; verify both images belong to the correct fighter. Hide/show
uploaded images, then revoke the image through the moderator screen. Both images
must disappear, the fixed nameplate icon must return, and hide/show must not
restore revoked pixels. Leave and verify resources clear.

Changelog: approved pictures can personalize fighter nameplates as well as
clothing. Both persist between community rooms and Quick Play, with shared
approval, visibility and revocation rules. Private/training uploads, cosmetic
replays, public moderation and finished character art remain outstanding.

### Uploaded outfit continuity audit (2026-09-24)

Locally verified delivery slice: carry approved equipment from community rooms into Quick
Play. The selected changes are (1) explicit host capability and current-opponent
audience enforcement, (2) existing renderer integration with immediate hide/block
and revocation behavior, and (3) reuse the gallery between fights. These address
every player who changes modes without adding a second customization system.
Host policy owns admission, approval, storage and audience; the exported app owns
controls, negotiated requests and rendering. Equipment changes are allowed only
in idle/result, not searching, readiness, play or result persistence. No combat
rules or authored project data change. Native upload/review/equip, Quick Play
admission and physical contact with visible equipment, then hide/revocation and
cleanup now pass in the exported browser journey.

At audit, community equipment did not carry into Quick Play. The renderer could
target both fighters using profile bindings, but the app gated image
requests to community rooms. Quick Play lacked the upload wrapper, authenticated
social membership, block metadata and a reachable image-visibility control.
Simply enabling the renderer by room type would leave these contracts incomplete.

Ranked work: (1) correct shared audience membership on departure and failed
admission; (2) negotiate Quick Play upload support and carry block preferences;
(3) reuse equipment rendering and the gallery with between-fights controls;
(4) verify room-to-queue continuity, hide/revoke and real contact in the export.
The first item addresses a demonstrated host bug: social membership previously
survived departure indefinitely. The room upload wrapper separately checked live
owners, but direct service policy could still authorize former room peers.

Membership cleanup now belongs to the existing host social service and community
room lifecycle. Leaving and disposal revoke audience permission without deleting
durable equipment or communication preferences. Other active rooms keep their
membership. No engine primitive, authored project value or export change is needed
for this host fix. Quick Play now supplies the visibility and capability contract
through protocol v3. Unsupported hosts receive no image requests. Foreign reads
require the current opponent and are checked again after storage awaits; a changed
audience receives neither pixels nor metadata. Pair changes on the same connection
clear renderer/gallery caches and reject old queued responses.

Validation: the community/upload/voice suite passes 63 tests and 5,413 assertions,
including real physical set results and all three upload read paths after viewer
or owner departure. Rejoining restores permitted access; saved bilateral blocks
still deny it. Empty-room cache cleanup permits repeated temporary rooms without
exhausting the 128-room cache. The bounded person cache remains necessary for
historical message filtering and is not claimed to be a public-scale service.
Process policy passes; source structure retains only the unrelated PadPilot
directory-limit failure. No package build or authored export bytes changed.
An additional room-adapter regression passes 20 assertions for failed admission,
departure persistence failure and failed shutdown cleanup. The unchanged `4ae3fb…`
HTML passes all 20 guest browser checks against this host, including actual
Quick Play contact, room leave/rejoin and invitations; no browser or host errors.
Evidence: `.local/touch-of-death/guest-ui/result.json` (12:55 UTC run) and
`host-cleanup.json`. Owned browsers and the isolated host left no processes or
visible windows. Manual check: leave a room, verify a former peer cannot retrieve
its owner's image, then rejoin and verify approved equipment returns unless
blocked. This earlier membership check alone did not establish texture support.

Quick Play integration evidence: 93 host tests / 10,413 assertions and 143 app
tests / 1,210 assertions pass, including four-player pair isolation, all equipment
lock phases, pending/revoked pixels, blocks and stale response rejection. Source
and test types pass, as do package build and installed-consumer create/build/
preview/recovery. Bundle-size ceilings still fail; no limits were raised.

The editor Build/download path produced HTML SHA-256
`3febe9b0dcb4009f6b604004d84c6926964e29e694f3b349c62aa1f437ec5fbf`,
with full current-runtime verification and unchanged canonical project hash.
`.local/touch-of-death/quick-upload-ui/result.json` records 12 passing browser
checks: native PNG submission, moderator approval, community equip, leave,
Quick Play own preview, opponent texture, real keyboard jab contact, hide/show,
live moderator revocation and resource cleanup. Desktop and narrow screenshots
show the print and reachable live hide control. The first moderator attempt used
a stale revision and was correctly refused; refreshing the record allowed review.
No production fix was needed for that fixture correction. All owned browsers and
the isolated host were cleaned up without errors or visible windows. The shared
local relay was refreshed to protocol v3 after confirming it had no active clients.

Manual acceptance: upload and approve a print, equip it in a friends' room, leave
and enter Quick Play with a second browser. Search/accept, approach and jab with
ordinary controls; verify the print on the correct fighter. Toggle Hide uploaded
images during play. Refresh the moderator record and reject the print; verify
it disappears and cannot return after Hide/Show. Leave and verify texture cleanup.

Changelog: approved clothing prints follow players into Quick Play; the gallery
works between fights, live hide remains accessible, and host approval, blocking,
pair isolation and revocation apply throughout. Private/training modes, separate
emblems, cosmetic replay capture and public moderator operations remain unfinished.

### Earlier exported image-review candidate (2026-09-24)

Game HTML SHA-256:
`d2da82f9923fd23bcd93dadbbb84e3e42d72bf88a6f7e18895e3e039fca60903`.
Moderator bundle SHA-256:
`7f355d239078b253da2cb938ac908883195b49f223095bf2899f756692d936f9`
(25,603 bytes, loaded only by the separate host page). Both bundles match fresh
source builds. The game uses validated editor import and Build/download; canonical
project hash remains
`fda0377c48bfd70ef494bfdf3cfdfc3a50ea27969e20e13857f51d1fab52795d`.

Audit: pending upload storage and privacy worked, but there was no operator
journey to approve an image and no player report journey. Three connected fixes
were selected: durable image reports bound to visible server-verified content;
a separate authenticated, bounded host review API; and native moderator/player
controls that distinguish report resolution from image permission. These unlock
actual approved sharing while preserving ownership and clear receipts. Automatic
moderation, appeals and public staff accounts remain separate operational work;
equipping images on fighters remains the next cosmetic integration.

Host authority comes from explicit configuration, never a development player
token or command field. Access is verified before the queue appears. The screen
previews exact pixels before approval, checks revisions and requires explanations
for rejection/report resolution. Owner/report queues paginate twenty identities.
Tokens remain in page memory/headers; disconnect clears them and aborts requests.
These are account operations, not creative-editor project mutations. The engine's
existing persistence and recipient events suffice; no new engine primitive,
project schema, generated-file patch or editor command was introduced.

Validation: 120 focused upload/network tests pass with 1,037 assertions. Host HTTP
checks also pass with native Request globals, verifying credentials, foreign
origins, body limits and trusted identity. Editor source/test typechecks and
scoped host/relay TypeScript pass. Engine build and installed-consumer checks
pass; process policy reports 3,758 files and zero violations. Current editor/relay
instances have no unresolved structured errors or visible process windows.
Existing bundle ceilings and the unrelated PadPilot source-directory baseline
remain failures; neither was raised.

Twenty-two checks on the final export use two ordinary player browsers and a
separate moderator browser. They exercise local PNG selection, pending privacy,
denied moderator access, explicit pixel preview/approval, permitted peer reading,
owner-side bilateral block, player report acknowledgement, report resolution,
revocation of an already displayed image, credential cleanup, and owner
reload/rejection/removal. All owned browsers report zero uncaught errors and
clean process/window teardown. The narrow moderator layout was visually reviewed.
Evidence: `.local/touch-of-death/uploads-ui/moderation-result.json`, its native
control verifier and screenshot. No report/approval test injects combat results.
The same final game artifact also passes nineteen room-voice checks, including
native audio delivery, permission recovery, bilateral block and an ordinary
physical jab while voice remains connected. Evidence:
`.local/touch-of-death/voice-ui/result.json`.

Manual verification:

1. Configure the [local moderator page](../../../host/uploads/moderation.md),
   then submit an image from a player in a friends room. Another player must see
   no pending image. An ordinary player token must not grant moderator access.
2. Connect as the host, select the owner/picture, preview and approve. The other
   player explicitly opens the approved gallery and previews the same pixels.
3. Block the viewer from the owner's side. Their displayed image must clear.
   Unblock, reopen the gallery and report with a reason. Check saved/unreviewed
   feedback; there is no claim that a moderator has already acted.
4. Load that reporter's queue and inspect the report's actual image identity.
   Resolve with an explanation; image permission must stay unchanged.
5. Reject the image separately. Cached peer pixels must clear. Reload the owner's
   game and confirm the durable rejection/reason; remove it through normal UI.
6. Repeat with two moderators or a concurrent owner edit: stale revisions reject.
   Disconnect the review page while a request is pending; no late preview returns.

Changelog: added player image reports, local authenticated host review, explicit
approval/rejection, reasoned report resolution and approved-peer browser coverage.
The demo goal remains unfinished. Next connected work is equipping approved
emblems/textures without affecting combat; public identity/hosting, operational
moderation, reconnect/rated disconnect policy, art and bundle reduction remain.

### Earlier exported upload-storage candidate (2026-09-24)

HTML SHA-256: `d6e3675ce77a4780499bab2fad67ccc5236bbf7a95a33aa76c9188b23236516b`.
Editor import and Build/download passed full runtime freshness comparison. The
canonical project hash remains
`fda0377c48bfd70ef494bfdf3cfdfc3a50ea27969e20e13857f51d1fab52795d`.
The local preview at `http://127.0.0.1:8800` serves this artifact.

Audit: profiles only accepted authored catalog choices; there was no image
preview, storage, audience policy or revocation path. Three selected changes
establish the required upload boundary before equipping uploaded cosmetics:

1. Bounded raster preparation and validation: PNG/JPEG up to 2 MiB and 2048
   pixels per dimension become at most 128 by 128 RGBA pixels. Source filenames,
   metadata, URLs and encoded bytes never reach other players.
2. Durable authenticated ownership and review state: four images per account,
   exact retries, revision checks, bounded rates and owner-only pending previews.
   Approved reads require room membership and bilateral block permission.
3. Native room controls: explicit preview/submit, status, refresh, removal and
   approved-gallery requests. Hide/block, host revocation and departure clear
   downloaded canvases; stale responses cannot redraw them.

These serve personal expression and trust across skill levels without changing
combat or creating a new transport. The principal risks are untrusted image
allocation, asynchronous privacy changes and uncertain writes; focused failure
tests cover each. Rich cropping, animated uploads and arbitrary meshes are
lower-priority work. The pending visibility question uses the recommended
owner-only-until-approved default; it is not a recorded user selection.

Ownership: browser preparation/presentation lives in
`apps/engine-editor/src/scene3d/uploads/`; durable policy and room integration in
`packages/engine/examples/touch-of-death/host/uploads/`. Existing engine persistence and recipient-only
events are reused. This changes account/session data, not authored projects, so
no new editor command or project schema is needed. Equipping textures and authored
attachment slots still require their own visible editor/command journey.

Validation: 130 tests / 5,757 assertions pass across upload, room, network and
voice behavior, including real SQLite reopen, failed/uncertain commits,
concurrent revisions, approved reads, revocation and overtaken requests. Eleven
native Chromium codec checks pass. Twelve final-export checks prove local
preview/cancel, misleading MIME rejection, native Enter submission, pending
privacy, exact returned pixels, hide/unhide, game reload/rejoin and removal.
Narrow controls were visually reviewed; an inherited oversized checkbox was
corrected before the final export. Owned browsers have no uncaught errors,
remaining processes or visible windows.

Evidence: `.local/touch-of-death/uploads-ui/{result,raster-result}.json` and
their input-driven scripts. Nineteen voice/physical-jab checks passed the earlier
`5e4e4f8b3a53071d4fcc740cebfb4e8d0e8056537d4471767d769c2dca621d39`
candidate; the final change only adjusts checkbox layout. Editor source/test
types, engine build and installed-consumer validation pass. Process policy
passes 3,748 files. Existing bundle ceilings and the unrelated PadPilot evaluator
source-directory baseline still fail; neither was raised.

Manual verification:

1. Join a friends room. Choosing a PNG/JPEG must create a local preview without
   sending it. Cancel, choose an unsupported file, and confirm clear recovery.
2. Submit using Enter. Confirm one pending item and no picture in another
   member's approved gallery. Preview your stored image and compare its colors.
3. Hide images, then unhide. Old downloaded pixels must stay cleared. Reload the
   game, rejoin with the same identity and refresh to recover the stored item.
4. Remove the item. Confirm it disappears after refresh and cannot be read again.
5. After the moderator journey is implemented, approve an image and inspect it
   from a permitted peer; block, revoke and disconnect while a read is pending.
   This final approved-peer browser journey is still outstanding.

Changelog: added bounded image preparation, durable private submissions,
approved-gallery requests, safe retries and cache invalidation. This is not
completion of uploaded expression: moderator review UI, image reports and
equipping emblems/textures remain the next connected work. Public operations,
reconnect/disconnect policy, character art and bundle reduction also remain.
