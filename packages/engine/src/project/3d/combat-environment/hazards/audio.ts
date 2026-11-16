import type { CombatSnapshot } from '../../../../combat/state.ts';
import { hypot } from '../../../../math/simulation.ts';
import type { Hyperfocus3DDeclaration } from '../../declaration.ts';
import type { CombatAudio3D, CombatAudioCue3D } from '../../combat-audio-config.ts';
import type { GameplayAudio3D } from '../../gameplay-contracts.ts';
import type { CombatHazard } from './config.ts';
import type { HazardState } from './session.ts';

export type HazardAudioInput = { state: Readonly<HazardState>; activeIds: readonly string[] };

/** Short bounded grains avoid persistent unmanaged loops after pause, exit or a result screen. */
export function createHazardAudio(options: { hazards: readonly CombatHazard[]; entities: readonly Hyperfocus3DDeclaration['scenes'][number]['entities'][number][]; audio?: CombatAudio3D; listenerId?: string; listener?: (state: CombatSnapshot) => CombatSnapshot['fighters'][number] | undefined; asset?: (key: CombatAudioCue3D) => string | undefined }) {
  const entities = new Map(options.entities.map(entity => [entity.id, entity]));
  let lastFrame = -1, waterAt = new Map<string, number>();
  return {
    capture: () => ({ lastFrame, waterAt: [...waterAt] }),
    restore(saved: { lastFrame: number; waterAt: [string, number][] }) { lastFrame = saved.lastFrame;waterAt = new Map(saved.waterAt); },
    reset() { lastFrame = -1;waterAt.clear(); },
    step(state: CombatSnapshot, input: HazardAudioInput | undefined, phase: string, rightX: number, rightZ: number): GameplayAudio3D[] {
      const result: GameplayAudio3D[] = [], audio = options.audio, gain = audio?.sfxGain ?? .7;
      if (!input || !audio || gain <= 0 || phase !== 'fighting' && phase !== 'practice' || state.frame <= lastFrame) return result;
      lastFrame = state.frame;
      const listener = options.listener ? options.listener(state) : state.fighters.find(fighter => fighter.id === options.listenerId) ?? state.fighters[0];if (!listener) return result;
      const emit = (key: 'hazardFire' | 'hazardWater', x: number, y: number, z: number, strength: number) => {
        const dx = x - listener.position.x, dz = z - listener.position.z;
        const distance = hypot(dx, y - listener.position.y, dz), fade = Math.max(0, 1 - distance / 24);
        if (fade <= 0) return;
        const assetId = options.asset ? options.asset(key) : audio.cues?.[key];
        if (assetId) result.push({ assetId, bus: 'sfx', gain: gain * strength * fade * fade, pan: Math.max(-.8, Math.min(.8, (dx * rightX + dz * rightZ) / 12)), loop: false, priority: key === 'hazardFire' ? 5 : 20 });
      };
      if (state.frame % 24 === 0) {
        const nearby = options.hazards.filter(hazard => hazard.kind === 'fire' && input.activeIds.includes(hazard.entityId)).map(hazard => entities.get(hazard.entityId)!).filter(Boolean)
          .sort((a, b) => hypot(a.position[0] - listener.position.x, a.position[1] - listener.position.y, a.position[2] - listener.position.z) - hypot(b.position[0] - listener.position.x, b.position[1] - listener.position.y, b.position[2] - listener.position.z) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, 2);
        for (const entity of nearby) emit('hazardFire', ...entity.position, .35);
      }
      for (const event of input.state.trace) {
        if (event.frame !== state.frame || event.kind !== 'enter' || state.frame < (waterAt.get(event.fighterId) ?? -Infinity) + 18 || !options.hazards.some(hazard => hazard.entityId === event.entityId && hazard.kind === 'flood')) continue;
        const fighter = state.fighters.find(fighter => fighter.id === event.fighterId);if (!fighter) continue;
        waterAt.set(event.fighterId, state.frame);emit('hazardWater', fighter.position.x, fighter.position.y, fighter.position.z, .65);
      }
      return result;
    },
  };
}
