import type { AudioBufferLike } from './index.ts';

function node() {
  const connections: unknown[] = [];let count = 0;
  return { connections, disconnectCount: () => count, connect(destination: unknown) { connections.push(destination);return destination; }, disconnect() { connections.length = 0;count++; } };
}
function param(value = 1) {
  const events: Array<{ kind: string; value: number; time: number }> = [];
  return { value, events, cancelScheduledValues(time: number) { events.push({ kind: 'cancel', value: this.value, time }); }, setValueAtTime(next: number, time: number) { this.value = next;events.push({ kind: 'set', value: next, time }); }, linearRampToValueAtTime(next: number, time: number) { this.value = next;events.push({ kind: 'ramp', value: next, time }); } };
}
function source() {
  let audioBuffer: AudioBufferLike | null = null, ended: (() => void) | null = null;
  const value = { ...node(), get buffer() { return audioBuffer; }, set buffer(next: AudioBufferLike | null) { audioBuffer = next; }, loop: false, playbackRate: param(), get onended() { return ended; }, set onended(next: (() => void) | null) { ended = next; }, stops: 0, offset: 0,
    start(_when = 0, offset = 0) { value.offset = offset; }, stop() { value.stops++;value.onended?.(); } };
  return value;
}
function gain() { return { ...node(), gain: param() }; }
function filter() { return { ...node(), type: '', frequency: param(), Q: param() }; }
function compressor() { return { ...node(), threshold: param(), ratio: param(), knee: param(), attack: param(), release: param() }; }
function shaper() {
  let curve: Float32Array | null = null, oversample: 'none' | '2x' | '4x' = 'none';
  return { ...node(), get curve() { return curve; }, set curve(next: Float32Array | null) { curve = next; }, get oversample() { return oversample; }, set oversample(next: 'none' | '2x' | '4x') { oversample = next; } };
}
function convolver() {
  let audioBuffer: AudioBufferLike | null = null;
  return { ...node(), get buffer() { return audioBuffer; }, set buffer(next: AudioBufferLike | null) { audioBuffer = next; }, normalize: true };
}
function delay() { return { ...node(), delayTime: param(0) }; }
function buffer(_channels: number, length: number, sampleRate: number) {
  const samples = new Float32Array(length);
  return { duration: length / sampleRate, numberOfChannels: 1, length, sampleRate, getChannelData: (_channel: number) => samples };
}
function track<T>(values: T[], value: T) { values.push(value);return value; }

export function effectFixture() {
  let state = 'suspended';
  const gains: Array<ReturnType<typeof gain>> = [], sources: Array<ReturnType<typeof source>> = [];
  const filters: Array<ReturnType<typeof filter>> = [], compressors: Array<ReturnType<typeof compressor>> = [], shapers: Array<ReturnType<typeof shaper>> = [];
  const convolvers: Array<ReturnType<typeof convolver>> = [], delays: Array<ReturnType<typeof delay>> = [], buffers: Array<ReturnType<typeof buffer>> = [];
  const context = { currentTime: 10, sampleRate: 48000, get state() { return state; }, destination: node(), createGain: () => track(gains, gain()), createBufferSource: () => track(sources, source()),
    createBiquadFilter: () => track(filters, filter()), createDynamicsCompressor: () => track(compressors, compressor()), createWaveShaper: () => track(shapers, shaper()),
    createConvolver: () => track(convolvers, convolver()), createDelay: () => track(delays, delay()), createBuffer: (channels: number, length: number, rate: number) => track(buffers, buffer(channels, length, rate)),
    resume: async () => { state = 'running'; }, suspend: async () => { state = 'suspended'; }, close: async () => { state = 'closed'; },
    decodeAudioData: async () => buffer(1, 24000, 48000) };
  return { context, gains, sources, filters, compressors, shapers, convolvers, delays, buffers, setState: (value: string) => { state = value; } };
}
