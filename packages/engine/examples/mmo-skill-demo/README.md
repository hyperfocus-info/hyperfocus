# MMO Skill Demo

Authoritative 100-player public zone proof for the engine MMO path.

## Intent

This example should prove engine boundaries, not become a second engine. Keep game content here, but promote content-free selectors, input mapping, collision batches, render staging, render-frame pooling, UI shell behavior, and other repeatable primitives into focused engine subpaths after they have a tested shape. Economy, ability rules, NPC identity, quest content, and tuning stay local.

The browser client should be a mapper for shared render paths: read replicated state, collect local input, choose local assets, and submit staged render/UI data. The engine owns reusable Canvas context access, camera transforms, layer batching, y-sort, culling helpers, render-frame pooling, text wrapping/truncation, primitive drawing, and draw-call execution.

The renderer defaults to fresh render records because the pinned end-to-end A/B/B/A run improved p95 and p50 while lowering heap growth. `RendererOptions.renderRecordStrategy` and the render benchmark's `--render-records=clear|fresh|overwrite` flag keep safe clearing and caller-verified overwrite available for calibration.

The live play surface comes first. DOM UI must stay collapsible and peripheral; only one optional panel should be open at a time, and the persistent objective/control cues should remain in the canvas HUD without blocking play. Inventory, equipment, stats, debug, travel, and quest detail are secondary overlays.

DOM metadata uses a 0.75rem caption floor. Authored toolbar SVG paths render through
the browser-only `renderToolbarIcon` adapter; icon strings remain plain text in
the portable controller contract. See the [example control evidence](../../../../docs/design-system/example-controls.md)
for real Bag/menu, narrow and scaled checks. The canvas backing size follows its
displayed size so HUD captions remain readable; compact screens preserve the
objective and defer duplicate quest/minimap detail to their full views.

Controller support is a first-class play path, not a convenience layer over keyboard and mouse. A PlayStation-style controller should be able to move, aim, fight, inspect the HUD, open and close panels, move focus, confirm choices, cancel/back out, and recover to active play without touching the mouse. HUD and panel prompts should reflect the current input mode, keep focus visible, and avoid analog-only interaction when a digital button or D-pad path can provide the same function. Stick deadzone is a player setting and starts at 5%.

Large files are a smell. `src/shared.ts` and `src/client/render.ts` should keep shrinking by moving real responsibilities into named modules or engine helpers. `src/client/render.ts` should stay a thin orchestrator; visual mapping belongs under `src/client/render/`. Do not create barrel-only moves that make imports deeper while leaving the same giant implementation behind.

WASM/SIMD belongs to deterministic, CPU-heavy, batchable numeric kernels that minimize JS/WASM boundary crossings. Good candidates include collision, culling, transforms, sort keys, AOI masks, projectile simulation, status ticks, server tick math, DSP, spatial-audio math, and pixel-buffer effects after benchmark proof. Keep quest rules, NPC identity, item economy, art lookup, authored balance, and narrative copy local to this demo.

Shared render modules return `Renderable` data only. Direct JS Canvas is acceptable for quarantined local overlays, debug views, and authored map painting; dynamic gameplay `custom` draw calls in the shared render pipeline are regressions. Terrain, loot, resources, NPCs, players, hazards, effects, reticle, and HUD should stay separate enough that one visual policy can change without reopening the whole client.

Ability and projectile VFX should be server-authored only at semantic anchors: spawn point, impact point, path endpoints, theme id, lifetime, and priority. Decorative particles, projectile echoes, trails, ribbons, and fades should advance from the browser render clock so they interpolate on `requestAnimationFrame`; do not make cosmetic particles step on the authoritative server tick or stamp full future trails ahead of the moving body.

Browser JS owns RAF, timers, Canvas submission, Web Audio unlock, graph setup, routing, pause, and volume controls. WASM may generate typed numeric buffers for software effects, masks, DSP, samples, or simulation kernels, but JS still submits pixels through `ImageData` / `putImageData` and owns browser scheduling.

Numeric tuning should land in authored base values. For non-buff requests like larger, smaller, faster, slower, or percent changes, update the stored number or data table directly instead of adding runtime scaling helpers. Buffs, temporary statuses, and live modifiers can still multiply at runtime because their value changes during play.

Run:

```bash
bun run example:mmo-skill-demo
```

Then open the printed local client URL.

## Design Snapshot

This demo is a compact MMO slice, not a full MMO platform. It combines server-owned movement, collision, interest-filtered replication, in-process cross-room character persistence, resource extraction, progression, and combat in one shared tile-authored map.

- Scale preset: public play uses 10 managed public shards at 100 players each. The demo fills the first public shard before spilling to the next so players who open the default shared-world URL land together until that shard is full. Dungeon and Cottage stay explicit party/private rooms.
- Zones and instances: Ashwood Glade is the starter forest, Iron Crags is the mining route, The Sunken Bazaar is the elite danger area, and Port Marrow is the hub. Dungeon and Cottage room types are registered as party/private instances with their own replicated state.
- Ability acquisition: players begin with the basic attack. Utility, mobility, crowd-control, and ultimate slots are earned through trainers, gathering milestones, combat thresholds, repeatable contracts, elite encounters, or boss-template rewards.
- Live events: each room owns one rotating public or private objective with zone-local contribution, timed regrouping, and shared rewards for players in the active area.
- Item categories: tools gate stronger gathering, consumables cover healing and movement bursts, gear changes build feel, and resource counters feed quests and rewards.
- Bestiary and NPCs: hub NPCs cover elder, banker, merchant, foreman, trainer, travel, and contract roles. Hostiles cover wolves, animated trees, bats, crawlers, armored chargers, trap bombers, healers, gargoyles, wraiths, archers, sentinels, guards, dungeon support adds, and elite variants.
- Physical scale: the player is treated as six feet tall and renders at 35.2 px after the 20% reduction. Hostile, support, resource, hazard, and landmark sizes should be authored per kind from real-world analogs, ecology, combat role, speed, and attack pattern instead of a single standard size.
- Quests: lightweight quest flags model first gathering, local combat, hidden exploration, survival, repeatable writs, and boss arcs without claiming narrative tooling.
- Feedback: the browser client layers replicated hit, gather, loot, quest, level, hazard, and death events with canvas effects and Web Audio cues after the first player gesture.
- Claim boundary: this proves authoritative room and instance slices with zone-tagged entities and same-login persistence while the server process stays alive. It does not claim global world scale, cross-process shard handoff, production accounts, durable inventory, chat, economy, parties, matchmaking, or live operations.

Related docs: [MMO readiness](../../docs/mmo-readiness.md), the local [world building](./docs/world-building.md) and [world travel](./docs/world-travel.md) notes, and the smaller [MMO Field](../mmo-field/README.md) proof.
