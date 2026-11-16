import { describe, expect, test } from "bun:test";
import { requiredPhysicalEffectorPeakSpeed3D, samplePhysicalEffectorPath3D, validatePhysicalEffectorPath3D } from "./effector-path-3d.ts";

describe("deterministic physical effector paths", () => {
  test("keeps endpoints exact while giving horizontal and vertical attacks distinct arcs", () => {
    const shared = { direction: [1, 0, 0] as const, distanceMeters: 1, durationSeconds: .5 };
    const straight = samplePhysicalEffectorPath3D({ ...shared, progress: .5 });
    const hook = samplePhysicalEffectorPath3D({ ...shared, path: { mode: "arc", plane: "horizontal", heightMeters: .3 }, progress: .5 });
    const overhand = samplePhysicalEffectorPath3D({ ...shared, path: { mode: "arc", plane: "vertical", heightMeters: .3 }, progress: .5 });
    expect(straight.offset).toEqual([.5, 0, 0]);
    expect(hook.offset[0]).toBeCloseTo(.5); expect(hook.offset[2]).toBeCloseTo(-.3);
    expect(overhand.offset[0]).toBeCloseTo(.5); expect(overhand.offset[1]).toBeCloseTo(.3);
    for (const path of [{ mode: "arc", plane: "horizontal", heightMeters: .3 } as const, { mode: "arc", plane: "vertical", heightMeters: .3, side: -1 } as const]) {
      expect(samplePhysicalEffectorPath3D({ ...shared, path, progress: 0 })).toEqual({ offset: [0, 0, 0], velocity: [0, 0, 0] });
      expect(samplePhysicalEffectorPath3D({ ...shared, path, progress: 1 })).toEqual({ offset: [1, 0, 0], velocity: [0, 0, 0] });
    }
  });

  test("accounts for arc velocity in duration preflight", () => {
    const shared = { direction: [1, 0, 0] as const, distanceMeters: .8, durationSeconds: .25 };
    const straight = requiredPhysicalEffectorPeakSpeed3D(shared);
    const curved = requiredPhysicalEffectorPeakSpeed3D({ ...shared, path: { mode: "arc", plane: "horizontal", heightMeters: .5 } });
    expect(straight).toBeCloseTo(4.8); expect(curved).toBeGreaterThan(straight);
  });

  test("rejects unsupported portable path data with project pointers", () => {
    expect(() => Reflect.apply(validatePhysicalEffectorPath3D, undefined, [{ mode: "arc", plane: "spiral", heightMeters: .2 }, "/performance/cues/4/path"])).toThrow("/performance/cues/4/path/plane");
    expect(() => validatePhysicalEffectorPath3D({ mode: "arc", plane: "vertical", heightMeters: 0 }, "/performance/cues/5/path")).toThrow("/performance/cues/5/path/heightMeters");
  });
});
