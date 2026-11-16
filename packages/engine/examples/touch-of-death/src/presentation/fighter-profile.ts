import { cookStaticModel } from '@hyperfocus/engine/assets/model-cooking';
/** Local sculpting format: height, width radius, depth radius, depth center, nose ridge. */
type Ring = readonly [number, number, number, number, number?];

/** A continuous low-poly surface avoids intersecting primitive seams on faces and clothing. */
export function cookFighterProfile(label: string, rings: readonly Ring[], detail: 'plain' | 'cloth' | 'face' | 'hair' | 'jacket' | 'hand' = 'plain') {
  const segments = 32, positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (const [row, [y, width, depth, center, ridge = 0]] of rings.entries()) {
    for (let segment = 0; segment < segments; segment++) {
      const angle = segment / segments * Math.PI * 2;
      const front = Math.max(0, Math.cos(angle)), side = Math.sin(angle);
      let x = side * width, py = y, z = Math.cos(angle) * depth + center + Math.pow(front, 20) * ridge;
      if (detail === 'hand') {
        x = Math.sign(side) * Math.abs(side) ** .48 * width;
        z = Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** .48 * depth + center;
      }
      if (detail === 'cloth' || detail === 'jacket') {
        // Long seams and diagonal tension folds are part of the surface, not stacked ornaments.
        const fold = 1 + .035 * Math.cos(angle * 6 + y * 3) + .018 * Math.cos(angle * 11 - y * 7);
        x *= fold; z = (z - center) * fold + center;
        if (detail === 'jacket' && y > -.12 && y < .5) {
          const lapel = Math.abs(Math.abs(x) - (.035 + (.48 - y) * .27));
          z += Math.pow(front, 5) * Math.max(0, 1 - lapel / .024) * .018;
        }
      } else if (detail === 'face') {
        const eye = Math.exp(-((Math.abs(side) - .5) ** 2) / .025) * Math.exp(-((y - .06) ** 2) / .009);
        const cheek = Math.exp(-((Math.abs(side) - .65) ** 2) / .04) * Math.exp(-((y + .12) ** 2) / .018);
        z += front * (-eye * .055 + cheek * .025);
      } else if (detail === 'hair') {
        const strand = 1 + .035 * Math.cos(angle * 9 + y * 1.4);
        x *= strand; z = (z - center) * strand + center;
        py += Math.sin(angle + .7) * .11 * Math.min(width, .5);
      }
      positions.push(x, py, z);
      normals.push(0, 0, 0);uvs.push(segment / segments, row / (rings.length - 1));
    }
  }
  for (let row = 0; row < rings.length - 1; row++) for (let segment = 0; segment < segments; segment++) {
    const a = row * segments + segment, b = row * segments + (segment + 1) % segments, c = a + segments, d = b + segments;
    indices.push(a, b, c, b, d, c);
  }
  // Profiles must remain solid when a posed sleeve or fist faces the camera.
  // A fan closes each terminal ring without adding an intersecting primitive.
  const top = (rings.length - 1) * segments;
  for (let segment = 1; segment < segments - 1; segment++) {
    indices.push(0, segment + 1, segment, top, top + segment, top + segment + 1);
  }
  // Normals are shared across the continuous surface and its closed ends.
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 3, b = indices[i + 1]! * 3, c = indices[i + 2]! * 3;
    const ux = positions[b]! - positions[a]!, uy = positions[b + 1]! - positions[a + 1]!, uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!, vy = positions[c + 1]! - positions[a + 1]!, vz = positions[c + 2]! - positions[a + 2]!;
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const index of [a, b, c]) for (let axis = 0; axis < 3; axis++) normals[index + axis] += n[axis]!;
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!) || 1;
    normals[i] /= length;normals[i + 1] /= length;normals[i + 2] /= length;
  }
  return cookStaticModel({ label, positions, normals, uvs, indices, generator: 'Touch of Death fighter sculpture' });
}
