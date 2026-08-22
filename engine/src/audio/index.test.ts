import { describe, expect, test } from "bun:test";
import {
  AudioEngineError,
  chooseAudioLoadPolicy,
  computeSpatialAudio,
  createAudioEngine,
  type AudioBufferLike,
  type AudioBufferSourceNodeLike,
  type AudioContextLike,
  type AudioNodeLike,
  type AudioParamLike,
  type GainNodeLike,
  type StereoPannerNodeLike,
} from "./index.ts";

class FakeParam implements AudioParamLike {
  value = 1;
  readonly events: Array<[string, number, number]> = [];
  cancelScheduledValues(time: number) { this.events.push(["cancel", this.value, time]); }
  setValueAtTime(value: number, time: number) { this.value = value; this.events.push(["set", value, time]); }
  linearRampToValueAtTime(value: number, time: number) { this.value = value; this.events.push(["ramp", value, time]); }
}

class FakeNode implements AudioNodeLike {
  readonly connections: any[] = [];
  disconnects = 0;
  connect(destination: any) { this.connections.push(destination); return destination; }
  disconnect() { this.connections.length = 0; this.disconnects += 1; }
}

class FakeGain extends FakeNode implements GainNodeLike { readonly gain = new FakeParam(); }
class FakePanner extends FakeNode implements StereoPannerNodeLike {
  readonly pan = new FakeParam();
  constructor() { super(); this.pan.value = 0; }
}

class FakeSource extends FakeNode implements AudioBufferSourceNodeLike {
  buffer: AudioBufferLike | null = null;
  loop = false;
  readonly playbackRate = new FakeParam();
  onended: (() => void) | null = null;
  starts: Array<[number | undefined, number | undefined, number | undefined]> = [];
  stops: Array<number | undefined> = [];
  start(when?: number, offset?: number, duration?: number) { this.starts.push([when, offset, duration]); }
  stop(when?: number) { this.stops.push(when); this.onended?.(); }
  end() { this.onended?.(); }
}

class FakeContext implements AudioContextLike {
  currentTime = 10;
  state = "suspended";
  readonly destination = new FakeNode();
  readonly gains: FakeGain[] = [];
  readonly panners: FakePanner[] = [];
  readonly sources: FakeSource[] = [];
  resumeError: unknown;
  decodeError: unknown;
  closed = false;
  decoded: AudioBufferLike = buffer(16, 2);
  readonly stateListeners = new Set<() => void>();
  createGain() { const value = new FakeGain(); this.gains.push(value); return value; }
  createStereoPanner() { const value = new FakePanner(); this.panners.push(value); return value; }
  createBufferSource() { const value = new FakeSource(); this.sources.push(value); return value; }
  async decodeAudioData() { if (this.decodeError) throw this.decodeError; return this.decoded; }
  async resume() { if (this.resumeError) throw this.resumeError; this.state = "running"; }
  async close() { this.closed = true; this.state = "closed"; }
  addEventListener(_type: "statechange", listener: () => void) { this.stateListeners.add(listener); }
  removeEventListener(_type: "statechange", listener: () => void) { this.stateListeners.delete(listener); }
  changeState(state: string) { this.state = state; for (const listener of this.stateListeners) listener(); }
}

function buffer(length: number, channels = 1): AudioBufferLike {
  return { duration: length / 48_000, length, numberOfChannels: channels, sampleRate: 48_000 };
}

