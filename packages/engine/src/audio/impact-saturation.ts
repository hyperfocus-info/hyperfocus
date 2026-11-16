import type { AudioContextLike, AudioNodeLike } from './index.ts';

/** A bounded per-impact soft curve leaves other voices clean. */
export function createVoiceSaturation(options: { context: AudioContextLike; source: AudioNodeLike; destination: AudioNodeLike; amount: number; onFallback: (cause?: unknown) => void }) {
  const { context, source, destination, amount } = options;
  if (!Number.isFinite(amount) || amount < 0 || amount > 1) throw new RangeError('Voice saturation must be from zero to one.');
  if (amount === 0) { source.connect(destination);return () => {}; }
  if (!context.createWaveShaper) { options.onFallback();source.connect(destination);return () => {}; }
  let node: ReturnType<NonNullable<AudioContextLike['createWaveShaper']>> | undefined;
  try {
    node = context.createWaveShaper();const curve = new Float32Array(4097), drive = 10 ** (3 * amount / 20);
    for (let index = 0; index < curve.length; index++) {
      const sample = index * 2 / (curve.length - 1) - 1;
      curve[index] = sample * (1 - amount) + Math.tanh(sample * drive) / drive * amount;
    }
    node.curve = curve;node.oversample = '4x';source.connect(node);node.connect(destination);
    const owned = node;return () => owned.disconnect();
  } catch (cause) { node?.disconnect();options.onFallback(cause);source.connect(destination);return () => {}; }
}
