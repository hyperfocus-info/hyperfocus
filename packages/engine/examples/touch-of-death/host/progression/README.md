# Touch of Death rewards

The exported Rewards dialog opens on earned milestones, or Collection when a box
is affordable. Earned milestones, Collection and the device Mastery journal lead;
all categories are available immediately. Daily claims and
the wheel are optional. The legacy discovery stage remains readable for old
clients but no longer gates spending earned coins or claiming milestones.
Saved unlocks lead the dialog with a persistent receipt, authored color swatch
where available, direct Equip and a fighter-preview action. Nearest milestones
lead; the full list is disclosed.
Players may pin a style goal free of charge, preview it, and buy that exact style
for 300 coins. An empty collection's first individual style costs 100 coins,
allowing the first-set milestone to fund a deliberate choice. This uses the same
price calculation and durable purchase path on device and host. Coordinated looks
cost 200 coins per missing earnable component;
free and already-owned pieces never add to the price. Players can unlock the
next missing piece for 200 coins, starting with the main garment,
without losing the full-look goal. The nearest piece leads the progress meter;
the complete-look price remains visible. All purchases and goal changes
use the same durable, idempotent command path as existing rewards. A saved goal
replaces the competing random-box progress meter. Boxes remain optional.
Device rewards persist in
the project's local save profile; account rewards belong to the authenticated
host identity and never import client balances or match outcomes. Local AI sets
earn device rewards; host-judged Quick Play and winner-stays sets earn account
rewards. Private sets and shared training earn bounded social coins, described
below. Replays, spectators and no-contests earn no set reward.

Friend-play direction approved on 2026-10-22: bounded progress toward existing
cosmetics. Initial tuning is 25 account coins per five active minutes together,
capped at 100 per account per UTC day across rooms and partners. The host samples
accepted, advancing fighter inputs once a second; both players must change active
inputs within the last 15 seconds. Idle/held controls, spectators, disconnected
seats and large clock jumps do not accumulate time. This is participation, not
proof of skill: it changes no wins, set achievements or rating. Same-pair training
resets retain unfinished minutes; changing partners, closing the room or restarting
the host discards them. Saved coins persist. A failed grant retries its same receipt
while the room remains open. The daily cap is enforced atomically by the account
service, including simultaneous rooms and retries across midnight.

Earning rules appear before joining and in Rewards; confirmed social grants appear
in the arena. An additive `social-activity` event reports bounded elapsed time and
active, idle, waiting, saving or capped status to seated players. The arena meter
uses this host observation, never a client timer; it grants nothing and remains
separate from persisted reward receipts. Local set results show saved coins and a ready milestone/style goal.
The pace is a starting hypothesis, not a measured retention result. Older saves
default the new social counters; profile/training protocol 5, community 11 and
Quick Play 10 gate the expanded reward state, so update host and client together.

Current tuning: a completed set earns 40 coins, with 20 extra for a win. UTC daily
claims grant 50 coins plus 10 per consecutive day, capped at 110. Missing a day
restarts the streak bonus without removing currency, collections or achievements.
One free UTC daily wheel grants 25/50/100/250 coins with 50/30/15/5 percent odds,
shown before spinning. A box costs 100 coins and uniformly draws an uncollected
unlock; free starter and identity options are excluded, and exhaustion spends
nothing. [Cosmetic ownership](../../docs/touch-of-death-cosmetics.md#intent-and-rarity)
owns the smaller starter inventory and saved-outfit compatibility. The wardrobe
allows locked previews, disables saving them, and the host validates publication. Cosmetics never
change combat. Seventeen permanent milestones cover lessons, sets, wins and
daily-bonus claim days, up through 1,000 sets, 500 wins and 100 claimed days. The next-goal list
includes playing, learning and returning; ready claims take priority.

Each tutorial lesson's first player clear grants 25 device coins. Saved lesson IDs
prevent duplicate grants, including repeat attempts and reloads. Demonstrations,
replays and account-mode sessions grant no tutorial coins. Completion reports the
grant only after saving succeeds; Rewards Refresh retries a failed device save.

The device Mastery journal separately records successful player completions of
combo, parry, recovery, launch steering and arena lessons. Repeat completions
earn five/twenty-clear recognition and a durable count, with direct practice
entry from Rewards. Demonstrations do not count; these records grant no coins,
account status or rating. They are practice history, not proof of competitive
mastery or long-term retention.

The account service uses database transactions for grants, debits and permanent
request/match receipts. Exact retries cannot redraw, double-spend or duplicate
match rewards; conflicting request/outcome identities reject. Two participants
receive one atomic match grant. Server time and cryptographic randomness own
online claims/draws. Commands cannot name an account, winner or earned match.
Room events deliver only the caller's state, bounded to 60 requests per minute.
Collection Equip durably saves the existing device wardrobe; publishing online
still uses the explicit saved-fighter action. Account balances do not expire.

Local hosting uses SQLite. Railway uses `createPostgresRewardService({ sql,
catalog })` from `service-postgres.ts`; the host owns the borrowed Bun SQL pool.
The PostgreSQL service serializes grants across connections with a transaction
advisory lock and commits balances plus request/match receipts together. Reads
and mutations are awaited before a response is sent. Two-player grants roll back
both balances if either update fails. Payment integration is outside this
implementation. Uncertain online requests retain
their ID for Refresh / retry before allowing another mutation. Leaving/rejoining
reloads the durable account state. Device saves are local conveniences, not trusted
ranked reward evidence. Permanent receipts need a future operational archival
policy before very large-scale use; pruning must not permit old reward replays.
Storage and rate-limit errors retain that retry identity; policy rejections clear
it. Retrying a committed account action returns the current balance, including
later set awards, without executing its draw again. Device retries retain their
original random result and preserve set rewards earned while storage recovers.

Verification: `bun test --conditions=browser packages/engine/examples/touch-of-death/host/progression
apps/engine-editor/src/scene3d/rewards` plus Quick Play/community coordinator tests
for trusted completion and callback retry. Browser acceptance must cover reveal,
daily claim, spin, box, equip, reload and account isolation on the exported artifact.
