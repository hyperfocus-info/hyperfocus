import type { AudioEngine } from '@hyperfocus/engine/audio';
import { readCombatAudioEffects3D, type CombatAudio3D, type CombatProject3D, type GameplaySnapshot3D } from '@hyperfocus/engine/project/runtime-3d';

type Engine = Partial<Pick<AudioEngine, 'configureBusEffects' | 'setBusReactive' | 'busEffectsSnapshot'>>;
export type PersonalMusicState = { active: boolean; fighterId?: string; health: number; stamina: number };

export function personalMusicState(options: { snapshot: GameplaySnapshot3D; definition?: CombatProject3D; localFighterId?: string; replayControlledSeat?: 0 | 1; spectating?: boolean; paused?: boolean }): PersonalMusicState {
  const { snapshot, definition } = options;
  const fighterId = options.replayControlledSeat !== undefined ? definition?.fighters[options.replayControlledSeat]?.entityId : options.localFighterId ?? definition?.fighters.find(fighter => fighter.control === 'player')?.entityId;
  const fighter = snapshot.combat?.state.fighters.find(item => item.id === fighterId), phase = snapshot.combat?.match?.phase;
  // Theater is ordinarily AI-vs-AI; only explicit replay input ownership can
  // make one of its recorded fighters the listener's personal fighter.
  return { fighterId, active: !!fighter && !options.paused && !options.spectating && (!snapshot.combat?.match?.theater || options.replayControlledSeat !== undefined) && (!phase || phase === 'fighting' || phase === 'practice' || phase === 'round-result' && fighter.health > 0),
    health: fighter ? fighter.health / Math.max(1, definition?.config.maxHealth ?? 100) : 1,
    stamina: fighter ? fighter.stamina / Math.max(1, definition?.config.maxStamina ?? 100) : 1 };
}

/** Personal coloration stays separate from the fight-wide playlist energy signal. */
export function createCombatMusicEffects(options: { engine: Engine; audio?: CombatAudio3D; load: (id: string) => Promise<void>; onError: (cause: unknown) => void }) {
  const settings = options.audio?.effects ? readCombatAudioEffects3D(options.audio.effects) : undefined;
  let disposed = false, configured = false, fighterId: string | undefined, injured = false;
  let lastLowpass = 20000, lastPitch = 0;
  async function configure() {
    if (!settings || disposed) return;
    let impulseReady = false;
    if (settings.cityImpulseAssetId) {
      try { await options.load(settings.cityImpulseAssetId);impulseReady = true; } catch (cause) { options.onError(cause); }
    }
    if (disposed) return;
    options.engine.configureBusEffects?.({ bus: 'music', lowpassHz: 20000, pitchCents: 0,
      ...(settings.musicCompression ? { compressor: { threshold: -18, knee: 6, ratio: 4, attack: .01, release: .15, ceilingDb: -9 } } : {}) });
    if (impulseReady && settings.cityImpulseAssetId) for (const bus of ['sfx', 'ambient']) options.engine.configureBusEffects?.({ bus,
      reverb: { assetId: settings.cityImpulseAssetId, sendGain: settings.reverbSend, highpassHz: 180, lowpassHz: 7000 } });
    configured = true;lastLowpass = 20000;lastPitch = 0;
  }
  function personal(state: PersonalMusicState) {
    if (!configured || disposed || !settings?.reactiveMusic) return;
    if (fighterId !== state.fighterId) { fighterId = state.fighterId;injured = false; }
    const valid = state.active && !!state.fighterId && Number.isFinite(state.health) && Number.isFinite(state.stamina) && state.health > 0;
    injured = valid && (injured ? state.health < .3 : state.health < .25);
    const fatigue = valid ? Math.max(0, Math.min(1, 1 - state.stamina)) : 0;
    const intensity = fatigue <= .5 ? fatigue * 1.6 : .8 + (fatigue - .5) * .4;
    const danger = injured ? Math.max(0, Math.min(1, (.25 - state.health) / .25)) : 0;
    const lowpassHz = 20000 * (settings.staminaLowpassHz / 20000) ** intensity, pitchCents = Math.round(settings.lowHealthCents * danger) || 0;
    if (lowpassHz === lastLowpass && pitchCents === lastPitch) return;
    // Stamina follows the current value immediately, including fractional recovery. Its updates must not
    // continually restart the independent, slower health pitch transition.
    if (lowpassHz !== lastLowpass) options.engine.setBusReactive?.({ bus: 'music', lowpassHz, fadeSeconds: 0 });
    if (pitchCents !== lastPitch) options.engine.setBusReactive?.({ bus: 'music', pitchCents, fadeSeconds: Math.abs(pitchCents) > Math.abs(lastPitch) ? .25 : .8 });
    lastLowpass = lowpassHz;lastPitch = pitchCents;
  }
  return { configure, personal, saturation: (strength: number | undefined) => (settings?.impactSaturation ?? 0) * Math.max(0, Math.min(1, strength ?? 0)),
    snapshot: () => ({ configured, fighterId, lowpassHz: lastLowpass, pitchCents: lastPitch, buses: options.engine.busEffectsSnapshot?.() }),
    dispose() { disposed = true; },
    recover() { configured = false;return configure().catch(options.onError); } };
}
