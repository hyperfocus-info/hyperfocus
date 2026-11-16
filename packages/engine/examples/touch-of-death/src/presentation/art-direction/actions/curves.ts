import { smoothstep01 as smooth } from "@hyperfocus/utilities/math";

import { sampleArtMotion, type ArtMotion } from '../motion.ts';
export type Point = ArtMotion['hip'];
export { clamp01 as clamp } from "@hyperfocus/utilities/math";
export { smoothstep01 as smooth } from "@hyperfocus/utilities/math";
export const mix = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const arc = (a: Point, control: Point, b: Point, t: number) => mix(mix(a, control, t), mix(control, b, t), t);
export const ready = (frame = 0) => sampleArtMotion({ kind: 'idle', frame });
export const commitment = (frame: number, startup: number) => smooth((frame - Math.max(0, startup - Math.max(3, startup * .32))) / Math.min(startup, Math.max(3, startup * .32)));
export function phases(frame: number, startup: number, active: number, recovery: number) {
  const load = smooth(frame / Math.max(1, startup * .55));
  const strike = commitment(frame, Math.max(1, startup));
  const recover = smooth((frame - startup - active) / Math.max(1, recovery));
  return { load: load * (1 - strike), strike: strike * (1 - recover), recover,
    phase: frame < startup * .12 ? 'read' : frame < startup * .68 ? 'anticipation' : frame < startup ? 'commitment' : frame < startup + active ? 'impact' : frame < startup + active + 6 ? 'follow-through' : 'recovery' };
}
