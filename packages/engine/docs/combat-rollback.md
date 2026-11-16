# Combat rollback

## Versioned input recordings

`@hyperfocus/engine/combat/net` exposes `createCombatRecording` and
`readCombatRecording`. A version-1 record contains match/content identity, seed,
two seat IDs and contiguous pairs of accepted inputs from frame zero. Append one
pair with `append({ frames })`; `snapshot()` returns detached JSON-compatible
data. Exact duplicates are harmless; conflicting inputs, gaps and malformed pairs
reject without mutation. The default bound is 36,000 frames; the explicit maximum
is 216,000. Capacity exhaustion never silently removes the beginning of a replay.

Recordings created with `mode: 'training'` use version 2 and persist that mode.
Version 1 remains a set; it cannot contain a mode override. Version 2 requires an
explicit `set` or `training` mode. Playback derives its rules from this validated
header rather than a viewer preference.

The relay's optional `onConfirmedFrames` callback supplies these pairs before live
history pruning. Hosts own retention, download authorization and storage failures.
These are accepted-input records, not trusted simulation results. Playback must
validate content/runtime compatibility and feed the same independent fighter
adapter, including seat-specific rematch requests. Do not inject damage or stun.
The browser/Bun exact-state mismatch reproduced during initial recording work is
addressed for the tested rigid-combat paths by the deterministic arithmetic boundary
below. The [demo ledger](../examples/touch-of-death/docs/touch-of-death-demo.md) owns exported player-flow acceptance.

`createCombatReplay3D({ project, runtime, recording, contentId })` from
`project/runtime-3d` requires a fresh two-fighter runtime and validates content
and authored actions before changing gameplay. `tick()` advances recorded inputs;
`seek({ frame })` restores the initial complete solver checkpoint and replays to
that position without replaying historical audio. Seeking is synchronous and
linear in the requested frame, so hosts must schedule long seeks appropriately.

`takeOver({ seat: 0 | 1 })` replaces that fighter's subsequent inputs with the
intent passed to `tick(intent)`. The other fighter follows the recorded inputs,
then neutral input after the archive ends; it is not an adaptive AI response.
All stamina, commitment, contact, steering and defensive rules still run through
the ordinary gameplay adapter. Seeking again exits takeover and reproduces the
recording. Neither playback nor takeover changes the source recording.

## Cross-runtime arithmetic boundary

Simulation owners import `math/simulation.ts` explicitly for portable `sin`, `cos`,
`atan2`, `acos`, correctly rounded `sqrt`, and fixed-order scaled `hypot`. These
functions replace differing host-native last bits without changing global Math or
rounding state snapshots. Full rigid solver and gameplay checkpoints remain the
comparison boundary. The local game compatibility prefix is now `combat-v3:`;
older exports must not share a bout merely because their authored project matches.

Source-runtime verification compared Chrome and Bun checkpoints exactly through
2,562 input frames containing three physical KOs and a mutual rematch, plus 1,065
frames of targeted physical combat scenarios. The native-math negative control
diverged at frame five. No tolerance, injected damage or native Math shadow was
used for the passing comparison. Evidence is under
`.local/touch-of-death/deterministic-math-production/` (`compare.json` and
`scenario-gate.log`). This proves those exercised paths, not universal determinism
for every engine system: generic kinematic damping in `physics/3d.ts` still uses
`Math.exp` outside the tested rigid-combat boundary. Exported browser journeys and
public hosting remain separate acceptance requirements.

The simulation-only A/B/B/A benchmark over those 2,562 inputs measured median
3,024.5 ms with native math versus 3,076.05 ms with portable math (+1.704%, about
1.20 ms per simulation frame). Shared-machine timings were noisy and exclude
rendering; they do not establish a frame-rate claim. See `benchmark.json` and the
[implementation provenance](../src/math/simulation/README.md) before changing
arithmetic grouping, range reduction or the simulation import boundary.

## Fixed-step session

`createCombatRollbackSession` composes the existing fixed-step rollback loop with
named state participants, confirmed events, and state comparison. Start with the
default 60 Hz step and 120-frame history. Call `tick()` from your fixed update;
send each local input with its frame number through your chosen transport and pass
remote inputs to `receiveInput(peerId, frame, input)`.

Create the world and fighter roster before creating the session. Register every
mutable simulation owner with `createRollbackParticipant`: the rigid world,
ragdoll/controller state, combat rules, deterministic random generator, and any
simulation-owned progression modifiers. Each participant takes an `id`, `capture`,
and `restore`; the default clone uses `structuredClone` and can be overridden.

