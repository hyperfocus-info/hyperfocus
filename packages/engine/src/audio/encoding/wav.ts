/** Encode bounded finite mono PCM as a standard little-endian, 16-bit WAV. */
export function encodeMonoPcmWav({ samples, sampleRate }: { samples: Float32Array; sampleRate: number }) {
  if (!Number.isInteger(sampleRate) || sampleRate < 16_000 || sampleRate > 48_000) throw new Error('Voice sample rate must be an integer from 16000 to 48000.');
  if (!(samples instanceof Float32Array) || samples.length > sampleRate * 30) throw new Error('Voice PCM must be a Float32Array of at most 30 seconds.');
  for (const value of samples) if (!Number.isFinite(value)) throw new Error('Voice PCM contains a non-finite sample.');
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, text: string) => { for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index)); };
  writeText(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(44 + index * 2, Math.round(sample * (sample < 0 ? 32_768 : 32_767)), true);
  }
  return bytes;
}
