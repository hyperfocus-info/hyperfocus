# Community room coordinator

`createCommunityCoordinator` is application-owned room policy for Touch of Death.
It reuses the engine `PersistenceAdapter` room record API with one authoritative
coordinator owner per room. Inject `createSqlitePersistenceAdapter` for SQLite or
the portable memory adapter for tests. Do not run two coordinators against the
same room record: the adapter does not expose compare-and-swap transactions.

The `initialization` promise loads, validates, recovers and saves the room before
publication. Commands await it automatically. Each command runs through one
serialized lane: clone state and live connections, apply the transition, validate,
await `saveRoom`, then publish both. A failed write preserves previous public state
and connection ownership. Persistent data is one versioned JSON record under
`tod-community:<roomId>`, including membership, queue, battle, streak and the last
64 result receipts. Snapshots are detached and add online flags and `lastResult`.
Connection IDs and authentication tokens are never persisted.

The host supplies authenticated stable `userId` and current `connectionId` to
`join`, `disconnect`, `queue` and `ready`. Rejoining preserves queue preference and
position; `wantsQueue` in `join` applies only to new members. Use `queue` to change
an existing preference. A replaced connection cannot change readiness or queue,
and its later disconnect cannot remove the replacement. `complete` is host-only:
never forward a browser winner claim into it. It requires the exact active
playing battle and fighter order. Duplicate retained receipts are harmless;
conflicting receipts and evicted stale results reject without applying a result.

Defaults are eight members, three consecutive wins, a 15-second ready deadline,
and 30 seconds of disconnected membership/queue reservation. Tuning permits up to
32 members, 100 wins, and five minutes for either timeout. Room IDs use the portable
ASCII identity characters and at most 64 characters; generated battle IDs fit the
combat wire's 96-byte limit. User and connection IDs allow 128 characters.

The first two connected queued members receive a ready request. On timeout, ready
players retain priority while unready players become idle until explicitly
requeuing. The loser returns to the tail; the winner keeps priority until the
streak cap, then rotates behind waiting players. Opting out during readiness
cancels that reservation and restores the other player; opting out while fighting
finishes the current fight and prevents requeuing. Terminal `leave`,
`duplicate-login`, `reconnect-timeout`, or `connection-close` during a playing battle concedes to the
other fighter through the existing durable result/streak/rotation transaction.
The first serialized terminal departure fixes the result, including simultaneous
departures and save retries. Already judged results take precedence. Ready-phase
departures, host shutdown and legacy unclassified `disconnect` interrupt without
awarding a win. `disconnect` accepts a trusted optional `reason`; omission keeps
the legacy interruption behavior. `connection-close` covers nonrecoverable socket closes
on recovery-enabled hosts, so choosing a custom close code cannot erase a loss.
A replacement connection during play also
concedes. No damage or fake combat input is injected. Disconnected queued members retain
position during grace but are skipped for selection; expiry frees their membership.
Transport reconnect grace is separate: it retains the admitted fighter and calls
no departure hook until expiry. `shutdown()` clears live membership and requeues
unfinished battles, preserving an already chosen pending concession.

On host restart, any reserved or active battle is interrupted, eligible fighters
return to the queue front in their previous order, readiness clears, and all
members receive a fresh disconnect grace period. No match result is invented.
The host calls `tick` to process deadlines; no timer or background process is
created by this module. Time and tuning must be bounded nonnegative integers.

`createCommunityRoom` now composes the coordinator, relay and judge as the
application-owned `tod-community` room type registered by the local relay host.
Its browser-safe protocol carries bounded lobby state beside combat snapshots.
Lobby, fighting and spectating use one authenticated connection. Opening another
connection for the same account invokes the engine's global single-login policy.

`createCombatResultJudge` observes server-accepted paired inputs through the same
combat simulation, starting from a fresh runtime. It validates the complete batch
before stepping and reports only the first simulated first-to-three result.
It retains 120 pairs for duplicate validation, rejects stale/conflicting inputs,
and freezes at the result. A new battle requires a fresh judge. This supplies no
client-facing winner command. The room uses its confirmed outcome to rotate.

Run `bun.cmd test packages/engine/examples/touch-of-death/host/community` from the repository root.
The tests cover persistence failure, concurrent duplicate results, AFK
skipping, rotation, stale connections, bounded receipts, strict validation and
SQLite reopen. `flow.test.ts` earns a full set with ordinary movement and jab
contacts, passes its judged winner into rotation, fails the first save, and proves
retry commits the next pairing once. No damage, stun or transforms are injected.
`room.test.ts` exercises the engine's serialized room hooks with three users:
physical set completion, role rotation with unchanged connection IDs, stale
packets, save retries, disconnects and restart. It also checks fractional server
clock isolation and validates snapshots during a disconnected loser's failed save.

