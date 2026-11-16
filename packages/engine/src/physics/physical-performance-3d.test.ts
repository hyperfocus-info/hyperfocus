import { describe, expect, test } from "bun:test";
import {
  PHYSICAL_BODY_STATE_STRIDE_3D,
  compilePhysicalPerformance3D,
  createBreakableAssembly3D,
  createPhysicalLocomotionProfiles3D,
  createPhysicalPerformanceCompiler3D,
  createPhysicalPerformanceRuntime3D,
  resolvePhysicalLaunchTarget3D,
  samplePhysicalLocomotionSpeed3D,
  type PhysicalPerformanceCue3D,
  type PhysicalPerformance3D,
} from "./physical-performance-3d.ts";

test("adjacent physical locomotion exposes one continuous speed envelope for pose synchronization", () => {
  const cues: Extract<PhysicalPerformanceCue3D, { kind: "locomotion" }>[] = [
    { id: "walk", kind: "locomotion", frame: 0, durationFrames: 60, ragdollId: "runner", direction: [1, 0, 0], distanceMeters: 1, peakSpeedMetersPerSecond: 1.5 },
    { id: "sprint", kind: "locomotion", frame: 60, durationFrames: 60, ragdollId: "runner", direction: [1, 0, 0], distanceMeters: 4, peakSpeedMetersPerSecond: 5 },
  ];
  const profiles = createPhysicalLocomotionProfiles3D(cues, 30);
  expect(samplePhysicalLocomotionSpeed3D(profiles[0]!, 1)).toBeCloseTo(.5, 8);
  expect(samplePhysicalLocomotionSpeed3D(profiles[1]!, 0)).toBeCloseTo(.5, 8);
  expect(samplePhysicalLocomotionSpeed3D(profiles[1]!, .5)).toBeGreaterThan(.5);
  const epsilon = 1e-4;
  const leftBoundarySlope = (samplePhysicalLocomotionSpeed3D(profiles[0]!, 1) - samplePhysicalLocomotionSpeed3D(profiles[0]!, 1 - epsilon)) / epsilon;
  const rightBoundarySlope = (samplePhysicalLocomotionSpeed3D(profiles[1]!, epsilon) - samplePhysicalLocomotionSpeed3D(profiles[1]!, 0)) / epsilon;
  expect(Math.abs(leftBoundarySlope)).toBeLessThan(.02);
  expect(Math.abs(rightBoundarySlope)).toBeLessThan(.02);

  const samples = 30_000;
  for (const profile of profiles) {
    let integral = 0;
    let maximum = 0;
    for (let index = 0; index < samples; index += 1) {
      const speed = samplePhysicalLocomotionSpeed3D(profile, (index + .5) / samples);
      integral += speed / samples;
      maximum = Math.max(maximum, speed);
    }
    expect(integral).toBeCloseTo(profile.averageSpeed, 5);
    expect(maximum).toBeLessThanOrEqual(profile.cue.peakSpeedMetersPerSecond + 1e-6);
  }
});

function performance(targetX = 1): PhysicalPerformance3D {
  return {
    frameRate: 30,
    simulationHz: 120,
    durationFrames: 30,
    world: { gravityY: 0, velocityIterations: 4, constraintIterations: 8 },
    ragdolls: [
      {
        id: "primal",
        rootBoneId: "fist",
        bodies: [{ boneId: "fist", body: { shape: { kind: "sphere", radius: 0.2 }, mass: 2, collisionLayer: 1, collisionMask: 2 } }],
        joints: [],
        initialPose: { rotations: [] },
      },
      {
        id: "lumberjack",
        rootBoneId: "chest",
        bodies: [{ boneId: "chest", body: { shape: { kind: "box", halfX: 0.25, halfY: 0.5, halfZ: 0.2 }, x: targetX, mass: 8, collisionLayer: 2, collisionMask: 1 } }],
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
    }],
  };
}

function supportedStance(groundLayerMask = 4): PhysicalPerformance3D {
  return {
    frameRate: 30, simulationHz: 120, durationFrames: 20, world: { gravityY: -9.81, constraintIterations: 12 },
    bodies: [{ id: "ground", type: "static", shape: { kind: "box", halfX: 20, halfY: .1, halfZ: 20 }, y: -.1, collisionLayer: 4 }],
    ragdolls: [{ id: "fighter", rootBoneId: "foot", bodies: [{ boneId: "foot", body: { shape: { kind: "sphere", radius: .15 }, y: .15, mass: 2, collisionLayer: 2, collisionMask: 4 } }], joints: [], initialPose: { rotations: [] } }],
    cues: [{ id: "front-foot-plant", kind: "support", frame: 0, durationFrames: 12, ragdollId: "fighter", boneId: "foot", groundLayerMask, probeDistance: .1, stiffness: 1, damping: 1, maxImpulse: 100, breakImpulse: 1_000, balanceRadiusMeters: .18, balanceStiffness: .55, balanceDamping: .8, maxBalanceImpulse: 6 }],
    outputs: [{ ragdollId: "fighter", boneId: "foot" }],
  };
}

function captureStepPerformance(): PhysicalPerformance3D {
  return {
    frameRate: 30, simulationHz: 120, durationFrames: 24, world: { gravityY: -9.81, constraintIterations: 12 },
    bodies: [{ id: "ground", type: "static", shape: { kind: "box", halfX: 20, halfY: .1, halfZ: 20 }, y: -.1, collisionLayer: 4 }],
    ragdolls: [{ id: "fighter", rootBoneId: "hips", bodies: [
      { boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, y: 1, mass: 8, collisionLayer: 2, collisionMask: 4 } },
      { boneId: "left-foot", body: { shape: { kind: "sphere", radius: .1 }, x: -.25, y: .1, z: .15, mass: 1, collisionLayer: 2, collisionMask: 4 } },
      { boneId: "right-foot", body: { shape: { kind: "sphere", radius: .1 }, x: .25, y: .1, z: -.15, mass: 1, collisionLayer: 2, collisionMask: 4 } },
    ], joints: [], initialPose: { rotations: [] }, locomotion: { supportBoneIds: ["left-foot", "right-foot"], groundLayerMask: 4, probeDistance: .12, minimumNormalY: .7, maximumGroundedVerticalSpeedMetersPerSecond: 1 } }],
    cues: [
      { id: "left-stance", kind: "support", frame: 0, durationFrames: 20, ragdollId: "fighter", boneId: "left-foot", groundLayerMask: 4, probeDistance: .1, maxBalanceImpulse: 0 },
      { id: "right-stance", kind: "support", frame: 0, durationFrames: 1, ragdollId: "fighter", boneId: "right-foot", groundLayerMask: 4, probeDistance: .1, maxBalanceImpulse: 0 },
      { id: "lead-step", kind: "step", frame: 1, durationFrames: 9, holdFrames: 8, ragdollId: "fighter", boneId: "right-foot", direction: [1, 0, 0], speedMetersPerSecond: 3, predictionSeconds: .3, maximumDistance: .8, liftHeight: .18, groundLayerMask: 4, probeHeight: .5, probeDistance: 1, minimumNormalY: .7, stiffness: .9, damping: .95, maximumDriveImpulse: 20, landingTolerance: .08, maximumLandingSpeed: 1.5 },
    ],
    outputs: [{ ragdollId: "fighter", boneId: "right-foot" }],
  };
}

function groundedJumpPerformance(): PhysicalPerformance3D {
  return {
    frameRate: 30, simulationHz: 120, durationFrames: 60, world: { gravityY: -9.81, constraintIterations: 12 },
    bodies: [{ id: "ground", type: "static", shape: { kind: "box", halfX: 20, halfY: .1, halfZ: 20 }, y: -.1, collisionLayer: 4, collisionMask: 2 }],
    ragdolls: [{ id: "fighter", rootBoneId: "hips", bodies: [
      { boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, y: 1, mass: 8, collisionLayer: 2, collisionMask: 4 } },
      { boneId: "left-foot", body: { shape: { kind: "sphere", radius: .1 }, x: -.2, y: .1, mass: 1, collisionLayer: 2, collisionMask: 4 } },
      { boneId: "right-foot", body: { shape: { kind: "sphere", radius: .1 }, x: .2, y: .1, mass: 1, collisionLayer: 2, collisionMask: 4 } },
    ], joints: [], initialPose: { rotations: [] }, locomotion: { supportBoneIds: ["left-foot", "right-foot"], groundLayerMask: 4, probeDistance: .12, minimumNormalY: .7, maximumGroundedVerticalSpeedMetersPerSecond: 1, minimumLandingSpeedMetersPerSecond: 1, fullImpactLandingSpeedMetersPerSecond: 6, landingDurationSeconds: .2, landingMotorYield: .25 } }],
    cues: [{ id: "forward-jump", kind: "jump", frame: 1, ragdollId: "fighter", supportBoneIds: ["left-foot", "right-foot"], direction: [1, 0, 0], horizontalSpeedMetersPerSecond: 3, verticalSpeedMetersPerSecond: 5, groundLayerMask: 4, probeDistance: .12, minimumNormalY: .7, maximumGroundedVerticalSpeedMetersPerSecond: 1 }],
    outputs: [{ ragdollId: "fighter", boneId: "hips" }, { ragdollId: "fighter", boneId: "left-foot" }, { ragdollId: "fighter", boneId: "right-foot" }],
  };
}

function jointDrivePerformance(): PhysicalPerformance3D {
  return {
    frameRate: 30, simulationHz: 120, durationFrames: 24, world: { gravityY: 0, constraintIterations: 8 },
    ragdolls: [{ id: "fighter", rootBoneId: "chest", bodies: [
      { boneId: "chest", body: { shape: { kind: "sphere", radius: .3 }, mass: 8, collisionLayer: 1, collisionMask: 0 } },
      { boneId: "forearm", body: { shape: { kind: "sphere", radius: .15 }, x: .5, mass: 2, collisionLayer: 1, collisionMask: 0 } },
    ], joints: [{ id: "elbow", parentBoneId: "chest", childBoneId: "forearm", poseJointIndex: 0, motorStiffness: 0, maxTorqueImpulse: 0 }], initialPose: { rotations: [0, 0, 0, 1] } }],
    cues: [{ id: "strike-arc", kind: "joint-drive", frame: 2, durationFrames: 15, ragdollId: "fighter", jointId: "elbow", axisParentLocal: [0, 0, 1], angularDistanceDegrees: 90, peakAngularSpeedDegreesPerSecond: 300, maxTorqueImpulse: 4, phase: "contact" }],
    outputs: [{ ragdollId: "fighter", boneId: "chest" }, { ragdollId: "fighter", boneId: "forearm" }],
  };
}

function effectorDrivePerformance(): PhysicalPerformance3D {
  return {
    frameRate: 30, simulationHz: 120, durationFrames: 28, world: { gravityY: 0, constraintIterations: 10 },
    ragdolls: [{ id: "fighter", rootBoneId: "chest", bodies: [
      { boneId: "chest", body: { shape: { kind: "sphere", radius: .3 }, mass: 8, collisionLayer: 1, collisionMask: 0 } },
      { boneId: "forearm", body: { shape: { kind: "sphere", radius: .18 }, x: .55, y: .25, mass: 3, collisionLayer: 1, collisionMask: 0 } },
      { boneId: "hand", body: { shape: { kind: "sphere", radius: .12 }, x: .95, y: .55, mass: 2, collisionLayer: 1, collisionMask: 0 } },
    ], joints: [
      { id: "shoulder", parentBoneId: "chest", childBoneId: "forearm", poseJointIndex: 0, localAnchorParent: [.55, .25, 0], localAnchorChild: [0, 0, 0], motorStiffness: 0, maxTorqueImpulse: 0 },
      { id: "elbow", parentBoneId: "forearm", childBoneId: "hand", poseJointIndex: 1, localAnchorParent: [.4, .3, 0], localAnchorChild: [0, 0, 0], motorStiffness: 0, maxTorqueImpulse: 0 },
    ], initialPose: { rotations: [0, 0, 0, 1, 0, 0, 0, 1] } }],
    cues: [{ id: "hand-path", kind: "effector-drive", frame: 2, durationFrames: 15, ragdollId: "fighter", effectorBoneId: "hand", jointIds: ["shoulder", "elbow"], direction: [0, 1, 0], distanceMeters: .6, peakSpeedMetersPerSecond: 2.5, velocityGain: .08, maxTorqueImpulse: .25, orientation: { axisWorld: [0, 0, 1], angularDistanceDegrees: 90, peakAngularSpeedDegreesPerSecond: 360, trackingGainPerSecond: 8, maxTorqueImpulse: .1 }, phase: "contact" }],
    outputs: [{ ragdollId: "fighter", boneId: "chest" }, { ragdollId: "fighter", boneId: "forearm" }, { ragdollId: "fighter", boneId: "hand" }],
  };
}

function contactAnchoredEffectorPerformance(): PhysicalPerformance3D {
  const source = effectorDrivePerformance(), fighter = source.ragdolls[0]!;
  fighter.bodies[2]!.body.collisionMask = 2;
  source.ragdolls = [fighter, { id: "target", rootBoneId: "chest", bodies: [{ boneId: "chest", body: { shape: { kind: "sphere", radius: .2 }, x: 1.45, y: .55, mass: 8, collisionLayer: 2, collisionMask: 1 } }], joints: [], initialPose: { rotations: [] } }];
  source.cues = [
    { id: "strike-contact-drive", kind: "effector-drive", frame: 2, durationFrames: 5, ragdollId: "fighter", effectorBoneId: "hand", jointIds: ["shoulder", "elbow"], direction: [1, 0, 0], distanceMeters: .3, peakSpeedMetersPerSecond: 3, maxTorqueImpulse: .25, phase: "contact", stopAtContact: { cueId: "strike-contact" } },
    { id: "strike-contact", kind: "launch", frame: 2, attacker: { ragdollId: "fighter", boneId: "hand" }, target: { ragdollId: "target", boneId: "chest" }, targeting: "target-at-launch", targetTravelPaddingMeters: 1, speedMetersPerSecond: 12, actuation: "external", targetModeOnContact: "passive" },
    { id: "strike-follow-through", kind: "effector-drive", frame: 7, durationFrames: 6, ragdollId: "fighter", effectorBoneId: "hand", jointIds: ["shoulder", "elbow"], direction: [0, 1, 0], distanceMeters: .2, peakSpeedMetersPerSecond: 3, maxTorqueImpulse: .25, phase: "follow-through", afterContact: { cueId: "strike-contact", offsetFrames: 0 } },
    { id: "strike-recovery", kind: "effector-drive", frame: 13, durationFrames: 6, ragdollId: "fighter", effectorBoneId: "hand", jointIds: ["shoulder", "elbow"], direction: [0, -1, 0], distanceMeters: .2, peakSpeedMetersPerSecond: 3, maxTorqueImpulse: .25, phase: "recovery", afterContact: { cueId: "strike-contact", offsetFrames: 6 } },
  ];
  source.outputs = [...source.outputs!, { ragdollId: "target", boneId: "chest" }];
  return source;
}

