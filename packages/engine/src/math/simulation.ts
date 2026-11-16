import { sqrt } from './simulation/sqrt.ts';
export { sqrt } from './simulation/sqrt.ts';
export { sin, cos } from './simulation/trig.ts';
export { atan2 } from './simulation/atan.ts';
export { acos } from './simulation/acos.ts';

/** Fixed-order, scaled norm for simulation. No platform-specific libm dispatch. */
export function hypot(...values: number[]): number {
  let maximum = 0;
  for (const value of values) {
    const absolute = Math.abs(value);
    if (absolute === Infinity) return Infinity;
    maximum = Math.max(maximum, absolute);
  }
  if (maximum === 0) return 0;
  let sum = 0;
  for (const value of values) { const scaled = value / maximum;sum += scaled * scaled; }
  return sqrt(sum) * maximum;
}
