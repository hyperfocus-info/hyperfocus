# Quick Play host policy

This directory implements pairing, trusted rating storage and the authenticated
`tod-quick-play` room. The exported Online Quick Play entry has search, cancel,
accept, result and play-again controls. Local-AI Quickmatch remains separately
labeled. Browser acceptance is recorded in the demo delivery ledger.

`policy.ts` selects the oldest player with a viable opponent, then the closest
rating. Both players must accept the rating gap, share region/content and meet
the host latency ceiling. Provisional defaults start within 100 rating points,
widen 50 points every ten seconds, cap at 600, and require latency at most 150 ms
per player. These are tuning proposals, not population or internet measurements.
No waiting time manufactures a bot or overrides compatibility.

`matchmaker.ts` binds host-authenticated user identity to engine tickets. The host
supplies current measured latency and loads ratings from its ledger. Client queue
intent supplies neither. Engine `matchGroup` atomically reserves a complete pair;
the game then reserves immutable participant ratings. If that second write fails,
the durable assignment permits `resume` to reconstruct the same reservation.
Cancel succeeds only before assignment; an assigned player receives the match ID
and must resolve that assignment rather than silently erase it.

`ratings.ts` uses SQLite IMMEDIATE transactions to commit both ratings and the
unique result receipt together. Fixed-K24 Elo starts at 1000. Only a trusted host
judge may call completion. Duplicate results return the saved receipt; conflicting
results fail. Pending matches prohibit overlapping rated matches. Result commit
precedes ticket release, which can safely retry after failure. Host interruption
is a distinct no-rating-change record, not an invented combat winner.
`resume` may return an already complete or aborted receipt after interrupted
finalization. The room adapter must finalize/display it; only a pending receipt
can advance to readiness and combat.

`ratings-postgres.ts` provides the Railway PostgreSQL implementation using a
borrowed Bun SQL pool. Transaction-scoped advisory locks serialize reservations
and completion across connections; participant balances, active reservations and
the exact-once receipt commit together. SQLite remains the local implementation.
Both implement `QuickPlayRatings`: all admission and write callers await storage.
Synchronous replication views show only the rating loaded at admission or from a
successfully committed result. Matchmaking stores the host-read rating on its
ticket because the engine selection callback is synchronous; reservation freezes
fresh database ratings before a fight starts. A failed database operation never
reports a completed result or advances its displayed rating.

The live PostgreSQL regression creates and drops its own random schema. Set
`TOUCH_OF_DEATH_POSTGRES_TEST_URL_FILE` to a private file containing a connection
URL, then run `bun test packages/engine/examples/touch-of-death/host/quick-play/ratings-postgres.test.ts`.
It checks concurrent retries, conflicting receipts, partial-write rollback,
fresh-pool recovery, rewards and the asynchronous coordinator flow. Without that
explicit environment variable the network test skips.

`room.ts` keeps searches and fights on one socket, with a separate relay/runtime
and host judge for each pair. Both people must accept within fifteen seconds.
Replication acknowledgements provide recent host-measured round-trip samples.
Protocol 9 also supplies explicit `connectionReady` metadata: Search remains
disabled with an explanation until two current samples exist. Between fights,
bounded nonce probes run every 500 ms during initial measurement and every three
seconds afterward. Their replies contain only the echoed nonce. These probes
avoid waiting indefinitely when a slow renderer acknowledges a replication
sequence that the high-rate stream has already superseded. The host keeps at
most four outstanding probes per connection, rejects stale/duplicate/unknown
nonces, and owns all timing. Old connections cannot measure a replacement.
Ready timeout or decline
aborts the assignment, and another search is explicit. Saving has its own visible
state; no rating delta appears until the durable result and ticket release finish.
An earned result commits before departure, even when saving must retry. New host
processes explicitly abandon unfinished assignments instead of claiming to resume
combat from absent history.

