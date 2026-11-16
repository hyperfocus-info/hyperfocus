import type { CombatProject3D, Hyperfocus3DDeclaration, Hyperfocus3DEvaluatedFrame } from '@hyperfocus/engine/project/runtime-3d';

type Frame = Hyperfocus3DEvaluatedFrame;

/** Tapered flame tongues, drifting ash and soft smoke share the scene's bounded effect budget. */
export function presentFireFeedback({ frame, combat, declaration, reducedMotion = false }: {
  frame: Frame; combat: CombatProject3D; declaration: Hyperfocus3DDeclaration; reducedMotion?: boolean;
}) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!;
  const sphere = declaration.meshes.find(mesh => mesh.id === 'tod:sphere');
  const shard = declaration.meshes.find(mesh => mesh.id === 'tod:impact-shard');
  const prefix = 'tod:fire-feedback:';
  frame.effects = frame.effects.filter(effect => !effect.id.startsWith(prefix));
  let available = Math.max(0, (scene.effectCapacity ?? 256) - frame.effects.reduce((count, effect) => count + effect.particles.length, 0));
  for (const hazard of combat.environment?.hazards ?? []) {
    if (hazard.kind !== 'fire') continue;
    const source = scene.entities.find(entity => entity.id === hazard.entityId);
    const flames = frame.effects.find(effect => effect.id === `hazard:${hazard.entityId}`);
    if (!source || !flames) continue;
    const material = frame.materials.find(material => material.id === flames.materialId);
    if (!material) continue;
    const smokeId = prefix + 'smoke', flameId = prefix + 'flame';
    if (![smokeId, flameId].every(id => frame.materials.some(material => material.id === id))) continue;
    flames.materialId = flameId;
    if (shard) flames.meshId = shard.id;
    const tick = reducedMotion ? 12 : frame.timeSeconds * 60;
    const floor = source.position[1] - source.scale[1];
    // The authored box remains the damage volume. The flame bed marks it without an opaque cuboid.
    const zone = frame.entities.find(entity => entity.id === hazard.entityId);
    if (zone) zone.visible = false;
    for (let i = 0; i < flames.particles.length; i++) {
      const particle = flames.particles[i]!, life = ((tick + i * 11) % 42) / 42;
      particle.color = [1, .28 + (1 - life) * .48, .035 + (1 - life) * .17, .85 * (1 - life * .7)];
      particle.position[0] += Math.sin(tick * .12 + i) * .08 * life;
      particle.position[2] += Math.cos(tick * .09 + i) * .08 * life;
      particle.position[1] = floor + .16 + life * .18;
      particle.scale = [.16 - life * .07, .5 + Math.sin(life * Math.PI) * .3, .14 - life * .06];
    }
    if (!sphere) continue;
    const smoke: Frame['effects'][number]['particles'] = [], embers: Frame['effects'][number]['particles'] = [];
    const count = Math.min(reducedMotion ? 4 : 12, available);available -= count;
    for (let i = 0; i < count; i++) {
      const ash = i % 2 === 1, life = ((tick + i * 17) % (ash ? 48 : 90)) / (ash ? 48 : 90);
      const angle = i * 2.399963, radius = Math.min(source.scale[0], source.scale[2]) * .6;
      const x = source.position[0] + Math.cos(angle) * radius + life * .3;
      const z = source.position[2] + Math.sin(angle) * radius + Math.sin(i + life * 2) * .12;
      const size = ash ? .018 * (1 - life) + .006 : .2 + life * .4;
      (ash ? embers : smoke).push({ id: `${prefix}${hazard.entityId}:${i}`, position: [x, floor + .35 + life * (ash ? 1.7 : 2.1), z],
        rotation: [0, 0, 0, 1], scale: [size, size * (ash ? 2.4 : .8), size],
        color: ash ? [1, .65, .15, 1 - life] : [.25 + life * .1, .25 + life * .1, .27 + life * .1, Math.sin(life * Math.PI) * .28] });
    }
    if (smoke.length) frame.effects.push({ id: prefix + hazard.entityId, kind: 'sparks', presentation: 'model', meshId: sphere.id, materialId: smokeId, particles: smoke });
    if (embers.length) frame.effects.push({ id: prefix + hazard.entityId + ':embers', kind: 'sparks', presentation: 'model', meshId: shard?.id ?? sphere.id, materialId: flameId, particles: embers });
  }
}
