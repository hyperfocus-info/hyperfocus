# Dash presentation

`pose.ts` consumes saved dash origin, age and duration. Ground launches retain
sole height and skid into a low lean; air launches tuck both legs. Entry and exit
use fixed-tick easing, with no render-history cache or simulation mutation.
Absent optional timing fields retain compatibility with older cue callers.

`dash-feedback.ts` bridges a cancelled dash into startup using the saved source
direction and cancel countdown. It stops applying that overlay at the move's
first active frame so it cannot move the presented contact away from the hitbox.
Hit recoil and protection take priority.

`attack.ts` provides explicit authored silhouettes for forward, backward and
neutral dash followups. Limb tips remain within the real move's contact sphere
or upward capsule, including broad hooks and rising wheel kicks. The rising-knee
renderer uses the knee as its striking point. Weapon variants use explicit
`weaponAttack` metadata and put the actual tool tip on the same contact path;
weapon synthesis selects tool-compatible poses for kicking roles.
Wheel kicks use one narrow active sweep and a bounded torso lean; startup and
recovery ease into and out of it without replaying the roll.

Tests cover fixed-age reconstruction, planted versus tucked feet, startup-only
cancel blending, distinct pose families, actual contact bounds, single wheel-kick
sweeps, and tool grips.
