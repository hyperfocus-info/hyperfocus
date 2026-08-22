export type AudioDiagnosticCode =
  | "cache-entry-too-large"
  | "cache-evicted"
  | "context-create-failed"
  | "context-interrupted"
  | "context-recovered"
  | "context-recovery-failed"
  | "decode-failed"
  | "dispose-failed"
  | "disposed"
  | "invalid-bus"
  | "missing-buffer"
  | "not-unlocked"
  | "play-failed"
  | "resume-failed"
  | "stereo-panner-unavailable"
  | "unlock-not-running"
  | "voice-stolen";

export type AudioDiagnostic = {
  code: AudioDiagnosticCode;
  level: "info" | "warning" | "error";
  message: string;
  assetId?: string;
  bus?: string;
  voiceId?: number;
  cause?: unknown;
};

export class AudioEngineError extends Error {
  readonly code: AudioDiagnosticCode;
  readonly cause?: unknown;

  constructor(code: AudioDiagnosticCode, message: string, cause?: unknown) {
    super(message);
    this.name = "AudioEngineError";
    this.code = code;
    this.cause = cause;
  }
}

export type AudioParamLike = {
  value: number;
  cancelScheduledValues(time: number): unknown;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
};

export type AudioNodeLike = {
  connect(destination: any): any;
  disconnect(...args: any[]): any;
};

export type AudioBufferLike = {
  duration: number;
  length: number;
  numberOfChannels: number;
  sampleRate: number;
};

export type GainNodeLike = AudioNodeLike & { gain: AudioParamLike };
export type StereoPannerNodeLike = AudioNodeLike & { pan: AudioParamLike };
export type AudioBufferSourceNodeLike = AudioNodeLike & {
  buffer: AudioBufferLike | null;
  loop: boolean;
  playbackRate: AudioParamLike;
  onended: ((...args: any[]) => void) | null;
  start(when?: number, offset?: number, duration?: number): void;
  stop(when?: number): void;
};

/** Minimal injectable Web Audio surface. Browser AudioContext objects satisfy this contract. */
export type AudioContextLike = {
  readonly currentTime: number;
  readonly destination: AudioNodeLike;
  readonly state: string;
  createGain(): GainNodeLike;
  createBufferSource(): AudioBufferSourceNodeLike;
  createStereoPanner?(): StereoPannerNodeLike;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
  resume(): Promise<void>;
  close?(): Promise<void>;
  addEventListener?(type: "statechange", listener: () => void): void;
  removeEventListener?(type: "statechange", listener: () => void): void;
};

export type SpatialPoint = { x: number; y: number };
export type SpatialListener = SpatialPoint & { forwardX?: number; forwardY?: number };
export type SpatialAudioOptions = {
  minDistance?: number;
  maxDistance?: number;
  rolloff?: number;
  panDistance?: number;
  attenuation?: "linear" | "inverse";
};
export type SpatialAudioResult = { distance: number; gain: number; pan: number };

function finite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

function nonNegative(value: number, label: string) {
  finite(value, label);
  if (value < 0) throw new RangeError(`${label} must be non-negative`);
  return value;
}

