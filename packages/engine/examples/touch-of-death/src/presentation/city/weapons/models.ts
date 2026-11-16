import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { cookCityFacets } from '../mesh-cooking.ts';
import { CITY_WEAPONS } from './catalogue.ts';
import { cityWeaponFaces } from './silhouettes.ts';
import { bindWrenchSurfaces, cookServiceWrench } from './service-wrench.ts';
import { bindHammerSurfaces, cookServiceHammer } from './sledgehammer.ts';

export function cookCityWeaponModels() {
  return Object.fromEntries(CITY_WEAPONS.map(([key, name]) => [key, { name: `touch-of-death-weapon-${key}.glb`, bytes: key === 'sledgehammer' ? cookServiceHammer() : key === 'wrench' ? cookServiceWrench() : cookCityFacets(name, cityWeaponFaces(key)) }]));
}

export function applyCityWeaponModels({ declaration, assets }: { declaration: Hyperfocus3DDeclaration; assets: Readonly<Record<string, string>> }) {
  for (const [key] of CITY_WEAPONS) {
    const assetId = assets[key];
    if (!assetId) throw new Error(`Missing city weapon model ${key}.`);
    const id = `tod:city-weapon-model:${key}`, existing = declaration.meshes.find(mesh => mesh.id === id);
    if (existing) existing.assetId = assetId; else declaration.meshes.push({ id, assetId, primitive: 0, buffers: [] });
  }
  applyInstalledCityWeaponModels(declaration);
  bindHammerSurfaces(declaration, assets);
  bindWrenchSurfaces(declaration, assets);
  declaration.budgets = { ...declaration.budgets, meshes: Math.max(declaration.budgets.meshes, declaration.meshes.length), vertices: Math.max(declaration.budgets.vertices, 300_000), indices: Math.max(declaration.budgets.indices, 900_000) };
}

export function applyInstalledCityWeaponModels(declaration: Hyperfocus3DDeclaration) {
  const installed = new Set(declaration.meshes.map(mesh => mesh.id));
  for (const scene of declaration.scenes) for (const entity of scene.entities) {
    const match = /^tod:city:weapon:\d+:([^:]+)$/.exec(entity.id);
    const id = match ? `tod:city-weapon-model:${match[1]}` : undefined;
    if (id && installed.has(id)) entity.meshId = id;
  }
}
