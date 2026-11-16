const EPSILON = 1e-8;

export type HumanoidRotationSpring = {
  reset(rotations: ArrayLike<number>): void;
  update(targetRotations: ArrayLike<number>, deltaSeconds: number, output: Float32Array): Float32Array;
};

/**
 * Keeps procedural and IK joint targets on a shortest-arc, critically damped
 * path. The target may change every frame; the output orientation and stored
 * angular response remain continuous instead of inheriting an IK branch flip.
 */
export function createHumanoidRotationSpring(options: {
  jointCount: number;
  responsePerSecond?: number;
  maximumAngularSpeedRadiansPerSecond?: number;
  passthroughJointIndex?: number;
}): HumanoidRotationSpring {
  const jointCount = integerAtLeast(options.jointCount, 1, "rotation spring jointCount");
  const response = positive(options.responsePerSecond ?? 16, "rotation spring responsePerSecond");
  const maximumSpeed = positive(options.maximumAngularSpeedRadiansPerSecond ?? 6, "rotation spring maximumAngularSpeedRadiansPerSecond");
  const passthrough = options.passthroughJointIndex ?? -1;
  if (!Number.isSafeInteger(passthrough) || passthrough < -1 || passthrough >= jointCount) throw new RangeError("rotation spring passthroughJointIndex is outside the joint range");
  const current = new Float32Array(jointCount * 4);
  const velocity = new Float32Array(jointCount * 3);
  let initialized = false;

  function reset(rotations: ArrayLike<number>) {
    requireRotations(rotations, jointCount);
    for (let joint = 0; joint < jointCount; joint += 1) writeNormalized(rotations, joint * 4, current, joint * 4);
    velocity.fill(0);
    initialized = true;
  }

  return {
    reset,
    update(targetRotations, deltaSeconds, output) {
      requireRotations(targetRotations, jointCount);
      if (!(output instanceof Float32Array) || output.length < jointCount * 4) throw new RangeError("rotation spring output is too small");
      const dt = finiteNonNegative(deltaSeconds, "rotation spring deltaSeconds");
      if (!initialized) reset(targetRotations);
      const decay = Math.exp(-response * dt), maximumStep = maximumSpeed * dt;
      for (let joint = 0; joint < jointCount; joint += 1) {
        const rotationOffset = joint * 4, velocityOffset = joint * 3;
        if (joint === passthrough || dt <= EPSILON) {
          writeNormalized(targetRotations, rotationOffset, current, rotationOffset);
          velocity[velocityOffset] = velocity[velocityOffset + 1] = velocity[velocityOffset + 2] = 0;
          output.set(current.subarray(rotationOffset, rotationOffset + 4), rotationOffset);
          continue;
        }
        const tx0 = targetRotations[rotationOffset]!, ty0 = targetRotations[rotationOffset + 1]!, tz0 = targetRotations[rotationOffset + 2]!, tw0 = targetRotations[rotationOffset + 3]!;
        const targetLength = Math.max(EPSILON, Math.hypot(tx0, ty0, tz0, tw0));
        const tx = tx0 / targetLength, ty = ty0 / targetLength, tz = tz0 / targetLength, tw = tw0 / targetLength;
        const cx = current[rotationOffset]!, cy = current[rotationOffset + 1]!, cz = current[rotationOffset + 2]!, cw = current[rotationOffset + 3]!;
        let ex = tw * cx - tx * cw - ty * cz + tz * cy;
        let ey = tw * cy + tx * cz - ty * cw - tz * cx;
        let ez = tw * cz - tx * cy + ty * cx - tz * cw;
        let ew = tw * cw + tx * cx + ty * cy + tz * cz;
        if (ew < 0) { ex = -ex; ey = -ey; ez = -ez; ew = -ew; }
        const sine = Math.hypot(ex, ey, ez), errorAngle = 2 * Math.atan2(sine, Math.max(0, ew)), inverseSine = sine > EPSILON ? 1 / sine : 0;
        const errorX = ex * inverseSine * errorAngle, errorY = ey * inverseSine * errorAngle, errorZ = ez * inverseSine * errorAngle;
        const vx = velocity[velocityOffset]!, vy = velocity[velocityOffset + 1]!, vz = velocity[velocityOffset + 2]!;
        const criticalX = vx + response * errorX, criticalY = vy + response * errorY, criticalZ = vz + response * errorZ;
        let nextErrorX = (errorX + criticalX * dt) * decay, nextErrorY = (errorY + criticalY * dt) * decay, nextErrorZ = (errorZ + criticalZ * dt) * decay;
        let nextVelocityX = (vx - response * criticalX * dt) * decay, nextVelocityY = (vy - response * criticalY * dt) * decay, nextVelocityZ = (vz - response * criticalZ * dt) * decay;
        const nextErrorLength = Math.hypot(nextErrorX, nextErrorY, nextErrorZ), halfError = nextErrorLength * .5, errorScale = nextErrorLength > EPSILON ? Math.sin(halfError) / nextErrorLength : .5;
        const qex = nextErrorX * errorScale, qey = nextErrorY * errorScale, qez = nextErrorZ * errorScale, qew = Math.cos(halfError);
        let nx = tw * qex + tx * qew + ty * qez - tz * qey;
        let ny = tw * qey - tx * qez + ty * qew + tz * qex;
        let nz = tw * qez + tx * qey - ty * qex + tz * qew;
        let nw = tw * qew - tx * qex - ty * qey - tz * qez;
        const inverseNextLength = 1 / Math.max(EPSILON, Math.hypot(nx, ny, nz, nw)); nx *= inverseNextLength; ny *= inverseNextLength; nz *= inverseNextLength; nw *= inverseNextLength;
        let dot = cx * nx + cy * ny + cz * nz + cw * nw;
        if (dot < 0) { nx = -nx; ny = -ny; nz = -nz; nw = -nw; dot = -dot; }
        const step = 2 * Math.acos(Math.min(1, dot));
        if (step > maximumStep + EPSILON) {
          const amount = maximumStep / step;
          [nx, ny, nz, nw] = slerp(cx, cy, cz, cw, nx, ny, nz, nw, amount);
          nextVelocityX *= amount; nextVelocityY *= amount; nextVelocityZ *= amount;
          // Keep the spring state consistent with the speed-limited output.
          [nextErrorX, nextErrorY, nextErrorZ] = quaternionErrorVector(tx, ty, tz, tw, nx, ny, nz, nw);
        }
        current[rotationOffset] = output[rotationOffset] = nx;
        current[rotationOffset + 1] = output[rotationOffset + 1] = ny;
        current[rotationOffset + 2] = output[rotationOffset + 2] = nz;
        current[rotationOffset + 3] = output[rotationOffset + 3] = nw;
        velocity[velocityOffset] = nextVelocityX;
        velocity[velocityOffset + 1] = nextVelocityY;
        velocity[velocityOffset + 2] = nextVelocityZ;
      }
      return output;
    },
  };
}

