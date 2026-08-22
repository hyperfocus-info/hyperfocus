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

export class CompiledTimeline {
  readonly duration: number;
  readonly loop: TimelineLoopMode;
  readonly trackIds: readonly string[];
  readonly eventIds: readonly string[];
  readonly eventTimes: Float64Array;
  private readonly tracks: readonly CompiledTrack[];

  constructor(definition: TimelineDefinition) {
    this.duration = positive(definition.duration, "Timeline duration");
    this.loop = definition.loop ?? "none";
    if (this.loop !== "none" && this.loop !== "repeat" && this.loop !== "ping-pong") throw new TypeError(`Unsupported timeline loop mode: ${String(this.loop)}`);
    if (!Array.isArray(definition.tracks) || definition.tracks.length > MAX_TRACKS) throw new RangeError(`Timeline tracks exceed ${MAX_TRACKS}`);
    const trackIds: string[] = [];
    const tracks: CompiledTrack[] = [];
    const seenTracks = new Set<string>();
    let totalKeyframes = 0;
    for (const track of definition.tracks) {
      assertId(track.id, "Timeline track id");
      if (seenTracks.has(track.id)) throw new Error(`Duplicate timeline track: ${track.id}`);
      seenTracks.add(track.id);
      if (!Array.isArray(track.keyframes) || track.keyframes.length === 0) throw new Error(`Timeline track ${track.id} must contain keyframes`);
      totalKeyframes += track.keyframes.length;
      if (totalKeyframes > MAX_KEYFRAMES) throw new RangeError(`Timeline keyframes exceed ${MAX_KEYFRAMES}`);
      const times = new Float64Array(track.keyframes.length);
      const values = new Float64Array(track.keyframes.length);
      const easing = new Uint8Array(track.keyframes.length);
      let previous = -Infinity;
      for (let index = 0; index < track.keyframes.length; index += 1) {
        const keyframe = track.keyframes[index]!;
        const time = finite(keyframe.time, `Timeline track ${track.id} keyframe time`);
        if (time < 0 || time > this.duration || time <= previous) throw new Error(`Timeline track ${track.id} keyframe times must be unique, increasing, and inside the duration`);
        times[index] = time;
        values[index] = finite(keyframe.value, `Timeline track ${track.id} keyframe value`);
        easing[index] = easingCode(keyframe.easing ?? "linear");
        previous = time;
      }
      trackIds.push(track.id);
      tracks.push({ times, values, easing });
    }
    const events = [...(definition.events ?? [])];
    if (events.length > MAX_EVENTS) throw new RangeError(`Timeline events exceed ${MAX_EVENTS}`);
    events.sort((a, b) => a.time - b.time || compareText(a.id, b.id));
    const eventIds: string[] = [];
    const eventTimes = new Float64Array(events.length);
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index]!;
      assertId(event.id, "Timeline event id");
      const time = finite(event.time, `Timeline event ${event.id} time`);
      if (time < 0 || time > this.duration) throw new RangeError(`Timeline event ${event.id} is outside the duration`);
      eventIds.push(event.id);
      eventTimes[index] = time;
    }
    this.trackIds = Object.freeze(trackIds);
    this.tracks = Object.freeze(tracks);
    this.eventIds = Object.freeze(eventIds);
    this.eventTimes = eventTimes;
  }

  sample(time: number, output: Float64Array) {
    if (output.length < this.tracks.length) throw new RangeError(`Timeline sample output needs ${this.tracks.length} values`);
    const local = this.normalizeTime(time).time;
    for (let index = 0; index < this.tracks.length; index += 1) output[index] = sampleTrack(this.tracks[index]!, local);
    return output;
  }

  normalizeTime(time: number): { time: number; direction: 1 | -1; complete: boolean; loops: number } {
    const value = finite(time, "Timeline time");
    if (this.loop === "none") return { time: clamp(value, 0, this.duration), direction: 1, complete: value >= this.duration, loops: value <= 0 ? 0 : Math.floor(value / this.duration) };
    const positiveTime = Math.max(0, value);
    const loops = Math.floor(positiveTime / this.duration);
    const remainder = positiveTime % this.duration;
    if (this.loop === "repeat") return { time: remainder, direction: 1, complete: false, loops };
    const reverse = loops % 2 === 1;
    return { time: reverse ? this.duration - remainder : remainder, direction: reverse ? -1 : 1, complete: false, loops };
  }
}

