# Three Arena

Browser-playable top-down 3D undead survival arena built with Three.js. The run is solo-first and lobby-capable: singleplayer works from the page, while `server.ts` serves the page and starts an engine authoritative room server for shared lobby and player state.

## Loop

- Move through a large wrapped graveyard arena while weapons fire automatically.
- Survive escalating undead waves, minute-cadence bosses, collect soul shards, and pick up weapon crates.
- Avoid visible floor hazards such as gas, spikes, open graves, and falling crypt stone zones.
- Track nearby threats, pickups, and wrap-adjacent edge pressure on the minimap.
- Multiplayer rooms show other players as allied billboards; local combat remains playable even if the lobby server is absent.

## Controls

- PS5/DualSense controller:
  - Left stick: move
  - Right stick: aim reticle
  - Cross: select focused menu/lobby action
  - Circle or Options: return to menu during a run
  - D-pad or left stick: move menu focus
  - R1: refresh lobby rooms
- `WASD` or arrow keys: move
- Mouse: aim and reticle
- `Escape`: return to menu

## Run

From `examples/three-arena`:

```powershell
bun.cmd run build
bun.cmd run dev
```

Open `http://localhost:8793`.

Use this Bun server for normal play. It serves the browser bundle on `8793` and the authoritative WebSocket server on `8794`; LAN clients can open `http://<host-ip>:8793/client.html` and will connect to `ws://<host-ip>:8794` by default.

## Telemetry

Runtime telemetry is visible with `?telemetry=1`. It reports frame, update, camera, and render p50/p95, draw calls, triangles, shader programs, GPU resources, heap, entity counts, visible props, and runtime allocation counters.

The player is presented by the engine semantic-motion controller, not by the old clip/procedural bone-mutation path. Three Arena still owns movement, terrain collision, jumping, world wrapping, hitboxes, and gameplay timers; it sends their resolved position, velocity, facing, grounding, terrain normal, and aim target to the motion adapter. The persisted Kenney mapping lives beside the FBX as `assets/usable/characters/kenney/models/character-medium.t3rig`. Player clips remain available only as a fallback if semantic setup cannot initialize.

The renderer rig stays at scale `0.03` beneath an unscaled virtual MotionRoot. Do not call `Skeleton.pose()` during this asset's setup: its FBX inverse binds reconstruct the control root at 100x the imported scale. The regression suite locks the imported canonical transform and the live browser proof rejects the original briefcase fold, foot slip, terrain clipping, non-finite transforms, disabled semantic capabilities, or non-deterministic extreme aim.

Repeatable browser benchmarks run from `packages/engine`:

```powershell
bun.cmd run bench:example:three-arena:stress500
bun.cmd run ./examples/three-arena/bench.ts --probe-request --out .local/three-arena/engine-motion-probe.json
```

The stress lane holds 500 enemies, 500 pickups, and 1000 active particles, then fails on page errors, console errors, entity-count drift, p95 frame/update/render budget misses, shader program growth, and runtime mesh/material churn. Use `--repeat 3` for variance checks, `--stress-combat` for a live-fire probe where enemies can be damaged, and `--stress-all-props` for late-game prop-collision coverage.

Current local target is clean 60 FPS for the 500/500/1000 stress lane with a practical path to 165 FPS. The render-only lane is inside 165 FPS p95 locally; the combat-on lane remains inside 60 FPS and is the next place to remove projectile allocation churn.

2026-06-09 late-game prop A/B: the default prop collision grid reduced the all-props combat stress median p95 frame from 15.0ms to 3.7ms and update from 13.3ms to 1.9ms. Add `?propCollisionGrid=0` only for rollback or A/B checks.

## Files

- `client.html`: HUD, menu, and lobby UI.
- `src/`: TypeScript client, lobby, and arena data.
- `server.ts`: Bun static server plus engine authoritative room server.
- `build.ts`: browser/server bundle script.
- `assets/usable/assets-manifest.json`: curated runtime asset manifest.
- `readme-assets-notes.md`: source archive and license notes.

## Asset Sources

- Kenney Animated Characters Survivors
- Kenney Survival Kit
- Kenney Animated Characters Retro
- Kenney Graveyard Kit
- Craftpix Zombie TDS 2D Game Kit
- KayKit Fantasy Weapon Bits
- Universal Animation Library 1 and 2
- Ruin 3D Low Poly Model Pack
- Treasure 3D Low Poly Models

Runtime prefers curated local assets under `assets/usable/`. Tiny solid textures remain as last-resort fallbacks if an image is missing.

The client build bundles the locally pinned Three.js runtime and example loaders, so the playable demo has no external JavaScript module dependency.

## Implementation Notes

- `@hyperfocus/engine/render/3d` owns reusable Three.js setup, toroidal world helpers, addon loading, animation controllers, and simple configurable ragdolls.
- Player and enemies use Kenney FBX actors with idle, run, and jump clips where assets are available.
- Normal horde mobs use fixed-size instanced billboard batches after the near animated cap, keeping draw calls and shader programs stable under swarm counts.
- Pickups and particles use fixed-capacity instanced batches by default; add `?batchPickups=0` or `?batchParticles=0` only for A/B debugging.
- Prop collision uses a fixed grid broadphase by default so late-game materialized props do not require full prop scans for every actor.
- Graveyard props use curated Kenney GLB assets when available, then fall back to simple local geometry with matching light cues.
- Imported ruin, weapon, and treasure models are optional runtime upgrades over fallback geometry and sprites.
- Gunshot flashes use one reusable light, shared projectile geometry/materials, short-lived additive muzzle bursts, tracer trails, hit sparks, and blast rings to keep impact high without long-lived visual clutter.
- Runtime audio uses WebAudio synths for music, weapon, hit, pickup, level, boss, and damage cues, so the playable build has no external audio dependency.
- Multiplayer uses engine authoritative room primitives: `connectAuthoritative` clients join a `three-arena` room, send inputs/events, and receive replicated lobby/player snapshots.
