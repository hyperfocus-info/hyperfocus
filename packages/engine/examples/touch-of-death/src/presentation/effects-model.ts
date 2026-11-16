import { cookStaticModel } from '@hyperfocus/engine/assets/model-cooking';
import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

/** Eight tapered faces, centered on Y: a force stroke, not a glowing bead. */
export function cookTouchOfDeathImpactModel() {
  const points = [[0, -1, 0], [1, -.35, 0], [0, -.35, 1], [-1, -.35, 0], [0, -.35, -1], [0, 1, 0]];
  const faces = [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], [5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4]];
  const positions: number[] = [], normals: number[] = [];
  for (const face of faces) {
    const [a, b, c] = face.map(index => points[index]!);
    const ux = b![0]! - a![0]!, uy = b![1]! - a![1]!, uz = b![2]! - a![2]!;
    const vx = c![0]! - a![0]!, vy = c![1]! - a![1]!, vz = c![2]! - a![2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, length = Math.hypot(nx, ny, nz);
    for (const index of face) { positions.push(...points[index]!);normals.push(nx / length, ny / length, nz / length); }
  }
  const bytes = cookStaticModel({ label: 'Tapered contact stroke', positions, normals, generator: 'Touch of Death impact stroke' });
  return { name: 'touch-of-death-impact-stroke.glb', bytes };
}

/** Existing projects upgrade the same twelve contact entities without touching physics or poses. */
export function applyTouchOfDeathImpactModel(options: { declaration: Hyperfocus3DDeclaration; assetId: string; fighterIds: readonly string[] }) {
  const { declaration, assetId, fighterIds } = options;
  const mesh = declaration.meshes.find(item => item.id === 'tod:impact-shard');
  if (mesh) mesh.assetId = assetId;
  else declaration.meshes.push({ id: 'tod:impact-shard', assetId, primitive: 0, buffers: [] });
  for (const scene of declaration.scenes) for (const entity of scene.entities) {
    if (fighterIds.some(id => entity.id.startsWith(`${id}:spark:`))) entity.meshId = 'tod:impact-shard';
  }
  declaration.budgets = { ...declaration.budgets, meshes: Math.max(declaration.budgets.meshes, declaration.meshes.length) };
}