Once both players accepted and the coordinator is playing, terminal `leave`,
`duplicate-login`, `reconnect-timeout`, or `connection-close` concedes the set to the other fighter
through the same durable rating completion path. No damage, round wins, or inputs
are injected into combat. A pending judged result takes precedence. When both
fighters depart, the first serialized terminal departure fixes the outcome;
subsequent departures and failed ticket-release retries cannot erase or reverse it.
Before playing, departures cancel without rating changes. `server-stop`, shutdown,
restart, and legacy unclassified `disconnect` remain unrated interruptions.
`connection-close` covers nonrecoverable socket closes on recovery-enabled hosts;
choosing a custom close code cannot erase a loss.
`leave({ userId, connectionId, reason })` receives trusted transport reasons, never
client outcome claims. `shutdown()` saves pending outcomes and aborts unfinished
matches. Transport reconnect grace must retain the same admitted player without
calling `onLeave`; expiry produces `reconnect-timeout`. This differs from the
coordinator's immediate terminal departure handling. Public identity and hosting
remain separate release work: the owner selected Clerk OAuth and Railway. See
the [accepted public-service and quality policy](../../docs/touch-of-death.md#hosting-accounts-replay-cost-and-connection-quality-2026-09-27).
Connection-quality monitoring now runs during accepted Quick Play and community
battles. The host issues a connection-bound random probe every 250 ms and measures
its acknowledgement round trip; missing the one-second deadline counts as an
application delivery miss. The other seat's accepted contiguous input lead is
attributable input debt, a rollback-pressure proxy. Neither measurement claims to
measure TCP packet loss or the actual visual correction on a browser.

The monitor uses nearest-rank p95 over a rolling one-second window (four samples).
Input debt above three frames, delivery misses above one percent, RTT above 200 ms
combined with debt above two frames, or at least two unilateral 500 ms input-stall
observations mark degraded delivery. After ten continuous seconds the room shows
a warning. Recovery clears that warning and restarts the continuous interval.
An automatic **unrated no-contest** requires both independently monitored peers
to remain degraded for ten seconds. A single peer's proxy measurements never
award a loss, win, rating change, or streak. A host update gap over 750 ms or active
transport recovery discards the measurement history instead of blaming players.
The transport's existing terminal disconnect policy remains separate.

The host accepts only replies to outstanding random probes for that authenticated
connection and battle; it accepts no client metric or outcome claims. Quality
aborts use the existing durable interruption path and retry failed storage. Earned
combat results already pending retain precedence. Completed results also invoke
the optional idempotent reward callback after the durable receipt, with callback
failures retried by the coordinator; aborted matches grant no rewards.

Run `bun test packages/engine/examples/touch-of-death/host/quick-play` plus engine matchmaking tests.
`room.test.ts` earns full sets with physical approach and authored attacks, while
ledger tests use synthetic trusted results only to establish transactions. Release acceptance needs
four browser clients, two compatible pairs, real physical set outcomes, retry and
restart recovery, and exported controls with durable profiles.
## Shared uploaded outfits

The local relay shares its upload and social services with Quick Play. Protocol
version 8 advertises `uploadsEnabled` and the viewer's durable block
list. Hosts without the upload wrapper advertise false and an empty list.
Authenticated join/leave/disposal owns social membership; failed admission and
failed result saves do not leave image access behind.

Change equipped pictures only while idle or viewing a committed result. Searching,
ready, playing and saving lock equipment. Foreign gallery metadata and pixels are
limited to the currently assigned opponent during ready, playing, saving or result;
other pairs in the same queue are not an image audience. Explicitly shared
unreviewed images may display and equip immediately; local previews stay private
until sharing, and rejected/removed images cannot display. Both people's durable
blocks apply. Image requests recheck the
pair after storage awaits and clear all metadata and pixels if it changes.
Revocation, removal, blocks and departures use the existing private invalidation
events. The client must discard the previous pair's cached outfit on match changes.
Quick Play accepts gallery mute/block preferences, without adding chat or voice.
The exported client exposes opponent image block/unblock in paired offers,
results and live fights. `blockedUserIds` acknowledges durable state; failed
saves preserve the prior list and populate `quickPlay.error`. There is no
request-specific social receipt in this room. Blocking does not affect pairing
or ratings, and the other person's block can still deny images after unblocking.
