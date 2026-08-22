# Portable runtime audio

Audio authored in the editor remains part of the canonical two-file project:

- component configuration is ordinary JSON in `.hyperfocus/project.json`;
- original encoded audio bytes are stored once, by SHA-256, in `.hyperfocus/assets.hfp`;
- standalone HTML is disposable build output and does not become a third project file;
- the build does not generate a wrapper source file per sound or component.

The portable 2D runtime validates enabled `audio` components and emits deterministic host commands. It never invokes browser globals from the headless simulation. The editor's standalone player consumes those commands with the first-party Web Audio engine, which provides bounded decoded caching and voice capacity.

## Supported component values

An enabled audio component uses these flat, portable values:

- `assetId` or `asset`: required asset catalog ID. When an asset catalog is supplied, the target must exist and be audio MIME data.
- `trigger`: `start` or `action:<action-name>`. Action audio fires on the rising edge, not once per fixed tick while held.
- `autoplay`: `true` is a compatibility alias for `trigger: "start"`.
- `bus`: `music`, `sfx`, `voice`, or `ambient`; defaults to `sfx`.
- `gain` or `volume`: finite value from 0 through 4; defaults to 1.
- `pan`: finite value from -1 through 1; defaults to 0.
- `loop`: boolean; defaults to `false`.
- `priority`: finite number used by deterministic voice stealing; defaults to 0.

Scene loading queues start commands in authored entity/component order. Switching scenes first emits `stop-scene` for the old scene and then the new scene's start commands. This stops looping voices and cancels queued sounds from a scene left before browser audio was unlocked.

Browsers require audio to be unlocked from a user gesture. The standalone build queues valid commands until the first keyboard or pointer gesture, resumes Web Audio immediately, decodes referenced packed bytes, and flushes the queue. Missing packed bytes or decode/play failures are reported as runtime diagnostics rather than replaced with network requests. Its content security policy keeps network access disabled.

The simulation and standalone bridge each bound pending audio work at 4,096 commands. Hosts using `@hyperfocus/engine/project/runtime-2d` should call `drainAudioCommands()` regularly and send the returned commands to their audio layer. A host that lets the simulation queue exceed its configured limit receives an explicit error rather than unbounded growth or silent loss.
