# Touch of Death: verification evidence

Historical evidence; [current guidance](../../touch-of-death-demo.md) owns current status and limits.

## Recording prerequisite evidence (2026-09-24)

The relay's 120-frame live history cannot initialize a late spectator. Full
physics checkpoints currently contain in-process closures, so spectator playback
uses recorded paired inputs from frame zero. Authenticated `userId` survives a
token rejoin; transient `player.id` does not. Community membership must use the
former and bind fresh combat seats per bout.

`combat/net` now validates version-1 recordings with bounded contiguous frame
pairs, detached snapshots, exact duplicate acceptance and atomic rejection of
gaps, conflicts, invalid identity and exhaustion. The optional relay observer
records confirmed inputs before pruning without changing its binary wire format.
The local host retains eight recordings of at most 36,000 frames in process memory
and exposes explicit download/status endpoints. Restart loses undownloaded data;
this is not yet persistent community-room storage.

The recording-prerequisite export passed 26 two-browser checks against this
relay. Its archived fixture contains 481 frame pairs; missing-room and disallowed-origin
requests return 404/403. JSON recording replay of the physical transport fixture
matches complete state in a fresh Bun world. Replaying the browser's first 259
frames in Bun instead fails exact equality on tiny physics floating-point values.
Historical failure: `.local/touch-of-death/network-demo/recording-cross-runtime-failure.json`.
The current `recording-review.json` now passes after the version-3 arithmetic fix
described above. The earlier pass alone did not establish cross-runtime determinism
or trusted server results. Browser playback and takeover were integrated afterward.

The subsequent playback adapter now validates content/actions before mutation,
replays through the independent-input gameplay path, seeks from a full initial
checkpoint and allows either seat to replace its inputs. Physical tests show
attacker takeover preventing the recorded jab and defender takeover guarding it;
seeking back restores the exact original outcome. Two tests/19 assertions pass.
In a fresh owned Chromium process, the downloaded browser recording exactly
reproduces the complete snapshot at frame 259 (`replay-browser.json`). This is
browser-runtime evidence, not a shipped replay UI or cross-browser-engine proof.
The Bun mismatch remains. The uncontrolled fighter follows the recording and
becomes neutral when it ends; takeover does not invent adaptive opponent inputs.
Replay browsing, scheduled seeking, catch-up and visible takeover controls remain.

Engine build, source/test typechecks and installed consumer pass. Recording tests
pass four cases/52 assertions; relay and physical recording regressions pass.
The new combat-net export adds 2,026 raw bytes and now exceeds its unchanged raw
budget (12,972 / 11,500). Existing bundle failures also remain release blockers.

## Editor views

- Combat session: fighter input ownership, authored set/room rules, visible
  network-condition test controls and actionable diagnostics.
- Wardrobe authoring: shared-rig slots, compatible pieces, palettes and outfit
  previews across attacks, movement and hit reactions. Cosmetic animation
  validation must preserve simulation timing and collision.
- Practice/replay: scenario capture, reset conditions, either-side takeover and
  inspection of actual inputs and contacts.
- Export setup: public service configuration and compatibility identity, with
  secrets held by the host. Show unavailable online services as a recoverable
  condition while local play remains usable.

These are authoring views. Player lobbies, wardrobe, queue, replay browser and
training screens belong in the delivered game. Account operations, report review
and service health belong in host administration.

## Verification baseline

On September 24 the existing rollback session, directional combat and durable
service suites passed 12 tests / 66 assertions. An additional two-peer regression
then passed with asymmetric three/seven-frame delays, reverse-order backlog,
equal confirmed events/state and rejection of foreign/confirmed corrections.
These are in-process tests; no browser network quality claim follows from them.

The subsequent network runner/relay tests now use two real local WebSocket
connections, fixed admitted seats/content/seed, binary input and delta histories,
and two complete project runtimes. An authored jab makes contact; state hashes
and snapshots agree and each client receives exactly one confirmed hit cue.
History exhaustion pauses without advancing and resumes on missing input. A
disconnect explicitly interrupts the bout. Seven focused protocol/transport/runner
tests pass 609 assertions. The installed package consumer also resolves the new
`combat/net` codec entry, network runner and relay factory. These transport tests
alone do not establish browser behavior, public authentication or reconnect recovery.

The subsequent exported-browser regression passes 22 checks using two owned
Chromium processes, real keyboard events, physical contacts and a controlled
render clock over local WebSockets. It covers a jab, remote held block, authored
Drive strike and short-Drive neutral jump; complete confirmed snapshots agree
after offense and defense. Save/load/reset reject while online; Escape cannot
pause. Leaving visibly interrupts the peer, stops simulation, restores local AI
play and re-enables local save/load. No uncaught browser errors or leftover owned
browser processes/windows were observed. Desktop and 390px main-frame screenshots
were inspected; this is not an internet latency or frame-rate measurement.

