# Touch of Death: recovery evidence

Historical evidence; [current guidance](../../touch-of-death-demo.md) owns current status and limits.

### Recovery keys: implementation and acceptance (2026-09-24)

Player problem: a saved look, rating and shared pictures had no way back after
cookie loss. This affects returning novices and experts alike. Ranked choices:
(1) downloadable recovery keys, high impact and locally testable without an email
provider; (2) email/passkeys, useful later but requiring additional service and
device acceptance; (3) more expiry copy, insufficient to restore an account.
The local demo implements the first, with email/passkeys retained as future work.

Three coherent changes implement the journey. The host stores bounded hashed
recovery keys separately from expiring login cookies. The game offers prepare,
download, explicit activation and import/restore under **Keep or restore your
fighter** before joining. The engine's optional sync/async `AuthAdapter.isCurrent`
rechecks authentication at admission boundaries, closing a revocation race while
joins await persistence or room callbacks. Existing adapters remain compatible.

Prepare preserves the old active key; only confirming a saved download replaces
it. Restore preserves the authenticated user ID, expires its old cookie/leases,
evicts live sessions using the existing duplicate-login/concession policy, and
then issues a new cookie. Active keys remain reusable after a lost response;
storage/eviction failures publish no new cookie and permit retry. A valid key
also restores through corrupt cookies; key setup still needs a valid identity.
Keys stay outside project files, public profiles, replays and invitations.

Host ownership: `packages/engine/examples/touch-of-death/host/guest-session` and the relay's live-session
eviction hook. Game UI ownership: `scene3d/network/hosted/recovery.ts` and
`recovery-panel.ts`. The engine primitive belongs to server authentication, not
combat. No creative-editor commands, tuning values, project mutations or combat
protocol changes are needed for host account credentials. Source/test types,
170 engine server tests, 14 guest service tests and 125 network/UI tests pass.
Engine build and installed consumer pass. Existing bundle ceilings and the
unrelated PadPilot source-directory limit still fail; limits were not increased.

The final extracted package passes 17 browser checks: native key download and
activation, second-browser restore through a corrupt cookie, saved identity/look,
old-session eviction, physical contacts, replacement and cancelled-request cleanup.
The key is absent from page text, game snapshots and an actual saved replay.
Desktop and 390px controls were inspected. Separate ownership/restart checks on
the identical host bundle earned a 1012 Quick Play rating through a physical hit
and explicit opponent concession, uploaded/equipped a print through the UI, then
restarted the host and restored both in a fresh browser with the same account.
No rating or combat state was injected to prove those outcomes. Human
key-management usability and public hosting remain unqualified.

Delivered HTML SHA-256:
`71a3788e3b5428437ee2771fba4dfa32e4c658b7141f4097c8e0d4bfcc83f6a8`;
runtime: `635011bc0d8ade141e78a1e1dd825fd5c2ab573674bfe2f41c76e12779fc760f`;
host: `81299c7229b1de87ea30410a9e7f7ae592cb386d291b51d5473bf3e3f00738b2`.
The clean package is `.local/touch-of-death/releases/recovery-key-final-v3-20260924/`.
Evidence and matching package/external-installation/shared-host receipts are in
`.local/touch-of-death/recovery-key-final-audit/` (final UI in `v3`, earned
rating/upload and restart evidence in `v2`). Owned test hosts/browsers were cleaned
up. The idle shared demo was refreshed without replacing its account database.
Project hash and assets remain unchanged. Changelog: add downloaded recovery keys
with explicit activation, replacement and restore; revoke old sessions including
in-flight admissions; preserve fighter identity after cookie loss and host restart.

Manual acceptance: save a fighter and activate a downloaded key; join a room.
Import that file in another browser and explicitly restore. Verify the saved
profile appears after joining and the old session can no longer fight. Restart
the disposable host, restore again, then replace the key through download and
confirmation; the old file must fail and the new file must work. Retry interrupted
requests without deleting either downloaded file. Check narrow screens and ensure
account credentials never appear in a replay or project export.