```ts
const physics = createRollbackParticipant({
  id: "physics",
  capture: world.checkpoint,
  restore: world.restoreCheckpoint,
});
const combat = createRollbackParticipant({
  id: "combat",
  capture: () => combatState,
  restore: (state) => { combatState = state; },
});
const session = createCombatRollbackSession({
  peerIds: ["player", "opponent"],
  localPeerId: "player",
  defaultInput: { attack: false },
  getLocalInput: () => readControls(),
  participants: [physics, combat],
  update({ inputs, step, frame, emit }) {
    // Update combat rules and physical drives, then step physics.
    updateFighters(inputs, step);
    world.step(step);
    // Give each logical effect a stable id within the frame.
    for (const hit of resolveHits()) emit(`${hit.attacker}:${hit.target}`, hit);
  },
  onConfirmedEvent: ({ event }) => playHitEffect(event),
});
```

`update` can execute several times for the same frame. Do not play sounds, grant
persistent rewards, or send irreversible external writes from it. `emit` collects
cloned presentation events, replaces speculative events on replay, and delivers
each event id once after every peer's input is known for that frame and all prior
frames. Confirmation introduces presentation latency; advanced projects can
render speculative visual state independently. Confirmation is not trusted-server
validation and must not authorize online rewards by itself.

When the oldest unconfirmed frame would leave history, `tick()` throws before
advancing. Pause simulation and continue accepting network messages, then retry;
surface a connection recovery UI rather than dropping input silently. Tune
`maxRollbackFrames`, `maxFutureInputFrames`, prediction, and input cloning/comparison
for advanced needs. The session fixes its roster for the match and ignores changes
to already confirmed input. A transport must authenticate peers and preserve one
authoritative input value per peer/frame.

Exchange `stateHash(frame)` only for confirmed frames. Hashes describe state after
that frame; `compareStateHash({ frame, hash })` returns `match`, `desync`, or
`unavailable`, with `onDesync` supplying both hashes for diagnostics. Retention is
bounded by the rollback window. Hashes accept plain objects, arrays, finite numbers,
and typed arrays, and are diagnostic, not cryptographic proofs. They do not make
floating-point physics bit-identical across different JS implementations.

In an editor-created fighter project, keep authored move/rig configuration static
for a bout and put current move phase, health, resources, and physical controller
state into participants. Changing body topology during the rollback window is not
supported by rigid-world checkpoint restoration; preallocate bodies or transition
between matches. Do not include DOM objects, audio nodes, renderer resources, or
transport state in simulation checkpoints.

Verification: `bun test packages/engine/src/runtime/combat-rollback/session.test.ts`
covers out-of-order convergence, exactly-once confirmed events, stalled history,
hash comparison, and rigid-world impulse/contact checkpoint replay.

`bun test packages/engine/src/runtime/combat-rollback/directional-combat.test.ts`
also checks two independent combat-core sessions with opposite local identities,
three- and seven-frame remote delays, reverse-order backlog delivery, matching
confirmed contact events and state hashes, and ignored foreign/confirmed input
corrections. Damage comes from authored attacks and contact resolution. This is
an in-process core test, not evidence of browser transport or full project-adapter
rollback readiness.

`createCombatAudio3D.capture/restore` supplies trusted in-process presentation
checkpoints for pending cues, music/phase state and fighter sound memories. Restore
those memories before regenerating frame cues; release audio through confirmed
events, not directly during speculative simulation. The checkpoint API does not
itself deduplicate output or validate untrusted save data. Its regression uses
authored attacks/contact sounds and proves replay produces the same cue sequence
without spuriously restarting music. Camera-relative pan is presentation data and
must not be part of a cross-peer mechanical-state hash.

