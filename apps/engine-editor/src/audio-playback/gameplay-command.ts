import { combatAudioAssetIds3D, type CombatAudio3D, type GameplayAudio3D } from '@hyperfocus/engine/project/runtime-3d';
import type { PlayableAudioCommand } from '@hyperfocus/engine/project/runtime-2d';

export function gameplayAudioCommand(options: { event: GameplayAudio3D; sceneId: string; commandId: string }): PlayableAudioCommand {
  const event = options.event;
  return { type: 'play', commandId: options.commandId, sceneId: options.sceneId, entityId: 'gameplay', componentId: 'project-script', assetId: event.assetId,
    bus: event.bus === 'voice' ? 'sfx' : event.bus ?? 'sfx', gain: event.gain ?? 1, pan: event.pan ?? 0, loop: event.loop ?? false,
    ...(event.category ? { category: event.category } : event.bus === 'voice' ? { category: 'voice' as const } : {}),
    ...(event.playbackRate === undefined ? {} : { playbackRate: event.playbackRate }),
    ...(event.impactStrength === undefined ? {} : { impactStrength: event.impactStrength }),
    priority: event.priority ?? (event.bus === 'music' ? 90 : event.bus === 'voice' ? 3 : 2),
    duckMusic: event.duckMusic, duckSeconds: event.duckSeconds, fadeSeconds: event.fadeSeconds,
    ...(event.playlist === undefined ? {} : { playlist: event.playlist }),
    ...(event.musicIntensity === undefined ? {} : { musicIntensity: event.musicIntensity }) };
}
export function combatPreloadAssets(audio: CombatAudio3D | undefined) {
  const musicIds = new Set([audio?.music, audio?.musicResult, ...Object.values(audio?.playlists ?? {}).flatMap(tracks => tracks.map(track => track.assetId))]);
  return combatAudioAssetIds3D(audio).filter(id => !musicIds.has(id));
}
