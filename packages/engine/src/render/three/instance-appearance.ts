export type InstanceAppearance3D = { color?: ArrayLike<number>; uvRect?: ArrayLike<number> };
export const INSTANCE_APPEARANCE_STRIDE_3D = 8;
export const DEFAULT_INSTANCE_APPEARANCE_3D = new Float32Array([1, 1, 1, 1, 0, 0, 1, 1]);

export function validateInstanceAppearance3D(value: InstanceAppearance3D) {
  for (const [name, vector] of [['color', value.color], ['uvRect', value.uvRect]] as const) {
    if (!vector) continue;
    if (vector.length !== 4) throw new Error(`Instance ${name} requires four values`);
    for (let i = 0; i < 4; i++) if (!Number.isFinite(vector[i]) || vector[i]! < 0 || vector[i]! > 1) throw new Error(`Instance ${name} must be finite from zero to one`);
  }
  if (value.uvRect && (value.uvRect[0]! + value.uvRect[2]! > 1.000001 || value.uvRect[1]! + value.uvRect[3]! > 1.000001)) throw new Error('Instance UV rectangle exceeds its texture');
}
export function createInstanceAppearance3D(capacity: number) {
  const values = new Float32Array(capacity * INSTANCE_APPEARANCE_STRIDE_3D);
  for (let i = 0; i < capacity; i++) values.set(DEFAULT_INSTANCE_APPEARANCE_3D, i * INSTANCE_APPEARANCE_STRIDE_3D);
  return values;
}
export function writeInstanceAppearance3D(values: Float32Array, handle: number, appearance: InstanceAppearance3D) {
  const offset = handle * INSTANCE_APPEARANCE_STRIDE_3D;
  for (let i = 0; i < 4; i++) { values[offset + i] = appearance.color?.[i] ?? DEFAULT_INSTANCE_APPEARANCE_3D[i]!;values[offset + 4 + i] = appearance.uvRect?.[i] ?? DEFAULT_INSTANCE_APPEARANCE_3D[4 + i]!; }
}
