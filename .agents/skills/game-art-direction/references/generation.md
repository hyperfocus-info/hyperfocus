# Intent before generation

The model interprets intent and selects among bounded alternatives. Code owns
expansion, constraint preservation, validation and evidence collection. Keep those
responsibilities separate: another paragraph asking an agent to make good art did
not prevent Touch of Death from producing many names for nearly the same stroke.

Choose the [production path](production.md) before defining recipes for a new
visual domain. Recipes may describe shape, surface/material, world structure,
motion or feedback through `treatment`; legacy `motion` fields remain supported.
No field or recipe name establishes that its generator is implemented.

Use the [shared planning tool](../../../../scripts/game-art/README.md#intent-before-generation)
to bind each actual required asset/action to a family, intent and recipe. Recipes
state their visual treatment, strength and cost. Missing slots fail; ambiguous
slots expose at most three coherent candidates and need a selection. Do not infer
taste approval from a single permitted recipe. Preserve the source and scoped
acceptance of the owning grammar.

Do not let the model re-author joint paths, materials, timing and palette for every
variant when an established recipe already owns them. Give it semantic choices
and bounded consumer parameters. Extend the grammar deliberately when those choices
cannot express the request. Keep generated results editable and the plan inspectable.

Coverage is insufficient. Test known degenerate outputs: relabeled cloned motion,
missing evidence, unknown intent, detached grips, invalid retargeting and violated
accepted assets. Compare actual trajectories and rendered silhouettes, not recipe
names or unique frame counts. Reuse across equal intents is legitimate; reuse
across different jobs requires explicit evidence that it still communicates them.

Touch of Death's real builder now rejects missing recipes and recycled weapon
trajectories before capture; review packaging requires each directed move's four
views. The first differentiation sweep rejected five samey pairs in the new
implementation. This proves a recurring defect can be caught by the factory. It
does not prove professional taste, a GOLDEN, or lower-model success on a new genre.

When transferring to another game, preserve the compiler, evidence contract,
rejection examples and scoped locks. Establish that game's taste and grammar using
cheap candidates. Measure time, repair rounds and blind rendered review before
claiming that a weaker model has become sufficient.

Use the consumer manifest with `art:run` instead of manually coordinating each
build/capture/package command. Keep input fixtures out of ignored prior-build
directories. Pale Reach exposed both failures: hidden baseline dependencies and
manual retry decisions. Its adapter now uses a hash-locked durable replay, the
shared capture host and versioned runner receipts. Resume unchanged completed
steps; preserve partial submissions and change version when inputs or bytes change.
