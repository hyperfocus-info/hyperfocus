import type { ParticleRecipe3D } from './contracts.ts';
import type { ParticleSnapshot3D } from './emitter.ts';

function object(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error('Unknown particle field: ' + key);return true;
}
const numeric = (value: unknown): value is number[] => Array.isArray(value) && value.every(v => typeof v === 'number');
/** Structural narrowing only. Bounds and semantic invariants are validated by the owning reader. */
export function particleRecipeStructure(value: unknown): value is ParticleRecipe3D {
  if (!object(value, ['capacity', 'seed', 'space', 'lifetime', 'speed', 'size', 'shape', 'direction', 'spreadRadians', 'gravity', 'drag', 'turbulence', 'sizeOverLife', 'colorOverLife', 'rotation', 'angularVelocity', 'atlas', 'collision'])) return false;
  if (['capacity', 'seed', 'spreadRadians', 'drag'].some(k => typeof value[k] !== 'number') || ['lifetime', 'speed', 'size', 'direction', 'gravity', 'rotation', 'angularVelocity'].some(k => !numeric(value[k]))) return false;
  if (!object(value.shape, ['kind', 'radius', 'surface', 'halfExtents', 'thickness'])) return false;
  const s = value.shape;
  const shapeKeys = s.kind === 'point' ? ['kind'] : s.kind === 'sphere' ? ['kind', 'radius', 'surface'] : s.kind === 'box' ? ['kind', 'halfExtents'] : s.kind === 'ring' ? ['kind', 'radius', 'thickness'] : [];
  if (!shapeKeys.length || !object(s, shapeKeys)) return false;
  if (s.kind === 'box' && !numeric(s.halfExtents) || ['ring', 'sphere'].includes(String(s.kind)) && typeof s.radius !== 'number' || s.kind === 'ring' && typeof s.thickness !== 'number' || s.surface !== undefined && typeof s.surface !== 'boolean') return false;
  const size = value.sizeOverLife, color = value.colorOverLife;
  if (!Array.isArray(size) || !size.every(v => numeric(v) && v.length === 2) || !Array.isArray(color) || !color.every(v => Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && numeric(v[1]))) return false;
  for (const [key, keys] of [['turbulence', ['strength', 'frequency']], ['atlas', ['columns', 'rows', 'cycles', 'randomStart']], ['collision', ['restitution', 'friction', 'maxBounces', 'response']]] as const) if (value[key] !== undefined && !object(value[key], [...keys])) return false;
  if (value.atlas && object(value.atlas, ['columns', 'rows', 'cycles', 'randomStart']) && value.atlas.randomStart !== undefined && typeof value.atlas.randomStart !== 'boolean') return false;
  return true;
}
export function particleSnapshotStructure(value: unknown): value is ParticleSnapshot3D {
  if (!object(value, ['version', 'recipe', 'seed', 'accumulator', 'emission', 'rate', 'anchor', 'free', 'particles', 'diagnostics'])) return false;
  if (!numeric(value.free) || !Array.isArray(value.particles) || !value.particles.every(p => object(p, ['slot', 'values']) && typeof p.slot === 'number' && numeric(p.values))) return false;
  if (!object(value.anchor, ['position', 'rotation']) || !numeric(value.anchor.position) || !numeric(value.anchor.rotation)) return false;
  return object(value.diagnostics, ['emitted', 'dropped', 'expired', 'collisions', 'steps', 'highWater']);
}
