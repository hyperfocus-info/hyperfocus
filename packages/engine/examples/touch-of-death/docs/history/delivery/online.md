# Touch of Death: online evidence

Historical evidence; [current guidance](../../touch-of-death-demo.md) owns current status and limits.

### Voice participant reports: delivered (2026-09-24)

Audit found two concrete local implementation gaps in accepted scope: voice
participant reports and player-selected animation/particle cosmetics. Voice
reporting ranks first for impact on community trust, encounter frequency,
bounded implementation and testability. Existing text reports require a message
ID and cannot represent a voice incident. Cosmetic variants remain next work;
uploaded replay artwork remains a separate policy choice.

The game now offers **Report voice** for a visible participant on supporting
hosts. Choose a fixed reason and Send; a separate private receipt confirms durable
storage, never human review or verification of speech. Reports contain room,
authenticated user/session identities, request ID, reason and timestamp. No audio,
SDP, ICE or credentials are accepted. Mute and leave retain their own controls and
budgets. An open report stays usable after blocking a previously visible peer
while its session remains current. New reports cannot target departed, unobserved,
self or superseded sessions. Exact saved retries remain idempotent after departure.

The host retains at most 64 reports per reporter, allows four new incidents per
minute and bounds attempts separately. Storage failures return retryable errors;
uncertain commits reuse the request ID. The client waits up to ten seconds for a
receipt, retains the same reason/request on retry and fences cancellation/session
changes. Late failures cannot undo an acknowledged success. Community protocol 9
advertises reporting capability and rejects mismatched older community clients.

Ownership: `packages/engine/examples/touch-of-death/host/voice` stores and authorizes incidents through
the existing host persistence adapter; `scene3d/network/voice` owns protocol and
player controls, with private event routing in the connection adapter. No engine
primitive, creative-editor view, authored tuning or canonical asset mutation is
needed. The existing editor command load and visible Build/download produced the
fresh export; both canonical project and asset hashes remain unchanged.

Validation: 171 network/voice/community tests pass (6,300 assertions), along with
editor source/test and host typechecks, editor build and process policy. Fifteen
checks against the package installed outside the checkout exercise real WebRTC
with synthetic microphones, cancel without submission, native report submission,
unchanged mic consent, mute/block and track cleanup. Exactly one metadata-only
incident survives an actual host restart. Desktop and 390px controls were inspected.
No browser/request/host errors remain; owned test processes were cleaned up.
Existing bundle ceilings and the unrelated PadPilot source-structure failure
remain unresolved; no limits were raised. Physical devices, public TURN and
staffed moderation are not established by these tests.

Release: `.local/touch-of-death/releases/voice-report-final-20260924/`.
HTML SHA-256: `ba0a5ed94a7d1bd569d96f86446d4c769bcdd6601e4fac2d3f98cad4e2ecd33a`;
runtime: `de36055335555285f7d83eaa612b4067feabdfd9c25825d2f7ddeef64b90b53c`;
host: `c5b9d28d9492e9e844dc8bb754d9ccf57beb8e1a73bf762c508ef565ed681df4`.
Evidence: `.local/touch-of-death/voice-report-audit/`. The release contains no
account data; external payloads match its manifest. The idle shared demo was
refreshed with the validated artifact while preserving its database.

Manual acceptance: join a friends' room with two voice participants, open Report
voice, cancel, reopen, select a reason and Send. Expect one saved receipt without
mic changes. Mute/block the participant and leave; capture must stop. Review the
metadata record after a host restart. Changelog: add durable participant voice
reports, explicit acknowledgements and safe retries without recording audio.

### Earlier exported room-voice candidate (2026-09-24)

HTML SHA-256: `f5f8a52fc8da77e38d615314a92a7cc743c30ceebc02a035b2d9e8a6e56cc48f`.
The managed preview at `http://127.0.0.1:8800` serves this artifact. Validated
editor import and Build/download passed full runtime freshness comparison;
canonical project hash remains
`fda0377c48bfd70ef494bfdf3cfdfc3a50ea27969e20e13857f51d1fab52795d`.

Audit: text, spectator rotation, blocking and physical sets already worked,
but friends could not talk within the game. The existing broadcast-only event
path also could not privately route peer signaling. Three selected changes,
ranked by dependency and leverage, address this gap:

1. Recipient-scoped transient engine events: a small testable primitive with
   membership filtering and no browser or game policy in the engine.
2. Authenticated app-owned voice admission/signaling: explicit opt-in, eight-peer
   cap, bilateral block, bounded messages/rates and stale-session rejection.
3. Native voice controls and browser resource ownership: join muted, acknowledged
   unmute, immediate mute/deafen, persistent battle mute and complete cleanup.

These improve social participation for both learners and experienced players on
every room visit. Risk is concentrated in asynchronous permission/peer lifetimes,
covered by success and failure tests. Spatial audio, voice cosmetics and extra
channels remain lower-leverage polish. No authored project values changed;
ICE credentials belong to host configuration, never editor project data.

Validation: 140 focused tests / 5,734 assertions pass across engine transport,
community host and network UI. Nineteen checks on the final export use three
owned Chromium browsers and native WebRTC with synthetic audio devices. They
prove actual received audio energy, real permission denial/recovery, opted-out
signal privacy, mute/deafen/block, fighter/spectator continuity, movement and
physical jab contact, combat-only replay saving and microphone cleanup. There
are no uncaught browser errors or leaked browser processes/windows. Evidence:
`.local/touch-of-death/voice-ui/result.json` and its input-driven verifier;
the narrow room/microphone controls were visually reviewed.

The same final artifact also passes fifteen shared-training browser checks,
including physical block/hit, mutual reset/swap, thirteen jabs to KO and an
832-frame replay with takeover. Editor source/test typechecks pass. Process
policy passes 3,735 files; current editor/relay instances have no unresolved
structured errors and their managed process trees have no visible windows.

Engine build and installed-consumer verification pass. Existing bundle ceilings
still fail and were not raised; source structure reports the unrelated PadPilot
evaluator directory baseline. Public hosting/authentication, TURN deployment,
physical microphone/speaker acceptance, active-fight recovery, rated disconnect
policy and safe uploaded expression remain release work.

Manual verification:

1. Join the same community room on two devices. Admission must not request a
   microphone. Choose Join voice; deny permission on one side and keep chatting.
2. Grant permission and retry. Both microphones start muted. Unmute explicitly;
   verify real speech and headphones, then mute using the persistent battle button.
3. Mute a person, deafen, undeafen and block/unblock. Undeafen must keep your
   microphone off; blocking must remove both directions without silencing others.
4. Queue, ready and fight using WASD/J/L while another person spectates. Voice
   must survive the seat transition. Save a replay and verify normal playback.
5. Unplug or revoke the microphone, leave voice and leave the room. Check browser
   capture indicators stop and rejoining starts muted. Test keyboard and touch.
6. Repeat across real internet connections with configured TURN and HTTPS; local
   synthetic-device evidence does not establish public connectivity or quality.

Changelog: added opt-in room voice, private signaling, immediate mute/deafen,
block-aware peers, permission recovery and a microphone control during fights.
The complete demo goal remains unfinished; this is local acceptance evidence.

### Earlier exported shared-training candidate (2026-09-24)

HTML SHA-256: `a0a0880f043a33edd6afa6031423896b5d252b7d35176abac38fbf2c1427e855`.
The managed preview at `http://127.0.0.1:8800` serves these exact bytes with
`Cache-Control: no-store`. The editor Build/download passes the complete runtime
freshness comparison. Canonical project hash remains
`fda0377c48bfd70ef494bfdf3cfdfc3a50ea27969e20e13857f51d1fab52795d`;
no authored data or generated HTML was manually patched.

Audit: independent human input, rollback, local Practice and replay already worked,
but every network session constructed a scored set. Friends could not safely
repeat an exchange or swap roles. Recreating a session also risked interpreting
a physically held controller button as a fresh guard or Drive press.

This pass selects three connected fixes: explicit engine training/replay mode;
an app-owned room with mutual reset/swap consent; and native session controls with
held-input release protection. They directly improve learning together and expert
lab work, reuse the existing solver/relay, and admit physical-input regressions.
Arbitrary bookmarks and shared drill authoring remain lower-priority extensions;
public admission/recovery remain higher-impact release blockers requiring their
own complete service journey. No new project schema or editor mutation is needed:
these controls own live sessions, while existing editor views own combat tuning.

