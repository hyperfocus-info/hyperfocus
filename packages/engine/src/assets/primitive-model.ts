import { cookStaticModel } from './static-model.ts';
export type StandInShape = "box" | "capsule";
export type PrimitiveShape = StandInShape | "sphere";
/** Compact AI/editor interchange: shape, position XYZ, scale XYZ, rotation XYZ. */
export type PrimitivePart = readonly [PrimitiveShape, number, number, number, number, number, number, number, number, number];

type PrimitiveGeometry = Readonly<{
  label: string;
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}>;

/** Cooks a bounded primitive assembly into one ordinary static GLB mesh. */
export function cookPrimitiveModel(options: { label: string; parts: readonly PrimitivePart[] }): Uint8Array {
  const geometry = primitiveModelGeometry(options);
  return cookStaticModel({ ...geometry, generator: 'Hyperfocus stand-in cooker v1' });
}

/** Returns the exact generated streams for calibrated construction before GLB encoding. */
export function primitiveModelGeometry(options: { label: string; parts: readonly PrimitivePart[] }) {
  return combinedGeometry(options.label, options.parts);
}

function combinedGeometry(label: string, parts: readonly PrimitivePart[]): PrimitiveGeometry {
  const name = label.trim();
  if (!name || name.length > 128 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error("Primitive model label must contain 1-128 visible characters.");
  if (!parts.length || parts.length > 64) throw new Error("Primitive models require 1-64 parts.");
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (const [partIndex, part] of parts.entries()) {
    validatePart(part, partIndex);
    const [shape, px, py, pz, sx, sy, sz, rx, ry, rz] = part;
    const source = shape === "capsule" ? capsuleGeometry() : shape === "sphere" ? sphereGeometry() : boxGeometry();
    const baseVertex = positions.length / 3;
    for (let index = 0; index < source.positions.length; index += 3) {
      const point = rotateXYZ(source.positions[index]! * sx, source.positions[index + 1]! * sy, source.positions[index + 2]! * sz, rx, ry, rz);
      point[0] += px; point[1] += py; point[2] += pz;
      positions.push(...point);
      const normal = rotateXYZ(source.normals[index]! / sx, source.normals[index + 1]! / sy, source.normals[index + 2]! / sz, rx, ry, rz);
      const length = Math.hypot(...normal) || 1;
      normals.push(normal[0] / length, normal[1] / length, normal[2] / length);
    }
    uvs.push(...source.uvs);
    for (const index of source.indices) indices.push(baseVertex + index);
  }
  if (positions.length / 3 > 65_535) throw new Error("Primitive model exceeds the portable 16-bit vertex limit.");
  return { label: name, positions, normals, uvs, indices };
}

function validatePart(part: PrimitivePart, index: number) {
  if (!Array.isArray(part) || part.length !== 10 || !["box", "capsule", "sphere"].includes(String(part[0]))) throw new Error(`Primitive part ${index} is invalid.`);
  for (let component = 1; component < part.length; component += 1) if (!Number.isFinite(part[component]) || Math.abs(Number(part[component])) > 1_000) throw new Error(`Primitive part ${index} component ${component} is out of range.`);
  for (let component = 4; component <= 6; component += 1) if (!(Number(part[component]) > 0) || Number(part[component]) > 100) throw new Error(`Primitive part ${index} scale must be greater than zero and no more than 100.`);
}

function rotateXYZ(x: number, y: number, z: number, rx: number, ry: number, rz: number): [number, number, number] {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const y1 = y * cx - z * sx, z1 = y * sx + z * cx;
  const x2 = x * cy + z1 * sy, z2 = -x * sy + z1 * cy;
  return [x2 * cz - y1 * sz, x2 * sz + y1 * cz, z2];
}

function capsuleGeometry(): PrimitiveGeometry {
  const radialSegments = 16;
  const hemisphereRings = 6;
  const radius = 0.5;
  const halfHeight = 0.5;
  const rings: Array<{ y: number; radius: number; normalY: number; normalRadius: number }> = [];
  for (let ring = 0; ring <= hemisphereRings; ring += 1) {
    const angle = ring / hemisphereRings * Math.PI / 2;
    rings.push({ y: halfHeight + Math.cos(angle) * radius, radius: Math.sin(angle) * radius, normalY: Math.cos(angle), normalRadius: Math.sin(angle) });
  }
  for (let ring = 0; ring <= hemisphereRings; ring += 1) {
    const angle = Math.PI / 2 + ring / hemisphereRings * Math.PI / 2;
    rings.push({ y: -halfHeight + Math.cos(angle) * radius, radius: Math.sin(angle) * radius, normalY: Math.cos(angle), normalRadius: Math.sin(angle) });
  }
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (const [ringIndex, ring] of rings.entries()) {
    for (let segment = 0; segment <= radialSegments; segment += 1) {
      const angle = segment / radialSegments * Math.PI * 2;
      const x = Math.cos(angle), z = Math.sin(angle);
      positions.push(x * ring.radius, ring.y, z * ring.radius);
      normals.push(x * ring.normalRadius, ring.normalY, z * ring.normalRadius);
      uvs.push(segment / radialSegments, ringIndex / (rings.length - 1));
    }
  }
  const stride = radialSegments + 1;
  for (let ring = 0; ring < rings.length - 1; ring += 1) for (let segment = 0; segment < radialSegments; segment += 1) {
    const topLeft = ring * stride + segment;
    const bottomLeft = topLeft + stride;
    indices.push(topLeft, topLeft + 1, bottomLeft, topLeft + 1, bottomLeft + 1, bottomLeft);
  }
  return { label: "Temporary Capsule Stand-in", positions, normals, uvs, indices };
}

function sphereGeometry(): PrimitiveGeometry {
  const radialSegments = 16, verticalSegments = 12;
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let row = 0; row <= verticalSegments; row += 1) {
    const v = row / verticalSegments, latitude = v * Math.PI;
    const y = Math.cos(latitude), ring = Math.sin(latitude);
    for (let segment = 0; segment <= radialSegments; segment += 1) {
      const u = segment / radialSegments, longitude = u * Math.PI * 2;
      const x = Math.cos(longitude) * ring, z = Math.sin(longitude) * ring;
      positions.push(x, y, z); normals.push(x, y, z); uvs.push(u, v);
    }
  }
  const stride = radialSegments + 1;
  for (let row = 0; row < verticalSegments; row += 1) for (let segment = 0; segment < radialSegments; segment += 1) {
    const topLeft = row * stride + segment, bottomLeft = topLeft + stride;
    indices.push(topLeft, topLeft + 1, bottomLeft, topLeft + 1, bottomLeft + 1, bottomLeft);
  }
  return { label: "Sphere", positions, normals, uvs, indices };
}

function boxGeometry(): PrimitiveGeometry {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const faces = [
    { normal: [1, 0, 0], vertices: [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]] },
    { normal: [-1, 0, 0], vertices: [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]] },
    { normal: [0, 1, 0], vertices: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },
    { normal: [0, -1, 0], vertices: [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]] },
    { normal: [0, 0, 1], vertices: [[1, -1, 1], [-1, -1, 1], [-1, 1, 1], [1, 1, 1]] },
    { normal: [0, 0, -1], vertices: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]] },
  ];
  for (const face of faces) {
    const base = positions.length / 3;
    for (const [index, vertex] of face.vertices.entries()) {
      positions.push(...vertex);
      normals.push(...face.normal);
      uvs.push(...([[0, 0], [1, 0], [1, 1], [0, 1]][index]!));
    }
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  return { label: "Temporary Box Stand-in", positions, normals, uvs, indices };
}
