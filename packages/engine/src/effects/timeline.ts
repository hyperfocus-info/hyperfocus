export type TimelineEasing = "linear" | "step" | "smoothstep";
export type TimelineLoopMode = "none" | "repeat" | "ping-pong";
export type TimelineKeyframe = { time: number; value: number; easing?: TimelineEasing };
export type TimelineTrack = { id: string; keyframes: TimelineKeyframe[] };
export type TimelineEvent = { time: number; id: string };
export type TimelineDefinition = {
  duration: number;
  loop?: TimelineLoopMode;
  tracks: TimelineTrack[];
  events?: TimelineEvent[];
};
export type TimelinePlayerSnapshot = { version: 1; time: number; direction: 1 | -1; complete: boolean; loops: number };
export type TimelineStepResult = TimelinePlayerSnapshot & { eventsWritten: number; eventsDropped: number };

const MAX_TRACKS = 4_096;
const MAX_KEYFRAMES = 1_000_000;
const MAX_EVENTS = 100_000;
const MAX_BOUNDARY_CROSSES = 1_024;
const MAX_EVENT_EMISSIONS_PER_ADVANCE = 4_096;

type CompiledTrack = { times: Float64Array; values: Float64Array; easing: Uint8Array };

export function createTimeline(definition: TimelineDefinition) {
  const duration = positive(definition.duration, "Timeline duration");
  const loop = definition.loop ?? "none";
  if (loop !== "none" && loop !== "repeat" && loop !== "ping-pong") throw new TypeError(`Unsupported timeline loop mode: ${String(loop)}`);
  const { trackIds, tracks } = compileTimelineTracks(definition.tracks, duration);
  const { eventIds, eventTimes } = compileTimelineEvents(definition.events ?? [], duration);
  return Object.freeze({
    duration,
    loop,
    trackIds,
    eventIds,
    eventTimes,
    sample(time: number, output: Float64Array) {
      if (output.length < tracks.length) throw new RangeError(`Timeline sample output needs ${tracks.length} values`);
      const local = normalizeTimelineTime(duration, loop, time).time;
      for (let index = 0; index < tracks.length; index += 1) output[index] = sampleTrack(tracks[index]!, local);
      return output;
    },
    normalizeTime: (time: number) => normalizeTimelineTime(duration, loop, time),
  });
}

export type CompiledTimeline = ReturnType<typeof createTimeline>;

function compileTimelineTracks(definitions: readonly TimelineTrack[], duration: number) {
  if (!Array.isArray(definitions) || definitions.length > MAX_TRACKS) throw new RangeError(`Timeline tracks exceed ${MAX_TRACKS}`);
  const trackIds: string[] = [];
  const tracks: CompiledTrack[] = [];
  const seenTracks = new Set<string>();
  let totalKeyframes = 0;
  for (const track of definitions) {
    assertId(track.id, "Timeline track id");
    if (seenTracks.has(track.id)) throw new Error(`Duplicate timeline track: ${track.id}`);
    seenTracks.add(track.id);
    if (!Array.isArray(track.keyframes) || track.keyframes.length === 0) throw new Error(`Timeline track ${track.id} must contain keyframes`);
    totalKeyframes += track.keyframes.length;
    if (totalKeyframes > MAX_KEYFRAMES) throw new RangeError(`Timeline keyframes exceed ${MAX_KEYFRAMES}`);
    const compiled = compileTimelineTrack(track, duration);
    trackIds.push(track.id);
    tracks.push(compiled);
  }
  return { trackIds: Object.freeze(trackIds), tracks: Object.freeze(tracks) };
}

function compileTimelineTrack(track: TimelineTrack, duration: number): CompiledTrack {
  const times = new Float64Array(track.keyframes.length);
  const values = new Float64Array(track.keyframes.length);
  const easing = new Uint8Array(track.keyframes.length);
  let previous = -Infinity;
  for (let index = 0; index < track.keyframes.length; index += 1) {
    const keyframe = track.keyframes[index]!;
    const time = finite(keyframe.time, `Timeline track ${track.id} keyframe time`);
    if (time < 0 || time > duration || time <= previous) throw new Error(`Timeline track ${track.id} keyframe times must be unique, increasing, and inside the duration`);
    times[index] = time;
    values[index] = finite(keyframe.value, `Timeline track ${track.id} keyframe value`);
    easing[index] = easingCode(keyframe.easing ?? "linear");
    previous = time;
  }
  return { times, values, easing };
}

