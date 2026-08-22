# Low-Level Performance Market Research

Research date: 2026-06-10

## Summary

High-performance game systems mostly win by refusing work before optimizing work. The durable pattern is:

- fixed budgets and data shapes
- baked visibility, lighting, proxies, and lower-detail assets
- dense numeric data for hot loops
- culling before allocation or draw submission
- instancing or batching for repeated visuals
- LOD and HLOD for distance
- full-loop benchmarks before defaulting a strategy

This matches current engine direction in ./docs/engine-performance-optimizations.md. The original LOD API gap is now closed: `@hyperfocus/engine/render/3d` has configurable distance-band policy, a lazy bake cache, meshoptimizer-backed geometry simplification, and instance-batch splitting. The next gap is higher-level far-field reduction through HLOD/proxy clusters or impostors, plus hysteresis and screen-space selection policy.

## External Signals

Three.js has a basic distance LOD object with hysteresis. It expects callers to provide the meshes for each level.

Unity LODGroup centers authoring around LOD transition percentages, screen size, renderer groups, and fade width. Distance is shown as a consequence, not the only metric.

Godot combines automatic mesh LOD generation with manual visibility ranges. Its docs call LOD a key 3D optimization, use meshoptimizer for generated LOD, expose a viewport LOD threshold, and note that screen-space selection accounts for camera FOV and resolution.

Unreal HLOD reduces long-distance world cost by replacing many static actors with a proxy mesh and material, cutting draw calls and actor count.

Three.js InstancedMesh and Godot MultiMesh both point at the same repeated-object win: one submitted object for many transforms. Godot also documents the tradeoff: widely spread instances can hurt because they cull as one object.

Retro engines got speed from specialization and baking. NES-style PPU rendering used fixed tile/sprite scanline work; Doom and Quake used spatial preprocessing, front-to-back/BSP thinking, light baking, and PVS data so runtime rendering considered less world.

## Implemented In Repo

- 3D LOD policy helper for simple ranges like 0-15m full, 15-30m half, 30m+ quarter.
- Lazy keyed LOD bake cache.
- Meshoptimizer-backed Three `BufferGeometry` simplification helper.
- First-class split of one logical instance population into per-LOD instance batches.
- 3D triangle-budget benchmark assertion in the Three Arena stress lane.
- Three Arena opt-in generated static prop LOD proof with same-build benchmark result.

## Remaining Gaps

- No HLOD/proxy-cluster helper for static distant props.
- No documented rule for distance-based versus screen-space LOD in this engine.
- No LOD hysteresis guardrail in engine 3D helpers.

## Recommended Bet

Extend the existing opt-in `@hyperfocus/engine/render/3d` LOD helpers only where a representative scene proves a useful reduction. The next experiment should target far-field proxy/HLOD clusters or billboard impostors rather than another per-object simplification layer.

Keep the existing API policy-first and content-free while evaluating those extensions:

- input: retain camera position, object bounds or transforms, and LOD ranges; add hysteresis or an optional screen-space metric only with deterministic tests
- bake: retain preauthored levels, lazy generated levels, and prebuilt cache entries; evaluate proxy clusters or impostors as separate opt-in resources
- output: retain grouped instance batches and add proxy selection only if it reduces full-scene work
- proof: Three Arena stress bench with p95 frame/render/update, triangles, draw calls, shader programs, mesh/material churn, and screenshot parity

Default range example:

```ts
[
  { maxDistance: 15, ratio: 1 },
  { maxDistance: 30, ratio: 0.5 },
  { maxDistance: Infinity, ratio: 0.25 }
]
```

Do not start with Nanite-like virtualized geometry. Browser catalog games need predictable simple helpers: reusable LOD selection, optional meshoptimizer-backed bake, and split instance batches.

## Non-Goals

- Do not hide authored art decisions inside the engine.
- Do not auto-simplify skinned meshes by default.
- Do not default-enable generated LOD without a same-scene visual and perf proof.
- Do not optimize triangle count while increasing draw calls, shader programs, or material churn.
- Do not use only distance when screen-space error matters for tall, flat, or FOV-sensitive assets.

## Sources

- Three.js LOD: https://threejs.org/docs/pages/LOD.html
- Three.js InstancedMesh: https://threejs.org/docs/pages/InstancedMesh.html
- Three.js BufferGeometry: https://threejs.org/docs/pages/BufferGeometry.html
- meshoptimizer JS simplifier: https://github.com/zeux/meshoptimizer/blob/master/js/README.md
- Unity LODGroup: https://docs.unity3d.com/Manual/class-LODGroup.html
- Godot mesh LOD: https://docs.godotengine.org/en/stable/tutorials/3d/mesh_lod.html
- Godot visibility ranges/HLOD: https://docs.godotengine.org/en/stable/tutorials/3d/visibility_ranges.html
- Godot MultiMesh: https://docs.godotengine.org/en/stable/classes/class_multimesh.html
- Unreal HLOD: https://dev.epicgames.com/documentation/unreal-engine/hierarchical-level-of-detail-in-unreal-engine
- id Quake tools PVS/light bake notes: https://github.com/id-Software/Quake-Tools/blob/master/qutils/README.TXT
- id DOOM release notes: https://github.com/id-Software/DOOM
- NES PPU rendering: https://www.nesdev.org/wiki/PPU_rendering
