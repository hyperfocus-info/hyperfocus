# Engine Editor User Stories

Canonical user-story inventory for the engine editor UI. Shipped behavior stays in
[README.md](README.md); this file names the user outcomes each surface must keep
working.

Story IDs are stable. When a material editor UI behavior changes, update the
matching story and the verification note in the same change.

## Stories

EE-PROJECT-001: As a creator, I create or open a Hyperfocus project from the editor
by choosing a working baseline from a scalable starter selector, so that the
canonical `.hyperfocus/project.json` and `assets.hfp` pair becomes the source of
truth without requiring me to infer a hidden genre workflow.

EE-PROJECT-002: As a creator, I recover from unsupported, stale, or missing project
files with explicit diagnostics and can restore a bounded complete project pair
into an attached browser so that the editor never silently writes an invalid or
asset-incomplete project.

EE-NAV-001: As a creator, I switch between Edit, Play, Profile, and Build modes
from stable navigation so that each task has a clear workspace.

EE-NAV-002: As a keyboard user, I reach primary modes, resource editors, command
palette actions, save, undo, redo, and play controls through documented shortcuts
so that editing does not depend on pointer-only operation. Sequence transport,
tracks, keyframes, timecode, selection status, and zoom expose nonvisual names and
state for screen-reader review.

EE-AUTHORING-001: As a creator, I inspect scenes, entities, assets, and scripts in
the project sidebar so that project structure stays navigable as it grows.

EE-AUTHORING-002: As a creator, I edit selected entity components through the
inspector so that authored data stays validated before it reaches the project file.

EE-AUTHORING-003: As a creator, I use Stage, Tilemap, Atlas, Post FX, Motion, and
Network resource editors only when their data is relevant so that specialist tools
do not crowd the default workspace.

EE-AUTHORING-004: As a creator, I import images, audio, data, fonts, and 3D assets
with visible metadata and content-addressed storage so that assets remain portable
and deduplicated.

EE-AUTHORING-005: As a creator, I author multiple named spritesheet clips with
independent frame order, FPS, and loop behavior and select a clip from sprite data
so that gameplay can switch cleanly between states such as Idle, Walk, and Attack.

EE-AUTHORING-006: As an animator, I apply editable micro-motion recipes at the
playhead so that anticipation, contact, recoil, recovery, camera impact, hit flash,
and particle bursts survive scrubbing, MP4 export, agent commands, and standalone
builds without requiring one-off renderer code.

EE-AUTHORING-007: As an animator, I place stepped named-clip cues on one sprite
track so that Idle, Walk, Attack, reaction, and transformation states hold until
the next cue and sample the same Atlas subframe in scrub, Play, MP4, and standalone
builds without duplicating entities or numeric visibility tracks.

EE-PREVIEW-001: As a creator, I run Play mode against the same DOM-free simulation
used by builds so that preview behavior matches exported behavior.

EE-PREVIEW-003: As a game author, I opt HUD text into screen space so that it stays
fixed to the shipped canvas while the followed world camera moves beneath it.

EE-PREVIEW-002: As a creator, I profile runtime behavior and capture evidence,
including parity-checked batched TypeScript/WASM p95 samples, so that performance
work is grounded in measured data rather than mislabeled boundary-call timing.

EE-BUILD-001: As a creator, I review build readiness and build one offline HTML
artifact from the verified portable pair at desktop or narrow widths so that a
playable export can run without the editor, a server, an account, or separate assets.

EE-VIDEO-001: As a music-video creator, I render the exact authored timeline and
deterministically mixed score and SFX tracks to H.264 MP4, preserving each track's
schedule, trim, loop, fades, gain, pan, mute, and solo state, using 720p, 1080p, or
4K at 30 or 60 fps, with 1080p/30 as the safe default and WebM available as a fallback.

EE-CODE-001: As a trusted-project author, I enable live source preview explicitly
for the current session so that custom TypeScript can run without making source
execution a persistent default.

EE-AI-001: As a creator, I connect the optional AI panel to a local harness only
when needed so that the editor remains usable without credentials or networked AI,
and long Markdown histories remain windowed while streamed responses update in place.

EE-PREFERENCES-001: As a user, I adjust editor appearance, layout, motion, and
accessibility preferences without dirtying authored project data.

## Verification

Focused tests live under `apps/engine-editor`. Use the commands in
[README.md#verification](README.md#verification), with visual or browser evidence
for material UI changes.

Related: [Repository user-story map](../../docs/user-stories.md) and
[Application Design Standard](../../DESIGN.md).