export class TimelinePlayer {
  private time = 0;
  private direction: 1 | -1 = 1;
  private complete = false;
  private loops = 0;

  constructor(readonly clip: CompiledTimeline, snapshot?: TimelinePlayerSnapshot) {
    if (snapshot) this.restore(snapshot);
  }

  sample(output: Float64Array) { return this.clip.sample(this.time, output); }

  advance(deltaSeconds: number, values: Float64Array, events: string[]): TimelineStepResult {
    const delta = nonnegative(deltaSeconds, "Timeline delta");
    const previousTime = this.time;
    const previousDirection = this.direction;
    const previousLoops = this.loops;
    if (!this.complete || this.clip.loop !== "none") {
      const normalized = this.clip.normalizeTime(this.absoluteTime() + delta);
      this.time = normalized.time;
      this.direction = normalized.direction;
      this.complete = normalized.complete;
      this.loops = normalized.loops;
    }
    this.clip.sample(this.time, values);
    const before = events.length;
    const dropped = this.collectEvents(previousTime, previousDirection, previousLoops, events);
    return { ...this.snapshot(), eventsWritten: events.length - before, eventsDropped: dropped };
  }

  seek(time: number) {
    const normalized = this.clip.normalizeTime(time);
    this.time = normalized.time;
    this.direction = normalized.direction;
    this.complete = normalized.complete;
    this.loops = normalized.loops;
  }

  snapshot(): TimelinePlayerSnapshot {
    return { version: 1, time: this.time, direction: this.direction, complete: this.complete, loops: this.loops };
  }

  restore(snapshot: TimelinePlayerSnapshot) {
    if (snapshot.version !== 1 || !Number.isFinite(snapshot.time) || snapshot.time < 0 || snapshot.time > this.clip.duration || (snapshot.direction !== 1 && snapshot.direction !== -1) || typeof snapshot.complete !== "boolean" || !Number.isSafeInteger(snapshot.loops) || snapshot.loops < 0) {
      throw new Error("Invalid timeline player snapshot");
    }
    this.time = snapshot.time;
    this.direction = snapshot.direction;
    this.complete = snapshot.complete;
    this.loops = snapshot.loops;
  }

  private absoluteTime() {
    if (this.clip.loop === "none") return this.time;
    if (this.clip.loop === "repeat") return this.loops * this.clip.duration + this.time;
    return this.loops * this.clip.duration + (this.direction === 1 ? this.time : this.clip.duration - this.time);
  }

  private collectEvents(previousTime: number, previousDirection: 1 | -1, previousLoops: number, output: string[]) {
    if (!this.clip.eventIds.length) return 0;
    const boundaryCrosses = this.loops - previousLoops;
    const state = { written: 0, dropped: Math.max(0, boundaryCrosses - MAX_BOUNDARY_CROSSES) * this.clip.eventIds.length };
    const crosses = Math.min(boundaryCrosses, MAX_BOUNDARY_CROSSES);
    if (crosses === 0) {
      emitRange(this.clip, previousTime, this.time, previousDirection, output, state);
      return state.dropped;
    }
    emitRange(this.clip, previousTime, previousDirection === 1 ? this.clip.duration : 0, previousDirection, output, state);
    for (let loop = 1; loop < crosses; loop += 1) {
      const direction: 1 | -1 = this.clip.loop === "ping-pong" && (previousLoops + loop) % 2 === 1 ? -1 : 1;
      emitRange(this.clip, direction === 1 ? 0 : this.clip.duration, direction === 1 ? this.clip.duration : 0, direction, output, state);
    }
    emitRange(this.clip, this.direction === 1 ? 0 : this.clip.duration, this.time, this.direction, output, state);
    return state.dropped;
  }
}

export function createTimeline(definition: TimelineDefinition) { return new CompiledTimeline(definition); }
export function createTimelinePlayer(clip: CompiledTimeline, snapshot?: TimelinePlayerSnapshot) { return new TimelinePlayer(clip, snapshot); }

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
