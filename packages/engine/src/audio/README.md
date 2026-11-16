# Queues, playlists and transitions

`createAudioEngine` owns decoded buffers, named buses, priority-based voice
capacity and the final output limiter. `createAudioQueue` and
`createAudioPlaylist` compose that lifecycle; they do not create an independent
context or bypass the mix. Both are exported from `@hyperfocus/engine/audio`.

`configureBusEffects({ bus, compressor?, reverb?, highpassHz?, lowpassHz?, pitchCents? })`
owns optional native inserts on a named bus. Both decoded voices and sources
connected through `withBus` enter the same inserts, which finish at the user bus
fader before master protection. Configure before playback; changing inserts
reconnects active decoded voices, while external sources must refresh their
`withBus` destination. Compressor fields are `threshold`, `knee`, `ratio`,
`attack`, `release` and optional `ceilingDb` (an oversampled peak guard with
0.1 dB headroom for reconstruction overshoot).
Decode a mono/stereo impulse of at most four seconds first, then supply
`reverb: { assetId, sendGain?, highpassHz?, lowpassHz? }`. The convolution return
shares the bus fader, so zero volume or mute also silences existing tails.
Multiple buses may share cached impulse data but own separate returns to keep
their volume and mute independent. Native convolution normalization is disabled;
hosts own impulse level and send calibration.

Configure `highpassHz`, `lowpassHz` or `pitchCents` initially to enable those
reactive processors, then use
`setBusReactive({ bus, highpassHz?, lowpassHz?, pitchCents?, fadeSeconds? })`.
The independent high-pass and low-pass filters accept 10–20,000 Hz and use Q
0.707. Their reactive cutoffs survive graph recovery; zero `fadeSeconds` cancels
pending automation and sets the cutoff immediately. Touch of Death uses a
stamina low-pass endpoint of 800 Hz to darken exhausted music. The deprecated
`staminaHighpassHz` authored field remains validated but is ignored when resolving
effects; an explicit `staminaLowpassHz` takes precedence over the 800 Hz default.
Repeated identical pitch targets preserve the existing fade rather than restarting
its native control automation. Stamina-only filter changes can omit `pitchCents`.
Pitch is bounded to ±100 cents. Two native delay taps use fixed 50 ms grain depth
and complementary looping control buffers whose rate follows the requested cents.
Only those control buffers change rate; music playback rate and grid timing stay
unchanged. Nonzero pitch delays vary from 10 to 60 ms, averaging approximately
35 ms, and can introduce
granular coloration; zero uses the dry bypass. No worklet or DOM is required.
Native parameter holding preserves ongoing ramps when supported. Injected
contexts can omit the native factories; `effects-unavailable` warnings and
`busEffectsSnapshot()` expose fallback and owned processor counts. Recovery
preserves tuning, disposes controls/tails, and permits host impulse rehydration
through `onRecoveryRequired` after a closed context clears its decoded cache.

`playBuffer(id, { saturation })` accepts zero-to-one per-voice impact saturation.
It uses a soft symmetric curve with at most +3 dB drive and small-signal level
compensation, and owns cleanup on end, steal and disposal. Other voices remain
dry. Hosts should audition compression, impulse sends and pitch on real output;
graph tests establish routing and lifecycle, not perceptual quality.

The NDO2 `client/src/util/sound.ts` supplied the design references: bounded SFX
channels, shuffled lobby/game music, automatic end advancement and outgoing
transition effects. The engine version uses factories, explicit host asset
loading and one shared audio clock. It does not import NDO2's world/store globals,
metadata library, object pool, filesystem globs, or wall-clock cleanup timers.

```ts
const music = createAudioPlaylist({
  engine,
  playlists: {
    lobby: [{ assetId: 'quiet', gain: .8 }],
    gameplay: [{ assetId: 'fight-one', bpm: 120 }, { assetId: 'fight-two', bpm: 128 }],
  },
  load: async assetId => { await engine.decode(assetId, await loadPackedBytes(assetId)); },
  gain: .24,
  transition: { style: 'varied', durationSeconds: 2.5, align: 'bar', beatsPerBar: 4 },
});
await music.select({ playlistId: 'lobby' });
await music.select({ playlistId: 'gameplay' });
music.update(); // Call during the host playback tick.
```

