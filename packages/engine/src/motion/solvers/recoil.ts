import type { PoseBuffer } from "../pose-buffer.ts";
import { createDistributedAimSolver } from "./aim.ts";

export type RecoilSolverOptions = {
  jointIndices: ArrayLike<number>;
  weights?: ArrayLike<number>;
  stiffness?: number;
  damping?: number;
  maxAngle?: number;
};

export type RecoilSolverState = {
  angle: number;
  velocity: number;
};

export type RecoilSolver = {
  readonly state: RecoilSolverState;
  impulse(amount?: number): RecoilSolverState;
  update(deltaSeconds: number, pose: PoseBuffer, weight?: number): RecoilSolverState;
  reset(): void;
};

export function createRecoilSolver(options: RecoilSolverOptions): RecoilSolver {
  const stiffness = positiveFinite(options.stiffness ?? 150, "recoil stiffness");
  const damping = positiveFinite(options.damping ?? 22, "recoil damping");
  const maxAngle = positiveFinite(options.maxAngle ?? 0.32, "recoil maxAngle");
  const distribution = createDistributedAimSolver({
    jointIndices: options.jointIndices,
    weights: options.weights,
    maxPitch: maxAngle,
    maxYaw: 1e-6,
  });
  const state: RecoilSolverState = { angle: 0, velocity: 0 };

  return {
    state,
    impulse(amount = 1) {
      const safeAmount = finiteNumber(amount, "recoil impulse");
      state.velocity = Math.min(maxAngle * 14, state.velocity + safeAmount * maxAngle * 8);
      return state;
    },
    update(deltaSeconds, pose, weight = 1) {
      const dt = Math.min(0.1, nonNegativeFinite(deltaSeconds, "recoil deltaSeconds"));
      const acceleration = -stiffness * state.angle - damping * state.velocity;
      state.velocity += acceleration * dt;
      state.angle = Math.max(-maxAngle, Math.min(maxAngle, state.angle + state.velocity * dt));
      if (Math.abs(state.angle) < 1e-5 && Math.abs(state.velocity) < 1e-5) {
        state.angle = 0;
        state.velocity = 0;
      }
      distribution.apply(pose, 0, -state.angle, weight);
      return state;
    },
    reset() {
      state.angle = 0;
      state.velocity = 0;
    },
  };
}

function finiteNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
  return number;
}

function positiveFinite(value: unknown, label: string) {
  const number = finiteNumber(value, label);
  if (number <= 0) throw new RangeError(`${label} must be greater than zero`);
  return number;
}

function nonNegativeFinite(value: unknown, label: string) {
  const number = finiteNumber(value, label);
  if (number < 0) throw new RangeError(`${label} must be non-negative`);
  return number;
}