describe("DOM-free audio decisions", () => {
  test("computes deterministic attenuation and listener-relative pan", () => {
    expect(computeSpatialAudio({ x: 0, y: 0 }, { x: 5, y: 0 }, { minDistance: 1, maxDistance: 9, panDistance: 10 })).toEqual({ distance: 5, gain: 0.5, pan: 0.5 });
    expect(computeSpatialAudio({ x: 0, y: 0, forwardX: 1, forwardY: 0 }, { x: 0, y: 5 }, { maxDistance: 10, panDistance: 5 })).toEqual({ distance: 5, gain: 5 / 9, pan: 1 });
    expect(computeSpatialAudio({ x: 0, y: 0 }, { x: 100, y: 0 }, { maxDistance: 10 })).toEqual({ distance: 100, gain: 0, pan: 1 });
    expect(() => computeSpatialAudio({ x: 0, y: 0 }, { x: 1, y: 1 }, { minDistance: 2, maxDistance: 2 })).toThrow("greater than");
  });

  test("chooses buffering versus streaming without browser state", () => {
    expect(chooseAudioLoadPolicy({ byteLength: 20_000_000, usage: "music" })).toEqual({ mode: "stream", reason: "large-file" });
    expect(chooseAudioLoadPolicy({ byteLength: 20_000_000, latencySensitive: true })).toEqual({ mode: "buffer", reason: "latency-sensitive" });
    expect(chooseAudioLoadPolicy({ byteLength: 1000, durationSeconds: 120 })).toEqual({ mode: "stream", reason: "long-duration" });
    expect(chooseAudioLoadPolicy({ byteLength: 1000, mode: "stream" })).toEqual({ mode: "stream", reason: "explicit" });
  });
});

