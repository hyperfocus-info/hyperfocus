import { createHazardAudio, type HazardAudioInput } from './combat-environment/hazards/audio.ts';
import { hypot } from '../../math/simulation.ts';
import type { CombatEvent } from '../../combat/state.ts';
import type { Hyperfocus3DRuntime } from '../runtime-3d.ts';
import type { CombatProject3D } from './combat-declaration.ts';
import type { CombatMatchSnapshot3D } from './combat-match/index.ts';
import { createCombatAudioEmitter } from './combat-audio/emitter.ts';
import { createCombatMovementAudio, type AudioStep } from './combat-audio/movement.ts';
import { createCombatEnvironmentAudio } from './combat-audio/environment.ts';
import { routeCombatContacts, routeCombatInteractions } from './combat-audio/routing.ts';
import { combatMusicIntensityGain, createCombatMusicIntensity } from './combat-audio/intensity.ts';
import type { CombatVector } from '../../combat/config.ts';

/** Presentation audio never changes mechanics; its memories rewind before replay. */
export function createCombatAudio3D(options: { definition: CombatProject3D; runtime: Hyperfocus3DRuntime; hazards?: () => HazardAudioInput; inactiveEnvironment?: (id: string) => boolean }) {
  const { definition, runtime } = options, audio = definition.audio;
  const emitter = createCombatAudioEmitter({ runtime, audio, listenerId: definition.fighters.find(fighter => fighter.control === 'player')?.entityId });
  const hazardAudio = createHazardAudio({ hazards: definition.environment?.hazards ?? [], entities: runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!.entities, audio, listener: state => emitter.listener(state.fighters), asset: emitter.asset });
  const movement = createCombatMovementAudio({ definition, runtime, emitter, activeHazards: () => options.hazards?.().activeIds ?? [] });
  const environment = createCombatEnvironmentAudio({ definition, runtime, emitter, inactive: options.inactiveEnvironment });
  const intensity = createCombatMusicIntensity({ maxHealth: definition.config.maxHealth });
  const dynamics = !!(audio?.musicResult || Object.keys(audio?.variants ?? {}).length || emitter.has('roundWin') || emitter.has('roundLoss') || emitter.has('matchWin') || emitter.has('matchLoss'));
  let musicStarted = false, musicAsset = '', musicGain = 0, musicPlaylist = '', phase = '', countdown = 0;
  const capture = () => ({ memories: movement.capture(), emitter: emitter.capture(), intensity: intensity.capture(), musicStarted, musicAsset, musicGain, musicPlaylist, phase, countdown, hazards: hazardAudio.capture(), environment: environment.capture() });
  return {
    setListener: emitter.setListener,
    /** Trusted in-process presentation checkpoint, not an untrusted portable save. */
    capture,
    restore(saved: ReturnType<typeof capture>) {
      movement.restore(saved.memories);emitter.restore(saved.emitter);hazardAudio.restore(saved.hazards);environment.restore(saved.environment);
      intensity.restore(saved.intensity);
      musicStarted = saved.musicStarted;musicAsset = saved.musicAsset;musicGain = saved.musicGain;musicPlaylist = saved.musicPlaylist;phase = saved.phase;countdown = saved.countdown;
    },
    reset(restartMusic = true) { hazardAudio.reset();environment.reset();movement.reset();intensity.reset();emitter.reset();phase = '';countdown = 0;if (restartMusic) { musicStarted = false;musicAsset = '';musicGain = 0;musicPlaylist = ''; } },
    phase(match?: CombatMatchSnapshot3D) {
      if (!audio) return;
      const next = match?.phase ?? 'fighting', number = next === 'countdown' ? Math.ceil((match?.ticks ?? 0) / 60) : 0;
      const bucket = next === 'menu' || next === 'match-result' ? 'lobby' : 'gameplay';
      if (bucket === 'lobby' && phase !== next) intensity.reset();
      const tracks = audio.playlists?.[bucket], playlist = tracks?.length ? bucket : '';
      const asset = playlist ? tracks?.[0]?.assetId : next === 'match-result' && audio.musicResult ? audio.musicResult : audio.music;
      const factor = next === 'fighting' || next === 'practice' ? 1 : next === 'round-result' ? .65 : next === 'match-result' ? .8 : next === 'intro' ? .85 : next === 'countdown' ? .95 : .7;
      const gain = (audio.musicGain ?? .22) * (dynamics || playlist ? factor : 1) * (playlist ? combatMusicIntensityGain(intensity.value()) : 1);
      if (!musicStarted || playlist !== musicPlaylist || (dynamics || playlist) && phase !== next && (asset !== musicAsset || gain !== musicGain)) {
        const fade = musicStarted ? { fadeSeconds: .4 } : {};
        if (playlist && asset) { emitter.append({ assetId: asset, bus: 'music', gain, pan: 0, loop: true, playlist, ...(bucket === 'gameplay' ? { musicIntensity: intensity.value() } : {}), ...fade });if (bucket === 'gameplay') intensity.emitted(); }
        else emitter.emit(asset, 'music', gain, undefined, true, fade);
        musicStarted = true;musicAsset = asset ?? '';musicGain = gain;musicPlaylist = playlist;
      }
      if (number && (phase !== next || countdown !== number)) emitter.cue('countdown');
      if (next === 'fighting' && phase && phase !== next) emitter.cue('fight');
      if (phase !== next && (next === 'round-result' || next === 'match-result') && (match?.winner === 'player' || match?.winner === 'opponent')) {
        const win = match?.winner === 'player', key = next === 'round-result' ? win ? 'roundWin' : 'roundLoss' : win ? 'matchWin' : 'matchLoss';
        emitter.cue(key);
      }
      phase = next;countdown = number;
    },
    step(input: AudioStep & { events: readonly CombatEvent[]; interactions?: readonly { kind: string; actor: string; target?: string; position?: CombatVector }[] }) {
      if (!audio) return;
      const listener = emitter.listener(input.after.fighters);
      if (listener) {
        const eye = runtime.cameraPosition(), dx = eye[0] - listener.position.x, dz = eye[2] - listener.position.z, length = hypot(dx, dz) || 1;
        for (const sound of hazardAudio.step(input.after, options.hazards?.(), phase || 'fighting', dz / length, -dx / length)) emitter.append(sound);
      }
      environment.step(input.after, phase || 'fighting');
      routeCombatInteractions(definition, emitter, input.before, input.after, input.interactions ?? []);
      movement.step(input);
      routeCombatContacts(definition, emitter, input.after, input.events);
      if (audio.effects?.reactiveMusic !== false && musicPlaylist === 'gameplay' && (phase === 'fighting' || phase === 'practice')) {
        const value = intensity.step(input.after, input.events);
        if (value !== undefined) {
          musicGain = (audio.musicGain ?? .22) * combatMusicIntensityGain(value);
          emitter.append({ assetId: musicAsset, bus: 'music', gain: musicGain, pan: 0, loop: true, playlist: musicPlaylist, musicIntensity: value, fadeSeconds: .6 });
        }
      }
    },
    drain: emitter.drain,
  };
}