### Guest expiry diagnostics, preceding recovery keys (2026-09-24)

Current evidence: guest cookies and signing keys survive host restart, but losing
the cookie or reaching its fixed 30-day expiry loses access. Profiles, ratings
and uploaded equipment already belong to authenticated user IDs; recovery must
restore that ID rather than copy selected cosmetics into a new guest. The current
guest service suite passes six tests / 187 assertions, including persistence,
foreign-lease rejection, expiry and storage failure. These tests prove temporary
guest behavior, not recoverable accounts.

The audit reproduced an error-recovery defect: HTTP 401 for an expired account
cookie and an expired connection lease both appeared as "Leave and join again."
A fresh join can replace an expired lease, but the same expired cookie is rejected
again. `guest-session/service.ts` now supplies distinct bounded error codes and
`network/hosted/discovery.ts` maps them to local recovery copy. Identity loss no
longer promises restoration by rejoining; starting a new guest requires explicit
cookie removal. Rate limiting asks the player to wait. Unknown/legacy responses
receive generic verification guidance; host prose is never rendered. This fixes
diagnostics only, not account recovery, and never creates replacement identities
automatically. The interrupted panel now says "Online play interrupted" and
defers to the specific message instead of prescribing a new room for every
failure, including rejected admission before a bout begins. The exported baseline
exposed that contradictory generic guidance; the repair has a panel regression.
Service and network tests pass 128 cases / 1,251 assertions. Source/test types and
process policy pass. The final extracted package passes 11 browser checks:
expired identity and rejected lease show distinct guidance, desktop/390px copy
fits, and valid guests still make physical damaging contact. Owned browsers and
temporary hosts were cleaned up; no browser or shared-host errors were reported.
Evidence is in `.local/touch-of-death/guest-expiry-final-audit/`, including matching
package/installation file receipts and the refreshed shared host's response.
Delivered HTML SHA-256 is
`723e8a4a47c35218ac8ab0e6f9ccc0dc25dceb0759d624d62733ca0bfa21ad78`;
runtime SHA-256 is
`6432360a459be9bd0056fe0e41f6e6427c8630f5689ef3d8dd439400d5cef068`.
Project content, assets and protocol versions are unchanged. Changelog: distinguish
lost guest access from connection expiry; remove contradictory reconnect advice.

Manual check on a disposable host: expire one test account, join and confirm that
the game explains identity loss without promising recovery by rejoining. Return
to local play. With a valid account but expired lease, confirm rejoining retains
the same user ID. Join two valid guests and land a real hit. Never expire real
player records to perform this check.

### Full-suite socket recovery isolation (2026-09-24)

Following the size-gate stop, running the skipped package smoke and full engine
tests independently exposed three socket-recovery failures: 1,946 tests passed,
but refused connections, admission timeouts and throwing sends emitted unhandled
`ws` errors. The four recovery tests passed alone. Loading the Canvas DOM fixture
before them reproduced the failures without running unrelated test bodies.

Cause: direct Happy DOM registration replaced the native WebSocket used by the
real-network fixtures. `src/test-support/register-dom.ts` now preserves that
constructor while installing DOM APIs; Canvas, renderer and UI tests share it.
The regression verifies constructor preservation and idempotent DOM setup. This
fix changes test infrastructure only, not the production transport or game rules.

Verification: the combined Canvas/recovery/registration group passes 11 tests,
standalone registration passes, test types and package smoke pass, and the full
engine suite reports 1,950 passes / zero failures / 246,585 assertions across 295
files. Before/after logs are retained under
`.local/touch-of-death/offline-release-audit/engine-tests*.log`.
The existing bundle ceilings and unrelated PadPilot source-directory limit
remain release-gate failures. No budget was raised and the HTML remains unchanged.

