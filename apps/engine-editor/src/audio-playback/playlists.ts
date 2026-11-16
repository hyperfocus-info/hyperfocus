import { createAudioPlaylist, type AudioEngine, type AudioPlaylistTrack, type AudioPlaylistTransition } from '@hyperfocus/engine/audio';
import type { PlayableAudioCommand } from '@hyperfocus/engine/project/runtime-2d';

type Play = Extract<PlayableAudioCommand, { type: 'play' }>;
type Engine = Pick<AudioEngine, 'playBuffer' | 'hasBuffer'> & Partial<Pick<AudioEngine, 'context' | 'getBufferDuration' | 'getAudioMetadata'>>;
export type StandalonePlaylistOptions = { playlists?: Record<string, readonly AudioPlaylistTrack[]>; musicTransition?: AudioPlaylistTransition; musicSeed?: number };

/** The host owns packed bytes and scene lifetime; the engine owns music scheduling. */
export function createStandalonePlaylists(options: StandalonePlaylistOptions & { engine: Engine; load: (id: string) => Promise<void>; onError: (error: Error) => void }) {
  const sessions = new Map<string, ReturnType<typeof createAudioPlaylist>>();
  const seed = options.musicSeed ?? Math.floor(Math.random() * 4_294_967_296);
  let paused = false;
  function handle(command: Play) {
    if (!command.playlist || command.bus !== 'music') return false;
    const { context, getBufferDuration } = options.engine;
    if (!context || !getBufferDuration || !options.playlists?.[command.playlist]?.length) return false;
    let session = sessions.get(command.sceneId);
    if (!session) {
      session = createAudioPlaylist({ engine: { context, getBufferDuration, getAudioMetadata: options.engine.getAudioMetadata, hasBuffer: options.engine.hasBuffer, playBuffer: options.engine.playBuffer, isUnlocked: () => context()?.state === 'running' }, playlists: options.playlists, seed, load: options.load, transition: options.musicTransition, onError: (assetId, cause) => options.onError(new Error(`Music asset ${assetId}: ${String(cause)}`)) });
      sessions.set(command.sceneId, session);if (paused) session.setPaused({ paused });
    }
    const previous = session.snapshot();
    const transition = previous.track && previous.playlistId !== command.playlist
      ? { style: 'crossfade' as const, align: 'immediate' as const, durationSeconds: Math.max(4, options.musicTransition?.durationSeconds ?? 0) }
      : undefined;
    void session.select({ playlistId: command.playlist, gain: command.gain, intensity: command.musicIntensity, transition }).catch(options.onError);
    return true;
  }
  function stopScene(sceneId: string, bus?: string) {
    if (bus !== undefined && bus !== 'music') return;
    sessions.get(sceneId)?.dispose();sessions.delete(sceneId);
  }
  return { handle, stopScene,
    update() { for (const session of sessions.values()) session.update(); },
    setPaused(value: boolean) { paused = value;for (const session of sessions.values()) session.setPaused({ paused }); },
    snapshot() { return [...sessions.values()].at(-1)?.snapshot(); },
    async next() { const session = [...sessions.values()].at(-1);if (session) await session.next(); },
    async retry() { const session = [...sessions.values()].at(-1);if (session) await session.retry(); },
    dispose() { for (const session of sessions.values()) session.dispose();sessions.clear(); },
  };
}