Both partners retain real damage, stamina, commitment and defensive permissions.
KO remains for review. Only mutual consent within fifteen seconds replaces the
attempt with a new identity at the authored start; swap reverses authenticated
seats. Decline, expiry and stale requests cannot erase the current exchange.
Training recordings use an explicit version-two mode; version-one set files
remain compatible. No health/stun injection validates these behaviors.

Validation: 134 focused regressions pass with 15,157 assertions across network UI,
host policy, recording, rollback, match and Practice. A 950-frame real-contact
test agrees across delayed peers, spectator and replay; both seats also exercise
hit, held block and fresh parry. Editor source/test types, engine source/test
types, build and installed-consumer verification pass. Process policy passes
3,724 files without violations. Bundle ceilings still fail; the source-structure
failure remains the unrelated PadPilot evaluator baseline. Neither was raised.

The final export passes fifteen two-browser training checks, including native
Enter/Space consent, blocked jab (guard 100 to 88; nonlethal chip 2.8), physical
hit, declined reset, accepted reset, held-guard release, seat swap, thirteen jabs
to KO, and an 831-frame downloaded replay with takeover. Nineteen four-browser
Quick Play regression checks pass on the same artifact: isolated pairings, 39
physical jabs to a complete set, durable 1012/988 ratings, rejoin and 2,516-frame
replay takeover. All owned browsers report zero uncaught errors and clean process
and visible-window teardown. Narrow training controls were visually reviewed.
Evidence: `.local/touch-of-death/training-ui/{result,preview}.json`, its screenshot
and input-driven verifier; `.local/touch-of-death/quick-play-ui/result.json`.

Manual verification:

1. Open Play with friends, choose Shared training, and join the same host/room
   with two distinct user tokens. The first waits for a human partner.
2. Approach with WASD; hold L to block J, then release guard and land a jab.
   Confirm guard cost/chip differ from the unblocked hit.
3. Open Training and propose reset. Decline on the partner: damage stays.
   Propose again and accept with Enter: both reset on the same connections.
4. Hold guard or Drive through acceptance. Release and press again before that
   action can start. Verify this with a physical controller as well as keyboard.
5. Propose side swap and accept with Space. The seat label and controlled fighter
   change together. Earn KO using ordinary attacks; it must not award a set or
   refill health. Save replay, leave, import and take over either fighter.
6. Let a proposal expire and disconnect its proposer. Neither an old acceptance
   nor an old input may affect the next attempt. Rejoin and verify a fresh attempt.

Changelog: added shared training rooms, mutual reset/side swap, training replay
identity, seat guidance and protection against held buttons becoming fresh inputs
after a reset. Next major gaps remain public accounts/hosting, active-fight
recovery and rated disconnect policy, voice, safe uploads, richer character art
and bundle reduction. This candidate is local acceptance, not public release.

### Earlier exported community candidate (2026-09-24)

HTML SHA-256: `098d08d59c702318aeab95d560194bbc43f0f98513f90a0f0e24f9fb8cc6f885`.
Validated editor Build/download preserves canonical project hash
`0a7a77f159775343a55e304327d623d9ec3f0cbd6de908aa217e080b4e64a63f`.
No authored assets, combat rules or canonical files were manually changed.

The current candidate adds room chat using engine durable messages and host-owned
personal preferences. Community protocol version 2 rejects older room exports
clearly. Three separate Chromium clients pass 17 communication checks: native
Enter sends literal text, mute and bilateral block filter immediately, the third
member remains unaffected, rate-limit errors retain the draft, explicit reports
receive an unreviewed receipt, and preferences survive leaving and rejoining.
Evidence: `.local/touch-of-death/social-ui/result.json` and desktop/narrow screenshots.
The same export passes all 22 winner-stays checks, including a physical-keyboard
three-round set and rotation. Focused network/community tests pass 70 tests and
5,210 assertions; editor source/test type checks and installed-consumer validation
pass. SQLite reopen, uncertain writes and report evidence are covered by backend
tests. All owned browser processes were cleaned up with no visible windows.
Voice, staffed moderation and public service acceptance are not demonstrated.

