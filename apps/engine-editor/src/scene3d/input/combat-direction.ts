/** Resolve physical input once, preserving stick magnitude before camera rotation. */
export function combatInputDirection(options: { actions: ReadonlySet<string>; axes?: ArrayLike<number>; eye: readonly number[]; target: readonly number[] }) {
  let x = Number(options.actions.has('move-right')) - Number(options.actions.has('move-left'));
  let z = Number(options.actions.has('move-down')) - Number(options.actions.has('move-up'));
  if (!x && !z) {
    x = Number(options.axes?.[0] ?? 0);z = Number(options.axes?.[1] ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x, z) < .12) { x = 0;z = 0; }
  }
  const length = Math.max(1, Math.hypot(x, z));
  const bx = options.eye[0]! - options.target[0]!, bz = options.eye[2]! - options.target[2]! || (bx ? 0 : 1), scale = Math.hypot(bx, bz);
  return { x: (x * bz + z * bx) / scale / length, y: 0, z: (-x * bx + z * bz) / scale / length };
}