function positive(value: number, label: string) {
  finite(value, label);
  if (value <= 0) throw new RangeError(`${label} must be positive`);
  return value;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Pure, deterministic 2D attenuation and stereo-pan math. */
export function computeSpatialAudio(
  listener: SpatialListener,
  source: SpatialPoint,
  options: SpatialAudioOptions = {},
): SpatialAudioResult {
  const dx = finite(source.x, "spatial source x") - finite(listener.x, "spatial listener x");
  const dy = finite(source.y, "spatial source y") - finite(listener.y, "spatial listener y");
  const minDistance = nonNegative(options.minDistance ?? 1, "spatial minDistance");
  const maxDistance = positive(options.maxDistance ?? 24, "spatial maxDistance");
  if (maxDistance <= minDistance) throw new RangeError("spatial maxDistance must be greater than minDistance");
  const rolloff = nonNegative(options.rolloff ?? 1, "spatial rolloff");
  const panDistance = positive(options.panDistance ?? maxDistance, "spatial panDistance");
  const distance = Math.hypot(dx, dy);
  let gain = 1;
  if (distance > minDistance) {
    if ((options.attenuation ?? "linear") === "inverse") {
      const reference = Math.max(minDistance, 0.000001);
      gain = reference / (reference + rolloff * (distance - minDistance));
    } else {
      gain = 1 - rolloff * (distance - minDistance) / (maxDistance - minDistance);
    }
  }
  if (distance >= maxDistance) gain = 0;

  const rawForwardX = finite(listener.forwardX ?? 0, "spatial listener forwardX");
  const rawForwardY = finite(listener.forwardY ?? -1, "spatial listener forwardY");
  const forwardLength = Math.hypot(rawForwardX, rawForwardY);
  if (forwardLength === 0) throw new RangeError("spatial listener forward vector must not be zero");
  const rightX = -rawForwardY / forwardLength;
  const rightY = rawForwardX / forwardLength;
  const pan = clamp((dx * rightX + dy * rightY) / panDistance, -1, 1);
  return { distance, gain: clamp(gain, 0, 1), pan };
}

export type AudioLoadPolicyInput = {
  byteLength: number;
  durationSeconds?: number;
  usage?: "sfx" | "music" | "voice" | "ambient";
  latencySensitive?: boolean;
  mode?: "auto" | "buffer" | "stream";
};

export type AudioLoadPolicyOptions = {
  maxBufferedBytes?: number;
  maxBufferedDurationSeconds?: number;
};

export type AudioLoadPolicyDecision = {
  mode: "buffer" | "stream";
  reason: "explicit" | "latency-sensitive" | "large-file" | "long-duration" | "music-default" | "small-asset";
};

/** Pure policy helper; it does not fetch, decode, or create media elements. */
export function chooseAudioLoadPolicy(
  input: AudioLoadPolicyInput,
  options: AudioLoadPolicyOptions = {},
): AudioLoadPolicyDecision {
  const byteLength = nonNegative(input.byteLength, "audio policy byteLength");
  if (!Number.isSafeInteger(byteLength)) throw new RangeError("audio policy byteLength must be a safe integer");
  const duration = input.durationSeconds === undefined ? undefined : nonNegative(input.durationSeconds, "audio policy durationSeconds");
  const maxBytes = nonNegative(options.maxBufferedBytes ?? 4 * 1024 * 1024, "audio policy maxBufferedBytes");
  const maxDuration = nonNegative(options.maxBufferedDurationSeconds ?? 45, "audio policy maxBufferedDurationSeconds");
  if (input.mode === "buffer" || input.mode === "stream") return { mode: input.mode, reason: "explicit" };
  if (input.latencySensitive || input.usage === "sfx") return { mode: "buffer", reason: "latency-sensitive" };
  if (byteLength > maxBytes) return { mode: "stream", reason: "large-file" };
  if (duration !== undefined && duration > maxDuration) return { mode: "stream", reason: "long-duration" };
  if (input.usage === "music") return { mode: "stream", reason: "music-default" };
  return { mode: "buffer", reason: "small-asset" };
}

export type AudioEngineOptions = {
  context?: AudioContextLike | AudioContext;
  contextFactory?: () => AudioContextLike | AudioContext;
  closeContextOnDispose?: boolean;
  buses?: readonly string[];
  maxVoices?: number;
  maxDecodedEntries?: number;
  maxDecodedBytes?: number;
  onDiagnostic?: (diagnostic: AudioDiagnostic) => void;
  /** Attempts to resume and rebuild the static graph after device/phone-call interruptions. */
  recoverOnStateChange?: boolean;
  onContextStateChange?: (state: string) => void;
  /** Rehydrate encoded assets after a closed context forces decoded buffers to be discarded. */
  onRecoveryRequired?: (reason: "context-closed") => void | Promise<void>;
};

export type PlayBufferOptions = {
  bus?: string;
  gain?: number;
  pan?: number;
  loop?: boolean;
  playbackRate?: number;
  priority?: number;
  when?: number;
  offset?: number;
  duration?: number;
};

export type AudioPlayFailureCode = "disposed" | "invalid-bus" | "missing-buffer" | "not-unlocked" | "play-failed";
export type AudioVoiceHandle = {
  readonly id: number;
  readonly assetId: string;
  readonly active: boolean;
  stop(when?: number): void;
  setGain(value: number, when?: number): void;
  fadeTo(value: number, duration: number, when?: number): void;
  setPan(value: number, when?: number): void;
};
export type AudioPlayResult =
  | { ok: true; voice: AudioVoiceHandle }
  | { ok: false; code: AudioPlayFailureCode; message: string };

export type AudioCacheSnapshot = {
  entries: number;
  bytes: number;
  ids: string[];
  maxEntries: number;
  maxBytes: number;
};

type BusState = { name: string; node: GainNodeLike; gain: number; muted: boolean };
type CacheEntry = { id: string; buffer: AudioBufferLike; bytes: number; used: number };
type VoiceSlot = {
  index: number;
  generation: number;
  voiceId: number;
  active: boolean;
  assetId: string;
  bus: string;
  priority: number;
  startedAt: number;
  sequence: number;
  gain: GainNodeLike;
  panner?: StereoPannerNodeLike;
  source?: AudioBufferSourceNodeLike;
};

function safeIntegerOption(value: number | undefined, fallback: number, label: string) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 0) throw new RangeError(`${label} must be a non-negative safe integer`);
  return resolved;
}

