import { readCombatAudioMix3D, type CombatAudio3D, type GameplayAudio3D, type PortableAsset3D } from '@hyperfocus/engine/project/runtime-3d';
import type { StandaloneStreamedAudio } from '@hyperfocus/engine/project';

export type CaptureAudioSample = { seconds: number; audio: readonly GameplayAudio3D[] };

/** Cue times use the video clock. Slow offline rendering never stretches audio. */
export async function renderCaptureAudio(options: {
  durationSeconds: number; samples: readonly CaptureAudioSample[]; assets: readonly PortableAsset3D[];
  combatAudio?: CombatAudio3D; streamedMusic?: readonly StandaloneStreamedAudio[];
  loadAsset?: (id: string) => Promise<Uint8Array>;
}) {
  const sampleRate = 48_000;
  const context = new OfflineAudioContext(2, Math.ceil(options.durationSeconds * sampleRate), sampleRate);
  const mix = options.combatAudio ? readCombatAudioMix3D(options.combatAudio.mix) : { master: 1, sfx: 1, music: 1, ambient: 1 };
  const buffers = new Map<string, AudioBuffer>();
  const events = options.samples.flatMap(sample => sample.audio.map(sound => ({ seconds: sample.seconds, sound })));
  for (const id of new Set(events.map(event => event.sound.assetId))) {
    const source = options.streamedMusic?.find(source => source.assetId === id);
    let bytes: Uint8Array;
    if (source) {
      const response = await fetch(source.url);
      if (!response.ok) throw Error(`Capture audio ${id} returned ${response.status}.`);
      bytes = new Uint8Array(await response.arrayBuffer());
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))).map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (bytes.length !== source.size || digest !== source.sha256) throw Error(`Capture audio ${id} failed its byte integrity check.`);
    } else {
      const asset = options.assets.find(asset => asset.id === id && asset.mimeType.startsWith('audio/'));
      const loaded = asset?.bytes ?? await options.loadAsset?.(id);
      if (!loaded) throw Error(`Capture audio asset is missing: ${id}.`);
      bytes = new Uint8Array(loaded);
    }
    buffers.set(id, await context.decodeAudioData(new Uint8Array(bytes).buffer));
  }
  const loops = new Map<string, { source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode; trackGain: number }>();
  for (const { seconds, sound } of events) {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds >= options.durationSeconds) throw Error('Capture audio cue lies outside the video clock.');
    const bus = sound.bus ?? 'sfx';
    const gainValue = (sound.gain ?? 1) * mix.master * mix[bus === 'voice' ? 'sfx' : bus];
    const key = bus === 'music' ? 'music' : `${bus}:${sound.assetId}`;
    const existing = sound.loop ? loops.get(key) : undefined;
    if (existing && existing.source.buffer === buffers.get(sound.assetId)) {
      existing.gain.gain.setTargetAtTime(gainValue * (existing.trackGain ?? 1), seconds, Math.max(.001, (sound.fadeSeconds ?? 0) / 3));
      existing.pan.pan.setValueAtTime(sound.pan ?? 0, seconds);
      continue;
    }
    if (existing) existing.source.stop(seconds);
    const source = context.createBufferSource(), gain = context.createGain(), pan = context.createStereoPanner();
    source.buffer = buffers.get(sound.assetId)!;
    source.loop = sound.loop ?? false;
    source.playbackRate.value = sound.playbackRate ?? 1;
    gain.gain.value = gainValue; pan.pan.value = sound.pan ?? 0;
    source.connect(gain).connect(pan).connect(context.destination);
    const playlist = sound.playlist === 'lobby' ? options.combatAudio?.playlists?.lobby : sound.playlist === 'gameplay' ? options.combatAudio?.playlists?.gameplay : undefined;
    const track = playlist?.find(track => track.assetId === sound.assetId);
    gain.gain.value *= track?.gain ?? 1;
    source.loopStart = track?.startSeconds ?? 0;
    source.loopEnd = track?.endSeconds ?? source.buffer.duration;
    source.start(seconds, source.loopStart);
    if (sound.loop) loops.set(key, { source, gain, pan, trackGain: track?.gain ?? 1 });
  }
  return context.startRendering();
}