Portable arithmetic now passes exact Chrome/Bun physical scenarios, full sets and
an exported-hit checkpoint. See the
[delivery ledger](../../docs/touch-of-death-demo.md) for that
bounded evidence. Full exported-browser room acceptance is recorded there;
other browser/device combinations need separate acceptance.

## Host and engine boundary

The engine supplies authenticated room hooks, serialized operations, bounded
binary schemas and deltas, combat simulation, spectator playback and SQLite
persistence. Queue order, readiness, streak caps, result display and rotation are
Touch of Death host policy. No new transport framework is involved.

Low-frequency queue/ready commands use existing room events; combat inputs remain
binary. Each playing battle receives a fresh child relay, runtime and judge.
Community inputs reject private-bout rematch votes; the next pairing must ready up.

Use `player.userId` for durable membership and `player.id` for current connection
ownership. Freeze their mapping at battle start: judge seat IDs are ephemeral,
whereas coordinator fighter IDs are stable users. Translate only a judged result.
The room holds a confirmed result for three seconds, then persists completion
before publishing rotation. A failed write retains the result and freezes input
until retry succeeds. A departure after the judged result commits that result
before processing the departure: quitting cannot avoid a loss. Offline fighters
retain their frozen battle seat identity while that write awaits retry.
Failed queue or ready writes instead ask the person to try again. They do not
freeze combat or silently retry the intent; background ticks and spectator cursor
updates preserve that message until another queue/ready action succeeds.

The room uses `options.now ?? Date.now` for durable deadlines and result display;
the engine's fractional monotonic simulation clock remains separate. The local
host owns `community.sqlite` beside the project directory and closes it on stop.
Its optional `databasePath` setting overrides the location. Never attach automatic
room-state persistence to this wrapper: the coordinator owns the namespaced
durable record, while runtime, relay and connection objects stay in memory.

The client recreates its fighter/spectator session when the authoritative battle
changes without reconnecting its socket. Spectator cursors include the battle ID
so old traffic cannot advance the next battle. Save replay concerns the current
battle; the host's HTTP recording archive still covers private bouts only.
See the [local host instructions](../README.md#community-rooms) for endpoint,
development tokens and a short manual journey. Public authentication and other
browser/device acceptance remain separate delivery work.

## Room communication

Community protocol version 2 adds per-person chat snapshots; older exports are
rejected with a latest-export message. The host reuses engine durable chat in the
same SQLite file and stores personal preferences under `tod-social:<userId>`.
One social service owns all rooms on a host. Chat retains 32 messages per room,
allows 280 characters and 512 UTF-8 bytes, and reserves at most four sends per ten
seconds. Retry preserves the request ID; uncertain writes can temporarily consume
a rate slot without creating duplicate messages.

Mute hides incoming messages. Block filters communication in both directions,
including other rooms on this host; it does not evict players or alter pairings.
Preferences persist across reconnects and host restart. Reports retain the actual
host message, sender, room, reason and timestamps atomically in the reporter's
record. Reports are saved locally and explicitly unreviewed. Each person has a
64-report limit; reports are never silently evicted. This is not a public moderation
operation or a voice service.

Social membership is authenticated and temporary. `leave({ roomId, userId })`
revokes communication and uploaded-image access in that room; `dispose({ roomId })`
revokes its entire membership. Community admission failures clean up membership,
and disposal cleans up even when saving a battle fails. Other joined rooms and
durable mute/block/report records remain intact. Empty rooms release their cached
chat history; a later join reloads it from durable chat. The shared person cache
remains bounded at 4,096 records because retained messages need sender block
preferences even after that sender leaves. Feedback is dropped after a person's
last room departure. These caches do not confer membership or image access.
Membership relies on the authoritative server's single-login lifecycle: it awaits
the old player's leave before admitting a replacement, and ignores subsequent
leave callbacks for that removed player ID. Live recovery retains that ID and
does not run join/leave hooks. Hosts bypassing this lifecycle must supply equivalent
ordering before calling the social service.

Verify with three separate browser accounts: send using Enter, mute and unmute a
sender, block and unblock them while the third account still receives messages,
report a retained message, then leave and rejoin to check saved preferences.
Chat text must remain literal and focused form inputs must not control a fighter.
Run `bun test packages/engine/examples/touch-of-death/host/community apps/engine-editor/src/scene3d/network`
for persistence, uncertain-write, spoofing, schema, UI and room integration cases.