function validName(value: string, label: string) {
  if (!value || value.length > 128 || value === "master") throw new Error(`${label} must be 1–128 characters and not "master"`);
  return value;
}

function normalizedGain(value: number, label = "audio gain") {
  finite(value, label);
  if (value < 0 || value > 4) throw new RangeError(`${label} must be between 0 and 4`);
  return value;
}

function normalizedPan(value: number) {
  finite(value, "audio pan");
  if (value < -1 || value > 1) throw new RangeError("audio pan must be between -1 and 1");
  return value;
}

function scheduleValue(parameter: AudioParamLike, value: number, at: number, duration = 0) {
  const start = nonNegative(at, "audio schedule time");
  const fadeDuration = nonNegative(duration, "audio fade duration");
  parameter.cancelScheduledValues(start);
  parameter.setValueAtTime(parameter.value, start);
  if (fadeDuration === 0) parameter.setValueAtTime(value, start);
  else parameter.linearRampToValueAtTime(value, start + fadeDuration);
}

function decodedBufferBytes(buffer: AudioBufferLike) {
  if (!Number.isSafeInteger(buffer.length) || buffer.length < 0) throw new Error("decoded audio buffer length is invalid");
  if (!Number.isSafeInteger(buffer.numberOfChannels) || buffer.numberOfChannels <= 0) throw new Error("decoded audio channel count is invalid");
  const bytes = buffer.length * buffer.numberOfChannels * 4;
  if (!Number.isSafeInteger(bytes)) throw new Error("decoded audio byte size exceeds the safe integer range");
  return bytes;
}

