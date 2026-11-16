# Touch of Death cosmetic contract

Owner: [Art Constitution](touch-of-death-art-constitution.md). This contract covers
wearables, palette options, cosmetic motion, movement particles and profile art.
Combat signals retain their own authored language. The four tiers are requested
by the owner; the new garment and particle treatments are **CANDIDATE**. On October
4, 2026 the owner selected **theatrical martial arts: bolder silhouettes and
stylized energy effects** for legendary cosmetics. This establishes direction,
not acceptance of the rendered Stormfold/Arc wake implementation.

## Legendary technology direction

On October 5, 2026, the owner answered the cinematic-versus-physical effects
question: **"Physical technology: effects come from visible equipment, requiring
an approved explanation in the lore."** This selects the source of legendary
energy while retaining the theatrical martial-arts direction and the game guide's
grounded, non-supernatural setting.

Legendary energy must have a visible equipment source and a readable connection
between that equipment, its activation and the emitted effect. Equipment should
belong to the garment's construction rather than appear as an unexplained aura.
On October 6, 2026 the owner selected **"Arena-issued telemetry — visible sensors
and status lights make the experiment’s infrastructure more apparent."** Arena
issue, movement measurement and equipment status lights are now the approved
lore basis. This does not establish a new faction, power source, implant, weapon
upgrade or explanation of memory erasure.

The implementation candidate uses mounted chest/back sensors with inset blue
status lamps. Grounded movement events trigger a short lamp pulse; lamps stay
on their housings. No energy is projected into the world and no mechanical
advantage is conferred. The theatrical coat silhouette remains the garment's
primary read. Selecting the telemetry effect independently also equips the
hardware, so an effect can never appear without its source. Reduced motion keeps
steady status lights and suppresses pulses.

The prior Arc wake crescents remain historical evidence, not an approved
reference. Review must show equipment at rest, activation, decay, gameplay
scale, independent effect selection and reduced motion. Hardware shape and
rendered finish remain CANDIDATE; the lore choice is not whole-asset approval.

## Intent and rarity

| Tier | Visual job | First clothing study | First movement effect |
| --- | --- | --- | --- |
| Common | Complete, economical everyday design | Work jacket study | Street dust: low matte grit |
| Uncommon | One functional construction difference | Reinforced yoke; training vest alternative | Slipstream: travel-aligned tapered strokes |
| Rare | Recognisable authored construction and composition | Courier cut with asymmetric panel | Forge flecks: sparse warm arcs |
| Legendary | Theatrical martial arts within the same readability budget | Telemetry coat with broader folded shoulders, crossing panels and mounted sensors | Telemetry pulse: inset equipment status lamps |

Common is not permission for unfinished work. Legendary is not permission for
larger bodies, more particle density, constant auras or obscured opponents.
Rarity and `ROUGH → CANDIDATE → APPROVED → GOLDEN` are independent axes. Human
identity choices (skin, face, hair) remain unranked. Tier text accompanies UI color.
Owner revision (October 18, 2026): reduce the free inventory and add cosmetics.
Identity choices stay free; each equipment/style slot has one free starter.

The October 18 mastery candidate adds three coordinated looks from the existing
catalog: Yard shift (reinforced jacket, work boots, warm markings and salute),
Night courier (courier cut, wide trousers, trainers and bow), and Relay contender
(telemetry coat, ivory/navy palette and mounted sensors). These are authored
combinations, not new meshes or extra catalog items. Hair, face and skin are
preserved. Full-look previews remain temporary until all required pieces are
owned and the player chooses Equip. Pricing and saved goals belong to the
[reward contract](../host/progression/README.md). Rendered combinations remain
CANDIDATE pending owner review.
Earned collection receipts survive upgrades, and an existing saved outfit can
retain its worn styles until replaced. Boxes cost 100 earned coins and draw equally
among locked, uncollected options; free choices never consume a draw. Exhaustion
spends no coins. Slate, Moss, Clay, Plum, Cobalt and Ash add 24 common clothing-color
options across four slots. Tiers describe expression, not drop odds. No monetization
is introduced. Device and host collections remain separate.

The wardrobe lets players try locked styles on the actual fighter. Previewing
does not edit the wardrobe draft or grant ownership; Save is disabled until the
player returns to an owned style. Cancel restores the saved appearance. The
existing ownership validation still governs ordinary equipment and outfit saves.

## Required generation input

Each item names its game, slot, semantic intent, rarity, selected recipe, target
rig/attachment frame, material roles, accepted qualities, unresolved qualities and
evidence version. Select from the owning recipes. Missing intent fails planning;
do not generate an arbitrary fallback. A new family requires a bounded comparison
before detailed work. Never infer approval from a recipe being the sole choice.

The [executable particle recipes](../src/presentation/cosmetics/direction.ts)
compile through Hyperfocus's shared direction planner during normal fighter asset
cooking. Code owns expansion, bounds and binding. AI selects intent and a recipe;
it does not independently invent scale, lifetime, palette or emitter density.

