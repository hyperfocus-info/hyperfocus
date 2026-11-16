import { tuple4 } from "../math/tuples.ts";
import { describe, expect, test } from "bun:test";
import { classifyRagdollPosture3D, createHumanoidRagdoll3D, createRagdollSystem3D, type RagdollDefinition3D } from "./ragdoll-3d.ts";
import { createRigidWorld3D } from "./rigid-3d.ts";

const identityPose = { rotations: [0, 0, 0, 1] };

function worldPoint(body: NonNullable<ReturnType<ReturnType<typeof createRigidWorld3D>["body"]>>, local: readonly [number, number, number]) {
  const { rotationX: qx, rotationY: qy, rotationZ: qz, rotationW: qw } = body, [x, y, z] = local;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [body.x + x + qw * tx + qy * tz - qz * ty, body.y + y + qw * ty + qz * tx - qx * tz, body.z + z + qw * tz + qx * ty - qy * tx];
}

function definition(overrides: Partial<RagdollDefinition3D> = {}): RagdollDefinition3D {
  return {
    id: "fighter",
    rootBoneId: "hips",
    bodies: [
      {
        boneId: "hips",
        body: {
          shape: { kind: "box", halfX: 0.3, halfY: 0.3, halfZ: 0.2 },
          x: 2,
          mass: 8,
          collisionLayer: 1,
          collisionMask: 2,
          angularDamping: 0.5,
        },
      },
      {
        boneId: "torso",
        body: {
          shape: { kind: "box", halfX: 0.35, halfY: 0.5, halfZ: 0.2 },
          x: 2,
          y: 0.8,
          mass: 6,
          collisionLayer: 1,
          collisionMask: 2,
          angularDamping: 0.5,
        },
      },
    ],
    joints: [{
      id: "spine",
      parentBoneId: "hips",
      childBoneId: "torso",
      poseJointIndex: 0,
      localAnchorParent: [0, 0.3, 0],
      localAnchorChild: [0, -0.5, 0],
      motorStiffness: 0.2,
      motorDamping: 1,
      maxTorqueImpulse: 1,
    }],
    initialPose: identityPose,
    minimumTransitionSeconds: 0.2,
    settleLinearSpeed: 0.1,
    settleAngularSpeed: 0.1,
    settleDurationSeconds: 0.2,
    recoveryPositionTolerance: 0.08,
    recoveryAngularSpeed: 0.2,
    maxRootImpulse: 3,
    maxRootTorqueImpulse: 1,
    ...overrides,
  };
}

function createSystem() {
  const world = createRigidWorld3D({
    capacity: 4,
    gravityY: 0,
    maxConstraints: 4,
    constraintIterations: 12,
  });
  const system = createRagdollSystem3D({ world });
  system.add(definition());
  return system;
}