describe("first-party Web Audio engine", () => {
  test("requires explicit unlock and reports playback failures", async () => {
    const context = new FakeContext();
    const diagnostics: string[] = [];
    const audio = createAudioEngine({ context, onDiagnostic: (value) => diagnostics.push(value.code) });
    audio.cacheBuffer("hit", buffer(8));
    expect(audio.playBuffer("hit")).toEqual(expect.objectContaining({ ok: false, code: "not-unlocked" }));
    await audio.unlock();
    expect(audio.isUnlocked()).toBe(true);
    expect(audio.playBuffer("missing")).toEqual(expect.objectContaining({ ok: false, code: "missing-buffer" }));
    expect(audio.playBuffer("hit").ok).toBe(true);
    expect(diagnostics).toContain("not-unlocked");
    expect(diagnostics).toContain("missing-buffer");
  });

  test("surfaces resume failures with a stable diagnostic code", async () => {
    const context = new FakeContext();
    context.resumeError = new Error("gesture denied");
    const audio = createAudioEngine({ context });
    await expect(audio.unlock()).rejects.toEqual(expect.objectContaining({ code: "resume-failed" }));
    expect(audio.diagnostics().at(-1)?.cause).toBe(context.resumeError);
  });

  test("creates master and named buses and schedules audio-clock fades", async () => {
    const context = new FakeContext();
    const audio = createAudioEngine({ context, buses: [] });
    const music = audio.createBus("music", 0.75);
    await audio.unlock();
    audio.fadeMaster(0.25, 2, 11);
    audio.fadeBus("music", 0.5, 3, 12);
    audio.muteBus("music", true, 16);
    audio.muteBus("music", false, 17);
    expect(context.gains[0].gain.events).toContainEqual(["ramp", 0.25, 13]);
    expect((music.node.gain as FakeParam).events).toContainEqual(["ramp", 0.5, 15]);
    expect((music.node.gain as FakeParam).events).toContainEqual(["set", 0, 16]);
    expect((music.node.gain as FakeParam).events).toContainEqual(["set", 0.5, 17]);
    expect(() => audio.fadeBus("missing", 1, 1)).toThrow(AudioEngineError);
  });

  test("bounds voices and deterministically steals lowest-priority oldest voice", async () => {
    const context = new FakeContext();
    const audio = createAudioEngine({ context, maxVoices: 2 });
    audio.cacheBuffer("a", buffer(8));
    audio.cacheBuffer("b", buffer(8));
    audio.cacheBuffer("c", buffer(8));
    await audio.unlock();
    const a = audio.playBuffer("a", { priority: 10 });
    const b = audio.playBuffer("b", { priority: 1 });
    const c = audio.playBuffer("c", { priority: 5 });
    expect(a.ok && a.voice.active).toBe(true);
    expect(b.ok && b.voice.active).toBe(false);
    expect(c.ok && c.voice.active).toBe(true);
    expect(audio.activeVoiceCount()).toBe(2);
    expect(context.sources).toHaveLength(3);
    expect(audio.diagnostics().filter((value) => value.code === "voice-stolen")).toHaveLength(1);
  });

  test("releases naturally ended voices and schedules per-voice gain and pan", async () => {
    const context = new FakeContext();
    const audio = createAudioEngine({ context, maxVoices: 1 });
    audio.cacheBuffer("hit", buffer(8));
    await audio.unlock();
    const result = audio.playBuffer("hit", { gain: 0.8, pan: -0.25, playbackRate: 1.5, when: 11, offset: 0.2 });
    if (!result.ok) throw new Error(result.message);
    result.voice.fadeTo(0, 2, 12);
    result.voice.setPan(0.5, 12);
    expect(context.sources[0].starts).toEqual([[11, 0.2, undefined]]);
    expect(context.gains.at(-1)?.gain.events).toContainEqual(["ramp", 0, 14]);
    expect(context.panners.at(-1)?.pan.events).toContainEqual(["set", 0.5, 12]);
    context.sources[0].end();
    expect(result.voice.active).toBe(false);
    expect(audio.activeVoiceCount()).toBe(0);
  });

  test("uses a bounded decoded-buffer LRU cache and diagnoses rejected entries", () => {
    const context = new FakeContext();
    const audio = createAudioEngine({ context, maxDecodedEntries: 2, maxDecodedBytes: 64 });
    expect(audio.cacheBuffer("a", buffer(4), 16)).toBe(true);
    expect(audio.cacheBuffer("b", buffer(4), 16)).toBe(true);
    expect(audio.cacheBuffer("c", buffer(4), 16)).toBe(true);
    expect(audio.cacheSnapshot()).toEqual({ entries: 2, bytes: 32, ids: ["b", "c"], maxEntries: 2, maxBytes: 64 });
    expect(audio.cacheBuffer("huge", buffer(100), 400)).toBe(false);
    expect(audio.diagnostics().map((value) => value.code)).toEqual(["cache-evicted", "cache-entry-too-large"]);
  });

  test("decodes through the injected context and retains explicit decode failures", async () => {
    const context = new FakeContext();
    const audio = createAudioEngine({ context });
    expect(await audio.decode("ok", new Uint8Array([1, 2, 3]))).toBe(context.decoded);
    expect(audio.hasBuffer("ok")).toBe(true);
    context.decodeError = new Error("bad bytes");
    await expect(audio.decode("bad", new Uint8Array([9]))).rejects.toEqual(expect.objectContaining({ code: "decode-failed" }));
    expect(audio.diagnostics().at(-1)?.cause).toBe(context.decodeError);
  });

  test("stops voices, clears state, disconnects nodes, and closes owned contexts", async () => {
    const context = new FakeContext();
    const audio = createAudioEngine({ context, closeContextOnDispose: true });
    audio.cacheBuffer("hit", buffer(8));
    await audio.unlock();
    audio.playBuffer("hit");
    await audio.dispose();
    expect(audio.activeVoiceCount()).toBe(0);
    expect(audio.cacheSnapshot().entries).toBe(0);
    expect(context.closed).toBe(true);
    expect(audio.playBuffer("hit")).toEqual(expect.objectContaining({ ok: false, code: "disposed" }));
    await audio.dispose();
  });

  test("recovers an interrupted context and rebuilds the static node graph", async () => {
    const context = new FakeContext();
    const states: string[] = [];
    const audio = createAudioEngine({ context, recoverOnStateChange: false, onContextStateChange: (state) => states.push(state) });
    audio.cacheBuffer("hit", buffer(8));
    await audio.unlock();
    expect(audio.playBuffer("hit").ok).toBe(true);
    const gainsBefore = context.gains.length;
    context.changeState("interrupted");
    expect(audio.isUnlocked()).toBe(false);
    await audio.recover();
    expect(audio.isUnlocked()).toBe(true);
    expect(audio.activeVoiceCount()).toBe(0);
    expect(context.gains.length).toBeGreaterThan(gainsBefore);
    expect(states).toEqual(["interrupted"]);
    expect(audio.diagnostics().map((item) => item.code)).toContain("context-recovered");
    await audio.dispose();
  });

  test("routes custom sources through an engine-owned bus", () => {
    const context = new FakeContext();
    const audio = createAudioEngine({ context, buses: ["synth"] });
    const destination = audio.withBus("synth", (receivedContext, bus) => {
      expect(receivedContext).toBe(context);
      return bus;
    });
    expect(context.gains.includes(destination as FakeGain)).toBe(true);
    expect(() => audio.withBus("missing", () => undefined)).toThrow("Audio bus does not exist");
  });
});
