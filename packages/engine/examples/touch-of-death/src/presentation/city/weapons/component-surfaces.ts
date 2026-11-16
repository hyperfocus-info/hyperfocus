import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

export type ComponentSurface = { role: string; color: readonly number[]; roughness: number; metallic: number };

/** Shared by the service hammer and wrench: a component owns color AND response. */
export function componentTextures(key: string, surfaces: readonly ComponentSurface[]) {
  return Object.fromEntries(['color', 'response'].map(kind => [`${key}-${kind}`, {
    name: `service-${key}-${kind}.rgba`, mimeType: 'application/octet-stream',
    bytes: new Uint8Array(surfaces.flatMap(surface => kind === 'color' ? [...surface.color, 255] : [255, Math.round(surface.roughness * 255), Math.round(surface.metallic * 255), 255])),
  }]));
}

export function bindComponentSurfaces(declaration: Hyperfocus3DDeclaration, key: string, surfaces: readonly ComponentSurface[], assets?: Readonly<Record<string, string>>) {
  for (const kind of ['color', 'response']) {
    const id = `tod:city:${key}-${kind}`, assetId = assets?.[`${key}-${kind}`];
    if (assetId) {
      const texture = { id, assetId, width: surfaces.length, height: 1, filter: 'nearest' as const, wrap: 'clamp' as const, flipY: false };
      const index = declaration.textures.findIndex(item => item.id === id);
      if (index < 0) declaration.textures.push(texture); else declaration.textures[index] = texture;
    }
  }
  if (!declaration.textures.some(texture => texture.id === `tod:city:${key}-color`)) return;
  for (const material of declaration.materials.filter(material => material.id === `tod:city:weapon-material:${key}` || material.id === `tod:city:weapon-material:${key}:pickup-outline`)) {
    material.baseColor = [1, 1, 1, 1];material.metallic = 1;material.roughness = 1;
    material.textureIds = { ...material.textureIds, baseColor: `tod:city:${key}-color`, metallicRoughness: `tod:city:${key}-response` };
  }
  declaration.budgets = { ...declaration.budgets,
    textures: Math.max(declaration.budgets.textures, declaration.textures.length),
    textureBytes: Math.max(declaration.budgets.textureBytes, declaration.textures.reduce((bytes, texture) => bytes + texture.width * texture.height * 4, 0)),
  };
}
