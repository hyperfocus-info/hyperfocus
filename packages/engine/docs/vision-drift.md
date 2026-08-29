# Engine Vision Drift

`packages/engine` should stay a small reusable launchpad for direct browser games. Game folders own game rules, content, HUD decisions, audio, art, balance, and one-off spectacle. Engine code owns repeatable platform primitives, deterministic helpers, package boundaries, and release proof.

## Drift Watchlist

- Input helpers must be opt-in. Importing the package should not globally capture page keys, touches, or browser defaults before a game asks for that behavior.
- Rendering should keep moving toward structured draw data. Callback draw hooks are escape hatches for prototypes, not the preferred path for gameplay rendering.
- Direct JS Canvas is allowed for quarantined game-local overlays, debug views, and authored map painting. It becomes drift when shared render modules bypass staged data without a documented local reason.
- WASM should stay focused on deterministic, CPU-heavy, batchable numeric buffers. JS owns Canvas submission, Web Audio graph orchestration, RAF/timers, DOM/UI, assets, sockets, and async browser resource flow.
- Pixel-buffer work is valid when the effect or renderer is buffer-oriented. Do not treat `ImageData` or `putImageData` as a default replacement for normal sprite, tile, HUD, or text drawing without benchmark proof.
- Audio and timer abstractions should keep browser policy in JS. Only numeric DSP, sample generation, spatial math, or fixed-step kernels should be considered for WASM.
- MMO helpers should stay normalized and content-free. Quest text, NPC identity, combat tuning, economy rules, and world fiction belong in a game or example folder.
- Region and map helpers should describe reusable placement patterns, not become a catalog of game-specific locations, NPCs, quests, or balance.
- Template bitmap assets remain internal scaffolding. Embedded package templates must stay package-owned or carry explicit publication rights; the current manifest contains only mechanically generated one-pixel swatches.
- Protocol schemas should fail loudly on invalid data. Silent coercion makes network state look deterministic while corrupting gameplay.
- Saved projects must remain on the two-file `.hyperfocus/project.json` plus `.hyperfocus/assets.hfp` contract. Browser databases, recovery journals, build output, thumbnails, and profiles are caches or derived evidence, not extra canonical project files.
- Persistent project data must use published, independently implementable contracts. Absolute paths, hosted-account identifiers, undocumented binary records, and generated source wrappers create lock-in and do not belong in the canonical format.
- An external game runtime may be a disclosed bridge during migration, but it is not the completed engine boundary. Stable production paths should move toward engine-owned high-performance rendering, physics, audio, navigation, animation, persistence, networking, and tooling primitives with behavioral and performance proof.

## Guardrail

When a helper starts carrying game meaning instead of removing repeated setup, keep it local to the game. Promote it only after multiple direct browser entries prove the same small shape without hiding game-specific rules. When project state cannot be understood or recovered without Hyperfocus, add the public schema or generic export before calling the feature stable. When a third-party bridge is still required, name it plainly and keep replacement evidence on the readiness roadmap.

Related docs: [../readme.md](../readme.md), [project portability](./project-portability.md), [readiness roadmap](./readiness-roadmap.md), [MMO readiness](./mmo-readiness.md).
