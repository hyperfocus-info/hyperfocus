import { describe, expect, test } from "bun:test";
import {
  auditPhysicalActionAcceptance3D,
  auditPhysicalContactPoseAgreement3D,
  comparePhysicalActionMechanics3D,
  compilePhysicalPerformance3D,
  samplePhysicalBodyMotion3D,
  type PhysicalPerformance3D,
} from "../physical-performance-3d.ts";
import { sample3DPhysicalInspection } from "../../frame/3d-physical-inspection.ts";

function twoFighterFixture(): PhysicalPerformance3D {
  return {
    frameRate: 30,
    simulationHz: 120,
    durationFrames: 30,
    world: { gravityY: 0, velocityIterations: 4, constraintIterations: 8 },
    ragdolls: [
      {
        id: "primal",
        rootBoneId: "fist",
        bodies: [{ boneId: "fist", body: { shape: { kind: "sphere", radius: .2 }, mass: 2, collisionLayer: 1, collisionMask: 2 } }],
        joints: [],
        initialPose: { rotations: [] },
      },
      {
        id: "lumberjack",
        rootBoneId: "chest",
        bodies: [{ boneId: "chest", body: { shape: { kind: "box", halfX: .25, halfY: .5, halfZ: .2 }, x: 1, mass: 8, collisionLayer: 2, collisionMask: 1 } }],
        joints: [],
        initialPose: { rotations: [] },
      },
    ],
    cues: [{
      id: "first-punch",
      kind: "launch",
      frame: 0,
      attacker: { ragdollId: "primal", boneId: "fist" },
      target: { ragdollId: "lumberjack", boneId: "chest" },
      direction: [1, 0, 0],
      speedMetersPerSecond: 6,
      distanceMeters: 2,
      angularVelocityDegreesPerSecond: [0, 0, 120],
      expectedContactFrame: 2,
      contactToleranceFrames: 1,
    }],
    outputs: [{ ragdollId: "primal", boneId: "fist" }, { ragdollId: "lumberjack", boneId: "chest" }],
  };
}

