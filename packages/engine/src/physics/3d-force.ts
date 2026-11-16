import { finiteOr as finiteNumberOr } from "@hyperfocus/utilities/math";
import type { KinematicForce3DHandle, KinematicForce3DOptions, Vec3 } from "./3d.ts";

export type MutableForce = {
  id: string;
  vector: Vec3;
  remainingMs: number;
  continuous: boolean;
  damping: number;
  mass: number;
  active: boolean;
};

export function forceDurationMs(options: KinematicForce3DOptions) {
  if (options.durationMs !== undefined) return Math.max(0, finiteOr(options.durationMs, 0));
  if (options.durationSeconds !== undefined) return Math.max(0, finiteOr(options.durationSeconds, 0) * 1000);
  return options.continuous ? Number.POSITIVE_INFINITY : 0;
}

export function forceHandle(force: MutableForce): KinematicForce3DHandle {
  return {
    id: force.id,
    get active() {
      return force.active;
    },
    cancel() {
      force.active = false;
    }
  };
}

export function inactiveForceHandle(id: string): KinematicForce3DHandle {
  return {
    id,
    active: false,
    cancel() {}
  };
}

function finiteOr(value: unknown, fallback: number) { return finiteNumberOr(Number(value), fallback); }
