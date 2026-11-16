import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { authorCombatObstructions } from './obstructions.ts';

/** Ordinary editable meshes: the runtime poses these siblings without moving the collider. */
export function articulateTouchOfDeathFighters(options: { declaration: Hyperfocus3DDeclaration; fighterIds: readonly string[] }) {
  const { declaration, fighterIds } = options;
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId);
  if (!scene) throw new Error('Touch of Death needs an active scene.');
  authorCombatObstructions(declaration);
  for (const [id, color] of [['tod:shield-edge', [.3, .85, 1, .85]], ['tod:influence', [.9, .97, 1, .6]]] as const) if (!declaration.materials.some(m => m.id === id)) declaration.materials.push({ id, shading: 'unlit', baseColor: [...color], metallic: 0, roughness: 1, doubleSided: true, alphaMode: 'blend' });
  if (!declaration.materials.some(material => material.id === 'tod:shadow')) declaration.materials.push({ id: 'tod:shadow', shading: 'unlit', baseColor: [.01, .015, .025, .32], metallic: 0, roughness: 1, doubleSided: false, alphaMode: 'blend' });
  if (!declaration.materials.some(material => material.id === 'tod:dust')) declaration.materials.push({ id: 'tod:dust', shading: 'unlit', baseColor: [.68, .79, .81, .34], metallic: 0, roughness: 1, doubleSided: true, alphaMode: 'blend' });
  if (!declaration.materials.some(material => material.id === 'tod:parry')) declaration.materials.push({ id: 'tod:parry', shading: 'unlit', baseColor: [.66, 1, 1, .95], metallic: 0, roughness: 1, doubleSided: true, alphaMode: 'blend' });
  for (const [id, color] of [['tod:contact-core', [1, .97, .86, 1]], ['tod:contact-tail', [.94, .58, .22, .85]]] as const) {
    if (!declaration.materials.some(material => material.id === id)) declaration.materials.push({ id, shading: 'unlit', baseColor: [...color], metallic: 0, roughness: 1, doubleSided: true, alphaMode: 'blend' });
  }
  for (const id of fighterIds) {
    const root = scene.entities.find(entity => entity.id === id);
    if (!root) throw new Error(`Missing fighter ${id}.`);
    if (!declaration.materials.some(material => material.id === `${id}:timing`)) declaration.materials.push({ id: `${id}:timing`, shading: 'unlit', baseColor: [1, 1, 1, 1], metallic: 0, roughness: 1, doubleSided: true, alphaMode: 'blend' });
    const add = (suffix: string, meshId: string, materialId: string, offset: [number, number, number], scale: [number, number, number]) => {
      if (scene.entities.some(entity => entity.id === `${id}:${suffix}`)) return;
      scene.entities.push({ id: `${id}:${suffix}`, meshId, materialId, position: [root.position[0] + offset[0], root.position[1] + offset[1], root.position[2] + offset[2]], scale, rotationY: root.rotationY });
    };
    add('head', 'tod:sphere', 'tod:skin', [0, .78, 0], [.24, .27, .225]);
    add('hair', 'tod:box', 'tod:ink', [0, 1, -.02], [.27, .1, .23]);
    add('shadow', 'tod:sphere', 'tod:shadow', [0, -.99, 0], [.48, .004, .36]);
    const face = scene.entities.find(entity => entity.id === `${id}:face`);
    if (face) face.materialId = 'tod:ink';
    for (const [side, sign] of [['left', -1], ['right', 1]] as const) {
      add(`${side}-thigh`, 'tod:sphere', root.materialId!, [sign * .17, -.42, 0], [.11, .17, .11]);
      add(`${side}-shin`, 'tod:sphere', 'tod:ink', [sign * .17, -.68, 0], [.09, .12, .09]);
      add(`${side}-boot`, 'tod:box', 'tod:ink', [sign * .17, -.82, .1], [.14, .16, .24]);
      add(`${side}-arm`, 'tod:sphere', root.materialId!, [sign * .39, .3, .14], [.09, .17, .09]);
      add(`${side}-forearm`, 'tod:sphere', 'tod:skin', [sign * .43, .25, .22], [.09, .15, .09]);
    }
    for (let index = 0; index < 12; index++) {
      const mesh = declaration.meshes.some(item => item.id === 'tod:impact-shard') ? 'tod:impact-shard' : 'tod:sphere';
      add(`spark:${index}`, mesh, index < 4 ? 'tod:contact-core' : 'tod:contact-tail', [0, 0, 0], [0, 0, 0]);
      const spark = scene.entities.find(entity => entity.id === `${id}:spark:${index}`)!;
      spark.meshId = mesh;spark.materialId = index < 4 ? 'tod:contact-core' : 'tod:contact-tail';
    }
    for (let index = 0; index < 4; index++) add(`trail:${index}`, 'tod:sphere', 'tod:guard', [0, 0, 0], [0, 0, 0]);
    for (let index = 0; index < 12; index++) {
      add(`dust:${index}`, 'tod:sphere', 'tod:dust', [0, 0, 0], [0, 0, 0]);
    }
    for (let index = 0; index < 24; index++) {
      add(`shield:${index}`, 'tod:sphere', index < 12 ? 'tod:shield-edge' : 'tod:ink', [0, 0, 0], [0, 0, 0]);
      add(`parry:${index}`, 'tod:sphere', `${id}:timing`, [0, 0, 0], [0, 0, 0]);
      scene.entities.find(entity => entity.id === `${id}:parry:${index}`)!.materialId = `${id}:timing`;
    }
    for (let index = 0; index < 3; index++) add(`influence:${index}`, 'tod:sphere', 'tod:influence', [0, 0, 0], [0, 0, 0]);
  }
  declaration.budgets = { ...declaration.budgets, entities: Math.max(declaration.budgets.entities, scene.entities.length), materials: Math.max(declaration.budgets.materials, declaration.materials.length) };
}
