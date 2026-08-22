# Performance Abstraction Plan

`./engine` is the shared migration target for reusable browser-game infrastructure. `./examples/mmo-skill-demo` is the proof target for the experimental MMO path. Engine code should remove repeated setup and hot-path boilerplate without absorbing authored game content.

## 1. Current Engine Boundary

- Engine root owns browser launch primitives, canvas setup, raw input, timing loops, deterministic math, stage and pool helpers, map helpers, render staging, package contracts, and release proof.
- Focused subpaths own narrower families: MMO state helpers, server runtime, protocol codecs, render staging, optional UI shell, template assets, and prototype post-processing.
- Games own input meaning, state rules, quests, NPC identity, item IDs, economy tables, narrative copy, art selection, authored layout, balance values, and local UI copy.
- `mmo-skill-demo` may prove experimental shapes, but one demo is not enough evidence to widen root exports.

## 2. Performance Opportunity Map

- JS/TS wins: fewer per-frame allocations, stable arrays, pooled render records, normalized entity selection, cheaper sort/cull passes, less duplicated loop glue.
- Canvas wins: staged render data, viewport culling, layer grouping, y-sort keys, sprite batching, reduced state saves, and fewer direct draw calls in game modules.
- Audio wins: client-owned Web Audio setup with reusable numeric helpers for spatial math and generated samples when profiling shows cost.
- Timer wins: one clear RAF/fixed-step owner, explicit delta clamps, input snapshots, and deterministic kernels fed by JS scheduling.
- Server/MMO wins: interest filtering, cell grouping, dirty masks, snapshot budgets, deterministic tick kernels, and allocation-aware replication buffers.
- WASM/SIMD wins: batch numeric kernels with typed-array inputs and minimal JS/WASM crossings.

## 3. WASM/SIMD Policy

WASM should be considered for deterministic, CPU-heavy, batchable hot paths that operate on numeric buffers and minimize JS/WASM boundary crossings. It should not own browser API orchestration by default.

Good candidates include collision, movement integration, broadphase filtering, AOI and interest filtering, culling, transform preparation, y-sort key generation, visibility masks, pathfinding, projectile simulation, line-of-sight, status and cooldown ticking, server tick kernels, minimap/fog/lighting buffers, procedural textures, software-rasterized framebuffer effects, dense particles, DSP or sample generation, bulk spatial-audio math, and post-processing kernels over typed arrays.

Usually poor candidates include direct Canvas API submission, Web Audio graph orchestration, DOM/UI ownership, asset loading, networking socket ownership, async browser resource flow, authored game logic, quest text, NPC identity, item IDs, economy copy, balance tables, and one-off game scripts.

## 4. Canvas Rendering Policy

Typical top-down MMO rendering should keep Canvas draw submission JS/browser-owned. Prefer render staging, culling, batching, y-sort, camera transforms, and optimized Canvas calls such as `drawImage`, shapes, and text.

Game modules should map replicated/game-local state into staged data. Engine render helpers should execute shared draw mechanics, not pick content, art meaning, or combat rules.

## 5. Pixel-Buffer Rendering Policy

WASM or JS numeric kernels may generate color or mask buffers that JS submits with `ImageData` and `putImageData`. This is valid for full-frame software rendering, procedural buffers, fog of war, minimaps, lighting masks, heatmaps, dense particles, retro framebuffer renderers, and image filters.

Do not assume this beats normal Canvas sprite, tile, or HUD drawing. Promote a pixel-buffer path only after a benchmark proves it wins for the target effect and scale.

## 6. Audio/DSP Policy

JS should usually own Web Audio graph setup, playback policy, user gesture unlock, routing, pause, and volume controls. WASM can help with DSP, procedural sample generation, numeric mixing, and bulk spatial-audio calculations when those costs are measurable and batchable.

Keep cue identity, sound choices, and authored mix decisions game-local.

## 7. Timer/Simulation Policy

