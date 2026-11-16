# Two-fighter relay

`createCombatRelayRoom` assigns two authenticated connection IDs to fixed seats.
Clients join with the room's match/content identity; the host supplies the shared
seed and authored action allowlist. `combat/net/protocol.ts` is browser-safe and
uses existing bounded engine schemas for binary input and state replication.

Replicated `frames` is a map keyed by `seat:frame`, retaining 120 confirmed frames
plus at most 120 future frames by default. The first accepted input is immutable;
identical repeats are harmless, conflicts are rejected. Inputs are planar world
directions and unprefixed authored actions. Clients cannot choose their seat.
`confirmedFrame` means both inputs were received, not that simulation was verified.

A mismatch, full room, invalid input, stale frame or excessive lead is rejected.
Any fighter departure interrupts the bout; this room does not promise
reconnection or result authority. Connected peers run complete sets
and mutual rematches through their shared simulation; after departure they need
a new room/session. Public hosting requires a production auth
adapter; `dev:` tokens in these tests are local test identities only.

Hosts can opt into up to 32 spectators with `maxSpectators` (default zero; the local
demo enables six). Join with `role: 'spectator'`; omitted role means fighter.
Spectators never occupy fighter seats, cannot submit fighter input, and leaving
does not interrupt the bout. They receive the same binary snapshot schema, with
at most 120 contiguous confirmed frame pairs from their playback cursor. The
snapshot's `confirmedFrame` remains the live confirmation frontier.

The authenticated low-rate event `{ type: 'combat-spectator-cursor', frame }`
requests the next frame needed. Cursors start at zero, never move backward, and
advance at most 120 frames per request, no further than live confirmation plus
one. Hosts retain confirmed history from zero, bounded by `maxSpectatorFrames`
(default and maximum 36,000). At exhaustion new spectator admission fails with a
clear reason; existing spectators receive `status: 'archive-ended'`. Fighters
continue normally. History is process-memory state, not restart persistence or
trusted result validation. A longer session needs a new bout; no frames are
invented or silently removed from the beginning of a spectator's replay.

Authentication is global across rooms: a second sign-in by the same user replaces
the first. The old socket closes with code 4001 and an explicit explanation;
clients must not automatically reconnect after this terminal supersession. A
deliberate new sign-in is allowed. Use different test tokens for independent
rooms/players. `superseded.test.ts` verifies replacement, unrelated users and retry.

The real WebSocket test exercises two binary clients and admission/negative cases.
The playable test uses two independent project runtimes, actual jab input and
physical contact, identical confirmed hashes, exactly-once contact audio and a
disconnect stop. It does not prove browser presentation or cross-engine physics.

Measured bounded two-peer, 120-frame history fixture: 13,505-byte snapshot and
143-byte steady delta (8,580 payload bytes/client/second at 60 Hz, excluding framing
and periodic snapshots). Local transport test sends 266 binary inputs/12,367 bytes;
received traffic and first-batch latency are printed per run rather than treated as
stable wall-clock performance claims. Entity count is two fighters. Larger authored
action lists cost more; schema and memory bounds still apply.

An optional trusted `onConfirmedFrames` observer receives detached, ordered pairs
exactly once before old relay inputs are pruned. It does not receive predictions,
rejected frames or duplicate accepted input. The local demo host consumes this for
bounded recordings. Host observers own storage failure policy and must not throw
into the live room. Recording does not make client simulation outcomes trusted.

The playable transport regression serializes this recording to JSON, validates it,
and replays its physical hit in a fresh gameplay world with identical complete
state. This same-runtime test does not establish cross-runtime physics identity.

Opt-in live transport recovery reserves authenticated fighter seats for the server's
`reconnectGraceMs` (default zero, maximum 30 seconds). During a reserved seat's
`reconnectUntil`, relay snapshots report `recovering` to fighters and spectators;
accepted frames, immutable input history and player IDs remain intact. In-flight
inputs still pass the ordinary validation windows. Grace expiry follows normal
leave/interruption handling. Explicit departure is not recoverable.

A retained `createNetworkCombatSession` ingests recovering snapshots but suspends
sampling and simulation. After receiving a ready snapshot, the host calls
`resendPendingInputs()` to retry exact unacknowledged samples. Capture precedes
send; failed sends cannot resample a different action for the same frame. The app
must suspend its own ticks while its transport is disconnected and handle send
failures as recovery, then wait for the resumed snapshot before retrying. This
recovers an existing live world, not a page reload or server restart. History
exhaustion still stalls explicitly; it never fills missing frames with neutral
inputs. The recovery regression uses an earned physical jab/contact, compares
complete continued state, confirmed hash/audio and recording, and exercises the
rollback boundary plus a thrown send.
Spectators also retain their live world during fighter recovery: they may drain
already confirmed pairs, then stop at the known frontier. `resendCursor()` retries
the same next-frame cursor after their own transport resumes; no duplicate playback
or neutral input is inserted. An expired/interrupted spectator cannot be revived.
