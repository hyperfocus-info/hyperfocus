# Portable runtime audio

Audio authored in the editor remains part of the canonical two-file project:

- component configuration is ordinary JSON in `.hyperfocus/project.json`;
- original encoded audio bytes are stored once, by SHA-256, in `.hyperfocus/assets.hfp`;
- song asset `audioMetadata` stores authored MP3 tempo tags or estimated BPM,
  confidence, source and detection status in the catalog; imports and runtime
  decode read ID3 tags automatically. Explicit playlist BPM takes precedence.
  Missing tempo never becomes a default BPM; tempo alone does not identify downbeats;
- standalone HTML is disposable build output and does not become a third project file;
- the build does not generate a wrapper source file per sound or component.

The portable 2D runtime validates enabled `audio` components and emits deterministic host commands. It never invokes browser globals from the headless simulation. The editor's standalone player consumes those commands with the first-party Web Audio engine, which provides bounded decoded caching and voice capacity.

Portable hosts can also compose bounded SFX queues and shuffled music playlists
with audio-clock transitions through `@hyperfocus/engine/audio`. See the
[queue, playlist and transition guide](../src/audio/README.md) for loading,
pause/cancellation, native-effect fallbacks and focused validation commands.

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
  At capacity a lower-priority incoming sound is rejected with `voice-capacity`
  without interrupting higher-priority active voices.

Scene loading queues start commands in authored entity/component order. Switching scenes first emits `stop-scene` for the old scene and then the new scene's start commands. This stops looping voices and cancels queued sounds from a scene left before browser audio was unlocked.

Browsers require audio to be unlocked from a user gesture. The standalone build queues valid commands until the first keyboard or pointer gesture, resumes Web Audio immediately, decodes referenced packed bytes, and flushes the queue. Missing packed bytes or decode/play failures are reported as runtime diagnostics. Ordinary offline exports keep network access disabled; optional web-folder music delivery permits only validated, content-addressed same-origin MP3 paths through `media-src 'self'` and does not broaden `connect-src`.

The simulation bounds pending audio work at 4,096 commands; the first-party bridge
bounds pending commands at 128 and concurrent decodes at 64. It starts cached sounds
without waiting for unrelated decoding. One-shots over 180 ms late are dropped;
intentional pause time does not count toward that budget. Optional host preload IDs
warm all unique combat assets of at most 512 KiB each within a 16 MiB encoded-byte
budget, using four concurrent workers after unlock. Demand decoding runs independently
of those workers. Pause stops new prewarm jobs; disposal clears the remaining queue.
The first-party default cache reserves entry capacity for the eligible bank plus
eight other assets, with a 64 MiB decoded-byte limit for legacy playback. Playlist
hosts allow 320 MiB, keep current/next music in the cache and remove obsolete music
entries before decoding successors. The streamed host instead reserves 32 MiB for
decoded effects and owns at most two native media music voices plus one metadata
preload. Music is excluded from effect prewarming. Hosts using `@hyperfocus/engine/project/runtime-2d` should call
`drainAudioCommands()` regularly and send the returned commands to their audio
layer. A host that lets the simulation queue exceed its configured limit receives
an explicit error rather than unbounded growth or silent loss.

Host play commands may additionally carry `duckMusic` (a zero-to-one music-bus
multiplier), `duckSeconds`, and `fadeSeconds`. The gameplay host preserves these
alongside sound priority. Repeating the active music asset updates its phase gain
without restarting; replacing it fades out and stops the previous voice. Ducks
compose by their lowest multiplier and restore the current user music gain.
The gameplay host defaults music priority to 90 so ordinary steps, swings and
ambience do not evict the loop. Explicit event priorities, including zero, and
ordinary authored 2D command priorities remain unchanged.
The audio engine connects a final compressor with a -3 dB threshold, 20:1 ratio,
3 ms attack and 120 ms release. Native contexts add an oversampled -3 dB peak guard
after compression to catch attack transients; signals below the ceiling remain
linear. Both nodes are owned through graph recovery and disposal. `outputLimiter: false` disables them. Injected contexts
without a compressor retain the ordinary output graph; compressor creation errors
report a warning and recover that graph.

Editor transport Pause and standalone Pause suspend the audio context alongside simulation. `AudioEngine.setPaused({ paused })` preserves active sources and their playback positions; intentional suspension does not invoke interruption recovery or rebuild the graph. Injected contexts must provide `suspend()` to support pausing. New audio commands remain queued until playback resumes.

Combat playlists accept authored downbeat offsets, meter, phrase length, musical
key and energy. The simulation emits bounded, smoothed `musicIntensity` from
health, pressure, hits and combos; checkpoint restoration preserves that state.
Playlist adaptation has a sixteen-second dwell and hysteresis, so individual hits
do not continually change songs. Eligible music favors energy and compatible keys,
then BPM neighbors: direct tempos within 8%, half/double-time within 4%, or nearest
ratios. Explicit track BPM overrides automatic tags; unknown tempo remains usable
when no known alternative exists. Selection never changes playback rate. BPM
alone does not verify a downbeat, phrase or key.

Touch of Death's personal music filter follows the current local fighter's
normalized stamina on each presentation update. Its low-pass cutoff starts at
20,000 Hz with full stamina, reaches approximately 1,523 Hz at half stamina, and
reaches 800 Hz when empty. A logarithmic cutoff curve reaches 80% of its effect
at half stamina, muffling highs from the first stamina spent. Spending
and recovery set the native cutoff immediately, without a fade or rounding.
Online and controlled replay seats retain explicit listener ownership; opponent
resources and spectators do not drive the personal effect. Health pitch keeps
its independent transitions. World SFX and ambience use a 0.02 city impulse send;
UI sounds bypass that convolver.

Combat audio currently provides camera-relative stereo placement. City emitters
also use full XYZ distance falloff: machinery reaches 12 m, ordinary city cues
reach 16 m, and fire/water hazards reach 24 m. Personal combat cues and voices
remain at their authored gain. A playing one-shot retains its initial pan; this
path does not provide moving-source updates, HRTF elevation/front-back cues, or
wall occlusion. Music and UI retain ordinary stereo playback.

An exhausted playlist exposes an error and retry deadline even while paused.
The settings Retry action clears its bounded cooldown, queues a fresh attempt,
and waits for resume before starting audio. The streamed adapter uses owned
deadline timers for future media starts/stops, pauses on native context
interruption, and reconnects to recovered bus nodes. HTML media timing remains
approximate; physical-device acceptance is separate from controller tests.

Decoded one-shots use the shared audio queue with per-category limits and
movement/ambient coalescing. Critical cues can displace lower-priority pending
effects at either host admission stage; evicted decode callbacks cannot revive
them. Scene cancellation, pause aging and independent hot effects remain bounded.
