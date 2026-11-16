/** Independent Euclidean separation oracle for camera continuity. */
export const separation = (a: number[], b: number[]) => Math.hypot(...a.map((value, index) => value - b[index]!));
