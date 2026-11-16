import type { AudioBufferLike, AudioContextLike, AudioFilterNodeLike, AudioNodeLike } from './index.ts';
import { createNativePitch, rampParameter } from './native-pitch.ts';

export type AudioBusEffectsOptions = {
  bus: string;
  compressor?: { threshold?: number; ratio?: number; attack?: number; release?: number; knee?: number; ceilingDb?: number };
  reverb?: { assetId: string; sendGain?: number; highpassHz?: number; lowpassHz?: number };
  highpassHz?: number; lowpassHz?: number; pitchCents?: number;
};
export type AudioBusReactiveOptions = { bus: string; highpassHz?: number; lowpassHz?: number; pitchCents?: number; fadeSeconds?: number };

function bounded(value: number | undefined, fallback: number, minimum: number, maximum: number, name: string) {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < minimum || resolved > maximum) throw new RangeError(`${name} must be from ${minimum} to ${maximum}.`);
  return resolved;
}
export function validateBusReactive(options: AudioBusReactiveOptions) {
  if (options.highpassHz !== undefined) bounded(options.highpassHz, 25, 10, 20000, 'Bus highpass');
  if (options.lowpassHz !== undefined) bounded(options.lowpassHz, 20000, 10, 20000, 'Bus lowpass');
  if (options.pitchCents !== undefined) bounded(options.pitchCents, 0, -100, 100, 'Bus pitch cents');
  bounded(options.fadeSeconds, .15, 0, 10, 'Bus reactive fade');
}
export function validateBusEffects(options: AudioBusEffectsOptions) {
  validateBusReactive(options);
  if (options.compressor) {
    const c = options.compressor;
    bounded(c.threshold, -18, -100, 0, 'Compressor threshold');bounded(c.ratio, 2, 1, 20, 'Compressor ratio');
    bounded(c.knee, 6, 0, 40, 'Compressor knee');bounded(c.attack, .02, 0, 1, 'Compressor attack');bounded(c.release, .18, 0, 1, 'Compressor release');
    if (c.ceilingDb !== undefined) bounded(c.ceilingDb, -3, -30, 0, 'Compressor ceiling');
  }
  if (options.reverb) {
    if (!options.reverb.assetId || options.reverb.assetId.length > 512) throw new RangeError('Reverb needs a valid decoded asset ID.');
    bounded(options.reverb.sendGain, .08, 0, 1, 'Reverb send');
    bounded(options.reverb.highpassHz, 180, 10, 20000, 'Reverb highpass');bounded(options.reverb.lowpassHz, 6000, 10, 20000, 'Reverb lowpass');
    if ((options.reverb.highpassHz ?? 180) >= (options.reverb.lowpassHz ?? 6000)) throw new RangeError('Reverb highpass must be below lowpass.');
  }
}

