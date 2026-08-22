# Player Visual Overhaul

Purpose: replace current one-direction player read and noisy ability effects with a scalable character animation path that preserves active-play readability.

Related context: ./README.md, ./docs/ui.md, and ./docs/world-player-progression.md.

## Evidence

Screenshot pass: ./.local/screenshots/player-visual-overhaul-1780763608216.

Observed issues:

- The player stays visually front-facing during idle and side movement, so movement intent does not match the body read.
- Charge and cast feedback leans on body shake, rings, and aura layers instead of a clear anticipation, strike, and recovery animation.
- Rush uses overlapping rings, ribbons, afterimages, and dust. The result reads like generic ground scratches, and the Space movement effect is visually louder than the movement itself.
- Ability effects come from several visual systems at once, making cleanup and visual hierarchy harder to reason about.

## Market Scan

2D spritesheet animation is the lowest-risk runtime path. Phaser's animation model is frame-based spritesheets or atlases, which fits the current Canvas2D direction but multiplies asset work across directions, weapons, actions, and gathering states.

2D skeletal animation is a middle path. Spine with PixiJS supports WebGL/WebGPU and lets one rig reuse skins and animation clips, but it adds editor/runtime version coupling and a specialized content pipeline.

Runtime 3D is the best match for "one model plus incremental animation clips." Three.js loads glTF/GLB assets and uses animation clips and mixers; its game examples clone skinned models and give each clone its own mixer. Babylon.js provides a richer engine surface with glTF animation groups, masks, and more built-in scene tooling.

Godot web export is a full-engine option, not a good incremental fit here. Current Godot 4 web export is WebGL2-only, has web-specific constraints, and would compete with the existing authoritative client, canvas HUD, and engine render boundaries.

Sources:

- https://docs.phaser.io/phaser/concepts/animations
- https://us.esotericsoftware.com/spine-pixi
- https://threejs.org/docs/pages/GLTFLoader.html
- https://threejs.org/manual/en/animation-system.html
- https://threejs.org/manual/en/game.html
- https://doc.babylonjs.com/features/featuresDeepDive/animation/groupAnimations
- https://docs.godotengine.org/en/4.4/tutorials/export/exporting_for_web.html

## Recommendation

Use a staged path: clean the current Canvas2D player/VFX first, then prototype a Three.js player island behind a feature flag. Do not migrate the whole game to a 3D engine until the player island proves readability, performance, and integration.

Three.js is the preferred prototype target because it can sit beside the existing TypeScript client with a smaller integration surface. Babylon.js stays a fallback if the prototype needs more built-in animation, camera, or scene tooling.

Keep a second fallback open: use a 3D model as the authoring source, then bake directional sprite atlases for runtime Canvas2D. That preserves the "one model, add animations later" workflow without forcing a full runtime 3D migration.

## Plan

Phase 0: VFX cleanup.

- Give every ability effect an owner, ability, start, end, and maximum lifetime.
- Remove lingering particles when the matching active ability ends, slot changes, player dies, or the owner leaves view.
- Shorten movement dust and replace sandy puffs with direction-aligned streaks or footfall cues.
- Split semantic telegraphs from decorative particles so gameplay reads remain visible when decoration is reduced.

Phase 1: 2D animation stopgap.

- Add player facing from movement, aim, or ability vector.
- Replace cast shake with readable animation states: idle, run, charge, release, rush, gather, hit, and stun.
- Use temporary directional silhouettes or a small four-direction sheet while the 3D prototype is being built.
- Keep HUD, names, health bars, and interaction prompts in the current canvas layer.

Phase 2: Three.js player island.

- Render only the local player first in an orthographic 3D overlay aligned to the existing world camera.
- Load one GLB with idle, run, rush, pummel, gather, hit, and death clips.
- Drive animation from semantic player state, not from server animation frames.
- Keep effects, HUD, map, and world art on Canvas2D until the character layer proves stable.

Phase 3: Decision gate.

- Choose runtime 3D if the model is readable at current player scale, animation blending feels better than the 2D stopgap, and perf stays stable with local player plus nearby clones.
- Choose baked directional sprites if 3D authoring works but runtime 3D reduces readability, adds too much integration complexity, or makes y-sort and overlay composition fragile.
- Stay on 2D spritesheets only if the asset count is acceptable and the next few weapons do not require many bespoke attack poses.

## Success Criteria

- Running right, left, up, and down visibly changes body facing.
- LMB charge shows anticipation without body jitter.
- Space movement effect supports direction and speed without cluttering the road after release.
- Effect cleanup is deterministic after ability end, death, room travel, and disconnect.
- No HUD, prompt, or name readability regression at desktop or mobile sizes.
- The prototype can be removed cleanly if it fails the decision gate.