## Clothing and rig contract

- Preserve fighter C's silhouette, approved forearm bytes and restrained motion.
  Fit garments to native bind coordinates. Never shrink limbs to fit legacy meshes.
- One primary garment mass, one subordinate construction panel, small functional
  hardware. Cropped workwear, practical footwear, muted cloth and limited metal.
  Upper-tier distinction must read in cut or construction, not just recoloring.
- Every variant binds on both fighters. Evaluate guard, run, crouch, maximum reach
  and recovery for clipping/detachment; include front, three-quarter and side views.
- Preserve mechanical roots, colliders, contact endpoints, timing and stamina.
  Material/mesh swaps are presentation only. Save, reload, preview, online profile
  and replay must resolve the same stable option ID.

## Particle contract

Priority: **defensive/contact information → attack/traversal readability → decoration**.
Movement cosmetics own `:dust:*` and the explicitly attached `:art:telemetry-*` equipment. They never reshape `:trail:*`, `:spark:*`,
guard, parry or tech entities. The previous shared-trail deformation is a regression
fixture, not precedent. Impact B remains the selected radial-burst language.

- Dust emits at a grounded foot/landing/dash event; retain the world anchor as the fighter
  leaves. No torso-following clouds, idle emission or decorative air-jump dust.
- Telemetry responds to the same grounded events with attached status lamps; it emits no free particles.
- Use authored grit or tapered strokes. Avoid default spheres, luminous floor
  discs, regular bead rings, random hues and uniform lifetimes for every treatment.
- Read → brief emergence → directed travel → shrinking tail → complete disappearance.
  Surface dust stays matte. Warm flecks and cool technology use subordinate accents;
  neither imitates a defensive success signal.
- At most 3 retained events and 12 decorative particles per fighter. Lifetimes at
  most 24 simulation ticks; center travel ≤0.65 m, height ≤0.35 m, radius ≤0.06 m.
  Legendary uses the same ceiling. Bounds are executable, not taste scores.
- Fixed simulation ticks own emission. Repeated renders cannot emit again. Rollback,
  seeks and teleports clear stale presentation anchors. The sampler is deterministic;
  preview and gameplay use the same sampler. Reduced motion suppresses decoration
  while keeping the mechanical signals.

## Acceptance and evidence

1. Validate identity, finite transforms, material/mesh links, tier coverage, pool and
   timing budgets, saved-ID compatibility, accepted bytes and mechanics isolation.
2. Capture actual renderer output: neutral, gameplay distance, opponent contact,
   emergence/spread/decay/settle frames, reduced motion, and relevant wardrobe UI.
   Use the same starting snapshot, input ticks, camera and resolution before/after.
3. Narrow critics record **evidence → observation → cause → repair/reject**: silhouette,
   attachment, motion, material, palette, cue priority, composition and procedural
   clutter. A greater particle count is not an improvement criterion.
4. Archive versioned source/plan hashes, media hashes, checks, critic findings,
   repair rounds and scoped owner feedback. Missing views or failed checks leave
   ROUGH; complete evidence establishes only CANDIDATE. Explicit owner acceptance
   and reference designation are separate steps.

The [capture workflow](../../../../../apps/engine-editor/verification/art-direction/cosmetics/README.md)
and its regression tests are the first real consumer. Other games inherit the
planning/evidence discipline and isolation checks, not this game's colors or tiers.
The [wardrobe and bridge finish pass](touch-of-death-art-corpus/wardrobe-bridge-finish/README.md)
evaluates alternate hair, native trainers, trouser construction, combat expression
and equipment finish in a separate version. These remain candidates; the
collection does not establish the whole wardrobe as GOLDEN.

The [first collection's result](touch-of-death-art-corpus/cosmetics-result.json)
records source hashes, scoped critics, rejected iterations, verified capture
clocks and remaining limits. The corpus retains its concrete negative examples.

The [common service construction pass](touch-of-death-art-corpus/service-construction/README.md)
adds a fitted collar/pocket/yoke candidate and a component-material sledgehammer
in the native city. Its material alternatives and integrated utility treatment
remain candidates; they do not establish a new approved rarity rule.

Construction constraints demonstrated by the finish pass:

- Hair, trousers and footwear variants use native attachment frames. Preview,
  normal setup, later wardrobe setup and knockout must retain the same fit and
  appearance-role bindings. Stable saved option IDs do not require legacy meshes.
- Sewn reinforcement and wear sample the garment's actual profile and segment
  breaks. Wear belongs at hems, cuffs and contact edges; it is not uniform noise.
- Expressions follow native effort, hurt and knockout states. Held weapons keep
  their grip; released hands are limited to unarmed hurt/knockout. No expression
  may alter the accepted head pose, limb geometry or combat timing.
- Telemetry finish uses mounted faceplates, recessed optics, vents, identification
  and strain relief. Small inset status lamps retain the existing event and
  reduced-motion rules. This is a candidate interpretation of the approved lore.
