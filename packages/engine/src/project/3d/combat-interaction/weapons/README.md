# Weapon attack roles

`attacks.ts` authors inspectable weapon equivalents from the existing unarmed
attack roles and each tool's light/heavy templates. Regeneration is idempotent.
Source timing, movement, charge and cancel roles survive synthesis; base templates
supply weapon damage, guard damage, cost and reach. Generated metadata identifies
the source role, base weapon and light/heavy wear category.

Optional `acousticProfile` selects wood, metal, glass, ceramic, soft, liquid or
scatter audio independently from the wood/metal mechanics material. A single-use
prop emits `weapon-consumed` on the accepted attempt, then `weapon-contact` only
when a fighter is physically hit, blocked or parried. Audio can therefore fracture
a brittle prop on contact without announcing a glass break on a whiff. Neither
transition changes damage, stun, recovery or consumption rules.

Optional `restPose` selects `upright` or `flat` support presentation for loose
objects. Their authored placement Y is the support plane; the visual center is
lifted by its oriented half extent, including after a drop lands. Catalog meshes
use normalized bounds. Loose support queries omit the legacy sphere-sweep padding,
so stock and drops settle on the physical plane rather than floating above it.
Held grips and airborne thrown poses remain unchanged. Omitted poses preserve
legacy centered-shaft projects and their padded terrain contact.
The editor's weapon inspector exposes the same field through `scene3d.set-combat`.

`rewriteWeaponInputs` maps both pressed and held attack keys, so travel charging
works while armed. The interaction session normalizes reach using the committed
tool move and current item length. A fresh Drive follow-up must not borrow the
unarmed wheel kick's reach. Back hops do not wear an item until a strike starts.

Optional `kit` selects a smaller authored control contract. Omitted kits preserve
existing synthesis. Explicit `combat` kits retain their primary template timing,
stun, impulse and bounded strike frames; directional timing and cancel windows
scale with the template. `simple` and `spray` expose only authored light/heavy
actions. `single-use` and `ground` map both attack keys to the light template,
consume on an accepted attack attempt, preserve its active/recovery frames, and
clear buffered attacks before returning to unarmed combat. These smaller kits
ignore Drive attack modifiers.

Spray heavy spends one authored ammo charge. The heavy template supplies normal
contact damage/stun; landed contacts add temporary grounded movement drag, while
block/parry prevent it. Effects never apply periodic damage or hitstun. Empty
spray Heavy becomes the light bash. `hitArcDegrees` authors an optional horizontal
attack sector; a held spray's effect angle and range override that template via
`arcDegrees` and `reachScales`. The sector uses bounded vertical thickness and
the defender's hurt radius, with the host's `attackVisibility` query preventing
contacts through walls. The regular contact path still owns block and parry.
Ground templates should author zero damage,
hitstun and impulse; their active frame deploys one bounded visible zone on real
support. Zones drag either grounded fighter on the same unobstructed floor;
jumping avoids them. Ammo, consumption, zone durations and spray restrictions
are retained by saves/checkpoints and expire by combat frames.

The session's `movementScales(state, grounded)` supplies the host locomotion
adapter. Presentation reads captured `zones` and `weapon-sprayed` transitions.
Optional `activeWeaponIds` and `reset(positions, activeWeaponIds)` select a match's
stock without changing item durability or emitting breakage. Inactive objects
are hidden and cannot be picked up. Throws retain ammo and wear; thrown
single-use/ground props are consumed on their first terrain or fighter contact.

Loose tools emit one drop impact when a fall first contacts terrain. A saved
terrain contact remains latched through resting support-query disagreement or
small missed-contact jitter. Unsupported travel beyond the sweep radius rearms
the next fall; holding or throwing also clears the previous resting contact.
Checkpoints and portable saves retain and validate this optional contact point.
Drop transitions carry their resolved impact position, so audio uses the actual
loose object's location rather than an authored or stale physics position.

Run `bun test packages/engine/src/project/3d/combat-interaction/weapons` from the
repository root. Coverage includes all twelve ground/air roles, exact gameplay
checkpoint rollback, held travel charging, fresh-press wheel follow-ups, valid
cancel windows with older templates, durability and reach normalization, one-use
recovery, finite spray ammo, defense, shared ground zones and effect validation.
