# Touch of Death action motion

Consumer-local motion for fighter C and its articulated profile rig. The
[Art Constitution](../../../../docs/touch-of-death-art-constitution.md)
owns taste and accepted scope. This is not an engine humanoid default.

`catalogue.ts` enumerates movement, defense and interaction states and checks
every authored move, including the actual city weapon synthesis. Unknown move
IDs fail. Family variants share grip/path grammar and retain their own simulation
timing, contact count, Drive/direction and recovery.

`runtime.ts` resolves native states; `sample.ts` also exposes deterministic
studies. Traversal poses do not move the physics root. Approved UAL-based idle
and running remain in the existing adapters. Weapon presentation attaches to
the solved wrist; two-handed tools project their shared shaft into both reach
spheres. Nunchaku now use independent chain/free-handle paths, reachable catches
and right/left hand transfers with persistent physical handle identities.

The [weapon intent owner](../../city/weapons/direction/README.md) selects bounded
family treatments and native tradeoffs. `weapon-motion/` implements their paths
and a build-time differentiation/transfer gate. This caught five samey pairs in
the first repair pass despite unique move IDs and timings. Traditional weapon
variants now receive individual motion clips as well as frame strips.

Attack commitment has at least three available samples when native startup
permits. Applying the long attack's final-third timing to a three-frame follow-up
caused a 0.666 m elbow jump. The full-timeline regression catches this. Native
repeated renders must leave cached transition poses untouched: mutating a cached
weapon grip caused movement during frozen combat time.

See the [complete-set evaluation workflow](../../../../../../../../apps/engine-editor/verification/art-direction/full-set/README.md).
