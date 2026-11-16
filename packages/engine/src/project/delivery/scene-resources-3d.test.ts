import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../3d/combat-motion-fixture.ts';
import { readHyperfocus3DDeclaration } from '../3d/runtime/preflight.ts';
import { createHyperfocus3DRuntime } from '../runtime-3d.ts';
import { sceneResources3D } from './scene-resources-3d.ts';

test('appearance suffix references retain replaceable placeholder resources without retaining unrelated textures', async () => {
  const fixture = await combatMotionFixture();
  const declaration = readHyperfocus3DDeclaration(fixture.project);
  if (!declaration) throw new Error('Missing fixture declaration');
  const material = declaration.materials[0]; if (!material) throw new Error('Missing fixture material');
  declaration.materials.push({ ...material, id: 'a:shirt' });
  declaration.textures.push(
    { id: 'a:print', assetId: 'print', width: 1, height: 1, filter: 'nearest', wrap: 'clamp', flipY: false },
    { id: 'unreachable', assetId: 'other-print', width: 1, height: 1, filter: 'nearest', wrap: 'clamp', flipY: false },
  );
  const project = { ...fixture.project, extensions: { ...fixture.project.extensions, hyperfocus3D: declaration,
    hyperfocusAppearance: { version: 1, actors: [{ entityId: 'a' }],
      slots: [{ id: 'color', label: 'Color', defaultOptionId: 'plain', options: [{ id: 'plain', label: 'Plain', colors: [{ materialSuffix: ':shirt', baseColor: [1, 1, 1, 1] }] }] }],
      textureSlots: [{ id: 'print', label: 'Print', materialSuffix: ':shirt', textureSuffix: ':print' }],
    },
  } };
  const original = JSON.stringify(project);
  const resources = sceneResources3D({ project, declaration });
  expect(resources.textures.map(texture => texture.id)).toEqual(['a:print']);
  expect(resources.materials.map(material => material.id)).toContain('a:shirt');
  const pixels = new Uint8Array([255, 255, 255, 255]);
  const runtime = await createHyperfocus3DRuntime(project, [...fixture.assets, { id: 'print', mimeType: 'application/octet-stream', bytes: pixels }]);
  expect(() => runtime.replaceTexture({ textureId: 'a:print', width: 1, height: 1, pixels: new Uint8Array([1, 2, 3, 4]) })).not.toThrow();
  expect(() => runtime.resetTexture({ textureId: 'a:print' })).not.toThrow();
  expect(() => runtime.replaceTexture({ textureId: 'unreachable', width: 1, height: 1, pixels })).toThrow('missing');
  expect(JSON.stringify(project)).toBe(original);
});
