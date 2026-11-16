import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { createMat4, lookAtViewMat4, multiplyMat4, orthographicMat4 } from '@hyperfocus/engine/render/3d-core';

/** A stable sunlight volume for the authored city; unrelated projects allocate no map. */
export function createGameplayShadows3D(options: { declaration: Hyperfocus3DDeclaration }) {
  const scene = options.declaration.scenes.find(value => value.id === options.declaration.activeSceneId);
  if (!scene?.entities.some(entity => entity.id === 'tod:city:street')) return undefined;
  // The existing renderer shadows its first directional light only.
  const light = scene.lights.find(value => value.kind === 'directional');
  if (light?.id !== 'tod:key' || !light.direction || light.intensity <= 0) return undefined;
  const direction = light.direction, length = Math.hypot(...direction);
  if (!Number.isFinite(length) || length < .0001) return undefined;
  const view = createMat4(), projection = createMat4(), matrix = createMat4();
  const street = scene.entities.find(entity => entity.id === 'tod:city:street')!;
  const halfX = Math.max(18, street.scale[0] + 2), halfZ = Math.max(14, street.scale[2] + 2);
  const distance = Math.max(70, Math.hypot(halfX, halfZ) + 40);
  const target: [number, number, number] = [0, 15, 0];
  const eye: [number, number, number] = [-direction[0] / length * distance, 15 - direction[1] / length * distance, -direction[2] / length * distance];
  lookAtViewMat4(view, eye, target, Math.abs(direction[1] / length) > .95 ? [0, 0, 1] : [0, 1, 0]);
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity, near = Infinity, far = -Infinity;
  // The fixed playable city plus its tallest crowns and launched fighters.
  // Fitting once avoids camera-follow shadow swimming and per-frame allocation.
  for (const x of [-halfX, halfX]) for (const y of [-1, 32]) for (const z of [-halfZ, halfZ]) {
    const sx = view[0]! * x + view[4]! * y + view[8]! * z + view[12]!;
    const sy = view[1]! * x + view[5]! * y + view[9]! * z + view[13]!;
    const depth = -(view[2]! * x + view[6]! * y + view[10]! * z + view[14]!);
    left = Math.min(left, sx); right = Math.max(right, sx);
    bottom = Math.min(bottom, sy); top = Math.max(top, sy);
    near = Math.min(near, depth); far = Math.max(far, depth);
  }
  orthographicMat4(projection, { left: left - 1, right: right + 1, bottom: bottom - 1, top: top + 1, near: near - 2, far: far + 2 });
  multiplyMat4(matrix, projection, view);
  return { directionalShadowMapSize: 2048, renderOptions: { shadowViewProjection: matrix, shadowBias: .0007 } };
}