function compileTimelineEvents(definitions: readonly TimelineEvent[], duration: number) {
  const events = [...definitions];
  if (events.length > MAX_EVENTS) throw new RangeError(`Timeline events exceed ${MAX_EVENTS}`);
  events.sort((a, b) => a.time - b.time || compareText(a.id, b.id));
  const eventIds: string[] = [];
  const eventTimes = new Float64Array(events.length);
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    assertId(event.id, "Timeline event id");
    const time = finite(event.time, `Timeline event ${event.id} time`);
    if (time < 0 || time > duration) throw new RangeError(`Timeline event ${event.id} is outside the duration`);
    eventIds.push(event.id);
    eventTimes[index] = time;
  }
  return { eventIds: Object.freeze(eventIds), eventTimes };
}

function normalizeTimelineTime(duration: number, loop: TimelineLoopMode, time: number): { time: number; direction: 1 | -1; complete: boolean; loops: number } {
  const value = finite(time, "Timeline time");
  if (loop === "none") return { time: clamp(value, 0, duration), direction: 1, complete: value >= duration, loops: value <= 0 ? 0 : Math.floor(value / duration) };
  const positiveTime = Math.max(0, value);
  const loops = Math.floor(positiveTime / duration);
  const remainder = positiveTime % duration;
  if (loop === "repeat") return { time: remainder, direction: 1, complete: false, loops };
  const reverse = loops % 2 === 1;
  return { time: reverse ? duration - remainder : remainder, direction: reverse ? -1 : 1, complete: false, loops };
}

type TimelinePlayerState = { clip: CompiledTimeline; time: number; direction: 1 | -1; complete: boolean; loops: number };

export function createTimelinePlayer(clip: CompiledTimeline, snapshot?: TimelinePlayerSnapshot) {
  const state: TimelinePlayerState = { clip, time: 0, direction: 1, complete: false, loops: 0 };
  if (snapshot) restoreTimelinePlayer(state, snapshot);
  return Object.freeze({
    clip,
    sample: (output: Float64Array) => clip.sample(state.time, output),
    advance: (deltaSeconds: number, values: Float64Array, events: string[]) => advanceTimelinePlayer(state, deltaSeconds, values, events),
    seek: (time: number) => seekTimelinePlayer(state, time),
    snapshot: () => snapshotTimelinePlayer(state),
    restore: (value: TimelinePlayerSnapshot) => restoreTimelinePlayer(state, value),
  });
}

export type TimelinePlayer = ReturnType<typeof createTimelinePlayer>;

function advanceTimelinePlayer(state: TimelinePlayerState, deltaSeconds: number, values: Float64Array, events: string[]): TimelineStepResult {
  const delta = nonnegative(deltaSeconds, "Timeline delta");
  const previousTime = state.time;
  const previousDirection = state.direction;
  const previousLoops = state.loops;
  if (!state.complete || state.clip.loop !== "none") seekTimelinePlayer(state, absoluteTimelinePlayerTime(state) + delta);
  state.clip.sample(state.time, values);
  const before = events.length;
  const dropped = collectTimelinePlayerEvents(state, previousTime, previousDirection, previousLoops, events);
  return { ...snapshotTimelinePlayer(state), eventsWritten: events.length - before, eventsDropped: dropped };
}

function seekTimelinePlayer(state: TimelinePlayerState, time: number) {
  const normalized = state.clip.normalizeTime(time);
  state.time = normalized.time;
  state.direction = normalized.direction;
  state.complete = normalized.complete;
  state.loops = normalized.loops;
}

function snapshotTimelinePlayer(state: TimelinePlayerState): TimelinePlayerSnapshot {
  return { version: 1, time: state.time, direction: state.direction, complete: state.complete, loops: state.loops };
}

