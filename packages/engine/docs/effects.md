# Timelines and particles

`@hyperfocus/engine/effects` is a dependency-free effects foundation. It persists no sidecars and operates on plain definitions plus caller-owned numeric buffers.

The [3D particle contract](particles-3d.md) owns seeded spatial simulation,
lifetime curves, swept collision, atlas/tint rendering, snapshots and its limits.

Compiled timelines validate bounded tracks, strictly ordered keyframes, events, easing, duration, and loop policy. Sampling uses binary search and writes one value per stable track ID. `TimelinePlayer` supports finite, repeat, and ping-pong playback, bounded event emission, seeking, and versioned snapshots. Effects such as UI transitions, cut-scene parameters, material values, and animation blend weights can share the same clock without executable serialized data.

`ParticleEmitter2D` preallocates fixed-capacity struct-of-arrays storage, uses a seeded deterministic generator, reports dropped spawns and expiry, and writes `x`, `y`, normalized age, and size records in stable slot order. Rendering, colors, sprites, blend mode, and game-specific spawn rules remain caller-owned.

`PARTICLE_PRESETS_2D` adds a renderer-neutral vocabulary for sparks, confetti, snow, rain, embers, dust, bubbles, fireflies, hearts, music notes, smoke, and speed lines. `TRANSITION_PRESETS_2D` names dissolve, black/white fades, flash, exact one-frame white/black/accent impact cards, four directional wipes, iris, and film burn. These definitions carry labels, intent, default color/count, placement, and duration; the editor owns Canvas rendering and stores the preset ID on an ordinary timeline effect so scrub, video export, and standalone playback sample identical data. Use `isParticlePresetId2D` and `isTransitionPresetId2D` at untrusted data boundaries.

Portable timeline particle cues persist optional `layer` (`foreground` by default or `background`), `space` (`screen` or `target`), and `region: { fromX, fromY, toX, toY }`. Region coordinates are normalized to the viewport, range from zero to one, and require each start to precede its end; omitted regions cover the full viewport. Ambient and shower presets default to screen coverage even on older cues carrying a target ID. Bursts default to target space when a target exists; explicit target space requires one. Weather and showers sustain their envelope for the cue duration. Deterministic particle noise mixes adjacent indices so sequential particles spread across the viewport instead of clustering. Regression coverage lives in `src/project/runtime-timeline-2d.test.ts`.

The editor's `timeline.apply-effect-preset` command persists these same placement fields. Omitted durations use the preset duration capped to the remaining timeline frames; explicit durations that exceed the timeline are rejected, and cues must start before its end.

`VISUAL_RECIPES_2D` groups those primitives into four first visual-quality families: Anime energy duel, Painted cel adventure, Graphic ink strike, and Luminous storybook transform. A recipe is renderer-neutral data and expands into ordinary cues; it is never an opaque renderer mode. The editor exposes the same expansion through the Motion workspace and the `timeline.apply-visual-recipe` command. Its Energy clash choreography adds editable two-character anticipation, contact, recoil, recovery, speed lines, sparks, camera response, and a true one-frame impact card.

`IMPACT_FRAME_PRESETS_3D` is the equivalent exact-frame vocabulary for 3D scenes. It includes white/black editorial blanks, thresholded silhouettes, ink eruptions, red contact bursts, radial brush lines, edge-lit anatomy, energy overexposure, chromatic shock, and a custom cooked still. These are presentation overrides, not particle substitutes: the canonical scene is sampled first, its contact pose can be frozen for the authored hold, and the shared compositor replaces only the declared one-to-eight frames. Preset colors, threshold, edge strength, ray density, contact point, intensity, seed, duration, and freeze policy remain ordinary editable cue fields.

3D effect cues choose `presentation: "billboard" | "model"`. Billboards use an engine-owned textured quad, require only a canonical material, and face the sampled camera in scrub, Play, build, and export. This is the ordinary particle path and avoids accidental edge-on cards or unrelated model proportions. Model particles retain authored rotation and require a static canonical `meshId`. Cues without `presentation` keep the legacy model behavior.

## Rendering parity contract

The portable project timeline exposes `sampleTimelineCamera2D` from
`@hyperfocus/engine/project/runtime-timeline-2d`. Numeric x/y/scale tracks targeting
`@scene-camera` produce the authored scene center and zoom without changing actor
transforms; a renderer applies that view to the scene. Clip overrides carry the
selected cue's `startFrame`, and `evaluateTimelineClipCue2D` exposes the same cue for
arbitrary-frame sampling. Renderers subtract this origin before sampling Atlas
clips, so a non-looping performance cued late starts at its first pose.

The shared 2D recipe subset promises pixel-identical output for a fixed project frame, canvas size, and asset set because editor scrub, encoded video frames, Play, and standalone Build execute the same sampler and Canvas effect renderer. Reduced-motion settings intentionally suppress camera displacement, so compare like-for-like project settings.

The standalone 2D runtime publishes its deliberately smaller post stack as
`PLAYABLE_POST_EFFECT_IDS_2D` from `@hyperfocus/engine/project/runtime-2d`.
Editor authoring and both browser and CLI release preflight consume that list;
enabling any other post effect blocks the build rather than producing an artifact
that silently omits the authored treatment. Timeline particle, transition, and
visual-recipe cues use their separate shared renderer contract above.

The 3D path now shares one `sample3DFrame` evaluator, command buffer, material
implementation, and first-party WebGL2 renderer across gameplay, canonical
preview, standalone build, and video export. Video-only fog, bloom, exposure,
grain, vignette, transitions, and impact-frame presentation are explicit render-graph requests rather than a
second scene or hidden Three.js interpretation. Exact image fixtures use one
pinned Chromium/device configuration; cross-device validation uses structural
command parity plus tolerant image comparison because GPU rasterization can vary.
Three.js remains only a labeled responsive authoring proxy.

These primitives are a common-systems foundation, not a universal compositing system. Custom shaders, masks, GPU particle upload, particle collision modules, and project-specific shapes remain renderer- or project-owned extension points.
