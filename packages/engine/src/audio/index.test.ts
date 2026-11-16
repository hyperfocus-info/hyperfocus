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
    async suspend() { state = "suspended"; for (const listener of stateListeners) listener(); },
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
    expect(computeSpatialAudio({ x: 0, y: 0, forwardX: 1, forwardY: 0 }, { x: 0, y: 5 }, { maxDistance: 10, panDistance: 5 })).toEqual({ distance: 5, gain: 0.5555555555555556, pan: 1 });
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
  test('low-priority incoming sounds preserve music and critical voices at capacity', async () => {
    const context = createFakeContext(), audio = createAudioEngine({ context, maxVoices: 2 });
    for (const id of ['music', 'critical', 'step']) audio.cacheBuffer(id, buffer(8));
    await audio.unlock();const music = audio.playBuffer('music', { priority: 4, bus: 'music', loop: true }), critical = audio.playBuffer('critical', { priority: 8 });
    expect(audio.playBuffer('step', { priority: 1 })).toMatchObject({ ok: false, code: 'voice-capacity' });
    expect(music.ok && music.voice.active).toBe(true);expect(critical.ok && critical.voice.active).toBe(true);expect(context.sources).toHaveLength(2);
    expect(audio.diagnostics()).toEqual([]);await audio.dispose();
  });
  test('the final limiter routes summed buses, rebuilds, and disposes its owned node', async () => {
    const base = createFakeContext(), limiters: Array<ReturnType<typeof createFakeLimiter>> = [];
    function createFakeLimiter() { return Object.assign(createFakeNode(), { threshold: createFakeParam(), knee: createFakeParam(), ratio: createFakeParam(), attack: createFakeParam(), release: createFakeParam() }); }
    const context = Object.assign(base, { createDynamicsCompressor() { const node = createFakeLimiter();limiters.push(node);return node; } });
    const audio = createAudioEngine({ context });await audio.unlock();
    const limiter = limiters[0]!;expect(base.gains[0]!.connections).toEqual([limiter]);expect(limiter.connections).toEqual([base.destination]);
    expect([limiter.threshold.value, limiter.knee.value, limiter.ratio.value, limiter.attack.value, limiter.release.value]).toEqual([-3, 3, 20, .003, .12]);
    await audio.recover();expect(limiter.disconnects).toBe(1);expect(limiters).toHaveLength(2);await audio.dispose();expect(limiters[1]!.disconnects).toBe(1);
  });
  test('compressor creation failure falls back to a connected ordinary graph', async () => {
    const base = createFakeContext(), context = Object.assign(base, { createDynamicsCompressor() { throw new Error('unsupported'); } });
    const audio = createAudioEngine({ context });await audio.unlock();expect(base.gains[0]!.connections).toEqual([base.destination]);
    audio.cacheBuffer('hit', buffer(8));expect(audio.playBuffer('hit').ok).toBe(true);expect(audio.diagnostics()[0]?.level).toBe('warning');await audio.dispose();
  });
  test('transient peak guard preserves quiet samples and owns cleanup across recovery', async () => {
    const base = createFakeContext(), guards: Array<ReturnType<typeof createGuard>> = [], limiters: Array<ReturnType<typeof createLimiter>> = [];
    function createGuard(): ReturnType<typeof createFakeNode> & { curve: Float32Array | null; oversample: 'none' | '2x' | '4x' } { return Object.assign(createFakeNode(), { curve: null, oversample: 'none' as const }); }
    function createLimiter() { return Object.assign(createFakeNode(), { threshold: createFakeParam(), knee: createFakeParam(), ratio: createFakeParam(), attack: createFakeParam(), release: createFakeParam() }); }
    const context = Object.assign(base, { createDynamicsCompressor() { const node = createLimiter();limiters.push(node);return node; }, createWaveShaper() { const node = createGuard();guards.push(node);return node; } });
    const audio = createAudioEngine({ context });await audio.unlock();
    const guard = guards[0]!, curve = guard.curve!;
    expect(base.gains[0]!.connections).toEqual([limiters[0]]);expect(limiters[0]!.connections).toEqual([guard]);expect(guard.connections).toEqual([base.destination]);
    expect(guard.oversample).toBe('4x');expect(curve[2048]).toBe(0);expect(curve[2560]).toBe(.25);expect(curve[1024]).toBe(-.5);
    expect(Math.max(...curve)).toBeCloseTo(0.7079457843841379, 6);expect(Math.min(...curve)).toBeCloseTo(-(0.7079457843841379), 6);
    await audio.recover();expect(guard.disconnects).toBe(1);expect(limiters[0]!.disconnects).toBe(1);
    await audio.dispose();expect(guards[1]!.disconnects).toBe(1);expect(limiters[1]!.disconnects).toBe(1);
  });
  test("intentional pause preserves voices and does not trigger interruption recovery", async () => {
    const context = createFakeContext(), audio = createAudioEngine({ context });
    await audio.unlock(); audio.cacheBuffer("narration", buffer(480_000));
    expect(audio.playBuffer("narration").ok).toBe(true);
    const source = context.sources[0]!;
    await audio.setPaused({ paused: true });
    await audio.unlock();
    expect(context.state).toBe("suspended");
    expect(source.stops).toEqual([]);
    expect(audio.activeVoiceCount()).toBe(1);
    expect(audio.diagnostics().some((entry) => entry.code === "context-interrupted")).toBe(false);
    await audio.setPaused({ paused: false });
    expect(context.state).toBe("running");
    expect(context.sources).toHaveLength(1);
    expect(source.starts).toHaveLength(1);
    expect(source.stops).toEqual([]);
    await audio.dispose();
  });
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

  test("fades hold in-flight automation and capture fallback gain before cancellation", async () => {
    const context = createFakeContext(), audio = createAudioEngine({ context, outputLimiter: false });
    const held = audio.createBus("held"), fallback = audio.createBus("fallback");
    const holdEvents: number[] = [];
    held.node.gain.cancelAndHoldAtTime = at => { holdEvents.push(at);held.node.gain.value = .6; };
    held.node.gain.cancelScheduledValues = () => { throw new Error("Hold-capable parameter must hold automation."); };
    audio.fadeBus("held", 0, 2, 11);
    expect(holdEvents).toEqual([11]);
    expect(fakeParamEvents(held.node.gain)).toEqual([["ramp", 0, 13]]);
    fallback.node.gain.value = .4;
    fallback.node.gain.cancelScheduledValues = () => { fallback.node.gain.value = 1; };
    audio.fadeBus("fallback", 0, 2, 12);
    expect(fakeParamEvents(fallback.node.gain)).toEqual([["set", .4, 12], ["ramp", 0, 14]]);
    await audio.dispose();
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
