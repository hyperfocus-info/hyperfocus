export type ExperimentalCapabilityName =
  | "sharedArrayBuffer"
  | "audioWorklet"
  | "paintWorklet"
  | "webCodecs"
  | "webGpu"
  | "offscreenCanvas"
  | "localSpeechRecognition"
  | "localSpeechSynthesis";

export interface ExperimentalCapability {
  readonly supported: boolean;
  readonly reason?: string;
}

export type ExperimentalCapabilityReport = Readonly<Record<ExperimentalCapabilityName, ExperimentalCapability>>;

export interface ExperimentalCapabilityScope {
  readonly SharedArrayBuffer?: unknown;
  readonly crossOriginIsolated?: boolean;
  readonly AudioWorkletNode?: unknown;
  readonly CSS?: object;
  readonly VideoEncoder?: unknown;
  readonly VideoDecoder?: unknown;
  readonly navigator?: object;
  readonly OffscreenCanvas?: unknown;
  readonly SpeechRecognition?: unknown;
  readonly webkitSpeechRecognition?: unknown;
  readonly speechSynthesis?: unknown;
}

function capability(supported: boolean, reason: string): ExperimentalCapability {
  return supported ? { supported: true } : { supported: false, reason };
}

/** Returns an honest, side-effect-free capability report for opt-in browser experiments. */
export function inspectExperimentalCapabilities(
  scope: ExperimentalCapabilityScope = globalThis
): ExperimentalCapabilityReport {
  const hasSharedConstructor = typeof scope.SharedArrayBuffer === "function";
  return Object.freeze({
    sharedArrayBuffer: capability(
      hasSharedConstructor && scope.crossOriginIsolated === true,
      hasSharedConstructor ? "cross-origin isolation is required" : "SharedArrayBuffer is unavailable"
    ),
    audioWorklet: capability(typeof scope.AudioWorkletNode === "function", "AudioWorklet is unavailable"),
    paintWorklet: capability(Boolean(scope.CSS && Reflect.get(scope.CSS, "paintWorklet")), "CSS Paint Worklet is unavailable"),
    webCodecs: capability(
      typeof scope.VideoEncoder === "function" && typeof scope.VideoDecoder === "function",
      "WebCodecs encoder/decoder are unavailable"
    ),
    webGpu: capability(Boolean(scope.navigator && Reflect.get(scope.navigator, "gpu")), "WebGPU is unavailable"),
    offscreenCanvas: capability(typeof scope.OffscreenCanvas === "function", "OffscreenCanvas is unavailable"),
    localSpeechRecognition: capability(
      typeof scope.SpeechRecognition === "function" || typeof scope.webkitSpeechRecognition === "function",
      "local speech recognition is unavailable"
    ),
    localSpeechSynthesis: capability(Boolean(scope.speechSynthesis), "speech synthesis is unavailable")
  });
}
