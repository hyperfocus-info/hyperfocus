import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { cityLoft, cookCityFacets } from '../mesh-cooking.ts';

type Point = [number, number, number];

/** Few broad facets keep the cars deliberately crude without using a box for every silhouette. */
export function cookCityVehicleModels() {
  const section: Array<[number, number]> = [[-1, -.72], [-1, .45], [-.83, 1], [.83, 1], [1, .45], [1, -.72], [.8, -1], [-.8, -1]];
  const body = cityLoft([-1, -.82, .86, 1].map((z, i) => [...section].reverse().map(([x, y]): Point => [x * (i === 0 || i === 3 ? .9 : 1), z, y * (i === 0 ? .77 : 1)])))
    .map(face => face.map(([x, z, y]): Point => [x, y, -z]));
  const cabin = cityLoft([
    [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
    [[-.83, 1, -.72], [.83, 1, -.72], [.83, 1, .64], [-.83, 1, .64]],
  ]);
  // Wheel axle is X; cylinders are faceted rather than smooth spheres.
  const wheel = cityLoft([-.9, -.68, .68, .9].map((x, row) => Array.from({ length: 12 }, (_, i): Point => {
    const angle = i / 12 * Math.PI * 2, radius = row === 0 || row === 3 ? .86 : 1;
    return [Math.cos(angle) * radius, x, Math.sin(angle) * radius];
  }))).map(face => face.map(([y, x, z]): Point => [x, y, -z]));
  return {
    'car-body': cookCityFacets('Pressed steel car body with broad shoulders', body),
    'car-cabin': cookCityFacets('Tapered passenger cabin', cabin),
    'vehicle-wheel': cookCityFacets('Twelve-sided rubber wheel', wheel),
  };
}

/** All detail shares the moving body's authored motion and adds no collision bodies. */
export function dressCityVehicles({ declaration }: { declaration: Hyperfocus3DDeclaration }) {
  const scene = declaration.scenes.find(scene => scene.id === declaration.activeSceneId);
  if (!scene) return;
  const colors: Array<[string, [number, number, number, number]]> = [
    ['rubber', [.065, .073, .075, 1]], ['metal', [.43, .46, .44, 1]],
    ['glass', [.105, .175, .185, 1]], ['slate', [.31, .40, .39, 1]], ['clay', [.49, .365, .27, 1]],
  ];
  declaration.materials = declaration.materials.filter(material => !colors.some(([name]) => material.id === `tod:city:vehicle-${name}`));
  for (const [name, baseColor] of colors) declaration.materials.push({ id: `tod:city:vehicle-${name}`, shading: 'lit', baseColor, metallic: name === 'metal' ? .4 : 0, roughness: name === 'glass' ? .3 : .85, doubleSided: false });
  for (const id of ['car-east', 'car-west']) {
    const prefix = `tod:city:traffic:${id}:`, body = scene.entities.find(entity => entity.id === prefix + 'body');
    const cabin = scene.entities.find(entity => entity.id === prefix + 'cabin');
    if (!body?.animation || !cabin) continue;
    const paint = `tod:city:vehicle-${id === 'car-east' ? 'slate' : 'clay'}`;
    body.materialId = paint;cabin.materialId = paint;
    const part = (name: string, materialId: string, offset: Point, scale: Point, meshId = 'tod:box') => {
      scene.entities.push({ id: prefix + name, materialId, meshId, position: [body.position[0] + offset[0], offset[1], body.position[2] + offset[2]], scale, rotationY: 0, animation: structuredClone(body.animation) });
    };
    scene.entities = scene.entities.filter(entity => !entity.id.startsWith(prefix + 'side-glass:') && !entity.id.startsWith(prefix + 'windshield:'));
    for (const entity of scene.entities.filter(entity => entity.id.startsWith(prefix))) {
      if (entity.id.includes(':wheel:')) entity.materialId = 'tod:city:vehicle-rubber';
    }
    // A matching tapered shell keeps glass on the cabin faces instead of floating rectangles.
    part('side-glass:shell', 'tod:city:vehicle-glass', [0, 1.55, -.2], [.858, .453, 1.153]);
    part('roof-cap', paint, [0, 2.012, -.246], [.716, .035, .79]);
    for (const side of [-1, 1]) {
      part(`window-pillar:${side}`, paint, [side * .802, 1.56, -.2], [.06, .40, .055]);
      part(`door-seam:${side}`, 'tod:city:vehicle-rubber', [side * .956, .92, -.2], [.012, .25, .016]);
      part(`door-handle:${side}`, 'tod:city:vehicle-metal', [side * .968, 1.12, -.46], [.025, .035, .14]);
      for (const end of [-1, 1]) part(`hub:${side}:${end}`, 'tod:city:vehicle-metal', [side * 1.138, .35, end * 1.43], [.02, .19, .045]);
    }
    part('front-grille', 'tod:city:vehicle-rubber', [0, .70, 2.215], [.48, .105, .018]);
    part('rear-plate', 'tod:city:vehicle-metal', [0, .67, -2.212], [.23, .09, .018]);
  }
}