The host supplies encoded bytes and performs gesture unlock. `load` must finish
only once the requested ID is in the engine cache. It must also surface failed
decodes. The controller serializes loading and warms one successor; never preload
the entire music library. Configure decoded-byte capacity for the largest two
tracks plus the effects cache. Hosts may remove retired music cache entries:
active sources retain their AudioBuffer reference independently of the cache.

Tracks accept `assetId`, relative `gain`, optional known `bpm`, and optional
`startSeconds`/`endSeconds` cue trims. Musical timing adds `beatOffsetSeconds`
(first downbeat in decoded seconds), `beatsPerBar` (1–12) and `phraseBars` (1–16).
Meter defaults to the transition's bar size, then four; phrases default to four
bars. Optional `musicalKey` uses one of the 24 canonical names exported as
`AUDIO_MUSICAL_KEYS`, and `energy` is a zero-to-one authored intensity.
Each list has at most 64 distinct IDs and a
controller has at most 32 lists. Normal rotation visits every healthy song before
refilling its cycle, including lists using energy/key/tempo preferences. Warmed
or cancelled future starts do not count as heard. No immediate repeat occurs when
another healthy track exists. Failures retry after 30,
then 60, then at most 120 audio-clock seconds. `update()` retries an exhausted
list only when its deadline arrives; no polling jobs or immediate retry loop are
created. `snapshot()` reports `status: 'error'`, a message and `retryAt` when every
track is unavailable. `retry()` clears that cooldown for one bounded immediate
attempt. Error state remains visible while paused; Retry queues an attempt until
resume. Repeated same-list intensity updates preserve its cooldown. Pause gates
recovery; reset and disposal invalidate pending work.

Known keys favor equal keys, relative major/minor or adjacent fifths among
eligible tracks. Missing keys do not claim harmonic compatibility. No playback
rate or pitch changes are performed. Within the viable energy/key pool, known
BPM favors direct neighbors within 8%, half/double-time neighbors within 4%, or
nearest ratios. Unknown tempo stays eligible when that pool has no known tempo.
`select({ playlistId, intensity })` favors
tracks with nearby authored energy, with a 0.12 selection tolerance. Intensity
changes update selection for the next song; they never interrupt the current
song. Only natural end transitions, explicit Next, or a playlist change advance
playback. Repeated phase/gain updates preserve an incoming crossfade's finish
time instead of shortening it. The host
supplies intensity; the portable controller does not infer it
from game state.

`readAudioMetadata({ bytes })` reads ID3v2.3/v2.4 `TBPM` from encoded MP3 bytes.
It returns `{ bpm, bpmStatus: 'tagged', bpmConfidence: 1, bpmSource }` with precise
tag provenance, or `undefined` for missing, unsupported or invalid tags. The
confidence value records authored tag provenance; it does not verify the audio's
tempo. Parsing is bounded to a 1 MiB tag, 256 frames and 256 bytes per BPM payload.
Latin1, UTF-8 (including the common v2.3 extension), UTF-16 and UTF-16BE numeric
text are supported, including extended headers, grouping and unsynchronization.
Encrypted/compressed frames are skipped. Accepted BPM values are 30 through 300.
No signal-based tempo estimate or downbeat location is inferred by this reader.

`engine.decode(id, bytes)` stores these tags with the accepted decoded cache
entry; `getAudioMetadata(id)` returns a copy. Replacement, eviction and clearing
remove its metadata. Playlists use the decoded tag automatically when `track.bpm`
is absent. Explicit track BPM remains the first choice. Injected playlist ports
may omit the metadata getter and retain their original behavior. Streamed first-party
delivery uses the imported catalog tag through the same getter, so clearing a
playlist BPM override does not require decoding a song to recover its tempo.

`select({ playlistId, gain?, transition? })` changes the list after the incoming
track is decoded. Selecting the current list updates gain without restarting it.
`next({ transition? })` skips ahead. `update()` schedules the successor before
the end; the voice's natural `onEnded('ended')` callback also advances automatically.
Voice capacity rejection preserves the outgoing voice and retries on update.
Loading failures, superseded selections, reset and disposal cannot start stale
tracks after their pending decode completes. An empty selected list stops music.

`setGain({ gain, fadeSeconds? })` multiplies the current track's gain. The snapshot
includes list ID, loading/pause flags, successor ID, transition style and current
asset/index/gain/duration/start time/offset/elapsed time. `onTrack` reports each
accepted track with its list, ID, index and effective gain.