export function createAudioEngine(options: AudioEngineOptions = {}) {
  const maxVoices = safeIntegerOption(options.maxVoices, 32, "audio maxVoices");
  const maxDecodedEntries = safeIntegerOption(options.maxDecodedEntries, 128, "audio maxDecodedEntries");
  const maxDecodedBytes = safeIntegerOption(options.maxDecodedBytes, 64 * 1024 * 1024, "audio maxDecodedBytes");
  const diagnostics: AudioDiagnostic[] = [];
  const buses = new Map<string, BusState>();
  const cache = new Map<string, CacheEntry>();
  const slots: VoiceSlot[] = [];
  let context = options.context as AudioContextLike | undefined;
  let master: BusState | undefined;
  let disposed = false;
  let unlocked = false;
  let cacheBytes = 0;
  let useCounter = 0;
  let voiceSequence = 0;
  let nextVoiceId = 1;
  let warnedPanner = false;
  let attachedContext: AudioContextLike | undefined;
  let recovering: Promise<void> | undefined;
  let recoveryPending = false;

  function diagnostic(value: AudioDiagnostic) {
    diagnostics.push(value);
    options.onDiagnostic?.(value);
    return value;
  }

  function failure(code: AudioPlayFailureCode, message: string, detail: Omit<AudioDiagnostic, "code" | "level" | "message"> = {}): AudioPlayResult {
    diagnostic({ code, level: "error", message, ...detail });
    return { ok: false, code, message };
  }

  function requireLive() {
    if (!disposed) return;
    const message = "Audio engine has been disposed.";
    diagnostic({ code: "disposed", level: "error", message });
    throw new AudioEngineError("disposed", message);
  }

  function defaultContextFactory() {
    const root = globalThis as unknown as {
      AudioContext?: new () => AudioContextLike;
      webkitAudioContext?: new () => AudioContextLike;
    };
    const Constructor = root.AudioContext ?? root.webkitAudioContext;
    if (!Constructor) throw new Error("This environment does not provide AudioContext.");
    return new Constructor();
  }

  function detachStateListener() {
    attachedContext?.removeEventListener?.("statechange", onContextStateChange);
    attachedContext = undefined;
  }

  function attachStateListener(audio: AudioContextLike) {
    if (attachedContext === audio) return;
    detachStateListener();
    audio.addEventListener?.("statechange", onContextStateChange);
    attachedContext = audio;
  }

  function ensureContext(): AudioContextLike {
    requireLive();
    if (context) {
      attachStateListener(context);
      return context;
    }
    try {
      const created = (options.contextFactory ?? defaultContextFactory)() as AudioContextLike;
      context = created;
      attachStateListener(created);
      return created;
    } catch (cause) {
      const message = "Could not create the Web Audio context.";
      diagnostic({ code: "context-create-failed", level: "error", message, cause });
      throw new AudioEngineError("context-create-failed", message, cause);
    }
  }

  function ensureGraph() {
    const audio = ensureContext();
    if (master) return audio;
    const node = audio.createGain();
    node.connect(audio.destination);
    master = { name: "master", node, gain: 1, muted: false };
    for (const name of options.buses ?? ["music", "sfx", "voice", "ambient"]) createBus(name);
    return audio;
  }

  function rebuildGraph(audio: AudioContextLike) {
    const busConfig = [...buses.values()].map((bus) => ({ name: bus.name, gain: bus.gain, muted: bus.muted }));
    const masterConfig = master ? { gain: master.gain, muted: master.muted } : { gain: 1, muted: false };
    for (const slot of slots) releaseSlot(slot, audio.currentTime);
    for (const slot of slots) {
      try { slot.gain.disconnect(); } catch { /* Best-effort cleanup. */ }
      try { slot.panner?.disconnect(); } catch { /* Best-effort cleanup. */ }
    }
    slots.length = 0;
    for (const bus of buses.values()) {
      try { bus.node.disconnect(); } catch { /* Best-effort cleanup. */ }
    }
    try { master?.node.disconnect(); } catch { /* Best-effort cleanup. */ }
    buses.clear();
    const masterNode = audio.createGain();
    masterNode.gain.value = masterConfig.muted ? 0 : masterConfig.gain;
    masterNode.connect(audio.destination);
    master = { name: "master", node: masterNode, ...masterConfig };
    for (const config of busConfig) {
      const node = audio.createGain();
      node.gain.value = config.muted ? 0 : config.gain;
      node.connect(masterNode);
      buses.set(config.name, { ...config, node });
    }
  }

  async function recover() {
    requireLive();
    if (recovering) return recovering;
    recovering = (async () => {
      let audio = ensureContext();
      if (audio.state === "closed") {
        detachStateListener();
        context = undefined;
        master = undefined;
        buses.clear();
        slots.length = 0;
        cache.clear();
        cacheBytes = 0;
        audio = ensureContext();
        await options.onRecoveryRequired?.("context-closed");
      }
      await audio.resume();
      if (audio.state !== "running") throw new Error(`Web Audio recovery did not enter running state (state: ${audio.state}).`);
      rebuildGraph(audio);
      recoveryPending = false;
      unlocked = true;
      diagnostic({ code: "context-recovered", level: "info", message: "Web Audio context and node graph recovered." });
    })().catch((cause) => {
      const message = "Web Audio context recovery failed; a user gesture may be required.";
      diagnostic({ code: "context-recovery-failed", level: "error", message, cause });
      throw new AudioEngineError("context-recovery-failed", message, cause);
    }).finally(() => {
      recovering = undefined;
    });
    return recovering;
  }

  function onContextStateChange() {
    const audio = context;
    if (!audio || disposed) return;
    options.onContextStateChange?.(audio.state);
    if (audio.state === "running") {
      if (recoveryPending) queueMicrotask(() => void recover().catch(() => undefined));
      return;
    }
    if (!unlocked || (audio.state !== "suspended" && audio.state !== "interrupted" && audio.state !== "closed")) return;
    unlocked = false;
    recoveryPending = true;
    diagnostic({ code: "context-interrupted", level: "warning", message: `Web Audio context was interrupted (state: ${audio.state}).` });
    if (options.recoverOnStateChange ?? true) void recover().catch(() => undefined);
  }

  function createBus(name: string, initialGain = 1) {
    requireLive();
    validName(name, "audio bus name");
    const existing = buses.get(name);
    if (existing) return existing;
    const audio = ensureContext();
    if (!master) {
      const node = audio.createGain();
      node.connect(audio.destination);
      master = { name: "master", node, gain: 1, muted: false };
    }
    const gain = normalizedGain(initialGain, `audio bus ${name} gain`);
    const node = audio.createGain();
    node.gain.value = gain;
    node.connect(master.node);
    const bus = { name, node, gain, muted: false };
    buses.set(name, bus);
    return bus;
  }

  function resolveBus(name: string) {
    ensureGraph();
    if (name === "master") return master!;
    return buses.get(name);
  }

  function controlBus(name: string, value: number, duration = 0, when?: number) {
    requireLive();
    const audio = ensureGraph();
    const bus = resolveBus(name);
    if (!bus) {
      const message = `Audio bus does not exist: ${name}`;
      diagnostic({ code: "invalid-bus", level: "error", message, bus: name });
      throw new AudioEngineError("invalid-bus", message);
    }
    bus.gain = normalizedGain(value, `audio bus ${name} gain`);
    scheduleValue(bus.node.gain, bus.muted ? 0 : bus.gain, Math.max(audio.currentTime, when ?? audio.currentTime), duration);
  }

  function muteBus(name: string, muted = true, when?: number) {
    requireLive();
    const audio = ensureGraph();
    const bus = resolveBus(name);
    if (!bus) {
      const message = `Audio bus does not exist: ${name}`;
      diagnostic({ code: "invalid-bus", level: "error", message, bus: name });
      throw new AudioEngineError("invalid-bus", message);
    }
    bus.muted = muted;
    scheduleValue(bus.node.gain, muted ? 0 : bus.gain, Math.max(audio.currentTime, when ?? audio.currentTime));
  }

  function evictCache() {
    while (cache.size > maxDecodedEntries || cacheBytes > maxDecodedBytes) {
      let oldest: CacheEntry | undefined;
      for (const entry of cache.values()) {
        if (!oldest || entry.used < oldest.used || (entry.used === oldest.used && entry.id < oldest.id)) oldest = entry;
      }
      if (!oldest) break;
      cache.delete(oldest.id);
      cacheBytes -= oldest.bytes;
      diagnostic({ code: "cache-evicted", level: "info", message: `Evicted decoded audio buffer ${oldest.id}.`, assetId: oldest.id });
    }
  }

  function cacheBuffer(id: string, buffer: AudioBufferLike, bytes = decodedBufferBytes(buffer)) {
    requireLive();
    if (!id || id.length > 512) throw new Error("audio asset id must be 1–512 characters");
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new RangeError("decoded audio cache bytes must be a non-negative safe integer");
    if (bytes > maxDecodedBytes || maxDecodedEntries === 0) {
      diagnostic({ code: "cache-entry-too-large", level: "warning", message: `Decoded audio buffer ${id} does not fit the configured cache.`, assetId: id });
      return false;
    }
    const previous = cache.get(id);
    if (previous) {
      cache.delete(id);
      cacheBytes -= previous.bytes;
    }
    useCounter += 1;
    cache.set(id, { id, buffer, bytes, used: useCounter });
    cacheBytes += bytes;
    evictCache();
    return cache.has(id);
  }

  function getBuffer(id: string) {
    const entry = cache.get(id);
    if (!entry) return undefined;
    useCounter += 1;
    entry.used = useCounter;
    return entry.buffer;
  }

  async function decode(id: string, encoded: ArrayBuffer | Uint8Array) {
    requireLive();
    const audio = ensureContext();
    const data = encoded instanceof Uint8Array ? new Uint8Array(encoded).buffer : encoded.slice(0);
    try {
      const buffer = await audio.decodeAudioData(data);
      cacheBuffer(id, buffer);
      return buffer;
    } catch (cause) {
      const message = `Could not decode audio asset ${id}.`;
      diagnostic({ code: "decode-failed", level: "error", message, assetId: id, cause });
      throw new AudioEngineError("decode-failed", message, cause);
    }
  }

  function makeSlot(audio: AudioContextLike) {
    const gain = audio.createGain();
    const panner = audio.createStereoPanner?.();
    if (panner) gain.connect(panner);
    else if (!warnedPanner) {
      warnedPanner = true;
      diagnostic({ code: "stereo-panner-unavailable", level: "warning", message: "StereoPannerNode is unavailable; voices will play centered." });
    }
    const slot: VoiceSlot = {
      index: slots.length,
      generation: 0,
      voiceId: 0,
      active: false,
      assetId: "",
      bus: "",
      priority: 0,
      startedAt: 0,
      sequence: 0,
      gain,
      panner,
    };
    slots.push(slot);
    return slot;
  }

  function releaseSlot(slot: VoiceSlot, stopAt?: number) {
    if (!slot.active) return;
    slot.active = false;
    const source = slot.source;
    slot.source = undefined;
    if (source) {
      source.onended = null;
      if (stopAt !== undefined) {
        try { source.stop(stopAt); } catch { /* An already-ended source is still released. */ }
      }
      try { source.disconnect(); } catch { /* Best-effort cleanup for browser and fake nodes. */ }
    }
    const output = slot.panner ?? slot.gain;
    try { output.disconnect(); } catch { /* Best-effort cleanup. */ }
  }

  function stopSlot(slot: VoiceSlot, at: number, now: number) {
    if (!slot.active) return;
    if (at <= now || !slot.source) {
      releaseSlot(slot, at);
      return;
    }
    try {
      slot.source.stop(at);
    } catch {
      releaseSlot(slot, now);
    }
  }

  function stealCandidate() {
    let selected: VoiceSlot | undefined;
    for (const slot of slots) {
      if (!selected || slot.priority < selected.priority
        || (slot.priority === selected.priority && slot.startedAt < selected.startedAt)
        || (slot.priority === selected.priority && slot.startedAt === selected.startedAt && slot.sequence < selected.sequence)) selected = slot;
    }
    return selected;
  }

  function voiceHandle(slot: VoiceSlot, generation: number): AudioVoiceHandle {
    const isCurrent = () => slot.active && slot.generation === generation;
    return {
      id: slot.voiceId,
      assetId: slot.assetId,
      get active() { return isCurrent(); },
      stop(when) {
        if (!isCurrent()) return;
        const audio = ensureContext();
        stopSlot(slot, Math.max(audio.currentTime, when ?? audio.currentTime), audio.currentTime);
      },
      setGain(value, when) {
        if (!isCurrent()) return;
        const audio = ensureContext();
        scheduleValue(slot.gain.gain, normalizedGain(value, "voice gain"), Math.max(audio.currentTime, when ?? audio.currentTime));
      },
      fadeTo(value, duration, when) {
        if (!isCurrent()) return;
        const audio = ensureContext();
        scheduleValue(slot.gain.gain, normalizedGain(value, "voice gain"), Math.max(audio.currentTime, when ?? audio.currentTime), duration);
      },
      setPan(value, when) {
        if (!isCurrent() || !slot.panner) return;
        const audio = ensureContext();
        scheduleValue(slot.panner.pan, normalizedPan(value), Math.max(audio.currentTime, when ?? audio.currentTime));
      },
    };
  }

  function playBuffer(assetId: string, playOptions: PlayBufferOptions = {}): AudioPlayResult {
    if (disposed) return failure("disposed", "Audio engine has been disposed.", { assetId });
    const audio = ensureGraph();
    if (!unlocked || audio.state !== "running") return failure("not-unlocked", "Audio playback requires unlock() from a user gesture.", { assetId });
    const buffer = getBuffer(assetId);
    if (!buffer) return failure("missing-buffer", `Decoded audio buffer is not cached: ${assetId}`, { assetId });
    const busName = playOptions.bus ?? "sfx";
    const bus = resolveBus(busName);
    if (!bus) return failure("invalid-bus", `Audio bus does not exist: ${busName}`, { assetId, bus: busName });
    if (maxVoices === 0) return failure("play-failed", "Audio voice capacity is zero.", { assetId, bus: busName });
    try {
      let slot = slots.find((candidate) => !candidate.active);
      if (!slot && slots.length < maxVoices) slot = makeSlot(audio);
      if (!slot) slot = stealCandidate();
      if (!slot) return failure("play-failed", "No audio voice slot is available.", { assetId, bus: busName });
      if (slot.active) {
        diagnostic({ code: "voice-stolen", level: "info", message: `Stole voice ${slot.voiceId} playing ${slot.assetId}.`, assetId: slot.assetId, bus: slot.bus, voiceId: slot.voiceId });
        releaseSlot(slot, audio.currentTime);
      }
      const output = slot.panner ?? slot.gain;
      output.connect(bus.node);
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.loop = playOptions.loop ?? false;
      source.playbackRate.value = positive(playOptions.playbackRate ?? 1, "audio playbackRate");
      source.connect(slot.gain);
      slot.gain.gain.value = normalizedGain(playOptions.gain ?? 1, "voice gain");
      if (slot.panner) slot.panner.pan.value = normalizedPan(playOptions.pan ?? 0);
      slot.generation += 1;
      slot.voiceId = nextVoiceId;
      nextVoiceId += 1;
      slot.active = true;
      slot.assetId = assetId;
      slot.bus = busName;
      slot.priority = finite(playOptions.priority ?? 0, "audio voice priority");
      slot.startedAt = Math.max(audio.currentTime, playOptions.when ?? audio.currentTime);
      voiceSequence += 1;
      slot.sequence = voiceSequence;
      slot.source = source;
      const generation = slot.generation;
      source.onended = () => { if (slot!.generation === generation) releaseSlot(slot!); };
      const offset = nonNegative(playOptions.offset ?? 0, "audio offset");
      if (playOptions.duration === undefined) source.start(slot.startedAt, offset);
      else source.start(slot.startedAt, offset, positive(playOptions.duration, "audio duration"));
      return { ok: true, voice: voiceHandle(slot, generation) };
    } catch (cause) {
      return failure("play-failed", `Could not start audio asset ${assetId}.`, { assetId, bus: busName, cause });
    }
  }

  async function unlock() {
    requireLive();
    const audio = ensureGraph();
    try {
      await audio.resume();
    } catch (cause) {
      const message = "Web Audio resume failed; call unlock() directly from a user gesture.";
      diagnostic({ code: "resume-failed", level: "error", message, cause });
      throw new AudioEngineError("resume-failed", message, cause);
    }
    if (audio.state !== "running") {
      const message = `Web Audio did not enter the running state after resume (state: ${audio.state}).`;
      diagnostic({ code: "unlock-not-running", level: "error", message });
      throw new AudioEngineError("unlock-not-running", message);
    }
    unlocked = true;
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    detachStateListener();
    unlocked = false;
    const audio = context;
    const now = audio?.currentTime ?? 0;
    for (const slot of slots) releaseSlot(slot, now);
    for (const slot of slots) {
      try { slot.gain.disconnect(); } catch { /* Best-effort cleanup. */ }
      try { slot.panner?.disconnect(); } catch { /* Best-effort cleanup. */ }
    }
    for (const bus of buses.values()) {
      try { bus.node.disconnect(); } catch { /* Best-effort cleanup. */ }
    }
    try { master?.node.disconnect(); } catch { /* Best-effort cleanup. */ }
    buses.clear();
    cache.clear();
    cacheBytes = 0;
    if (audio?.close && (options.closeContextOnDispose ?? options.context === undefined)) {
      try {
        await audio.close();
      } catch (cause) {
        diagnostic({ code: "dispose-failed", level: "warning", message: "Web Audio context close failed during disposal.", cause });
      }
    }
  }

  return {
    unlock,
    recover,
    decode,
    cacheBuffer,
    hasBuffer(id: string) { return cache.has(id); },
    removeBuffer(id: string) {
      const entry = cache.get(id);
      if (!entry) return false;
      cache.delete(id);
      cacheBytes -= entry.bytes;
      return true;
    },
    clearDecodedCache() { cache.clear(); cacheBytes = 0; },
    cacheSnapshot(): AudioCacheSnapshot {
      return { entries: cache.size, bytes: cacheBytes, ids: [...cache.keys()], maxEntries: maxDecodedEntries, maxBytes: maxDecodedBytes };
    },
    createBus,
    /** Runs custom source scheduling against an engine-owned bus and lifecycle. */
    withBus<T>(name: string, operation: (context: AudioContextLike, destination: AudioNodeLike) => T): T {
      requireLive();
      const audio = ensureGraph();
      const bus = resolveBus(name);
      if (!bus) {
        const message = `Audio bus does not exist: ${name}`;
        diagnostic({ code: "invalid-bus", level: "error", message, bus: name });
        throw new AudioEngineError("invalid-bus", message);
      }
      return operation(audio, bus.node);
    },
    setMasterGain(value: number, when?: number) { controlBus("master", value, 0, when); },
    fadeMaster(value: number, duration: number, when?: number) { controlBus("master", value, duration, when); },
    muteMaster(muted = true, when?: number) { muteBus("master", muted, when); },
    setBusGain(name: string, value: number, when?: number) { controlBus(name, value, 0, when); },
    fadeBus(name: string, value: number, duration: number, when?: number) { controlBus(name, value, duration, when); },
    muteBus,
    playBuffer,
    stopAll(when?: number) {
      if (disposed) return;
      const audio = ensureContext();
      const at = Math.max(audio.currentTime, when ?? audio.currentTime);
      for (const slot of slots) stopSlot(slot, at, audio.currentTime);
    },
    activeVoiceCount() { return slots.reduce((count, slot) => count + (slot.active ? 1 : 0), 0); },
    diagnostics() { return diagnostics.slice(); },
    clearDiagnostics() { diagnostics.length = 0; },
    isUnlocked() { return unlocked && context?.state === "running"; },
    isDisposed() { return disposed; },
    context() { return context; },
    dispose,
  };
}

export type AudioEngine = ReturnType<typeof createAudioEngine>;
