import { requireRecord } from '@hyperfocus/utilities/records';
import { requireText } from '@hyperfocus/utilities/text';
import { requireArray, requireNumber, requireOneOf } from '@hyperfocus/utilities/validation';
import type { ParticleSnapshot3D } from './emitter.ts';

/** Structural reading has no recipe, emitter, simulation or defaulting side effects. */
export function readParticleSnapshot3D(value: unknown): ParticleSnapshot3D {
  const row = requireRecord(value), anchor = requireRecord(row.anchor), p = requireArray(anchor.position, { minimum: 3, maximum: 3 }), q = requireArray(anchor.rotation, { minimum: 4, maximum: 4 }), d = requireRecord(row.diagnostics);
  return structuredClone({ ...row, version: requireOneOf(row.version, [1]), recipe: requireText(row.recipe), seed: requireNumber(row.seed), accumulator: requireNumber(row.accumulator), emission: requireNumber(row.emission), rate: requireNumber(row.rate),
    anchor: { ...anchor, position: [requireNumber(p[0]), requireNumber(p[1]), requireNumber(p[2])], rotation: [requireNumber(q[0]), requireNumber(q[1]), requireNumber(q[2]), requireNumber(q[3])] },
    free: requireArray(row.free).map(value => requireNumber(value)), particles: requireArray(row.particles).map(value => { const item = requireRecord(value);return { ...item, slot: requireNumber(item.slot), values: requireArray(item.values).map(value => requireNumber(value)) }; }),
    diagnostics: { ...d, emitted: requireNumber(d.emitted), dropped: requireNumber(d.dropped), expired: requireNumber(d.expired), collisions: requireNumber(d.collisions), steps: requireNumber(d.steps), highWater: requireNumber(d.highWater) } });
}
