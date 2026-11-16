import type { Hyperfocus3DEvaluatedFrame } from '../../../../frame/3d.ts';
import { cos, sin } from '../../../../math/simulation.ts';
import type { Hyperfocus3DDeclaration } from '../../declaration.ts';
import type { CombatEnvironment } from '../config.ts';
import type { HazardState } from './session.ts';

/** Local flames/ripples stay inside the authored footprint; no screen-wide warning or flashing. */
export function presentCombatHazards(options: { frame: Hyperfocus3DEvaluatedFrame; definition: CombatEnvironment; entities: readonly Hyperfocus3DDeclaration['scenes'][number]['entities'][number][]; phases: ReadonlyMap<string, string>; state?: HazardState; effectCapacity: number }) {
  const { frame, definition, entities, phases } = options;
  const tick = Math.max(0, options.state?.frame ?? 0);
  const owned = new Set(definition.hazards?.map(hazard => `hazard:${hazard.entityId}`));
  frame.effects = frame.effects.filter(effect => !owned.has(effect.id));
  let available = Math.max(0, options.effectCapacity - frame.effects.reduce((count, effect) => count + effect.particles.length, 0));
  for (const hazard of definition.hazards ?? []) {
    const source = entities.find(entity => entity.id === hazard.entityId), zone = frame.entities.find(entity => entity.id === hazard.entityId);
    if (!source || !zone) continue;
    zone.visible = !hazard.activationSurfaceId || phases.get(hazard.activationSurfaceId) === 'removed';
    if (!zone.visible) continue;
    const floor = source.position[1] - source.scale[1];
    zone.position[1] = floor + .025;zone.scale[1] = .025;
    const c = cos(source.rotationY), s = sin(source.rotationY);
    const particles: Hyperfocus3DEvaluatedFrame['effects'][number]['particles'] = [];
    const count = Math.min(12, available);available -= count;
    for (let i = 0; i < count; i++) {
      const life = ((tick + i * 11) % 42) / 42;
      const x = ((i * 7 % 13) / 13 * 2 - 1) * source.scale[0] * .88, z = ((i * 5 % 11) / 11 * 2 - 1) * source.scale[2] * .88;
      const fire = hazard.kind === 'fire', height = fire ? (.25 + .55 * sin(life * 3.14159)) * Math.min(1, source.scale[1]) : .012;
      particles.push({ id: `${hazard.entityId}:${i}`, position: [source.position[0] + x * c + z * s, floor + (fire ? height + life * source.scale[1] : .045), source.position[2] - x * s + z * c], rotation: zone.rotation,
        scale: fire ? [.14 * (1 - life) + .03, height, .14 * (1 - life) + .03] : [.12 + life * .3, .012, .02] });
    }
    if (particles.length) frame.effects.push({ id: `hazard:${hazard.entityId}`, kind: hazard.kind === 'fire' ? 'sparks' : 'shockwave', presentation: 'model', meshId: source.meshId, materialId: source.materialId, particles });
  }
}