Transitions default to a two-second immediate crossfade. Styles are `crossfade`,
`filter`, `echo`, `flanger`, `stutter` and `varied`. `varied` selects an available
style without consecutive repeats. Filter/echo/flanger require optional native
context nodes and fall back to crossfade when unavailable or creation fails.
`supportedAudioTransitions(context)` reports available concrete styles. Filter
sweeps lowpass cutoff; echo/flanger use feedback below one; flanger owns one LFO;
stutter schedules at most 32 softened gain gates. Every effect routes through the
existing voice gain, bus and limiter. Source end, interruption, superseding
transition, reset and disposal stop oscillators and disconnect temporary nodes.
Scheduled effects initialize neutral filter and wet/feedback values immediately,
so waiting for a future beat or bar cannot activate an early effect or feedback loop.
Rapid skips retain at most the incoming and outgoing music voices.
Skipping before an aligned incoming voice starts cancels that scheduled voice
while retaining the outgoing track until the replacement can start.

`align: 'beat' | 'bar' | 'phrase'` uses the outgoing track's known BPM, downbeat
offset and meter. Phrase alignment multiplies bar length by `phraseBars`.
Missing BPM uses immediate alignment. Alignment cannot extend past the outgoing
track's available end, and fades/stops use `AudioContext.currentTime`. No BPM is
guessed. An incoming track with authored `beatOffsetSeconds` starts at the first
selected beat/bar/phrase boundary at or after its cue start, within its cue end.
Without that field its trim remains unchanged. Automatic advanced transitions
allow one grid period of lead time before the fade; short cues still bound the
wait to their available end. A BPM tag supplies spacing rather than downbeat
position. Authors or host analysis supply offsets; tempo changes within a track
still require separate cues. Duration is bounded to ten seconds.

`setPaused({ paused })` gates controller work; the host remains responsible for
`engine.setPaused({ paused })`, which suspends the shared clock and voices.
Controllers never resume the context themselves. Dispose controllers before
disposing their engine.

For effects, `createAudioQueue({ engine, load?, capacity: 128, concurrency: 4,
maxWaitSeconds: .18, seed? })` accepts `enqueue({ assetId?, assetIds?, play? })`.
Use one ID or a distinct variant bank. The queue returns a request ID, or
`undefined` at capacity. It shuffles variants without adjacent repeats, bounds
loading plus active work, drops overdue waiting effects using the audio clock,
and preserves waiting age across intentional local pause. `cancel({ id })`,
`reset()` and `dispose()` cancel late playback; an active cancelled voice stops.
Voice end frees the slot and starts eligible waiting work. Engine priorities
still determine whether a requested voice may replace an active sound.
Waiting requests are processed by descending `play.priority`, then request ID.
Optional `categoryLimits` bound loading plus active sounds per category;
`enqueue({ category, coalesceKey })` coalesces repeated work within a category.
An active/loading duplicate retains its request; a waiting duplicate may replace
its payload when its priority is at least the existing priority. `onStart`
reports ID, asset, category and voice for host ducking or telemetry. The queue
accepts a minimal engine port; `now?: () => number` supplies seconds when a host
has no context clock. Otherwise the injected engine's audio clock is used.

`PlayBufferOptions.onEnded` distinguishes natural completion from explicit stop,
steal/recovery/disposal. Voice handles optionally expose `transitionOut` for
native outgoing effects; injected older handles use ordinary fade/stop fallback.

From `packages/engine`, run `bun test src/audio`, `bun run typecheck` and
`bun run typecheck:tests`. Scheduling tests cover natural end, trim/gain math,
interrupted fades holding native automation (or capturing gain before cancellation),
pre-end and bar-aligned fades, supported/fallback effects, rapid skips and node
cleanup, queue bounds, pause, cancellation, decode failure/cooldown, stale loads,
capacity recovery, same-turn resume/select completion and safe effect parameters
before a future transition. Metadata tests cover original FL Studio tag forms,
v2.4/UTF-16, malformed/resource-excessive inputs, cache lifecycle, automatic BPM
alignment and authored overrides. Advanced tests cover cue grids, meter/phrases,
pre-end lead time, harmonic ordering, energy hysteresis/dwell, exhausted recovery,
category limits, priority, coalescing and injected host clocks.
