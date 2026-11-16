# Directed weapon kits

The [Art Constitution](../../../../../docs/touch-of-death-art-constitution.md)
owns taste and the owner's weapon correction. `intent.ts` maps actual source move
IDs to tactical jobs before synthesis can rewrite pose labels. `grammar.ts` binds
those jobs to bounded family treatments and explicit strengths/weaknesses.
`author.ts` expands native weapon variants and applies the family's timing,
damage, stamina, recovery and contact geometry. It is used by both city weapon
authoring and the bounded art slice; the old city rig is still separate.

Blade cuts, short stabbing tools, weighted blunt blows, long two-hand levers and
flexible chain attacks retain the unarmed command's purpose. A neutral anti-air
still rises; a forward lunge still commits forward. They do not copy its wrist
path or automatically inherit its exact frame data. Primary heavy blunt damage
is paired with longer anticipation, stamina cost and missed recovery. A hit does
not erase all of that commitment.

The normal city builder previously replaced the sword templates with scaled
unarmed values. That override is removed. Catalogue refresh remains idempotent,
and all emitted moves pass the native combat config validator. Timing changes
rescale cancel windows while preserving hit-only gates, source IDs and commands.
Short tools retain the rounded-tip contact primitive; applying a finite sector
removed its horizontal thickness and made some short contacts unreachable.

`art-direction/actions/weapon-motion/` owns the actual paths and differentiation
audit. Heavy/light, anti-air/lunge/counter/overhead/sweep trajectories are compared
at matched phases. The check is scoped to this fighter and cannot grade taste.
All important directed variants now get their own clips, not only the base move.

The nunchaku reference requested by the owner is
[Bandai Namco's official Maxi trailer](https://www.youtube.com/watch?v=RUM-T9VpjL4).
Local visual study examined 7–10s and the broader 10–43s sequence: changing swing
planes, short regrips, body turns and flowing continuation are the useful cues.
The original motions here use a right-hand swing, reachable catch, left-hand
orbit and return catch. Both physical handles keep their identities; chain and
free-handle direction are separate. Trailer frames remain local research, not
redistributed game assets or claims of exact moveset reproduction.
The runtime also carries the held hand through a combo cancel; a new action cannot
reset a left-handed phase to the other fist. This is checked with both a pure
transition regression and native weapon input.

Verification:

```text
bun test apps/engine-editor/verification/art-direction/weapons/direction.test.ts
bun test apps/engine-editor/src/scene3d/game-integration/city/weapons/catalogue.test.ts
```

The [render workflow](../../../../../../../../../apps/engine-editor/verification/art-direction/README.md)
owns native captures, hashes, immutable review versions and corpus archival.
