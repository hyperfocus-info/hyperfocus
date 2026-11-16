import type { Hyperfocus3DDeclaration } from '../declaration.ts';
import type { CombatEnvironment } from './config.ts';
import type { CombatConfig } from '../../../combat/config.ts';

export function validateEnvironmentReferences(options: { definition: CombatEnvironment; declaration: Hyperfocus3DDeclaration; fighterIds: readonly string[]; config?: CombatConfig }) {
  const scene = options.declaration.scenes.find(scene => scene.id === options.declaration.activeSceneId);
  const entities = new Map(scene?.entities.map(entity => [entity.id, entity]));
  const used = new Set<string>();
  const stoppedParts = new Set<string>();
  for (const surface of options.definition.surfaces) {
    const entity = entities.get(surface.entityId);
    if (!entity || entity.physics?.type !== 'static' || options.fighterIds.includes(entity.id)) throw new Error(`Environment surface ${surface.entityId} needs a solid static non-fighter body.`);
    if (used.has(entity.id)) throw new Error(`Environment entity ${entity.id} has overlapping roles.`);used.add(entity.id);
    if (surface.stopMotionIds) {
      if (entity.animation?.kind !== 'ping-pong' || entity.physics.shape !== 'box') throw new Error('A vehicle wreck needs a moving box body.');
      for (const id of surface.stopMotionIds) {
        const part = entities.get(id);
        if (!part || options.fighterIds.includes(id) || stoppedParts.has(id) || options.definition.surfaces.some(other => other.entityId === id) || part.physics && part.physics.type !== 'static' || JSON.stringify(part.animation) !== JSON.stringify(entity.animation)) throw new Error(`Stopped vehicle part ${id} must uniquely share its body motion.`);
        stoppedParts.add(id);
      }
    }
    for (const id of [...surface.revealIds ?? [], ...surface.debrisIds ?? [], ...surface.warningIds ?? [], ...surface.hideIds ?? [], ...surface.toolIds ?? []]) {
      const feedback = entities.get(id);
      if (!feedback || feedback.physics || options.fighterIds.includes(id) || used.has(id)) throw new Error(`Environment feedback ${id} needs a unique render-only non-fighter entity.`);
      used.add(id);
    }
  }
  for (const traffic of options.definition.traffic ?? []) {
    const entity = entities.get(traffic.entityId), move = options.config?.moves.find(move => move.id === traffic.moveId);
    const wreck = options.definition.surfaces.some(surface => surface.entityId === traffic.entityId && surface.stopMotionIds);
    if (!entity || entity.physics?.type !== 'static' || entity.physics.shape !== 'box' || entity.animation?.kind !== 'ping-pong' || options.fighterIds.includes(entity.id) || used.has(entity.id) && !wreck) throw new Error(`Traffic ${traffic.entityId} needs a unique moving static box.`);
    if (!move || move.damage <= 0) throw new Error(`Traffic ${traffic.entityId} needs a damaging combat move.`);
    used.add(entity.id);
  }
  for (const hazard of options.definition.hazards ?? []) {
    const entity = entities.get(hazard.entityId);
    if (!entity || entity.physics || entity.animation || entity.controller || options.fighterIds.includes(entity.id) || used.has(entity.id)) throw Error(`Hazard ${hazard.entityId} needs a unique stationary render-only volume.`);
    if (hazard.activationSurfaceId && !options.definition.surfaces.some(surface => surface.entityId === hazard.activationSurfaceId)) throw Error('Hazard activation must reference an environment surface.');
    used.add(entity.id);
  }

}
