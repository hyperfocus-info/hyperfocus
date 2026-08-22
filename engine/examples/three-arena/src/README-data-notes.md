# Three Arena Data Notes

Data-only content for `./engine/examples/three-arena/src/arena-data.ts`.

## Intent

- Undead 3D arena survival loop with short readable pressure steps.
- Weapons are auto-fired and upgrade toward one clear evolved fantasy.
- Enemies are grouped by role so the director can mix horde, flanker, ranged, bruiser, elite, and boss pressure without making every wave noisy.
- Hazards carry explicit warning timing and readable cues because floor danger must be legible while the camera stays pulled back.
- Props are local descriptors for blocking, loot, and scene dressing; no shared engine assumptions live here.

## Export Surface

- `BALANCE_CONSTANTS`
- `WEAPON_DEFINITIONS`
- `ENEMY_ARCHETYPES`
- `WAVE_PACING`
- `PICKUP_DEFINITIONS`
- `HAZARD_DEFINITIONS`
- `MAP_PROP_DESCRIPTORS`
- `BIOME_PROP_SETS`
- `LEVEL_UP_POOLS`
- `ARENA_DATA`
