import { hypot } from '../../../math/simulation.ts';
import type { Hyperfocus3DRuntime } from '../../runtime-3d.ts';
import type { CombatAudio3D, CombatAudioCue3D, combatVoiceCues3D } from '../combat-audio-config.ts';
import type { GameplayAudio3D } from '../gameplay-contracts.ts';
import type { CombatVector } from '../../../combat/config.ts';

type VoiceCue = typeof combatVoiceCues3D[number];
type Mix = Pick<GameplayAudio3D, 'priority' | 'duckMusic' | 'duckSeconds' | 'fadeSeconds' | 'category' | 'playbackRate' | 'impactStrength'>;

/** Each bank owns a deterministic stream, with no adjacent repeated take. */
export function createCombatAudioEmitter(options: { runtime: Hyperfocus3DRuntime; audio?: CombatAudio3D; listenerId?: string }) {
  const { runtime, audio } = options;
  let listenerId = options.listenerId;
  let pending: Array<{ sound: GameplayAudio3D; owner?: string }> = [];
  const banks = new Map<string, { count: number; last: number }>();
  const voices = new Map<string, { at: number; priority: number; frame: number }>();
  const has = (key: CombatAudioCue3D) => !!(audio?.variants?.[key]?.length || audio?.cues?.[key]);
  function take(key: string, variants: readonly string[] | undefined, fallback: string | undefined) {
    if (!variants?.length) return fallback;
    const memory = banks.get(key) ?? { count: 0, last: -1 };
    let hash = 2166136261;
    for (const c of `${key}:${memory.count++}`) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
    let index = hash % Math.max(1, variants.length - (memory.last >= 0 ? 1 : 0));
    if (variants.length > 1 && memory.last >= 0 && index >= memory.last) index++;
    memory.last = index;banks.set(key, memory);return variants[index];
  }
  function emit(assetId: string | undefined, bus: NonNullable<GameplayAudio3D['bus']>, gain: number, id?: string, loop = false, mix: Mix = {}, position?: CombatVector) {
    if (!assetId || gain <= 0 || pending.length >= 128) return;
    const body = id ? runtime.physics.body(id) : undefined;
    const scene = runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!;
    const eye = runtime.cameraPosition(), target = scene.camera.followEntityId ? runtime.snapshot().entities.find(entity => entity.id === scene.camera.followEntityId)?.position ?? scene.camera.target : scene.camera.target;
    const dx = eye[0] - target[0], dz = eye[2] - target[2], length = hypot(dx, dz) || 1;
    const listener = listenerId ? runtime.physics.body(listenerId) : undefined;
    const anchor = listener ? [listener.x, listener.y, listener.z] : target;
    const source = position ?? body;
    const pan = source ? Math.max(-.8, Math.min(.8, ((source.x - anchor[0]!) * dz - (source.z - anchor[2]!) * dx) / length / 12)) : 0;
    pending.push({ sound: { assetId, bus, gain: Math.min(1, gain), pan, loop, ...mix }, ...(bus === 'voice' || mix.category === 'voice' ? { owner: id } : {}) });
  }
  function cue(key: CombatAudioCue3D, id?: string, strength = 1, mix: Mix = {}, position?: CombatVector) {
    const accent = ['hitHeavy', 'guardBreak', 'counter', 'ko', 'roundWin', 'roundLoss', 'matchWin', 'matchLoss', 'trafficCrash'].includes(key);
    const defense = key === 'parry' || key === 'tech' || key === 'escape';
    const priority = key === 'ko' ? 100 : /^(round|match)/.test(key) ? 90 : key === 'counter' || key === 'guardBreak' ? 80 : accent ? 70 : defense ? 65 : key === 'hit' || key === 'block' || key === 'armor' ? 50 : /^(step|sprint|swing)/.test(key) ? 15 : 30;
    const impactStrength = key === 'hitHeavy' || key === 'guardBreak' || key === 'counter' || key === 'ko' || key === 'trafficCrash' ? 1 : undefined;
    emit(take(`cue:${key}`, audio?.variants?.[key], audio?.cues?.[key]), 'sfx', (audio?.sfxGain ?? .7) * strength, id, false, { priority, ...(impactStrength === undefined ? {} : { impactStrength }), ...(accent ? { duckMusic: .65, duckSeconds: .18 } : defense ? { duckMusic: .82, duckSeconds: .12 } : {}), ...mix }, position);
  }
  function voice(key: VoiceCue, id: string, frame: number) {
    const priority = key === 'ko' ? 100 : key === 'hurt' ? 80 : 45, memory = voices.get(id);
    if (memory && frame < memory.at && priority <= memory.priority) return;
    const bank = audio?.voiceVariants?.[id], single = audio?.voices?.[id];
    const slot = key === 'attackHeavy' && !bank?.attackHeavy && !single?.attackHeavy ? 'attack' : key;
    const asset = take(`voice:${id}:${slot}`, bank?.[slot], single?.[slot]);
    if (!asset) return;
    // A hurt arriving on the attack/effort frame replaces that queued effort.
    if (memory?.frame === frame) pending = pending.filter(entry => entry.owner !== id);
    emit(asset, 'sfx', audio?.voiceGain ?? .8, id, false, { category: 'voice', priority, duckMusic: key === 'ko' ? .45 : .75, duckSeconds: .25 });
    voices.set(id, { at: frame + (key === 'hurt' ? 24 : 32), priority, frame });
  }
  function worldCue(key: CombatAudioCue3D, id: string, strength = 1, location?: CombatVector) {
    const scene = runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!;
    const source = runtime.physics.body(id), entity = source ? undefined : scene.entities.find(entity => entity.id === id);
    const listener = runtime.physics.body(listenerId ?? scene.camera.followEntityId ?? '');
    const anchor = listener ? [listener.x, listener.y, listener.z] : scene.camera.target;
    if (!location && !source && !entity) return;
    const position = location ? [location.x, location.y, location.z] : source ? [source.x, source.y, source.z] : entity!.position;
    const distance = hypot(position[0]! - anchor[0]!, position[1]! - anchor[1]!, position[2]! - anchor[2]!);
    const fade = Math.max(0, 1 - distance / 16);
    if (fade > 0) cue(key, id, strength * fade * fade, {}, location);
  }
  const capture = () => ({ pending: structuredClone(pending), banks: [...banks].map(([id, memory]) => ({ id, ...memory })), voices: [...voices].map(([id, memory]) => ({ id, ...memory })) });
  return { emit, cue, voice, has,
    /** Listener ownership is host presentation state and does not rewind with combat. */
    setListener(id?: string) { listenerId = id ?? options.listenerId; },
    listener<T extends { id: string }>(fighters: readonly T[], fallbackId?: string) { return fighters.find(fighter => fighter.id === (listenerId ?? fallbackId)) ?? fighters[0]; },
    worldCue,
    worldFallback(key: CombatAudioCue3D, legacy: CombatAudioCue3D, id: string, strength = 1, position?: CombatVector) { worldCue(has(key) ? key : legacy, id, strength, position); },
    ambient(key: CombatAudioCue3D, id: string | undefined, strength: number) { emit(take(`cue:${key}`, audio?.variants?.[key], audio?.cues?.[key]), 'ambient', (audio?.sfxGain ?? .7) * strength, id, false, { priority: 5 }); },
    asset(key: CombatAudioCue3D) { return take(`cue:${key}`, audio?.variants?.[key], audio?.cues?.[key]); }, fallback(key: CombatAudioCue3D, legacy: CombatAudioCue3D, id?: string, strength = 1) { cue(has(key) ? key : legacy, id, strength); }, capture,
    restore(saved: ReturnType<typeof capture>) { pending = structuredClone(saved.pending);banks.clear();voices.clear();for (const { id, ...memory } of saved.banks) banks.set(id, memory);for (const { id, ...memory } of saved.voices) voices.set(id, memory); },
    reset() { pending = [];banks.clear();voices.clear(); },
    append(sound: GameplayAudio3D) { if (pending.length < 128) pending.push({ sound }); },
    drain() { const result = pending.map(entry => entry.sound);pending = [];return result; },
  };
}
export type CombatAudioEmitter = ReturnType<typeof createCombatAudioEmitter>;