function restoreTimelinePlayer(state: TimelinePlayerState, snapshot: TimelinePlayerSnapshot) {
  if (snapshot.version !== 1 || !Number.isFinite(snapshot.time) || snapshot.time < 0 || snapshot.time > state.clip.duration || (snapshot.direction !== 1 && snapshot.direction !== -1) || typeof snapshot.complete !== "boolean" || !Number.isSafeInteger(snapshot.loops) || snapshot.loops < 0) throw new Error("Invalid timeline player snapshot");
  state.time = snapshot.time;
  state.direction = snapshot.direction;
  state.complete = snapshot.complete;
  state.loops = snapshot.loops;
}

function absoluteTimelinePlayerTime(state: TimelinePlayerState) {
  if (state.clip.loop === "none") return state.time;
  if (state.clip.loop === "repeat") return state.loops * state.clip.duration + state.time;
  return state.loops * state.clip.duration + (state.direction === 1 ? state.time : state.clip.duration - state.time);
}

function collectTimelinePlayerEvents(state: TimelinePlayerState, previousTime: number, previousDirection: 1 | -1, previousLoops: number, output: string[]) {
  if (!state.clip.eventIds.length) return 0;
  const boundaryCrosses = state.loops - previousLoops;
  const emitted = { written: 0, dropped: Math.max(0, boundaryCrosses - MAX_BOUNDARY_CROSSES) * state.clip.eventIds.length };
  const crosses = Math.min(boundaryCrosses, MAX_BOUNDARY_CROSSES);
  if (crosses === 0) {
    emitRange(state.clip, previousTime, state.time, previousDirection, output, emitted);
    return emitted.dropped;
  }
  emitRange(state.clip, previousTime, previousDirection === 1 ? state.clip.duration : 0, previousDirection, output, emitted);
  for (let loop = 1; loop < crosses; loop += 1) {
    const direction: 1 | -1 = state.clip.loop === "ping-pong" && (previousLoops + loop) % 2 === 1 ? -1 : 1;
    emitRange(state.clip, direction === 1 ? 0 : state.clip.duration, direction === 1 ? state.clip.duration : 0, direction, output, emitted);
  }
  emitRange(state.clip, state.direction === 1 ? 0 : state.clip.duration, state.time, state.direction, output, emitted);
  return emitted.dropped;
}

function sampleTrack(track: CompiledTrack, time: number) {
  const count = track.times.length;
  if (time <= track.times[0]!) return track.values[0]!;
  if (time >= track.times[count - 1]!) return track.values[count - 1]!;
  let low = 0;
  let high = count - 1;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if (track.times[middle]! <= time) low = middle;
    else high = middle;
  }
  const start = track.times[low]!;
  const ratio = ease(track.easing[low]!, (time - start) / (track.times[high]! - start));
  return track.values[low]! + (track.values[high]! - track.values[low]!) * ratio;
}

function emitRange(clip: CompiledTimeline, from: number, to: number, direction: 1 | -1, output: string[], state: { written: number; dropped: number }) {
  const emit = (id: string) => {
    if (state.written < MAX_EVENT_EMISSIONS_PER_ADVANCE) { output.push(id); state.written += 1; }
    else state.dropped += 1;
  };
  if (direction === 1) {
    for (let index = 0; index < clip.eventTimes.length; index += 1) if (clip.eventTimes[index]! > from && clip.eventTimes[index]! <= to) emit(clip.eventIds[index]!);
  } else {
    for (let index = clip.eventTimes.length - 1; index >= 0; index -= 1) if (clip.eventTimes[index]! < from && clip.eventTimes[index]! >= to) emit(clip.eventIds[index]!);
  }
}

function easingCode(value: TimelineEasing) {
  if (value === "linear") return 0;
  if (value === "step") return 1;
  if (value === "smoothstep") return 2;
  throw new TypeError(`Unsupported timeline easing: ${String(value)}`);
}
function ease(code: number, value: number) { return code === 1 ? 0 : code === 2 ? value * value * (3 - 2 * value) : value; }
function assertId(value: unknown, label: string): asserts value is string { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value)) throw new Error(`${label} is invalid`); }
function finite(value: number, label: string) { if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`); return value; }
function positive(value: number, label: string) { const checked = finite(value, label); if (checked <= 0) throw new RangeError(`${label} must be greater than zero`); return checked; }
function nonnegative(value: number, label: string) { const checked = finite(value, label); if (checked < 0) throw new RangeError(`${label} must not be negative`); return checked; }
function clamp(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)); }
function compareText(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
