# Actor autonomy

`createActorAutonomy` and `chooseActorAction` remain synchronous exports of
`@hyperfocus/engine/navigation`. Actor orchestration lives in `src/actors/autonomy.ts`;
the navigation wrapper preserves existing imports without adding physics, motion,
DOM or host dependencies. Utility selection and grid A* remain the owners of choices
and routes. This is a bounded kinematic planner, not general intelligence or physics.

Hosts supply perception and renew `supports` each tick from authoritative physical
evidence. A fresh acquisition must match the helper's current assist recipient;
renewal must match the previous pair. Historical `assisted` never authorizes a new
binding. Both links acquire/release in the same snapshot. Confirmed walking pairs
translate together inside the 1.2-cell root envelope at .45 times the slower member's
speed; both roots must pass wall/body clearance. Recipient reaction delay prevents
voluntary action, not externally supported walking. Injury never heals with time.
Losing renewal stops the recipient before movement and opens a fresh, bounded
reapproach attempt. Unconfirmed approaches expire after two seconds even outside
service reach. Carrying, lifting, load transfer and hand contact are not inferred.

Destination identity survives occupancy. `exits[].safeCells` declares an arrival
region; pairs must both occupy valid distinct root positions within it. Without an
explicit region, singles arrive in the exit cell and pairs use a 1.05-cell region
around its centre. Arrival stops travel. `clearArrival(id)` explicitly transfers an
arrived, unbound actor out of this local collision world while retaining its final
snapshot with `cleared: true`. Bind release precedes pair clearance. Actors never
implicitly despawn. Hosts must clear occupants to drain a shared exit.

Routes are memoized by start/goal (4096-entry FIFO bound), invalidated by geometry
or unsupported-obstacle changes. Cell advance requests the next cached route suffix;
there is no unconditional per-substep search. Snapshots report cumulative `searches`.
Movement proposals read one substep snapshot and reserve accepted group endpoints.
Arbitration rotates by tick. A bounded side yield follows sustained body obstruction;
no-progress and occupied-exit queue reasons remain observable through `blockedReason`.
These are selected regression repairs, not universal deadlock freedom or fairness.

Body radius is .35 cells, swept substeps <=.05 cells. Whole-disc wall clearance and
.7-cell pair separation apply. Bounded single-neighbour pushes remain kinematic.
Optional `position` and `facing` preserve authored continuous spawns; their containing
cell, wall clearance and pair separation are validated. Idle actors retain their
placement. `exitId` lets a host reserve a destination without removing other bodies.
Snapshots expose `passiveDisplacement` per tick separately from obstruction labels.
Legacy `body:<id>` contact labels mean prospective obstruction, not solver contact;
velocity includes passive displacement. Hosts must not infer physical hand contact,
loaded support or forward walking solely from these labels/pose intents.

Stable IDs, seed and tick inputs replay in the same JS environment independent of
actor/perception input order. Traits and needs are [0,1], speeds (0,10], dt (0,.1],
with 256 actors and 65,536 cells maximum. Reaction delay begins at world start.
Perception, animation, physical resolution and durable lifecycle remain host-owned.

Run `bun test ./src/navigation/actor-autonomy.test.ts ./src/navigation/actor-escort.test.ts`
from `packages/engine`. These regressions establish kinematic behavior; the native
loaded-hand consumer and navigation bundle ceiling remain separate acceptance gates.
