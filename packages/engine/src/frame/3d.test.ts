import { tuple3 } from "../math/tuples.ts";
import type { Hyperfocus3DRootMotionPolicy } from "./3d.ts";
import { describe, expect, test } from "bun:test";
import { audit3DFrameCapabilities, sample3DFrame, sample3DIkCorrections, sample3DPhysicalInspection, sample3DPoseCorrections } from "../project/runtime-3d.ts";
import { compilePhysicalPerformance3D } from "../physics/physical-performance-3d.ts";

import { frameDeclarationFixture3D as declaration, frameTimelineFixture3D as timeline } from '../test-support/frame3d.ts';

describe("canonical 3D frame sampling", () => {
  test("eases portable pose layers by default and honors explicit edge handles", () => {
    const value = timeline();
    value.poseCorrections = [{ id: "guard", entityId: "goku", boneId: "hand", startFrame: 10, durationFrames: 11, stage: "post-animation", weight: .8, translation: [0, 0, 0], rotationEuler: [0, 0, 1], rotationSpace: "model" }];
    expect(sample3DPoseCorrections(value, 10)[0]!.weight).toBe(0);
    expect(sample3DPoseCorrections(value, 12)[0]!.weight).toBeGreaterThan(0);
    expect(sample3DPoseCorrections(value, 15)[0]).toMatchObject({ weight: .8, rotationSpace: "model" });
    expect(sample3DPoseCorrections(value, 20)[0]!.weight).toBe(0);
    value.poseCorrections[0]!.blendInFrames = 0; value.poseCorrections[0]!.blendOutFrames = 0;
    expect(sample3DPoseCorrections(value, 10)[0]!.weight).toBe(.8);
    expect(sample3DPoseCorrections(value, 20)[0]!.weight).toBe(.8);
    value.poseCorrections[0]!.transition = "cut";
    expect(sample3DPoseCorrections(value, 10)[0]!.weight).toBe(.8);
    expect(sample3DPoseCorrections(value, 20)[0]!.weight).toBe(.8);
    expect(sample3DPoseCorrections(value, 21)).toEqual([]);
    value.poseCorrections = [{ ...value.poseCorrections[0]!, startFrame: 30, durationFrames: 4, transition: "blend", blendInFrames: undefined, blendOutFrames: undefined }];
    expect([30, 31, 32, 33].map((frame) => sample3DPoseCorrections(value, frame)[0]!.weight)).toEqual([0, .8, .8, 0]);
  });

  test("samples a smooth windup-contact-follow-through IK path with default anti-snap envelopes", () => {
    const value = timeline();
    value.ikCorrections = [{ id: "right-cross", entityId: "goku", startFrame: 10, durationFrames: 11, rootBoneId: "shoulder", middleBoneId: "elbow", endBoneId: "fist", targetFrom: [0, 1, .2], target: [0, 1, 1], targetTo: [0, 1, 1.35], contactFrame: 15, followThroughFrame: 18, poleFrom: [0, -1, 0], pole: [1, 0, 0], poleTo: [-1, 0, 0], weight: .9, maxStretch: 1.05, interpolation: "smooth" }];
    const start = sample3DIkCorrections(value, 10)[0]!, committed = sample3DIkCorrections(value, 12)[0]!, contact = sample3DIkCorrections(value, 15)[0]!, follow = sample3DIkCorrections(value, 17)[0]!, followEnd = sample3DIkCorrections(value, 18)[0]!, end = sample3DIkCorrections(value, 20)[0]!;
    expect(start.target).toEqual([0, 1, .2]); expect(start.pole).toEqual([0, -1, 0]); expect(start.weight).toBe(0);
    expect(committed.target[2]).toBeGreaterThan(.2); expect(committed.target[2]).toBeLessThan(1); expect(committed.weight).toBeGreaterThan(0);
    expect(contact.target).toEqual([0, 1, 1]); expect(contact.pole).toEqual([1, 0, 0]); expect(contact.weight).toBe(.9);
    expect(follow.target[2]).toBeGreaterThan(1); expect(follow.target[2]).toBeLessThan(1.35); expect(follow.weight).toBeGreaterThan(0);
    expect(followEnd.target).toEqual([0, 1, 1.35]); expect(followEnd.pole).toEqual([-1, 0, 0]);
    expect(end.target).toEqual([0, 1, 1.35]); expect(end.pole).toEqual([-1, 0, 0]); expect(end.weight).toBe(0);
    value.ikCorrections[0]!.blendInFrames = 0; value.ikCorrections[0]!.blendOutFrames = 0;
    expect(sample3DIkCorrections(value, 10)[0]!.weight).toBe(.9);
    expect(sample3DIkCorrections(value, 20)[0]!.weight).toBe(.9);
    value.ikCorrections[0]!.transition = "cut";
    expect(sample3DIkCorrections(value, 10)[0]!.weight).toBe(.9);
    expect(sample3DIkCorrections(value, 20)[0]!.weight).toBe(.9);
    expect(sample3DIkCorrections(value, 21)).toEqual([]);
  });

  test("holds anticipation then reaches contact with the authored physical velocity", () => {
    const value = timeline();
    value.ikCorrections = [{ id: "velocity-cross", entityId: "goku", startFrame: 10, durationFrames: 11, rootBoneId: "shoulder", middleBoneId: "elbow", endBoneId: "fist", targetFrom: [0, 1, .8], target: [0, 1, 1], targetTo: [0, 1, 1.2], strikeStartFrame: 13, contactFrame: 15, contactVelocity: [0, 0, 6], pole: [0, 1, 1], weight: 1, maxStretch: 1.05, interpolation: "momentum", blendInFrames: 3, blendOutFrames: 3 }];
    expect(sample3DIkCorrections(value, 12)[0]!.target).toEqual([0, 1, .8]);
    expect(sample3DIkCorrections(value, 13)[0]!.target).toEqual([0, 1, .8]);
    expect(sample3DIkCorrections(value, 14)[0]!.target[2]).toBeCloseTo(.85, 8);
    expect(sample3DIkCorrections(value, 15)[0]!.target).toEqual([0, 1, 1]);
    const before = sample3DIkCorrections(value, 14.999)[0]!.target[2], atContact = sample3DIkCorrections(value, 15)[0]!.target[2];
    expect((atContact - before) / ((0.0009999999999994458) / value.fps)).toBeCloseTo(6, 2);
    expect(sample3DIkCorrections(value, 16)[0]!.target[2]).toBeGreaterThan(1);
  });

  test("video and fixed-tick clocks produce structurally identical frame state", () => {
    const sequence = timeline(); sequence.impactFrames = [{ id: "contact", preset: "red-contact-burst", startFrame: 15, durationFrames: 1, intensity: 1, seed: 42, center: [0.62, 0.45], freezeSource: true }];
    const shared = { declaration: declaration(), timeline: sequence, viewport: { width: 1920, height: 1080 } };
    const video = sample3DFrame({ ...shared, clock: { kind: "video", frameIndex: 15, fps: 30 } });
    const gameplay = sample3DFrame({ ...shared, clock: { kind: "simulation", tick: 30, ticksPerSecond: 60 } });
    expect(gameplay).toEqual(video);
    expect(video.entities.map((item) => item.id)).toEqual(["goku", "cell"]);
    expect(video.renderGraph.tier).toBe("video-safe");
    expect(video.renderGraph.bloom?.strength).toBe(0.5);
    expect(video.renderGraph.impactFrame).toMatchObject({ id: "contact", preset: "red-contact-burst", source: "scene-threshold", localFrame: 0, center: [0.62, 0.45] });
  });

  test("freezes scene evaluation across a multi-frame graphic hold without changing the delivery clock", () => {
    const sequence = timeline(); sequence.entityTracks = [{ entityId: "goku", keyframes: [{ id: "from", frame: 0, position: [0, 0, 0], rotationEuler: [0, 0, 0], scale: [1, 1, 1], visible: true, interpolation: "linear" }, { id: "to", frame: 30, position: [30, 0, 0], rotationEuler: [0, 0, 0], scale: [1, 1, 1], visible: true, interpolation: "linear" }] }]; sequence.impactFrames = [{ id: "hold", preset: "radial-brush", startFrame: 10, durationFrames: 3, intensity: 1, seed: 7, center: [0.5, 0.5], freezeSource: true }];
    const options = { declaration: declaration(), timeline: sequence, viewport: { width: 640, height: 360 } };
    const first = sample3DFrame({ ...options, clock: { kind: "video" as const, frameIndex: 10, fps: 30 } }), held = sample3DFrame({ ...options, clock: { kind: "video" as const, frameIndex: 12, fps: 30 } }), after = sample3DFrame({ ...options, clock: { kind: "video" as const, frameIndex: 13, fps: 30 } });
    expect(held.frameIndex).toBe(12); expect(held.entities).toEqual(first.entities); expect(held.camera).toEqual(first.camera); expect(held.renderGraph.impactFrame?.localFrame).toBe(2); expect(after.renderGraph.impactFrame).toBeUndefined(); expect(after.entities.find((entity) => entity.id === "goku")!.position[0]).toBe(13);
  });

  test("preflight reports exact broken resources and unsupported passes", () => {
    const value = timeline(); value.groups[0]!.entityIds.push("vegeta"); value.materialTracks[0]!.materialId = "missing";
    const result = audit3DFrameCapabilities({ declaration: declaration(), timeline: value, boundary: "export", supportedPasses: new Set(["shadows", "color"]) });
    expect(result.some((item) => item.pointer.includes("entityIds") && item.message.includes("vegeta"))).toBe(true);
    expect(result.some((item) => item.feature === "material track" && item.boundary === "export")).toBe(true);
    expect(result.some((item) => item.feature === "bloom pass" && item.alternative)).toBe(true);
  });

  test("preflight rejects overlapping physical causes on one entity", () => {
    const value = timeline(); value.motionTracks = [{ entityId: "goku", segments: [
      { id: "dash", startFrame: 0, durationFrames: 20, origin: [0, 0, 0], velocity: [2, 0, 0], acceleration: [0, 0, 0], rotationEuler: [0, 0, 0], angularVelocity: [0, 0, 0], state: "grounded", groundY: 0 },
      { id: "hit", startFrame: 12, durationFrames: 12, origin: [1, 0, 0], velocity: [0, 0, 0], acceleration: [0, 0, 0], rotationEuler: [0, 0, 0], angularVelocity: [0, 0, 0], state: "grounded", groundY: 0 },
    ] }];
    expect(audit3DFrameCapabilities({ declaration: declaration(), timeline: value, boundary: "timeline" })).toContainEqual(expect.objectContaining({ code: "motion-segment-overlap", pointer: "/extensions/hyperfocus3DVideo/motionTracks/0/segments/1/startFrame" }));
  });

  test("uses one compiled physical source for direct scrub, gameplay clocks, contacts, and entity overrides", () => {
    const sequence = timeline();
    sequence.physicalPerformance = {
      simulation: {
        frameRate: 30,
        simulationHz: 120,
        durationFrames: 60,
        world: { gravityY: 0 },
        ragdolls: [
          { id: "goku", rootBoneId: "fist", bodies: [{ boneId: "fist", body: { shape: { kind: "sphere", radius: 0.2 }, x: -1, mass: 2, collisionLayer: 1, collisionMask: 2 } }], joints: [], initialPose: { rotations: [] } },
          { id: "cell", rootBoneId: "chest", bodies: [{ boneId: "chest", body: { shape: { kind: "box", halfX: 0.25, halfY: 0.5, halfZ: 0.2 }, x: 1, mass: 8, collisionLayer: 2, collisionMask: 1 } }], joints: [], initialPose: { rotations: [] } },
        ],
        cues: [{ id: "physical-punch", kind: "launch", frame: 0, attacker: { ragdollId: "goku", boneId: "fist" }, target: { ragdollId: "cell", boneId: "chest" }, direction: [1, 0, 0], speedMetersPerSecond: 6, distanceMeters: 3 }],
      },
      bindings: [
        { reference: { ragdollId: "goku", boneId: "fist" }, entityId: "goku", positionOffset: [0, 0, 0], rotationOffset: [0, 0, 0, 1] },
        { reference: { ragdollId: "cell", boneId: "chest" }, entityId: "cell", positionOffset: [0, 0, 0], rotationOffset: [0, 0, 0, 1] },
      ],
    };
    sequence.physicalInspection = { enabled: true, centerOfMass: true, supports: true, intentVectors: true, contacts: true, velocities: true, contactHistoryFrames: 2 };
    sequence.contactResponses = [{ id: "physical-response", contactId: "physical-punch", offsetFrames: 1, cameraShake: .25, cameraShakeFrames: 6, audioAssetId: "contact-sfx", gain: .8, pan: -.2 }];
    sequence.effectCues = [{ id: "physical-sparks", kind: "sparks", startFrame: 0, durationFrames: 8, contactId: "physical-punch", contactOffsetFrames: 2, meshId: "fighter", materialId: "fighter-skin", count: 2, seed: 4, radius: 0.1, speed: 2, size: 0.1 }];
    sequence.impactFrames = [{ id: "physical-impact", preset: "red-contact-burst", startFrame: 0, durationFrames: 1, intensity: 1, seed: 4, center: [0.5, 0.5], freezeSource: false, contactId: "physical-punch", contactOffsetFrames: 1 }];
    const physicalPerformance = compilePhysicalPerformance3D({ performance: sequence.physicalPerformance.simulation }), contactFrame = physicalPerformance.contacts[0]!.frame;
    const scene = declaration(); scene.audio.cues = ["contact-sfx"];
    const shared = { declaration: scene, timeline: sequence, viewport: { width: 640, height: 360 }, physicalPerformance };
    const contact = sample3DFrame({ ...shared, clock: { kind: "video" as const, frameIndex: contactFrame, fps: 30 } });
    const direct = sample3DFrame({ ...shared, clock: { kind: "video" as const, frameIndex: contactFrame + 1, fps: 30 } });
    const gameplay = sample3DFrame({ ...shared, clock: { kind: "simulation" as const, tick: (contactFrame + 1) * 2, ticksPerSecond: 60 } });
    expect(direct).toEqual(gameplay);
    const launch = sample3DFrame({ ...shared, clock: { kind: "video" as const, frameIndex: 0, fps: 30 } });
    expect(launch.physicalInspection?.intents).toContainEqual(expect.objectContaining({ id: "physical-punch", kind: "launch", ragdollId: "goku", boneId: "fist" }));
    expect(launch.physicalInspection?.intents[0]?.plannedTo[0]).toBeCloseTo(2.2, 5);
    expect(launch.physicalInspection?.ragdolls.find((item) => item.id === "goku")?.centerOfMass[0]).toBeCloseTo(-.8, 5);
    expect(direct.physicalInspection?.contacts).toContainEqual(expect.objectContaining({ id: "physical-punch", frame: contactFrame, speed: expect.any(Number), energy: expect.any(Number), impulse: expect.any(Number) }));
    expect(direct.contacts).toEqual([expect.objectContaining({ id: "physical-punch", frame: contactFrame, subframe: expect.any(Number), normal: expect.any(Array) })]);
    expect(contact.effects).toEqual([]); expect(contact.renderGraph.impactFrame).toBeUndefined(); expect(contact.audioEvents).toEqual([]);
    expect(direct.effects).toEqual([]);
    expect(direct.renderGraph.impactFrame?.id).toBe("physical-impact");
    expect(direct.audioEvents).toEqual([{ id: "physical-response", assetId: "contact-sfx", frame: contactFrame + 1, subframe: 0, point: physicalPerformance.contacts[0]!.point, gain: .8, pan: -.2 }]);
    expect(direct.camera.position).not.toEqual(contact.camera.position);
    expect(sample3DFrame({ ...shared, clock: { kind: "video", frameIndex: contactFrame + 2, fps: 30 } }).effects[0]?.id).toBe("physical-sparks");
    expect(direct.entities.find((entity) => entity.id === "goku")!.position[0]).toBeGreaterThan(-1);
    expect(() => sample3DFrame({ declaration: declaration(), timeline: sequence, viewport: { width: 1, height: 1 }, clock: { kind: "video", frameIndex: 0, fps: 30 } })).toThrow("compiled once");
  });

  test("keeps a ready procedural locomotion pose across an intent gap and yields on ragdoll authority", () => {
    const sequence = timeline();
    sequence.durationFrames = 8;
    sequence.physicalPerformance = {
      simulation: {
        frameRate: 30, simulationHz: 120, durationFrames: 8, world: { gravityY: 0 },
        ragdolls: [{ id: "runner", rootBoneId: "hips", bodies: [
          { boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, x: -1, mass: 8, collisionLayer: 2, collisionMask: 0 } },
          { boneId: "foot", body: { shape: { kind: "sphere", radius: .1 }, x: -1, y: -.4, mass: 1, collisionLayer: 2, collisionMask: 0 } },
        ], joints: [], initialPose: { rotations: [] } }],
        cues: [{ id: "walk", kind: "locomotion", frame: 0, durationFrames: 2, ragdollId: "runner", direction: [1, 0, 0], distanceMeters: .02, peakSpeedMetersPerSecond: 1, pace: "walk" }],
      },
      bindings: [
        { reference: { ragdollId: "runner", boneId: "hips" }, entityId: "goku", positionOffset: [0, 0, 0], rotationOffset: [0, 0, 0, 1] },
        { reference: { ragdollId: "runner", boneId: "foot" }, entityId: "goku", boneId: "foot", positionOffset: [0, 0, 0], rotationOffset: [0, 0, 0, 1] },
      ],
    };
    const compiled = compilePhysicalPerformance3D({ performance: sequence.physicalPerformance.simulation });
    const gap = sample3DFrame({ declaration: declaration(), timeline: sequence, physicalPerformance: compiled, clock: { kind: "video", frameIndex: 4, fps: 30 }, viewport: { width: 320, height: 180 } });
    expect(gap.physicalBodies).toEqual([]);
    expect(gap.entities.find((entity) => entity.id === "goku")!.position[0]).toBeGreaterThan(-1);

    sequence.physicalPerformance.simulation.cues = [
      ...sequence.physicalPerformance.simulation.cues,
      { id: "fall", kind: "mode", frame: 3, ragdollId: "runner", mode: "passive" },
    ];
    const downed = compilePhysicalPerformance3D({ performance: sequence.physicalPerformance.simulation });
    const consequence = sample3DFrame({ declaration: declaration(), timeline: sequence, physicalPerformance: downed, clock: { kind: "video", frameIndex: 4, fps: 30 }, viewport: { width: 320, height: 180 } });
    expect(consequence.physicalBodies).toEqual([expect.objectContaining({ entityId: "goku", boneId: "foot" })]);
  });

  test("inspects center of mass and authored support footprint from arbitrary compiled frames", () => {
    const sequence = timeline(); sequence.physicalInspection = { enabled: true, ragdollId: "fighter", centerOfMass: true, supports: true, intentVectors: true, contacts: true, velocities: true, contactHistoryFrames: 3 };
    sequence.physicalPerformance = { simulation: { frameRate: 30, simulationHz: 120, durationFrames: 60, world: { gravityY: 0 }, bodies: [{ id: "ground", type: "static", shape: { kind: "box", halfX: 4, halfY: .1, halfZ: 4 }, y: -.1, collisionLayer: 1, collisionMask: 1 }], ragdolls: [{ id: "fighter", rootBoneId: "left-foot", bodies: [{ boneId: "left-foot", body: { shape: { kind: "sphere", radius: .1 }, x: -.2, y: .1, mass: 2, collisionLayer: 1, collisionMask: 1 } }, { boneId: "right-foot", body: { shape: { kind: "sphere", radius: .1 }, x: .2, y: .1, mass: 2, collisionLayer: 1, collisionMask: 1 } }], joints: [], initialPose: { rotations: [] } }], cues: [{ id: "left-plant", kind: "support", frame: 0, durationFrames: 20, ragdollId: "fighter", boneId: "left-foot", groundLayerMask: 1, balanceRadiusMeters: .12 }, { id: "right-plant", kind: "support", frame: 0, durationFrames: 20, ragdollId: "fighter", boneId: "right-foot", groundLayerMask: 1, balanceRadiusMeters: .12 }], outputs: [{ ragdollId: "fighter", boneId: "left-foot" }, { ragdollId: "fighter", boneId: "right-foot" }] }, bindings: [{ reference: { ragdollId: "fighter", boneId: "left-foot" }, entityId: "goku", boneId: "left-foot", positionOffset: [0, 0, 0], rotationOffset: [0, 0, 0, 1] }] };
    const compiled = compilePhysicalPerformance3D({ performance: sequence.physicalPerformance.simulation }), direct = sample3DPhysicalInspection(sequence, compiled, 7), replay = sample3DPhysicalInspection(sequence, compiled, 7);
    expect(direct).toEqual(replay); expect(direct?.ragdolls).toHaveLength(1); expect(direct?.ragdolls[0]?.supportPoints).toHaveLength(2); expect(direct?.ragdolls[0]?.supportHull).toHaveLength(2); expect(direct?.ragdolls[0]?.balanceDistance).toBe(0); expect(direct?.ragdolls[0]?.predictedBalanceDistance).toBe(0);
  });

  test("locates quality failures and impact break energy at arbitrary frames", () => {
    const qualitySequence = timeline();
    qualitySequence.physicalInspection = { enabled: true, centerOfMass: true, supports: true, intentVectors: true, contacts: true, velocities: false, qualityFindings: true, breakEnergy: true, contactHistoryFrames: 3 };
    qualitySequence.physicalPerformance = { simulation: { frameRate: 30, simulationHz: 120, durationFrames: 60, world: { gravityY: 0 }, quality: { maximumPenetrationMeters: .01 }, bodies: [
      { id: "terrain-a", shape: { kind: "sphere", radius: 1 }, mass: 1, collisionLayer: 1, collisionMask: 1 },
      { id: "terrain-b", shape: { kind: "sphere", radius: 1 }, x: .1, mass: 1, collisionLayer: 1, collisionMask: 1 },
    ], ragdolls: [], cues: [], outputs: [{ bodyId: "terrain-a" }] }, bindings: [{ reference: { bodyId: "terrain-a" }, entityId: "goku", positionOffset: [0, 0, 0], rotationOffset: [0, 0, 0, 1] }] };
    const qualitySource = compilePhysicalPerformance3D({ performance: qualitySequence.physicalPerformance.simulation }), quality = sample3DPhysicalInspection(qualitySequence, qualitySource, 0), qualityReplay = sample3DPhysicalInspection(qualitySequence, qualitySource, 0);
    expect(quality).toEqual(qualityReplay);
    expect(quality?.qualityFindings).toEqual([expect.objectContaining({ code: "severe-penetration", frame: 0, scopeId: "terrain-a/terrain-b", location: "terrain-a / terrain-b contact", pointer: "/extensions/hyperfocus3DVideo/physicalPerformance/simulation/bodies/0", position: expect.any(Array) })]);

    const halfTurn = Math.sin(Math.PI / 3), jointSequence = timeline(); jointSequence.physicalInspection = { ...qualitySequence.physicalInspection!, ragdollId: "fighter" };
    jointSequence.physicalPerformance = { simulation: { frameRate: 30, simulationHz: 120, durationFrames: 60, world: { gravityY: 0, constraintIterations: 1 }, quality: { maximumJointLimitExcessRadians: .01, jointLimitSaturationFrames: 1 }, ragdolls: [{ id: "fighter", rootBoneId: "hips", bodies: [
      { boneId: "hips", body: { shape: { kind: "sphere", radius: .1 }, mass: 10, collisionLayer: 1, collisionMask: 0 } },
      { boneId: "arm", body: { shape: { kind: "sphere", radius: .1 }, x: 1, rotation: [0, 0, halfTurn, .5], mass: 1, collisionLayer: 1, collisionMask: 0 } },
    ], joints: [{ id: "shoulder", parentBoneId: "hips", childBoneId: "arm", poseJointIndex: 0, localAnchorParent: [1, 0, 0], angularLimitRadians: .05, maxLimitTorqueImpulse: .00001, maxTorqueImpulse: 0 }], initialPose: { rotations: [0, 0, 0, 1] } }], cues: [], outputs: [{ ragdollId: "fighter", boneId: "hips" }, { ragdollId: "fighter", boneId: "arm" }] }, bindings: [{ reference: { ragdollId: "fighter", boneId: "hips" }, entityId: "goku", positionOffset: [0, 0, 0], rotationOffset: [0, 0, 0, 1] }] };
    const jointSource = compilePhysicalPerformance3D({ performance: jointSequence.physicalPerformance.simulation }), jointDiagnostic = jointSource.diagnostics.find((item) => item.code === "joint-limit-saturation")!, joint = sample3DPhysicalInspection(jointSequence, jointSource, jointDiagnostic.frame);
    expect(joint?.qualityFindings).toEqual([expect.objectContaining({ code: "joint-limit-saturation", scopeId: "fighter/shoulder", location: "fighter/shoulder", pointer: "/extensions/hyperfocus3DVideo/physicalPerformance/simulation/ragdolls/0/joints/0/angularLimitRadians", position: expect.any(Array), secondaryPosition: expect.any(Array) })]);

    const breakSequence = timeline(); breakSequence.physicalInspection = { enabled: true, ragdollId: "fighter", centerOfMass: true, supports: true, intentVectors: true, contacts: true, velocities: false, qualityFindings: true, breakEnergy: true, contactHistoryFrames: 3 };
    breakSequence.physicalPerformance = { simulation: { frameRate: 30, simulationHz: 120, durationFrames: 60, world: { gravityY: 0, constraintIterations: 8 }, bodies: [
      { id: "anchor", type: "static", shape: { kind: "sphere", radius: .05 }, collisionMask: 0 },
      { id: "wall", shape: { kind: "box", halfX: .2, halfY: 1, halfZ: 1 }, x: 1, mass: 20, collisionLayer: 2, collisionMask: 1, impactResponse: { fractureEnergyJoules: 40, retainedEnergyRatio: .9 } },
    ], ragdolls: [{ id: "fighter", rootBoneId: "fist", bodies: [{ boneId: "fist", body: { shape: { kind: "sphere", radius: .2 }, mass: 2, collisionLayer: 1, collisionMask: 2 } }], joints: [], initialPose: { rotations: [] } }], constraints: [{ id: "wall-seam", breakGroupId: "wall", kind: "point", a: { bodyId: "anchor" }, b: { bodyId: "wall" }, localAnchorA: [1, 0, 0], breakImpulse: 1_000 }], cues: [{ id: "breakthrough", kind: "launch", frame: 0, attacker: { ragdollId: "fighter", boneId: "fist" }, target: { bodyId: "wall" }, direction: [1, 0, 0], speedMetersPerSecond: 12, distanceMeters: 2 }], outputs: [{ ragdollId: "fighter", boneId: "fist" }, { bodyId: "wall" }] }, bindings: [{ reference: { ragdollId: "fighter", boneId: "fist" }, entityId: "goku", positionOffset: [0, 0, 0], rotationOffset: [0, 0, 0, 1] }] };
    const breakSource = compilePhysicalPerformance3D({ performance: breakSequence.physicalPerformance.simulation }), breakFrame = breakSource.breaks[0]!.frame, direct = sample3DPhysicalInspection(breakSequence, breakSource, breakFrame), replay = sample3DPhysicalInspection(breakSequence, breakSource, breakFrame);
    expect(direct).toEqual(replay);
    expect(direct?.breaks).toEqual([expect.objectContaining({ id: "wall-seam", groupId: "wall", frame: breakFrame, cause: "impact", energy: expect.any(Number), threshold: 40, retainedEnergyRatio: .9, speed: 12, impulse: expect.any(Number), point: [.8, 0, 0] })]);
    expect(direct!.breaks[0]!.energy).toBeGreaterThan(direct!.breaks[0]!.threshold!);
  });

  test("derives fractured variants, debris, and one exact audio event from the same seam break", () => {
    const scene = declaration(), sequence = timeline();
    scene.audio.cues = ["break-sfx"];
    scene.scenes[0]!.entities[1]!.variants = [{ id: "fractured", meshId: "fighter", materialId: "fighter-skin" }];
    sequence.physicalPerformance = {
      simulation: {
        frameRate: 30, simulationHz: 120, durationFrames: 60, world: { gravityY: 0, constraintIterations: 8 },
        bodies: [
          { id: "mountain", type: "static", shape: { kind: "sphere", radius: .1 }, x: 1, collisionLayer: 4, collisionMask: 4 },
          { id: "rock-chunk", shape: { kind: "box", halfX: .25, halfY: .4, halfZ: .25 }, x: 1, mass: 5, collisionLayer: 2, collisionMask: 1 },
        ],
        ragdolls: [{ id: "goku-body", rootBoneId: "fist", bodies: [{ boneId: "fist", body: { shape: { kind: "sphere", radius: .2 }, mass: 2, collisionLayer: 1, collisionMask: 2 } }], joints: [], initialPose: { rotations: [] } }],
        constraints: [{ id: "fracture-seam", breakGroupId: "mountain-fracture", kind: "point", a: { bodyId: "mountain" }, b: { bodyId: "rock-chunk" }, breakImpulse: .01 }],
        cues: [{ id: "mountain-break", kind: "launch", frame: 0, attacker: { ragdollId: "goku-body", boneId: "fist" }, target: { bodyId: "rock-chunk" }, direction: [1, 0, 0], speedMetersPerSecond: 12, distanceMeters: 2 }],
      },
      bindings: [{ reference: { bodyId: "rock-chunk" }, entityId: "cell", positionOffset: [0, 0, 0], rotationOffset: [0, 0, 0, 1] }],
      fragments: [{ id: "mountain-fragment-0", reference: { bodyId: "rock-chunk" }, breakGroupId: "mountain-fracture", meshId: "fighter", materialId: "fighter-skin", scale: [.2, .3, .2], positionOffset: [0, 0, 0], rotationOffset: [0, 0, 0, 1] }],
    };
    sequence.breakResponses = [{ id: "fracture-presentation", breakGroupId: "mountain-fracture", entityId: "cell", variantId: "fractured", visibility: "keep", audioAssetId: "break-sfx", gain: .8, pan: .1 }];
    sequence.effectCues = [{ id: "fracture-debris", kind: "debris", startFrame: 0, durationFrames: 12, breakGroupId: "mountain-fracture", space: "world", meshId: "fighter", materialId: "fighter-skin", count: 4, seed: 91, radius: .2, speed: 3, size: .08 }];
    const compiled = compilePhysicalPerformance3D({ performance: sequence.physicalPerformance.simulation }), breakFrame = compiled.breaks[0]!.frame;
    const options = { declaration: scene, timeline: sequence, viewport: { width: 640, height: 360 }, physicalPerformance: compiled };
    const before = sample3DFrame({ ...options, clock: { kind: "video" as const, frameIndex: Math.max(0, breakFrame - 1), fps: 30 } });
    const exact = sample3DFrame({ ...options, clock: { kind: "video" as const, frameIndex: breakFrame, fps: 30 } });
    const after = sample3DFrame({ ...options, clock: { kind: "video" as const, frameIndex: breakFrame + 1, fps: 30 } });
    expect(before.entities.find((entity) => entity.id === "cell")?.variantId).toBeUndefined(); expect(before.effects).toEqual([]); expect(before.audioEvents).toEqual([]);
    expect(exact.physicalBreaks[0]?.groupId).toBe("mountain-fracture");
    expect(exact.entities.find((entity) => entity.id === "cell")?.variantId).toBe("fractured");
    expect(exact.effects.find((effect) => effect.id.startsWith("physical-fragments:"))?.particles[0]).toMatchObject({ id: "mountain-fragment-0", position: exact.entities.find((entity) => entity.id === "cell")!.position, scale: [.2, .3, .2] });
    expect(exact.effects.find((effect) => effect.id === "fracture-debris")?.particles[0]?.position).toEqual(exact.physicalBreaks[0]!.point);
    expect(exact.audioEvents).toEqual([{ id: "fracture-presentation", assetId: "break-sfx", frame: breakFrame, subframe: compiled.breaks[0]!.subframe, point: compiled.breaks[0]!.point, gain: .8, pan: .1 }]);
    expect(exact).toEqual(sample3DFrame({ ...options, clock: { kind: "simulation", tick: breakFrame * 2, ticksPerSecond: 60 } }));
    expect(after.entities.find((entity) => entity.id === "cell")?.variantId).toBe("fractured"); expect(after.audioEvents).toEqual([]);
  });

  test("samples trimmed skeletal performances and deterministic cross-fades", () => {
    const value = timeline();
    value.performanceTracks = [{
      entityId: "goku", rigId: "fighter-rig", segments: [
        { id: "idle", startFrame: 0, durationFrames: 30, clipId: "idle", sourceStartSeconds: 0.25, speed: 1, loop: true, blendFrames: 0 },
        { id: "strike", startFrame: 30, durationFrames: 30, clipId: "strike", sourceStartSeconds: 0.1, speed: 1.5, loop: false, blendFrames: 6 },
      ],
    }];
    const sampled = Array.from({ length: 7 }, (_, offset) => {
      const frameIndex = 30 + offset;
      const video = sample3DFrame({ declaration: declaration(), timeline: value, clock: { kind: "video", frameIndex, fps: 30 }, viewport: { width: 1920, height: 1080 } });
      const simulation = sample3DFrame({ declaration: declaration(), timeline: value, clock: { kind: "simulation", tick: frameIndex * 2, ticksPerSecond: 60 }, viewport: { width: 1920, height: 1080 } });
      expect(simulation.performances).toEqual(video.performances);
      return video.performances[0]!;
    });
    expect(sampled[0]!.blend?.weight).toBe(0);
    expect(sampled[1]!.blend?.weight).toBeCloseTo(0.05792);
    expect(sampled[3]).toMatchObject({ entityId: "goku", rigId: "fighter-rig", clipId: "strike", timeSeconds: 0.25, sourceStartSeconds: 0.1, loop: false, blend: { clipId: "idle", timeSeconds: 1.35, loop: true } });
    expect(sampled[3]!.blend!.weight).toBeCloseTo(0.68256);
    expect(sampled[5]!.blend?.weight).toBe(1);
    expect(sampled[6]!.blend).toBeUndefined();
  });

  test("carries adjacent root motion deterministically and rejects competing motion authority", () => {
    const source = declaration(), value = timeline();
    source.rigs = [{ id: "fighter-rig", meshId: "fighter", rootBoneId: "hips", bones: [{ id: "hips", node: 0 }], clips: [{ id: "travel", animation: 0, durationSeconds: 1 }] }];
    source.scenes[0]!.entities[0]!.skeleton = { rigId: "fighter-rig", skinIndex: 0, meshNode: 0 };
    const rootMotion = { mode: "extract-xz" as const, loopBoundary: "accumulate" as const, segmentBoundary: "accumulate" as const, rootBoneId: "hips" };
    value.performanceTracks = [{ entityId: "goku", rigId: "fighter-rig", segments: [
      { id: "dash-a", startFrame: 0, durationFrames: 30, clipId: "travel", sourceStartSeconds: .1, speed: 1, loop: true, blendFrames: 0, transition: "cut", rootMotion },
      { id: "dash-b", startFrame: 30, durationFrames: 30, clipId: "travel", sourceStartSeconds: .25, speed: 1.5, loop: true, blendFrames: 6, transition: "blend", rootMotion },
    ] }];
    const shared = { declaration: source, timeline: value, viewport: { width: 1920, height: 1080 } };
    const video = sample3DFrame({ ...shared, clock: { kind: "video" as const, frameIndex: 33, fps: 30 } });
    const simulation = sample3DFrame({ ...shared, clock: { kind: "simulation" as const, tick: 66, ticksPerSecond: 60 } });
    expect(simulation.performances).toEqual(video.performances);
    expect(video.performances[0]!.rootMotion?.carry).toEqual([{ clipId: "travel", sourceStartSeconds: .1, timeSeconds: 1.1, loop: true, rootMotion }]);
    expect(video.performances[0]!.blend?.rootMotion?.carry).toBeUndefined();
    value.motionTracks = [{ entityId: "goku", segments: [{ id: "duplicate-dash", startFrame: 30, durationFrames: 10, origin: [0, 0, 0], velocity: [2, 0, 0], acceleration: [0, 0, 0], rotationEuler: [0, 0, 0], angularVelocity: [0, 0, 0], state: "grounded", groundY: 0 }] }];
    expect(audit3DFrameCapabilities({ declaration: source, timeline: value, boundary: "export" })).toContainEqual(expect.objectContaining({ code: "root-motion-transform-double-application", pointer: "/extensions/hyperfocus3DVideo/performanceTracks/0/segments/1/rootMotion/mode" }));
  });

  test("requires one mapped ragdoll and continuous boundaries for physical root-motion authority", () => {
    const source = declaration(), value = timeline();
    source.rigs = [{ id: "fighter-rig", meshId: "fighter", rootBoneId: "hips", bones: [{ id: "hips", node: 0 }], clips: [{ id: "travel", animation: 0, durationSeconds: 1 }] }];
    source.scenes[0]!.entities[0]!.skeleton = { rigId: "fighter-rig", skinIndex: 0, meshNode: 0 };
    const rootMotion: Hyperfocus3DRootMotionPolicy = { mode: "extract-xz", authority: "physical", loopBoundary: "accumulate", segmentBoundary: "accumulate", rootBoneId: "hips" };
    value.performanceTracks = [{ entityId: "goku", rigId: "fighter-rig", segments: [{ id: "dash", startFrame: 0, durationFrames: 60, clipId: "travel", sourceStartSeconds: 0, speed: 1, loop: true, blendFrames: 0, transition: "cut", rootMotion }] }];
    const audit = () => audit3DFrameCapabilities({ declaration: source, timeline: value, boundary: "export" });
    expect(audit()).toContainEqual(expect.objectContaining({ code: "physical-root-motion-missing-ragdoll", pointer: "/extensions/hyperfocus3DVideo/performanceTracks/0/segments/0/rootMotion/authority" }));
    value.physicalPerformance = {
      simulation: { frameRate: 30, simulationHz: 120, durationFrames: 60, world: { gravityY: 0 }, ragdolls: [{ id: "goku-body", rootBoneId: "hips", bodies: [{ boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, mass: 2, collisionMask: 0 } }], joints: [], initialPose: { rotations: [] } }], cues: [] },
      bindings: [{ reference: { ragdollId: "goku-body", boneId: "hips" }, entityId: "goku", positionOffset: [0, 0, 0], rotationOffset: [0, 0, 0, 1] }],
    };
    expect(audit().some((diagnostic) => diagnostic.code === "physical-root-motion-double-application" || diagnostic.code === "physical-root-motion-missing-ragdoll")).toBe(false);
    rootMotion.loopBoundary = "reset";
    expect(audit()).toContainEqual(expect.objectContaining({ code: "physical-root-motion-discontinuous", pointer: "/extensions/hyperfocus3DVideo/performanceTracks/0/segments/0/rootMotion/loopBoundary" }));
  });

  test("preflights implicit pose snaps while preserving an explicit hard cut", () => {
    const source = declaration(), value = timeline();
    source.rigs = [{ id: "fighter-rig", meshId: "fighter", rootBoneId: "hips", bones: [{ id: "hips", node: 0 }, { id: "shoulder", node: 1, parentId: "hips" }, { id: "elbow", node: 2, parentId: "shoulder" }, { id: "hand", node: 3, parentId: "elbow" }], clips: [{ id: "idle", animation: 0, durationSeconds: 1 }, { id: "strike", animation: 1, durationSeconds: 1 }] }];
    source.scenes[0]!.entities[0]!.skeleton = { rigId: "fighter-rig", skinIndex: 0, meshNode: 0 };
    value.performanceTracks = [{ entityId: "goku", rigId: "fighter-rig", segments: [
      { id: "idle", startFrame: 0, durationFrames: 30, clipId: "idle", sourceStartSeconds: 0, speed: 1, loop: true, blendFrames: 0 },
      { id: "strike", startFrame: 30, durationFrames: 30, clipId: "strike", sourceStartSeconds: 0, speed: 1, loop: false, blendFrames: 0 },
    ] }];
    const audit = () => audit3DFrameCapabilities({ declaration: source, timeline: value, boundary: "export" });
    expect(audit()).toContainEqual(expect.objectContaining({ code: "performance-implicit-pose-snap", pointer: "/extensions/hyperfocus3DVideo/performanceTracks/0/segments/1/blendFrames" }));
    value.performanceTracks[0]!.segments[1]!.transition = "cut";
    expect(audit().some((diagnostic) => diagnostic.code === "performance-implicit-pose-snap")).toBe(false);
    value.performanceTracks[0]!.segments[1]!.transition = "blend"; value.performanceTracks[0]!.segments[1]!.blendFrames = 1;
    expect(audit()).toContainEqual(expect.objectContaining({ code: "performance-implicit-pose-snap", message: expect.stringContaining("5 frames") }));
    value.poseCorrections = [{ id: "guard", entityId: "goku", boneId: "hand", startFrame: 10, durationFrames: 20, stage: "post-animation", weight: 1, translation: [0, 0, 0], rotationEuler: [0, 0, .4], blendInFrames: 0, blendOutFrames: 0 }];
    expect(audit()).toContainEqual(expect.objectContaining({ code: "pose-transition-implicit-snap", pointer: "/extensions/hyperfocus3DVideo/poseCorrections/0/blendInFrames" }));
    value.poseCorrections[0]!.transition = "cut";
    expect(audit().some((diagnostic) => diagnostic.pointer.startsWith("/extensions/hyperfocus3DVideo/poseCorrections"))).toBe(false);
    value.ikCorrections = [{ id: "reach", entityId: "goku", startFrame: 10, durationFrames: 21, rootBoneId: "shoulder", middleBoneId: "elbow", endBoneId: "hand", target: [1, 1, 0], contactFrame: 20, pole: [0, 0, 1], weight: 1, maxStretch: 1.05, blendInFrames: 0, blendOutFrames: 0 }];
    expect(audit()).toContainEqual(expect.objectContaining({ code: "pose-transition-implicit-snap", pointer: "/extensions/hyperfocus3DVideo/ikCorrections/0/blendInFrames" }));
    value.ikCorrections[0]!.transition = "cut";
    expect(audit().some((diagnostic) => diagnostic.pointer.startsWith("/extensions/hyperfocus3DVideo/ikCorrections"))).toBe(false);
    value.poseCorrections = [{ id: "opening-hold", entityId: "goku", boneId: "hand", startFrame: 0, durationFrames: 60, stage: "post-animation", weight: 1, translation: [0, 0, 0], rotationEuler: [0, 0, .4], blendInFrames: 0, blendOutFrames: 0 }];
    value.ikCorrections = [{ id: "final-hold", entityId: "goku", startFrame: 10, durationFrames: 50, rootBoneId: "shoulder", middleBoneId: "elbow", endBoneId: "hand", target: [1, 1, 0], contactFrame: 20, pole: [0, 0, 1], weight: 1, maxStretch: 1.05, blendInFrames: 5, blendOutFrames: 0 }];
    expect(audit().some((diagnostic) => diagnostic.code === "pose-transition-implicit-snap")).toBe(false);
  });

  test("blocks entities on exact world-space keys with hold and smooth interpolation", () => {
    const scene = declaration(), sequence = timeline(); sequence.entityTracks = [{ entityId: "goku", keyframes: [
      { id: "ready", frame: 0, position: [0, 0, 0], rotationEuler: [0, 0, 0], scale: [1, 1, 1], visible: true, interpolation: "smooth" },
      { id: "contact", frame: 10, position: [10, 2, -1], rotationEuler: [0, Math.PI, 0], scale: [1.2, 1.2, 1.2], visible: true, interpolation: "hold" },
      { id: "vanish", frame: 20, position: [20, 0, 0], rotationEuler: [0, Math.PI, 0], scale: [1, 1, 1], visible: false, interpolation: "hold" },
    ] }];
    const middle = sample3DFrame({ declaration: scene, timeline: sequence, clock: { kind: "video", frameIndex: 5, fps: 30 }, viewport: { width: 100, height: 100 } }).entities.find((entity) => entity.id === "goku")!;
    expect(middle.position).toEqual([5, 1, -0.5]); expect(middle.scale[0]).toBeCloseTo(1.1);
    const held = sample3DFrame({ declaration: scene, timeline: sequence, clock: { kind: "video", frameIndex: 15, fps: 30 }, viewport: { width: 100, height: 100 } }).entities.find((entity) => entity.id === "goku")!;
    expect(held.position).toEqual([10, 2, -1]); expect(held.visible).toBe(true);
    const hidden = sample3DFrame({ declaration: scene, timeline: sequence, clock: { kind: "video", frameIndex: 20, fps: 30 }, viewport: { width: 100, height: 100 } }).entities.find((entity) => entity.id === "goku")!; expect(hidden.visible).toBe(false);
  });

  test("derives every emitter kind from absolute frame, stable IDs, and seeds", () => {
    const sequence = timeline(), kinds = ["aura", "trail", "sparks", "smoke", "debris", "shockwave"] as const;
    sequence.effectCues = kinds.map((kind, index) => ({ id: `fx-${kind}`, kind, startFrame: 2, durationFrames: 48, targetEntityId: "goku", meshId: "fighter", materialId: "fighter-skin", count: 6, seed: 900 + index, radius: 1 + index * 0.1, speed: 2 + index, size: 0.1 }));
    const options = { declaration: declaration(), timeline: sequence, viewport: { width: 640, height: 360 } };
    const direct = sample3DFrame({ ...options, clock: { kind: "video" as const, frameIndex: 27, fps: 30 } });
    let sequential = direct;
    for (let frameIndex = 0; frameIndex <= 27; frameIndex += 1) sequential = sample3DFrame({ ...options, clock: { kind: "video", frameIndex, fps: 30 } });
    expect(direct.effects).toEqual(sequential.effects);
    expect(direct.effects.map((effect) => effect.kind)).toEqual([...kinds]);
    expect(direct.effects.every((effect) => effect.particles.every((particle) => particle.id.startsWith(`${effect.id}:`)))).toBe(true);
    expect(sample3DFrame({ ...options, clock: { kind: "simulation", tick: 54, ticksPerSecond: 60 } }).effects).toEqual(direct.effects);
  });

  test("aims deterministic particle velocity through an authored emission cone", () => {
    const sequence = timeline(); sequence.effectCues = [{ id: "foot-spray", kind: "debris", startFrame: 0, durationFrames: 30, targetEntityId: "goku", space: "world", meshId: "fighter", materialId: "fighter-skin", count: 12, seed: 77, radius: .2, speed: 6, size: .08, emissionMode: "burst", emissionDirection: [1, 0, 0], emissionSpreadDegrees: 0 }];
    const options = { declaration: declaration(), timeline: sequence, viewport: { width: 640, height: 360 } }, direct = sample3DFrame({ ...options, clock: { kind: "video" as const, frameIndex: 20, fps: 30 } });
    let sequential = direct; for (let frameIndex = 0; frameIndex <= 20; frameIndex += 1) sequential = sample3DFrame({ ...options, clock: { kind: "video", frameIndex, fps: 30 } });
    expect(direct.effects).toEqual(sequential.effects); expect(direct.effects[0]!.particles).toHaveLength(12); expect(Math.max(...direct.effects[0]!.particles.map((particle) => particle.position[0]))).toBeGreaterThan(1); expect(direct.effects[0]!.particles.every((particle) => Math.abs(particle.position[2]) < 1e-9)).toBe(true);
  });

  test("separates full-count bursts from continuous emission without playback history", () => {
    const sequence = timeline(); sequence.effectCues = [
      { id: "burst", kind: "debris", startFrame: 0, durationFrames: 12, targetEntityId: "goku", meshId: "fighter", materialId: "fighter-skin", count: 12, seed: 4, radius: .2, speed: 3, size: .08, emissionMode: "burst" },
      { id: "rate", kind: "debris", startFrame: 0, durationFrames: 12, targetEntityId: "goku", meshId: "fighter", materialId: "fighter-skin", count: 12, seed: 4, radius: .2, speed: 3, size: .08, emissionMode: "continuous" },
    ];
    const options = { declaration: declaration(), timeline: sequence, viewport: { width: 640, height: 360 } }, first = sample3DFrame({ ...options, clock: { kind: "video" as const, frameIndex: 0, fps: 30 } }), direct = sample3DFrame({ ...options, clock: { kind: "video" as const, frameIndex: 5, fps: 30 } });
    let sequential = direct; for (let frameIndex = 0; frameIndex <= 5; frameIndex += 1) sequential = sample3DFrame({ ...options, clock: { kind: "video", frameIndex, fps: 30 } });
    expect(first.effects[0]!.particles).toHaveLength(12); expect(first.effects[1]!.particles).toHaveLength(1); expect(direct.effects[0]!.particles).toHaveLength(12); expect(direct.effects[1]!.particles.length).toBeGreaterThan(1); expect(direct.effects).toEqual(sequential.effects);
  });

  test("expands shockwaves as visible seeded 3D radial bursts instead of a flat ground-plane strip", () => {
    const sequence = timeline(); sequence.effectCues = [{ id: "radial-hit", kind: "shockwave", startFrame: 2, durationFrames: 12, targetEntityId: "goku", presentation: "billboard", materialId: "fighter-skin", count: 64, seed: 71, radius: .2, speed: 9, size: .12 }];
    const options = { declaration: declaration(), timeline: sequence, viewport: { width: 640, height: 360 } }, early = sample3DFrame({ ...options, clock: { kind: "video" as const, frameIndex: 3, fps: 30 } }), later = sample3DFrame({ ...options, clock: { kind: "video" as const, frameIndex: 5, fps: 30 } });
    const target = later.entities.find((entity) => entity.id === "goku")!.position, directions = later.effects[0]!.particles.map((particle) => tuple3((particle.position[0]!) - target[0]!, (particle.position[1]!) - target[1]!, (particle.position[2]!) - target[2]!));
    expect(Math.min(...directions.map((direction) => direction[1]))).toBeLessThan(-.08); expect(Math.max(...directions.map((direction) => direction[1]))).toBeGreaterThan(.08);
    const meanRadius = (frame: typeof later) => frame.effects[0]!.particles.reduce((sum, particle) => sum + Math.hypot(...tuple3((particle.position[0]!) - frame.entities.find((entity) => entity.id === "goku")!.position[0]!, (particle.position[1]!) - frame.entities.find((entity) => entity.id === "goku")!.position[1]!, (particle.position[2]!) - frame.entities.find((entity) => entity.id === "goku")!.position[2]!)), 0) / frame.effects[0]!.particles.length;
    expect(meanRadius(later)).toBeGreaterThan(meanRadius(early)); expect(sample3DFrame({ ...options, clock: { kind: "video", frameIndex: 5, fps: 30 } }).effects).toEqual(later.effects);
  });

  test("leaves world-space trail emissions behind a moving target with stable variation", () => {
    const sequence = timeline(); sequence.entityTracks = [{ entityId: "goku", keyframes: [
      { id: "start", frame: 0, position: [0, 0, 0], rotationEuler: [0, 0, 0], scale: [1, 1, 1], visible: true, interpolation: "linear" },
      { id: "end", frame: 30, position: [30, 0, 0], rotationEuler: [0, 0, 0], scale: [1, 1, 1], visible: true, interpolation: "linear" },
    ] }]; sequence.effectCues = [{ id: "skid", kind: "trail", startFrame: 0, durationFrames: 30, targetEntityId: "goku", space: "world", meshId: "fighter", materialId: "fighter-skin", count: 6, seed: 9, radius: 0.4, speed: 4, size: 0.2 }];
    const sampled = sample3DFrame({ declaration: declaration(), timeline: sequence, clock: { kind: "video", frameIndex: 20, fps: 30 }, viewport: { width: 640, height: 360 } });
    const particles = sampled.effects[0]!.particles;
    expect(new Set(particles.map((particle) => particle.position[0].toFixed(3))).size).toBeGreaterThan(2);
    expect(Math.min(...particles.map((particle) => particle.position[0]))).toBeLessThan(10);
    expect(particles.filter((particle) => particle.position[0] < sampled.entities.find((entity) => entity.id === "goku")!.position[0] - 1).length).toBeGreaterThan(2);
  });

  test("derives contact and every linked presentation cue from physical trajectories", () => {
    const sequence = timeline(); sequence.motionTracks = [
      { entityId: "goku", segments: [{ id: "strike", startFrame: 0, durationFrames: 30, origin: [-3, 1, 0], velocity: [6, 0, 0], acceleration: [0, 0, 0], rotationEuler: [0, 0, 0], angularVelocity: [0, 2, 0], state: "airborne", groundY: 0 }] },
      { entityId: "cell", segments: [{ id: "brace", startFrame: 0, durationFrames: 30, origin: [1, 0, 0], velocity: [0, 0, 0], acceleration: [0, 0, 0], rotationEuler: [0, Math.PI, 0], angularVelocity: [0, 0, 0], state: "grounded", groundY: 0 }] },
    ]; sequence.contacts = [{ id: "fist-contact", attackerEntityId: "goku", targetEntityId: "cell", searchStartFrame: 0, searchDurationFrames: 30, attackerOffset: [0.8, 0, 0], targetOffset: [0, 1, 0], attackerRadius: 0.2, targetRadius: 0.2, cameraShake: 0.2, cameraShakeFrames: 6 }];
    sequence.effectCues = [{ id: "hit-sparks", kind: "sparks", startFrame: 14, durationFrames: 6, contactId: "fist-contact", meshId: "fighter", materialId: "fighter-skin", count: 3, seed: 2, radius: 0.1, speed: 2, size: 0.1 }];
    sequence.impactFrames = [{ id: "hit-frame", preset: "red-contact-burst", startFrame: 14, contactId: "fist-contact", durationFrames: 1, intensity: 1, seed: 2, center: [0.5, 0.5], freezeSource: false }];
    const frame = sample3DFrame({ declaration: declaration(), timeline: sequence, clock: { kind: "video", frameIndex: 15, fps: 30 }, viewport: { width: 640, height: 360 } });
    expect(frame.contacts).toEqual([expect.objectContaining({ id: "fist-contact", frame: 15 })]); expect(frame.contacts[0]!.distance).toBeCloseTo(0.2);
    expect(frame.effects.map((effect) => effect.id)).toEqual(["hit-sparks"]); expect(frame.effects[0]!.particles[0]!.position).toEqual(frame.contacts[0]!.point); expect(frame.renderGraph.impactFrame?.id).toBe("hit-frame");
    const before = sample3DFrame({ declaration: declaration(), timeline: sequence, clock: { kind: "video", frameIndex: 14, fps: 30 }, viewport: { width: 640, height: 360 } });
    expect(before.effects).toEqual([]); expect(before.renderGraph.impactFrame).toBeUndefined();
    expect(frame.camera.position).not.toEqual(before.camera.position);
    expect(frame.entities.find((entity) => entity.id === "cell")!.position[1]).toBe(0);
  });

  test("preflights variants, bones, sockets, and emitters with project pointers and alternatives", () => {
    const scene = declaration(), sequence = timeline();
    scene.rigs = [{ id: "fighter-rig", meshId: "fighter", clips: [{ id: "idle", animation: 0, durationSeconds: 1 }], bones: [{ id: "hip", node: 0 }], rootBoneId: "hip" }];
    scene.scenes[0]!.entities[0]!.skeleton = { rigId: "fighter-rig", skinIndex: 0, meshNode: 0 };
    sequence.entityTracks = [{ entityId: "goku", keyframes: [{ id: "swap", frame: 3, position: [0, 0, 0], rotationEuler: [0, 0, 0], scale: [1, 1, 1], visible: true, variantId: "missing-form", interpolation: "hold" }] }];
    sequence.poseCorrections = [{ id: "hand-fix", entityId: "goku", boneId: "missing-hand", startFrame: 0, durationFrames: 10, stage: "post-animation", weight: 1, translation: [0, 0, 0], rotationEuler: [0, 0, 0] }];
    sequence.socketAttachments = [{ id: "prop-socket", entityId: "cell", parentEntityId: "goku", boneId: "missing-hand", startFrame: 0, durationFrames: 10, position: [0, 0, 0], rotationEuler: [0, 0, 0], scale: [1, 1, 1] }];
    sequence.contactResponses = [{ id: "bad-response", contactId: "missing-contact", offsetFrames: 0, cameraShake: .1, cameraShakeFrames: 4, audioAssetId: "missing-sfx", gain: 1, pan: 0 }];
    sequence.effectCues = [{ id: "sparks", kind: "sparks", startFrame: 0, durationFrames: 10, contactId: "missing-contact", meshId: "missing-mesh", materialId: "missing-material", count: 2, seed: 1, radius: 1, speed: 1, size: 0.1 }];
    sequence.impactFrames = [{ id: "bad-impact", preset: "red-contact-burst", startFrame: 12, durationFrames: 1, intensity: 1, seed: 1, center: [.5, .5], freezeSource: true, contactId: "missing-contact" }];
    const diagnostics = audit3DFrameCapabilities({ declaration: scene, timeline: sequence, boundary: "export" });
    for (const fragment of ["/variantId", "/boneId", "/meshId", "/materialId"]) expect(diagnostics.some((item) => item.pointer.includes(fragment) && item.alternative)).toBe(true);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "contact-response-reference", pointer: "/extensions/hyperfocus3DVideo/contactResponses/0/contactId" }),
      expect.objectContaining({ code: "contact-response-audio", pointer: "/extensions/hyperfocus3DVideo/contactResponses/0/audioAssetId" }),
      expect.objectContaining({ code: "effect-contact-reference", pointer: "/extensions/hyperfocus3DVideo/effectCues/0/contactId" }),
      expect.objectContaining({ code: "impact-contact-reference", pointer: "/extensions/hyperfocus3DVideo/impactFrames/0/contactId" }),
    ]));
  });

  test("preflights an IK correction whose stable bones do not form an ordered chain", () => {
    const scene = declaration(), sequence = timeline();
    scene.rigs = [{ id: "fighter-rig", meshId: "fighter", clips: [{ id: "idle", animation: 0, durationSeconds: 1 }], bones: [{ id: "root", node: 0 }, { id: "middle", node: 1, parentId: "root" }, { id: "sibling", node: 2, parentId: "root" }], rootBoneId: "root" }];
    scene.scenes[0]!.entities[0]!.skeleton = { rigId: "fighter-rig", skinIndex: 0, meshNode: 0 };
    sequence.ikCorrections = [{ id: "bad-chain", entityId: "goku", rootBoneId: "root", middleBoneId: "middle", endBoneId: "sibling", startFrame: 0, durationFrames: 10, target: [1, 2, 0], pole: [0, 0, 1], weight: 1, maxStretch: 1 }];
    expect(audit3DFrameCapabilities({ declaration: scene, timeline: sequence, boundary: "export" })).toContainEqual(expect.objectContaining({
      code: "ik-chain-hierarchy",
      pointer: "/extensions/hyperfocus3DVideo/ikCorrections/0",
      alternative: "Choose three stable bones where middle descends from root and end descends from middle.",
    }));
  });

  test("preflights posture-aware recovery clips against the canonical rig", () => {
    const scene = declaration(), sequence = timeline();
    scene.rigs = [{ id: "fighter-rig", meshId: "fighter", clips: [{ id: "idle", animation: 0, durationSeconds: 1 }, { id: "rise-back", animation: 1, durationSeconds: 1 }], bones: [{ id: "chest", node: 0 }], rootBoneId: "chest" }];
    scene.scenes[0]!.entities[0]!.skeleton = { rigId: "fighter-rig", skinIndex: 0, meshNode: 0 };
    sequence.physicalPerformance = { simulation: { frameRate: 30, simulationHz: 120, durationFrames: 60, ragdolls: [{ id: "fighter-body", rootBoneId: "chest", bodies: [{ boneId: "chest", body: { shape: { kind: "box", halfX: .2, halfY: .4, halfZ: .15 }, mass: 5 } }], joints: [], initialPose: { rotations: [] } }], cues: [{ id: "rise", kind: "recovery", frame: 10, ragdollId: "fighter-body", getUp: { postureBoneId: "chest", clips: { upright: "idle", "face-up": "rise-back", "face-down": "missing-front", "left-side": "rise-back", "right-side": "rise-back" }, environment: { clips: { crouched: "missing-crouch" } } }, target: { rootPosition: [0, 0, 0], rootRotation: [0, 0, 0, 1], durationSeconds: .5 } }], outputs: [{ ragdollId: "fighter-body", boneId: "chest" }] }, bindings: [{ entityId: "goku", reference: { ragdollId: "fighter-body", boneId: "chest" }, boneId: "chest", positionOffset: [0, 0, 0], rotationOffset: [0, 0, 0, 1] }] };
    expect(audit3DFrameCapabilities({ declaration: scene, timeline: sequence, boundary: "export" })).toContainEqual(expect.objectContaining({ code: "physical-get-up-clip", pointer: "/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/0/getUp/clips/face-down", alternative: "Choose one of: idle, rise-back." }));
    expect(audit3DFrameCapabilities({ declaration: scene, timeline: sequence, boundary: "export" })).toContainEqual(expect.objectContaining({ code: "physical-get-up-clip", pointer: "/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/0/getUp/environment/clips/crouched", alternative: "Choose one of: idle, rise-back." }));
  });

  test("preflights incomplete velocity-matched IK with exact portable pointers", () => {
    const scene = declaration(), sequence = timeline();
    scene.rigs = [{ id: "fighter-rig", meshId: "fighter", clips: [{ id: "idle", animation: 0, durationSeconds: 1 }], bones: [{ id: "root", node: 0 }, { id: "middle", node: 1, parentId: "root" }, { id: "hand", node: 2, parentId: "middle" }], rootBoneId: "root" }];
    scene.scenes[0]!.entities[0]!.skeleton = { rigId: "fighter-rig", skinIndex: 0, meshNode: 0 };
    sequence.ikCorrections = [{ id: "bad-momentum", entityId: "goku", rootBoneId: "root", middleBoneId: "middle", endBoneId: "hand", startFrame: 0, durationFrames: 10, targetFrom: [0, 1, 0], target: [1, 1, 0], targetTo: [1.2, 1, 0], strikeStartFrame: 5, contactFrame: 5, contactVelocity: [0, 0, 0], pole: [0, 0, 1], weight: 1, maxStretch: 1, interpolation: "momentum" }];
    expect(audit3DFrameCapabilities({ declaration: scene, timeline: sequence, boundary: "export" })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "ik-momentum-strike-start", pointer: "/extensions/hyperfocus3DVideo/ikCorrections/0/strikeStartFrame" }),
      expect.objectContaining({ code: "ik-momentum-contact-velocity", pointer: "/extensions/hyperfocus3DVideo/ikCorrections/0/contactVelocity" }),
    ]));
  });

  test("preflights custom impact art and backend support before export", () => {
    const sequence = timeline(); sequence.impactFrames = [{ id: "drawing", preset: "custom-still", startFrame: 8, durationFrames: 1, intensity: 1, seed: 1, center: [0.5, 0.5], freezeSource: true }];
    const diagnostics = audit3DFrameCapabilities({ declaration: declaration(), timeline: sequence, boundary: "export", supportedPasses: new Set(["shadows", "fog", "bloom", "grain", "vignette"]) });
    expect(diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "impact-texture-required", pointer: "/extensions/hyperfocus3DVideo/impactFrames/0/textureId" }), expect.objectContaining({ code: "unsupported-impact-frame-pass", feature: "impact-frame pass" })]));
  });
});
