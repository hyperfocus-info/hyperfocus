import { hypot } from '../../math/simulation.ts';
import type { ContactScratch } from "../rigid-3d-internals.ts";
import type { RigidOperationContext } from "../rigid-3d-operations.ts";

const FACE_A = 0;
const FACE_B = 1;
const EDGE_EDGE = 2;
const MAX_MANIFOLD_POINTS = 4;
const MAX_CLIPPED_POINTS = 8;
const SAT_EPSILON = 1e-10;
const CLIP_EPSILON = 1e-9;

function writeQuaternionAxes(qx: number, qy: number, qz: number, qw: number, output: Float64Array): void {
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  output[0] = 1 - 2 * (yy + zz); output[1] = 2 * (xy + wz); output[2] = 2 * (xz - wy);
  output[3] = 2 * (xy - wz); output[4] = 1 - 2 * (xx + zz); output[5] = 2 * (yz + wx);
  output[6] = 2 * (xz + wy); output[7] = 2 * (yz - wx); output[8] = 1 - 2 * (xx + yy);
}

/** Exact oriented box SAT plus a bounded clipped face manifold for the shared solver. */
export function createRigidOrientedBoxContact3D(context: RigidOperationContext) {
  const { positionX, positionY, positionZ, rotationX, rotationY, rotationZ, rotationW, extentX, extentY, extentZ } = context.bodies;
  const axesA = new Float64Array(9), axesB = new Float64Array(9), rotation = new Float64Array(9), absoluteRotation = new Float64Array(9);
  const translationA = new Float64Array(3), extentA = new Float64Array(3), extentB = new Float64Array(3), sat = new Float64Array(7);
  const manifoldPoints = new Float64Array(MAX_MANIFOLD_POINTS * 3), clipA = new Float64Array(MAX_CLIPPED_POINTS * 3), clipB = new Float64Array(MAX_CLIPPED_POINTS * 3), candidates = new Float64Array(MAX_CLIPPED_POINTS * 3);
  const candidateU = new Float64Array(MAX_CLIPPED_POINTS), candidateV = new Float64Array(MAX_CLIPPED_POINTS), selected = new Int8Array(MAX_MANIFOLD_POINTS);

  const writeAxes = (index: number, output: Float64Array) => writeQuaternionAxes(rotationX[index]!, rotationY[index]!, rotationZ[index]!, rotationW[index]!, output);
  const extent = (index: number, axis: number) => axis === 0 ? extentX[index]! : axis === 1 ? extentY[index]! : extentZ[index]!;
  const projectedRadius = (index: number, axes: Float64Array, axisX: number, axisY: number, axisZ: number) => extentX[index]! * Math.abs(axisX * axes[0]! + axisY * axes[1]! + axisZ * axes[2]!)
    + extentY[index]! * Math.abs(axisX * axes[3]! + axisY * axes[4]! + axisZ * axes[5]!)
    + extentZ[index]! * Math.abs(axisX * axes[6]! + axisY * axes[7]! + axisZ * axes[8]!);

  function selectAxis(axisX: number, axisY: number, axisZ: number, signedDistance: number, overlap: number, feature: number, axisA: number, axisB: number): boolean {
    if (overlap < -SAT_EPSILON) return false;
    if (overlap >= sat[0]!) return true;
    const sign = signedDistance >= 0 ? 1 : -1;
    sat[0] = Math.max(0, overlap); sat[1] = axisX * sign; sat[2] = axisY * sign; sat[3] = axisZ * sign;
    sat[4] = feature; sat[5] = axisA; sat[6] = axisB;
    return true;
  }

  function boxBox(a: number, b: number, output: ContactScratch): boolean {
    const dx = positionX[b]! - positionX[a]!, dy = positionY[b]! - positionY[a]!, dz = positionZ[b]! - positionZ[a]!;
    writeAxes(a, axesA); writeAxes(b, axesB);
    for (let axisA = 0; axisA < 3; axisA += 1) for (let axisB = 0; axisB < 3; axisB += 1) {
      const offset = axisA * 3 + axisB;
      const dot = axesA[axisA * 3]! * axesB[axisB * 3]! + axesA[axisA * 3 + 1]! * axesB[axisB * 3 + 1]! + axesA[axisA * 3 + 2]! * axesB[axisB * 3 + 2]!;
      rotation[offset] = dot; absoluteRotation[offset] = Math.abs(dot);
    }
    translationA[0] = dx * axesA[0]! + dy * axesA[1]! + dz * axesA[2]!;
    translationA[1] = dx * axesA[3]! + dy * axesA[4]! + dz * axesA[5]!;
    translationA[2] = dx * axesA[6]! + dy * axesA[7]! + dz * axesA[8]!;
    extentA[0] = extentX[a]!; extentA[1] = extentY[a]!; extentA[2] = extentZ[a]!;
    extentB[0] = extentX[b]!; extentB[1] = extentY[b]!; extentB[2] = extentZ[b]!;
    sat[0] = Number.POSITIVE_INFINITY; sat[1] = 0; sat[2] = 0; sat[3] = 0; sat[4] = EDGE_EDGE; sat[5] = 0; sat[6] = 0;
    for (let axis = 0; axis < 3; axis += 1) {
      const radiusB = extentB[0]! * absoluteRotation[axis * 3]! + extentB[1]! * absoluteRotation[axis * 3 + 1]! + extentB[2]! * absoluteRotation[axis * 3 + 2]!;
      if (!selectAxis(axesA[axis * 3]!, axesA[axis * 3 + 1]!, axesA[axis * 3 + 2]!, translationA[axis]!, extentA[axis]! + radiusB - Math.abs(translationA[axis]!), FACE_A, axis, -1)) return false;
    }
    for (let axis = 0; axis < 3; axis += 1) {
      const signedDistance = dx * axesB[axis * 3]! + dy * axesB[axis * 3 + 1]! + dz * axesB[axis * 3 + 2]!;
      const radiusA = extentA[0]! * absoluteRotation[axis]! + extentA[1]! * absoluteRotation[3 + axis]! + extentA[2]! * absoluteRotation[6 + axis]!;
      if (!selectAxis(axesB[axis * 3]!, axesB[axis * 3 + 1]!, axesB[axis * 3 + 2]!, signedDistance, radiusA + extentB[axis]! - Math.abs(signedDistance), FACE_B, -1, axis)) return false;
    }
    for (let axisA = 0; axisA < 3; axisA += 1) for (let axisB = 0; axisB < 3; axisB += 1) {
      const nextA = (axisA + 1) % 3, lastA = (axisA + 2) % 3, nextB = (axisB + 1) % 3, lastB = (axisB + 2) % 3;
      let axisX = axesA[axisA * 3 + 1]! * axesB[axisB * 3 + 2]! - axesA[axisA * 3 + 2]! * axesB[axisB * 3 + 1]!;
      let axisY = axesA[axisA * 3 + 2]! * axesB[axisB * 3]! - axesA[axisA * 3]! * axesB[axisB * 3 + 2]!;
      let axisZ = axesA[axisA * 3]! * axesB[axisB * 3 + 1]! - axesA[axisA * 3 + 1]! * axesB[axisB * 3]!;
      const axisLength = hypot(axisX, axisY, axisZ);
      if (axisLength <= SAT_EPSILON) continue;
      const radiusA = extentA[nextA]! * absoluteRotation[lastA * 3 + axisB]! + extentA[lastA]! * absoluteRotation[nextA * 3 + axisB]!;
      const radiusB = extentB[nextB]! * absoluteRotation[axisA * 3 + lastB]! + extentB[lastB]! * absoluteRotation[axisA * 3 + nextB]!;
      const signedDistance = translationA[lastA]! * rotation[nextA * 3 + axisB]! - translationA[nextA]! * rotation[lastA * 3 + axisB]!;
      axisX /= axisLength; axisY /= axisLength; axisZ /= axisLength;
      if (!selectAxis(axisX, axisY, axisZ, signedDistance / axisLength, (radiusA + radiusB - Math.abs(signedDistance)) / axisLength, EDGE_EDGE, axisA, axisB)) return false;
    }
    writeRepresentative(a, b, output);
    return true;
  }

  function writeRepresentative(a: number, b: number, output: ContactScratch): void {
    const normalX = sat[1]!, normalY = sat[2]!, normalZ = sat[3]!;
    output.normalX = normalX; output.normalY = normalY; output.normalZ = normalZ; output.penetration = sat[0]!;
    let tangentX = 0, tangentY = normalZ, tangentZ = -normalY;
    if (Math.abs(normalX) >= .8) { tangentX = -normalZ; tangentY = 0; tangentZ = normalX; }
    const tangentLength = hypot(tangentX, tangentY, tangentZ); tangentX /= tangentLength; tangentY /= tangentLength; tangentZ /= tangentLength;
    const bitangentX = normalY * tangentZ - normalZ * tangentY, bitangentY = normalZ * tangentX - normalX * tangentZ, bitangentZ = normalX * tangentY - normalY * tangentX;
    const centerANormal = positionX[a]! * normalX + positionY[a]! * normalY + positionZ[a]! * normalZ, centerBNormal = positionX[b]! * normalX + positionY[b]! * normalY + positionZ[b]! * normalZ;
    const contactNormal = (centerANormal + projectedRadius(a, axesA, normalX, normalY, normalZ) + centerBNormal - projectedRadius(b, axesB, normalX, normalY, normalZ)) * .5;
    const centerATangent = positionX[a]! * tangentX + positionY[a]! * tangentY + positionZ[a]! * tangentZ, centerBTangent = positionX[b]! * tangentX + positionY[b]! * tangentY + positionZ[b]! * tangentZ;
    const contactTangent = (Math.max(centerATangent - projectedRadius(a, axesA, tangentX, tangentY, tangentZ), centerBTangent - projectedRadius(b, axesB, tangentX, tangentY, tangentZ)) + Math.min(centerATangent + projectedRadius(a, axesA, tangentX, tangentY, tangentZ), centerBTangent + projectedRadius(b, axesB, tangentX, tangentY, tangentZ))) * .5;
    const centerABitangent = positionX[a]! * bitangentX + positionY[a]! * bitangentY + positionZ[a]! * bitangentZ, centerBBitangent = positionX[b]! * bitangentX + positionY[b]! * bitangentY + positionZ[b]! * bitangentZ;
    const contactBitangent = (Math.max(centerABitangent - projectedRadius(a, axesA, bitangentX, bitangentY, bitangentZ), centerBBitangent - projectedRadius(b, axesB, bitangentX, bitangentY, bitangentZ)) + Math.min(centerABitangent + projectedRadius(a, axesA, bitangentX, bitangentY, bitangentZ), centerBBitangent + projectedRadius(b, axesB, bitangentX, bitangentY, bitangentZ))) * .5;
    output.pointX = normalX * contactNormal + tangentX * contactTangent + bitangentX * contactBitangent;
    output.pointY = normalY * contactNormal + tangentY * contactTangent + bitangentY * contactBitangent;
    output.pointZ = normalZ * contactNormal + tangentZ * contactTangent + bitangentZ * contactBitangent;
  }

  function clipPlane(count: number, input: Float64Array, output: Float64Array, originX: number, originY: number, originZ: number, axisX: number, axisY: number, axisZ: number, limit: number): number {
    if (!count) return 0;
    let outputCount = 0, prior = count - 1;
    for (let current = 0; current < count; current += 1) {
      const priorOffset = prior * 3, currentOffset = current * 3;
      const priorDistance = (input[priorOffset]! - originX) * axisX + (input[priorOffset + 1]! - originY) * axisY + (input[priorOffset + 2]! - originZ) * axisZ - limit;
      const currentDistance = (input[currentOffset]! - originX) * axisX + (input[currentOffset + 1]! - originY) * axisY + (input[currentOffset + 2]! - originZ) * axisZ - limit;
      const priorInside = priorDistance <= CLIP_EPSILON, currentInside = currentDistance <= CLIP_EPSILON;
      if (priorInside !== currentInside) {
        const ratio = priorDistance / (priorDistance - currentDistance), write = outputCount++ * 3;
        output[write] = input[priorOffset]! + (input[currentOffset]! - input[priorOffset]!) * ratio;
        output[write + 1] = input[priorOffset + 1]! + (input[currentOffset + 1]! - input[priorOffset + 1]!) * ratio;
        output[write + 2] = input[priorOffset + 2]! + (input[currentOffset + 2]! - input[priorOffset + 2]!) * ratio;
      }
      if (currentInside) { const write = outputCount++ * 3; output[write] = input[currentOffset]!; output[write + 1] = input[currentOffset + 1]!; output[write + 2] = input[currentOffset + 2]!; }
      prior = current;
    }
    return outputCount;
  }

  function clippedFaceManifold(a: number, b: number, output: ContactScratch): number {
    if (sat[4] === EDGE_EDGE) return writeFallback(output);
    const reference = sat[4] === FACE_A ? a : b, incident = reference === a ? b : a, referenceAxes = reference === a ? axesA : axesB, incidentAxes = incident === a ? axesA : axesB, referenceAxis = sat[4] === FACE_A ? sat[5]! : sat[6]!;
    const normalSign = reference === a ? 1 : -1, normalX = output.normalX * normalSign, normalY = output.normalY * normalSign, normalZ = output.normalZ * normalSign;
    const referenceUAxis = (referenceAxis + 1) % 3, referenceVAxis = (referenceAxis + 2) % 3;
    const ux = referenceAxes[referenceUAxis * 3]!, uy = referenceAxes[referenceUAxis * 3 + 1]!, uz = referenceAxes[referenceUAxis * 3 + 2]!;
    const vx = referenceAxes[referenceVAxis * 3]!, vy = referenceAxes[referenceVAxis * 3 + 1]!, vz = referenceAxes[referenceVAxis * 3 + 2]!;
    const referenceCenterX = positionX[reference]! + normalX * extent(reference, referenceAxis), referenceCenterY = positionY[reference]! + normalY * extent(reference, referenceAxis), referenceCenterZ = positionZ[reference]! + normalZ * extent(reference, referenceAxis);
    let incidentAxis = 0, incidentDot = incidentAxes[0]! * normalX + incidentAxes[1]! * normalY + incidentAxes[2]! * normalZ;
    for (let axis = 1; axis < 3; axis += 1) { const dot = incidentAxes[axis * 3]! * normalX + incidentAxes[axis * 3 + 1]! * normalY + incidentAxes[axis * 3 + 2]! * normalZ; if (Math.abs(dot) > Math.abs(incidentDot)) { incidentAxis = axis; incidentDot = dot; } }
    const incidentSign = incidentDot > 0 ? -1 : 1, incidentUAxis = (incidentAxis + 1) % 3, incidentVAxis = (incidentAxis + 2) % 3;
    const iux = incidentAxes[incidentUAxis * 3]!, iuy = incidentAxes[incidentUAxis * 3 + 1]!, iuz = incidentAxes[incidentUAxis * 3 + 2]!, ivx = incidentAxes[incidentVAxis * 3]!, ivy = incidentAxes[incidentVAxis * 3 + 1]!, ivz = incidentAxes[incidentVAxis * 3 + 2]!;
    const faceX = positionX[incident]! + incidentAxes[incidentAxis * 3]! * incidentSign * extent(incident, incidentAxis), faceY = positionY[incident]! + incidentAxes[incidentAxis * 3 + 1]! * incidentSign * extent(incident, incidentAxis), faceZ = positionZ[incident]! + incidentAxes[incidentAxis * 3 + 2]! * incidentSign * extent(incident, incidentAxis);
    const halfU = extent(incident, incidentUAxis), halfV = extent(incident, incidentVAxis), signs = [-1, -1, 1, -1, 1, 1, -1, 1] as const;
    for (let vertex = 0; vertex < 4; vertex += 1) { const write = vertex * 3, signU = signs[vertex * 2]!, signV = signs[vertex * 2 + 1]!; clipA[write] = faceX + iux * halfU * signU + ivx * halfV * signV; clipA[write + 1] = faceY + iuy * halfU * signU + ivy * halfV * signV; clipA[write + 2] = faceZ + iuz * halfU * signU + ivz * halfV * signV; }
    let count = clipPlane(4, clipA, clipB, referenceCenterX, referenceCenterY, referenceCenterZ, ux, uy, uz, extent(reference, referenceUAxis));
    count = clipPlane(count, clipB, clipA, referenceCenterX, referenceCenterY, referenceCenterZ, -ux, -uy, -uz, extent(reference, referenceUAxis));
    count = clipPlane(count, clipA, clipB, referenceCenterX, referenceCenterY, referenceCenterZ, vx, vy, vz, extent(reference, referenceVAxis));
    count = clipPlane(count, clipB, clipA, referenceCenterX, referenceCenterY, referenceCenterZ, -vx, -vy, -vz, extent(reference, referenceVAxis));
    let candidateCount = 0;
    for (let index = 0; index < count; index += 1) {
      const read = index * 3, separation = (clipA[read]! - referenceCenterX) * normalX + (clipA[read + 1]! - referenceCenterY) * normalY + (clipA[read + 2]! - referenceCenterZ) * normalZ;
      if (separation > CLIP_EPSILON) continue;
      const x = clipA[read]! - normalX * separation * .5, y = clipA[read + 1]! - normalY * separation * .5, z = clipA[read + 2]! - normalZ * separation * .5;
      let duplicate = false;
      for (let prior = 0; prior < candidateCount; prior += 1) { const offset = prior * 3, dx = candidates[offset]! - x, dy = candidates[offset + 1]! - y, dz = candidates[offset + 2]! - z; if (dx * dx + dy * dy + dz * dz <= 1e-18) { duplicate = true; break; } }
      if (duplicate) continue;
      const write = candidateCount * 3; candidates[write] = x; candidates[write + 1] = y; candidates[write + 2] = z;
      candidateU[candidateCount] = (x - referenceCenterX) * ux + (y - referenceCenterY) * uy + (z - referenceCenterZ) * uz;
      candidateV[candidateCount] = (x - referenceCenterX) * vx + (y - referenceCenterY) * vy + (z - referenceCenterZ) * vz;
      candidateCount += 1;
    }
    if (!candidateCount) return writeFallback(output);
    return reduceCandidates(candidateCount);
  }

  function reduceCandidates(count: number): number {
    selected.fill(-1); let selectedCount = 0;
    const add = (index: number) => { for (let prior = 0; prior < selectedCount; prior += 1) if (selected[prior] === index) return; selected[selectedCount++] = index; };
    if (count <= MAX_MANIFOLD_POINTS) {
      if (count === 4) { add(0); add(2); add(1); add(3); } else for (let index = 0; index < count; index += 1) add(index);
    } else {
      let minU = 0, maxU = 0, minV = 0, maxV = 0;
      for (let index = 1; index < count; index += 1) { if (candidateU[index]! < candidateU[minU]!) minU = index; if (candidateU[index]! > candidateU[maxU]!) maxU = index; if (candidateV[index]! < candidateV[minV]!) minV = index; if (candidateV[index]! > candidateV[maxV]!) maxV = index; }
      add(minU); add(maxU); add(minV); add(maxV); for (let index = 0; selectedCount < MAX_MANIFOLD_POINTS && index < count; index += 1) add(index);
    }
    for (let index = 0; index < selectedCount; index += 1) { const source = selected[index]! * 3, target = index * 3; manifoldPoints[target] = candidates[source]!; manifoldPoints[target + 1] = candidates[source + 1]!; manifoldPoints[target + 2] = candidates[source + 2]!; }
    return selectedCount;
  }

  function writeFallback(output: ContactScratch): number { manifoldPoints[0] = output.pointX; manifoldPoints[1] = output.pointY; manifoldPoints[2] = output.pointZ; return 1; }
  function boxBoxManifold(a: number, b: number, output: ContactScratch): number { return boxBox(a, b, output) ? clippedFaceManifold(a, b, output) : 0; }

  return { boxBox, boxBoxManifold, manifoldPoints };
}