describe("physical action acceptance sampling", () => {
  test("audits exact contact, continuity, and deterministic replay from compiled states", () => {
    const source = twoFighterFixture(), first = compilePhysicalPerformance3D({ performance: source }), replay = compilePhysicalPerformance3D({ performance: source });
    const contact = first.contacts.find((item) => item.cueId === "first-punch");
    expect(contact).toBeDefined();
    const report = auditPhysicalActionAcceptance3D({
      performance: first,
      replay,
      launchCueId: "first-punch",
      attacker: { ragdollId: "primal", boneId: "fist" },
      target: { ragdollId: "lumberjack", boneId: "chest" },
      startFrame: 0,
      endFrame: 12,
      expectedContactFrame: contact!.frame,
      contactToleranceFrames: 0,
      maximumFrameTranslationMeters: .5,
      maximumFrameRotationDegrees: 90,
    });
    expect(report.pass).toBe(true);
    expect(report.replayIdentical).toBe(true);
    expect(report.contact).toMatchObject({ cueId: "first-punch", frame: contact!.frame });
    expect(report.attacker.pathLengthMeters).toBeGreaterThan(report.attacker.displacementMeters);
    expect(report.target.samples).toHaveLength(13);
  });

  test("reports timing errors and frame pops instead of accepting structural presence", () => {
    const source = twoFighterFixture(), first = compilePhysicalPerformance3D({ performance: source }), replay = compilePhysicalPerformance3D({ performance: source });
    const contact = first.contacts.find((item) => item.cueId === "first-punch")!;
    const report = auditPhysicalActionAcceptance3D({
      performance: first,
      replay,
      launchCueId: "first-punch",
      attacker: { ragdollId: "primal", boneId: "fist" },
      target: { ragdollId: "lumberjack", boneId: "chest" },
      startFrame: 0,
      endFrame: 12,
      expectedContactFrame: contact.frame + 3,
      contactToleranceFrames: 0,
      maximumFrameTranslationMeters: .01,
      maximumFrameRotationDegrees: 1,
    });
    expect(report.pass).toBe(false);
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "contact-timing", frame: contact.frame }),
      expect.objectContaining({ code: "position-pop" }),
      expect.objectContaining({ code: "rotation-pop" }),
    ]));
  });

  test("rejects two nominal styles whose simulated mechanics are identical", () => {
    const compiled = compilePhysicalPerformance3D({ performance: twoFighterFixture() });
    const path = samplePhysicalBodyMotion3D({ performance: compiled, reference: { ragdollId: "primal", boneId: "fist" }, startFrame: 0, endFrame: 12 });
    expect(comparePhysicalActionMechanics3D({ left: path, right: path })).toEqual({
      distinct: false,
      rootMeanSquarePositionDifferenceMeters: 0,
      maximumPositionDifferenceMeters: 0,
      pathLengthDifferenceMeters: 0,
      curvatureDifferenceMeters: 0,
    });
  });

  test("surfaces an injected state jump as velocity-residual evidence in the shared frame inspector", () => {
    const source = twoFighterFixture(), compiled = compilePhysicalPerformance3D({ performance: source }), jumpFrame = 6, attackerOffset = jumpFrame * compiled.frameStride;
    compiled.states[attackerOffset] += 1;
    const inspection = sample3DPhysicalInspection({
      physicalPerformance: { simulation: source, bindings: [] },
      physicalInspection: { enabled: true, centerOfMass: true, supports: true, intentVectors: true, contacts: true, velocities: true, qualityFindings: true, breakEnergy: true, motionQuality: true, maximumTranslationResidualMeters: .08, maximumRotationResidualDegrees: 12, contactHistoryFrames: 4 },
    }, compiled, jumpFrame)!;
    expect(inspection.motionFindings).toContainEqual(expect.objectContaining({ code: "position-pop", frame: jumpFrame, reference: "primal/fist", pointer: "/extensions/hyperfocus3DVideo/physicalPerformance/simulation/ragdolls/0/bodies/0", threshold: .08 }));
  });

  test("requires visible stable rig bindings and IK to agree with solved contact", () => {
    const compiled = compilePhysicalPerformance3D({ performance: twoFighterFixture() }), contact = compiled.contacts.find((item) => item.cueId === "first-punch")!;
    const report = auditPhysicalContactPoseAgreement3D({
      contact,
      attacker: { role: "attacker", reference: contact.attacker, entityId: "primal", boneId: "fist", renderedWorldPosition: contact.point, contactReachMeters: .2, visible: true, stableBoneExists: true, ikTargetWorldPosition: contact.point },
      target: { role: "target", reference: contact.target, entityId: "lumberjack", boneId: "chest", renderedWorldPosition: [contact.point[0] + .2, contact.point[1], contact.point[2]], contactReachMeters: .25, visible: true, stableBoneExists: true },
    });
    expect(report).toMatchObject({ pass: true, maximumContactGapMeters: 0, maximumIkGapMeters: 0, findings: [] });
  });

  test("rejects a hand-out pose whose visible and IK contact are far from the collision", () => {
    const compiled = compilePhysicalPerformance3D({ performance: twoFighterFixture() }), contact = compiled.contacts.find((item) => item.cueId === "first-punch")!;
    const report = auditPhysicalContactPoseAgreement3D({
      contact,
      attacker: { role: "attacker", reference: contact.attacker, entityId: "primal", boneId: "fist", renderedWorldPosition: [contact.point[0] - 1, contact.point[1], contact.point[2]], contactReachMeters: .2, visible: true, stableBoneExists: true, ikTargetWorldPosition: [contact.point[0] - .8, contact.point[1], contact.point[2]] },
      target: { role: "target", reference: contact.target, entityId: "lumberjack", boneId: "chest", renderedWorldPosition: contact.point, contactReachMeters: .25, visible: false, stableBoneExists: false },
    });
    expect(report.pass).toBe(false);
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "pose-contact-gap", role: "attacker" }),
      expect.objectContaining({ code: "ik-contact-gap", role: "attacker" }),
      expect.objectContaining({ code: "pose-bone-missing", role: "target" }),
      expect.objectContaining({ code: "pose-hidden", role: "target" }),
    ]));
  });
});