The first-match audit also confirmed default level 5 and an unexplained numerical
difficulty selector. All 37 focused AI/match tests pass, including reaction delay,
unsafe lower-level commitments and shared defensive permissions. The earlier
failed scripted level-5 approach does not establish novice difficulty; real
newcomer testing and clearer difficulty guidance remain open. No AI tuning was
changed on that evidence.

### Background sessions and terminal close policy (2026-09-24)

Current HTML SHA-256:
`a0d99f31d644162ab210e82d9b1d692c0d21b7e4597c6a946b48c006b4591749`.
Runtime SHA-256:
`c381de4515e32076fa6bc8ff95c7758f3fd8fb804a8ddbc0fe9f41fbeb316cca`
(1,279,066 bytes). Canonical project remains
`1dc29c1bdfae259d3b6ce0faafd9893b850b323d525fe570194ee91fd9b22998`.
Editor command loading and Build/download produced this artifact; full embedded
runtime verification passes. No canonical data, presets or generated HTML were
manually patched. Network identity is now `combat-v5:` because earlier hosts do
not implement the reserved suspension close code.

Audit: brief accidental outages already recovered, but `visibilitychange`
immediately ended every connected session, including lobbies and viewers.
Recoverable transport existed underneath that policy. Separately, unusual client
close codes became the legacy `disconnect` reason, which the game classified as
an unrated interruption. A custom or empty close could therefore evade a loss.
The existing release latch could also miss a genuine keyboard release/repress
between rendered frames. These affect casual social participation and competitive
trust; another cosmetic variant would not fix them.

Ranked candidates (impact / frequency / shared novice-expert benefit / risk /
testability):

| Rank | Candidate | Assessment | Decision |
| --- | --- | --- | --- |
| 1 | Keep hidden social sessions connected | High / frequent / high / low / lifecycle tests | Selected |
| 2 | Bounded fighter absence with reliable return controls | High / common / high / medium / real transport plus handler tests | Selected |
| 3 | Classify every terminal client close consistently | High / occasional / high / low / real socket and durable-result tests | Selected |
| 4 | Restore worlds after a reload or host restart | High / occasional / high / high / requires persistent world restoration | Deferred |
| 5 | Add another outfit or particle variant | Medium / frequent / medium / medium / visual review | Later expression work |

Implementation and ownership:

- Engine `net/authoritative-client.ts` and `authoritative-connection.ts` expose
  `close({ mode: 'suspend' })`. It uses browser-safe code 4002, stops retries and
  waits for explicit `connect()` with fresh token acquisition. Server admission
  reserves the existing seat under the already configured grace period. Internal
  send failures use the same recoverable code. Normal `close()` remains terminal.
- App `network/connection.ts` retains hidden lobby/viewer sockets, suspends a live
  hidden fighter, and resumes its existing timeline when visible. Rapid transitions
  cannot let an obsolete resume rejection terminate a newer suspension. A hidden
  lobby that becomes a live fighter suspends immediately, before sampling input.
  `standalone-3d.ts` connects the document event and captures held controls;
  `training/release-input.ts` now observes physical keyup immediately, so release
  and repress between frames counts correctly without accepting a continuously
  held button. Gamepad releases continue to follow actual polling.
- On recovery-enabled hosts, terminal nonrecoverable client codes produce
  `connection-close`; Quick Play/KOTH include it in their existing durable
  concession policy. Empty close frames and custom 4000 cannot masquerade as host
  failure. Ready cancellation, host shutdown and already judged result priority
  remain unchanged. Engine consumers with recovery disabled retain their legacy
  disconnect behavior.

The local host still authors a ten-second transport grace in `relay.ts`; no new
combat/editor-project setting is needed. Lobby/viewer voice remains connected.
An absent fighter releases microphone capture and must explicitly rejoin voice.
This is a bounded live-client suspension, not a local save, rewind or free escape.
The frozen conversion resumes with the same trajectory, commitment and resources.

