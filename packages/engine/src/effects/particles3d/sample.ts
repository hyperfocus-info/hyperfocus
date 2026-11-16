import type { ParticleCurve, ParticleGradient, ParticleTransform3D, ParticleVector3 } from './contracts.ts';
import { particleNumber, vector } from './contracts.ts';

export function sampleParticleCurve3D(keys: ParticleCurve, progress: number) {
  const [left, right, weight] = interval(keys, progress);return keys[left]![1] + (keys[right]![1] - keys[left]![1]) * weight;
}
export function sampleParticleGradient3D(keys: ParticleGradient, progress: number, out: number[]) {
  const [left, right, weight] = interval(keys, progress);
  for (let i = 0; i < 4; i++) out[i] = keys[left]![1][i]! + (keys[right]![1][i]! - keys[left]![1][i]!) * weight;
}
function interval(keys: Array<[number, unknown]>, progress: number): [number, number, number] {
  const p = Math.max(0, Math.min(1, progress));let right = 1;
  while (right < keys.length - 1 && keys[right]![0] < p) right++;
  return [right - 1, right, (p - keys[right - 1]![0]) / (keys[right]![0] - keys[right - 1]![0])];
}
export function particleTransform(input: ParticleTransform3D): Required<ParticleTransform3D> {
  vector(input.position, 'emitter position');const rotation = input.rotation ?? [0, 0, 0, 1];
  if (rotation.length !== 4 || rotation.some(v => !Number.isFinite(v)) || Math.abs(Math.hypot(...rotation) - 1) > .0001) throw new Error('Emitter rotation must be a unit quaternion');
  return { position: [...input.position], rotation: [...rotation] };
}
export function rotateParticleVector(value: readonly number[], q: readonly number[], out: ParticleVector3) {
  const [x, y, z] = value, [qx, qy, qz, qw] = q;
  const tx = 2 * (qy! * z! - qz! * y!), ty = 2 * (qz! * x! - qx! * z!), tz = 2 * (qx! * y! - qy! * x!);
  out[0] = x! + qw! * tx + qy! * tz - qz! * ty;out[1] = y! + qw! * ty + qz! * tx - qx! * tz;out[2] = z! + qw! * tz + qx! * ty - qy! * tx;
  return out;
}
export function randomParticle3D(state: { seed: number }) {
  let value = state.seed = (state.seed + 1831565813) >>> 0;
  value = Math.imul(value ^ value >>> 15, value | 1);value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}
/** Uniform solid-angle cone; no polar clumping. */
export function particleCone3D(direction: ParticleVector3, spread: number, a: number, b: number): ParticleVector3 {
  const length = Math.hypot(...direction), n = direction.map(v => v / length), helper = Math.abs(n[1]!) < .95 ? [0, 1, 0] : [1, 0, 0];
  const ux = helper[1]! * n[2]! - helper[2]! * n[1]!, uy = helper[2]! * n[0]! - helper[0]! * n[2]!, uz = helper[0]! * n[1]! - helper[1]! * n[0]!, uLength = Math.hypot(ux, uy, uz);
  const u = [ux / uLength, uy / uLength, uz / uLength], v = [n[1]! * u[2]! - n[2]! * u[1]!, n[2]! * u[0]! - n[0]! * u[2]!, n[0]! * u[1]! - n[1]! * u[0]!];
  const height = 1 - a * (1 - Math.cos(spread)), radius = Math.sqrt(Math.max(0, 1 - height * height)), angle = b * Math.PI * 2;
  const axis = (i: number) => n[i]! * height + radius * (u[i]! * Math.cos(angle) + v[i]! * Math.sin(angle));
  return [axis(0), axis(1), axis(2)];
}
export function particleDelta(delta: number) { return particleNumber(delta, 0, .25, 'particle delta'); }