function supportedRecovery(withGround: boolean): PhysicalPerformance3D {
  return {
    frameRate: 30, simulationHz: 120, durationFrames: 24, world: { gravityY: 0 },
    bodies: withGround ? [{ id: "ground", type: "static", shape: { kind: "box", halfX: 4, halfY: .1, halfZ: 4 }, y: -.1, collisionLayer: 4, collisionMask: 2 }] : [],
    ragdolls: [{ id: "fighter", rootBoneId: "foot", bodies: [{ boneId: "foot", body: { shape: { kind: "sphere", radius: .15 }, y: .15, mass: 2, collisionLayer: 2, collisionMask: 4 } }], joints: [], initialPose: { rotations: [] } }],
    cues: [{ id: "stand-clear", kind: "recovery", frame: 0, ragdollId: "fighter", target: { rootPosition: [0, .15, 0], rootRotation: [0, 0, 0, 1], durationSeconds: .2, requireStableSupport: true, supportBoneIds: ["foot"], groundLayerMask: 4, supportProbeDistance: .1 } }],
    outputs: [{ ragdollId: "fighter", boneId: "foot" }],
  };
}

describe("portable physical performance", () => {
  test("activates a ragdoll on its exact authored frame and resumes identically", () => {
    const delayed: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 20, world: { gravityY: -9.81 },
      ragdolls: [{ id: "fighter", activationFrame: 10, rootBoneId: "hips", bodies: [{ boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, y: 1, mass: 8, collisionLayer: 2, collisionMask: 4 } }], joints: [], initialPose: { rotations: [] } }],
      cues: [], outputs: [{ ragdollId: "fighter", boneId: "hips" }],
    };
    const sequential = createPhysicalPerformanceRuntime3D({ performance: delayed });
    for (let expectedFrame = 0; expectedFrame < 10; expectedFrame += 1) { expect(sequential.stepFrame()).toBe(expectedFrame); expect(sequential.world.body("fighter:hips")).toEqual(expect.objectContaining({ type: "kinematic", y: 1, velocityY: 0, collisionMask: 0 })); }
    const beforeActivation = sequential.checkpoint();
    sequential.stepFrame();
    const activated = sequential.world.body("fighter:hips")!;
    expect(activated.type).toBe("dynamic"); expect(activated.collisionMask).toBe(4); expect(activated.y).toBeLessThan(1);
    const resumed = createPhysicalPerformanceRuntime3D({ performance: delayed }); resumed.restoreCheckpoint(beforeActivation); resumed.stepFrame();
    expect(resumed.world.body("fighter:hips")).toEqual(activated);
    const compiled = createPhysicalPerformanceCompiler3D({ performance: delayed, checkpointIntervalFrames: 5 }); compiled.ensureFrame(10);
    const state = new Float32Array(PHYSICAL_BODY_STATE_STRIDE_3D); compiled.writeFrame(10, state);
    expect(state[1]).toBeCloseTo(activated.y, 6);
    const incremental = createPhysicalPerformanceCompiler3D({ performance: delayed, checkpointIntervalFrames: 5 });
    const progress = incremental.advance({ throughFrame: 10, maximumFrames: 1 });
    expect(progress).toEqual(expect.objectContaining({ compiledThroughFrame: 10, done: true }));
    expect(incremental.states.slice(0, 11 * incremental.frameStride)).toEqual(compiled.states.slice(0, 11 * compiled.frameStride));
    expect(incremental.resumePointBefore(10).checkpoint.frame).toBe(9);
  });

  test("does not fast-forward a prefix containing an active world body", () => {
    const delayed: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 20, world: { gravityY: -9.81 },
      bodies: [{ id: "falling", shape: { kind: "sphere", radius: .1 }, y: 2, mass: 1 }],
      ragdolls: [{ id: "fighter", activationFrame: 10, rootBoneId: "hips", bodies: [{ boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, y: 1, mass: 8, collisionLayer: 2, collisionMask: 4 } }], joints: [], initialPose: { rotations: [] } }],
      cues: [], outputs: [{ ragdollId: "fighter", boneId: "hips" }],
    };
    const incremental = createPhysicalPerformanceCompiler3D({ performance: delayed });
    expect(incremental.advance({ throughFrame: 10, maximumFrames: 1 })).toEqual(expect.objectContaining({ compiledThroughFrame: 0, done: false }));
  });

  test("rejects physical intent before a delayed ragdoll exists in the simulation", () => {
    const base = performance();
    const delayed: PhysicalPerformance3D = {
      ...base,
      ragdolls: [{ ...base.ragdolls[0]!, activationFrame: 5 }, ...base.ragdolls.slice(1)],
    };
    expect(() => createPhysicalPerformanceRuntime3D({ performance: delayed })).toThrow("before primal takes physical authority at frame 5");
  });
  test("resolves portable root-motion intent through the rigid world without playback history", () => {
    const source = (blocked: boolean): PhysicalPerformance3D => ({
      frameRate: 30, simulationHz: 120, durationFrames: 20, world: { gravityY: 0, velocityIterations: 8 },
      bodies: blocked ? [{ id: "wall", type: "static", shape: { kind: "box", halfX: .1, halfY: 2, halfZ: 2 }, x: .65, collisionLayer: 4, collisionMask: 2 }] : [],
      ragdolls: [{ id: "fighter", rootBoneId: "hips", bodies: [{ boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, mass: 2, collisionLayer: 2, collisionMask: 4 } }], joints: [], initialPose: { rotations: [] }, maxRootImpulse: 100 }],
      cues: [], outputs: [{ ragdollId: "fighter", boneId: "hips" }],
    });
    const provider = ({ frame }: { frame: number; ragdollId: string }) => ({ delta: [frame === 0 ? 0 : .1, 0, 0] as const, maxImpulse: 100 });
    const free = compilePhysicalPerformance3D({ performance: source(false), rootMotionProvider: provider });
    const blocked = compilePhysicalPerformance3D({ performance: source(true), rootMotionProvider: provider });
    const replay = compilePhysicalPerformance3D({ performance: source(true), rootMotionProvider: provider });
    const x = (compiled: typeof free, frame: number) => compiled.states[frame * compiled.frameStride]!;
    expect(x(free, 10)).toBeGreaterThan(.8);
    expect(x(blocked, 10)).toBeLessThanOrEqual(.352);
    expect(blocked.states).toEqual(replay.states);
  });

  test("turns distance and peak-speed intent into deterministic physical locomotion", () => {
    const source: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 20, world: { gravityY: 0, velocityIterations: 8 },
      ragdolls: [{ id: "runner", rootBoneId: "hips", bodies: [{ boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, mass: 2 } }], joints: [], initialPose: { rotations: [] }, maxRootImpulse: 100 }],
      cues: [{ id: "run-east", kind: "locomotion", frame: 2, durationFrames: 12, ragdollId: "runner", direction: [1, 0, 0], distanceMeters: .8, peakSpeedMetersPerSecond: 3, maxImpulse: 100 }], outputs: [{ ragdollId: "runner", boneId: "hips" }],
    };
    const first = compilePhysicalPerformance3D({ performance: source }), second = compilePhysicalPerformance3D({ performance: source });
    const x = (frame: number) => first.states[frame * first.frameStride]!;
    expect(x(1)).toBeCloseTo(0, 6); expect(x(8)).toBeGreaterThan(.25); expect(x(15)).toBeGreaterThan(.7); expect(first.states).toEqual(second.states);
    const compiler = createPhysicalPerformanceCompiler3D({ performance: source, checkpointIntervalFrames: 3 }); compiler.ensureFrame(15); const arbitrary = new Float32Array(first.frameStride); compiler.writeFrame(15, arbitrary); expect(arbitrary).toEqual(first.states.slice(15 * first.frameStride, 16 * first.frameStride));
    const tooSlow = structuredClone(source); (requireLocomotion(tooSlow.cues[0])).peakSpeedMetersPerSecond = 2;
    expect(() => createPhysicalPerformanceRuntime3D({ performance: tooSlow })).toThrow("smooth physical travel");
  });

  test("preserves velocity across adjacent same-direction locomotion pace cues", () => {
    const source: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 20, world: { gravityY: 0, velocityIterations: 8 },
      ragdolls: [{ id: "runner", rootBoneId: "hips", bodies: [{ boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, mass: 2 } }], joints: [], initialPose: { rotations: [] }, maxRootImpulse: 100 }],
      cues: [
        { id: "walk", kind: "locomotion", frame: 2, durationFrames: 6, ragdollId: "runner", direction: [1, 0, 0], distanceMeters: .18, peakSpeedMetersPerSecond: 1.35, maxImpulse: 100 },
        { id: "run", kind: "locomotion", frame: 8, durationFrames: 6, ragdollId: "runner", direction: [1, 0, 0], distanceMeters: .5, peakSpeedMetersPerSecond: 4, maxImpulse: 100 },
      ],
      outputs: [{ ragdollId: "runner", boneId: "hips" }],
    };
    const first = compilePhysicalPerformance3D({ performance: source }), second = compilePhysicalPerformance3D({ performance: source });
    const velocityX = (frame: number) => first.states[frame * first.frameStride + 7]!;
    expect(velocityX(7)).toBeGreaterThan(.45); expect(velocityX(8)).toBeGreaterThan(.45);
    expect(first.states).toEqual(second.states);
  });

  test("does not let clip root motion steer an airborne ragdoll after physical takeoff", () => {
    const source = groundedJumpPerformance();
    const baseline = compilePhysicalPerformance3D({ performance: source });
    const attemptedAirSteer = compilePhysicalPerformance3D({ performance: source, rootMotionProvider: ({ frame }) => frame === 8 ? { delta: [.5, 0, 0] } : undefined });
    expect(attemptedAirSteer.states).toEqual(baseline.states);
  });

  test("yields clip locomotion to an active physical action and reports the arbitration once", () => {
    const source = jointDrivePerformance(), baseline = compilePhysicalPerformance3D({ performance: source });
    const provider = ({ frame }: { frame: number; ragdollId: string }) => frame >= 2 && frame < 17 ? { delta: [.1, 0, 0] as const, sourceId: "run-segment", pointer: "/extensions/hyperfocus3DVideo/performanceTracks/0/segments/0/rootMotion/authority" } : undefined;
    const first = compilePhysicalPerformance3D({ performance: source, rootMotionProvider: provider }), second = compilePhysicalPerformance3D({ performance: source, rootMotionProvider: provider });
    expect(first.states).toEqual(baseline.states); expect(first.states).toEqual(second.states); expect(first.diagnostics).toEqual(second.diagnostics);
    expect(first.diagnostics.filter((item) => item.code === "root-motion-action-conflict")).toEqual([expect.objectContaining({ cueId: "run-segment", frame: 2, pointer: "/extensions/hyperfocus3DVideo/performanceTracks/0/segments/0/rootMotion/authority" })]);
  });

  test("builds canonical terrain chunks into reusable deterministic bodies and seams", () => {
    const first = createBreakableAssembly3D({ id: "cliff", chunks: [{ id: "slab-a", position: [-2, 1, 0], rotationY: Math.PI / 2, scale: [2, 1, .5] }, { id: "slab-b", position: [2, 1, 0], scale: [1, 2, 1] }], strength: 80, massPerChunkKg: 40, colliderScale: .8, materialPreset: "wood" });
    const second = createBreakableAssembly3D({ id: "cliff", chunks: [{ id: "slab-a", position: [-2, 1, 0], rotationY: Math.PI / 2, scale: [2, 1, .5] }, { id: "slab-b", position: [2, 1, 0], scale: [1, 2, 1] }], strength: 80, massPerChunkKg: 40, colliderScale: .8, materialPreset: "wood" });
    expect(first).toEqual(second); expect(first.chunkBodyIds).toEqual(["cliff__breakable_chunk__slab-a", "cliff__breakable_chunk__slab-b"]);
    expect(first).toMatchObject({ topology: "anchored", supportConstraintIds: ["cliff__breakable_seam__slab-a", "cliff__breakable_seam__slab-b"], linkConstraintIds: [] });
    expect(first.bodies[1]).toMatchObject({ shape: { kind: "box", halfX: .8, halfY: .4, halfZ: .2 }, mass: 40, friction: .65, restitution: .18, angularDamping: .16, continuous: true });
    expect(first.constraints[0]).toMatchObject({ id: "cliff__breakable_seam__slab-a", breakGroupId: "cliff", localAnchorA: [-2, 1, 0], breakImpulse: 80 });
    expect(() => createBreakableAssembly3D({ id: "bad", chunks: [{ id: "same", position: [0, 0, 0], scale: [1, 1, 1] }, { id: "same", position: [1, 0, 0], scale: [1, 1, 1] }] })).toThrow("repeats chunk");
  });

  test("builds supported neighbor topology and releases only seams local to a material breakthrough", () => {
    const assembly = createBreakableAssembly3D({
      id: "wall",
      chunks: [
        { id: "base", position: [1, .5, 0], scale: [1, 1, 1] },
        { id: "middle", position: [1, 1.5, 0], scale: [1, 1, 1] },
        { id: "top", position: [1, 2.5, 0], scale: [1, 1, 1] },
      ],
      topology: "clustered",
      neighborRadiusMeters: .11,
      supportBandMeters: .01,
      strength: 1_000,
      fractureEnergyJoules: 5,
    });
    expect(assembly.supportConstraintIds).toEqual(["wall__breakable_seam__base"]);
    expect(assembly.linkConstraintIds).toEqual(["wall__breakable_link__0_1", "wall__breakable_link__1_2"]);
    expect(assembly.constraints).toHaveLength(3);
    expect(() => createBreakableAssembly3D({ id: "islands", chunks: [{ id: "base", position: [0, 0, 0], scale: [1, 1, 1] }, { id: "floating", position: [0, 4, 0], scale: [1, 1, 1] }], topology: "clustered" })).toThrow("increase neighborRadiusMeters, or choose anchored topology");

    const source: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 12, world: { gravityY: 0, constraintIterations: 10 }, bodies: assembly.bodies,
      ragdolls: [{ id: "fighter", rootBoneId: "fist", bodies: [{ boneId: "fist", body: { shape: { kind: "sphere", radius: .15 }, y: 2.5, mass: 2, continuous: true } }], joints: [], initialPose: { rotations: [] } }],
      constraints: assembly.constraints,
      cues: [{ id: "top-break", kind: "launch", frame: 0, attacker: { ragdollId: "fighter", boneId: "fist" }, target: { bodyId: assembly.chunkBodyIds[2]! }, direction: [1, 0, 0], speedMetersPerSecond: 12, distanceMeters: 2 }],
      outputs: [{ ragdollId: "fighter", boneId: "fist" }, ...assembly.chunkBodyIds.map((bodyId) => ({ bodyId }))],
    };
    const first = compilePhysicalPerformance3D({ performance: source }), second = compilePhysicalPerformance3D({ performance: source });
    expect(first.states).toEqual(second.states); expect(first.breaks).toEqual(second.breaks);
    expect(first.breaks.map((event) => event.constraintId)).toEqual(["wall__breakable_link__1_2"]);
    expect(first.breaks[0]).toMatchObject({ groupId: "wall", cause: "impact", impactEnergyJoules: expect.any(Number) });
  });

  test("turns compressed launch intent into one deterministic synchronized contact", () => {
    const first = compilePhysicalPerformance3D({ performance: performance() });
    const second = compilePhysicalPerformance3D({ performance: performance() });

    expect(first.contacts).toHaveLength(1);
    expect(first.contacts[0]).toEqual(expect.objectContaining({
      cueId: "first-punch",
      attacker: { ragdollId: "primal", boneId: "fist" },
      target: { ragdollId: "lumberjack", boneId: "chest" },
    }));
    expect(first.contacts[0]!.frame).toBeGreaterThan(0);
    expect(first.contacts[0]!.subframe).toBeGreaterThan(0);
    expect(first.diagnostics).toHaveLength(0);
    expect(first.states).toEqual(second.states);
    expect(first.contacts).toEqual(second.contacts);

    const targetOffset = PHYSICAL_BODY_STATE_STRIDE_3D;
    const before = first.states[targetOffset]!;
    const after = first.states[(first.durationFrames - 1) * first.frameStride + targetOffset]!;
    expect(after).toBeGreaterThan(before);
  });

  test("derives proportional stagger or knockdown from the solved contact instead of a canned target mode", () => {
    const source = performance(), target = source.ragdolls[1]!, launch = source.cues[0];
    if (launch?.kind !== "launch") throw new Error("Expected launch fixture");
    target.impactResponse = { minimumStaggerSpeedMetersPerSecond: 2, knockdownSpeedMetersPerSecond: 10, staggerDurationSeconds: .25, staggerMotorYield: .2 }; launch.targetModeOnContact = "auto";
    const first = compilePhysicalPerformance3D({ performance: source }), second = compilePhysicalPerformance3D({ performance: source });
    expect(first.contacts).toHaveLength(1); expect(first.characterStateEvents).toEqual(second.characterStateEvents);
    expect(first.characterStateEvents).toContainEqual(expect.objectContaining({ ragdollId: "lumberjack", authority: "staggered", frame: first.contacts[0]!.frame }));
    expect(first.characterStateEvents).not.toContainEqual(expect.objectContaining({ ragdollId: "lumberjack", authority: "downed" }));
    const heavy = structuredClone(source), heavyLaunch = heavy.cues[0]; if (heavyLaunch?.kind !== "launch") throw new Error("Expected launch fixture"); heavyLaunch.speedMetersPerSecond = 12;
    expect(compilePhysicalPerformance3D({ performance: heavy }).characterStateEvents).toContainEqual(expect.objectContaining({ ragdollId: "lumberjack", authority: "downed" }));
    const invalid = structuredClone(source), invalidLaunch = invalid.cues[0]; if (invalidLaunch?.kind !== "launch") throw new Error("Expected launch fixture"); Reflect.set(invalidLaunch, "targetModeOnContact", "explode");
    expect(() => compilePhysicalPerformance3D({ performance: invalid })).toThrow("choose auto, active, or passive");
  });

  test("drives an attacking limb through equal-and-opposite whole-body actuation", () => {
    const source = (actuation: "whole-body" | "external"): PhysicalPerformance3D => ({
      frameRate: 30, simulationHz: 120, durationFrames: 4, world: { gravityY: 0 },
      ragdolls: [{ id: "fighter", rootBoneId: "hips", bodies: [
        { boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, x: -1, mass: 8, collisionLayer: 1, collisionMask: 0 } },
        { boneId: "hand", body: { shape: { kind: "sphere", radius: .1 }, mass: 2, collisionLayer: 1, collisionMask: 0 } },
      ], joints: [], initialPose: { rotations: [] } }],
      cues: [{ id: "strike", kind: "launch", frame: 0, attacker: { ragdollId: "fighter", boneId: "hand" }, targeting: "authored", direction: [1, 0, 0], speedMetersPerSecond: 6, distanceMeters: 1, angularVelocityDegreesPerSecond: [0, 0, 180], actuation }],
      outputs: [{ ragdollId: "fighter", boneId: "hips" }, { ragdollId: "fighter", boneId: "hand" }],
    });
    const state = (actuation: "whole-body" | "external") => { const compiled = compilePhysicalPerformance3D({ performance: source(actuation) }), output = new Float32Array(compiled.frameStride); compiled.writeFrame(0, output); return output; };
    const internal = state("whole-body"), external = state("external"), velocity = (output: Float32Array, body: number) => output[body * PHYSICAL_BODY_STATE_STRIDE_3D + 7]!, spinZ = (output: Float32Array, body: number) => output[body * PHYSICAL_BODY_STATE_STRIDE_3D + 12]!, angularMomentumZ = (output: Float32Array) => spinZ(output, 0) * .4 * 8 * 0.04000000000000001 + spinZ(output, 1) * .4 * 2 * 0.010000000000000002;
    expect(velocity(internal, 1)).toBeCloseTo(6, 6);
    expect(velocity(internal, 0) * 8 + velocity(internal, 1) * 2).toBeCloseTo(0, 6);
    expect(velocity(external, 0) * 8 + velocity(external, 1) * 2).toBeCloseTo(12, 6);
    expect(spinZ(internal, 1)).toBeGreaterThan(3);
    expect(angularMomentumZ(internal)).toBeCloseTo(0, 6);
    expect(angularMomentumZ(external)).toBeGreaterThan(.02);
    expect(state("whole-body")).toEqual(internal);
    const unsupported = performance(), launch = unsupported.cues[0];
    if (launch?.kind !== "launch") throw new Error("Expected launch fixture");
    unsupported.cues = [{ ...launch, actuation: "whole-body" }];
    expect(() => compilePhysicalPerformance3D({ performance: unsupported })).toThrow("/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/0/actuation");
  });

  test("turns joint distance and speed intent into a smooth deterministic internal torque arc", () => {
    const first = createPhysicalPerformanceCompiler3D({ performance: jointDrivePerformance(), checkpointIntervalFrames: 5 }), output = new Float32Array(first.frameStride);
    const relativeSpin = (frame: number) => { first.writeFrame(frame, output); return output[PHYSICAL_BODY_STATE_STRIDE_3D + 12]! - output[12]!; };
    const before = relativeSpin(1), start = relativeSpin(2), middle = relativeSpin(9), end = relativeSpin(16);
    expect(before).toBeCloseTo(0, 7); expect(start).toBeGreaterThan(0); expect(start).toBeLessThan(middle); expect(middle).toBeLessThanOrEqual(300 * Math.PI / 180 + 1e-5); expect(end).toBeLessThan(middle * .2);
    const sequential = compilePhysicalPerformance3D({ performance: jointDrivePerformance() }); first.ensureComplete(); expect(first.states).toEqual(sequential.states);
    const resumed = createPhysicalPerformanceCompiler3D({ performance: jointDrivePerformance(), resumeFrom: first.resumePointBefore(11) }); resumed.ensureComplete(); expect(resumed.states).toEqual(sequential.states);
    const tooSlow = jointDrivePerformance(); (requireJointDrive(tooSlow.cues[0])).peakAngularSpeedDegreesPerSecond = 100;
    expect(() => compilePhysicalPerformance3D({ performance: tooSlow })).toThrow("use at least 41 frames");
    const missing = jointDrivePerformance(); (requireJointDrive(missing.cues[0])).jointId = "missing";
    expect(() => compilePhysicalPerformance3D({ performance: missing })).toThrow("Project pointer: /extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/0");
  });

  test("turns one effector displacement and speed into deterministic multi-joint motion", () => {
    const compiler = createPhysicalPerformanceCompiler3D({ performance: effectorDrivePerformance(), checkpointIntervalFrames: 5 }), output = new Float32Array(compiler.frameStride), forearmOffset = PHYSICAL_BODY_STATE_STRIDE_3D, handOffset = forearmOffset * 2;
    const sample = (frame: number) => { compiler.writeFrame(frame, output); return { handY: output[handOffset + 1]!, handRotationZ: output[handOffset + 5]!, chestSpin: output[12]!, forearmSpin: output[forearmOffset + 12]! }; };
    const before = sample(1), middle = sample(9), end = sample(18); expect(before.chestSpin).toBeCloseTo(0, 7); expect(middle.handY).toBeGreaterThan(before.handY + .01); expect(Math.abs(middle.handRotationZ)).toBeGreaterThan(.01); expect(Math.abs(middle.chestSpin)).toBeGreaterThan(.01); expect(Math.abs(middle.forearmSpin)).toBeGreaterThan(.01); expect(end.handY).toBeGreaterThan(before.handY);
    const sequential = compilePhysicalPerformance3D({ performance: effectorDrivePerformance() }); compiler.ensureComplete(); expect(compiler.states).toEqual(sequential.states);
    const resumed = createPhysicalPerformanceCompiler3D({ performance: effectorDrivePerformance(), resumeFrom: compiler.resumePointBefore(11) }); resumed.ensureComplete(); expect(resumed.states).toEqual(sequential.states);
    const curvedSource = effectorDrivePerformance(), curvedCue = curvedSource.cues[0]; if (curvedCue?.kind !== "effector-drive") throw new Error("Expected effector drive"); curvedCue.path = { mode: "arc", plane: "horizontal", heightMeters: .2, side: 1 };
    const curved = createPhysicalPerformanceCompiler3D({ performance: curvedSource, checkpointIntervalFrames: 5 }), curvedFrame = new Float32Array(curved.frameStride), straightFrame = new Float32Array(compiler.frameStride); curved.writeFrame(9, curvedFrame); compiler.writeFrame(9, straightFrame); expect(Math.abs(curvedFrame[handOffset]! - straightFrame[handOffset]!)).toBeGreaterThan(.01); curved.ensureComplete(); const curvedResumed = createPhysicalPerformanceCompiler3D({ performance: curvedSource, resumeFrom: curved.resumePointBefore(11) }); curvedResumed.ensureComplete(); expect(curvedResumed.states).toEqual(curved.states);
    const tooSlow = effectorDrivePerformance(); (requireEffectorDrive(tooSlow.cues[0])).peakSpeedMetersPerSecond = .5; expect(() => compilePhysicalPerformance3D({ performance: tooSlow })).toThrow("use at least 54 frames");
    const slowTurn = effectorDrivePerformance(), orientation = (requireEffectorDrive(slowTurn.cues[0])).orientation!; orientation.peakAngularSpeedDegreesPerSecond = 100; expect(() => compilePhysicalPerformance3D({ performance: slowTurn })).toThrow("orientation needs 270.00 degrees/s");
    const disconnected = effectorDrivePerformance(); (requireEffectorDrive(disconnected.cues[0])).jointIds = ["elbow", "shoulder"]; expect(() => compilePhysicalPerformance3D({ performance: disconnected })).toThrow("Project pointer: /extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/0");
    const overlap = effectorDrivePerformance(); overlap.cues = [...overlap.cues, { id: "shoulder-conflict", kind: "joint-drive", frame: 4, durationFrames: 4, ragdollId: "fighter", jointId: "shoulder", axisParentLocal: [0, 0, 1], angularDistanceDegrees: 5, peakAngularSpeedDegreesPerSecond: 100, maxTorqueImpulse: 1 }]; expect(() => compilePhysicalPerformance3D({ performance: overlap })).toThrow("overlaps hand-path");
  });

  test("captures planted support-aware inverse dynamics for scrub and checkpoint replay", () => {
    const source = effectorDrivePerformance(), fighter = source.ragdolls[0]!, cue = source.cues[0]; if (cue?.kind !== "effector-drive") throw new Error("Expected effector drive fixture");
    source.world = { gravityY: 0, constraintIterations: 12 }; source.bodies = [{ id: "ground", type: "static", shape: { kind: "box", halfX: 20, halfY: .1, halfZ: 20 }, y: -.1, collisionLayer: 4, collisionMask: 1 }];
    fighter.rootBoneId = "chest"; fighter.bodies.unshift({ boneId: "foot", body: { shape: { kind: "sphere", radius: .1 }, y: .1, mass: 2, collisionLayer: 1, collisionMask: 4 } }); fighter.joints.unshift({ id: "hip", parentBoneId: "chest", childBoneId: "foot", poseJointIndex: 2, motorStiffness: 0, maxTorqueImpulse: 0 }); fighter.initialPose = { rotations: [...Array.from(fighter.initialPose.rotations), 0, 0, 0, 1] };
    cue.supportMode = "auto"; source.cues = [{ id: "stance", kind: "support", frame: 0, durationFrames: 24, ragdollId: "fighter", boneId: "foot", groundLayerMask: 4, probeDistance: .05, stiffness: 1, damping: 1, maxImpulse: 100, breakImpulse: 1_000_000 }, ...source.cues]; source.outputs = [{ ragdollId: "fighter", boneId: "foot" }, ...source.outputs!];
    const compiler = createPhysicalPerformanceCompiler3D({ performance: source, checkpointIntervalFrames: 5 }); compiler.writeFrame(8, new Float32Array(compiler.frameStride));
    const resumePoint = compiler.resumePointBefore(8), active = resumePoint.checkpoint.activeEffectorDrives?.find((item) => item.cueId === cue.id);
    expect(active?.support).toEqual({ boneId: "foot", jointIds: ["hip", "shoulder", "elbow"] });
    compiler.ensureComplete(); const sequential = compilePhysicalPerformance3D({ performance: source }); expect(compiler.states).toEqual(sequential.states);
    const resumed = createPhysicalPerformanceCompiler3D({ performance: source, resumeFrom: resumePoint }); resumed.ensureComplete(); expect(resumed.states).toEqual(sequential.states);
    const invalid = structuredClone(source), invalidCue = invalid.cues.find((item) => item.kind === "effector-drive")!; if (invalidCue.kind !== "effector-drive") throw new Error("Expected effector drive"); Reflect.set(invalidCue, "supportMode", "teleport"); expect(() => compilePhysicalPerformance3D({ performance: invalid })).toThrow("supportMode is unsupported");
  });

  test("aims an effector local face along travel intent without authored world rotation", () => {
    const source = effectorDrivePerformance(), cue = source.cues[0];
    if (cue?.kind !== "effector-drive") throw new Error("Expected effector drive fixture");
    cue.orientation = { mode: "align-direction", localAxis: [1, 0, 0], peakAngularSpeedDegreesPerSecond: 360, trackingGainPerSecond: 8, maxTorqueImpulse: .1 };
    const first = createPhysicalPerformanceCompiler3D({ performance: source, checkpointIntervalFrames: 5 }), sequential = compilePhysicalPerformance3D({ performance: source }), output = new Float32Array(first.frameStride), handOffset = PHYSICAL_BODY_STATE_STRIDE_3D * 2;
    first.writeFrame(15, output);
    const x = output[handOffset + 3]!, y = output[handOffset + 4]!, z = output[handOffset + 5]!, w = output[handOffset + 6]!, localXWorldY = 2 * (x * y + w * z);
    expect(localXWorldY).toBeGreaterThan(.5);
    first.ensureComplete(); expect(first.states).toEqual(sequential.states);
    const resumed = createPhysicalPerformanceCompiler3D({ performance: source, resumeFrom: first.resumePointBefore(11) }); resumed.ensureComplete(); expect(resumed.states).toEqual(sequential.states);
    const invalid = effectorDrivePerformance(), invalidCue = invalid.cues[0]; if (invalidCue?.kind !== "effector-drive") throw new Error("Expected effector drive fixture"); invalidCue.orientation = { mode: "align-direction", localAxis: [0, 0, 0], peakAngularSpeedDegreesPerSecond: 360 };
    expect(() => compilePhysicalPerformance3D({ performance: invalid })).toThrow("orientation localAxis must be non-zero");
    const unsupported = effectorDrivePerformance(), unsupportedCue = unsupported.cues[0]; if (unsupportedCue?.kind !== "effector-drive") throw new Error("Expected effector drive fixture"); Reflect.set(unsupportedCue, "orientation", { mode: "spin-randomly", localAxis: [1, 0, 0], peakAngularSpeedDegreesPerSecond: 360 });
    expect(() => compilePhysicalPerformance3D({ performance: unsupported })).toThrow("Choose aim-at-body, align-direction, or turn");
  });

  test("captures a live target-aware aim independently from wind-up travel and resumes it exactly", () => {
    const source = effectorDrivePerformance(), cue = source.cues[0];
    if (cue?.kind !== "effector-drive") throw new Error("Expected effector drive fixture");
    source.bodies = [{ id: "moving-target", type: "kinematic", shape: { kind: "sphere", radius: .2 }, x: .95, y: .55, z: 2, velocityX: 2, collisionLayer: 2, collisionMask: 0 }];
    cue.orientation = { mode: "aim-at-body", localAxis: [1, 0, 0], target: { bodyId: "moving-target" }, peakAngularSpeedDegreesPerSecond: 360, trackingGainPerSecond: 8, maxTorqueImpulse: .1 };
    const compiler = createPhysicalPerformanceCompiler3D({ performance: source, checkpointIntervalFrames: 5 }), sequential = compilePhysicalPerformance3D({ performance: source }), output = new Float32Array(compiler.frameStride), handOffset = PHYSICAL_BODY_STATE_STRIDE_3D * 2;
    compiler.writeFrame(15, output);
    const x = output[handOffset + 3]!, y = output[handOffset + 4]!, z = output[handOffset + 5]!, w = output[handOffset + 6]!, localXWorldZ = 2 * (x * z - w * y);
    expect(localXWorldZ).toBeGreaterThan(.45);
    const resumePoint = compiler.resumePointBefore(11), savedDrive = resumePoint.checkpoint.activeEffectorDrives?.find((item) => item.cueId === cue.id);
    expect(savedDrive?.orientationGoal).toBeDefined();
    compiler.ensureComplete(); expect(compiler.states).toEqual(sequential.states);
    const resumed = createPhysicalPerformanceCompiler3D({ performance: source, resumeFrom: resumePoint }); resumed.ensureComplete(); expect(resumed.states).toEqual(sequential.states);
    const missing = effectorDrivePerformance(), missingCue = missing.cues[0]; if (missingCue?.kind !== "effector-drive") throw new Error("Expected effector drive fixture"); missingCue.orientation = { mode: "aim-at-body", localAxis: [1, 0, 0], target: { bodyId: "missing" }, peakAngularSpeedDegreesPerSecond: 360 };
    expect(() => compilePhysicalPerformance3D({ performance: missing })).toThrow("orientation/target");
    const self = effectorDrivePerformance(), selfCue = self.cues[0]; if (selfCue?.kind !== "effector-drive") throw new Error("Expected effector drive fixture"); selfCue.orientation = { mode: "aim-at-body", localAxis: [1, 0, 0], target: { ragdollId: "fighter", boneId: "hand" }, peakAngularSpeedDegreesPerSecond: 360 };
    expect(() => compilePhysicalPerformance3D({ performance: self })).toThrow("cannot aim its effector at itself");
  });

  test("tracks effector translation toward a live physical body deterministically", () => {
    const source = effectorDrivePerformance(), cue = source.cues[0];
    if (cue?.kind !== "effector-drive") throw new Error("Expected effector drive fixture");
    source.bodies = [{ id: "moving-target", type: "kinematic", shape: { kind: "sphere", radius: .2 }, x: 1.55, y: .55, velocityY: .3, collisionLayer: 2, collisionMask: 0 }];
    cue.translationTarget = { bodyId: "moving-target" };
    const tracked = createPhysicalPerformanceCompiler3D({ performance: source, checkpointIntervalFrames: 5 }), baseline = createPhysicalPerformanceCompiler3D({ performance: effectorDrivePerformance() }), trackedFrame = new Float32Array(tracked.frameStride), baselineFrame = new Float32Array(baseline.frameStride), handOffset = PHYSICAL_BODY_STATE_STRIDE_3D * 2;
    tracked.writeFrame(15, trackedFrame); baseline.writeFrame(15, baselineFrame);
    expect(trackedFrame[handOffset]).toBeGreaterThan(baselineFrame[handOffset]! + .05);
    const resumePoint = tracked.resumePointBefore(11); tracked.ensureComplete();
    const resumed = createPhysicalPerformanceCompiler3D({ performance: source, resumeFrom: resumePoint }); resumed.ensureComplete(); expect(resumed.states).toEqual(tracked.states);
    const missing = effectorDrivePerformance(), missingCue = missing.cues[0]; if (missingCue?.kind !== "effector-drive") throw new Error("Expected effector drive fixture"); missingCue.translationTarget = { bodyId: "missing" };
    expect(() => compilePhysicalPerformance3D({ performance: missing })).toThrow("/translationTarget");
    const self = effectorDrivePerformance(), selfCue = self.cues[0]; if (selfCue?.kind !== "effector-drive") throw new Error("Expected effector drive fixture"); selfCue.translationTarget = { ragdollId: "fighter", boneId: "hand" };
    expect(() => compilePhysicalPerformance3D({ performance: self })).toThrow("cannot track its effector toward itself");
  });

  test("stops contact drive and starts follow-through and recovery from the exact solved collision tick", () => {
    const source = contactAnchoredEffectorPerformance(), runtime = createPhysicalPerformanceRuntime3D({ performance: source });
    while (!runtime.contacts.length && runtime.frame < source.durationFrames - 1) runtime.stepFrame();
    expect(runtime.diagnostics).toEqual([]); expect(runtime.contacts).toHaveLength(1);
    const contact = runtime.contacts[0]!, contactCheckpoint = runtime.checkpoint(), activeAtContact = contactCheckpoint.activeEffectorDrives ?? [];
    expect(activeAtContact.map((item) => item.cueId)).toEqual(["strike-follow-through"]);
    expect(activeAtContact[0]!.startTick).toBe(contact.simulationTick + 1);
    const recoveryStartTick = contact.simulationTick + 1 + 6 * runtime.stepsPerFrame;
    while (runtime.checkpoint().simulationTick <= recoveryStartTick) runtime.stepFrame();
    const recovery = runtime.checkpoint().activeEffectorDrives ?? [];
    expect(recovery.map((item) => item.cueId)).toEqual(["strike-recovery"]); expect(recovery[0]!.startTick).toBe(recoveryStartTick);

    const first = compilePhysicalPerformance3D({ performance: source }), second = compilePhysicalPerformance3D({ performance: contactAnchoredEffectorPerformance() });
    expect(first.contacts).toEqual(second.contacts); expect(first.states).toEqual(second.states);
    const replay = createPhysicalPerformanceRuntime3D({ performance: source });
    while (!replay.contacts.length) replay.stepFrame();
    const checkpoint = replay.checkpoint(); while (replay.frame < source.durationFrames - 1) replay.stepFrame(); const expected = replay.checkpoint();
    replay.restoreCheckpoint(checkpoint); while (replay.frame < source.durationFrames - 1) replay.stepFrame(); expect(replay.checkpoint()).toEqual(expected);

    const invalid = contactAnchoredEffectorPerformance(), follow = invalid.cues[2]; if (follow?.kind !== "effector-drive") throw new Error("follow-through fixture is missing");
    invalid.cues = [invalid.cues[0]!, invalid.cues[1]!, { ...follow, afterContact: { cueId: "missing", offsetFrames: 0 } }, invalid.cues[3]!];
    expect(() => createPhysicalPerformanceRuntime3D({ performance: invalid })).toThrow("/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/2/afterContact/cueId");
    const contradictory = contactAnchoredEffectorPerformance(), contradictoryFollow = contradictory.cues[2]; if (contradictoryFollow?.kind !== "effector-drive") throw new Error("follow-through fixture is missing");
    contradictory.cues = [contradictory.cues[0]!, contradictory.cues[1]!, { ...contradictoryFollow, stopAtContact: { cueId: "strike-contact" } }, contradictory.cues[3]!];
    expect(() => createPhysicalPerformanceRuntime3D({ performance: contradictory })).toThrow("cannot start and stop from the same contact event");
  });

  test("keeps one physical action causally locked through contact, consequence, recovery, and return-to-ready", () => {
    const source = contactAnchoredEffectorPerformance(); source.durationFrames = 40;
    for (const cue of source.cues) if (cue.kind === "effector-drive") cue.actionId = "rooted-strike";
    const launch = source.cues.find((cue) => cue.kind === "launch")!; if (launch.kind !== "launch") throw new Error("Expected launch");
    launch.actionId = "rooted-strike"; launch.consequenceFrames = 3; launch.recoveryFrames = 4;
    source.cues = [...source.cues, { id: "greedy-second-strike", kind: "launch", frame: 4, attacker: { ragdollId: "fighter", boneId: "hand" }, target: { ragdollId: "target", boneId: "chest" }, targeting: "target-at-launch", speedMetersPerSecond: 12, actionId: "second-strike", consequenceFrames: 1, recoveryFrames: 2 }];
    const compiled = compilePhysicalPerformance3D({ performance: source }), contact = compiled.contacts.find((item) => item.cueId === launch.id)!;
    const actionEvents = compiled.characterStateEvents.filter((event) => event.ragdollId === "fighter" && event.action?.id === "rooted-strike");
    expect(actionEvents.map((event) => event.action?.phase)).toEqual(expect.arrayContaining(["contact", "consequence", "recovery"]));
    expect(actionEvents.find((event) => event.action?.phase === "consequence")?.simulationTick).toBe(contact.simulationTick);
    expect(actionEvents.find((event) => event.action?.phase === "recovery")?.simulationTick).toBe(contact.simulationTick + 1 + 12);
    expect(compiled.characterStateEvents).toContainEqual(expect.objectContaining({ ragdollId: "fighter", simulationTick: contact.simulationTick + 1 + 28, authority: "ready" }));
    expect(compiled.diagnostics).toContainEqual(expect.objectContaining({ code: "action-chain-conflict", cueId: "greedy-second-strike" }));
    const compiler = createPhysicalPerformanceCompiler3D({ performance: source, checkpointIntervalFrames: 3 }); compiler.ensureComplete(); expect(compiler.states).toEqual(compiled.states); expect(compiler.characterStateEvents).toEqual(compiled.characterStateEvents);
    const resumed = createPhysicalPerformanceCompiler3D({ performance: source, resumeFrom: compiler.resumePointBefore(11) }); resumed.ensureComplete(); expect(resumed.states).toEqual(compiled.states); expect(resumed.characterStateEvents).toEqual(compiled.characterStateEvents);
    const orphan = contactAnchoredEffectorPerformance(), orphanDrive = orphan.cues.find((cue) => cue.kind === "effector-drive")!; if (orphanDrive.kind !== "effector-drive") throw new Error("Expected drive"); orphanDrive.actionId = "orphan"; expect(() => compilePhysicalPerformance3D({ performance: orphan })).toThrow("has no lifecycle launch");
  });

  test("does not tunnel a fast dynamic effector through a dynamic target between substeps", () => {
    const source: PhysicalPerformance3D = {
      frameRate: 30,
      simulationHz: 120,
      durationFrames: 8,
      world: { gravityY: 0, velocityIterations: 4 },
      ragdolls: [
        {
          id: "attacker",
          rootBoneId: "hand",
          bodies: [{ boneId: "hand", body: { shape: { kind: "sphere", radius: .04 }, mass: 2, collisionLayer: 1, collisionMask: 2 } }],
          joints: [],
          initialPose: { rotations: [] },
        },
        {
          id: "target",
          rootBoneId: "chest",
          bodies: [{ boneId: "chest", body: { shape: { kind: "sphere", radius: .06 }, x: .125, mass: 8, collisionLayer: 2, collisionMask: 1 } }],
          joints: [],
          initialPose: { rotations: [] },
        },
      ],
      cues: [{
        id: "fast-punch",
        kind: "launch",
        frame: 0,
        attacker: { ragdollId: "attacker", boneId: "hand" },
        target: { ragdollId: "target", boneId: "chest" },
        targeting: "target-at-launch",
        speedMetersPerSecond: 30,
        targetTravelPaddingMeters: .2,
        targetModeOnContact: "passive",
      }],
    };

    const compiled = compilePhysicalPerformance3D({ performance: source });
    const replay = compilePhysicalPerformance3D({ performance: source });
    expect(compiled.contacts).toHaveLength(1);
    expect(compiled.contacts[0]).toMatchObject({ cueId: "fast-punch", frame: 0, target: { ragdollId: "target", boneId: "chest" } });
    expect(compiled.contacts[0]!.subframe).toBeGreaterThan(0);
    expect(compiled.contacts[0]!.subframe).toBeLessThan(1);
    expect(compiled.diagnostics).toEqual([]);
    expect(replay.states).toEqual(compiled.states);
    expect(replay.contacts).toEqual(compiled.contacts);
    const targetOffset = PHYSICAL_BODY_STATE_STRIDE_3D;
    expect(compiled.states[targetOffset + 7]).toBeGreaterThan(0);
  });

  test("keeps a fast rotating physical tool from tunneling between performance substeps", () => {
    const halfAngle = -Math.PI / 8;
    const source: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 8, world: { gravityY: 0, velocityIterations: 6 },
      ragdolls: [
        { id: "attacker", rootBoneId: "tool", bodies: [{ boneId: "tool", body: { shape: { kind: "box", halfX: 2, halfY: .04, halfZ: .04 }, rotation: [0, 0, Math.sin(halfAngle), Math.cos(halfAngle)], angularDamping: 0, mass: 3, collisionLayer: 1, collisionMask: 2 } }], joints: [], initialPose: { rotations: [] } },
        { id: "target", rootBoneId: "chest", bodies: [{ boneId: "chest", body: { shape: { kind: "box", halfX: .04, halfY: .12, halfZ: .12 }, x: 1.92, mass: 8, collisionLayer: 2, collisionMask: 1 } }], joints: [], initialPose: { rotations: [] } },
      ],
      cues: [{ id: "spinning-strike", kind: "launch", frame: 0, attacker: { ragdollId: "attacker", boneId: "tool" }, target: { ragdollId: "target", boneId: "chest" }, targeting: "authored", direction: [1, 0, 0], speedMetersPerSecond: .01, distanceMeters: 3, angularVelocityDegreesPerSecond: [0, 0, 720], targetModeOnContact: "passive" }],
      outputs: [{ ragdollId: "attacker", boneId: "tool" }, { ragdollId: "target", boneId: "chest" }],
    };
    const direct = compilePhysicalPerformance3D({ performance: source });
    const compiler = createPhysicalPerformanceCompiler3D({ performance: source, checkpointIntervalFrames: 1 }); compiler.ensureComplete();
    const resumed = createPhysicalPerformanceCompiler3D({ performance: source, resumeFrom: compiler.resumePointBefore(3) }); resumed.ensureComplete();
    expect(direct.contacts).toHaveLength(1);
    expect(direct.contacts[0]).toMatchObject({ cueId: "spinning-strike", target: { ragdollId: "target", boneId: "chest" }, breakthrough: false });
    expect(direct.contacts[0]!.closingSpeedMetersPerSecond).toBeGreaterThan(1);
    expect(compiler.states).toEqual(direct.states);
    expect(resumed.states).toEqual(direct.states);
    expect(resumed.contacts).toEqual(direct.contacts);
  });

  test("captures, preserves, releases, and checkpoints an exact-contact physical bind", () => {
    const source: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 12, world: { gravityY: 0, constraintIterations: 12 },
      bodies: [{ id: "tool", shape: { kind: "box", halfX: .15, halfY: .05, halfZ: .05 }, x: -1, mass: 2, collisionLayer: 1, collisionMask: 2 }],
      ragdolls: [{ id: "fighter", rootBoneId: "hand", bodies: [{ boneId: "hand", body: { shape: { kind: "box", halfX: .15, halfY: .15, halfZ: .15 }, mass: 6, collisionLayer: 2, collisionMask: 1 } }], joints: [], initialPose: { rotations: [] } }],
      cues: [
        { id: "catch", kind: "launch", frame: 0, attacker: { ragdollId: "fighter", boneId: "hand" }, target: { bodyId: "tool" }, targeting: "authored", direction: [-1, 0, 0], speedMetersPerSecond: 12, distanceMeters: 2, actuation: "external" },
        { id: "hold-tool", kind: "bind", frame: 0, durationFrames: 4, a: { ragdollId: "fighter", boneId: "hand" }, b: { bodyId: "tool" }, anchorMode: "contact", afterContact: { cueId: "catch", offsetFrames: 0 }, rotationMode: "preserve", stiffness: .9, damping: .9, maxImpulse: 30, maxTorqueImpulse: 8 },
      ],
      outputs: [{ ragdollId: "fighter", boneId: "hand" }, { bodyId: "tool" }],
    };
    const direct = compilePhysicalPerformance3D({ performance: source });
    const compiler = createPhysicalPerformanceCompiler3D({ performance: source, checkpointIntervalFrames: 1 }); compiler.ensureComplete();
    const resumed = createPhysicalPerformanceCompiler3D({ performance: source, resumeFrom: compiler.resumePointBefore(3) }); resumed.ensureComplete();
    expect(direct.contacts).toHaveLength(1);
    expect(direct.binds).toEqual([
      expect.objectContaining({ cueId: "hold-tool", state: "bound", frame: direct.contacts[0]!.frame, simulationTick: direct.contacts[0]!.simulationTick }),
      expect.objectContaining({ cueId: "hold-tool", state: "released" }),
    ]);
    expect(direct.binds[1]!.simulationTick - direct.binds[0]!.simulationTick).toBe(16);
    expect(compiler.states).toEqual(direct.states); expect(compiler.binds).toEqual(direct.binds);
    expect(resumed.states).toEqual(direct.states); expect(resumed.binds).toEqual(direct.binds);
  });

  test("holds one prop from two independently solved hand contacts without replay drift", () => {
    const source: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 12, world: { gravityY: 0, constraintIterations: 16 },
      bodies: [{ id: "staff", shape: { kind: "box", halfX: .2, halfY: .06, halfZ: .06 }, mass: 8, collisionLayer: 2, collisionMask: 1 }],
      ragdolls: [
        { id: "left-grip", rootBoneId: "hand", bodies: [{ boneId: "hand", body: { shape: { kind: "sphere", radius: .12 }, x: -1, mass: 2, collisionLayer: 1, collisionMask: 2 } }], joints: [], initialPose: { rotations: [] } },
        { id: "right-grip", rootBoneId: "hand", bodies: [{ boneId: "hand", body: { shape: { kind: "sphere", radius: .12 }, x: 1, mass: 2, collisionLayer: 1, collisionMask: 2 } }], joints: [], initialPose: { rotations: [] } },
      ],
      cues: [
        { id: "left-contact", kind: "launch", frame: 0, attacker: { ragdollId: "left-grip", boneId: "hand" }, target: { bodyId: "staff" }, targeting: "authored", direction: [1, 0, 0], speedMetersPerSecond: 10, distanceMeters: 2, actuation: "external" },
        { id: "right-contact", kind: "launch", frame: 0, attacker: { ragdollId: "right-grip", boneId: "hand" }, target: { bodyId: "staff" }, targeting: "authored", direction: [-1, 0, 0], speedMetersPerSecond: 10, distanceMeters: 2, actuation: "external" },
        { id: "two-hand-primary", kind: "bind", frame: 0, durationFrames: 5, a: { ragdollId: "left-grip", boneId: "hand" }, b: { bodyId: "staff" }, anchorMode: "contact", afterContact: { cueId: "left-contact", offsetFrames: 0 }, rotationMode: "preserve" },
        { id: "two-hand-secondary", kind: "bind", frame: 0, durationFrames: 5, a: { ragdollId: "right-grip", boneId: "hand" }, b: { bodyId: "staff" }, anchorMode: "contact", afterContact: { cueId: "right-contact", offsetFrames: 0 }, rotationMode: "pivot" },
      ],
      outputs: [{ ragdollId: "left-grip", boneId: "hand" }, { ragdollId: "right-grip", boneId: "hand" }, { bodyId: "staff" }],
    };
    const direct = compilePhysicalPerformance3D({ performance: source });
    const compiler = createPhysicalPerformanceCompiler3D({ performance: source, checkpointIntervalFrames: 1 }); compiler.ensureComplete();
    const resumed = createPhysicalPerformanceCompiler3D({ performance: source, resumeFrom: compiler.resumePointBefore(4) }); resumed.ensureComplete();
    expect(direct.contacts.map((event) => event.cueId).sort()).toEqual(["left-contact", "right-contact"]);
    expect(direct.binds.filter((event) => event.state === "bound").map((event) => event.cueId).sort()).toEqual(["two-hand-primary", "two-hand-secondary"]);
    expect(direct.binds.filter((event) => event.state === "released")).toHaveLength(2);
    expect(compiler.states).toEqual(direct.states); expect(compiler.binds).toEqual(direct.binds);
    expect(resumed.states).toEqual(direct.states); expect(resumed.binds).toEqual(direct.binds);
  });

  test("breaks an overstressed authored physical bind instead of teleporting its bodies together", () => {
    const source: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 4, world: { gravityY: 0, constraintIterations: 8 },
      bodies: [
        { id: "hand", shape: { kind: "sphere", radius: .1 }, mass: 2 },
        { id: "prop", shape: { kind: "box", halfX: .1, halfY: .1, halfZ: .1 }, x: 1, mass: 4 },
      ],
      ragdolls: [],
      cues: [{ id: "weak-grip", kind: "bind", frame: 0, durationFrames: 3, a: { bodyId: "hand" }, b: { bodyId: "prop" }, anchorMode: "authored", rotationMode: "pivot", stiffness: 1, breakImpulse: .01 }],
    };
    const compiled = compilePhysicalPerformance3D({ performance: source });
    expect(compiled.binds).toEqual([
      expect.objectContaining({ cueId: "weak-grip", state: "bound", frame: 0 }),
      expect.objectContaining({ cueId: "weak-grip", state: "broken", frame: 0 }),
    ]);
    expect(compiled.diagnostics).toContainEqual(expect.objectContaining({ code: "bind-broke", cueId: "weak-grip", pointer: "/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/0/breakImpulse" }));
    expect(compiled.states[0]).toBeGreaterThan(-.1);
    expect(compiled.states[PHYSICAL_BODY_STATE_STRIDE_3D]).toBeLessThan(1.1);
  });

  test("aims at the actual target body and derives travel from collider surfaces", () => {
    const source = performance(2), launch = requireLaunch(source.cues[0]);
    launch.targeting = "target-at-launch"; delete launch.direction; delete launch.distanceMeters; launch.targetTravelPaddingMeters = .2;
    const first = compilePhysicalPerformance3D({ performance: source }), second = compilePhysicalPerformance3D({ performance: source });
    expect(first.contacts).toHaveLength(1); expect(first.contacts).toEqual(second.contacts); expect(first.states).toEqual(second.states); expect(first.diagnostics).toEqual([]);

    const resolved = resolvePhysicalLaunchTarget3D({
      attacker: { shape: { kind: "sphere", radius: .2 }, position: [0, 0, 0] },
      target: { shape: { kind: "box", halfX: .25, halfY: .5, halfZ: .2 }, position: [2, 0, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] },
      travelPaddingMeters: .2,
    });
    expect(resolved.direction).toEqual([1, 0, 0]); expect(resolved.surfaceGapMeters).toBeCloseTo(1.3); expect(resolved.travelLimitMeters).toBeCloseTo(1.5);
  });

  test("rejects target-at-launch without a target or separable body centers", () => {
    const missing = performance(), missingLaunch = requireLaunch(missing.cues[0]);
    missingLaunch.targeting = "target-at-launch"; delete missingLaunch.target; delete missingLaunch.direction; delete missingLaunch.distanceMeters;
    expect(() => compilePhysicalPerformance3D({ performance: missing })).toThrow("target-at-launch needs a target body reference");
    expect(() => resolvePhysicalLaunchTarget3D({ attacker: { shape: { kind: "sphere", radius: .2 }, position: [0, 0, 0] }, target: { shape: { kind: "sphere", radius: .2 }, position: [0, 0, 0] } })).toThrow("coincident body centers");
  });

  test("rejects a simulated collision outside its authored contact window", () => {
    const baseline = performance(), actualFrame = compilePhysicalPerformance3D({ performance: baseline }).contacts[0]!.frame;
    const synchronized = structuredClone(baseline), synchronizedLaunch = requireLaunch(synchronized.cues[0]);
    synchronizedLaunch.expectedContactFrame = actualFrame; synchronizedLaunch.contactToleranceFrames = 0;
    expect(compilePhysicalPerformance3D({ performance: synchronized }).diagnostics).toEqual([]);

    const mistimed = structuredClone(synchronized), mistimedLaunch = requireLaunch(mistimed.cues[0]);
    mistimedLaunch.expectedContactFrame = actualFrame + 3;
    expect(compilePhysicalPerformance3D({ performance: mistimed }).diagnostics).toContainEqual(expect.objectContaining({ code: "contact-timing-mismatch", cueId: "first-punch", frame: actualFrame, pointer: "/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/0/expectedContactFrame" }));
  });

  test("anchors consequence and recovery authority to the exact solved contact across checkpoints", () => {
    const source = performance(), launch = source.cues[0]; if (launch?.kind !== "launch") throw new Error("launch fixture is missing");
    launch.targetModeOnContact = "passive";
    source.cues = [...source.cues, { id: "return-after-consequence", kind: "mode", frame: 1, ragdollId: "lumberjack", mode: "animated", discontinuous: true, afterContact: { cueId: launch.id, offsetFrames: 2 } }];
    const runtime = createPhysicalPerformanceRuntime3D({ performance: source });
    while (!runtime.contacts.length) runtime.stepFrame();
    const contactFrame = runtime.contacts[0]!.frame;
    expect(runtime.frame).toBe(contactFrame); expect(runtime.ragdolls.status("lumberjack").mode).toBe("passive");
    runtime.stepFrame(); expect(runtime.frame).toBe(contactFrame + 1); expect(runtime.ragdolls.status("lumberjack").mode).toBe("passive");
    const checkpoint = runtime.checkpoint(); runtime.stepFrame();
    const expectedState = new Float32Array(runtime.bodyReferences.length * PHYSICAL_BODY_STATE_STRIDE_3D); runtime.writeState(expectedState);
    expect(runtime.ragdolls.status("lumberjack").mode).toBe("animated");
    runtime.restoreCheckpoint(checkpoint); runtime.stepFrame();
    const restoredState = new Float32Array(expectedState.length); runtime.writeState(restoredState);
    expect(restoredState).toEqual(expectedState); expect(runtime.ragdolls.status("lumberjack").mode).toBe("animated");

    const compiled = compilePhysicalPerformance3D({ performance: source }), sampled = new Float32Array(compiled.frameStride);
    compiled.writeFrame(contactFrame + 2, sampled); expect(sampled).toEqual(expectedState);
  });

  test("preflights contact anchors and diagnoses an actual contact that resolves too late", () => {
    const missing = performance(); missing.cues = [...missing.cues, { id: "bad-anchor", kind: "mode", frame: 4, ragdollId: "primal", mode: "animated", afterContact: { cueId: "missing-launch", offsetFrames: 2 } }];
    expect(() => compilePhysicalPerformance3D({ performance: missing })).toThrow("Project pointer: /extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/1/afterContact/cueId");
    const late = performance(); late.cues = [...late.cues, { id: "too-late", kind: "mode", frame: 28, ragdollId: "primal", mode: "animated", afterContact: { cueId: "first-punch", offsetFrames: 28 } }];
    expect(compilePhysicalPerformance3D({ performance: late }).diagnostics).toContainEqual(expect.objectContaining({ code: "contact-anchor-out-of-range", cueId: "too-late", pointer: "/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/1/afterContact/offsetFrames" }));
  });

  test("matches arbitrary compiled frames to sequential gameplay stepping exactly", () => {
    const source = performance();
    const compiled = compilePhysicalPerformance3D({ performance: source });
    const runtime = createPhysicalPerformanceRuntime3D({ performance: source });
    const expected = new Float32Array(compiled.frameStride);
    const sampled = new Float32Array(compiled.frameStride);

    for (let frame = 0; frame < source.durationFrames; frame += 1) {
      runtime.stepFrame();
      runtime.writeState(expected);
      compiled.writeFrame(frame, sampled);
      expect(sampled).toEqual(expected);
    }
  });

  test("compiles only the causal prefix for quick arbitrary-frame confirmation", () => {
    const source = performance(), sampledFrames: number[] = [];
    const incremental = createPhysicalPerformanceCompiler3D({ performance: source, poseProvider({ frame }) { sampledFrames.push(frame); return { rotations: [] }; } });
    expect(incremental.compiledThroughFrame).toBe(-1);
    incremental.ensureFrame(4);
    expect(incremental.compiledThroughFrame).toBe(4);
    expect(sampledFrames).toHaveLength(5 * source.ragdolls.length);

    const frame = new Float32Array(incremental.frameStride);
    incremental.writeFrame(17, frame);
    expect(incremental.compiledThroughFrame).toBe(17);
    expect(sampledFrames).toHaveLength(18 * source.ragdolls.length);
    const full = compilePhysicalPerformance3D({ performance: source });
    expect(frame).toEqual(full.states.slice(17 * full.frameStride, 18 * full.frameStride));

    incremental.writeFrame(2, frame);
    expect(incremental.compiledThroughFrame).toBe(17);
    incremental.ensureComplete();
    expect(incremental.compiledThroughFrame).toBe(source.durationFrames - 1);
    expect(incremental.states).toEqual(full.states);
    expect(incremental.contacts).toEqual(full.contacts);
    expect(incremental.diagnostics).toEqual(full.diagnostics);
  });

  test("advances a long compile in bounded host-sized chunks without changing results", () => {
    const source = performance();
    const incremental = createPhysicalPerformanceCompiler3D({ performance: source });
    const progress: number[] = [];
    while (true) {
      const state = incremental.advance({ throughFrame: 17, maximumFrames: 3 });
      progress.push(state.progress);
      expect(state.compiledThroughFrame).toBeLessThanOrEqual(17);
      if (state.done) {
        expect(state).toEqual({ compiledThroughFrame: 17, targetFrame: 17, completedFrames: 18, totalFrames: 18, progress: 1, done: true });
        break;
      }
    }
    expect(progress).toEqual([0.16666666666666666, 0.3333333333333333, 0.5, 0.6666666666666666, 0.8333333333333334, 1]);
    const full = compilePhysicalPerformance3D({ performance: source });
    expect(incremental.states.slice(0, 18 * incremental.frameStride)).toEqual(full.states.slice(0, 18 * full.frameStride));
    expect(() => incremental.advance({ maximumFrames: 0 })).toThrow("maximumFrames");
  });

  test("resumes a changed late cue from the nearest earlier checkpoint without resampling the prefix", () => {
    const original = performance(), originalSamples: number[] = [];
    const prior = createPhysicalPerformanceCompiler3D({ performance: original, checkpointIntervalFrames: 5, poseProvider({ frame }) { originalSamples.push(frame); return { rotations: [] }; } });
    prior.ensureFrame(24); expect(originalSamples).toHaveLength(25 * original.ragdolls.length);
    const changed = structuredClone(original);
    changed.cues = [...changed.cues, { id: "late-reversal", kind: "launch", frame: 20, attacker: { ragdollId: "primal", boneId: "fist" }, direction: [-1, 0, 0], speedMetersPerSecond: 3, distanceMeters: 1 }];
    const resume = prior.resumePointBefore(20); expect(resume.checkpoint.frame).toBe(19);
    const resumedSamples: number[] = [];
    const resumed = createPhysicalPerformanceCompiler3D({ performance: changed, checkpointIntervalFrames: 5, resumeFrom: resume, poseProvider({ frame }) { resumedSamples.push(frame); return { rotations: [] }; } });
    resumed.ensureComplete();
    const full = compilePhysicalPerformance3D({ performance: changed, poseProvider() { return { rotations: [] }; } });
    expect(resumed.resumedFromFrame).toBe(19); expect(resumedSamples).toHaveLength(10 * changed.ragdolls.length);
    expect(resumed.states).toEqual(full.states); expect(resumed.contacts).toEqual(full.contacts); expect(resumed.breaks).toEqual(full.breaks); expect(resumed.diagnostics).toEqual(full.diagnostics);
    expect(resumed.resumePointBefore(3).checkpoint.frame).toBe(-1);
  });

  test("restores active launches, plants, recoveries, controllers, and quality history for exact continuation", () => {
    const pendingRecovery: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 24, world: { gravityY: 0 },
      ragdolls: [{ id: "fighter", rootBoneId: "hips", settleDurationSeconds: .2, bodies: [{ boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, mass: 4, collisionLayer: 1, collisionMask: 0 } }], joints: [], initialPose: { rotations: [] } }],
      cues: [{ id: "fall", kind: "mode", frame: 0, ragdollId: "fighter", mode: "passive", discontinuous: true }, { id: "rise", kind: "recovery", frame: 0, ragdollId: "fighter", startCondition: "after-settled", maximumWaitFrames: 12, target: { rootPosition: [0, 0, 0], rootRotation: [0, 0, 0, 1], durationSeconds: .2 } }],
    };
    const fixtures = [{ source: performance(), checkpointFrame: 0 }, { source: supportedStance(), checkpointFrame: 4 }, { source: supportedRecovery(true), checkpointFrame: 2 }, { source: pendingRecovery, checkpointFrame: 1 }];
    for (const fixture of fixtures) {
      const runtime = createPhysicalPerformanceRuntime3D({ performance: fixture.source });
      while (runtime.frame < fixture.checkpointFrame) runtime.stepFrame();
      const checkpoint = runtime.checkpoint();
      const continueToEnd = () => {
        while (runtime.frame < fixture.source.durationFrames - 1) runtime.stepFrame();
        const state = new Float32Array(runtime.bodyReferences.length * PHYSICAL_BODY_STATE_STRIDE_3D); runtime.writeState(state);
        return { state, contacts: structuredClone(runtime.contacts), breaks: structuredClone(runtime.breaks), diagnostics: structuredClone(runtime.diagnostics), constraints: runtime.world.constraintCount(), ragdolls: fixture.source.ragdolls.map((item) => runtime.ragdolls.status(item.id)) };
      };
      const expected = continueToEnd();
      runtime.restoreCheckpoint(checkpoint);
      expect(runtime.frame).toBe(fixture.checkpointFrame);
      expect(continueToEnd()).toEqual(expected);
    }
  });

  test("compiles planted support windows identically for scrub and sequential playback", () => {
    const source = supportedStance(), compiled = compilePhysicalPerformance3D({ performance: source }), runtime = createPhysicalPerformanceRuntime3D({ performance: source });
    const sequential = new Float32Array(compiled.frameStride), sampled = new Float32Array(compiled.frameStride);
    for (let frame = 0; frame < source.durationFrames; frame += 1) { runtime.stepFrame(); runtime.writeState(sequential); compiled.writeFrame(frame, sampled); expect(sampled).toEqual(sequential); }
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.states[1]).toBeCloseTo(.15, 3);
  });

  test("compiles a predictive capture step identically for scrub, sequential playback, and checkpoint replay", () => {
    const source = captureStepPerformance(), first = compilePhysicalPerformance3D({ performance: source }), second = compilePhysicalPerformance3D({ performance: source });
    expect(first.states).toEqual(second.states); expect(first.diagnostics).toEqual([]);
    const mid = new Float32Array(first.frameStride), final = new Float32Array(first.frameStride); first.writeFrame(5, mid); first.writeFrame(14, final);
    expect(mid[1]).toBeGreaterThan(.11); expect(final[0]).toBeGreaterThan(.7); expect(final[1]).toBeCloseTo(.1, 1);

    const runtime = createPhysicalPerformanceRuntime3D({ performance: source });
    for (let frame = 0; frame <= 5; frame += 1) runtime.stepFrame();
    const checkpoint = runtime.checkpoint();
    for (let frame = 6; frame <= 14; frame += 1) runtime.stepFrame();
    const expected = new Float32Array(first.frameStride); runtime.writeState(expected);
    runtime.restoreCheckpoint(checkpoint);
    for (let frame = 6; frame <= 14; frame += 1) runtime.stepFrame();
    const replayed = new Float32Array(first.frameStride); runtime.writeState(replayed);
    expect(replayed).toEqual(expected); expect(replayed).toEqual(final);
  });

  test("turns grounded jump intent into one deterministic whole-body ballistic takeoff", () => {
    const source = groundedJumpPerformance(), first = compilePhysicalPerformance3D({ performance: source }), second = compilePhysicalPerformance3D({ performance: source });
    expect(first.states).toEqual(second.states); expect(first.characterStateEvents).toEqual(second.characterStateEvents); expect(first.diagnostics).toEqual([]);
    expect(first.characterStateEvents).toContainEqual(expect.objectContaining({ ragdollId: "fighter", locomotion: "grounded", authority: "ready" }));
    expect(first.characterStateEvents).toContainEqual(expect.objectContaining({ ragdollId: "fighter", locomotion: "airborne", authority: "ready" }));
    expect(first.characterStateEvents).toContainEqual(expect.objectContaining({ ragdollId: "fighter", locomotion: "landing", authority: "ready", landing: expect.objectContaining({ surfaceBodyId: "ground", impactSpeedMetersPerSecond: expect.any(Number), impactEnergyJoules: expect.any(Number), normalImpulseNewtonSeconds: expect.any(Number), severity: expect.any(Number), progress: 0 }) }));
    const before = new Float32Array(first.frameStride), airborne = new Float32Array(first.frameStride); first.writeFrame(0, before); first.writeFrame(8, airborne);
    expect(airborne[0]).toBeGreaterThan(before[0] + .4); expect(airborne[1]).toBeGreaterThan(before[1] + .5);
    const runtime = createPhysicalPerformanceRuntime3D({ performance: source }), sequential = new Float32Array(first.frameStride);
    for (let frame = 0; frame <= 8; frame += 1) runtime.stepFrame(); runtime.writeState(sequential); expect(sequential).toEqual(airborne);
  });

  test("rejects a second takeoff while airborne and reports unsupported ground at the cue pointer", () => {
    const source = groundedJumpPerformance(), jump = source.cues[0]; if (jump?.kind !== "jump") throw new Error("jump fixture is missing");
    source.cues = [jump, { ...jump, id: "air-jump", frame: 2 }];
    expect(compilePhysicalPerformance3D({ performance: source }).diagnostics).toContainEqual(expect.objectContaining({ code: "jump-unsupported", cueId: "air-jump", frame: 2, pointer: "/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/1/supportBoneIds" }));
    const invalid = groundedJumpPerformance(), invalidJump = invalid.cues[0]; if (invalidJump?.kind !== "jump") throw new Error("jump fixture is missing");
    invalid.cues = [{ ...invalidJump, supportBoneIds: ["missing-foot"] }];
    expect(() => createPhysicalPerformanceRuntime3D({ performance: invalid })).toThrow("/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/0");
  });

  test("blocks unmodeled midair propulsion unless the authored external force explicitly opts in", () => {
    const blocked = groundedJumpPerformance(); blocked.cues = [...blocked.cues, { id: "air-dash", kind: "launch", frame: 2, attacker: { ragdollId: "fighter", boneId: "hips" }, direction: [1, 0, 0], speedMetersPerSecond: 8, distanceMeters: 1, actuation: "external" }];
    expect(compilePhysicalPerformance3D({ performance: blocked }).diagnostics).toContainEqual(expect.objectContaining({ code: "airborne-external-actuation", cueId: "air-dash", frame: 2, pointer: "/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/1/allowAirborneExternalActuation" }));
    const allowed = structuredClone(blocked), launch = allowed.cues[1]; if (launch?.kind !== "launch") throw new Error("launch fixture is missing"); launch.allowAirborneExternalActuation = true;
    const runtime = createPhysicalPerformanceRuntime3D({ performance: allowed }); for (let frame = 0; frame <= 2; frame += 1) runtime.stepFrame();
    expect(runtime.diagnostics).not.toContainEqual(expect.objectContaining({ code: "airborne-external-actuation" }));
    expect(runtime.characterState("fighter")).toEqual({ locomotion: "airborne", authority: "acting" });
  });

  test("blocks new physical actions while downed unless an expert authority override is explicit", () => {
    const blocked = jointDrivePerformance(), drive = blocked.cues[0]; if (drive?.kind !== "joint-drive") throw new Error("joint drive fixture is missing");
    blocked.cues = [{ id: "downed", kind: "mode", frame: 0, ragdollId: "fighter", mode: "passive", discontinuous: true }, drive];
    const blockedResult = compilePhysicalPerformance3D({ performance: blocked });
    expect(blockedResult.diagnostics).toContainEqual(expect.objectContaining({ code: "action-authority-conflict", cueId: "strike-arc", frame: 2, pointer: "/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/1/allowAuthorityOverride", message: expect.stringContaining("cannot start while fighter is downed") }));
    const allowed = structuredClone(blocked), allowedDrive = allowed.cues[1]; if (allowedDrive?.kind !== "joint-drive") throw new Error("joint drive fixture is missing"); allowedDrive.allowAuthorityOverride = true;
    const allowedResult = compilePhysicalPerformance3D({ performance: allowed });
    expect(allowedResult.diagnostics).not.toContainEqual(expect.objectContaining({ code: "action-authority-conflict" }));
    expect(allowedResult.states).not.toEqual(blockedResult.states);
    const invalid = structuredClone(allowed), invalidDrive = invalid.cues[1]; if (invalidDrive?.kind !== "joint-drive") throw new Error("joint drive fixture is missing"); Reflect.set(invalidDrive, "allowAuthorityOverride", "yes");
    expect(() => createPhysicalPerformanceRuntime3D({ performance: invalid })).toThrow("/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/1/allowAuthorityOverride");
  });

  test("interrupts an active articulated drive on knockdown and checkpoints the cancellation", () => {
    const source = effectorDrivePerformance(); source.cues = [...source.cues, { id: "knocked-down", kind: "mode", frame: 6, ragdollId: "fighter", mode: "passive", discontinuous: true }];
    const first = compilePhysicalPerformance3D({ performance: source }), second = compilePhysicalPerformance3D({ performance: source });
    expect(first.states).toEqual(second.states); expect(first.diagnostics).toEqual(second.diagnostics);
    expect(first.diagnostics).toContainEqual(expect.objectContaining({ code: "action-authority-conflict", cueId: "hand-path", frame: 6, pointer: "/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/0/allowAuthorityOverride", message: expect.stringContaining("was interrupted while fighter is downed") }));
    const runtime = createPhysicalPerformanceRuntime3D({ performance: source }); for (let frame = 0; frame <= 6; frame += 1) runtime.stepFrame(); const checkpoint = runtime.checkpoint();
    expect(checkpoint.blockedActionCueIds).toEqual(["hand-path"]); for (let frame = 7; frame <= 12; frame += 1) runtime.stepFrame(); const expected = new Float32Array(first.frameStride); runtime.writeState(expected);
    runtime.restoreCheckpoint(checkpoint); for (let frame = 7; frame <= 12; frame += 1) runtime.stepFrame(); const replayed = new Float32Array(first.frameStride); runtime.writeState(replayed); expect(replayed).toEqual(expected);
  });

  test("diagnoses support misses and rejects overlapping windows before delivery", () => {
    const missed = compilePhysicalPerformance3D({ performance: supportedStance(8) });
    expect(missed.diagnostics).toEqual([expect.objectContaining({ code: "support-missed", cueId: "front-foot-plant", frame: 0 })]);
    const overlap = supportedStance(), cue = overlap.cues[0]!; if (cue.kind !== "support") throw new Error("support fixture is missing");
    overlap.cues = [cue, { ...cue, id: "duplicate-plant", frame: 4 }];
    expect(() => createPhysicalPerformanceRuntime3D({ performance: overlap })).toThrow("overlaps");
    const missedStep = captureStepPerformance(), step = missedStep.cues[2]; if (step?.kind !== "step") throw new Error("step fixture is missing");
    missedStep.cues = [missedStep.cues[0]!, missedStep.cues[1]!, { ...step, groundLayerMask: 8 }];
    expect(compilePhysicalPerformance3D({ performance: missedStep }).diagnostics).toContainEqual(expect.objectContaining({ code: "step-missed", cueId: "lead-step", frame: 1 }));
    const missingBone = captureStepPerformance(), invalid = missingBone.cues[2]; if (invalid?.kind !== "step") throw new Error("step fixture is missing");
    missingBone.cues = [missingBone.cues[0]!, missingBone.cues[1]!, { ...invalid, boneId: "missing-foot" }];
    expect(() => createPhysicalPerformanceRuntime3D({ performance: missingBone })).toThrow("/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/2");
  });

  test("uses canonical animation poses as deterministic motor targets before authored cues", () => {
    const source = performance();
    source.cues = [];
    const samples: number[] = [];
    const compiled = compilePhysicalPerformance3D({
      performance: source,
      poseProvider({ frame, ragdollId }) {
        samples.push(frame);
        return ragdollId === "primal" ? { rotations: [] } : { rotations: [] };
      },
    });
    expect(samples).toHaveLength(source.durationFrames * source.ragdolls.length);
    expect(compiled.states.every(Number.isFinite)).toBe(true);
  });

  test("blends portable authority changes unless an explicit discontinuity is authored", () => {
    const smooth = performance(); smooth.cues = [{ id: "active", kind: "mode", frame: 0, ragdollId: "primal", mode: "active", durationSeconds: .2 }];
    const hard = structuredClone(smooth); hard.cues = [{ id: "active", kind: "mode", frame: 0, ragdollId: "primal", mode: "active", durationSeconds: .2, discontinuous: true }];
    const smoothRuntime = createPhysicalPerformanceRuntime3D({ performance: smooth }), hardRuntime = createPhysicalPerformanceRuntime3D({ performance: hard });
    smoothRuntime.stepFrame(); hardRuntime.stepFrame();
    expect(smoothRuntime.ragdolls.status("primal").motorWeight).toBeGreaterThan(hardRuntime.ragdolls.status("primal").motorWeight);
    expect(hardRuntime.ragdolls.status("primal").motorWeight).toBeCloseTo(.45, 8);
  });

  test("recovers toward the canonical animation pose without duplicating pose samples in the cue", () => {
    const source = performance(); source.cues = [{ id: "return-to-idle", kind: "recovery", frame: 4, ragdollId: "lumberjack", target: { rootPosition: [1, 0, 0], rootRotation: [0, 0, 0, 1], durationSeconds: 0.6 } }];
    const sampledFrames: number[] = [];
    const compiled = compilePhysicalPerformance3D({ performance: source, poseProvider({ frame }) { sampledFrames.push(frame); return { rotations: [] }; } });
    expect(sampledFrames).toContain(4); expect(compiled.states.every(Number.isFinite)).toBe(true);
    expect(source.cues[0]).not.toHaveProperty("target.pose");
  });

  test("selects and checkpoints a posture-compatible named get-up clip from settled physics", () => {
    const clips = { upright: "stand", "face-up": "rise-back", "face-down": "rise-front", "left-side": "rise-left", "right-side": "rise-right" } as const;
    const source: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 30, world: { gravityY: 0 },
      ragdolls: [{ id: "fighter", rootBoneId: "chest", bodies: [{ boneId: "chest", body: { shape: { kind: "box", halfX: .25, halfY: .5, halfZ: .2 }, rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2], mass: 8, collisionLayer: 1, collisionMask: 0 } }], joints: [], initialPose: { rotations: [] } }],
      cues: [{ id: "choose-rise", kind: "recovery", frame: 0, ragdollId: "fighter", startCondition: "at-frame", getUp: { postureBoneId: "chest", clips, speed: 1.25 }, target: { positionMode: "settled", rootRotation: [0, 0, 0, 1], durationSeconds: .5 } }],
    };
    const requests: Array<{ frame: number; clipId?: string; timeSeconds?: number }> = [];
    const runtime = createPhysicalPerformanceRuntime3D({ performance: source, poseProvider(sample) { requests.push({ frame: sample.frame, clipId: sample.performance?.clipId, timeSeconds: sample.performance?.timeSeconds }); return { rotations: [] }; } });
    runtime.stepFrame();
    expect(requests).toContainEqual({ frame: 0, clipId: "rise-back", timeSeconds: 0 });
    expect(runtime.checkpoint().activeRecoveries).toContainEqual(expect.objectContaining({ cueId: "choose-rise", activationFrame: 0, selectedPosture: "face-up", selectedClipId: "rise-back" }));
    runtime.stepFrame();
    expect(requests.at(-1)).toEqual({ frame: 1, clipId: "rise-back", timeSeconds: 0.041666666666666664 });
    const checkpoint = runtime.checkpoint(); runtime.stepFrame(); const expected = runtime.checkpoint(); runtime.restoreCheckpoint(checkpoint); runtime.stepFrame(); expect(runtime.checkpoint()).toEqual(expected);

    const invalid = structuredClone(source), cue = invalid.cues[0]!; if (cue.kind !== "recovery" || !cue.getUp) throw new Error("get-up fixture missing"); Reflect.deleteProperty(cue.getUp.clips, "right-side");
    expect(() => createPhysicalPerformanceRuntime3D({ performance: invalid, poseProvider: () => ({ rotations: [] }) })).toThrow("right-side clip");
  });

  test("selects and checkpoints an environment-compatible get-up clip without moving the grounded root", () => {
    const source: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 24, world: { gravityY: 0 },
      bodies: [
        { id: "ground", type: "static", shape: { kind: "box", halfX: 3, halfY: .1, halfZ: 3 }, y: -.1, collisionLayer: 4, collisionMask: 2 },
        { id: "low-branch", type: "static", shape: { kind: "box", halfX: 1, halfY: .1, halfZ: 1 }, y: .75, collisionLayer: 4, collisionMask: 2 },
      ],
      ragdolls: [{ id: "fighter", rootBoneId: "chest", bodies: [{ boneId: "chest", body: { shape: { kind: "box", halfX: .3, halfY: .3, halfZ: .2 }, y: .3, mass: 8, collisionLayer: 2, collisionMask: 4 } }], joints: [], initialPose: { rotations: [] } }],
      cues: [{ id: "context-rise", kind: "recovery", frame: 0, ragdollId: "fighter", startCondition: "at-frame", getUp: { postureBoneId: "chest", clips: { upright: "stand", "face-up": "rise-back", "face-down": "rise-front", "left-side": "rise-left", "right-side": "rise-right" }, environment: { clips: { crouched: "rise-crouched" }, proximityMeters: .3, standingHeadroomMeters: .25, ledgeProbeDistance: .4, ledgeHeightTolerance: .08 } }, target: { positionMode: "authored", rootPosition: [0, .3, 0], rootRotation: [0, 0, 0, 1], durationSeconds: .4, groundLayerMask: 4 } }],
    };
    const requests: Array<{ frame: number; clipId?: string }> = [], runtime = createPhysicalPerformanceRuntime3D({ performance: source, poseProvider(sample) { requests.push({ frame: sample.frame, clipId: sample.performance?.clipId }); return { rotations: [] }; } });
    runtime.stepFrame();
    expect(requests).toContainEqual({ frame: 0, clipId: "rise-crouched" });
    expect(runtime.checkpoint().activeRecoveries).toContainEqual(expect.objectContaining({ cueId: "context-rise", selectedPosture: "upright", selectedEnvironment: "crouched", selectedClipId: "rise-crouched" }));
    expect(runtime.ragdolls.status("fighter").root.y).toBeGreaterThan(.29);
    const checkpoint = runtime.checkpoint(); runtime.stepFrame(); const expected = runtime.checkpoint(); runtime.restoreCheckpoint(checkpoint); runtime.stepFrame(); expect(runtime.checkpoint()).toEqual(expected);
    const poseProvider = () => ({ rotations: [] }), compiled = compilePhysicalPerformance3D({ performance: source, poseProvider }), replay = createPhysicalPerformanceRuntime3D({ performance: source, poseProvider }), sampled = new Float32Array(compiled.frameStride), sequential = new Float32Array(compiled.frameStride);
    for (let frame = 0; frame < source.durationFrames; frame += 1) { replay.stepFrame(); replay.writeState(sequential); compiled.writeFrame(frame, sampled); expect(sampled).toEqual(sequential); }

    const invalid = structuredClone(source), cue = invalid.cues[0]!; if (cue.kind !== "recovery" || !cue.getUp?.environment) throw new Error("environment get-up fixture missing");
    cue.getUp.environment.clips = {};
    expect(() => createPhysicalPerformanceRuntime3D({ performance: invalid, poseProvider: () => ({ rotations: [] }) })).toThrow("environment needs at least one");
  });

  test("recovers at the deterministic settled location without pulling the body back to its authored start", () => {
    const source: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 24, world: { gravityY: 0 },
      ragdolls: [{ id: "fighter", rootBoneId: "hips", bodies: [{ boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, x: 1, y: 1, z: 2, velocityX: 3, velocityY: -2, mass: 4, collisionLayer: 1, collisionMask: 0 } }], joints: [], initialPose: { rotations: [] } }],
      cues: [{ id: "rise-in-place", kind: "recovery", frame: 4, ragdollId: "fighter", target: { positionMode: "settled", rootRotation: [0, 0, 0, 1], durationSeconds: .2 } }],
      outputs: [{ ragdollId: "fighter", boneId: "hips" }],
    };
    const settled = compilePhysicalPerformance3D({ performance: source }), replay = createPhysicalPerformanceRuntime3D({ performance: source }), sequential = new Float32Array(settled.frameStride), sampled = new Float32Array(settled.frameStride);
    for (let frame = 0; frame < source.durationFrames; frame += 1) { replay.stepFrame(); replay.writeState(sequential); settled.writeFrame(frame, sampled); expect(sampled).toEqual(sequential); }
    const finalOffset = (source.durationFrames - 1) * settled.frameStride;
    expect(settled.states[finalOffset]).toBeGreaterThan(1.2);
    expect(Math.abs(settled.states[finalOffset + 1]! - 1)).toBeLessThan(.12);
    expect(settled.states[finalOffset + 2]).toBeCloseTo(2, 3);

    const authored = structuredClone(source), recovery = authored.cues[0]!; if (recovery.kind !== "recovery") throw new Error("recovery fixture is missing");
    recovery.target = { ...recovery.target, positionMode: "authored", rootPosition: [1, 1, 2] };
    const authoredResult = compilePhysicalPerformance3D({ performance: authored });
    expect(authoredResult.states[finalOffset]).toBeLessThan(1.1);
    expect(settled.states[finalOffset]! - authoredResult.states[finalOffset]!).toBeGreaterThan(.2);
    expect(() => compilePhysicalPerformance3D({ performance: { ...authored, cues: [{ ...recovery, target: { ...recovery.target, rootPosition: undefined } }] } })).toThrow("authored recovery needs rootPosition");
  });

  test("derives settled recovery height from the current physical terrain", () => {
    const source: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 40, world: { gravityY: -9.81 },
      bodies: [{ id: "rising-platform", type: "kinematic", shape: { kind: "box", halfX: 4, halfY: .1, halfZ: 4 }, y: -.1, velocityY: .1, collisionLayer: 4, collisionMask: 2 }, { id: "non-ground-trigger", type: "static", shape: { kind: "sphere", radius: .05 }, y: .35, trigger: true, collisionLayer: 4, collisionMask: 2 }],
      ragdolls: [{ id: "fighter", rootBoneId: "foot", bodies: [{ boneId: "foot", body: { shape: { kind: "sphere", radius: .15 }, y: .15, mass: 2, collisionLayer: 2, collisionMask: 4 } }], joints: [], initialPose: { rotations: [] } }],
      cues: [{ id: "terrain-rise", kind: "recovery", frame: 30, ragdollId: "fighter", target: { positionMode: "settled", rootRotation: [0, 0, 0, 1], durationSeconds: .2, requireStableSupport: true, supportBoneIds: ["foot"], groundLayerMask: 4, supportProbeDistance: .2 } }],
      outputs: [{ ragdollId: "fighter", boneId: "foot" }],
    };
    const runtime = createPhysicalPerformanceRuntime3D({ performance: source });
    while (runtime.frame < 30) runtime.stepFrame();
    const checkpoint = runtime.checkpoint(), resolvedY = checkpoint.ragdolls.ragdolls[0]!.recovery?.position[1];
    expect(resolvedY).toBeGreaterThan(.24); expect(resolvedY).toBeLessThan(.27);
    const finish = () => { while (runtime.frame < source.durationFrames - 1) runtime.stepFrame(); const state = new Float32Array(runtime.bodyReferences.length * PHYSICAL_BODY_STATE_STRIDE_3D); runtime.writeState(state); return { state, diagnostics: structuredClone(runtime.diagnostics), status: runtime.ragdolls.status("fighter") }; }, expected = finish();
    runtime.restoreCheckpoint(checkpoint); expect(finish()).toEqual(expected);

    const compiled = compilePhysicalPerformance3D({ performance: source }), replay = createPhysicalPerformanceRuntime3D({ performance: source }), sequential = new Float32Array(compiled.frameStride), sampled = new Float32Array(compiled.frameStride);
    for (let frame = 0; frame < source.durationFrames; frame += 1) { replay.stepFrame(); replay.writeState(sequential); compiled.writeFrame(frame, sampled); expect(sampled).toEqual(sequential); }
  });

  test("blocks settled recovery when physical terrain has moved out of reach", () => {
    const source: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 36, world: { gravityY: 0 },
      bodies: [{ id: "failed-platform", type: "kinematic", shape: { kind: "box", halfX: 4, halfY: .1, halfZ: 4 }, y: -.1, velocityY: -2, collisionLayer: 4, collisionMask: 2 }],
      ragdolls: [{ id: "fighter", rootBoneId: "foot", bodies: [{ boneId: "foot", body: { shape: { kind: "sphere", radius: .15 }, y: .15, gravityScale: 0, mass: 2, collisionLayer: 2, collisionMask: 4 } }], joints: [], initialPose: { rotations: [] } }],
      cues: [{ id: "missing-ground-rise", kind: "recovery", frame: 30, ragdollId: "fighter", target: { positionMode: "settled", rootRotation: [0, 0, 0, 1], durationSeconds: .2, requireStableSupport: true, supportBoneIds: ["foot"], groundLayerMask: 4, supportProbeDistance: .2 } }],
    };
    const compiled = compilePhysicalPerformance3D({ performance: source });
    expect(compiled.diagnostics).toContainEqual(expect.objectContaining({ code: "recovery-unsupported", cueId: "missing-ground-rise", frame: 30, pointer: "/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/0/target/groundLayerMask" }));
  });

  test("keeps supported recovery deterministic for scrub and sequential playback", () => {
    const source = supportedRecovery(true), compiled = compilePhysicalPerformance3D({ performance: source }), runtime = createPhysicalPerformanceRuntime3D({ performance: source });
    const sequential = new Float32Array(compiled.frameStride), sampled = new Float32Array(compiled.frameStride);
    for (let frame = 0; frame < source.durationFrames; frame += 1) { runtime.stepFrame(); runtime.writeState(sequential); compiled.writeFrame(frame, sampled); expect(sampled).toEqual(sequential); }
    expect(compiled.diagnostics).toEqual([]);
    expect(runtime.ragdolls.status("fighter").mode).toBe("animated");
  });

  test("lets passive consequence settle before recovery motors take authority", () => {
    const source: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 30, world: { gravityY: 0 },
      ragdolls: [{
        id: "fighter", rootBoneId: "hips", settleLinearSpeed: .08, settleAngularSpeed: .12, settleDurationSeconds: .1,
        bodies: [{ boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, mass: 4, collisionLayer: 1, collisionMask: 0 } }], joints: [], initialPose: { rotations: [] },
      }],
      cues: [
        { id: "fall", kind: "mode", frame: 0, ragdollId: "fighter", mode: "passive", discontinuous: true },
        { id: "rise", kind: "recovery", frame: 0, ragdollId: "fighter", startCondition: "after-settled", maximumWaitFrames: 12, target: { rootPosition: [0, 0, 0], rootRotation: [0, 0, 0, 1], durationSeconds: .2 } },
      ],
    };
    const runtime = createPhysicalPerformanceRuntime3D({ performance: source });
    runtime.stepFrame();
    expect(runtime.ragdolls.status("fighter").mode).toBe("passive");
    for (let frame = 1; frame < 10 && runtime.ragdolls.status("fighter").mode === "passive"; frame += 1) runtime.stepFrame();
    expect(runtime.ragdolls.status("fighter").mode).toBe("recovering");
    expect(runtime.diagnostics).toEqual([]);

    const compiled = compilePhysicalPerformance3D({ performance: source }), sampled = new Float32Array(compiled.frameStride), sequential = new Float32Array(compiled.frameStride), replay = createPhysicalPerformanceRuntime3D({ performance: source });
    for (let frame = 0; frame < source.durationFrames; frame += 1) { replay.stepFrame(); replay.writeState(sequential); compiled.writeFrame(frame, sampled); expect(sampled).toEqual(sequential); }
    expect(compiled.diagnostics).toEqual(replay.diagnostics);
  });

  test("fails a bounded settled recovery instead of overriding ongoing motion", () => {
    const source: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 12, world: { gravityY: 0 },
      ragdolls: [{ id: "fighter", rootBoneId: "hips", bodies: [{ boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, mass: 4, velocityX: 8, collisionLayer: 1, collisionMask: 0 } }], joints: [], initialPose: { rotations: [] } }],
      cues: [
        { id: "fall", kind: "mode", frame: 0, ragdollId: "fighter", mode: "passive", discontinuous: true },
        { id: "rise", kind: "recovery", frame: 0, ragdollId: "fighter", startCondition: "after-settled", maximumWaitFrames: 3, target: { rootPosition: [0, 0, 0], rootRotation: [0, 0, 0, 1], durationSeconds: .2 } },
      ],
    };
    const compiled = compilePhysicalPerformance3D({ performance: source });
    expect(compiled.diagnostics).toContainEqual(expect.objectContaining({ code: "recovery-not-settled", cueId: "rise", frame: 3 }));
    const invalid = structuredClone(source), invalidRecovery = invalid.cues[1]!; if (invalidRecovery.kind !== "recovery") throw new Error("recovery fixture is missing"); invalidRecovery.maximumWaitFrames = 12;
    expect(() => compilePhysicalPerformance3D({ performance: invalid })).toThrow("must end before");
  });

  test("diagnoses a floating recovery instead of snapping back to animation", () => {
    const compiled = compilePhysicalPerformance3D({ performance: supportedRecovery(false) });
    expect(compiled.diagnostics).toEqual([expect.objectContaining({ code: "recovery-unsupported", cueId: "stand-clear" })]);
  });

  test("diagnoses an occupied stand-up volume before applying recovery forces", () => {
    const source = supportedRecovery(false);
    source.bodies = [{ id: "fallen-log", type: "static", shape: { kind: "box", halfX: .4, halfY: .4, halfZ: .4 }, y: .15, collisionLayer: 4, collisionMask: 2 }];
    const compiled = compilePhysicalPerformance3D({ performance: source });
    expect(compiled.diagnostics).toContainEqual(expect.objectContaining({ code: "recovery-obstructed", cueId: "stand-clear", frame: 0 }));
    expect(compiled.diagnostics).toContainEqual(expect.objectContaining({ code: "severe-penetration", pointer: "/extensions/hyperfocus3DVideo/physicalPerformance/simulation/bodies/0" }));
  });

  test("identifies the obstructed limb and full-body clearance control before recovery", () => {
    const source: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 8, world: { gravityY: 0 },
      bodies: [{ id: "torso-branch", type: "static", shape: { kind: "box", halfX: .1, halfY: .1, halfZ: .1 }, y: .8, collisionLayer: 4, collisionMask: 2 }],
      ragdolls: [{ id: "fighter", rootBoneId: "hips", bodies: [{ boneId: "hips", body: { shape: { kind: "box", halfX: .3, halfY: .3, halfZ: .2 }, x: 2, mass: 8, collisionLayer: 2, collisionMask: 4 } }, { boneId: "torso", body: { shape: { kind: "box", halfX: .35, halfY: .5, halfZ: .2 }, x: 2, y: .8, mass: 6, collisionLayer: 2, collisionMask: 4 } }], joints: [{ id: "spine", parentBoneId: "hips", childBoneId: "torso", poseJointIndex: 0, localAnchorParent: [0, .3, 0], localAnchorChild: [0, -.5, 0] }], initialPose: { rotations: [0, 0, 0, 1] } }],
      cues: [{ id: "full-body-rise", kind: "recovery", frame: 0, ragdollId: "fighter", target: { rootPosition: [0, 0, 0], rootRotation: [0, 0, 0, 1], durationSeconds: .2, clearancePadding: .02 } }],
    };
    expect(compilePhysicalPerformance3D({ performance: source }).diagnostics).toContainEqual(expect.objectContaining({ code: "recovery-obstructed", cueId: "full-body-rise", frame: 0, pointer: "/extensions/hyperfocus3DVideo/physicalPerformance/simulation/cues/0/target/clearancePadding", message: expect.stringContaining("torso target volume intersects torso-branch") }));
  });

  test("diagnoses direct velocity discontinuities without misclassifying authored forces", () => {
    const source: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 3, world: { gravityY: 0 },
      quality: { maximumUnforcedAcceleration: 10 },
      bodies: [{ id: "free-prop", shape: { kind: "sphere", radius: .2 }, mass: 1, collisionLayer: 1, collisionMask: 0 }],
      ragdolls: [], cues: [],
    };
    const runtime = createPhysicalPerformanceRuntime3D({ performance: source });
    runtime.world.setVelocity("free-prop", 20, 0, 0); runtime.stepFrame();
    expect(runtime.diagnostics).toContainEqual(expect.objectContaining({ code: "unforced-acceleration", cueId: "free-prop", pointer: "/extensions/hyperfocus3DVideo/physicalPerformance/simulation/bodies/0" }));
    expect(compilePhysicalPerformance3D({ performance: performance() }).diagnostics).toEqual([]);
  });

  test("diagnoses a joint that remains torque-saturated outside its authored envelope", () => {
    const halfTurn = Math.sin(Math.PI / 3), source: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 4, world: { gravityY: 0, constraintIterations: 1 },
      quality: { maximumJointLimitExcessRadians: .01, jointLimitSaturationFrames: 1 },
      ragdolls: [{
        id: "fighter", rootBoneId: "hips",
        bodies: [
          { boneId: "hips", body: { shape: { kind: "sphere", radius: .1 }, x: 0, mass: 10, collisionLayer: 1, collisionMask: 0 } },
          { boneId: "arm", body: { shape: { kind: "sphere", radius: .1 }, x: 1, rotation: [0, 0, halfTurn, .5], mass: 1, collisionLayer: 1, collisionMask: 0 } },
        ],
        joints: [{ id: "shoulder", parentBoneId: "hips", childBoneId: "arm", poseJointIndex: 0, localAnchorParent: [1, 0, 0], angularLimitRadians: .05, maxLimitTorqueImpulse: .00001, maxTorqueImpulse: 0 }],
        initialPose: { rotations: [0, 0, 0, 1] },
      }], cues: [],
    };
    const first = compilePhysicalPerformance3D({ performance: source }), second = compilePhysicalPerformance3D({ performance: source });
    expect(first.diagnostics).toContainEqual(expect.objectContaining({ code: "joint-limit-saturation", pointer: "/extensions/hyperfocus3DVideo/physicalPerformance/simulation/ragdolls/0/joints/0/angularLimitRadians" }));
    expect(first.diagnostics).toEqual(second.diagnostics); expect(first.states).toEqual(second.states);
  });

  test("diagnoses a missed authored contact instead of inventing an impact", () => {
    const compiled = compilePhysicalPerformance3D({ performance: performance(20) });
    expect(compiled.contacts).toHaveLength(0);
    expect(compiled.diagnostics).toEqual([expect.objectContaining({ code: "launch-missed", cueId: "first-punch" })]);
  });

  test("breaks authored terrain assemblies and emits the exact break tick", () => {
    const source: PhysicalPerformance3D = {
      frameRate: 30,
      simulationHz: 120,
      durationFrames: 20,
      world: { gravityY: 0, constraintIterations: 8 },
      bodies: [
        { id: "mountain", type: "static", shape: { kind: "sphere", radius: 0.1 }, x: 1, collisionLayer: 4, collisionMask: 4 },
        { id: "rock-chunk", shape: { kind: "box", halfX: 0.25, halfY: 0.4, halfZ: 0.25 }, x: 1, mass: 5, collisionLayer: 2, collisionMask: 1 },
      ],
      ragdolls: [{
        id: "primal",
        rootBoneId: "fist",
        bodies: [{ boneId: "fist", body: { shape: { kind: "sphere", radius: 0.2 }, mass: 2, collisionLayer: 1, collisionMask: 2 } }],
        joints: [],
        initialPose: { rotations: [] },
      }],
      constraints: [{ id: "fracture-seam", kind: "point", a: { bodyId: "mountain" }, b: { bodyId: "rock-chunk" }, breakImpulse: 0.01 }],
      cues: [{ id: "mountain-break", kind: "launch", frame: 0, attacker: { ragdollId: "primal", boneId: "fist" }, target: { bodyId: "rock-chunk" }, direction: [1, 0, 0], speedMetersPerSecond: 12, distanceMeters: 2 }],
    };
    const compiled = compilePhysicalPerformance3D({ performance: source });
    expect(compiled.contacts).toHaveLength(1);
    expect(compiled.breaks).toEqual([expect.objectContaining({ constraintId: "fracture-seam", a: { bodyId: "mountain" }, b: { bodyId: "rock-chunk" } })]);
    expect(compiled.breaks[0]!.simulationTick).toBeGreaterThanOrEqual(compiled.contacts[0]!.simulationTick);
    const runtime = createPhysicalPerformanceRuntime3D({ performance: source }); while (!runtime.breaks.length) runtime.stepFrame(); const checkpoint = runtime.checkpoint();
    const finish = () => { while (runtime.frame < source.durationFrames - 1) runtime.stepFrame(); const state = new Float32Array(runtime.bodyReferences.length * PHYSICAL_BODY_STATE_STRIDE_3D); runtime.writeState(state); return { state, breaks: structuredClone(runtime.breaks), contacts: structuredClone(runtime.contacts), diagnostics: structuredClone(runtime.diagnostics) }; };
    const expected = finish(); runtime.restoreCheckpoint(checkpoint);
    expect(runtime.world.constraint("fracture-seam")).toBeUndefined(); expect(finish()).toEqual(expected); expect(runtime.breaks).toHaveLength(1);
  });

  test("breaks through material from measured contact energy without bouncing the attacker", () => {
    const source: PhysicalPerformance3D = {
      frameRate: 30, simulationHz: 120, durationFrames: 20, world: { gravityY: 0, constraintIterations: 8 },
      bodies: [
        { id: "anchor", type: "static", shape: { kind: "sphere", radius: .05 }, collisionMask: 0 },
        { id: "wall-chunk", shape: { kind: "box", halfX: .2, halfY: 1, halfZ: 1 }, x: 1, mass: 20, collisionLayer: 2, collisionMask: 1, impactResponse: { fractureEnergyJoules: 40, retainedEnergyRatio: .9 } },
      ],
      ragdolls: [{ id: "fighter", rootBoneId: "fist", bodies: [{ boneId: "fist", body: { shape: { kind: "sphere", radius: .2 }, mass: 2, collisionLayer: 1, collisionMask: 2 } }], joints: [], initialPose: { rotations: [] } }],
      constraints: [{ id: "wall-seam", kind: "point", a: { bodyId: "anchor" }, b: { bodyId: "wall-chunk" }, localAnchorA: [1, 0, 0], breakImpulse: 1_000 }],
      cues: [{ id: "breakthrough", kind: "launch", frame: 0, attacker: { ragdollId: "fighter", boneId: "fist" }, target: { bodyId: "wall-chunk" }, direction: [1, 0, 0], speedMetersPerSecond: 12, distanceMeters: 2 }],
      outputs: [{ ragdollId: "fighter", boneId: "fist" }, { bodyId: "wall-chunk" }],
    };
    const first = compilePhysicalPerformance3D({ performance: source }), second = compilePhysicalPerformance3D({ performance: source });
    expect(first.states).toEqual(second.states); expect(first.contacts).toEqual(second.contacts); expect(first.breaks).toEqual(second.breaks);
    expect(first.contacts).toEqual([expect.objectContaining({ cueId: "breakthrough", breakthrough: true, failedBodyId: "wall-chunk", closingSpeedMetersPerSecond: expect.any(Number), impactEnergyJoules: expect.any(Number) })]);
    expect(first.breaks).toEqual([expect.objectContaining({ constraintId: "wall-seam", cause: "impact", impactEnergyJoules: first.contacts[0]!.impactEnergyJoules })]);
    const fistVelocityX = first.states[(source.durationFrames - 1) * first.bodyReferences.length * PHYSICAL_BODY_STATE_STRIDE_3D + 7]!;
    expect(fistVelocityX).toBeGreaterThan(0);
  });

  test("preflights missing targets and invalid simulation ratios", () => {
    const missing = performance();
    const launch = missing.cues[0]!;
    if (launch.kind !== "launch") throw new Error("fixture launch is missing");
    missing.cues = [{ ...launch, target: { bodyId: "missing" } }];
    expect(() => createPhysicalPerformanceRuntime3D({ performance: missing })).toThrow("missing does not exist");

    const invalidRate = performance();
    invalidRate.simulationHz = 100;
    expect(() => createPhysicalPerformanceRuntime3D({ performance: invalidRate })).toThrow("integer multiple");

    const invalidQuality = performance();
    invalidQuality.quality = { jointLimitSaturationFrames: 0 };
    expect(() => createPhysicalPerformanceRuntime3D({ performance: invalidQuality })).toThrow("jointLimitSaturationFrames");
  });
});

function requireLaunch(cue: PhysicalPerformanceCue3D | undefined) {
  if (cue?.kind !== "launch") throw new Error("Expected launch fixture" );
  return cue;
}

function requireLocomotion(cue: PhysicalPerformanceCue3D | undefined) { if (cue?.kind !== "locomotion") throw new Error("Expected locomotion fixture"); return cue; }

function requireJointDrive(cue: PhysicalPerformanceCue3D | undefined) { if (cue?.kind !== "joint-drive") throw new Error("Expected joint-drive fixture"); return cue; }

function requireEffectorDrive(cue: PhysicalPerformanceCue3D | undefined) { if (cue?.kind !== "effector-drive") throw new Error("Expected effector-drive fixture"); return cue; }
