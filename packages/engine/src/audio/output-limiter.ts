import type { AudioContextLike, AudioNodeLike, AudioParamLike } from './index.ts';

export type DynamicsCompressorNodeLike = AudioNodeLike & {
  threshold: AudioParamLike; knee: AudioParamLike; ratio: AudioParamLike;
  attack: AudioParamLike; release: AudioParamLike;
};
export type WaveShaperNodeLike = AudioNodeLike & { curve: Float32Array | null; oversample: 'none' | '2x' | '4x' };

/** Last-resort transient ceiling; ordinary signals below -3 dB pass unchanged. */
export function createPeakGuardCurve() {
  const curve = new Float32Array(4097), ceiling = 0.7079457843841379;
  for (let index = 0; index < curve.length; index++) curve[index] = Math.max(-ceiling, Math.min(ceiling, index * 2 / (curve.length - 1) - 1));
  return curve;
}

/** Final mix protection. Hosts without a compressor retain the ordinary gain graph. */
export function connectAudioOutput(options: { context: AudioContextLike; source: AudioNodeLike; enabled: boolean; onError: (cause: unknown) => void }) {
  if (options.enabled && options.context.createDynamicsCompressor) {
    let limiter: DynamicsCompressorNodeLike | undefined, guard: WaveShaperNodeLike | undefined;
    try {
      limiter = options.context.createDynamicsCompressor();
      limiter.threshold.value = -3;limiter.knee.value = 3;limiter.ratio.value = 20;
      limiter.attack.value = .003;limiter.release.value = .12;
      if (options.context.createWaveShaper) {
        guard = options.context.createWaveShaper();guard.curve = createPeakGuardCurve();guard.oversample = '4x';
        limiter.connect(guard);guard.connect(options.context.destination);options.source.connect(limiter);
        const ownedLimiter = limiter, ownedGuard = guard;
        return { connect: (destination: AudioNodeLike) => ownedGuard.connect(destination), disconnect() { ownedLimiter.disconnect();ownedGuard.disconnect(); } };
      }
      limiter.connect(options.context.destination);options.source.connect(limiter);
      return limiter;
    } catch (cause) {
      try { guard?.disconnect();limiter?.disconnect();options.source.disconnect(); } catch { /* Partial graph cleanup. */ }
      options.onError(cause);
    }
  }
  options.source.connect(options.context.destination);
  return undefined;
}