function quaternionErrorVector(tx: number, ty: number, tz: number, tw: number, cx: number, cy: number, cz: number, cw: number): [number, number, number] {
  let x = tw * cx - tx * cw - ty * cz + tz * cy, y = tw * cy + tx * cz - ty * cw - tz * cx, z = tw * cz - tx * cy + ty * cx - tz * cw, w = tw * cw + tx * cx + ty * cy + tz * cz;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const sine = Math.hypot(x, y, z), angle = 2 * Math.atan2(sine, Math.max(0, w)), scale = sine > EPSILON ? angle / sine : 0;
  return [x * scale, y * scale, z * scale];
}

function slerp(ax: number, ay: number, az: number, aw: number, bx: number, by: number, bz: number, bw: number, amount: number): [number, number, number, number] {
  const dot = Math.min(1, Math.max(-1, ax * bx + ay * by + az * bz + aw * bw));
  if (dot > .9995) { const x = ax + (bx - ax) * amount, y = ay + (by - ay) * amount, z = az + (bz - az) * amount, w = aw + (bw - aw) * amount, inverse = 1 / Math.max(EPSILON, Math.hypot(x, y, z, w)); return [x * inverse, y * inverse, z * inverse, w * inverse]; }
  const theta = Math.acos(dot), sine = Math.sin(theta), a = Math.sin((1 - amount) * theta) / sine, b = Math.sin(amount * theta) / sine;
  return [ax * a + bx * b, ay * a + by * b, az * a + bz * b, aw * a + bw * b];
}

function writeNormalized(source: ArrayLike<number>, sourceOffset: number, target: Float32Array, targetOffset: number) {
  const x = source[sourceOffset]!, y = source[sourceOffset + 1]!, z = source[sourceOffset + 2]!, w = source[sourceOffset + 3]!, inverse = 1 / Math.max(EPSILON, Math.hypot(x, y, z, w));
  target[targetOffset] = x * inverse; target[targetOffset + 1] = y * inverse; target[targetOffset + 2] = z * inverse; target[targetOffset + 3] = w * inverse;
}

function requireRotations(value: ArrayLike<number>, jointCount: number) { if (!value || value.length < jointCount * 4) throw new RangeError("rotation spring input is too small"); }
function finiteNonNegative(value: unknown, label: string) { const number = Number(value); if (!Number.isFinite(number) || number < 0) throw new RangeError(`${label} must be finite and non-negative`); return number; }
function positive(value: unknown, label: string) { const number = Number(value); if (!Number.isFinite(number) || number <= 0) throw new RangeError(`${label} must be positive`); return number; }
function integerAtLeast(value: unknown, minimum: number, label: string) { const number = Number(value); if (!Number.isSafeInteger(number) || number < minimum) throw new RangeError(`${label} must be an integer of at least ${minimum}`); return number; }
