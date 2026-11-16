import { cookStaticModel } from '@hyperfocus/engine/assets/model-cooking';
type Point = readonly [number, number, number];

/** Flat-shaded authored facets, portable normals and surface UVs in one static GLB. */
export function cookCityFacets(label: string, faces: readonly (readonly Point[])[], faceUvs?: readonly (readonly [number, number])[], normalAt?: (point:Point)=>Point) {
  if (faceUvs && (faceUvs.length !== faces.length || faceUvs.some(uv => uv.some(value => !Number.isFinite(value))))) throw new Error('Facet surface coordinates must match every face.');
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (const [faceIndex, face] of faces.entries()) {
    const a = face[0]!, b = face[1]!, c = face[2]!;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const length = Math.hypot(...n) || 1, start = positions.length / 3;
    const axis = Math.abs(n[0]!) > Math.abs(n[1]!) ? Math.abs(n[0]!) > Math.abs(n[2]!) ? 0 : 2 : Math.abs(n[1]!) > Math.abs(n[2]!) ? 1 : 2;
    for (const point of face) {
      positions.push(...point);
      const normal=normalAt?.(point)??[n[0]! / length, n[1]! / length, n[2]! / length];
      if(normal.some(value=>!Number.isFinite(value))||Math.abs(Math.hypot(...normal)-1)>.001)throw Error('Surface normals must be finite unit vectors.');
      normals.push(...normal);
      uvs.push(...(faceUvs?.[faceIndex] ?? [(point[(axis + 1) % 3]! + 1) / 2, (point[(axis + 2) % 3]! + 1) / 2]));
    }
    for (let i = 1; i < face.length - 1; i++) indices.push(start, start + i, start + i + 1);
  }
  return cookStaticModel({ label, positions, normals, uvs, indices, generator: 'Touch of Death city sculpture' });
}

/** Closed loft along Y. Counter-clockwise X/Z rings give outward side normals. */
export function cityLoft(rings: readonly (readonly Point[])[]) {
  const faces: Point[][] = [];
  for (let row = 0; row < rings.length - 1; row++) for (let i = 0; i < rings[row]!.length; i++) {
    const next = (i + 1) % rings[row]!.length;
    faces.push([rings[row]![i]!, rings[row + 1]![i]!, rings[row + 1]![next]!, rings[row]![next]!]);
  }
  faces.push([...rings[0]!], [...rings.at(-1)!].reverse());
  return faces;
}

/** Struts are constructed at their real section thickness before mesh normalization. */
export function cookCityTruss() {
  const faces: Point[][] = [], scale = [7.9, .35, .4];
  const beam = (a: Point, b: Point, thickness: number) => {
    const delta = b.map((value, axis) => value - a[axis]!), length = Math.hypot(...delta);
    const u = delta.map(value => value / length), v = Math.abs(u[2]!) < .9 ? [-u[1]!, u[0]!, 0] : [1, 0, 0];
    const radius = thickness / 2, size = Math.hypot(...v);
    for (let i = 0; i < 3; i++) v[i] = v[i]! / size * radius;
    const w = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const vertices: Point[] = [];
    for (const point of [a, b]) for (const signs of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      vertices.push([(point[0] + signs[0]! * v[0]! + signs[1]! * w[0]!) / scale[0]!, (point[1] + signs[0]! * v[1]! + signs[1]! * w[1]!) / scale[1]!, (point[2] + signs[0]! * v[2]! + signs[1]! * w[2]!) / scale[2]!]);
    }
    for (const corners of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) faces.push(corners.map(index => vertices[index]!));
  };
  for (const y of [-.28, .28]) for (const z of [-.32, .32]) beam([-7.9, y, z], [7.9, y, z], .055);
  for (let i = 0; i < 6; i++) for (const z of [-.32, .32]) {
    beam([-7.9 + i * 15.8 / 6, i % 2 ? .28 : -.28, z], [-7.9 + (i + 1) * 15.8 / 6, i % 2 ? -.28 : .28, z], .045);
  }
  for (let i = 0; i < 7; i++) for (const y of [-.28, .28]) beam([-7.9 + i * 15.8 / 6, y, -.32], [-7.9 + i * 15.8 / 6, y, .32], .045);
  return cookCityFacets('Open lattice crane boom with constant-section struts', faces);
}
