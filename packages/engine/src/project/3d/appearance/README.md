# Authored fighter appearance

`hyperfocusAppearance` declares actor-scoped wardrobe slots. Options may replace
opaque colors, authored variants, or curated `poses` with `phase: 'intro' |
'victory'` and `style: 'default' | 'bow' | 'salute' | 'fists-up'`. Pose-only options
are allowed. Options within a slot must replace the same targets; two slots
cannot own the same pose phase. Bounds are 24 slots and 32 patches
per option. Omitted selections use authored defaults.

Options can also bind curated `styles` channels: movement (`classic`, `loose`,
`compact`), hit reaction (`classic`, `snap`, `reel`), movement particles
(`classic`, `ribbons`, `embers`), player card (`classic`, `sunrise`, `night`),
and round recovery (`stand-up`, `roll-up`, `kip-up`, `materialize`).
Each channel has one slot owner. `applyAppearanceMotion3D` consumes the resolved
choices after combat posing on a fresh frame. Movement changes elbow posture
only while free of attack, guard and stun; hands and root remain fixed. Hit
reactions roll the head without changing its position. Particle choices reshape
existing movement trails, leaving contact, guard, parry and tech effects intact.
Reduced motion disables extra body motion. Card choices are host presentation.

`resolveAppearance3D` returns detached actor-specific pose choices alongside
colors/variants; legacy catalogs omit the optional `poses` result. Pass choices
to gameplay `presentFrame(frame, { poses })`. The combat match presenter replaces
the intro gesture and blends it out during the existing countdown. Victory poses
apply to the terminal match winner. `createCombatRoundRecovery3D` uses the
equipped victory gesture only for a terminal result, defaulting to raised fists.
Held-item posing runs before that blend; a final attachment pass follows the
posed gripping hand without replacing the victory arms or snapping the shaft.
During the final 90 interlude ticks it blends the fallen fighter's KO rig into
their equipped recovery, ending at the supplied standing body center. The
recovery presenter runs after the KO presentation. Its particles are cosmetic;
reduced motion uses the plain stand-up without the particle burst. Practice and
ordinary fighting receive no recovery overlay.
Neutral grounded fighters blend into a hunched posture as stamina falls below
45%, with lowered hands and subtle breathing. Attacks, guard, hit reactions and
wall traversal retain their own clear poses. This fatigue presentation adds no
movement penalty or combat state; reduced motion removes the breathing pulse.
These overlays never change authored attacks, physics, collision, resources,
match clocks or combat checkpoints. They belong only on fresh evaluated frames.

`createAppearancePosePresenter3D()` also previews a selected style without running
combat. Supply `frame`, `actorId`, `style`, normalized `progress` and `settle`.
For the legacy Default intro, also supply `phase: 'intro'` and `fighterIndex: 0 |
1`; it shares the exact legacy gesture implementation. Default victory is a
no-op. Repeated presentation restores its frame baseline rather than accumulating
offsets. The curated poses use the same named humanoid head/arm/hand entities as
combat visuals; actors without those parts remain unchanged. Uploaded images
and arbitrary animation/transform programs are outside this contract.

Catalog tests cover conflicts, invalid phases/styles and detached defaults.
Combat match tests cover per-fighter intro, preview parity, countdown settling,
terminal winner selection, live-phase exclusion, and unchanged checkpoints after
actual authored jab contacts with cosmetic choices supplied.
