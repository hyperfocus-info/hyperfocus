import { describe, expect, test } from "bun:test";
import {
  chooseAudioLoadPolicy,
  computeSpatialAudio,
  createAudioEngine,
  type AudioBufferLike,
  type AudioParamLike,
} from "./index.ts";

function createFakeParam(initialValue = 1) {
  let value = initialValue;
  const events: Array<[string, number, number]> = [];
  return {
    get value() { return value; },
    set value(next: number) { value = next; },
    events,
    cancelScheduledValues(time: number) { events.push(["cancel", value, time]); },
    setValueAtTime(next: number, time: number) { value = next; events.push(["set", next, time]); },
    linearRampToValueAtTime(next: number, time: number) { value = next; events.push(["ramp", next, time]); },
  };
}

function createFakeNode() {
  const connections: any[] = [];
  let disconnects = 0;
  return {
    connections,
    get disconnects() { return disconnects; },
    connect(destination: any) { connections.push(destination); return destination; },
    disconnect() { connections.length = 0; disconnects += 1; },
  };
}

function createFakeGain() { return { ...createFakeNode(), gain: createFakeParam() }; }
function createFakePanner() { return { ...createFakeNode(), pan: createFakeParam(0) }; }

function createFakeSource() {
  const starts: Array<[number | undefined, number | undefined, number | undefined]> = [];
  const stops: Array<number | undefined> = [];
  let audioBuffer: AudioBufferLike | null = null;
  let onended: (() => void) | null = null;
  return {
    ...createFakeNode(),
    get buffer() { return audioBuffer; },
    set buffer(value: AudioBufferLike | null) { audioBuffer = value; },
    loop: false,
    playbackRate: createFakeParam(),
    get onended() { return onended; },
    set onended(value: (() => void) | null) { onended = value; },
    starts,
    stops,
    start(when?: number, offset?: number, duration?: number) { starts.push([when, offset, duration]); },
    stop(when?: number) { stops.push(when); onended?.(); },
    end() { onended?.(); },
  };
}

type FakeGain = ReturnType<typeof createFakeGain>;
type FakePanner = ReturnType<typeof createFakePanner>;
type FakeSource = ReturnType<typeof createFakeSource>;

function createFakeContext() {
  let state = "suspended";
  let resumeError: unknown;
  let decodeError: unknown;
  let closed = false;
  let decoded = buffer(16, 2);
  const gains: FakeGain[] = [];
  const panners: FakePanner[] = [];
  const sources: FakeSource[] = [];
  const stateListeners = new Set<() => void>();
  return {
    currentTime: 10,
    get state() { return state; },
    destination: createFakeNode(),
    gains,
    panners,
    sources,
    get resumeError() { return resumeError; },
    set resumeError(value: unknown) { resumeError = value; },
    get decodeError() { return decodeError; },
    set decodeError(value: unknown) { decodeError = value; },
    get closed() { return closed; },
    get decoded() { return decoded; },
    set decoded(value: AudioBufferLike) { decoded = value; },
    stateListeners,
    createGain() { const value = createFakeGain(); gains.push(value); return value; },
    createStereoPanner() { const value = createFakePanner(); panners.push(value); return value; },
    createBufferSource() { const value = createFakeSource(); sources.push(value); return value; },
    async decodeAudioData() { if (decodeError) throw decodeError; return decoded; },
    async resume() { if (resumeError) throw resumeError; state = "running"; },
    async close() { closed = true; state = "closed"; },
    addEventListener(_type: "statechange", listener: () => void) { stateListeners.add(listener); },
    removeEventListener(_type: "statechange", listener: () => void) { stateListeners.delete(listener); },
    changeState(next: string) { state = next; for (const listener of stateListeners) listener(); },
  };
}

function fakeParamEvents(param: AudioParamLike) {
  const events = Reflect.get(param, "events");
  if (!Array.isArray(events)) throw new TypeError("Fake audio parameter is missing event history.");
  return events;
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
    const context = createFakeContext();
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
    const context = createFakeContext();
    context.resumeError = new Error("gesture denied");
    const audio = createAudioEngine({ context });
    await expect(audio.unlock()).rejects.toEqual(expect.objectContaining({ code: "resume-failed" }));
    expect(audio.diagnostics().at(-1)?.cause).toBe(context.resumeError);
  });

  test("creates master and named buses and schedules audio-clock fades", async () => {
    const context = createFakeContext();
    const audio = createAudioEngine({ context, buses: [] });
    const music = audio.createBus("music", 0.75);
    await audio.unlock();
    audio.fadeMaster(0.25, 2, 11);
    audio.fadeBus("music", 0.5, 3, 12);
    audio.muteBus("music", true, 16);
    audio.muteBus("music", false, 17);
    expect(context.gains[0].gain.events).toContainEqual(["ramp", 0.25, 13]);
    expect(fakeParamEvents(music.node.gain)).toContainEqual(["ramp", 0.5, 15]);
    expect(fakeParamEvents(music.node.gain)).toContainEqual(["set", 0, 16]);
    expect(fakeParamEvents(music.node.gain)).toContainEqual(["set", 0.5, 17]);
    expect(() => audio.fadeBus("missing", 1, 1)).toThrow("Audio bus does not exist: missing");
  });

  test("bounds voices and deterministically steals lowest-priority oldest voice", async () => {
    const context = createFakeContext();
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
    const context = createFakeContext();
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
    const context = createFakeContext();
    const audio = createAudioEngine({ context, maxDecodedEntries: 2, maxDecodedBytes: 64 });
    expect(audio.cacheBuffer("a", buffer(4), 16)).toBe(true);
    expect(audio.cacheBuffer("b", buffer(4), 16)).toBe(true);
    expect(audio.cacheBuffer("c", buffer(4), 16)).toBe(true);
    expect(audio.cacheSnapshot()).toEqual({ entries: 2, bytes: 32, ids: ["b", "c"], maxEntries: 2, maxBytes: 64 });
    expect(audio.cacheBuffer("huge", buffer(100), 400)).toBe(false);
    expect(audio.diagnostics().map((value) => value.code)).toEqual(["cache-evicted", "cache-entry-too-large"]);
  });

  test("decodes through the injected context and retains explicit decode failures", async () => {
    const context = createFakeContext();
    const audio = createAudioEngine({ context });
    expect(await audio.decode("ok", new Uint8Array([1, 2, 3]))).toBe(context.decoded);
    expect(audio.hasBuffer("ok")).toBe(true);
    context.decodeError = new Error("bad bytes");
    await expect(audio.decode("bad", new Uint8Array([9]))).rejects.toEqual(expect.objectContaining({ code: "decode-failed" }));
    expect(audio.diagnostics().at(-1)?.cause).toBe(context.decodeError);
  });

  test("stops voices, clears state, disconnects nodes, and closes owned contexts", async () => {
    const context = createFakeContext();
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
    const context = createFakeContext();
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
    const context = createFakeContext();
    const audio = createAudioEngine({ context, buses: ["synth"] });
    const destination = audio.withBus("synth", (receivedContext, bus) => {
      expect(receivedContext).toBe(context);
      return bus;
    });
    expect(context.gains.some((gain) => gain === destination)).toBe(true);
    expect(() => audio.withBus("missing", () => undefined)).toThrow("Audio bus does not exist");
  });
});
