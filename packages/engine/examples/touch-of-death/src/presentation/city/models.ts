import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { cookPrimitiveModel, type PrimitivePart } from '@hyperfocus/engine/assets/model-cooking';
import { cityLoft, cookCityFacets, cookCityTruss } from './mesh-cooking.ts';
import { cookCityVehicleModels } from './vehicles/models.ts';
import { cookCityWreckPanel } from './vehicles/wrecks.ts';

type Point = [number, number, number];
const kinds = ['fragment-a', 'fragment-b', 'fragment-c', 'train-shell', 'machine-housing', 'breaker', 'track', 'truss', 'timber-brace', 'handrail', 'car-body', 'car-cabin', 'vehicle-wheel', 'wreck-panel', 'flame'] as const;

export function cookTouchOfDeathCityModels() {
  const models: Record<string, { name: string; bytes: Uint8Array }> = {};
  const add = (kind: string, bytes: Uint8Array) => { models[kind] = { name: `touch-of-death-city-${kind}.glb`, bytes }; };
  const flameRing = (y: number, width: number, lean: number): Point[] => [[-width + lean, y, -width], [width + lean, y, -width], [width + lean, y, width], [-width + lean, y, width]];
  add('flame', cookCityFacets('Faceted flame tongue with a leaning point', cityLoft([flameRing(-1, .5, 0), flameRing(-.2, .8, 0), flameRing(.45, .35, .15), flameRing(1, .025, .4)])));
  for (const [kind, bytes] of Object.entries(cookCityVehicleModels())) add(kind, bytes);
  add('wreck-panel', cookCityWreckPanel());
  for (let seed = 0; seed < 3; seed++) {
    const rings = [-1, -.25, .72, 1].map((height, row) => Array.from({ length: 7 }, (_, i): Point => {
      const angle = i / 7 * Math.PI * 2, radius = (row === 0 || row === 3 ? .58 : 1) * (.72 + ((i * 3 + row * 2 + seed) % 5) * .065);
      return [Math.cos(angle) * radius, height, Math.sin(angle) * radius];
    }));
    add(kinds[seed]!, cookCityFacets('Fractured concrete with chipped facets', cityLoft(rings)));
  }
  const ring = (y: number, width: number, depth: number): Point[] => Array.from({ length: 8 }, (_, i) => [Math.cos(i / 8 * Math.PI * 2 + Math.PI / 8) * width, y, Math.sin(i / 8 * Math.PI * 2 + Math.PI / 8) * depth]);
  const housing = cityLoft([ring(-1, .83, .86), ring(-.7, 1.08, 1.08), ring(.65, 1.08, 1.08), ring(1, .82, .86)]);
  add('machine-housing', cookCityFacets('Chamfered industrial cast housing', housing));
  add('breaker', cookCityFacets('Stepped hydraulic breaker body', cityLoft([ring(-1, .42, .42), ring(-.6, .42, .42), ring(-.48, 1, 1), ring(.7, 1, 1), ring(1, .76, .76)])));
  const profile: Array<[number, number]> = [[-.85, -1], [.55, -1], [.9, -.72], [1, -.25], [1, .4], [.78, .86], [.45, 1], [-.75, 1], [-1, .72], [-1, -.7]];
  // Loft Y is remapped to the rail car's X axis; the rounded shoulder breaks its box outline.
  const carRings = [-1, -.88, .88, 1].map((x, row) => profile.map(([y, z]): Point => [y * (row === 0 || row === 3 ? .88 : 1), x, z * (row === 0 || row === 3 ? .9 : 1)]));
  add('train-shell', cookCityFacets('Chamfered rail car body', cityLoft(carRings).map(face => face.map(([y, x, z]): Point => [x, y, -z]))));
  const track: PrimitivePart[] = [['capsule', 0, 0, 0, 1, 1, .28, 0, 0, Math.PI / 2]];
  for (let i = 0; i < 9; i++) for (const side of [-1, 1]) track.push(['box', -.8 + i * .2, side * .86, 0, .06, .14, 1, 0, 0, 0]);
  add('track', cookPrimitiveModel({ label: 'Rounded track with separate tread shoes', parts: track }));
  add('truss', cookCityTruss());
  // Longitudinal Y matches the ordinary held-object presenter. End tabs and
  // collars identify salvaged building parts at fighting-camera distance.
  add('timber-brace', cookPrimitiveModel({ label: 'Timber brace with cut shoulders', parts: [
    ['box', 0, 0, 0, 1, .88, .7, 0, 0, 0],
    ['box', 0, -.91, 0, .78, .09, .62, 0, 0, 0],
    ['box', 0, .91, 0, .7, .09, .62, 0, 0, 0],
    ['box', 0, -.62, 0, 1.12, .035, .82, 0, 0, 0],
  ] }));
  add('handrail', cookPrimitiveModel({ label: 'Detached handrail with welded mounting tabs', parts: [
    ['capsule', 0, 0, 0, .75, .88, .75, 0, 0, 0],
    ['box', 0, -.65, 1.05, .5, .035, 1.2, 0, 0, 0],
    ['box', 0, .65, 1.05, .5, .035, 1.2, 0, 0, 0],
    ['box', 0, -.65, 2.15, .95, .07, .15, 0, 0, 0],
    ['box', 0, .65, 2.15, .95, .07, .15, 0, 0, 0],
  ] }));
  return models;
}