Focused validation: 102 app/training tests (893 assertions), 45 host policy/room
tests (9,806 assertions), and 31 real transport/client tests (141 assertions) pass.
Coverage includes same-seat return, rapid transition races, hidden admission,
spectator history, timeout, empty/custom close frames, real contacts, failed
result saves, exactly-once outcomes and release/repress between frames. Engine
build, installed-consumer verification and editor types pass. Process policy has
3,776 files with zero violations. Source structure has only the unrelated existing
PadPilot evaluator directory violation; lifecycle tests were grouped without
raising the network directory limit. Bundle ceilings remain failing.

Final exported evidence is deliberately split:

- `.local/touch-of-death/visibility-ui/result.json`: 16 checks using actual
  WebSocket closure code 4000 after native movement/jab contacts, preserved earlier
  recovery behavior, durable rotation and a subsequent ten-second timeout. No
  uncaught browser errors; all owned browsers/proxies were released.
- `.local/touch-of-death/visibility-ui/synthetic/result.json`: 21 checks labeled
  **synthetic visibility handler integration**. Only the test context supplies
  visibility getters/events; physical key inputs, contacts and socket suspension
  are real. It proves the exported handler wiring, lobby/viewer retention, same
  fighter timeline on return, no held-key attack, rapid keyup/keydown with no
  intervening RAF, and exactly-once absence expiry. It does not prove browser
  delivery of native visibility events. The earlier failed unsampled-release
  report is retained as the reproduction for the keyboard fix.

The final standalone measures 1,262,484 raw / 388,171 gzip / 313,831 Brotli bytes;
the total distribution is 5,008,811 / 1,575,688 / 1,317,235. Ceilings were not raised.

Native visibility acceptance is **not proven** in this environment: the owned
headless browser stays `visible` after a real second-tab activation, native window
minimization and CDP lifecycle freeze. `.local/touch-of-death/visibility-ui/primitive.json`
records those observations and clean browser disposal. Synthetic handler tests
are labeled separately and must not be presented as proof of native tab behavior.

Manual acceptance still required in a normal browser:

1. Join a lobby, switch tabs and return: membership, queue intent and voice remain.
2. Watch a physical bout, switch tabs, then return: the viewer catches up while
   fighters continue; no fighter input or rematch authority appears.
3. Earn a physical hit as a fighter. Switch tabs for fewer than ten seconds and
   return: the same fight resumes without healing, altered resources or invented
   inputs. Hold Jab through the transition: no fresh attack until release. Release
   and repress rapidly: the new action must respect ordinary startup/recovery.
4. Stay away beyond ten seconds: scored rooms settle one loss, training interrupts,
   and a late return cannot revive the expired attempt or award another result.
5. Repeat in Quick Play and shared training with a physical controller. Confirm
   microphone capture remains off after a fighter resumes until explicitly joined.

Changelog: keep lobby/viewer sessions when backgrounded; give live fighter tabs
the existing bounded return window; preserve genuine fresh presses after return;
settle unusual terminal client closes as normal departures. Remaining release
work includes native browser/device acceptance, public identity/hosting/TURN,
finished character art, expression breadth and bundle reduction. The delivery
goal remains active.

### Live connection recovery and durable concessions (2026-09-24)

Game HTML SHA-256:
`8e9f5229756e4c3d3040f62eb542da096b08cfc2f93504171af813950beb3d68`.
Embedded runtime SHA-256:
`7461f7c89c3ed8a6d3cb5180f06a3ae292ca4b1f8d3680aafbb230809c027102`
(1,278,224 bytes). Canonical project remains
`1dc29c1bdfae259d3b6ce0faafd9893b850b323d525fe570194ee91fd9b22998`.
Editor commands load that unchanged project; Build/download produces the HTML,
whose complete embedded runtime matches a fresh source build.

Audit: real physical online sets, recorded inputs, host-judged results, persistent
ratings and room rotation worked. However, the app disabled transport retries,
admission replaced player IDs, and combat treated departures as permanent.
Unfinished rated disconnects aborted without a loss. Training's lifecycle parser
also could not represent recovery. These are shared novice/expert trust failures;
new cosmetic polish would not fix them. Existing admission, rollback and durable
completion boundaries allow bounded fixes without a new combat architecture.