/** All dry signal and convolution tails finish at the user's bus fader. */
export function createBusEffects(options: {
  context: AudioContextLike; output: AudioNodeLike; effects: AudioBusEffectsOptions;
  impulse?: AudioBufferLike; onFallback: (message: string, cause?: unknown) => void;
}) {
  const { context, output, effects, onFallback } = options;
  const input = context.createGain(), nodes: AudioNodeLike[] = [input], disposals: Array<() => void> = [];
  let highpass: AudioFilterNodeLike | undefined, lowpass: AudioFilterNodeLike | undefined, pitch: ReturnType<typeof createNativePitch> | undefined, compressorEnabled = false, ceilingEnabled = false, reverbEnabled = false;
  function own<T extends AudioNodeLike>(node: T) { nodes.push(node);return node; }
  function dispose() {
    for (const cleanup of disposals) cleanup();
    for (const node of nodes) { try { node.disconnect(); } catch { /* Owned cleanup. */ } }
  }
  let dry: AudioNodeLike = input;
  try {
    if (effects.compressor) {
      if (!context.createDynamicsCompressor) onFallback('Bus compressor unavailable; retaining dry playback.');
      else {
        const compressor = own(context.createDynamicsCompressor()), c = effects.compressor;
        compressor.threshold.value = c.threshold ?? -18;compressor.ratio.value = c.ratio ?? 2;compressor.knee.value = c.knee ?? 6;
        compressor.attack.value = c.attack ?? .02;compressor.release.value = c.release ?? .18;dry.connect(compressor);dry = compressor;
        compressorEnabled = true;
      }
      if (effects.compressor.ceilingDb !== undefined) {
        if (!context.createWaveShaper) onFallback('Bus peak ceiling unavailable; retaining dry playback.');
        else {
          // Oversampling reconstruction can overshoot the curve; leave 0.1 dB headroom.
          const guard = own(context.createWaveShaper()), ceiling = 10 ** ((effects.compressor.ceilingDb - .1) / 20), curve = new Float32Array(4097);
          for (let index = 0; index < curve.length; index++) curve[index] = Math.max(-ceiling, Math.min(ceiling, index * 2 / (curve.length - 1) - 1));
          guard.curve = curve;guard.oversample = '4x';dry.connect(guard);dry = guard;
          ceilingEnabled = true;
        }
      }
    }
    for (const [type, frequency] of [['highpass', effects.highpassHz], ['lowpass', effects.lowpassHz]] as const) {
      if (frequency === undefined) continue;
      if (!context.createBiquadFilter) onFallback(`Bus ${type} unavailable; retaining dry playback.`);
      else {
        const filter = own(context.createBiquadFilter());filter.type = type;filter.frequency.value = frequency;
        if (type === 'highpass') highpass = filter;else lowpass = filter;
        if (filter.Q) filter.Q.value = .707;dry.connect(filter);dry = filter;
      }
    }
    if (effects.pitchCents !== undefined) {
      const pitched = own(context.createGain());
      try { pitch = createNativePitch({ context, input: dry, output: pitched });pitch.set(effects.pitchCents, 0);disposals.push(pitch.dispose);dry = pitched; }
      catch (cause) { onFallback('Bus pitch unavailable; retaining dry playback.', cause); }
    }
    dry.connect(output);
    if (effects.reverb) {
      if (!context.createConvolver || !options.impulse || options.impulse.duration > 4 || ![1, 2].includes(options.impulse.numberOfChannels)) onFallback('Bus reverb unavailable; provide native convolution and a mono/stereo decoded impulse of at most four seconds.');
      else {
        const send = own(context.createGain()), convolver = own(context.createConvolver());
        send.gain.value = effects.reverb.sendGain ?? .08;convolver.normalize = false;convolver.buffer = options.impulse;
        dry.connect(send);let wet: AudioNodeLike = send;
        if (context.createBiquadFilter) {
          for (const [type, frequency] of [['highpass', effects.reverb.highpassHz ?? 180], ['lowpass', effects.reverb.lowpassHz ?? 6000]] as const) {
            const filter = own(context.createBiquadFilter());filter.type = type;filter.frequency.value = frequency;wet.connect(filter);wet = filter;
          }
        }
        wet.connect(convolver);convolver.connect(output);
        reverbEnabled = true;
      }
    }
    return { input, dispose, impulse: options.impulse, snapshot: () => ({ compressor: compressorEnabled, ceiling: ceilingEnabled, highpass: !!highpass, lowpass: !!lowpass, pitch: !!pitch, reverb: reverbEnabled, ownedNodes: nodes.length + (pitch ? 12 : 0), pitchDelaySeconds: pitch ? .035 : 0 }), setReactive(value: AudioBusReactiveOptions) {
      const fade = value.fadeSeconds ?? .15;
      if (value.highpassHz !== undefined && highpass) rampParameter(highpass.frequency, value.highpassHz, context.currentTime, fade);
      if (value.lowpassHz !== undefined && lowpass) rampParameter(lowpass.frequency, value.lowpassHz, context.currentTime, fade);
      if (value.pitchCents !== undefined) pitch?.set(value.pitchCents, fade);
    } };
  } catch (cause) {
    dispose();const fallback = context.createGain();fallback.connect(output);
    onFallback('Bus effects failed; retaining dry playback.', cause);
    return { input: fallback, impulse: options.impulse, dispose: () => fallback.disconnect(), snapshot: () => ({ compressor: false, ceiling: false, highpass: false, lowpass: false, pitch: false, reverb: false, ownedNodes: 1, pitchDelaySeconds: 0 }), setReactive(_value: AudioBusReactiveOptions) {} };
  }
}
export type AudioBusEffectsGraph = ReturnType<typeof createBusEffects>;

type BusEffectsState = { name: string; node: AudioNodeLike; gain: number; muted: boolean; effects?: AudioBusEffectsOptions; graph?: AudioBusEffectsGraph };
export function createBusEffectControls(options: {
  requireLive: () => void; context: () => AudioContextLike; bus: (name: string) => BusEffectsState | undefined;
  buses: () => Iterable<BusEffectsState>; impulse: (assetId: string) => AudioBufferLike | undefined;
  reconnect: (bus: string, input: AudioNodeLike) => void; onFallback: (bus: string, message: string, cause?: unknown) => void;
}) {
  return {
    configureBusEffects(value: AudioBusEffectsOptions) {
      options.requireLive();validateBusEffects(value);
      const context = options.context(), bus = options.bus(value.bus);
      if (!bus || value.bus === 'master') throw new Error(`Audio effects require a named bus: ${value.bus}`);
      const effects = structuredClone(value), previous = bus.graph;
      const graph = createBusEffects({ context, output: bus.node, effects, impulse: options.impulse(value.reverb?.assetId ?? ''),
        onFallback: (message, cause) => options.onFallback(value.bus, message, cause) });
      bus.effects = effects;bus.graph = graph;options.reconnect(value.bus, graph.input);previous?.dispose();
    },
    setBusReactive(value: AudioBusReactiveOptions) {
      options.requireLive();validateBusReactive(value);
      const bus = options.bus(value.bus);
      if (!bus) throw new Error(`Audio bus does not exist: ${value.bus}`);
      if (!bus.effects || !bus.graph) return;
      if (value.highpassHz !== undefined) bus.effects.highpassHz = value.highpassHz;
      if (value.lowpassHz !== undefined) bus.effects.lowpassHz = value.lowpassHz;
      if (value.pitchCents !== undefined) bus.effects.pitchCents = value.pitchCents;
      bus.graph.setReactive(value);
    },
    busEffectsSnapshot() {
      return [...options.buses()].filter(bus => bus.effects).map(bus => ({ bus: bus.name, gain: bus.gain, muted: bus.muted, effects: structuredClone(bus.effects), ...bus.graph?.snapshot() }));
    },
  };
}
