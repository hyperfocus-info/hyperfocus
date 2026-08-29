import { describe, expect, test } from "bun:test";
import type { EditorAudioTrack } from "@hyperfocus/engine/project";
import { createTimelineAudioMixPlan, decodeAndMixTimelineAudio, renderTimelineAudioMix, selectTimelineAudioTracks, type DecodedTimelineAudio } from "./timeline-audio-mix.ts";

const track = (values: Partial<EditorAudioTrack> & Pick<EditorAudioTrack, "id">): EditorAudioTrack => ({
  name: values.id, assetId: values.id, startFrame: 0, durationFrames: 8, trimStart: 0, trimEnd: 8,
  fadeIn: 0, fadeOut: 0, loopStart: 0, loopEnd: 0, volume: 1, pan: 0, muted: false, solo: false, ...values,
});

describe("timeline MP4 audio mixing", () => {
  test("honors mute and gives solo tracks exclusive playback", () => {
    const tracks = [track({ id: "bed" }), track({ id: "bite", solo: true }), track({ id: "muted", solo: true, muted: true })];
    expect(selectTimelineAudioTracks(tracks).map((entry) => entry.id)).toEqual(["bite"]);
  });

  test("plans start, trim, loop, fades, volume, pan, and export clipping in timeline seconds", () => {
    const source = buffer([[1, 2, 3, 4, 5, 6, 7, 8]], 4);
    const plan = createTimelineAudioMixPlan({
      sources: [{ track: track({ id: "bite", startFrame: 2, durationFrames: 12, trimStart: 1, trimEnd: 7, fadeIn: 2, fadeOut: 3, loopStart: 3, loopEnd: 6, volume: 0.75, pan: -0.4 }), buffer: source }],
      timelineFps: 4, exportFps: 8, exportFrameCount: 8,
    });
    expect(plan.durationSeconds).toBe(1);
    expect(plan.tracks[0]).toMatchObject({ startSeconds: 0.5, durationSeconds: 0.5, trimStartSeconds: 0.25, trimEndSeconds: 1.75, fadeInSeconds: 0.5, fadeOutSeconds: 0.75, loopStartSeconds: 0.75, loopEndSeconds: 1.5, volume: 0.75, pan: -0.4 });
  });

  test("mixes delayed mono SFX with fades and pan beside a looping stereo bed", () => {
    const bed = buffer([[0.25, 0.5], [0.5, 0.25]], 2);
    const bite = buffer([[1, 1]], 2);
    const sources = [
      { track: track({ id: "bed", durationFrames: 4, trimEnd: 2, loopStart: 0, loopEnd: 2 }), buffer: bed },
      { track: track({ id: "bite", startFrame: 1, durationFrames: 2, trimEnd: 2, fadeIn: 1, pan: 1 }), buffer: bite },
    ];
    const plan = createTimelineAudioMixPlan({ sources, timelineFps: 2, exportFps: 2, exportFrameCount: 4 });
    const result = renderTimelineAudioMix({ plan, buffers: new Map(sources.map((source) => [source.track.id, source.buffer])), sampleRate: 2, createBuffer: fakeOutput });
    expect(result.peakBeforeNormalization).toBe(1.5);
    expect([...result.audio.getChannelData(0)].map(round)).toEqual([0.167, 0.333, 0.167, 0.333]);
    expect([...result.audio.getChannelData(1)].map(round)).toEqual([0.333, 0.167, 1, 0.167]);
  });

  test("normalizes deterministic multi-track peaks instead of hard clipping", () => {
    const loud = buffer([[1, 1], [1, 1]], 2);
    const sources = [{ track: track({ id: "a", durationFrames: 2, trimEnd: 2 }), buffer: loud }, { track: track({ id: "b", durationFrames: 2, trimEnd: 2 }), buffer: loud }];
    const plan = createTimelineAudioMixPlan({ sources, timelineFps: 2, exportFps: 2, exportFrameCount: 2 });
    const result = renderTimelineAudioMix({ plan, buffers: new Map(sources.map((source) => [source.track.id, source.buffer])), sampleRate: 2, createBuffer: fakeOutput });
    expect(result.peakBeforeNormalization).toBe(2);
    expect([...result.audio.getChannelData(0)]).toEqual([1, 1]);
    expect([...result.audio.getChannelData(1)]).toEqual([1, 1]);
  });

  test("decodes available browser blobs, reports missing SFX, and closes its audio context", async () => {
    const previousContext = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");
    const previousBuffer = Object.getOwnPropertyDescriptor(globalThis, "AudioBuffer");
    let closed = false;
    class FakeAudioBuffer {
      readonly length: number; readonly numberOfChannels: number; readonly sampleRate: number; readonly duration: number; readonly channels: Float32Array[];
      constructor(options: { length: number; numberOfChannels: number; sampleRate: number }) { this.length = options.length; this.numberOfChannels = options.numberOfChannels; this.sampleRate = options.sampleRate; this.duration = options.length / options.sampleRate; this.channels = Array.from({ length: options.numberOfChannels }, () => new Float32Array(options.length)); }
      getChannelData(channel: number) { return this.channels[channel]; }
    }
    class FakeAudioContext {
      async decodeAudioData(bytes: ArrayBuffer) { const result = new FakeAudioBuffer({ length: 4, numberOfChannels: 1, sampleRate: 4 }); result.channels[0].fill(new Uint8Array(bytes)[0] / 10); return result as AudioBuffer; }
      async close() { closed = true; }
    }
    Object.defineProperty(globalThis, "AudioBuffer", { configurable: true, value: FakeAudioBuffer });
    Object.defineProperty(globalThis, "AudioContext", { configurable: true, value: FakeAudioContext });
    try {
      const tracks = [track({ id: "score", durationFrames: 4, trimEnd: 4 }), track({ id: "bite", durationFrames: 4, trimEnd: 4 })];
      const result = await decodeAndMixTimelineAudio({ tracks, timelineFps: 4, exportFps: 4, exportFrameCount: 4, resolveBlob: (entry) => entry.id === "score" ? new Blob([Uint8Array.of(5)]) : undefined });
      expect(result.mixedTrackIds).toEqual(["score"]);
      expect(result.missingTrackIds).toEqual(["bite"]);
      expect(result.audio?.duration).toBe(1);
      expect(result.audio?.sampleRate).toBe(8_000);
      expect(closed).toBe(true);
    } finally {
      restoreGlobal("AudioContext", previousContext);
      restoreGlobal("AudioBuffer", previousBuffer);
    }
  });
});

function buffer(channels: number[][], sampleRate: number): DecodedTimelineAudio {
  const data = channels.map((channel) => Float32Array.from(channel));
  return { duration: data[0].length / sampleRate, length: data[0].length, numberOfChannels: data.length, sampleRate, getChannelData: (channel) => data[channel] };
}
function fakeOutput(options: { length: number; numberOfChannels: number; sampleRate: number }) {
  const channels = Array.from({ length: options.numberOfChannels }, () => new Float32Array(options.length));
  return { duration: options.length / options.sampleRate, length: options.length, numberOfChannels: options.numberOfChannels, sampleRate: options.sampleRate, getChannelData: (channel: number) => channels[channel] } as AudioBuffer;
}
function round(value: number) { return Math.round(value * 1000) / 1000; }
function restoreGlobal(key: "AudioContext" | "AudioBuffer", descriptor?: PropertyDescriptor) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
