import type { AudioContextLike, AudioNodeLike, AudioParamLike } from './index.ts';

const PERIOD = .1, DELAY = .035, DEPTH = .05;

/** Two delay ramps preserve tempo; complementary windows hide each ramp's reset. */
export function createNativePitch(options: { context: AudioContextLike; input: AudioNodeLike; output: AudioNodeLike }) {
  const { context, input, output } = options;
  if (!context.createBuffer || !context.createDelay) throw new Error('Pitch processing requires native buffers and delays.');
  const nodes: AudioNodeLike[] = [], stops: Array<() => void> = [], depths: AudioParamLike[] = [];
  const rates: AudioParamLike[] = [];
  let direction = 1, lastCents: number | undefined;
  function own<T extends AudioNodeLike>(node: T) { nodes.push(node);return node; }
  function dispose() {
    for (const stop of stops) { try { stop(); } catch { /* Already stopped. */ } }
    for (const node of nodes) { try { node.disconnect(); } catch { /* Owned cleanup. */ } }
  }
  try {
    const dry = own(context.createGain()), wet = own(context.createGain());
    input.connect(dry);dry.connect(output);wet.connect(output);wet.gain.value = 0;
    const sampleRate = context.sampleRate ?? 48000, length = Math.round(PERIOD * sampleRate);
    const ramp = context.createBuffer(1, length, sampleRate), window = context.createBuffer(1, length, sampleRate);
    const rampSamples = ramp.getChannelData(0), windowSamples = window.getChannelData(0);
    for (let index = 0; index < length; index++) {
      const phase = index / length;
      rampSamples[index] = phase - .5;windowSamples[index] = Math.sin(Math.PI * phase) ** 2;
    }
    const at = context.currentTime;
    for (const offset of [0, PERIOD / 2]) {
      const delay = own(context.createDelay(.12)), gate = own(context.createGain()), depth = own(context.createGain());
      delay.delayTime.value = DELAY;gate.gain.value = 0;depth.gain.value = DEPTH;depths.push(depth.gain);
      input.connect(delay);delay.connect(gate);gate.connect(wet);
      for (const [buffer, destination] of [[ramp, depth], [window, gate.gain]] as const) {
        const source = own(context.createBufferSource());source.buffer = buffer;source.loop = true;
        source.playbackRate.value = 0;rates.push(source.playbackRate);
        source.connect(destination);stops.push(() => source.stop());source.start(at, offset);
      }
      depth.connect(delay.delayTime);
    }
    function set(cents: number, seconds: number) {
      if (cents === lastCents) return;
      lastCents = cents;
      const now = context.currentTime, difference = 1 - 2 ** (cents / 1200), nextDirection = Math.sign(difference) || direction;
      // Fixed grain depth and variable control rate produce sustained pitch shift.
      // A fixed fast loop with tiny depth instead leaves the original dominant frequency.
      if (nextDirection !== direction) for (const parameter of depths) rampParameter(parameter, nextDirection * DEPTH, now, seconds);
      direction = nextDirection;
      for (const parameter of rates) rampParameter(parameter, Math.abs(difference) * PERIOD / DEPTH, now, seconds);
      rampParameter(dry.gain, cents === 0 ? 1 : 0, now, seconds);
      rampParameter(wet.gain, cents === 0 ? 0 : 1, now, seconds);
    }
    return { set, dispose };
  } catch (cause) { dispose();throw cause; }
}

export function rampParameter(parameter: AudioParamLike, value: number, at: number, seconds: number) {
  if (parameter.cancelAndHoldAtTime) parameter.cancelAndHoldAtTime(at);
  else { const current = parameter.value;parameter.cancelScheduledValues(at);parameter.setValueAtTime(current, at); }
  if (seconds === 0) parameter.setValueAtTime(value, at);
  else parameter.linearRampToValueAtTime(value, at + seconds);
}
