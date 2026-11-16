import { createAudioEngine, type AudioBufferLike } from './index.ts';

function param(value = 1) {
  const events: Array<{ kind: string; value: number; time: number }> = [];
  return { value, events, cancelScheduledValues(time: number) { events.push({ kind: 'cancel', value: this.value, time }); }, setValueAtTime(next: number, time: number) { this.value = next;events.push({ kind: 'set', value: next, time }); }, linearRampToValueAtTime(next: number, time: number) { this.value = next;events.push({ kind: 'ramp', value: next, time }); } };
}
function node() { const connections: unknown[] = [];return { connections, disconnected: false, connect(value: unknown) { connections.push(value);return value; }, disconnect() { connections.length = 0;this.disconnected = true; } }; }

export async function schedulingFixture(nativeEffects = false, maxVoices = 8) {
  let time = 10, state = 'suspended';
  const gains: Array<ReturnType<typeof gain>> = [], sources: Array<ReturnType<typeof source>> = [], effects: Array<ReturnType<typeof node>> = [], oscillators: Array<ReturnType<typeof oscillator>> = [];
  const delays: Array<ReturnType<typeof delay>> = [], filters: Array<ReturnType<typeof filter>> = [];
  function gain() { return { ...node(), gain: param() }; }
  function delay() { return { ...node(), delayTime: param(0) }; }
  function filter() { return { ...node(), type: 'lowpass', frequency: param(350) }; }
  function source() {
    let buffer: AudioBufferLike | null = null, onended: (() => void) | null = null;
    const starts: number[] = [], stops: number[] = [];
    const value = { ...node(), get buffer() { return buffer; }, set buffer(next: AudioBufferLike | null) { buffer = next; }, loop: false, playbackRate: param(), get onended() { return onended; }, set onended(next: (() => void) | null) { onended = next; }, starts, stops, offset: 0, duration: 0,
      start(when = time, offset = 0, duration?: number) { this.starts.push(when);this.offset = offset;this.duration = duration ?? this.buffer?.duration ?? 0; },
      stop(when = time) { this.stops.push(when);if (when <= time) this.onended?.(); }, end() { this.onended?.(); },
    };return value;
  }
  function oscillator() { const starts: number[] = [], stops: number[] = [];return { ...node(), type: 'sine', frequency: param(), starts, stops, start(when = time) { this.starts.push(when); }, stop(when = time) { this.stops.push(when); } }; }
  const context = { get currentTime() { return time; }, get state() { return state; }, destination: node(), createGain() { const value = gain();gains.push(value);return value; }, createBufferSource() { const value = source();sources.push(value);return value; },
    async decodeAudioData(): Promise<AudioBufferLike> { return { duration: 10, length: 480000, numberOfChannels: 1, sampleRate: 48000 }; }, async resume() { state = 'running'; }, async suspend() { state = 'suspended'; },
    ...(nativeEffects ? { createDelay() { const value = delay();delays.push(value);effects.push(value);return value; }, createBiquadFilter() { const value = filter();filters.push(value);effects.push(value);return value; }, createOscillator() { const value = oscillator();oscillators.push(value);effects.push(value);return value; } } : {}),
  };
  const engine = createAudioEngine({ context, maxVoices, maxDecodedEntries: 4, outputLimiter: false });await engine.unlock();
  function cache(assetId: string, duration = 20) { engine.cacheBuffer(assetId, { duration, length: duration * 48000, numberOfChannels: 1, sampleRate: 48000 }); }
  return { engine, context, gains, sources, effects, oscillators, delays, filters, cache, at(value: number) { time = value; }, async flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); } };
}
