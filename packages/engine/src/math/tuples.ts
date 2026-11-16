/** Construct mutable numeric tuples without asserting the length of an inferred array. */
export function tuple3(x: number, y: number, z: number): [number, number, number] {
  return [x, y, z];
}

export function tuple4(x: number, y: number, z: number, w: number): [number, number, number, number] {
  return [x, y, z, w];
}
