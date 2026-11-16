import type { EditorAudioTrack } from "@hyperfocus/engine/project";
import { clampLowerFirst as clamp } from '@hyperfocus/utilities/math';

export type DecodedTimelineAudio = Pick<AudioBuffer, "duration" | "length" | "numberOfChannels" | "sampleRate" | "getChannelData">;

export type TimelineAudioMixTrack = {
  id: string;
  assetId?: string;
  startSeconds: number;
  durationSeconds: number;
  trimStartSeconds: number;
  trimEndSeconds: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  loopStartSeconds: number;
  loopEndSeconds: number;
  volume: number;
  pan: number;
};

export type TimelineAudioMixPlan = {
  durationSeconds: number;
  tracks: TimelineAudioMixTrack[];
};

type AudioTrackSource = { track: EditorAudioTrack; buffer: DecodedTimelineAudio };

export function selectTimelineAudioTracks(tracks: readonly EditorAudioTrack[]) {
  const audible = tracks.filter((track) => !track.muted && track.durationFrames > 0);
  return audible.some((track) => track.solo) ? audible.filter((track) => track.solo) : audible;
}

export function createTimelineAudioMixPlan(options: {
  sources: readonly AudioTrackSource[];
  timelineFps: number;
  exportFps: number;
  exportFrameCount: number;
}): TimelineAudioMixPlan {
  assertPositive(options.timelineFps, "timelineFps");
  assertPositive(options.exportFps, "exportFps");
  if (!Number.isSafeInteger(options.exportFrameCount) || options.exportFrameCount < 1) throw new RangeError("exportFrameCount must be a positive safe integer.");
  const durationSeconds = options.exportFrameCount / options.exportFps;
  const tracks = options.sources.map(({ track, buffer }) => {
    const frameSeconds = 1 / options.timelineFps;
    const trimStartSeconds = clamp(track.trimStart * frameSeconds, 0, buffer.duration);
    const authoredTrimEnd = track.trimEnd > track.trimStart ? track.trimEnd * frameSeconds : buffer.duration;
    const trimEndSeconds = clamp(authoredTrimEnd, trimStartSeconds, buffer.duration);
    const loopStartSeconds = clamp(track.loopStart * frameSeconds, trimStartSeconds, trimEndSeconds);
    const loopEndSeconds = clamp(track.loopEnd * frameSeconds, loopStartSeconds, trimEndSeconds);
    return {
      id: track.id,
      assetId: track.assetId,
      startSeconds: Math.max(0, track.startFrame * frameSeconds),
      durationSeconds: Math.max(0, Math.min(track.durationFrames * frameSeconds, durationSeconds - track.startFrame * frameSeconds)),
      trimStartSeconds,
      trimEndSeconds,
      fadeInSeconds: Math.max(0, track.fadeIn * frameSeconds),
      fadeOutSeconds: Math.max(0, track.fadeOut * frameSeconds),
      loopStartSeconds,
      loopEndSeconds,
      volume: Math.max(0, track.volume),
      pan: clamp(track.pan, -1, 1),
    };
  }).filter((track) => track.durationSeconds > 0 && track.trimEndSeconds > track.trimStartSeconds);
  return { durationSeconds, tracks };
}

export function renderTimelineAudioMix(options: {
  plan: TimelineAudioMixPlan;
  buffers: ReadonlyMap<string, DecodedTimelineAudio>;
  sampleRate?: number;
  createBuffer?(options: { length: number; numberOfChannels: number; sampleRate: number }): AudioBuffer;
}) {
  const sampleRate = options.sampleRate ?? Math.max(8_000, ...[...options.buffers.values()].map((buffer) => buffer.sampleRate));
  const length = Math.max(1, Math.ceil(options.plan.durationSeconds * sampleRate));
  const output = (options.createBuffer ?? ((settings) => new AudioBuffer(settings)))({ length, numberOfChannels: 2, sampleRate });
  const left = output.getChannelData(0);
  const right = output.getChannelData(1);
  for (const track of options.plan.tracks) {
    const source = options.buffers.get(track.id);
    if (!source) continue;
    mixTrack({ track, source, left, right, sampleRate });
  }
  let peak = 0;
  for (let index = 0; index < length; index += 1) peak = Math.max(peak, Math.abs(left[index] ?? 0), Math.abs(right[index] ?? 0));
  if (peak > 1) {
    const gain = 1 / peak;
    for (let index = 0; index < length; index += 1) { left[index] *= gain; right[index] *= gain; }
  }
  return { audio: output, peakBeforeNormalization: peak };
}