The project adapter now supports independent roster-ordered fighter inputs; see
[the host API](fighting-games.md#rollback-composition). `gameplay.checkpoint()`
returns `{ state, restore }` suitable for a session participant's `checkpoint`.
Its state hashes mechanics; local audio, visual histories and pending output are
restored separately. Custom script closures are rejected. Runtime checkpoints
preserve transforms/tick, full rigid solver state and mutable collision/body
configuration. Authored timeline configuration and topology must stay fixed.
Knockout checkpoints retain their own topology worlds, and restore before host
physics. Keep checkpoint history bounded so old worlds can be collected.

`bun test packages/engine/src/project/3d/combat-rollback` covers independent
controls, actual contact defense, hitstop input restoration, full-game asymmetric
delay convergence, and replay through an earned knockout and corpse contacts.
These regressions provide in-process evidence; browser transport and player-flow
acceptance remain host-owned. The admitted runner below composes shared match
lifecycle and confirmed output. Portable save snapshots remain distinct from
full local checkpoints.

## Admitted network bout

`createNetworkCombatSession` from `@hyperfocus/engine/project/runtime-3d` composes
a fresh project runtime with independent fighter controls and the same
first-to-three match rules used locally. Supply the agreed match id, content id,
seed and two authenticated peer ids in fighter order. The runtime must be at tick
zero. Online sets start with a 180-frame countdown; local menus and Practice
policies do not run. A KO retains the ordinary 180-frame round-result interval,
then scores the round and resets fighters/resources before the next countdown.
The host continues to own room membership and rotation.

Session and spectator constructors also accept `mode: 'training'` (default
`set`). Training starts in Practice with two independent human inputs, ordinary
resources and KO behavior, and no scores or automatic resets. Local AI presets,
lessons, menu actions and rematch requests are unavailable. The application must
bind mode in its validated room metadata; the core combat snapshot is unchanged.
Reset and seat swap require a new host-assigned match ID, fresh runtime/session,
and agreed seat order. They are not combat input commands. This keeps previous
inputs, rollback history and recordings separate from the new training attempt.

The local input callback returns unprefixed action arrays and planar world
direction. The reserved action `match:rematch` is a fresh-press vote accepted only
at match result. Votes are bound to authenticated roster slots; one vote cannot
restart a set. Both votes reset scores and resources and begin another countdown.
The runner strips this action before handing ordinary actions to combat. The
relay's allowlist must include it. `sendInput` hands canonical frame input to the transport. Feed decoded
`CombatRoomSnapshot` values to `receive`; content/seed/roster changes reject, and
server echoes cannot rewrite submitted local input. The host should interrupt
the bout if transport delivery fails. A disconnected bout does not silently
restart with a fresh seed.

`tick()` returns false with `waiting-for-input` when history fills and can resume
after missing inputs arrive. `interrupted` and `desynced` require host recovery;
do not keep advancing physics independently. `onConfirmedAudio` delivers each
regenerated cue only after its frame is confirmed. `confirmedMatch` and
`onConfirmedMatch({ frame, id, event })` provide the confirmed match snapshot,
including phase, countdown ticks, score, winner and `[seat0, seat1]` rematch votes.
`playerWins`/`winner: 'player'` always mean roster seat zero online; `opponent`
means seat one regardless of which seat is local or authored as player-controlled.
The getter is undefined until the first frame confirms and returns an independent
copy. Score, result and rematch UI must use this confirmed state. Fighter rendering
may use speculative game state. Confirmed peer inputs are not trusted ranked
match-result authorization.

Countdown samples retain held-button history without advancing combat. Holding
an attack through Go does not create a new press. Holding guard still blocks,
but does not open a parry window on Go. The optional core `guardFresh: false`
input suppresses a fresh window when a host already observed that press while
combat was frozen; `true` cannot refresh a held guard or bypass commitment.
Player and AI adapters preserve the same guard edges, including block recoil.

The shared combat protocol uses existing bounded engine binary schemas/codecs
for action arrays, frame numbers and finite planar directions. Both codec and
game validate input. Its server relay must bind input to connection identity,
never a payload-supplied fighter id. See `server/combat-room` for relay ownership.

Runner tests cover real contact audio exactly once under asymmetric delay,
history stall/recovery, countdown startup, content mismatch, warm-runtime
rejection, rewritten local input and invalid batch preflight. The online-set
regression earns three KOs through actual aimed movement and contacts, confirms
scores under asymmetric delay, rejects unilateral rematch and replays mutual
rematch through resource reset. No damage or stun is injected. A UI and deployed
transport journey are separate acceptance requirements.

`createNetworkCombatSpectator` plays the same two-seat match from confirmed input
pairs in a fresh runtime. It never submits fighter inputs or predicts missing
frames. `onCursor({ frame })` requests the next needed frame; bounded snapshot
windows may arrive in pieces, but playback never skips a gap. `frame()` is that
next cursor, `confirmedFrame()` is the last consumed frame, and `framesBehind`
compares playback to the advertised live head. Confirmed match and recording
getters follow the fighter session contract.

Spectator `tick({ maxFrames, shouldYield })` defaults to one frame and accepts at
most 120. Hosts should schedule catchup once per render with their own time
budget through `shouldYield`. Late joins replay silently; a live viewer enters
catchup again only beyond 12 frames (200 ms) of backlog. Ordinary small packet
batches preserve contact audio. Bulk ticks suppress historical cues, and caught-up
viewers remain `running` while awaiting the next confirmed pair. Archive expiry
interrupts playback explicitly. Tests compare an earned physical hit against
exported-recording playback, preserve live batched audio, and reject invalid
windows before advancing simulation. Transport authorization remains host-owned.