Candidates ranked by impact, encounter frequency, benefit across skill levels,
risk and testability (high benefit/frequency is desirable; low risk is desirable):

| Rank | Candidate | Impact / frequency / shared benefit | Risk | Testability | Decision |
| --- | --- | --- | --- | --- | --- |
| 1 | Preserve live fights through brief transport loss | High / medium / high | Medium | Real sockets and deterministic contacts | Selected |
| 2 | Prevent departures erasing losses | High / medium / high | Medium | Durable failure/reopen tests | Selected |
| 3 | Explain recovery and release stale media/pictures | High / every outage / high | Low | UI, resource and browser checks | Selected |
| 4 | Restore fights after page reload or host restart | High / lower / high | High | Requires durable world/input restoration | Deferred |
| 5 | Public identity, hosting and internet/device qualification | High / every public visit / high | High | Needs deployment and real devices | Release work remains |

The three selected changes:

1. The engine server's opt-in `reconnectGraceMs` reserves the same authenticated
   player, room capacity and seat. Default zero preserves existing consumers;
   this local host selects 10,000 ms. Unexpected close codes reserve; explicit
   leave and timeout terminate. Fresh matching authentication reattaches without
   another room join. Generic client retries survive refused attempts and send
   failures; stale sockets cannot affect replacements. Queued private events
   remain pinned to their original connection. Fighters freeze sampling and retry
   exact unacknowledged inputs after the resumed snapshot; spectators retry their
   confirmed cursor. Training keeps the same attempt and normal combat rules.
2. Quick Play and KOTH route leave, duplicate live login and recovery timeout
   through existing durable completion. Already judged results take priority.
   First terminal departure in host order resolves simultaneous departures once,
   including storage failure/retry. Ready cancellation and unfinished host
   shutdown remain unrated. No health, stun or knockout is fabricated.
3. The app shows recovery, labels the live fighter action **Concede and leave**,
   releases held inputs across recovery, stops voice capture and clears downloaded
   pictures. Reconnection closes any retained voice membership without automatic
   microphone reacquisition; pictures reload through current permissions. Other
   connected members keep their voice/pictures while a fighter is recovering.

Ownership: portable reservation/transport code lives in engine `server/runtime`
and `net/authoritative-connection.ts`; combat recovery in
`project/3d/combat-rollback/{session,spectator}.ts` and `server/combat-room/room.ts`.
App connection/panel/voice/upload code owns visible state and media resources.
`packages/engine/examples/touch-of-death/host/{community,quick-play,training}` owns host policy and
durable results; `relay.ts` selects the grace period. No new authored combat value
or editor project mutation is required. Runtime identity advances to `combat-v4:`
because older clients cannot interpret recovery. Old replay identities are not
migrated; retain the matching older export to play those recordings.

Validation:

- 130 engine/host tests, 19,210 assertions: real socket retry/exhaustion,
  reservations, private-event fencing, actual-contact recovery, rollback limits,
  recordings/audio, durable results, replay/training and ordinary AI legality.
- 122 app/upload/training tests, 1,055 assertions: successful and rejected retry,
  changed-seat rejection, initial/remote recovery, cursor retry, training lifecycle,
  explicit concession labels, media cleanup and existing connection flows.
- Engine build, installed-consumer verification and editor source/test typechecks pass. Process policy reports
  3,775 files and zero violations. Source structure has only the existing unrelated
  PadPilot evaluator directory violation (38 files against baseline 36).
- Bundle budgets still fail: standalone 1,261,665 raw / 387,916 gzip / 313,716
  Brotli bytes. No ceilings were raised.