Evidence is in `.local/touch-of-death/network-demo/`: the validated export handoff,
sampled persona, scenario, failure reproductions, final `two-browser.json` and
screenshots. The historical invitation candidate expanded that regression to 26 checks.
Its HTML SHA-256 was
`4de099a4c95f7b06c9025770be873f361dd65760dbd7928e9ee240eddc83f40d`.

The invitation pass adds copy/import of bounded room codes, independent of the
export's hosting URL. Only endpoint, room, match and content identity are shared;
tokens remain separate. Import checks compatibility and reviews the destination
before joining. Browser evidence includes a 390px dialog and a guest joining from
the host's copied code, followed by physical offense, defense and local recovery.
All 17 network UI/identity/connection tests passed (103 assertions), as did editor
source/test typechecks. The initial full-set evidence below belonged to runtime
candidate `9d2fad07127c8f42f587c64b320b4e994798a4be443c323446f0529a98b70d2e`;
the invitation pass changes session setup only.

Admission recovery additionally rejects late completion after failure: a failed
join remains interrupted until the player leaves, and callbacks from that attempt
cannot poison a subsequent join. The focused connection/input suite passes seven
tests / 38 assertions, including the reproduced failure ordering and successful
retry. The regenerated export again completes the physical first-to-three and
mutual-rematch browser journey (18 checks).
Canonical project hash remains
`0a7a77f159775343a55e304327d623d9ec3f0cbd6de908aa217e080b4e64a63f`.
Browser and host derive compatibility from full project content with authoring
timestamps normalized; rules, scene data and asset digests remain included.
This fixes false rejection caused by the editor's export-time update timestamp.

This pass also corrected the export connection policy and the host input gate
that had disabled online Drive. Unsupported/offline exports retain a closed
connection policy. Supported combat exports explicitly allow secure WebSockets
and loopback development sockets; nothing connects before a player joins.
The interrupted view puts return to local play ahead of technical fields.
The host still needs production access-token issuance, reconnect recovery,
cross-device/network acceptance and trusted result handling before matchmaking.

The complete-set pass adds 18 exported-browser checks in
`.local/touch-of-death/network-set/`. Thirty-nine ordinary strike inputs earn
three physical knockouts. Normal round transitions restore full resources; both
clients agree after the set and mutual rematch. Result text and resource labels
follow the local seat. Native Enter requests the first rematch; the other player's
visible button accepts it. One vote cannot restart either fighter. The first
verification attempt approached closer than the authored bodies permit and sent
no strikes; its retained failure led to a corrected test approach distance, not a
collision-rule change. Winner, loser-at-390px and countdown screenshots were inspected.

The engine's 140-test combat/AI/Practice/rollback/transport regression run passes.
It includes a full physical set under asymmetric delayed inputs, confirmation-only
score publication and rematch rollback. Countdown no longer treats preheld attacks
as fresh presses. Preheld guard blocks without opening a fresh parry window; a
release/repress can parry, for players and AI under the same commitment rules.
Early countdown Drive taps do not become automatic jumps at Go. Runtime identity
was bumped to `combat-v2:` in this pass (now `combat-v3:`), so old single-bout exports reject
admission despite identical project bytes. No online score authorizes rating or
rewards: the relay still authenticates inputs rather than independently verifying
simulation outcomes.

Manual private-bout verification:

1. Start the [managed local relay](../../../host/README.md),
   open the same exported HTML in two browser windows and join one room with
   separate local test tokens. Check that each window names its assigned fighter.
2. Move into reach with WASD. Strike with J; hold L in the other window before
   the next strike. Confirm hit feedback, then block feedback and guard cost.
3. Hold H and press J to select a Drive strike. After recovery, release a short
   H press to jump. Test both seats and repeat with remapped/controller inputs.
4. Check that Escape does not pause and save/load/reset cannot alter the bout.
   Leave one window; the other must show recovery and stop fighting.
5. Return to local play, start an AI match, then save and load. Repeat with a
   wrong content build, unavailable host and hidden tab; none may silently keep
   a valid-looking online match. Controller, hidden-tab and public-network cases
   still require their own browser acceptance beyond the automated checks above.
6. Finish three rounds through actual contacts. Check the correct winner and score
   in each window. Request a rematch with keyboard/controller, leave the other
   player undecided, then accept from the other side. Only mutual consent should
   begin a fresh countdown with full resources and zero scores.

Engine build and tooling/source/test types pass. The bundle-size release gate
still fails existing artifact/distribution ceilings, including new feature cost;
see [size evidence](../../../../../docs/bundle-size-evidence.md). Existing ceilings were not raised.
Source structure has no remaining engine violation; the repository gate still
reports the unrelated PadPilot evaluator directory at 38 files versus baseline 36.

`bun run ship-check --list` and `bun run ship-check editor --plan` were inspected.
The editor profile is not a Touch of Death online release test. Use targeted
engine/editor checks during implementation, then the relevant release gates and
game-specific browser acceptance against an identified exported artifact. Record
artifact hash, environment, actual network conditions, failures and recovery.

Human playtests must still establish whether newcomers understand losses, enjoy
the room between turns and want another session. Automated input sequences cannot
prove those outcomes. Additional export targets require their own acceptance.