export async function decodeAndMixTimelineAudio(options: {
  tracks: readonly EditorAudioTrack[];
  timelineFps: number;
  exportFps: number;
  exportFrameCount: number;
  resolveBlob(track: EditorAudioTrack): Blob | undefined;
}) {
  const selected = selectTimelineAudioTracks(options.tracks);
  const missingTrackIds: string[] = [], mixedTrackIds: string[] = [];
  if (!selected.length) return { audio: undefined, missingTrackIds, mixedTrackIds };
  const context = new AudioContext();
  try {
    const decoded = await Promise.all(selected.map(async (track) => {
      const blob = options.resolveBlob(track);
      if (!blob) return undefined;
      return { track, buffer: await context.decodeAudioData(await blob.arrayBuffer()) };
    }));
    const sources = decoded.filter((source): source is { track: EditorAudioTrack; buffer: AudioBuffer } => source !== undefined);
    if (!sources.length) return { audio: undefined, missingTrackIds: selected.map((track) => track.id), mixedTrackIds };
    const plan = createTimelineAudioMixPlan({ sources, timelineFps: options.timelineFps, exportFps: options.exportFps, exportFrameCount: options.exportFrameCount });
    const buffers = new Map(sources.map((source) => [source.track.id, source.buffer]));
    const { audio, peakBeforeNormalization } = renderTimelineAudioMix({ plan, buffers });
    return {
      audio,
      missingTrackIds: selected.filter((track) => !buffers.has(track.id)).map((track) => track.id),
      mixedTrackIds: plan.tracks.map((track) => track.id),
      peakBeforeNormalization,
    };
  } finally { await context.close(); }
}

function mixTrack(options: { track: TimelineAudioMixTrack; source: DecodedTimelineAudio; left: Float32Array; right: Float32Array; sampleRate: number }) {
  const { track, source, left, right, sampleRate } = options;
  const start = Math.max(0, Math.round(track.startSeconds * sampleRate));
  const end = Math.min(left.length, Math.ceil((track.startSeconds + track.durationSeconds) * sampleRate));
  const looping = track.loopEndSeconds > track.loopStartSeconds;
  for (let outputIndex = start; outputIndex < end; outputIndex += 1) {
    const localSeconds = outputIndex / sampleRate - track.startSeconds;
    let sourceSeconds = track.trimStartSeconds + localSeconds;
    if (looping && sourceSeconds >= track.loopEndSeconds) sourceSeconds = track.loopStartSeconds + modulo(sourceSeconds - track.loopStartSeconds, track.loopEndSeconds - track.loopStartSeconds);
    if (sourceSeconds >= track.trimEndSeconds || sourceSeconds >= source.duration) continue;
    const fadeIn = track.fadeInSeconds > 0 ? Math.min(1, localSeconds / track.fadeInSeconds) : 1;
    const remaining = track.durationSeconds - localSeconds;
    const fadeOut = track.fadeOutSeconds > 0 ? Math.min(1, remaining / track.fadeOutSeconds) : 1;
    const gain = track.volume * Math.max(0, Math.min(fadeIn, fadeOut));
    if (source.numberOfChannels === 1) {
      const value = sampleChannel(source, 0, sourceSeconds) * gain;
      const angle = (track.pan + 1) * Math.PI / 4;
      left[outputIndex] += value * Math.cos(angle);
      right[outputIndex] += value * Math.sin(angle);
    } else {
      const leftGain = track.pan > 0 ? 1 - track.pan : 1;
      const rightGain = track.pan < 0 ? 1 + track.pan : 1;
      left[outputIndex] += sampleChannel(source, 0, sourceSeconds) * gain * leftGain;
      right[outputIndex] += sampleChannel(source, 1, sourceSeconds) * gain * rightGain;
    }
  }
}

function sampleChannel(buffer: DecodedTimelineAudio, channel: number, seconds: number) {
  const data = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
  const position = seconds * buffer.sampleRate;
  const first = Math.min(data.length - 1, Math.max(0, Math.floor(position)));
  const next = Math.min(data.length - 1, first + 1);
  const fraction = position - first;
  return (data[first] ?? 0) * (1 - fraction) + (data[next] ?? 0) * fraction;
}

function assertPositive(value: number, label: string) { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive.`); }

function modulo(value: number, modulus: number) { return ((value % modulus) + modulus) % modulus; }
