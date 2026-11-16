import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

const prefix = 'tod:city:residents:';
type Vec3 = [number, number, number];
const galleries = [{ id: 'west', x: -42, roles: ['resident', 'worker'] }, { id: 'central', x: -5.5, roles: ['worker', 'resident'] }, { id: 'east', x: 38, roles: ['resident', 'resident'] }] as const;

/** Background occupants behind the existing north safety screen, never combat bodies or targets. */
export function authorCityResidents({ declaration }: { declaration: Hyperfocus3DDeclaration }) {
  const scene = declaration.scenes.find(item => item.id === declaration.activeSceneId);
  const screen = scene?.entities.find(entity => entity.id === 'tod:city:rail-screen:0');
  if (!scene || !screen?.physics || screen.position[2] > -40) throw Error('Resident galleries require the expanded city safety screen.');
  scene.entities = scene.entities.filter(entity => !entity.id.startsWith(prefix));
  declaration.materials = declaration.materials.filter(material => !material.id.startsWith(prefix));
  for (const [name, color] of [['cloth', [.29, .35, .32, 1]], ['workwear', [.48, .37, .22, 1]], ['skin', [.52, .43, .34, 1]], ['frame', [.15, .18, .19, 1]]] as const) {
    declaration.materials.push({ id: prefix + name, shading: 'lit', baseColor: [...color], metallic: 0, roughness: .92, doubleSided: false });
  }
  const add = (id: string, material: string, position: Vec3, scale: Vec3) => {
    const entity: typeof scene.entities[number] = { id: prefix + id, meshId: 'tod:box', materialId: prefix + material, position, scale, rotationY: 0 };
    scene.entities.push(entity);return entity;
  };
  // Service balconies sit behind the train envelope and collision screen, at
  // rooftop eye level. Passing trains can briefly occlude the occupied galleries.
  const z = screen.position[2] - 7.5, floor = 8.2;
  for (const [index, gallery] of galleries.entries()) {
    add(`${gallery.id}:deck`, 'frame', [gallery.x, floor - .12, z], [3.2, .12, .9]);
    add(`${gallery.id}:back`, 'frame', [gallery.x, floor + .8, z - .85], [3.2, .8, .08]);
    for (const height of [.45, 1]) add(`${gallery.id}:rail:${height}`, 'frame', [gallery.x, floor + height, z + .85], [3.2, .04, .04]);
    for (const side of [-1, 1]) add(`${gallery.id}:post:${side}`, 'frame', [gallery.x + side * 3.1, floor + .5, z + .85], [.045, .5, .045]);
    for (const [person, role] of gallery.roles.entries()) {
      const id = `${gallery.id}:person:${person}`, x = gallery.x + (person ? 1.25 : -1.25), cloth = role === 'worker' ? 'workwear' : 'cloth';
      add(`${id}:torso`, cloth, [x, floor + 1.08, z], [.23, .35, .14]);
      const head = add(`${id}:head`, 'skin', [x, floor + 1.62, z + .02], [.17, .19, .17]);head.meshId = 'tod:sphere';
      for (const side of [-1, 1]) {
        add(`${id}:leg:${side}`, 'frame', [x + side * .12, floor + .37, z], [.09, .37, .11]);
        const arm = add(`${id}:arm:${side}`, cloth, [x + side * .3, floor + .97, z + .05], [.075, .3, .08]);
        arm.rotationY = side * .15;
        if (role === 'worker' && side === 1) arm.animation = { kind: 'ping-pong', offset: [0, .1, .08], periodSeconds: 5 + index, phase: person * .3 };
      }
      if (role === 'worker') add(`${id}:cap`, 'workwear', [x, floor + 1.8, z + .025], [.21, .06, .2]);
    }
  }
  declaration.budgets = { ...declaration.budgets, entities: Math.max(declaration.budgets.entities, scene.entities.length + (scene.effectCapacity ?? 0)), materials: Math.max(declaration.budgets.materials, declaration.materials.length) };
}
