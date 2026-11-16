import type { CombatProject3D, Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

/** The retained breach wall is a porch return, not an orphaned slab in the court. */
export function attachResidentialDivider({ declaration, combat }: { declaration: Hyperfocus3DDeclaration; combat: CombatProject3D }) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!;
  const divider = scene.entities.find(entity => entity.id === 'tod:city:district:residential:divider')!;
  const porch = scene.entities.find(entity => entity.id === 'tod:city:overhaul:residential:entrance:0:wall')!;
  const layout = combat.arenaLayouts!.find(layout => layout.id === 'residential')!;
  const anchor = [...divider.position];
  const heightScale = 1.4 / divider.scale[1], depthScale = .9 / divider.scale[2];
  for (const entity of scene.entities.filter(entity => /^tod:city:district:residential:(divider|crack:|debris:)/.test(entity.id))) {
    const offset = entity.position.map((value, axis) => value - anchor[axis]!);
    const debris = entity.id.includes(':debris:');
    const height = debris ? entity.position[1] : 1.4 + offset[1]! * heightScale;
    if (!debris) entity.scale[1] *= heightScale;
    entity.scale[2] *= depthScale;
    // The two wall faces meet exactly at the porch's left front corner. The
    // shorter one-storey return leaves the windows visible. Broken forms stay
    // on the floor while crack spacing follows the resized physical panel.
    entity.position = [porch.position[0] - 1.66 + offset[0]!, height, porch.position[2] + .9 + offset[2]! * depthScale];
    for (const variant of layout.variants) {
      const wall = variant.props.find(prop => prop.entityId === porch.id)!;
      variant.props.push({ entityId: entity.id, position: [wall.position[0] - 1.66 + offset[0]!, height, wall.position[2] + .9 + offset[2]! * depthScale] });
    }
  }
}
