# Underground service passage

`authorCityUnderground({ declaration, combat })` can be applied to an existing
expanded city without resetting fighter tuning, spawn layouts, traffic or other
environmental damage rules. Parent commands own persistence. It is deterministic
and refreshes only `tod:city:underground:*` objects plus the existing street floor.

The passage runs at x = -22 between z = -20 and 8, with a floor six metres below
street level. Two real openings occupy x = -25 through -19: the north opening runs
from z = -20 to -10 and the south opening from z = -3 to 8. Orange nosings and
illuminated entry posts mark the entrances. Each entry uses twelve half-metre risers with 0.75-metre treads
within the original opening. Ordinary movement climbs them using the same 1.05-metre
auto-step limit as the street stairs; an exposed bottom landing remains. The covered central passage connects them.
Both sides of its cracked service divider remain open, and an ordinary attack can
remove the divider to join those aisles. Blue conduit and inset lights establish
utility infrastructure without inventing a story reveal or a new objective.

The original `tod:city:street` retains its horizontal extent and identity as the
physical foundation at y = -6.3. Five street-level slabs replace its old upper
surface while leaving the entrances open. This preserves map/shadow framing and
avoids a special kill plane. The helper adds fewer than 85 objects and 32 colliders.
It does not move existing props: when applying it to a customized city, inspect
the two opening rectangles for floating objects. Full city authoring places props
after the passage, using the existing collision exclusion rules.

Verification includes both fighters moving down, through and out via ordinary
inputs; AI9 descending toward an underground target and pursuing back outside;
negative-height camera framing and ceiling fade; actual divider damage; JSON
save/restore; and round recovery without raising fighters back to street level or
repairing the divider. Fixtures place actors and accelerate the recovery countdown;
they never grant movement or damage privileges. The AI fix selects an exposed
intermediate drop landing when its target is beneath a ceiling, rather than
repeatedly jumping onto the roof above the target. Camera visibility also handles
an eye already inside an explicitly fading ceiling; supporting floors stay opaque.

The October 1 native KO review exposed a low mouth curb crossing both heads as
the camera followed the fighters down the stair. Mouth curbs and stair nosings
now explicitly join the cutaway set: their height above world zero cannot decide
whether they obstruct fighters below street level. A descending orbit regression
checks the actual authored curb fades without changing combat state.

This is one connected service passage. It is not a complete underground district,
cloning laboratory, elevator system, navigation mesh or guarantee that every AI
level can solve every possible arrangement of moving and destroyed geometry.

`../combat-ai/stair-pursuit.test.ts` walks both seats through the complete authored passage without jump input, checks actual street stair traversal and exact checkpoints, and verifies AI9 pursuit to the roof and back out of the passage. The fixture keeps opponents out of each other's stair lane when testing single-fighter movement.