JS should own RAF, timers, browser scheduling, pause/resume, and input collection. It should pass delta values and input snapshots into deterministic simulation kernels.

WASM may own fixed-step numeric math when the kernel is deterministic and batchable, but browser scheduling remains JS-owned.

## 8. Server/MMO Tick Policy

Server runtime should keep room clocks, admission, transport, persistence hooks, auth hooks, metrics, and replication contracts in JS/TS. Numeric hot paths may move into typed-array helpers or WASM after benchmark proof.

Likely promotion areas are AOI filtering, visibility masks, snapshot/delta budget helpers, dirty-cell grouping, deterministic movement/collision kernels, projectile simulation, cooldown/status ticks, and load-testable allocation reducers.

## 9. What Stays Game-Local

Game-local content includes quests, NPC names and roles, item IDs, economy labels, loot tables, faction text, world layout, authored balance, animation meaning, sound choices, UI copy, narrative, and one-off scripts.

Engine helpers may accept content data as inputs, but must not ship the demo content or hide rules behind generic names.

## 10. Engine Root vs Focused Subpaths

- `@hyperfocus/engine`: stable browser launchpad primitives with multiple-game proof.
- `@hyperfocus/engine/core`: DOM-free deterministic helpers and data structures.
- `@hyperfocus/engine/server`: authoritative room, tick, replication, placement, transport, and server-side helper infrastructure.
- `@hyperfocus/engine/protocol`: schema, snapshot, delta, and binary message contracts.
- `@hyperfocus/engine/mmo`: experimental MMO entity, movement, AOI, input-frame, interpolation, and gameplay-state helpers.
- `@hyperfocus/engine/render`: top-down staged render data, culling, sort, batching, camera, text, HUD, and effect queue helpers.
- `@hyperfocus/engine/ui`: optional content-free shell, panel, focus, hotbar, and controller prompt behavior.
- `@hyperfocus/engine/post-processing/prototype`: optional effect experiments until stable proof exists.

## 11. `mmo-skill-demo` Scan Checklist

- Repeated RAF, fixed-step, timer, and input-send loops.
- Direct Canvas drawing in game modules or dynamic draw callbacks.
- Render modules that should return staged render data.
- Culling, y-sort, transform prep, collision, movement, target filtering, and AOI loops.
- Per-frame allocations and repeatedly rebuilt maps, sets, arrays, or render records.
- Entity maps that can use normalized engine MMO helpers.
- Snapshot, delta, segmented replication, dirty-cell, and byte-budget hot paths.
- UI shell, panel, hotbar, focus, and controller prompt boilerplate.
- Minimap, fog, lighting, heatmap, and mask opportunities.
- Audio unlock, cue routing, DSP, sample, or spatial-math opportunities.
- Server tick kernels that are deterministic numeric loops.
- Authored content that must remain local.

## 12. Implementation Priorities

1. Fix documentation around WASM, render, pixel-buffer, audio, timer, and MMO-server boundaries.
2. Clarify existing hot-path helpers and API intent before adding new surface.
3. Promote small render-prep or render-pool helpers only when they are content-free and tested.
4. Promote small AOI, collision, culling, or input-frame helpers only when current code repeats the shape.
5. Add or refine benchmarks around likely hot paths before default-enabling performance strategies.
6. Add drift tests or scanner checks when local game boilerplate starts reappearing.

## 13. Benchmarks And Tests Needed Before Promotion

- Control benchmark first, same command and input data before/after each candidate.
- Render-call benchmark for culling, sort keys, pooled render records, and pixel-buffer effects.
- MMO load or dungeon benchmark for AOI, visibility, replication, byte budget, and server tick changes.
- Protocol benchmark for snapshot, delta, multipart envelope, and frame-decode payload-copy regressions.
- Kernel parity tests for JS vs WASM paths.
- Typecheck and package smoke for exported API changes.
- Demo build and targeted demo tests for any adopted helper.
- Direct browser playability check for example entry points touched by render or client boot changes.