describe("portable 3D ragdoll system", () => {
  test("classifies settled body orientation deterministically for get-up selection", () => {
    const body = (rotation: readonly [number, number, number, number]) => ({ rotationX: rotation[0], rotationY: rotation[1], rotationZ: rotation[2], rotationW: rotation[3] });
    expect(classifyRagdollPosture3D(body([0, 0, 0, 1]))).toBe("upright");
    expect(classifyRagdollPosture3D(body([-Math.SQRT1_2, 0, 0, Math.SQRT1_2]))).toBe("face-up");
    expect(classifyRagdollPosture3D(body([Math.SQRT1_2, 0, 0, Math.SQRT1_2]))).toBe("face-down");
    expect(classifyRagdollPosture3D(body([0, 0, Math.SQRT1_2, Math.SQRT1_2]))).toBe("left-side");
    expect(classifyRagdollPosture3D(body([0, 0, -Math.SQRT1_2, Math.SQRT1_2]))).toBe("right-side");
  });

  test("classifies open, crouched, wall-supported, and ledge-supported recovery space deterministically", () => {
    const inspect = (bodies: Parameters<ReturnType<typeof createRigidWorld3D>["addBody"]>[0][]) => {
      const world = createRigidWorld3D({ capacity: bodies.length + 2, gravityY: 0, maxConstraints: 4 });
      for (const body of bodies) world.addBody(body);
      const system = createRagdollSystem3D({ world }); system.add(definition());
      return system.recoveryEnvironment("fighter", { pose: identityPose, rootPosition: [0, .3, 0], rootRotation: [0, 0, 0, 1], groundLayerMask: 2 }, { proximityMeters: .3, standingHeadroomMeters: .25, ledgeProbeDistance: .4, ledgeHeightTolerance: .08 });
    };
    const ground = { id: "ground", type: "static" as const, shape: { kind: "box" as const, halfX: 2, halfY: .1, halfZ: 2 }, y: -.1, collisionLayer: 2, collisionMask: 1 };
    expect(inspect([ground])).toEqual({ environment: "open", rootPosition: [0, .3, 0] });
    expect(inspect([ground, { id: "low-branch", type: "static", shape: { kind: "box", halfX: .8, halfY: .1, halfZ: .8 }, y: .75, collisionLayer: 2, collisionMask: 1 }])).toEqual({ environment: "crouched", rootPosition: [0, .3, 0], bodyId: "low-branch" });
    expect(inspect([ground, { id: "trunk", type: "static", shape: { kind: "box", halfX: .1, halfY: .8, halfZ: .8 }, x: .7, y: .7, collisionLayer: 2, collisionMask: 1 }])).toEqual({ environment: "wall-supported", rootPosition: [0, .3, 0], bodyId: "trunk" });
    expect(inspect([{ ...ground, id: "ledge", shape: { kind: "box", halfX: .2, halfY: .1, halfZ: 2 } }])).toEqual({ environment: "ledge-supported", rootPosition: [0, .3, 0], bodyId: "ledge" });
    expect(inspect([ground])).toEqual(inspect([ground]));
  });
  test("expands one inspected humanoid rest pose into stable self-filtered bodies and joints", () => {
    const bones = [
      ["Armature", undefined, [0, 0, 0]], ["mixamorig:Hips", "Armature", [0, 1, 0]], ["mixamorig:Spine", "mixamorig:Hips", [0, 1.25, 0]], ["mixamorig:Head", "mixamorig:Spine", [0, 1.75, 0]],
      ["mixamorig:LeftArm", "mixamorig:Spine", [-.35, 1.5, 0]], ["mixamorig:LeftForeArm", "mixamorig:LeftArm", [-.7, 1.4, 0]], ["mixamorig:LeftHand", "mixamorig:LeftForeArm", [-1, 1.35, 0]],
      ["mixamorig:RightArm", "mixamorig:Spine", [.35, 1.5, 0]], ["mixamorig:RightForeArm", "mixamorig:RightArm", [.7, 1.4, 0]], ["mixamorig:RightHand", "mixamorig:RightForeArm", [1, 1.35, 0]],
      ["mixamorig:LeftUpLeg", "mixamorig:Hips", [-.2, .85, 0]], ["mixamorig:LeftLeg", "mixamorig:LeftUpLeg", [-.2, .4, 0]], ["mixamorig:LeftFoot", "mixamorig:LeftLeg", [-.2, .08, .12]],
      ["mixamorig:RightUpLeg", "mixamorig:Hips", [.2, .85, 0]], ["mixamorig:RightLeg", "mixamorig:RightUpLeg", [.2, .4, 0]], ["mixamorig:RightFoot", "mixamorig:RightLeg", [.2, .08, .12]],
    ] as const;
    const first = createHumanoidRagdoll3D({ id: "hero-body", rootBoneId: "Armature", bones: bones.map(([id, parentId, restPosition]) => ({ id, ...(parentId ? { parentId } : {}), restPosition, restRotation: [0, 0, 0, 1] })), entityPosition: [2, 0, 3], preset: "balanced", materialPreset: "ice", collisionLayer: 4 });
    const second = createHumanoidRagdoll3D({ id: "hero-body", rootBoneId: "Armature", bones: bones.map(([id, parentId, restPosition]) => ({ id, ...(parentId ? { parentId } : {}), restPosition, restRotation: [0, 0, 0, 1] })), entityPosition: [2, 0, 3], preset: "balanced", materialPreset: "ice", collisionLayer: 4 });
    expect(first).toEqual(second);
    expect(first.physicalRootBoneId).toBe("mixamorig:Hips");
    expect(first.definition.bodies.length).toBeGreaterThanOrEqual(15);
    expect(first.definition.bodies.every((body) => body.body.friction === .03 && body.body.restitution === .02)).toBe(true);
    expect(first.definition.bodies.find((body) => body.boneId === "mixamorig:Hips")?.body.angularDamping).toBe(12);
    expect(first.definition.bodies.find((body) => body.boneId === "mixamorig:Spine")?.body.angularDamping).toBe(4);
    expect(first.definition.bodies.find((body) => body.boneId === "mixamorig:LeftHand")?.body.angularDamping).toBe(.01);
    expect(first.definition.joints).toHaveLength(first.definition.bodies.length - 1);
    expect(first.definition.joints.every((joint) => {
      const motor = joint.maxTorqueImpulse, limit = joint.maxLimitTorqueImpulse;
      return motor !== undefined && limit !== undefined
        && motor > 0 && motor <= .22 && limit > motor && limit <= .88;
    })).toBe(true);
    const spineMotor = first.definition.joints.find((joint) => joint.childBoneId === "mixamorig:Spine")!.maxTorqueImpulse;
    const footMotor = first.definition.joints.find((joint) => joint.childBoneId === "mixamorig:LeftFoot")!.maxTorqueImpulse;
    if (spineMotor === undefined || footMotor === undefined) throw new Error("Generated humanoid joints require motor limits");
    expect(footMotor).toBeLessThan(spineMotor);
    expect(first.definition.joints.every((joint) => joint.swingTwistLimit && Math.hypot(...Array.from(joint.swingTwistLimit.twistAxis)) > .999 && joint.swingTwistLimit.maxSwingRadians > 0 && joint.swingTwistLimit.maxSwingRadians <= Math.PI && joint.swingTwistLimit.minTwistRadians <= joint.swingTwistLimit.maxTwistRadians)).toBe(true);
    for (const footId of ["mixamorig:LeftFoot", "mixamorig:RightFoot"]) {
      const ankle = first.definition.joints.find((joint) => joint.childBoneId === footId)?.swingTwistLimit;
      expect(ankle?.maxSwingRadians).toBe(.4);
      expect(ankle?.minTwistRadians).toBe(-.3);
      expect(ankle?.maxTwistRadians).toBe(.3);
    }
    expect(first.definition.bodies.every((body) => body.body.collisionLayer === 4 && body.body.collisionMask === 0xffff_fffb)).toBe(true);
    expect(first.definition.bodies.reduce((sum, body) => sum + (body.body.mass ?? 0), 0)).toBeCloseTo(78, 8);
    expect(first.definition.impactResponse).toEqual({ minimumStaggerSpeedMetersPerSecond: 1.5, knockdownSpeedMetersPerSecond: 10, staggerDurationSeconds: .28, staggerMotorYield: .2 });
    expect(first.rootBinding.positionOffset).toEqual([0, -1, 0]);

    const world = createRigidWorld3D({ capacity: first.definition.bodies.length + 1, gravityY: -9.81, maxConstraints: first.definition.joints.length * 3 + 2, constraintIterations: 12 });
    world.addBody({ id: "ground", type: "static", shape: { kind: "box", halfX: 20, halfY: .1, halfZ: 20 }, y: -.1, collisionLayer: 1, collisionMask: 4 });
    const system = createRagdollSystem3D({ world }); system.add(first.definition);
    for (const [id, boneId] of [["left", "mixamorig:LeftFoot"], ["right", "mixamorig:RightFoot"]] as const) expect(system.plantSupport("hero-body", { id, boneId, groundLayerMask: 1, probeDistance: .12, stiffness: .98, damping: .99, maxImpulse: 500, breakImpulse: 2_400, balanceRadiusMeters: .2, balanceStiffness: .8, balanceDamping: .98, maxBalanceImpulse: 80, forceDistribution: "whole-body" }).planted).toBe(true);
    for (let tick = 0; tick < 120; tick += 1) system.step(0.008333333333333333);
    expect(system.body("hero-body", "mixamorig:Hips")!.y).toBeGreaterThan(.75);
    expect(system.body("hero-body", "mixamorig:RightHand")!.y).toBeGreaterThan(1.05);
    expect(system.beginPredictiveStep("hero-body", { id: "left-stride", boneId: "mixamorig:LeftFoot", direction: [1, 0, 0], speedMetersPerSecond: 3, predictionSeconds: .3, maximumDistance: .8, durationSeconds: .3, liftHeight: .15, groundLayerMask: 1, probeHeight: .5, probeDistance: 1 })).toEqual(expect.objectContaining({ state: "moving" }));
    system.step(0.008333333333333333);
    const ankleMotor = world.constraint("hero-body:mixamorig:LeftLeg-mixamorig:LeftFoot:motor"), kneeMotor = world.constraint("hero-body:mixamorig:LeftUpLeg-mixamorig:LeftLeg:motor");
    expect(ankleMotor?.kind).toBe("angular-motor"); expect(kneeMotor?.kind).toBe("angular-motor");
    if (ankleMotor?.kind !== "angular-motor" || kneeMotor?.kind !== "angular-motor") throw new Error("Automatic leg motors are missing.");
    expect(ankleMotor.stiffness).toBeCloseTo(.76, 8);
    expect(kneeMotor.stiffness).toBeCloseTo(0.26599999999999996, 8);
    system.clearStep("hero-body", "left-stride");
    expect(system.plantSupport("hero-body", { id: "left", boneId: "mixamorig:LeftFoot", groundLayerMask: 1, probeDistance: .12, stiffness: .98, damping: .99, maxImpulse: 500, breakImpulse: 2_400, balanceRadiusMeters: .2, balanceStiffness: .8, balanceDamping: .98, maxBalanceImpulse: 80, forceDistribution: "whole-body" }).planted).toBe(true);
    system.applyImpulse("hero-body", "mixamorig:Spine", [18, 0, 0]);
    expect(system.reactToImpact("hero-body", { impactSpeedMetersPerSecond: 6, impactEnergyJoules: 40, normalImpulseNewtonSeconds: 18 }).response).toBe("staggered");
    for (let tick = 0; tick < 36; tick += 1) system.step(0.008333333333333333);
    expect(system.body("hero-body", "mixamorig:Hips")!.y).toBeGreaterThan(.65);
    expect(system.support("hero-body", "left")?.planted).toBe(true);
    expect(system.support("hero-body", "right")?.planted).toBe(true);
  });

  test("smoothly changes motor authority unless a discontinuity is explicit", () => {
    const system = createSystem();
    expect(system.setMode("fighter", { mode: "passive" }).motorWeight).toBe(1);

    system.step(0.05);
    const first = system.status("fighter").motorWeight;
    system.step(0.05);
    const second = system.status("fighter").motorWeight;
    expect(first).toBeGreaterThan(second);
    expect(first).toBeLessThan(1);
    expect(second).toBeGreaterThan(0);

    expect(system.setMode("fighter", { mode: "active", discontinuous: true }).motorWeight).toBe(0.45);
  });

  test("plants a body on the raycast surface and releases it for passive impact", () => {
    const run = () => {
      const world = createRigidWorld3D({ capacity: 2, gravityY: 0, maxConstraints: 1, constraintIterations: 12 });
      world.addBody({ id: "ground", type: "static", shape: { kind: "box", halfX: 20, halfY: .1, halfZ: 20 }, y: -.1, collisionLayer: 4 });
      const system = createRagdollSystem3D({ world }); system.add(definition({ rootBoneId: "foot", bodies: [{ boneId: "foot", body: { shape: { kind: "sphere", radius: .15 }, x: 2, y: .15, mass: 2, collisionLayer: 1, collisionMask: 2 } }], joints: [], initialPose: { rotations: [] } }));
      const planted = system.plantSupport("fighter", { id: "front-foot", boneId: "foot", groundLayerMask: 4, probeDistance: .1, stiffness: 1, breakImpulse: 1_000_000 });
      system.applyImpulse("fighter", "foot", [12, 0, 0]);
      for (let frame = 0; frame < 30; frame += 1) system.step(0.008333333333333333);
      const held = system.body("fighter", "foot")!;
      const support = system.support("fighter", "front-foot");
      const heldPoint = worldPoint(held, [0, -.15, 0]);
      system.setMode("fighter", { mode: "passive", discontinuous: true });
      system.applyImpulse("fighter", "foot", [12, 0, 0]);
      for (let frame = 0; frame < 30; frame += 1) system.step(0.008333333333333333);
      return { planted, support, heldPoint, heldX: held.x, released: system.support("fighter", "front-foot"), passiveX: system.body("fighter", "foot")!.x };
    };
    const first = run();
    expect(first.planted).toEqual(expect.objectContaining({ planted: true, targetBodyId: "ground", point: [2, 0, 0] }));
    expect(first.support).toEqual(expect.objectContaining({ planted: true, boneId: "foot" }));
    expect(Math.hypot(first.heldPoint[0]! - 2, first.heldPoint[1]!, first.heldPoint[2]!)).toBeLessThan(.005);
    expect(first.released).toBeUndefined();
    expect(first.passiveX).toBeGreaterThan(first.heldX + .05);
    expect(first).toEqual(run());
  });

  test("pulls an elevated visible sole to its support instead of pinning a virtual point below the foot", () => {
    const world = createRigidWorld3D({ capacity: 2, gravityY: 0, maxConstraints: 1, constraintIterations: 16 });
    world.addBody({ id: "ground", type: "static", shape: { kind: "box", halfX: 20, halfY: .1, halfZ: 20 }, y: -.1, collisionLayer: 4 });
    const system = createRagdollSystem3D({ world });
    system.add(definition({ rootBoneId: "foot", bodies: [{ boneId: "foot", body: { shape: { kind: "sphere", radius: .15 }, x: 2, y: .45, mass: 2, collisionLayer: 1, collisionMask: 2 } }], joints: [], initialPose: { rotations: [] } }));

    expect(system.plantSupport("fighter", { id: "front-foot", boneId: "foot", groundLayerMask: 4, probeDistance: .35, stiffness: 1, damping: 1, maxImpulse: 100, breakImpulse: 1_000_000, maxBalanceImpulse: 0 }).planted).toBe(true);
    for (let frame = 0; frame < 30; frame += 1) system.step(0.008333333333333333);

    const foot = system.body("fighter", "foot")!;
    expect(foot.shape.kind).toBe("sphere");
    expect(foot.y).toBeCloseTo(.15, 2);
  });

  test("turns measured contact speed into checkpointed stagger or knockdown authority", () => {
    const world = createRigidWorld3D({ capacity: 2, gravityY: 0, maxConstraints: 4, constraintIterations: 12 }), system = createRagdollSystem3D({ world });
    system.add(definition({ impactResponse: { minimumStaggerSpeedMetersPerSecond: 2, knockdownSpeedMetersPerSecond: 10, staggerDurationSeconds: .25, staggerMotorYield: .2 } }));
    expect(system.reactToImpact("fighter", { impactSpeedMetersPerSecond: 1.9, impactEnergyJoules: 4, normalImpulseNewtonSeconds: 2 })).toEqual({ response: "ignored", severity: 0 });
    expect(system.reactToImpact("fighter", { impactSpeedMetersPerSecond: 6, impactEnergyJoules: 40, normalImpulseNewtonSeconds: 8 })).toEqual({ response: "staggered", severity: .5 });
    expect(system.status("fighter")).toEqual(expect.objectContaining({ authorityState: "staggered", impactResponse: expect.objectContaining({ impactSpeedMetersPerSecond: 6, severity: .5, progress: 0 }) }));
    const checkpoint = { world: world.checkpoint(), ragdoll: system.checkpoint() };
    for (let tick = 0; tick < 12; tick += 1) system.step(0.008333333333333333); const first = system.status("fighter");
    world.restoreCheckpoint(checkpoint.world); system.restoreCheckpoint(checkpoint.ragdoll); for (let tick = 0; tick < 12; tick += 1) system.step(0.008333333333333333); expect(system.status("fighter")).toEqual(first);
    for (let tick = 0; tick < 20; tick += 1) system.step(0.008333333333333333); expect(system.status("fighter")).toEqual(expect.objectContaining({ authorityState: "ready" })); expect(system.status("fighter").impactResponse).toBeUndefined();
    expect(system.reactToImpact("fighter", { impactSpeedMetersPerSecond: 10, impactEnergyJoules: 120, normalImpulseNewtonSeconds: 24 })).toEqual({ response: "knocked-down", severity: 1 });
    expect(system.status("fighter")).toEqual(expect.objectContaining({ mode: "passive", authorityState: "downed" }));
    expect(() => createRagdollSystem3D({ world: createRigidWorld3D({ capacity: 2, gravityY: 0, maxConstraints: 4 }) }).add(definition({ impactResponse: { minimumStaggerSpeedMetersPerSecond: 5, knockdownSpeedMetersPerSecond: 5 } }))).toThrow("must exceed");
  });

  test("accepts horizontal run-up for grounded takeoff and rejects airborne authority", () => {
    const world = createRigidWorld3D({ capacity: 3, gravityY: -9.81, maxConstraints: 2, constraintIterations: 12 });
    world.addBody({ id: "ground", type: "static", shape: { kind: "box", halfX: 20, halfY: .1, halfZ: 20 }, y: -.1, collisionLayer: 4, collisionMask: 1 });
    const system = createRagdollSystem3D({ world });
    system.add(definition({
      bodies: [
        { boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, y: .5, velocityX: 7, mass: 8, collisionLayer: 1, collisionMask: 4 } },
        { boneId: "foot", body: { shape: { kind: "sphere", radius: .1 }, y: .1, velocityX: 7, mass: 2, collisionLayer: 1, collisionMask: 4 } },
      ],
      joints: [], initialPose: { rotations: [] }, locomotion: { supportBoneIds: ["foot"], groundLayerMask: 4, probeDistance: .05, minimumNormalY: .7, maximumGroundedVerticalSpeedMetersPerSecond: .5 },
    }));
    expect(system.plantSupport("fighter", { id: "run-up", boneId: "foot", groundLayerMask: 4, probeDistance: .05, maximumPlantSpeed: 8, breakImpulse: 1_000_000 }).planted).toBe(true);
    expect(system.status("fighter")).toEqual(expect.objectContaining({ locomotionState: "grounded", authorityState: "ready" }));

    const takeoff = system.takeoff("fighter", { supportBoneIds: ["foot"], velocity: [7, 5, 0], groundLayerMask: 4, probeDistance: .05, maximumGroundedVerticalSpeedMetersPerSecond: .5 });
    expect(takeoff.launched).toBe(true);
    expect(system.support("fighter", "run-up")).toBeUndefined();
    expect(system.body("fighter", "hips")).toEqual(expect.objectContaining({ velocityX: 7, velocityY: 5 }));
    expect(system.body("fighter", "foot")).toEqual(expect.objectContaining({ velocityX: 7, velocityY: 5 }));
    expect(system.status("fighter")).toEqual(expect.objectContaining({ locomotionState: "airborne", authorityState: "ready" }));
    expect(system.takeoff("fighter", { supportBoneIds: ["foot"], velocity: [7, 5, 0], groundLayerMask: 4, probeDistance: .05, maximumGroundedVerticalSpeedMetersPerSecond: .5 })).toEqual(expect.objectContaining({ launched: false, reason: "the character already has too much vertical speed to be grounded" }));
    expect(system.setMode("fighter", { mode: "passive" })).toEqual(expect.objectContaining({ locomotionState: "airborne", authorityState: "downed" }));
  });

  test("coordinates body velocities at takeoff so a descending swing foot cannot cancel the jump", () => {
    const world = createRigidWorld3D({ capacity: 3, gravityY: -9.81, maxConstraints: 2, constraintIterations: 12 });
    world.addBody({ id: "ground", type: "static", shape: { kind: "box", halfX: 20, halfY: .1, halfZ: 20 }, y: -.1, collisionLayer: 4, collisionMask: 1 });
    const system = createRagdollSystem3D({ world });
    system.add(definition({
      bodies: [
        { boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, y: .5, velocityX: 2, velocityY: .45, mass: 8, collisionLayer: 1, collisionMask: 4 } },
        { boneId: "foot", body: { shape: { kind: "sphere", radius: .1 }, y: .1, velocityX: -1, velocityY: -1.8, mass: 2, collisionLayer: 1, collisionMask: 4 } },
      ],
      joints: [], initialPose: { rotations: [] }, locomotion: { supportBoneIds: ["foot"], groundLayerMask: 4, probeDistance: .05, minimumNormalY: .7, maximumGroundedVerticalSpeedMetersPerSecond: .5 },
    }));
    system.setMode("fighter", { mode: "animated", discontinuous: true });

    expect(system.takeoff("fighter", { supportBoneIds: ["foot"], velocity: [3, 4, 0], groundLayerMask: 4, probeDistance: .05, maximumGroundedVerticalSpeedMetersPerSecond: .5 }).launched).toBe(true);
    expect(system.status("fighter")).toEqual(expect.objectContaining({ mode: "animated", locomotionState: "airborne" }));
    expect(system.body("fighter", "hips")).toEqual(expect.objectContaining({ velocityX: 3, velocityY: 4, velocityZ: 0 }));
    expect(system.body("fighter", "foot")).toEqual(expect.objectContaining({ velocityX: 3, velocityY: 4, velocityZ: 0 }));
    expect(system.body("fighter", "foot")).toEqual(expect.objectContaining({ angularVelocityX: 0, angularVelocityY: 0, angularVelocityZ: 0 }));
    system.step(0.008333333333333333);
    expect(system.body("fighter", "foot")!.y).toBeGreaterThan(.1);
  });

  test("derives a replayable landing consequence from support contact instead of authored pose frames", () => {
    const create = () => {
      const world = createRigidWorld3D({ capacity: 3, gravityY: -9.81, maxConstraints: 3, constraintIterations: 12 });
      world.addBody({ id: "ground", type: "static", shape: { kind: "box", halfX: 20, halfY: .1, halfZ: 20 }, y: -.1, collisionLayer: 4, collisionMask: 1 });
      const system = createRagdollSystem3D({ world });
      system.add(definition({ bodies: [{ boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, y: .5, mass: 8, collisionLayer: 1, collisionMask: 4 } }, { boneId: "foot", body: { shape: { kind: "sphere", radius: .1 }, y: .1, mass: 2, collisionLayer: 1, collisionMask: 4 } }], joints: [{ id: "ankle", parentBoneId: "hips", childBoneId: "foot", poseJointIndex: 0, localAnchorParent: [0, -.2, 0], localAnchorChild: [0, .1, 0], motorStiffness: .8, motorDamping: 1, maxTorqueImpulse: 4 }], initialPose: identityPose, locomotion: { supportBoneIds: ["foot"], groundLayerMask: 4, probeDistance: .05, minimumNormalY: .7, maximumGroundedVerticalSpeedMetersPerSecond: .5, minimumLandingSpeedMetersPerSecond: 1, fullImpactLandingSpeedMetersPerSecond: 6, landingDurationSeconds: .2, landingMotorYield: .25 } }));
      return { world, system };
    };
    const { world, system } = create();
    expect(system.takeoff("fighter", { supportBoneIds: ["foot"], velocity: [0, 5, 0], groundLayerMask: 4, probeDistance: .05, maximumGroundedVerticalSpeedMetersPerSecond: .5 }).launched).toBe(true);
    let landing;
    for (let tick = 0; tick < 240 && !landing; tick += 1) { system.step(0.008333333333333333); if (system.status("fighter").locomotionState === "landing") landing = system.status("fighter"); }
    expect(landing).toEqual(expect.objectContaining({ locomotionState: "landing", landing: expect.objectContaining({ boneId: "foot", surfaceBodyId: "ground", severity: expect.any(Number), progress: 0 }) }));
    expect(landing!.landing!.impactSpeedMetersPerSecond).toBeGreaterThan(4);
    expect(landing!.landing!.impactEnergyJoules).toBeGreaterThan(0);
    expect(landing!.landing!.normalImpulseNewtonSeconds).toBeGreaterThan(0);
    expect(landing!.landing!.severity).toBeGreaterThan(.5);
    system.step(0.008333333333333333); const yieldedMotor = world.constraint("fighter:ankle:motor"); expect(yieldedMotor?.kind).toBe("angular-motor"); if (yieldedMotor?.kind !== "angular-motor") throw new Error("landing motor is missing"); expect(yieldedMotor.stiffness).toBeLessThan(.4);

    const checkpoint = { world: world.checkpoint(), ragdoll: system.checkpoint() };
    for (let tick = 0; tick < 10; tick += 1) system.step(0.008333333333333333);
    const expected = system.status("fighter");
    world.restoreCheckpoint(checkpoint.world); system.restoreCheckpoint(checkpoint.ragdoll);
    for (let tick = 0; tick < 10; tick += 1) system.step(0.008333333333333333);
    expect(system.status("fighter")).toEqual(expected);
    for (let tick = 0; tick < 30; tick += 1) system.step(0.008333333333333333);
    expect(system.status("fighter")).toEqual(expect.objectContaining({ locomotionState: "airborne" })); expect(system.status("fighter").landing).toBeUndefined();
    const recoveredMotor = world.constraint("fighter:ankle:motor"); expect(recoveredMotor?.kind).toBe("angular-motor"); if (recoveredMotor?.kind !== "angular-motor") throw new Error("recovered motor is missing"); expect(recoveredMotor.stiffness).toBeGreaterThan(yieldedMotor.stiffness);
  });

  test("does not invent a landing consequence below the configured contact threshold", () => {
    const world = createRigidWorld3D({ capacity: 2, gravityY: -9.81, maxConstraints: 1, constraintIterations: 12 });
    world.addBody({ id: "ground", type: "static", shape: { kind: "box", halfX: 20, halfY: .1, halfZ: 20 }, y: -.1, collisionLayer: 4, collisionMask: 1 });
    const system = createRagdollSystem3D({ world });
    system.add(definition({ rootBoneId: "foot", bodies: [{ boneId: "foot", body: { shape: { kind: "sphere", radius: .1 }, y: .1, mass: 2, collisionLayer: 1, collisionMask: 4 } }], joints: [], initialPose: { rotations: [] }, locomotion: { supportBoneIds: ["foot"], groundLayerMask: 4, probeDistance: .05, minimumNormalY: .7, maximumGroundedVerticalSpeedMetersPerSecond: .25, minimumLandingSpeedMetersPerSecond: 3, fullImpactLandingSpeedMetersPerSecond: 8 } }));
    expect(system.takeoff("fighter", { supportBoneIds: ["foot"], velocity: [0, .5, 0], groundLayerMask: 4, probeDistance: .05, maximumGroundedVerticalSpeedMetersPerSecond: .25 }).launched).toBe(true);
    const observed: string[] = [];
    for (let tick = 0; tick < 120; tick += 1) { system.step(0.008333333333333333); observed.push(system.status("fighter").locomotionState); }
    expect(observed).not.toContain("landing"); expect(observed).toContain("grounded");
  });

  test("keeps projected center of mass inside the planted support polygon until passive release", () => {
    const run = (maxBalanceImpulse: number) => {
      const world = createRigidWorld3D({ capacity: 4, gravityY: 0, maxConstraints: 2, constraintIterations: 12 });
      world.addBody({ id: "ground", type: "static", shape: { kind: "box", halfX: 20, halfY: .1, halfZ: 20 }, y: -.1, collisionLayer: 4 });
      const system = createRagdollSystem3D({ world });
      system.add(definition({
        rootBoneId: "hips",
        bodies: [
          { boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, x: 1.2, y: 1, mass: 8, collisionLayer: 1, collisionMask: 0 } },
          { boneId: "left-foot", body: { shape: { kind: "sphere", radius: .1 }, x: -.25, y: .1, mass: 1, collisionLayer: 1, collisionMask: 4 } },
          { boneId: "right-foot", body: { shape: { kind: "sphere", radius: .1 }, x: .25, y: .1, mass: 1, collisionLayer: 1, collisionMask: 4 } },
        ],
        joints: [], initialPose: { rotations: [] },
      }));
      const support = (id: string, boneId: string) => system.plantSupport("fighter", { id, boneId, groundLayerMask: 4, probeDistance: .05, stiffness: 1, damping: 1, maxImpulse: 100, breakImpulse: 1_000_000, balanceRadiusMeters: .12, balanceStiffness: .45, balanceDamping: .9, maxBalanceImpulse });
      expect(support("left", "left-foot").planted).toBe(true); expect(support("right", "right-foot").planted).toBe(true);
      for (let frame = 0; frame < 120; frame += 1) system.step(0.008333333333333333);
      const bodies = [system.body("fighter", "hips")!, system.body("fighter", "left-foot")!, system.body("fighter", "right-foot")!], totalMass = bodies.reduce((sum, body) => sum + body.mass, 0), centerX = bodies.reduce((sum, body) => sum + body.x * body.mass, 0) / totalMass;
      const checkpoint = { world: world.checkpoint(), ragdoll: system.checkpoint() }, balanced = structuredClone(bodies[0]);
      system.applyImpulse("fighter", "hips", [20, 0, 0]); system.step(0.03333333333333333); world.restoreCheckpoint(checkpoint.world); system.restoreCheckpoint(checkpoint.ragdoll);
      expect(system.body("fighter", "hips")).toEqual(balanced);
      world.setVelocity("fighter:hips", 0, 0, 0); const beforePassiveX = system.body("fighter", "hips")!.x; system.setMode("fighter", { mode: "passive", discontinuous: true }); system.applyImpulse("fighter", "hips", [20, 0, 0]); for (let frame = 0; frame < 30; frame += 1) system.step(0.008333333333333333);
      return { centerX, supportsAfterPassive: [system.support("fighter", "left"), system.support("fighter", "right")], beforePassiveX, passiveX: system.body("fighter", "hips")!.x };
    };
    const balanced = run(4), uncontrolled = run(0);
    expect(Math.abs(balanced.centerX)).toBeLessThan(.38);
    expect(Math.abs(uncontrolled.centerX)).toBeGreaterThan(.9);
    expect(balanced.supportsAfterPassive).toEqual([undefined, undefined]);
    expect(balanced.passiveX).toBeGreaterThan(balanced.beforePassiveX + .3);
    expect(balanced).toEqual(run(4));
  });

  test("distributes grounded clip locomotion through the unplanted body while preserving the support contact", () => {
    const world = createRigidWorld3D({ capacity: 5, gravityY: 0, maxConstraints: 4, constraintIterations: 12 });
    world.addBody({ id: "ground", type: "static", shape: { kind: "box", halfX: 4, halfY: .1, halfZ: 4 }, y: -.1, collisionLayer: 4, collisionMask: 1 });
    const system = createRagdollSystem3D({ world });
    system.add(definition({ bodies: [
      { boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, y: .65, mass: 6, collisionLayer: 1, collisionMask: 4 } },
      { boneId: "torso", body: { shape: { kind: "sphere", radius: .2 }, y: 1.15, mass: 4, collisionLayer: 1, collisionMask: 4 } },
      { boneId: "foot", body: { shape: { kind: "sphere", radius: .1 }, y: .1, mass: 2, collisionLayer: 1, collisionMask: 4 } },
    ], joints: [], initialPose: { rotations: [] }, locomotion: { supportBoneIds: ["foot"], groundLayerMask: 4, probeDistance: .05, minimumNormalY: .7, maximumGroundedVerticalSpeedMetersPerSecond: 1 } }));
    expect(system.plantSupport("fighter", { id: "stance", boneId: "foot", groundLayerMask: 4, probeDistance: .05, stiffness: 1, damping: 1, maxImpulse: 100, breakImpulse: 1_000_000, maxBalanceImpulse: 0, forceDistribution: "whole-body" }).planted).toBe(true);
    const driven = system.driveRootMotion("fighter", { delta: [.1, 0, 0], durationSeconds: 0.016666666666666666, maxImpulse: 12 });
    expect(driven.map((handle) => world.body(handle)?.id)).toEqual(["fighter:hips", "fighter:torso"]);
    expect(system.body("fighter", "hips")!.velocityX).toBeGreaterThan(0);
    expect(system.body("fighter", "torso")!.velocityX).toBeGreaterThan(0);
    expect(system.body("fighter", "foot")!.velocityX).toBe(0);
  });

  test("does not let static balance brake intentional grounded travel", () => {
    const world = createRigidWorld3D({ capacity: 5, gravityY: 0, maxConstraints: 4, constraintIterations: 12 });
    world.addBody({ id: "ground", type: "static", shape: { kind: "box", halfX: 4, halfY: .1, halfZ: 4 }, y: -.1, collisionLayer: 4, collisionMask: 1 });
    const system = createRagdollSystem3D({ world });
    system.add(definition({ bodies: [
      { boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, y: .65, mass: 6, collisionLayer: 1, collisionMask: 4 } },
      { boneId: "torso", body: { shape: { kind: "sphere", radius: .2 }, y: 1.15, mass: 4, collisionLayer: 1, collisionMask: 4 } },
      { boneId: "left-foot", body: { shape: { kind: "sphere", radius: .1 }, x: -.2, y: .1, mass: 1, collisionLayer: 1, collisionMask: 4 } },
      { boneId: "right-foot", body: { shape: { kind: "sphere", radius: .1 }, x: .2, y: .1, mass: 1, collisionLayer: 1, collisionMask: 4 } },
    ], joints: [], initialPose: { rotations: [] } }));
    for (const [id, boneId] of [["left", "left-foot"], ["right", "right-foot"]] as const) {
      expect(system.plantSupport("fighter", { id, boneId, groundLayerMask: 4, probeDistance: .05, stiffness: 1, damping: 1, maxImpulse: 100, breakImpulse: 1_000_000, balanceRadiusMeters: .01, balanceStiffness: 1, balanceDamping: 1, maxBalanceImpulse: 100, predictionSeconds: .25, forceDistribution: "whole-body" }).planted).toBe(true);
    }
    world.setVelocity("fighter:hips", 0, 0, 2); world.setVelocity("fighter:torso", 0, 0, 2);
    system.driveRootMotion("fighter", { delta: [.03, 0, 0], durationSeconds: 0.008333333333333333, maxImpulse: 80 });
    system.step(0.008333333333333333);
    expect(system.body("fighter", "hips")!.velocityX).toBeGreaterThan(2);
    expect(Math.abs(system.body("fighter", "hips")!.velocityZ)).toBeLessThan(1);
  });

  test("holds the authored upright facing with bounded physical torque during grounded locomotion", () => {
    const world = createRigidWorld3D({ capacity: 4, gravityY: 0, maxConstraints: 4, constraintIterations: 12 });
    world.addBody({ id: "ground", type: "static", shape: { kind: "box", halfX: 4, halfY: .1, halfZ: 4 }, y: -.1, collisionLayer: 4, collisionMask: 1 });
    const system = createRagdollSystem3D({ world });
    system.add(definition({ bodies: [
      { boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, y: .65, mass: 6, collisionLayer: 1, collisionMask: 4 } },
      { boneId: "foot", body: { shape: { kind: "sphere", radius: .1 }, y: .1, mass: 2, collisionLayer: 1, collisionMask: 4 } },
    ], joints: [], initialPose: { rotations: [] }, locomotion: { supportBoneIds: ["foot"], groundLayerMask: 4, probeDistance: .05, minimumNormalY: .7, maximumGroundedVerticalSpeedMetersPerSecond: 1 } }));
    expect(system.plantSupport("fighter", { id: "stance", boneId: "foot", groundLayerMask: 4, probeDistance: .05, stiffness: 1, damping: 1, maxImpulse: 100, breakImpulse: 1_000_000, maxBalanceImpulse: 20, forceDistribution: "whole-body" }).planted).toBe(true);
    world.setRotation("fighter:hips", 0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8));
    for (let tick = 0; tick < 30; tick += 1) {
      system.driveRootMotion("fighter", { delta: [.02, 0, 0], durationSeconds: 0.008333333333333333, maxImpulse: 12, facing: [0, 0, 1] });
      system.step(0.008333333333333333);
    }
    const root = system.body("fighter", "hips")!;
    expect(Math.abs(root.rotationZ)).toBeLessThan(.25);
    expect(Math.hypot(root.angularVelocityX, root.angularVelocityY, root.angularVelocityZ)).toBeLessThan(5);
  });

  test("preserves whole-body linear momentum when a limb is muscle-driven", () => {
    const run = (actuation: "whole-body" | "external") => {
      const world = createRigidWorld3D({ capacity: 3, gravityY: 0, maxConstraints: 1 });
      const system = createRagdollSystem3D({ world });
      system.add(definition({
        rootBoneId: "hips",
        bodies: [
          { boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, mass: 8, collisionLayer: 1, collisionMask: 0 } },
          { boneId: "torso", body: { shape: { kind: "sphere", radius: .2 }, y: .5, mass: 6, collisionLayer: 1, collisionMask: 0 } },
          { boneId: "hand", body: { shape: { kind: "sphere", radius: .1 }, x: .8, y: .5, mass: 2, collisionLayer: 1, collisionMask: 0 } },
        ],
        joints: [], initialPose: { rotations: [] },
      }));
      const forcedHandles = system.applyActuatedImpulse("fighter", { boneId: "hand", impulse: [12, 0, 0], actuation });
      const bodies = [system.body("fighter", "hips")!, system.body("fighter", "torso")!, system.body("fighter", "hand")!];
      return { forcedHandles, velocities: bodies.map((body) => body.velocityX), momentum: bodies.reduce((sum, body) => sum + body.mass * body.velocityX, 0) };
    };
    const internal = run("whole-body"), external = run("external");
    expect(internal.forcedHandles).toHaveLength(3);
    expect(internal.velocities[2]).toBeCloseTo(6, 10);
    expect(internal.momentum).toBeCloseTo(0, 10);
    expect(external.forcedHandles).toHaveLength(1);
    expect(external.momentum).toBeCloseTo(12, 10);
    expect(internal).toEqual(run("whole-body"));
  });

  test("preserves whole-body intrinsic angular momentum when a limb is muscle-driven", () => {
    const run = (actuation: "whole-body" | "external") => {
      const world = createRigidWorld3D({ capacity: 3, gravityY: 0, maxConstraints: 1 });
      const system = createRagdollSystem3D({ world });
      system.add(definition({
        rootBoneId: "hips",
        bodies: [
          { boneId: "hips", body: { shape: { kind: "sphere", radius: .3 }, mass: 8, collisionLayer: 1, collisionMask: 0 } },
          { boneId: "torso", body: { shape: { kind: "sphere", radius: .2 }, y: .5, mass: 6, collisionLayer: 1, collisionMask: 0 } },
          { boneId: "hand", body: { shape: { kind: "sphere", radius: .1 }, x: .8, y: .5, mass: 2, collisionLayer: 1, collisionMask: 0, angularVelocity: [0, 0, 1] } },
        ],
        joints: [], initialPose: { rotations: [] },
      }));
      const forcedHandles = system.applyActuatedAngularVelocity("fighter", { boneId: "hand", angularVelocity: [0, 0, 4], actuation });
      const bodies = [system.body("fighter", "hips")!, system.body("fighter", "torso")!, system.body("fighter", "hand")!];
      const angularMomentumZ = bodies.reduce((sum, body) => sum + (body.shape.kind === "sphere" ? .4 * body.mass * body.shape.radius ** 2 : body.mass * (body.shape.halfX ** 2 + body.shape.halfY ** 2) / 3) * body.angularVelocityZ, 0);
      return { forcedHandles, spins: bodies.map((body) => body.angularVelocityZ), angularMomentumZ };
    };
    const internal = run("whole-body"), external = run("external");
    expect(internal.forcedHandles).toHaveLength(3);
    expect(internal.spins[2]).toBeCloseTo(4, 10);
    expect(internal.angularMomentumZ).toBeCloseTo(0.008000000000000002, 10);
    expect(external.forcedHandles).toHaveLength(1);
    expect(external.angularMomentumZ).toBeCloseTo(0.03200000000000001, 10);
    expect(internal).toEqual(run("whole-body"));
    const singleWorld = createRigidWorld3D({ capacity: 1, gravityY: 0 }), single = createRagdollSystem3D({ world: singleWorld });
    single.add(definition({ bodies: [{ boneId: "hand", body: { shape: { kind: "sphere", radius: .1 }, mass: 2 } }], rootBoneId: "hand", joints: [], initialPose: { rotations: [] } }));
    expect(() => single.applyActuatedAngularVelocity("fighter", { boneId: "hand", angularVelocity: [0, 0, 4], actuation: "whole-body" })).toThrow("add at least one other physical body");
    expect(single.body("fighter", "hand")!.angularVelocityZ).toBe(0);
    const rotatedWorld = createRigidWorld3D({ capacity: 2, gravityY: 0 }), rotated = createRagdollSystem3D({ world: rotatedWorld }), halfAngle = Math.PI / 8;
    rotated.add(definition({ bodies: [
      { boneId: "hips", body: { shape: { kind: "box", halfX: .4, halfY: .6, halfZ: .2 }, mass: 8 } },
      { boneId: "hand", body: { shape: { kind: "box", halfX: .08, halfY: .2, halfZ: .06 }, mass: 2, rotation: [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)] } },
    ], rootBoneId: "hips", joints: [], initialPose: { rotations: [] } }));
    rotated.applyActuatedAngularVelocity("fighter", { boneId: "hand", angularVelocity: [2, 3, 4], actuation: "whole-body" });
    expect([rotated.body("fighter", "hand")!.angularVelocityX, rotated.body("fighter", "hand")!.angularVelocityY, rotated.body("fighter", "hand")!.angularVelocityZ]).toEqual([expect.closeTo(2, 10), expect.closeTo(3, 10), expect.closeTo(4, 10)]);
  });

  test("drives a joint in parent-local space with equal-and-opposite torque", () => {
    const run = () => {
      const world = createRigidWorld3D({ capacity: 2, gravityY: 0, maxConstraints: 3 });
      const system = createRagdollSystem3D({ world });
      system.add(definition({ rootBoneId: "chest", bodies: [
        { boneId: "chest", body: { shape: { kind: "sphere", radius: .3 }, mass: 8, collisionLayer: 1, collisionMask: 0 } },
        { boneId: "forearm", body: { shape: { kind: "sphere", radius: .15 }, x: .5, mass: 2, collisionLayer: 1, collisionMask: 0 } },
      ], joints: [{ id: "elbow", parentBoneId: "chest", childBoneId: "forearm", poseJointIndex: 0, motorStiffness: 0, maxTorqueImpulse: 0 }], initialPose: { rotations: [0, 0, 0, 1] } }));
      const handles = system.applyJointDrive("fighter", { jointId: "elbow", axisParentLocal: [0, 0, 1], targetAngularVelocity: 3, maxTorqueImpulse: 10 });
      const parent = system.body("fighter", "chest")!, child = system.body("fighter", "forearm")!; if (parent.shape.kind !== "sphere" || child.shape.kind !== "sphere") throw new Error("expected sphere bodies"); const parentInertia = .4 * parent.mass * parent.shape.radius ** 2, childInertia = .4 * child.mass * child.shape.radius ** 2;
      return { handles, relativeSpin: child.angularVelocityZ - parent.angularVelocityZ, angularMomentum: parent.angularVelocityZ * parentInertia + child.angularVelocityZ * childInertia };
    };
    const driven = run(); expect(driven.handles).toHaveLength(2); expect(driven.relativeSpin).toBeCloseTo(3, 10); expect(driven.angularMomentum).toBeCloseTo(0, 10);
    expect(run()).toEqual(run());
    const world = createRigidWorld3D({ capacity: 1, gravityY: 0 }), system = createRagdollSystem3D({ world });
    system.add(definition({ rootBoneId: "hips", bodies: [{ boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, mass: 8 } }], joints: [], initialPose: { rotations: [] } }));
    expect(() => system.validateJointDrive("fighter", { jointId: "missing", axisParentLocal: [0, 0, 1], targetAngularVelocity: 3, maxTorqueImpulse: 1 })).toThrow("joint missing does not exist");
  });

  test("distributes one effector velocity goal through a connected articulated chain", () => {
    const run = () => {
      const world = createRigidWorld3D({ capacity: 3, gravityY: 0, maxConstraints: 6 });
      const system = createRagdollSystem3D({ world });
      system.add(definition({ rootBoneId: "chest", bodies: [
        { boneId: "chest", body: { shape: { kind: "sphere", radius: .3 }, mass: 8, collisionLayer: 1, collisionMask: 0 } },
        { boneId: "forearm", body: { shape: { kind: "sphere", radius: .18 }, x: .55, y: .25, mass: 3, collisionLayer: 1, collisionMask: 0 } },
        { boneId: "hand", body: { shape: { kind: "sphere", radius: .12 }, x: .95, y: .55, mass: 2, collisionLayer: 1, collisionMask: 0 } },
      ], joints: [
        { id: "shoulder", parentBoneId: "chest", childBoneId: "forearm", poseJointIndex: 0, motorStiffness: 0, maxTorqueImpulse: 0 },
        { id: "elbow", parentBoneId: "forearm", childBoneId: "hand", poseJointIndex: 1, motorStiffness: 0, maxTorqueImpulse: 0 },
      ], initialPose: { rotations: [0, 0, 0, 1, 0, 0, 0, 1] } }));
      const handles = system.applyEffectorDrive("fighter", { effectorBoneId: "hand", jointIds: ["shoulder", "elbow"], targetVelocity: [0, 4, 0], velocityGain: .5, maxTorqueImpulse: 10 });
      const bodies = [system.body("fighter", "chest")!, system.body("fighter", "forearm")!, system.body("fighter", "hand")!];
      const momentum = bodies.reduce((sum, body) => { if (body.shape.kind !== "sphere") throw new Error("expected sphere body"); return sum + .4 * body.mass * body.shape.radius ** 2 * body.angularVelocityZ; }, 0);
      return { handles, spins: bodies.map((body) => body.angularVelocityZ), momentum };
    };
    const driven = run(); expect(driven.handles).toHaveLength(3); expect(driven.spins[0]).toBeLessThan(0); expect(driven.spins[2]).toBeGreaterThan(0); expect(driven.momentum).toBeCloseTo(0, 10); expect(driven).toEqual(run());
    const world = createRigidWorld3D({ capacity: 3, gravityY: 0, maxConstraints: 6 }), system = createRagdollSystem3D({ world });
    system.add(definition({ rootBoneId: "chest", bodies: [{ boneId: "chest", body: { shape: { kind: "sphere", radius: .3 }, mass: 8 } }, { boneId: "forearm", body: { shape: { kind: "sphere", radius: .2 }, x: .5, mass: 3 } }, { boneId: "hand", body: { shape: { kind: "sphere", radius: .1 }, x: 1, mass: 2 } }], joints: [{ id: "shoulder", parentBoneId: "chest", childBoneId: "forearm", poseJointIndex: 0 }, { id: "elbow", parentBoneId: "forearm", childBoneId: "hand", poseJointIndex: 1 }], initialPose: { rotations: [0, 0, 0, 1, 0, 0, 0, 1] } }));
    expect(() => system.validateEffectorDrive("fighter", { effectorBoneId: "hand", jointIds: ["elbow", "shoulder"], targetVelocity: [0, 1, 0], maxTorqueImpulse: 1 })).toThrow("not one connected base-to-effector chain");
    expect(() => system.validateEffectorDrive("fighter", { effectorBoneId: "forearm", jointIds: ["shoulder", "elbow"], targetVelocity: [0, 1, 0], maxTorqueImpulse: 1 })).toThrow("must be the child body of final joint elbow");
  });

  test("resolves planted support through the body into one deterministic effector chain", () => {
    const run = (mode: "auto" | "free") => {
      const world = createRigidWorld3D({ capacity: 5, gravityY: 0, maxConstraints: 7, constraintIterations: 12 });
      world.addBody({ id: "ground", type: "static", shape: { kind: "box", halfX: 20, halfY: .1, halfZ: 20 }, y: -.1, collisionLayer: 4 });
      const system = createRagdollSystem3D({ world });
      system.add(definition({ rootBoneId: "hips", bodies: [
        { boneId: "foot", body: { shape: { kind: "sphere", radius: .1 }, y: .1, mass: 2, collisionLayer: 1, collisionMask: 4 } },
        { boneId: "hips", body: { shape: { kind: "sphere", radius: .25 }, y: .8, mass: 8, collisionLayer: 1, collisionMask: 0 } },
        { boneId: "forearm", body: { shape: { kind: "sphere", radius: .16 }, x: .5, y: 1, mass: 3, collisionLayer: 1, collisionMask: 0 } },
        { boneId: "hand", body: { shape: { kind: "sphere", radius: .1 }, x: .9, y: 1.2, mass: 2, collisionLayer: 1, collisionMask: 0 } },
      ], joints: [
        { id: "ankle", parentBoneId: "hips", childBoneId: "foot", poseJointIndex: 0, motorStiffness: 0, maxTorqueImpulse: 0 },
        { id: "shoulder", parentBoneId: "hips", childBoneId: "forearm", poseJointIndex: 1, motorStiffness: 0, maxTorqueImpulse: 0 },
        { id: "elbow", parentBoneId: "forearm", childBoneId: "hand", poseJointIndex: 2, motorStiffness: 0, maxTorqueImpulse: 0 },
      ], initialPose: { rotations: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] } }));
      expect(system.plantSupport("fighter", { id: "stance", boneId: "foot", groundLayerMask: 4, probeDistance: .05, stiffness: 1, damping: 1, maxImpulse: 100, breakImpulse: 1_000_000 }).planted).toBe(true);
      const support = system.resolveEffectorDriveSupport("fighter", "hand", mode);
      const handles = system.applyEffectorDrive("fighter", { effectorBoneId: "hand", jointIds: support?.jointIds ?? ["shoulder", "elbow"], ...(support ? { baseBoneId: support.boneId } : {}), targetVelocity: [0, 3, 0], velocityGain: .5, maxTorqueImpulse: 10 });
      const bodies = ["foot", "hips", "forearm", "hand"].map((boneId) => system.body("fighter", boneId)!);
      const momentum = bodies.reduce((sum, body) => { if (body.shape.kind !== "sphere") throw new Error("expected sphere body"); return sum + .4 * body.mass * body.shape.radius ** 2 * body.angularVelocityZ; }, 0);
      return { support, handles, footSpin: bodies[0]!.angularVelocityZ, handSpin: bodies[3]!.angularVelocityZ, momentum };
    };
    const braced = run("auto"), free = run("free");
    expect(braced.support).toEqual({ supportId: "stance", boneId: "foot", jointIds: ["ankle", "shoulder", "elbow"] });
    expect(braced.handles).toHaveLength(4); expect(Math.abs(braced.footSpin)).toBeGreaterThan(.01); expect(braced.handSpin).toBeGreaterThan(0); expect(braced.momentum).toBeCloseTo(0, 10);
    expect(free.support).toBeUndefined(); expect(free.handles).toHaveLength(3); expect(free.footSpin).toBe(0); expect(run("auto")).toEqual(braced);
    const invalidSystem = createSystem();
    expect(() => Reflect.apply(invalidSystem.resolveEffectorDriveSupport, invalidSystem, ["fighter", "torso", "random"])).toThrow("choose auto or free");
  });

  test("drives effector orientation with bounded momentum-conserving chain torque", () => {
    const run = () => {
      const world = createRigidWorld3D({ capacity: 3, gravityY: 0, maxConstraints: 6 });
      const system = createRagdollSystem3D({ world });
      system.add(definition({ rootBoneId: "chest", bodies: [
        { boneId: "chest", body: { shape: { kind: "sphere", radius: .3 }, mass: 8, collisionLayer: 1, collisionMask: 0 } },
        { boneId: "forearm", body: { shape: { kind: "sphere", radius: .18 }, x: .55, mass: 3, collisionLayer: 1, collisionMask: 0 } },
        { boneId: "hand", body: { shape: { kind: "sphere", radius: .12 }, x: .95, mass: 2, collisionLayer: 1, collisionMask: 0 } },
      ], joints: [
        { id: "shoulder", parentBoneId: "chest", childBoneId: "forearm", poseJointIndex: 0, motorStiffness: 0, maxTorqueImpulse: 0 },
        { id: "elbow", parentBoneId: "forearm", childBoneId: "hand", poseJointIndex: 1, motorStiffness: 0, maxTorqueImpulse: 0 },
      ], initialPose: { rotations: [0, 0, 0, 1, 0, 0, 0, 1] } }));
      const handles = system.applyEffectorDrive("fighter", { effectorBoneId: "hand", jointIds: ["shoulder", "elbow"], targetVelocity: [0, 0, 0], maxTorqueImpulse: .1, targetAngularVelocity: [0, 0, 8], maxAngularTorqueImpulse: .02 });
      const bodies = [system.body("fighter", "chest")!, system.body("fighter", "forearm")!, system.body("fighter", "hand")!];
      const momentum = bodies.reduce((sum, body) => { if (body.shape.kind !== "sphere") throw new Error("expected sphere body"); return sum + .4 * body.mass * body.shape.radius ** 2 * body.angularVelocityZ; }, 0);
      return { handles, spins: bodies.map((body) => body.angularVelocityZ), momentum };
    };
    const driven = run(); expect(driven.handles).toHaveLength(3); expect(driven.spins[2]).toBeGreaterThan(0); expect(driven.spins[2]).toBeLessThan(8); expect(driven.spins[0]).toBeLessThan(0); expect(driven.momentum).toBeCloseTo(0, 10); expect(driven).toEqual(run());
    const world = createRigidWorld3D({ capacity: 3, gravityY: 0, maxConstraints: 6 }), system = createRagdollSystem3D({ world });
    system.add(definition({ rootBoneId: "chest", bodies: [{ boneId: "chest", body: { shape: { kind: "sphere", radius: .3 }, mass: 8 } }, { boneId: "forearm", body: { shape: { kind: "sphere", radius: .2 }, x: .5, mass: 3 } }, { boneId: "hand", body: { shape: { kind: "sphere", radius: .1 }, x: 1, mass: 2 } }], joints: [{ id: "shoulder", parentBoneId: "chest", childBoneId: "forearm", poseJointIndex: 0 }, { id: "elbow", parentBoneId: "forearm", childBoneId: "hand", poseJointIndex: 1 }], initialPose: { rotations: [0, 0, 0, 1, 0, 0, 0, 1] } }));
    expect(() => system.validateEffectorDrive("fighter", { effectorBoneId: "hand", jointIds: ["shoulder", "elbow"], targetVelocity: [0, 0, 0], maxTorqueImpulse: 1, targetAngularVelocity: [0, 0, 3] })).toThrow("maxAngularTorqueImpulse");
  });

  test("predictively braces the whole body before projected center of mass leaves planted feet", () => {
    const run = (predictionSeconds: number) => {
      const world = createRigidWorld3D({ capacity: 4, gravityY: 0, maxConstraints: 2, constraintIterations: 12 });
      world.addBody({ id: "ground", type: "static", shape: { kind: "box", halfX: 20, halfY: .1, halfZ: 20 }, y: -.1, collisionLayer: 4 });
      const system = createRagdollSystem3D({ world });
      system.add(definition({
        rootBoneId: "hips",
        bodies: [
          { boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, y: 1, mass: 8, collisionLayer: 1, collisionMask: 0 } },
          { boneId: "left-foot", body: { shape: { kind: "sphere", radius: .1 }, x: -.25, y: .1, mass: 1, collisionLayer: 1, collisionMask: 4 } },
          { boneId: "right-foot", body: { shape: { kind: "sphere", radius: .1 }, x: .25, y: .1, mass: 1, collisionLayer: 1, collisionMask: 4 } },
        ],
        joints: [], initialPose: { rotations: [] },
      }));
      for (const [id, boneId] of [["left", "left-foot"], ["right", "right-foot"]] as const) expect(system.plantSupport("fighter", { id, boneId, groundLayerMask: 4, probeDistance: .05, stiffness: 1, damping: 1, maxImpulse: 100, breakImpulse: 1_000_000, balanceRadiusMeters: .12, balanceStiffness: .6, balanceDamping: .8, maxBalanceImpulse: 8, predictionSeconds, forceDistribution: "whole-body" }).planted).toBe(true);
      for (const boneId of ["hips", "left-foot", "right-foot"]) world.setVelocity(`fighter:${boneId}`, 2, 0, 0);
      system.step(0.008333333333333333);
      const bodies = [system.body("fighter", "hips")!, system.body("fighter", "left-foot")!, system.body("fighter", "right-foot")!], totalMass = bodies.reduce((sum, body) => sum + body.mass, 0);
      return bodies.reduce((sum, body) => sum + body.velocityX * body.mass, 0) / totalMass;
    };
    const predictive = run(.25), reactive = run(0);
    expect(predictive).toBeLessThan(reactive - .1);
    expect(predictive).toBe(run(.25));
  });

  test("takes a deterministic capture step when forecast momentum escapes planted support", () => {
    const setup = () => {
      const world = createRigidWorld3D({ capacity: 4, gravityY: -9.81, maxConstraints: 3, constraintIterations: 12 });
      world.addBody({ id: "ground", type: "static", shape: { kind: "box", halfX: 20, halfY: .1, halfZ: 20 }, y: -.1, collisionLayer: 4 });
      const system = createRagdollSystem3D({ world });
      system.add(definition({ rootBoneId: "hips", bodies: [
        { boneId: "hips", body: { shape: { kind: "sphere", radius: .2 }, y: 1, mass: 8, collisionLayer: 1, collisionMask: 4 } },
        { boneId: "left-foot", body: { shape: { kind: "sphere", radius: .1 }, x: -.25, y: .1, z: .15, mass: 1, collisionLayer: 1, collisionMask: 4 } },
        { boneId: "right-foot", body: { shape: { kind: "sphere", radius: .1 }, x: .25, y: .1, z: -.15, mass: 1, collisionLayer: 1, collisionMask: 4 } },
      ], joints: [], initialPose: { rotations: [] } }));
      const support = (id: string, boneId: string) => system.plantSupport("fighter", { id, boneId, groundLayerMask: 4, probeDistance: .1, stiffness: 1, damping: 1, maxImpulse: 100, breakImpulse: 1_000_000, balanceRadiusMeters: .12, maxBalanceImpulse: 0 });
      expect(support("left", "left-foot").planted).toBe(true); expect(support("right", "right-foot").planted).toBe(true);
      return { world, system };
    };
    const begin = (system: ReturnType<typeof createRagdollSystem3D>) => system.beginPredictiveStep("fighter", { id: "capture", boneId: "right-foot", direction: [1, 0, 0], speedMetersPerSecond: 3, predictionSeconds: .3, maximumDistance: .8, durationSeconds: .3, liftHeight: .18, groundLayerMask: 4, probeHeight: .5, probeDistance: 1, minimumNormalY: .7, stiffness: .9, damping: .95, maximumDriveImpulse: 80, landingTolerance: .08, maximumLandingSpeed: 1.5 });
    const first = setup(), planned = begin(first.system);
    expect(planned).toEqual(expect.objectContaining({ state: "moving", boneId: "right-foot", target: expect.any(Array) }));
    expect(planned.target![0]).toBeGreaterThan(.7); expect(first.system.support("fighter", "right")).toBeUndefined(); expect(first.system.support("fighter", "left")?.planted).toBe(true);
    let maximumFootSpeed = 0;
    for (let tick = 0; tick < 12; tick += 1) { first.system.step(0.008333333333333333); const foot = first.system.body("fighter", "right-foot")!; maximumFootSpeed = Math.max(maximumFootSpeed, Math.hypot(foot.velocityX, foot.velocityY, foot.velocityZ)); }
    const checkpoint = { world: first.world.checkpoint(), ragdoll: first.system.checkpoint() };
    for (let tick = 0; tick < 60; tick += 1) { first.system.step(0.008333333333333333); const foot = first.system.body("fighter", "right-foot")!; maximumFootSpeed = Math.max(maximumFootSpeed, Math.hypot(foot.velocityX, foot.velocityY, foot.velocityZ)); }
    const expected = { status: first.system.stepStatus("fighter", "capture"), foot: first.system.body("fighter", "right-foot"), support: first.system.support("fighter", "capture") };
    expect(expected.status).toEqual(expect.objectContaining({ state: "planted", target: planned.target }));
    expect(maximumFootSpeed).toBeLessThan(10);
    expect(expected.foot!.x).toBeGreaterThan(.7); expect(expected.foot!.y).toBeCloseTo(.1, 1); expect(expected.support?.planted).toBe(true);
    const landedSupport = first.system.checkpoint().ragdolls[0]!.supports.find((item) => item.id === "capture");
    expect(landedSupport).toEqual(expect.objectContaining({ balanceRadiusMeters: .255, balanceStiffness: .6, maxBalanceImpulse: 6.4, forceDistribution: "whole-body" }));
    expect(landedSupport!.predictionSeconds).toBeCloseTo(.235, 10);
    first.world.restoreCheckpoint(checkpoint.world); first.system.restoreCheckpoint(checkpoint.ragdoll);
    for (let tick = 0; tick < 60; tick += 1) first.system.step(0.008333333333333333);
    expect({ status: first.system.stepStatus("fighter", "capture"), foot: first.system.body("fighter", "right-foot"), support: first.system.support("fighter", "capture") }).toEqual(expected);
    const contained = setup();
    expect(contained.system.beginPredictiveStep("fighter", { id: "unneeded", boneId: "right-foot", direction: [1, 0, 0], speedMetersPerSecond: .1, predictionSeconds: .1, maximumDistance: .8, durationSeconds: .3, liftHeight: .18, groundLayerMask: 4 })).toEqual(expect.objectContaining({ state: "contained" }));
    expect(contained.system.support("fighter", "right")?.planted).toBe(true);
    const authoredCadence = setup(); authoredCadence.system.clearSupport("fighter", "right");
    expect(authoredCadence.system.beginPredictiveStep("fighter", { id: "required-cadence", boneId: "right-foot", direction: [1, 0, 0], speedMetersPerSecond: .1, predictionSeconds: .1, maximumDistance: .8, durationSeconds: .3, liftHeight: .18, groundLayerMask: 4 })).toEqual(expect.objectContaining({ state: "moving", boneId: "right-foot", target: expect.any(Array) }));
    expect(authoredCadence.system.support("fighter", "left")?.planted).toBe(true);
    const groundedOnly = setup(); groundedOnly.system.clearSupport("fighter", "right");
    expect(groundedOnly.system.beginPredictiveStep("fighter", { id: "forbidden-flight", boneId: "left-foot", direction: [1, 0, 0], speedMetersPerSecond: 3, durationSeconds: .3, groundLayerMask: 4 })).toEqual(expect.objectContaining({ state: "missed", reason: "stepping would remove the character's only planted support" }));
    const running = setup(); running.system.clearSupport("fighter", "right");
    expect(running.system.beginPredictiveStep("fighter", { id: "planned-flight", boneId: "left-foot", direction: [1, 0, 0], speedMetersPerSecond: 3, durationSeconds: .3, groundLayerMask: 4, allowFlight: true })).toEqual(expect.objectContaining({ state: "moving", target: expect.any(Array) }));
    expect(running.system.support("fighter", "left")).toBeUndefined();
    expect(running.system.status("fighter").locomotionState).toBe("airborne");

    const runBallisticExchange = () => {
      const flight = setup();
      expect(flight.system.beginPredictiveStep("fighter", { id: "right-swing", boneId: "right-foot", direction: [1, 0, 0], speedMetersPerSecond: 3, durationSeconds: .3, groundLayerMask: 4 })).toEqual(expect.objectContaining({ state: "moving" }));
      for (let tick = 0; tick < 6; tick += 1) flight.system.step(0.008333333333333333);
      expect(flight.system.beginPredictiveStep("fighter", { id: "left-takeoff", boneId: "left-foot", direction: [1, 0, 0], speedMetersPerSecond: 3, durationSeconds: .5, groundLayerMask: 4, allowFlight: true })).toEqual(expect.objectContaining({ state: "moving" }));
      flight.system.step(0.008333333333333333);
      const bodies = [flight.system.body("fighter", "hips")!, flight.system.body("fighter", "left-foot")!, flight.system.body("fighter", "right-foot")!];
      const totalMass = bodies.reduce((sum, body) => sum + body.mass, 0);
      return {
        centerVelocityY: bodies.reduce((sum, body) => sum + body.velocityY * body.mass, 0) / totalMass,
        checkpoint: flight.system.checkpoint().ragdolls[0]!.steps,
      };
    };
    const ballistic = runBallisticExchange();
    expect(ballistic.centerVelocityY).toBeGreaterThan(.7);
    expect(ballistic.checkpoint?.find((step) => step.id === "left-takeoff")).toEqual(expect.objectContaining({ takeoffApplied: true, takeoffVelocityY: expect.any(Number) }));
    expect(ballistic).toEqual(runBallisticExchange());

    const continuousFlight = setup();
    continuousFlight.system.beginPredictiveStep("fighter", { id: "right-swing", boneId: "right-foot", direction: [1, 0, 0], speedMetersPerSecond: 3, durationSeconds: .3, groundLayerMask: 4 });
    for (let tick = 0; tick < 6; tick += 1) continuousFlight.system.step(0.008333333333333333);
    continuousFlight.system.beginPredictiveStep("fighter", { id: "left-takeoff", boneId: "left-foot", direction: [1, 0, 0], speedMetersPerSecond: 3, durationSeconds: .5, groundLayerMask: 4, allowFlight: true });
    continuousFlight.system.step(0.008333333333333333);
    continuousFlight.system.beginPredictiveStep("fighter", { id: "right-midair", boneId: "right-foot", direction: [1, 0, 0], speedMetersPerSecond: 3, durationSeconds: .3, groundLayerMask: 4, allowFlight: true });
    expect(continuousFlight.system.checkpoint().ragdolls[0]!.steps?.find((step) => step.id === "right-midair")?.takeoffVelocityY).toBeUndefined();
  });

  test("declines unsupported, steep, and fast plant attempts without allocating a constraint", () => {
    const world = createRigidWorld3D({ capacity: 4, gravityY: 0, maxConstraints: 4 });
    world.addBody({ id: "ground", type: "static", shape: { kind: "box", halfX: 20, halfY: .1, halfZ: 20 }, y: -.1, collisionLayer: 4 });
    const system = createRagdollSystem3D({ world }); system.add(definition());
    world.setVelocity("fighter:torso", 4, 0, 0);
    expect(system.plantSupport("fighter", { id: "too-fast", boneId: "torso", groundLayerMask: 4, probeDistance: .4, maximumPlantSpeed: 1 })).toEqual({ id: "too-fast", boneId: "torso", planted: false });
    expect(system.plantSupport("fighter", { id: "missing", boneId: "torso", groundLayerMask: 8, probeDistance: .4 })).toEqual({ id: "missing", boneId: "torso", planted: false });
    expect(world.constraintCount()).toBe(2);
  });

  test("replays passive impulses and physical rotation exactly", () => {
    const run = () => {
      const system = createSystem();
      system.setMode("fighter", { mode: "passive", discontinuous: true });
      system.applyImpulse("fighter", "torso", [12, 3, 0], [2, 1.3, 0]);
      for (let frame = 0; frame < 90; frame += 1) system.step(0.016666666666666666);
      return { hips: system.body("fighter", "hips"), torso: system.body("fighter", "torso"), status: system.status("fighter") };
    };
    const first = run();
    expect(Math.abs(first.torso!.rotationZ)).toBeGreaterThan(0.01);
    expect(first).toEqual(run());
  });

  test("settles passive bodies then physically recovers into an editable pose", () => {
    const system = createSystem();
    system.setMode("fighter", { mode: "passive", discontinuous: true });
    for (let frame = 0; frame < 20; frame += 1) system.step(0.016666666666666666);
    expect(system.status("fighter").mode).toBe("settled");

    const before = system.body("fighter", "hips")!;
    system.beginRecovery("fighter", {
      pose: { rotations: [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)] },
      rootPosition: [0, 0, 0],
      rootRotation: [0, 0, 0, 1],
      durationSeconds: 0.8,
    });
    system.step(0.016666666666666666);
    const first = system.body("fighter", "hips")!;
    expect(Math.abs(first.x - before.x)).toBeLessThan(0.2);
    expect(system.status("fighter").motorWeight).toBeGreaterThan(0);

    for (let frame = 0; frame < 240; frame += 1) system.step(0.016666666666666666);
    const after = system.status("fighter");
    expect(after.root.x).toBeCloseTo(0, 1);
    expect(after.mode).toBe("animated");
    expect(after.motorWeight).toBe(1);
    expect(system.body("fighter", "torso")!.rotationZ).toBeGreaterThan(0.1);
  });

  test("inertializes recovery motor targets from the physical pose and restores that trajectory exactly", () => {
    const system = createSystem();
    system.setMode("fighter", { mode: "passive", discontinuous: true });
    system.world.applyTorqueImpulse("fighter:torso", 0, 0, 2);
    for (let frame = 0; frame < 8; frame += 1) system.step(0.016666666666666666);
    const hips = system.body("fighter", "hips")!, torso = system.body("fighter", "torso")!;
    const inverseParent = [-hips.rotationX, -hips.rotationY, -hips.rotationZ, hips.rotationW] as const;
    const child = [torso.rotationX, torso.rotationY, torso.rotationZ, torso.rotationW] as const;
    const physicalRelative = multiply(inverseParent, child);
    const target = [0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)] as const;
    system.beginRecovery("fighter", { pose: { rotations: target }, rootPosition: [2, 0, 0], rootRotation: [0, 0, 0, 1], durationSeconds: .8, poseBlendSeconds: .4 });
    const initialMotor = system.world.constraint("fighter:spine:motor");
    expect(initialMotor?.kind).toBe("angular-motor");
    if (!initialMotor || initialMotor.kind !== "angular-motor") throw new Error("motor missing");
    expect(initialMotor.targetRelativeRotation).toEqual(physicalRelative);

    for (let frame = 0; frame < 12; frame += 1) system.step(0.016666666666666666);
    const midpoint = system.world.constraint("fighter:spine:motor");
    expect(midpoint?.kind).toBe("angular-motor");
    if (!midpoint || midpoint.kind !== "angular-motor") throw new Error("motor missing");
    expect(midpoint.targetRelativeRotation).not.toEqual(physicalRelative);
    expect(midpoint.targetRelativeRotation).not.toEqual(target);
    const checkpoint = system.checkpoint(), worldCheckpoint = system.world.checkpoint();
    for (let frame = 0; frame < 12; frame += 1) system.step(0.016666666666666666);
    const expected = system.world.constraint("fighter:spine:motor");
    system.world.restoreCheckpoint(worldCheckpoint); system.restoreCheckpoint(checkpoint);
    for (let frame = 0; frame < 12; frame += 1) system.step(0.016666666666666666);
    expect(system.world.constraint("fighter:spine:motor")).toEqual(expected);
  });

  test("clamps recovery pose easing unless a deliberate cut is acknowledged", () => {
    const smooth = createSystem();
    smooth.beginRecovery("fighter", { pose: identityPose, rootPosition: [0, 0, 0], rootRotation: [0, 0, 0, 1], poseBlendSeconds: 0 });
    expect(smooth.checkpoint().ragdolls[0]!.recovery?.poseBlendSeconds).toBe(.2);
    const cut = createSystem();
    cut.beginRecovery("fighter", { pose: identityPose, rootPosition: [0, 0, 0], rootRotation: [0, 0, 0, 1], poseTransition: "cut", poseBlendSeconds: 1 });
    expect(cut.checkpoint().ragdolls[0]!.recovery?.poseBlendSeconds).toBe(0);
  });

  test("refuses to begin recovery inside occupied space", () => {
    const world = createRigidWorld3D({ capacity: 3, gravityY: 0, maxConstraints: 4 });
    world.addBody({ id: "low-branch", type: "static", shape: { kind: "box", halfX: .5, halfY: .5, halfZ: .5 }, collisionLayer: 2, collisionMask: 1 });
    const system = createRagdollSystem3D({ world }); system.add(definition());
    const target = { pose: identityPose, rootPosition: [0, 0, 0] as const, rootRotation: [0, 0, 0, 1] as const };
    expect(system.inspectRecovery("fighter", target)).toEqual({ ready: false, blocker: "obstructed", obstructingBodyId: "low-branch", obstructedBoneId: "hips", obstructionPhase: "target" });
    expect(() => system.beginRecovery("fighter", target)).toThrow("recovery target for hips is obstructed by low-branch");
    expect(system.status("fighter").mode).toBe("animated");
  });

  test("rejects a recovery when a non-root body target intersects terrain", () => {
    const world = createRigidWorld3D({ capacity: 3, gravityY: 0, maxConstraints: 4 });
    world.addBody({ id: "torso-branch", type: "static", shape: { kind: "box", halfX: .1, halfY: .1, halfZ: .1 }, y: .8, collisionLayer: 2, collisionMask: 1 });
    const system = createRagdollSystem3D({ world }); system.add(definition());
    const target = { pose: identityPose, rootPosition: [0, 0, 0] as const, rootRotation: [0, 0, 0, 1] as const };
    expect(system.inspectRecovery("fighter", target)).toEqual({ ready: false, blocker: "obstructed", obstructingBodyId: "torso-branch", obstructedBoneId: "torso", obstructionPhase: "target" });
  });

  test("rejects a recovery whose swept body path crosses terrain even when its destination is clear", () => {
    const world = createRigidWorld3D({ capacity: 3, gravityY: 0, maxConstraints: 4 });
    world.addBody({ id: "path-post", type: "static", shape: { kind: "box", halfX: .05, halfY: .1, halfZ: .05 }, x: 1, collisionLayer: 2, collisionMask: 1 });
    const system = createRagdollSystem3D({ world }); system.add(definition());
    const target = { pose: identityPose, rootPosition: [0, 0, 0] as const, rootRotation: [0, 0, 0, 1] as const };
    expect(system.inspectRecovery("fighter", target)).toEqual({ ready: false, blocker: "obstructed", obstructingBodyId: "path-post", obstructedBoneId: "hips", obstructionPhase: "path" });
  });

  test("completes recovery only when the authored support bone reaches stable ground", () => {
    const run = (withGround: boolean) => {
      const world = createRigidWorld3D({ capacity: withGround ? 2 : 1, gravityY: 0, maxConstraints: 1 });
      if (withGround) world.addBody({ id: "ground", type: "static", shape: { kind: "box", halfX: 4, halfY: .1, halfZ: 4 }, y: -.1, collisionLayer: 4, collisionMask: 2 });
      const system = createRagdollSystem3D({ world });
      system.add(definition({ rootBoneId: "foot", bodies: [{ boneId: "foot", body: { shape: { kind: "sphere", radius: .15 }, y: .15, mass: 2, collisionLayer: 2, collisionMask: 4 } }], joints: [], initialPose: { rotations: [] } }));
      system.beginRecovery("fighter", { pose: { rotations: [] }, rootPosition: [0, .15, 0], rootRotation: [0, 0, 0, 1], durationSeconds: .2, requireStableSupport: true, supportBoneIds: ["foot"], groundLayerMask: 4, supportProbeDistance: .1 });
      for (let frame = 0; frame < 60; frame += 1) system.step(0.008333333333333333);
      return system.status("fighter");
    };
    expect(run(true)).toEqual(expect.objectContaining({ mode: "animated" }));
    expect(run(false)).toEqual(expect.objectContaining({ mode: "recovering", recoveryBlocker: "unsupported" }));
    expect(run(true)).toEqual(run(true));
  });

  test("rolls back an invalid articulated definition atomically", () => {
    const world = createRigidWorld3D({ capacity: 2, gravityY: 0, maxConstraints: 2 });
    const system = createRagdollSystem3D({ world });
    expect(() => system.add(definition({ rootBoneId: "missing" }))).toThrow("root body missing");
    expect(world.diagnostics.bodies).toBe(0);
    expect(world.constraintCount()).toBe(0);
    expect(system.add(definition())).toBe("fighter");
  });
});

function multiply(a: readonly [number, number, number, number], b: readonly [number, number, number, number]): [number, number, number, number] {
  const value = [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]] as const;
  const length = Math.hypot(...value); return tuple4((value[0]!) / length, (value[1]!) / length, (value[2]!) / length, (value[3]!) / length);
}
