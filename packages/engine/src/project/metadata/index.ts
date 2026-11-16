import { assertTimelineRange } from './numeric.ts';

/** Capability detection only; validation belongs to the selected runtime. */
export function hasHyperfocus3DProject(project: unknown): boolean {
  if (!project || typeof project !== 'object' || Array.isArray(project) || !('extensions' in project)
    || !Object.prototype.propertyIsEnumerable.call(project, 'extensions')) return false;
  const extensions = project.extensions;
  return Boolean(extensions && typeof extensions === 'object' && !Array.isArray(extensions)
    && 'hyperfocus3D' in extensions && Object.prototype.propertyIsEnumerable.call(extensions, 'hyperfocus3D') && extensions.hyperfocus3D !== undefined);
}

/** Shared authoring/runtime placement contract without constructing a timeline. */
export function validateTimelineEffectPlacement2D(effect: {
  layer?: 'foreground' | 'background'; space?: 'screen' | 'target'; targetId?: string;
  region?: { fromX: number; fromY: number; toX: number; toY: number };
}) {
  if (effect.layer !== undefined && effect.layer !== 'foreground' && effect.layer !== 'background') throw new Error('Timeline effect layer must be foreground or background.');
  if (effect.space !== undefined && effect.space !== 'screen' && effect.space !== 'target') throw new Error('Timeline effect space must be screen or target.');
  if (effect.space === 'target' && !effect.targetId) throw new Error('Timeline effect target space requires a target.');
  const region = effect.region;
  if (region === undefined) return;
  if (!region || typeof region !== 'object') throw new Error('Timeline effect region is invalid.');
  for (const field of ['fromX', 'fromY', 'toX', 'toY'] as const) {
    assertTimelineRange(region[field], `Timeline effect region ${field}`, 0, 1);
  }
  if (region.fromX >= region.toX || region.fromY >= region.toY) throw new Error('Timeline effect region starts must precede its ends.');
}