**Winner stays room** connects visible membership, queue, readiness and spectating
to the application-owned coordinator and host judge. Existing engine room hooks
serialize operations; its bounded binary schema carries combat and room metadata.
Its SQLite adapter persists only the policy record. Each battle gets a fresh relay,
runtime and judge while members retain their socket. No new transport or generic
lobby framework was introduced. These are delivered-game session views, not
authored project mutations; host tuning stays separate from project combat settings.

Defaults: eight members, three-win cap, fifteen seconds to ready, thirty seconds of
disconnect reservation, three seconds to display an earned set. The UI displays
the actual host cap. A judged result survives departure during that display; a
failed result save freezes rotation and retries. Failed queue/Ready writes preserve
the old choice and visibly require an explicit retry. Stale inputs/cursors cannot
affect the next pairing. Local IDs remain distinguishable when shortened; public
identity/display-name flows and rewards are not connected to these outcomes.

Evidence: `.local/touch-of-death/community-ui/result.json` passes 22 checks using
three owned Chrome instances and ordinary keyboard contacts. Thirty-nine strikes
earn a 3–0 set. The winner stays, queued viewer receives fighter control and loser
watches without reconnecting. Spectator departure preserves the fight; fighter
departure returns remaining members to the room without inventing a win. Rejoin
restores stable membership and queue intent with a fresh socket. Native Enter/Space
readiness and 390px-wide leaving pass. Read-only SQLite inspection finds exactly
the earned result, no active battle, and no tokens or transient connection IDs.
Cleanup leaves no owned browser processes/windows.

The same export passes 18 private-set/rematch checks. The preceding candidate
passes 29 private input/recovery checks; only the community Leave control changed
after that check. Combined focused tests: 54 pass / 5,070 assertions, including
physical host results, storage failures, AFK/cap policy, SQLite reopen, session
handoff and UI recovery. Installed consumer and typechecks pass. Bundle limits
still fail at 357,729 gzip bytes for standalone; source structure reports the
unrelated PadPilot directory baseline violation. No limits changed.

Controlled render advancement on loopback is not an internet latency trial. Over
75.6 seconds the fixture received 1.71 MB, 1.65 MB and 0.79 MB across three clients;
largest WebSocket payload was 21,585 bytes. Unchanged room metadata adds zero bytes
to the 131-byte steady-input delta fixture. Raw traffic and screenshots are beside
the result. Human playtests, other browsers/devices, deployment and automatic
network recovery remain required.

Manual acceptance: join one Winner stays room with three separate host tokens;
queue all three; confirm Ready in only one window and ensure no fight starts.
Confirm the other, earn three rounds with actual movement and strikes, then check
the new pairing and queue. Ready again and move the promoted viewer's fighter.
Leave/rejoin during grace, verify queue intent, then leave from the narrow room
panel. Separately miss Ready, reach the cap, interrupt the host and retry a failed
write. Follow the [host workflow](../../../host/README.md).

Changelog: durable winner-stays rooms, explicit readiness, automatic fighter/viewer
handoff, earned-result rotation, saved queue intent and direct narrow-screen recovery.
Next: public admission, Quick Play, communication, shared training and expression.

### Community prerequisites and determinism decision (2026-09-24)

The [application-owned coordinator](../../../host/community/README.md)
uses the existing engine SQLite persistence adapter, one serialized owner and one
versioned room record. A failed save publishes neither changed queue state nor
connection ownership. Defaults: eight members, a three-win cap, fifteen seconds
to ready, thirty seconds of disconnected queue reservation. Stable account IDs
preserve queue position; old connection IDs cannot act after replacement. Restart
requeues an interrupted fight without inventing a winner. Result receipts make
retries idempotent. The engine's existing durable MMO service buckets are not
repurposed for game policy.

A host-only judge consumes confirmed input pairs through the ordinary combat
adapter. Thirteen tests / 215 assertions cover SQLite reopen, malformed storage,
AFK skipping, capped rotation, stale connections and real first-to-three contact
results. The integration test earns a 3–0 set using movement and authored jabs,
fails the first result save, then commits the next pairing exactly once. Narrow
strict TypeScript and process-policy checks pass. These modules are now wired into
the local room above; this prerequisite test pass alone did not prove its UI journey.

