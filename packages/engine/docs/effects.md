# Timelines and particles

`@hyperfocus/engine/effects` is a dependency-free effects foundation. It persists no sidecars and operates on plain definitions plus caller-owned numeric buffers.

Compiled timelines validate bounded tracks, strictly ordered keyframes, events, easing, duration, and loop policy. Sampling uses binary search and writes one value per stable track ID. `TimelinePlayer` supports finite, repeat, and ping-pong playback, bounded event emission, seeking, and versioned snapshots. Effects such as UI transitions, cut-scene parameters, material values, and animation blend weights can share the same clock without executable serialized data.

`ParticleEmitter2D` preallocates fixed-capacity struct-of-arrays storage, uses a seeded deterministic generator, reports dropped spawns and expiry, and writes `x`, `y`, normalized age, and size records in stable slot order. Rendering, colors, sprites, blend mode, and game-specific spawn rules remain caller-owned.

These primitives are a common-systems foundation, not the complete authoring milestone. Editor curves, event/timeline authoring, GPU particle upload, collision modules, representative content integration, and profiling UI remain required for an 8/10 production claim.
