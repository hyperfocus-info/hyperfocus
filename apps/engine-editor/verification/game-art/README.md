# Shared game-art capture host

`captureStudySet` is the editor's reusable evidence collector. Pale Reach's
[adapter](../pale-reach/capture-catalogue.ts) supplies game data in about a dozen
lines; its selected phases and replay policy stay in the consumer catalogue.
The same host does not choose an anatomy, palette, renderer or genre.

The consumer page exposes a named API with `load(input)`, `step(ticks)`, `play()`,
`pause()`, `effects(boolean)`, `setView(name)` and `snapshot()`. The adapter names
the snapshot paths for simulation tick and phase, the actual camera views,
viewport/frame rate, input per study, duration and explicit meaningful phase ticks.
It supplies the URL returned by the managed dev-server workflow. Unknown game
actions/views should fail in the consumer; do not create a generic pose fallback.

The host owns one hidden browser, serial recordings, effects-off/on configuration,
source-tick/wall-clock receipts, bounded video decode, screenshots, phase strips,
runtime errors and cleanup. Recordings must advance their source clock. It writes
`catalogue.json` and `phases-v2/index.json`; the latter name preserves the existing
Pale Reach evidence consumer. Media and partial captures are never overwritten.

`recording.ts` also serves Pale Reach's effects-on feedback clips. Detached-video
playback callbacks previously stalled in headless capture; bounded seeks now prove
decoded frames. This is a wall-clock study recorder, not native 60 fps arena
acceptance. Use the separate [arena workflow](../arena-capture/README.md) where that
source-cadence and audiovisual contract is required.

Playable pipeline studies supply `sequence:{simulationHz,encoder}`. This selects
`recordSequenceClip`, using the existing Editor WebM encoder with explicit frame
timestamps. Each output frame advances exactly `simulationHz / fps` source ticks;
duration and decoded start/middle/end samples are checked. Wall-clock work time is
recorded separately from playback time. This avoids MediaRecorder startup skipping
the beginning of a short action. Older wall-clock evidence remains immutable and
must not be described as an exact frame-matched comparison.

For a voxel game, input may be edit/rebuild/save events and phase ticks may bracket
chunk changes. For a shooter, input may bracket locomotion/aim/recoil/reload. For a
playful game, it may bracket readable anticipation/contact/recovery. Those adapters
and runtime capabilities still need implementation and actual rendered evidence.