The prior cross-runtime failure now has a causal reproduction. With identical
inputs, native `sin(pi/4)` differs between Bun and Chrome at frame 179; the first
numeric gameplay divergence is frame 186. Correcting that experimentally exposes
an independent friction warm-start `hypot` disagreement at frame 218. JavaScript
permits implementation-dependent approximation for these functions; see the
[ECMAScript Math specification](https://tc39.es/ecma262/2025/multipage/numbers-and-dates.html#sec-math.hypot).
Evidence and exact call sites: `.local/touch-of-death/determinism-audit/review.tmp.md`.
Final-state rounding or tolerant comparisons would conceal this cause.

An isolated portable-math prototype produces exact Chrome/Bun complete snapshots
for all 481 recorded contact frames and 2,562 full-set frames, including three
earned KOs, reset, 3–0 result and mutual rematch. Its backend alone is 27,737
minified / 10,999 gzip bytes. Evidence, pinned dependency versions and licensing:
`.local/touch-of-death/deterministic-math-probe/review.tmp.md` and `full-set-result.json`.
The prototype used a global Math shadow and WASM sqrt capture solely to test the
proposition. Production now uses explicit internal simulation functions: portable
JS sqrt, fdlibm/Cephes trigonometry and an ordered scaled norm. No global patch,
native fallback or new runtime dependency ships. Runtime identity is `combat-v3:`;
older peers and recordings must reject even with identical project data.

The production candidate passes 2,562 exact complete Chrome/Bun full-set states
and a durable 1,065-frame physical scenario gate covering launcher/chase/follow-up,
steering, block, parry, KO/corpse, ground/wall tech and missed AI tech. A test-only
native-math replacement diverges at frame 5, proving the gate detects the cause.
Eight numerical tests / 26,448 assertions include one million sqrt oracle samples.
An additional minified-bundle regression preserves upstream notices and one full
Apache license copy; the actual HTML is checked for these notices too.
Source and tooling typechecks, package build and installed consumer pass.

The validated editor export below passes 85 browser checks: online input/recovery
(29), complete set/rematch (18), spectator (20), replay/takeover (18). Its physical
hit checkpoint at frame 259 now equals the Bun reconstruction exactly. Evidence:
`.local/touch-of-death/network-demo/recording-review.json` and
`.local/touch-of-death/deterministic-math-production/`. This closes the reproduced
Chrome/Bun blocker; other browsers, devices and internet conditions remain untested.
The subsequent community candidate above connects those results and queue to one
transport and visible journey. Backend policy alone was not a delivered room.

A warmed Chrome simulation benchmark measured +1.7% median CPU time over the native
control (3,076 vs 3,024 ms per 2,562 frames); shared-machine variance limits that
comparison. Bundle-size gates still fail: standalone is 354,321 gzip bytes against
274,000. No budget was raised. See the bundle-size evidence for distribution costs.

### Previous exported deterministic combat candidate (2026-09-24)

HTML SHA-256: `737d8b39a79cc22a875f9852963a0042da45f6756a0d19591f5417e5219abbfe`.
The editor's validated Build/download flow exported the rebuilt runtime; canonical
project hash remains `0a7a77f159775343a55e304327d623d9ec3f0cbd6de908aa217e080b4e64a63f`.
Fight/Watch is a session choice. Six viewers may join the local relay without taking
either fighter seat. Late viewers reconstruct frame zero onward from confirmed
input pairs, then follow live combat. The existing bounded binary snapshot schema
carries at most 120 pairs per cursor window; no gameplay state or damage is injected.
Catch-up yields after at most 120 simulation steps or six milliseconds per render,
with ordinary single-step playback afterward. Historical audio is suppressed;
normal small packet batches remain audible. A backlog above twelve frames resumes
catch-up. Neutral scores/resource labels and no rematch vote distinguish watching.

Viewing history is bounded to 36,000 frame pairs per room. Expiration rejects new
viewers and visibly ends existing viewers without interrupting fighters. This is
process-memory history, not durable membership, rotation or reconnect recovery.
Public internet performance and other browser/device combinations remain unproven.
The former Chrome/Bun failure below is fixed by portable arithmetic in this candidate.

This exact export passes 20 three-browser spectator checks, 29 two-browser
combat/invitation/recovery checks and 18 complete-set/rematch checks. The spectator
joins after the 120-frame rollback window, reproduces the entire physical-hit
snapshot exactly, follows a second earned hit, saves a complete replay and rejoins
without interrupting fighters. Its attack/movement/guard keys leave both fighters
unchanged. Fighter departure exposes Enter-operated recovery and local AI play.
Evidence: `.local/touch-of-death/spectator-ui/verify.json`, its narrow screenshots,
`network-demo/two-browser.json` and `network-set/two-browser.json`. All report the
same artifact hash; owned browser processes/windows and current server errors are
clean. Runs use a controlled render clock, not a network-latency benchmark.

Focused network/HUD tests pass 36 cases / 285 assertions; rollback tests pass
38 / 5,808; server-room tests pass 6 / 1,176. Source/test typechecks, engine build,
installed consumer and process policy pass. Bundle ceilings still fail; source
structure reports the unrelated PadPilot evaluator baseline. A failed parallel
fixture run is preserved as `spectator-ui/parallel-room-collision-*.json`: both
journeys generated the same millisecond room ID. Scenario-prefixed UUIDs fixed
the collision, after which both journeys passed. No gameplay workaround was used.

Manual verification: start two fighters using separate tokens, earn a physical hit,
then join a third browser with Watch. Observe Catching up, the existing damage and
continued contacts. Try attack/guard/movement as the watcher; neither fighter may
respond. Save the replay, leave, and rejoin while the fighters continue. Leave one
fighter, use the watcher's Return action with Enter, then start a local AI match.
Also check a full spectator room, wrong content and expired viewing history.

### Network foundation

Use the existing fixed-step combat rollback session and engine binary protocol.
Bind each admitted player to a fixed roster slot; payloads cannot choose another
fighter or send health, stamina or hit outcomes. Resolve camera-relative controls
on the input-producing client into bounded world-space intentions. Preserve
fresh press/release semantics through hitstop, prediction and replay.

Audit complete simulation ownership before connecting transport: rigid world,
combat, movement gesture state, hitstop, match phase, input history, random state
and knockout behavior. Portable saves are not assumed to be solver checkpoints.
Confirmed event identity prevents duplicate audio/results; speculative visuals
must be replaceable. A room connection alone does not prove combat determinism.

The existing transport path is `net/authoritative-client.ts` (`connectAuthoritative`)
with `server/transport/websocket.ts` and a bounded `RoomType`. Reuse connection-bound
identity and existing binary input codecs; do not create a game-local wire format.
Development tokens are impersonable and only suitable for local tests. Admission
must agree on match id, roster, rules/content identity and seed before frame zero;
the local AI host chooses its own queue seed, while the online host uses the
admitted room seed for both peers.

The knockout adapter owns a second physics world, mutates host collision masks
and teleports defeated host bodies from its ragdolls. Its portable saved poses
omit solver caches. A new in-process `checkpoint()` retains its complete world
and solver state across topology changes; restore it before the host runtime and
physics checkpoint. The gameplay checkpoint now composes both worlds, movement,
hitstop and combat state. Physical-input regressions cover rollback across the first
knockout, not only ordinary hits. Combat audio has its own phase/countdown memories;
its new trusted `capture/restore` reproduces pending cues and fighter sound memories.
The network runner drains speculative cues into stable frame/event identities and
delivers them only on confirmation. Browser playback must use that confirmed path.

First transport acceptance: two complete gameplay worlds using the same project,
connected through the existing client/server path, perform movement, launcher,
chase and defensive inputs. Compare full confirmed physics/combat state under
asymmetric delay, then test wrong-seat inputs, content mismatch, conflicting frame
corrections, disconnect/history exhaustion and explicit recovery. Repeat through
two owned browser pages against the generated game artifact before calling the
online bout playable.

Use localhost clients before choosing paid hosting. Then test the actual hosted
candidate from separate machines and networks. Hosting provider, budget, identity
policy, public population target and voice topology remain unresolved; no paid
service or public deployment has been authorized by this plan.
