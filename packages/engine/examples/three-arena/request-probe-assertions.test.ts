import { describe, expect, test } from "bun:test";
import {
  assertEngineMotionRequestProbe,
  collectEngineMotionProbeFailures,
  parseEngineMotionRecoilProbe,
  parseEngineMotionSnapshotProbe,
  type EngineMotionRequestProbe,
  type EngineMotionSnapshotProbe,
} from "./request-probe-assertions.ts";

function snapshot(overrides: Partial<EngineMotionSnapshotProbe> = {}): EngineMotionSnapshotProbe {
  return {
    active: true,
    capabilities: { aim: true, baseLocomotion: true, leftFootPlant: true, rightFootPlant: true },
    lastPresentation: { landSource: "engine-motion", recoilSource: "engine-motion" },
    mappingValidated: true,
    metrics: {
      footSlipDistance: 0.019,
      leftGripError: 0.01,
      rightGripError: 0.01,
      headAboveHipsMeters: 0.7,
      hipsAimDeltaRadians: 0.01,
      plantedVerticalError: 1e-4,
      poseChecksum: "baseline",
      poseFinite: true,
      torsoFoldRadians: 1.19,
    },
    ...overrides,
  };
}

function probe(): EngineMotionRequestProbe {
  return {
    baseline: snapshot(),
    landed: snapshot(),
    extremeAim: {
      pitchRadians: Math.PI * 0.4,
      up: snapshot({ metrics: { ...snapshot().metrics, poseChecksum: "aim-up" } }),
      upReplay: snapshot({ metrics: { ...snapshot().metrics, poseChecksum: "aim-up" } }),
      down: snapshot({ metrics: { ...snapshot().metrics, poseChecksum: "aim-down" } }),
      downReplay: snapshot({ metrics: { ...snapshot().metrics, poseChecksum: "aim-down" } }),
    },
    recoil: {
      before: snapshot({ metrics: { ...snapshot().metrics, poseChecksum: "recoil-before" } }),
      after: snapshot({ metrics: { ...snapshot().metrics, poseChecksum: "recoil-after" } }),
    },
  };
}

describe("Three Arena engine-motion request probe", () => {
  test("accepts strict semantic safety boundaries", () => {
    const value = probe();
    expect(collectEngineMotionProbeFailures(value)).toEqual([]);
    expect(() => assertEngineMotionRequestProbe(value)).not.toThrow();
  });

  test("parses the browser debug contract without coercion", () => {
    const value = snapshot();
    expect(parseEngineMotionSnapshotProbe(value)).toEqual(value);
    expect(parseEngineMotionRecoilProbe({ before: value, after: value })).toEqual({ before: value, after: value });
    expect(() => parseEngineMotionSnapshotProbe({ ...value, metrics: { ...value.metrics, poseFinite: "yes" } }))
      .toThrow("poseFinite must be a boolean");
    expect(() => parseEngineMotionRecoilProbe({ before: value })).toThrow("after must be an object");
  });

  test("rejects disabled mapping, capabilities, and non-finite contact poses", () => {
    const value = probe();
    value.baseline = snapshot({
      active: false,
      capabilities: { ...snapshot().capabilities, leftFootPlant: false },
      mappingValidated: false,
      metrics: { ...snapshot().metrics, poseFinite: false },
    });
    const failures = collectEngineMotionProbeFailures(value).join("\n");
    expect(failures).toContain("engine motion is inactive");
    expect(failures).toContain("semantic mapping is unvalidated");
    expect(failures).toContain("leftFootPlant capability is disabled");
    expect(failures).toContain("pose is non-finite");
  });

  test("enforces slip, vertical contact, and briefcase-fold gates", () => {
    const value = probe();
    value.extremeAim.up = snapshot({
      metrics: {
        ...snapshot().metrics,
        footSlipDistance: 0.02,
        leftGripError: 0.01,
        rightGripError: 0.01,
        headAboveHipsMeters: 0.2,
        hipsAimDeltaRadians: 0.051,
        plantedVerticalError: 0.000101,
        poseChecksum: "aim-up",
        torsoFoldRadians: 1.2,
      },
    });
    const failures = collectEngineMotionProbeFailures(value).join("\n");
    expect(failures).toContain("planted slip");
    expect(failures).toContain("planted vertical error");
    expect(failures).toContain("torso fold");
    expect(failures).toContain("head is only");
    expect(failures).toContain("hips absorbed");
  });

  test("requires deterministic directional aim and engine-motion presentations", () => {
    const value = probe();
    value.extremeAim.upReplay = snapshot({ metrics: { ...snapshot().metrics, poseChecksum: "different" } });
    value.extremeAim.down = snapshot({ metrics: { ...snapshot().metrics, poseChecksum: "aim-up" } });
    value.extremeAim.downReplay = snapshot({ metrics: { ...snapshot().metrics, poseChecksum: "aim-up" } });
    value.landed = snapshot({ lastPresentation: { landSource: "universal", recoilSource: null } });
    value.recoil.before = snapshot({ metrics: { ...snapshot().metrics, poseChecksum: "same" } });
    value.recoil.after = snapshot({
      lastPresentation: { landSource: "engine-motion", recoilSource: "procedural" },
      metrics: { ...snapshot().metrics, poseChecksum: "same" },
    });
    const failures = collectEngineMotionProbeFailures(value).join("\n");
    expect(failures).toContain("aim-up fixed-step replay was not deterministic");
    expect(failures).toContain("aim-up and aim-down produced the same pose checksum");
    expect(failures).toContain("land presentation source was universal");
    expect(failures).toContain("recoil presentation source was procedural");
    expect(failures).toContain("recoil did not change the pose checksum");
  });
});
