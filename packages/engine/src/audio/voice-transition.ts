import type { AudioContextLike, AudioNodeLike, GainNodeLike } from './index.ts';
import type { AudioPlaylistTransition } from './playlist-contracts.ts';

/** Temporary native nodes feed the existing voice gain/bus/limiter, never a parallel destination. */
export function createVoiceTransition(options: { context: AudioContextLike; source: AudioNodeLike; gain: GainNodeLike; transition: AudioPlaylistTransition; when: number; bpm?: number }) {
  const { context, source, gain, transition, when } = options, duration = transition.durationSeconds ?? 2;
  const nodes: AudioNodeLike[] = [], stops: Array<() => void> = [];
  let style = transition.style ?? 'crossfade';
  const supported = supportedAudioTransitions(context);
  if (style === 'varied' || !supported.includes(style)) style = 'crossfade';
  function cleanup() { for (const stop of stops) { try { stop(); } catch { /* Already stopped. */ } }for (const node of nodes) { try { node.disconnect(); } catch { /* Owned best-effort cleanup. */ } } }
  function node<T extends AudioNodeLike>(value: T) { nodes.push(value);return value; }
  try {
    if (style === 'filter' && context.createBiquadFilter) {
      const filter = node(context.createBiquadFilter());filter.type = 'lowpass';
      filter.frequency.setValueAtTime(18000, context.currentTime);filter.frequency.setValueAtTime(18000, when);filter.frequency.linearRampToValueAtTime(250, when + duration);
      source.disconnect();source.connect(filter);filter.connect(gain);
    } else if ((style === 'echo' || style === 'flanger') && context.createDelay) {
      const delay = node(context.createDelay(2)), wet = node(context.createGain()), feedback = node(context.createGain());
      delay.delayTime.setValueAtTime(style === 'echo' ? Math.min(1, 60 / (options.bpm ?? 120) / 2) : .005, context.currentTime);
      wet.gain.setValueAtTime(0, context.currentTime);feedback.gain.setValueAtTime(0, context.currentTime);
      wet.gain.setValueAtTime(style === 'echo' ? .32 : .3, when);feedback.gain.setValueAtTime(style === 'echo' ? .32 : .2, when);
      source.connect(delay);delay.connect(wet);wet.connect(gain);delay.connect(feedback);feedback.connect(delay);
      wet.gain.linearRampToValueAtTime(0, when + duration);feedback.gain.linearRampToValueAtTime(0, when + duration);
      if (style === 'flanger' && context.createOscillator) {
        const lfo = node(context.createOscillator()), depth = node(context.createGain());lfo.type = 'sine';
        lfo.frequency.setValueAtTime((options.bpm ?? 120) / 60, when);depth.gain.setValueAtTime(.001, context.currentTime);
        lfo.connect(depth);depth.connect(delay.delayTime);lfo.start(when);lfo.stop(when + duration);stops.push(() => lfo.stop());
      }
    } else if (style === 'stutter' && duration > 0) {
      const gate = node(context.createGain());source.disconnect();source.connect(gate);gate.connect(gain);
      const cycles = Math.min(32, Math.max(1, Math.ceil(duration * (options.bpm ?? 120) / 30)));
      for (let i = 0; i < cycles; i++) { const at = when + duration * i / cycles;gate.gain.setValueAtTime(1, at);gate.gain.linearRampToValueAtTime(.12, at + duration / cycles * .7); }
      gate.gain.linearRampToValueAtTime(0, when + duration);
    }
    return { style, cleanup };
  } catch {
    cleanup();source.disconnect();source.connect(gain);return { style: 'crossfade' as const, cleanup: () => {} };
  }
}

export function supportedAudioTransitions(context: AudioContextLike | undefined) {
  const styles: Array<Exclude<NonNullable<AudioPlaylistTransition['style']>, 'varied'>> = ['crossfade', 'stutter'];
  if (context?.createBiquadFilter) styles.push('filter');
  if (context?.createDelay) styles.push('echo');
  if (context?.createDelay && context.createOscillator) styles.push('flanger');
  return styles;
}
