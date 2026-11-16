import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

/** Five bounded local lights give useful spaces warmth against the cold city shell. */
export function lightCityEncounters(scene: Hyperfocus3DDeclaration['scenes'][number]) {
  scene.clearColor = [.065, .085, .105, 1];
  for (const light of scene.lights) {
    if (light.id === 'tod:key') { light.direction = [-.4, -1, -.25];light.color = [1, .96, .89];light.intensity = 1.65; }
    if (light.id === 'tod:ambient') { light.color = [.66, .75, .83];light.intensity = .78; }
    if (light.id === 'tod:rim') { light.color = [.48, .64, .72];light.intensity = .3; }
  }
  const lights: Array<[string, [number, number, number], [number, number, number]]> = [
    ['construction', [1, .78, .49], [0, 9, 8]],
    ['market', [1, .81, .57], [50, 9, 18]],
    ['residential', [1, .85, .69], [-50, 9, -18]],
    ['depot', [.78, .87, .9], [0, 9, 42]],
    ['utility', [.76, .86, .73], [0, 9, -42]],
  ];
  for (const [district, color, position] of lights) {
    const id = `tod:city:encounter-light:${district}`;
    const existing = scene.lights.find(light => light.id === id);
    const data = { id, kind: 'point' as const, color, position, intensity: 1.7, range: 18 };
    if (existing) Object.assign(existing, data);else scene.lights.push(data);
  }
}
