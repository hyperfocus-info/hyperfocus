# Traffic and wrecks

Cars circulate through marked parallel lanes and tangent semicircular turns.
They accelerate on the straights and slow for the turn; match seeds vary their
phase and cadence. The second east car starts half a lap behind the lead.
Double-ended depot and freight services retain reciprocal routes at 16 and
18 m/s; carts retain slower boarding motion. Rotated route envelopes reserve
return lanes and turn clearances from structures, fighter starts and stock.

Wheel and single-spoke hub rotation follows analytic traveled distance, including
each wheel's longer or shorter turn arc. Front steering follows signed curvature,
eased across the first and last quarter metre of the turn. These are render-only
quaternions: no wheel bodies, suspension or fragment simulation. The runtime's
readonly `motionSeed` getter permits sampling without another full-world snapshot.

An ordinary strike or launched fighter can disable a car or bus. A following
vehicle sweeps its body against stopped traffic and clips its linked parts at
the first obstruction. An approach exceeding both its contact-damage speed and
its surface impact threshold damages that follower too. Further cars can crash
into that new wreck. Slower arrivals queue intact. Lamps and selected trim hide;
folded hood/roof panels appear while dark glass remains. The body and cabin stay solid, usable as cover
and standing support. There are no fragment bodies or uncontrolled vehicle AI.

The environment commits the stopped position, damage phase and causal trace
together before a save or rollback checkpoint can observe them. The trace names
the struck vehicle as the cause, rather than inventing a fighter attack. Existing
`impact` and `blocked` snapshot rows remain compatible. The optional saved
`wheelDistance` scalar freezes tire and hub phase at the clipped impact pose;
old rows infer a fixed phase from the stopped route position. Rounds preserve wrecks;
a new match resets them. Secondary crashes use the existing environment-break
sound on the following combat tick. A bounded presentation queue carries that
cue across motion planning; restoring a save/checkpoint clears it so loading a
wreck does not replay stale sound. Rewinding before collision generates the cue
again. There is no separate crash asset or fire spread.

Verification:

- `bun test packages/engine/src/project/3d/combat-environment/vehicles` covers
  three-car collisions, slow queues, immediate crash saves, standing on wrecks,
  checkpoint replay, delayed network input, recorded replay and reset.
- `bun test packages/engine/examples/touch-of-death/src/presentation/city/vehicles` checks
  authored route clearance, linked feedback, repeatable authoring and an actual
  paid-strike/secondary-crash sequence.
- `city/traffic.test.ts` bounds cadence and preserves route/start clearance.