/** Imported assets remain normal editable project mesh references. */
export function applyTouchOfDeathCityModels(options: { declaration: Hyperfocus3DDeclaration; assets: Readonly<Record<string, string>> }) {
  for (const kind of kinds) if (!options.assets[kind]) throw new Error(`Missing city model ${kind}.`);
  for (const kind of kinds) {
    const id = `tod:city-model:${kind}`, existing = options.declaration.meshes.find(mesh => mesh.id === id);
    if (existing) existing.assetId = options.assets[kind]!;
    else options.declaration.meshes.push({ id, assetId: options.assets[kind]!, primitive: 0, buffers: [] });
  }
  applyInstalledCityModels(options.declaration);
  options.declaration.budgets = { ...options.declaration.budgets, meshes: Math.max(options.declaration.budgets.meshes, options.declaration.meshes.length), vertices: Math.max(options.declaration.budgets.vertices, 160_000), indices: Math.max(options.declaration.budgets.indices, 600_000) };
}

export function applyInstalledCityModels(declaration: Hyperfocus3DDeclaration) {
  const scene = declaration.scenes.find(value => value.id === declaration.activeSceneId);
  if (!scene) return;
  const installed = new Set(declaration.meshes.map(mesh => mesh.id));
  for (const entity of scene.entities) {
    let kind: string | undefined;
    if (/^tod:city:hazards:(?:fire|worksite-fire|residential-boiler):zone$/.test(entity.id)) kind = 'flame';
    if (/^tod:city:traffic:car-[^:]+:body$/.test(entity.id)) kind = 'car-body';
    if (/^tod:city:traffic:car-[^:]+:(?:cabin|side-glass:shell)$/.test(entity.id)) kind = 'car-cabin';
    if (/^tod:city:traffic:car-[^:]+:wheel:/.test(entity.id)) kind = 'vehicle-wheel';
    if (/^tod:city:traffic:car-[^:]+:wreck-mark:(hood|roof)$/.test(entity.id)) {
      kind = 'wreck-panel';
      if (installed.has('tod:city-model:wreck-panel')) entity.scale[1] = entity.id.endsWith(':hood') ? .8 : .55;
    }
    if (entity.id.startsWith('tod:city:tool:') && !/:(wear|fragment):/.test(entity.id)) kind = entity.id.includes('timber-brace') ? 'timber-brace' : 'handrail';
    if (/^tod:city:(weak-wall-debris|floor-debris):/.test(entity.id) || /^tod:city:infill:.*:debris:/.test(entity.id)) kind = kinds[Number(entity.id.split(':').at(-1)) % 3];
    else if (/^tod:city:train:\d+$/.test(entity.id)) kind = 'train-shell';
    else if (/^tod:city:demolition-track:/.test(entity.id)) kind = 'track';
    else if (entity.id === 'tod:city:demolition-boom') kind = 'truss';
    else if (entity.id === 'tod:city:demolition-tool') kind = 'breaker';
    else if (entity.id === 'tod:city:demolition-base' || entity.id === 'tod:city:demolition-cab') kind = 'machine-housing';
    if (kind && installed.has(`tod:city-model:${kind}`)) entity.meshId = `tod:city-model:${kind}`;
  }
}
