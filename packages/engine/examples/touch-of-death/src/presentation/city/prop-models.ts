import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { cookPrimitiveModel, type PrimitivePart } from '@hyperfocus/engine/assets/model-cooking';

export const cityPropKinds = ['barrel', 'crate', 'statue', 'bench', 'table', 'ladder', 'column'] as const;
const b = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rz = 0): PrimitivePart => ['box', x, y, z, sx, sy, sz, 0, 0, rz];

/** Reusable composite geometry keeps a busy street to one draw instance per object. */
export function cookCityPropModels() {
  const parts: Record<typeof cityPropKinds[number], PrimitivePart[]> = {
    barrel: [['capsule', 0, 0, 0, .86, .9, .86, 0, 0, 0], ['capsule', 0, -.65, 0, 1, .1, 1, 0, 0, 0], ['capsule', 0, .65, 0, 1, .1, 1, 0, 0, 0]],
    crate: [b(0, 0, 0, .88, .88, .88), ...[-.72, .72].flatMap(x => [b(x, 0, -.94, .09, 1, .06), b(x, 0, .94, .09, 1, .06)]), b(0, -.7, .96, 1, .09, .04), b(0, .7, .96, 1, .09, .04)],
    statue: [b(0, -.8, 0, 1, .2, 1), ['capsule', 0, -.05, 0, .47, .6, .44, 0, 0, 0], ['sphere', 0, .72, 0, .4, .3, .4, 0, 0, 0], b(-.62, -.08, 0, .13, .42, .18, -.2), b(.62, -.08, 0, .13, .42, .18, .2)],
    bench: [b(0, .04, 0, 1, .12, 1), b(0, .66, -.8, 1, .34, .13), ...[-.72, .72].map(x => b(x, -.45, 0, .12, .55, .75))],
    table: [b(0, .88, 0, 1, .12, 1), ...[-.72, .72].flatMap(x => [-.72, .72].map(z => b(x, -.06, z, .1, .94, .1)))],
    ladder: [b(-.82, 0, 0, .14, 1, .5), b(.82, 0, 0, .14, 1, .5), ...[-.75, -.4, -.05, .3, .65].map(y => b(0, y, 0, .82, .055, .5))],
    column: [b(0, -.9, 0, 1, .1, 1), b(0, .9, 0, 1, .1, 1), ['capsule', 0, 0, 0, .67, .8, .67, 0, 0, 0]],
  };
  const models: Record<string, { name: string; bytes: Uint8Array }> = {};
  for (const kind of cityPropKinds) {
    models[kind] = { name: `touch-of-death-prop-${kind}.glb`, bytes: cookPrimitiveModel({ label: `Destructible ${kind}`, parts: parts[kind] }) };
    const wooden = ['crate', 'bench', 'table', 'ladder'].includes(kind);
    const broken: PrimitivePart[] = wooden ? [b(-.2, -.15, -.4, .8, .15, .13, -.12), b(.2, .08, .15, .7, .12, .16, .2), b(-.35, .35, .5, .5, .1, .13, -.35)]
      : [b(-.35, -.2, -.25, .6, .5, .5, .25), ['sphere', .45, .1, .2, .55, .65, .6, 0, 0, 0], b(-.25, .45, .55, .4, .25, .35, -.35)];
    models[`${kind}-broken`] = { name: `touch-of-death-prop-${kind}-broken.glb`, bytes: cookPrimitiveModel({ label: `Broken ${kind}`, parts: broken }) };
  }
  return models;
}

export function applyCityPropModels({ declaration, assets }: { declaration: Hyperfocus3DDeclaration; assets: Readonly<Record<string, string>> }) {
  for (const kind of cityPropKinds) for (const suffix of ['', '-broken']) {
    const key = kind + suffix, id = `tod:city-prop-model:${key}`, assetId = assets[key];
    if (!assetId) throw new Error(`Missing prop model ${key}.`);
    const existing = declaration.meshes.find(mesh => mesh.id === id);
    if (existing) existing.assetId = assetId;else declaration.meshes.push({ id, assetId, primitive: 0, buffers: [] });
  }
  for (const scene of declaration.scenes) for (const entity of scene.entities) {
    const match = /^tod:city:prop:([^:]+):\d+(?::debris:\d+)?$/.exec(entity.id);
    if (match) entity.meshId = `tod:city-prop-model:${match[1]}${entity.id.includes(':debris:') ? '-broken' : ''}`;
  }
  declaration.budgets = { ...declaration.budgets, meshes: Math.max(declaration.budgets.meshes, declaration.meshes.length), vertices: Math.max(declaration.budgets.vertices, 200_000), indices: Math.max(declaration.budgets.indices, 700_000) };
}