- Exported three-browser acceptance passes 16 checks with a transparent fault
  proxy cutting actual sockets. Native movement and jab inputs cause physical
  damage before and after recovery; fighter IDs, match and history survive;
  a spectator recovers independently; explicit leave rotates once; a subsequent
  outage beyond ten seconds awards exactly one further result. No uncaught browser
  errors; owned browser processes and visible windows are gone. Evidence:
  `.local/touch-of-death/recovery-ui/{browser.ts,result.json,recovering.png,result-narrow.png}`.
- Direct exported Quick Play/training acceptance passes 19 checks. Both modes
  retain player IDs, match/attempt, timeline and earned health through real outages
  and refused retries, then accept further physical contacts. Concession records
  ratings 1012/988 once and survives the loser's rejoin. Mutual training reset
  works after recovery. Evidence: `recovery-ui/modes-{browser.ts,result.json}`.
- Three-browser real WebRTC/RTP acceptance passes nine checks with synthetic
  microphones. Only the disconnected fighter loses capture; other participants
  keep voice. Reconnect clears abandoned host membership without reacquiring the
  microphone; explicit rejoin captures once and starts muted. Evidence:
  `recovery-ui/media-{browser.ts,result.json}`. All owned proxies/browsers close.
- Browser rotation exposed a valid old spectator cursor arriving after handoff.
  The host now ignores that stale request without a room-wide error or changing
  successor history; malformed cursors still reject. The eight-test room suite
  passes 4,781 assertions, including the physical-rotation regression.

Manual verification with real controls:

1. Join two distinct users and a watcher in a winner-stays room. Queue and ready
   both fighters; move into reach and press Jab. Confirm health loss and contact.
2. Cut one fighter's network while leaving the tab open. Confirm recovery text,
   frozen combat input and retained seat. Restore within ten seconds; move and jab
   again. Both clients must agree on the continuing fight.
3. Cut only the watcher's connection. Fighters must continue; restore and check
   that viewing catches up without replacing the fight or enabling attacks.
4. Choose **Concede and leave** during play. The opponent gets one result, the
   next queued player receives Ready, and repeated/stale messages cannot add wins.
5. Repeat with a connection absent beyond ten seconds. Restore it afterward;
   the expired fight cannot resume or change its saved result.
6. In shared training, repeat a short outage before proposing a mutual reset.
   In Quick Play, check the single persisted rating result after a concession.
   Both direct exported outage journeys and engine/app/host regressions pass.
7. During voice/picture use, cut and restore the connection. Microphone capture
   must remain off until explicitly joined, and hidden/blocked/revoked pictures
   must not return from stale cached permissions. Voice outage acceptance and
   resource tests pass; combined approved-print outage/revocation acceptance
   remains to be run.

Limits: page reload, client crash and host restart are not resumable fights.
This candidate still interrupted hidden tabs immediately; the newer background
session pass above replaces that policy. Public accounts, hosting,
TURN, real network/device testing, finished character art and bundle reduction
still block the full demo-quality claim. The full delivery goal remains active.

Changelog: resume brief fighter/spectator outages with the same input timeline;
preserve shared training attempts; save terminal departures as durable losses;
show concession/recovery controls; release microphone and uploaded-image resources
across interruptions; reject older incompatible network exports.

### Exported session-recovery candidate (2026-09-24)

HTML SHA-256: `17d7d63866b010a96c5a0fe7a532d5cf3f7b8146ff64946618281823c8c7ab2e`.
Canonical project remains unchanged. Duplicate sign-in now closes the old socket
with terminal code 4001 and a clear reason. Automatic reconnect cannot steal the
replacement session; explicit sign-in remains available. Nine exported two-browser
checks prove waiting-room supersession, a visible narrow-screen recovery action,
keyboard return, deliberate re-entry and subsequent local AI play. Evidence:
`.local/touch-of-death/session-recovery/verify.json` and its screenshot. The real
WebSocket regression also covers an unrelated account and exact presence cleanup.
Twenty focused client/supersession tests, source/test typechecks, engine build and
installed consumer pass. Bundle ceilings remain failing.
