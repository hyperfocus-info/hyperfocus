import { describe, expect, test } from "bun:test";
import { PHYSICS_DEBUG_CONTACT, PHYSICS_DEBUG_JOINT, PHYSICS_DEBUG_SEGMENT_STRIDE, PHYSICS_DEBUG_STATIC, createPhysicsWorld2D } from "./2d.ts";

describe("first-party 2D physics world", () => {
  test("can round persistent state through float32 storage for JS/WASM parity", () => {
    const world = createPhysicsWorld2D({ capacity: 1, maxContacts: 1, maxJoints: 0, gravityY: 0, precision: "float32" });
    world.addBody({ id: "body", shape: { kind: "circle", radius: 0.1 }, x: 1 / 3, velocityX: 1 / 7 });
    world.step(1 / 60);

    expect(world.precision).toBe("float32");
    expect(world.body("body")!.x).toBe(Math.fround(Math.fround(1 / 3) + Math.fround(1 / 7) * (1 / 60)));
    expect(world.numericStorageBytes).toBeLessThan(createPhysicsWorld2D({ capacity: 1, maxContacts: 1, maxJoints: 0 }).numericStorageBytes);
  });

  test("resolves a dynamic box against static ground", () => {
    const world = createPhysicsWorld2D({ capacity: 8, gravityY: 100, positionIterations: 4 });
    world.addBody({ id: "ground", type: "static", shape: { kind: "box", halfWidth: 10, halfHeight: 1 }, y: 5 });
    world.addBody({ id: "player", shape: { kind: "box", halfWidth: 1, halfHeight: 1 }, y: 2.9, velocityY: 10 });

    expect(world.step(0.1)).toBe(1);
    const player = world.body("player")!;
    expect(player.y).toBeLessThan(4.01);
    expect(player.velocityY).toBe(0);
    expect(world.contact(0)).toMatchObject({ aId: "ground", bId: "player", trigger: false, normalY: -1 });
  });

  test("circle contacts exchange restitution impulses", () => {
    const world = createPhysicsWorld2D({ capacity: 4, gravityY: 0 });
    world.addBody({ id: "left", shape: { kind: "circle", radius: 1 }, x: -0.9, velocityX: 2, restitution: 1 });
    world.addBody({ id: "right", shape: { kind: "circle", radius: 1 }, x: 0.9, velocityX: -2, restitution: 1 });

    world.step(0.01);
    expect(world.body("left")!.velocityX).toBeCloseTo(-2);
    expect(world.body("right")!.velocityX).toBeCloseTo(2);
  });

  test("triggers report contacts without moving bodies", () => {
    const world = createPhysicsWorld2D({ capacity: 4, gravityY: 0 });
    world.addBody({ id: "sensor", type: "static", trigger: true, shape: { kind: "box", halfWidth: 2, halfHeight: 2 } });
    world.addBody({ id: "actor", shape: { kind: "circle", radius: 1 }, x: 1 });

    world.step(1 / 60);
    expect(world.contact(0)).toMatchObject({ trigger: true });
    expect(world.body("actor")!.x).toBe(1);
  });

  test("collision layers eliminate pairs before narrowphase", () => {
    const world = createPhysicsWorld2D({ capacity: 4, gravityY: 0 });
    world.addBody({ id: "a", shape: { kind: "box", halfWidth: 1, halfHeight: 1 }, collisionLayer: 1, collisionMask: 1 });
    world.addBody({ id: "b", shape: { kind: "box", halfWidth: 1, halfHeight: 1 }, collisionLayer: 2, collisionMask: 2 });
    expect(world.step(1 / 60)).toBe(0);
    expect(world.diagnostics.candidatePairs).toBe(0);
  });

  test("continuous boxes cannot tunnel through thin static walls", () => {
    const world = createPhysicsWorld2D({ capacity: 4, gravityY: 0 });
    world.addBody({ id: "wall", type: "static", shape: { kind: "box", halfWidth: 0.1, halfHeight: 10 }, x: 5 });
    world.addBody({ id: "bullet", continuous: true, shape: { kind: "box", halfWidth: 0.25, halfHeight: 0.25 }, velocityX: 1_000 });

    world.step(1 / 60);
    const bullet = world.body("bullet")!;
    expect(bullet.x).toBeLessThanOrEqual(4.65);
    expect(bullet.velocityX).toBe(0);
    expect(world.diagnostics.continuousHits).toBe(1);
  });

  test("continuous circles cannot tunnel through rotated static walls", () => {
    const world = createPhysicsWorld2D({ capacity: 2, gravityY: 0 });
    world.addBody({ id: "wall", type: "static", angle: Math.PI / 4, shape: { kind: "box", halfWidth: 0.1, halfHeight: 10 }, x: 5 });
    world.addBody({ id: "bullet", continuous: true, shape: { kind: "circle", radius: 0.25 }, velocityX: 1_000 });

    world.step(1 / 60);
    const bullet = world.body("bullet")!;
    const wallNormalX = Math.SQRT1_2;
    const wallNormalY = Math.SQRT1_2;
    expect((bullet.x - 5) * wallNormalX + bullet.y * wallNormalY).toBeLessThanOrEqual(-0.349);
    expect(bullet.velocityX * wallNormalX + bullet.velocityY * wallNormalY).toBeCloseTo(0);
    expect(world.diagnostics.continuousHits).toBe(1);
  });

  test("shape casts return the earliest static oriented-box hit in caller storage", () => {
    const world = createPhysicsWorld2D({ capacity: 2, gravityY: 0 });
    world.addBody({ id: "far", type: "static", shape: { kind: "box", halfWidth: 0.2, halfHeight: 4 }, x: 8 });
    world.addBody({ id: "near", type: "static", angle: Math.PI / 6, shape: { kind: "box", halfWidth: 0.2, halfHeight: 4 }, x: 4 });
    const target = {} as Parameters<typeof world.shapeCast>[7];
    const hit = world.shapeCast({ kind: "circle", radius: 0.25 }, 0, 0, 0, 10, 0, 1, target);
    expect(hit).toBe(target);
    expect(hit?.id).toBe("near");
    expect(hit?.fraction).toBeGreaterThan(0);
    expect(hit?.fraction).toBeLessThan(1);
    expect(Math.hypot(hit!.normalX, hit!.normalY)).toBeCloseTo(1);
  });

  test("caller-owned AABB queries are stable and bounded", () => {
    const world = createPhysicsWorld2D({ capacity: 5, gravityY: 0 });
    const first = world.addBody({ id: "first", type: "static", shape: { kind: "circle", radius: 1 }, x: 1 });
    world.addBody({ id: "far", type: "static", shape: { kind: "circle", radius: 1 }, x: 20 });
    const output = new Int32Array(1);
    expect(world.queryAabb(0, -2, 3, 2, output)).toBe(1);
    expect(output[0]).toBe(first);
  });

  test("capacity, contacts, ids, shapes, and steps are validated", () => {
    const world = createPhysicsWorld2D({ capacity: 1, maxContacts: 1 });
    expect(() => world.addBody({ id: "", shape: { kind: "circle", radius: 1 } })).toThrow(/id/);
    world.addBody({ id: "valid", shape: { kind: "circle", radius: 1 } });
    expect(() => world.addBody({ id: "overflow", shape: { kind: "circle", radius: 1 } })).toThrow(/capacity/);
    expect(() => world.step(0.5)).toThrow(/at most/);
    expect(world.removeBody("valid")).toBe(true);
    expect(world.removeBody("valid")).toBe(false);
    expect(() => world.addBody({ id: "bad", shape: { kind: "box", halfWidth: 0, halfHeight: 1 } })).toThrow(/halfWidth/);
  });

  test("body slots are reused without exposing stale ids", () => {
    const world = createPhysicsWorld2D({ capacity: 1 });
    const oldIndex = world.addBody({ id: "old", shape: { kind: "circle", radius: 1 } });
    world.removeBody("old");
    const newIndex = world.addBody({ id: "new", shape: { kind: "circle", radius: 2 } });
    expect(newIndex).toBe(oldIndex);
    expect(world.body("old")).toBeUndefined();
    expect(world.body("new")?.shape).toEqual({ kind: "circle", radius: 2 });
  });

  test("preallocates an inspectable numeric budget and reports contact overflow", () => {
    const world = createPhysicsWorld2D({ capacity: 3, maxContacts: 1, maxJoints: 0, gravityY: 0 });
    expect(world.numericStorageBytes).toBe(472);
    for (const id of ["a", "b", "c"]) world.addBody({ id, shape: { kind: "circle", radius: 2 } });
    expect(world.step(1 / 60)).toBe(1);
    expect(world.diagnostics.candidatePairs).toBe(3);
    expect(world.diagnostics.contactOverflow).toBe(2);
  });

  test("replays the same operation stream bit-for-bit", () => {
    const run = () => {
      const world = createPhysicsWorld2D({ capacity: 8, gravityX: 2, gravityY: 20 });
      world.addBody({ id: "floor", type: "static", shape: { kind: "box", halfWidth: 20, halfHeight: 1 }, y: 8 });
      world.addBody({ id: "ball", shape: { kind: "circle", radius: 1 }, x: -2, velocityX: 5, restitution: 0.25 });
      world.applyImpulse("ball", 3, -2);
      for (let tick = 0; tick < 120; tick += 1) world.step(1 / 120);
      return { body: world.body("ball"), diagnostics: { ...world.diagnostics } };
    };
    expect(run()).toEqual(run());
  });

  test("raycasts boxes and circles with a reusable closest-hit target", () => {
    const world = createPhysicsWorld2D({ capacity: 4, gravityY: 0 });
    world.addBody({ id: "circle", type: "static", collisionLayer: 2, shape: { kind: "circle", radius: 1 }, x: 8 });
    world.addBody({ id: "box", type: "static", collisionLayer: 1, shape: { kind: "box", halfWidth: 1, halfHeight: 2 }, x: 4 });
    const target = { index: -1, id: "", distance: 0, x: 0, y: 0, normalX: 0, normalY: 0 };
    expect(world.raycast(0, 0, 1, 0, 20, 0xffff_ffff, target)).toBe(target);
    expect(target).toMatchObject({ id: "box", distance: 3, x: 3, y: 0, normalX: -1, normalY: 0 });
    expect(world.raycast(0, 0, 1, 0, 20, 2)).toMatchObject({ id: "circle", distance: 7 });
    expect(world.raycast(0, 10, 1, 0, 20)).toBeUndefined();
    expect(() => world.raycast(0, 0, 0, 0, 2)).toThrow(/direction/);
  });

  test("writes bounded renderer-neutral collider and contact debug lines", () => {
    const world = createPhysicsWorld2D({ capacity: 2, gravityY: 0 });
    world.addBody({ id: "wall", type: "static", shape: { kind: "box", halfWidth: 2, halfHeight: 1 } });
    world.addBody({ id: "sensor", trigger: true, shape: { kind: "circle", radius: 1 }, x: 1 });
    world.step(1 / 60);
    expect(world.debugSegmentCount(4)).toBe(9);
    const output = new Float32Array(world.debugSegmentCount(4) * PHYSICS_DEBUG_SEGMENT_STRIDE);
    expect(world.writeDebugSegments(output, 4)).toBe(9);
    expect(output[4]).toBe(PHYSICS_DEBUG_STATIC);
    expect(output.at(-1)).toBe(PHYSICS_DEBUG_CONTACT);
    expect(world.writeDebugSegments(new Float32Array(PHYSICS_DEBUG_SEGMENT_STRIDE), 4)).toBe(1);
  });

  test("solves bounded distance joints and suppresses connected collision by default", () => {
    const world = createPhysicsWorld2D({ capacity: 3, maxJoints: 1, gravityY: 0, positionIterations: 4 });
    world.addBody({ id: "anchor", type: "static", shape: { kind: "circle", radius: 1 } });
    world.addBody({ id: "weight", shape: { kind: "circle", radius: 1 }, x: 10, velocityX: 5 });
    const jointIndex = world.addDistanceJoint({ id: "rope", a: "anchor", b: "weight", length: 4, stiffness: 1, damping: 1 });
    expect(world.joint(jointIndex)).toMatchObject({ id: "rope", aId: "anchor", bId: "weight", length: 4, collideConnected: false });
    world.step(0.1);
    expect(world.body("weight")!.x).toBeCloseTo(4, 6);
    expect(world.body("weight")!.velocityX).toBe(0);
    expect(world.jointCount()).toBe(1);
    expect(() => world.removeBody("anchor")).toThrow(/referenced/);
    const output = new Float32Array(world.debugSegmentCount(4) * PHYSICS_DEBUG_SEGMENT_STRIDE);
    world.writeDebugSegments(output, 4);
    expect(output.at(-1)).toBe(PHYSICS_DEBUG_JOINT);
    expect(world.removeJoint("rope")).toBe(true);
    expect(world.removeBody("anchor")).toBe(true);
  });

  test("validates joint capacity, endpoints, and coefficients", () => {
    const world = createPhysicsWorld2D({ capacity: 2, maxJoints: 1, gravityY: 0 });
    world.addBody({ id: "a", shape: { kind: "circle", radius: 1 } });
    world.addBody({ id: "b", shape: { kind: "circle", radius: 1 }, x: 2 });
    expect(() => world.addDistanceJoint({ id: "same", a: "a", b: "a" })).toThrow(/different/);
    world.addDistanceJoint({ id: "valid", a: "a", b: "b" });
    expect(() => world.addDistanceJoint({ id: "overflow", a: "a", b: "b" })).toThrow(/capacity/);
    expect(world.removeJoint("missing")).toBe(false);
  });

  test("revolute joints keep rotating local anchors coincident", () => {
    const world = createPhysicsWorld2D({ capacity: 2, maxJoints: 1, gravityY: 0, positionIterations: 4 });
    world.addBody({ id: "mount", type: "static", shape: { kind: "circle", radius: 0.25 } });
    world.addBody({ id: "arm", shape: { kind: "box", halfWidth: 1, halfHeight: 0.25 }, x: 2 });
    world.addRevoluteJoint({ id: "hinge", a: "mount", b: "arm", anchorX: 1, anchorY: 0, damping: 1 });
    world.applyImpulseAtPoint("arm", 0, 4, 3, 0);
    world.step(0.1);
    const arm = world.body("arm")!;
    const hinge = world.joint("hinge")!;
    expect(hinge.kind).toBe("revolute");
    if (hinge.kind !== "revolute") throw new Error("expected revolute joint");
    expect(hinge.anchorX).toBeCloseTo(1);
    expect(hinge.anchorY).toBeCloseTo(0);
    expect(arm.x - Math.cos(arm.angle)).toBeCloseTo(1);
    expect(arm.y - Math.sin(arm.angle)).toBeCloseTo(0);
  });

  test("collides and raycasts oriented boxes", () => {
    const world = createPhysicsWorld2D({ capacity: 3, gravityY: 0 });
    world.addBody({ id: "rotated", type: "static", angle: Math.PI / 2, shape: { kind: "box", halfWidth: 2, halfHeight: 0.5 }, x: 4 });
    world.addBody({ id: "circle", shape: { kind: "circle", radius: 0.75 }, x: 3.5 });
    expect(world.step(1 / 60)).toBe(1);
    expect(world.contact(0).penetration).toBeGreaterThan(0);
    expect(world.raycast(0, 1.5, 1, 0, 10, 1)).toMatchObject({ id: "rotated", distance: 3.5, normalX: -1 });
  });

  test("off-center impulses produce bounded angular motion while fixed rotation stays locked", () => {
    const world = createPhysicsWorld2D({ capacity: 2, gravityY: 0 });
    world.addBody({ id: "spinner", shape: { kind: "box", halfWidth: 1, halfHeight: 1 } });
    world.addBody({ id: "locked", fixedRotation: true, shape: { kind: "box", halfWidth: 1, halfHeight: 1 }, x: 10 });
    world.applyImpulseAtPoint("spinner", 0, 10, 1, 0);
    world.applyImpulseAtPoint("locked", 0, 10, 11, 0);
    expect(world.body("spinner")!.angularVelocity).toBeCloseTo(15);
    expect(world.body("locked")!.angularVelocity).toBe(0);
    world.step(0.1);
    expect(world.body("spinner")!.angle).toBeCloseTo(1.5);
  });

  test("sleeps quiet bodies and wakes them explicitly or by impulse", () => {
    const world = createPhysicsWorld2D({ capacity: 2, gravityY: 0, sleepAfterSeconds: 0.1 });
    world.addBody({ id: "sleeper", shape: { kind: "circle", radius: 1 } });
    world.addBody({ id: "always-awake", allowSleep: false, shape: { kind: "circle", radius: 1 }, x: 10 });
    world.step(0.05);
    world.step(0.05);
    expect(world.body("sleeper")!.awake).toBe(false);
    expect(world.body("always-awake")!.awake).toBe(true);
    expect(world.diagnostics.sleepingBodies).toBe(1);
    world.applyImpulse("sleeper", 2, 0);
    expect(world.body("sleeper")).toMatchObject({ awake: true, velocityX: 2 });
    world.setAwake("sleeper", false);
    expect(world.body("sleeper")).toMatchObject({ awake: false, velocityX: 0 });
  });
});
