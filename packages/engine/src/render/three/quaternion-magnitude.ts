export type QuaternionMagnitudeStrategy3D = 'original' | 'bounded';

/** Validation-only magnitude predicate. The owning transform validator must
 * first check all four components for finiteness and validate its live handle.
 * This does not normalize a quaternion or certify caller-owned input storage.
 * A component above the threshold proves the Euclidean norm exceeds it; the
 * original scaled hypot remains the oracle for every near-threshold input. */
export function createQuaternionMagnitudeTest3D(strategy: QuaternionMagnitudeStrategy3D, epsilon: number) {
  if (strategy !== 'original' && strategy !== 'bounded') throw Error(`Unsupported quaternion magnitude strategy: ${strategy}`);
  if (!Number.isFinite(epsilon) || epsilon <= 0) throw RangeError('Quaternion magnitude epsilon must be positive and finite.');
  const work = { checks: 0, hypotCalls: 0, boundAccepts: 0, fallbacks: 0 };
  const original = (x: number, y: number, z: number, w: number) => {
    work.checks++;work.hypotCalls++;
    return Math.hypot(x, y, z, w) > epsilon;
  };
  const bounded = (x: number, y: number, z: number, w: number) => {
    work.checks++;
    if (Math.abs(w) > epsilon || Math.abs(x) > epsilon || Math.abs(y) > epsilon || Math.abs(z) > epsilon) {
      work.boundAccepts++;return true;
    }
    work.fallbacks++;work.hypotCalls++;
    return Math.hypot(x, y, z, w) > epsilon;
  };
  return { test: strategy === 'original' ? original : bounded, work,
    resetWork() { work.checks = work.hypotCalls = work.boundAccepts = work.fallbacks = 0; } };
}
