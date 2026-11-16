import { createAudioEngine, type AudioEngine } from '@hyperfocus/engine/audio';
import { encodeMonoPcmWav } from '@hyperfocus/engine/audio';

export type UiSoundCue = 'focus' | 'confirm' | 'back' | 'adjust' | 'denied';
export const uiCueAssetKeys = { focus: 'uiFocus', confirm: 'uiConfirm', back: 'uiBack', adjust: 'uiAdjust', denied: 'uiDenied' } as const;
type UiEngine = Pick<AudioEngine, 'decode' | 'unlock' | 'setMasterGain' | 'setBusGain' | 'playBuffer' | 'dispose'>;
const tones: Record<UiSoundCue, readonly number[]> = { focus: [840], confirm: [660, 990], back: [660, 440], adjust: [760], denied: [220, 196] };

/** A small dry graph keeps navigation audible while the gameplay context is suspended. */
export function createStandaloneUiAudio(options: { mix: () => { master: number; sfx: number }; onError: (cause: unknown) => void; createEngine?: () => UiEngine; now?: () => number; bytesForCue?: (cue: UiSoundCue) => Uint8Array | undefined }) {
  let engine: UiEngine | undefined, disposed = false, ready: Promise<void> | undefined, plays = 0;
  const now = options.now ?? (() => performance.now());
  async function unlock() {
    if (disposed) return;
    engine ??= options.createEngine?.() ?? createAudioEngine({ buses: ['ui'], maxVoices: 8, maxDecodedEntries: 5, maxDecodedBytes: 131072 });
    const owned = engine;
    if (!ready) ready = owned.unlock().then(async () => {
      for (const cue of Object.keys(tones)) {
        if (!isUiSoundCue(cue) || disposed) continue;
        const authored = options.bytesForCue?.(cue);
        if (authored) { await owned.decode(`ui:${cue}`, authored);continue; }
        const notes = tones[cue], sampleRate = 24000, seconds = notes.length === 1 ? .035 : .12;
        const samples = new Float32Array(Math.ceil(sampleRate * seconds));
        for (let index = 0; index < samples.length; index++) {
          const time = index / sampleRate, note = Math.min(notes.length - 1, Math.floor(time / seconds * notes.length));
          const elapsed = time % (seconds / notes.length), envelope = Math.min(1, elapsed * 1000) * Math.exp(-elapsed * 50) * Math.min(1, (seconds - time) * 500);
          samples[index] = Math.sin(2 * Math.PI * notes[note]! * elapsed) * envelope * (cue === 'focus' || cue === 'adjust' ? .12 : .24);
        }
        await owned.decode(`ui:${cue}`, encodeMonoPcmWav({ samples, sampleRate }));
      }
    }).catch(cause => { ready = undefined;throw cause; });
    await ready;
    if (!disposed) applyMix();
  }
  function applyMix() { if (!engine || disposed) return;const mix = options.mix();engine.setMasterGain(mix.master);engine.setBusGain('ui', mix.sfx); }
  return { unlock,
    async play(cue: UiSoundCue) {
      const requestedAt = now();
      try { await unlock();if (disposed || !engine || now() - requestedAt > 180) return;
        const result = engine.playBuffer(`ui:${cue}`, { bus: 'ui', gain: 1, priority: 90 });
        if (result.ok) plays++;else if (result.code !== 'voice-capacity') options.onError(new Error(result.message));
      } catch (cause) { if (!disposed) options.onError(cause); }
    }, applyMix, snapshot: () => ({ created: !!engine, plays, dry: true }),
    async dispose() { disposed = true;await engine?.dispose(); } };
}
function isUiSoundCue(value: string): value is UiSoundCue { return value in tones; }
