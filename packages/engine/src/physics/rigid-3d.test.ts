import { describe, expect, test } from "bun:test";
import {
  RIGID_DEBUG_SEGMENT_STRIDE_3D,
  createRigidWorld3D,
  type RigidContact3D,
  type RigidRaycastHit3D,
} from "./rigid-3d.ts";

const contactTarget = (): RigidContact3D => ({
  a: 0, b: 0, aId: "", bId: "", normalX: 0, normalY: 0, normalZ: 0,
  penetration: 0, pointX: 0, pointY: 0, pointZ: 0, trigger: false,
});

const rayTarget = (): RigidRaycastHit3D => ({
  handle: 0, id: "", distance: 0, x: 0, y: 0, z: 0, normalX: 0, normalY: 0, normalZ: 0,
});

describe("bounded rigid 3D world", () => {
  test("can round persistent state through float32 storage for JS/WASM parity", () => {
    const world = createRigidWorld3D({ capacity: 1, maxContacts: 1, maxCandidatePairs: 1, maxCcdTests: 1, gravityY: 0, precision: "float32" });
    world.addBody({ id: "body", shape: { kind: "sphere", radius: 0.1 }, x: 1 / 3, velocityX: 1 / 7 });
    world.step(1 / 60);

    expect(world.precision).toBe("float32");
    expect(world.body("body")!.x).toBe(Math.fround(Math.fround(1 / 3) + Math.fround(1 / 7) * (1 / 60)));
    expect(world.numericStorageBytes).toBeLessThan(createRigidWorld3D({ capacity: 1, maxContacts: 1, maxCandidatePairs: 1, maxCcdTests: 1 }).numericStorageBytes);
  });

  test("integrates gravity, mass-scaled impulses, and kinematic velocity", () => {
    const world = createRigidWorld3D({ capacity: 2, gravityY: -10 });
    const dynamic = world.addBody({ id: "dynamic", type: "dynamic", shape: { kind: "sphere", radius: 1 }, mass: 2 });
    const kinematic = world.addBody({ id: "platform", type: "kinematic", shape: { kind: "box", halfX: 1, halfY: 1, halfZ: 1 }, x: 10, velocityX: 2 });
    world.applyImpulse(dynamic, 2, 0, 0);
    world.step(0.1);
    expect(world.body(dynamic)).toEqual(expect.objectContaining({ x: 0.1, y: -0.1, velocityX: 1, velocityY: -1, mass: 2 }));
    expect(world.body(kinematic)).toEqual(expect.objectContaining({ x: 10.2, velocityX: 2, mass: Number.POSITIVE_INFINITY }));
  });

  test("keeps handles stale-safe across deterministic slot reuse and validates atomically", () => {
    const world = createRigidWorld3D({ capacity: 1, gravityY: 0 });
    expect(() => world.addBody({ id: "bad", shape: { kind: "sphere", radius: -1 } })).toThrow("radius");
    expect(() => world.addBody({ id: "also-bad", shape: { kind: "sphere", radius: 1 }, restitution: 2 })).toThrow("restitution");
    const first = world.addBody({ id: "first", shape: { kind: "sphere", radius: 1 } });
    expect(world.removeBody(first)).toBe(true);
    expect(world.hasBody(first)).toBe(false);
    const second = world.addBody({ id: "second", shape: { kind: "sphere", radius: 1 } });
    expect(second).not.toBe(first);
    expect(() => world.setPosition(first, 0, 0, 0)).toThrow("stale");
    expect(world.body(second)?.id).toBe("second");
    expect(() => world.addBody({ id: "full", shape: { kind: "sphere", radius: 1 } })).toThrow("capacity");
    expect(() => world.step(0.5)).toThrow("seconds");
    expect(() => world.setVelocity(second, Number.NaN, 0, 0)).toThrow("velocityX");
  });

  test("resolves sphere/sphere contacts with restitution", () => {
    const world = createRigidWorld3D({ capacity: 2, gravityY: 0, velocityIterations: 2 });
    world.addBody({ id: "left", shape: { kind: "sphere", radius: 1 }, x: -0.9, velocityX: 1, restitution: 1, friction: 0 });
    world.addBody({ id: "right", shape: { kind: "sphere", radius: 1 }, x: 0.9, velocityX: -1, restitution: 1, friction: 0 });
    expect(world.step(0.01)).toBe(1);
    expect(world.body("left")!.velocityX).toBeCloseTo(-1, 10);
    expect(world.body("right")!.velocityX).toBeCloseTo(1, 10);
    const contact = world.contact(0, contactTarget());
    expect(contact).toEqual(expect.objectContaining({ aId: "left", bId: "right", normalX: 1, trigger: false }));
  });

  test("resolves sphere/box and box/box contacts with position response", () => {
    const sphereBox = createRigidWorld3D({ capacity: 2, gravityY: 0 });
    sphereBox.addBody({ id: "sphere", shape: { kind: "sphere", radius: 1 }, x: -1.5, velocityX: 2, restitution: 0 });
    sphereBox.addBody({ id: "wall", type: "static", shape: { kind: "box", halfX: 1, halfY: 2, halfZ: 2 } });
    sphereBox.step(0.01);
    expect(sphereBox.contactCount()).toBe(1);
    expect(sphereBox.body("sphere")!.velocityX).toBeLessThanOrEqual(0);
    expect(sphereBox.body("sphere")!.x).toBeLessThan(-1.5);

    const boxes = createRigidWorld3D({ capacity: 2, gravityY: 0 });
    boxes.addBody({ id: "moving", shape: { kind: "box", halfX: 1, halfY: 1, halfZ: 1 }, x: 0.5 });
    boxes.addBody({ id: "fixed", type: "static", shape: { kind: "box", halfX: 1, halfY: 1, halfZ: 1 }, x: 2 });
    boxes.step(0.01);
    expect(boxes.contact(0, contactTarget())).toEqual(expect.objectContaining({ normalX: 1, penetration: 0.5 }));
    expect(boxes.body("moving")!.x).toBeLessThan(0.5);
  });

  test("uses Coulomb friction to reduce tangential motion against a surface", () => {
    const world = createRigidWorld3D({ capacity: 2, gravityY: -10, velocityIterations: 4 });
    world.addBody({ id: "floor", type: "static", shape: { kind: "box", halfX: 10, halfY: 0.5, halfZ: 10 }, y: -0.5, friction: 1 });
    world.addBody({ id: "crate", shape: { kind: "box", halfX: 0.5, halfY: 0.5, halfZ: 0.5 }, y: 0.49, velocityX: 5, friction: 1 });
    world.step(0.1);
    expect(Math.abs(world.body("crate")!.velocityX)).toBeLessThan(5);
    expect(world.body("crate")!.velocityY).toBeGreaterThanOrEqual(0);
  });

  test("honors layers, masks, and non-resolving triggers", () => {
    const world = createRigidWorld3D({ capacity: 4, gravityY: 0 });
    world.addBody({ id: "trigger", type: "static", shape: { kind: "box", halfX: 1, halfY: 1, halfZ: 1 }, trigger: true, collisionLayer: 2, collisionMask: 1 });
    world.addBody({ id: "actor", shape: { kind: "sphere", radius: 1 }, x: 0.5, velocityX: 3, collisionLayer: 1, collisionMask: 2 });
    world.addBody({ id: "ignored", shape: { kind: "sphere", radius: 1 }, x: 0.5, collisionLayer: 4, collisionMask: 4 });
    world.step(0.01);
    expect(world.contactCount()).toBe(1);
    expect(world.contact(0, contactTarget()).trigger).toBe(true);
    expect(world.body("actor")!.velocityX).toBe(3);
  });

  test("prevents dynamic bodies tunneling through thin static colliders when CCD is enabled", () => {
    const discrete = createRigidWorld3D({ capacity: 2, gravityY: 0 });
    discrete.addBody({ id: "wall", type: "static", shape: { kind: "box", halfX: 0.05, halfY: 2, halfZ: 2 } });
    discrete.addBody({ id: "ball", shape: { kind: "sphere", radius: 0.5 }, x: -5, velocityX: 100 });
    discrete.step(0.1);
    expect(discrete.body("ball")!.x).toBe(5);

    const continuous = createRigidWorld3D({ capacity: 2, gravityY: 0 });
    continuous.addBody({ id: "wall", type: "static", shape: { kind: "box", halfX: 0.05, halfY: 2, halfZ: 2 } });
    continuous.addBody({ id: "ball", shape: { kind: "sphere", radius: 0.5 }, x: -5, velocityX: 100, continuous: true });
    continuous.step(0.1);
    expect(continuous.body("ball")!.x).toBeCloseTo(-0.55, 8);
    expect(continuous.body("ball")!.velocityX).toBeLessThanOrEqual(0);
    expect(continuous.diagnostics).toEqual(expect.objectContaining({ ccdHits: 1, ccdConservativeHits: 1, ccdTests: 1 }));

    const boxSweep = createRigidWorld3D({ capacity: 2, gravityY: 0 });
    boxSweep.addBody({ id: "wall", type: "static", shape: { kind: "box", halfX: 0.05, halfY: 2, halfZ: 2 } });
    boxSweep.addBody({ id: "box", shape: { kind: "box", halfX: 0.5, halfY: 0.5, halfZ: 0.5 }, x: -5, velocityX: 100, continuous: true });
    boxSweep.step(0.1);
    expect(boxSweep.body("box")!.x).toBeCloseTo(-0.55, 8);
    expect(boxSweep.diagnostics.ccdConservativeHits).toBe(0);
  });

  test("writes stable handles to caller-owned AABB, ray, and debug outputs", () => {
    const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });
    const sphere = world.addBody({ id: "sphere", type: "static", shape: { kind: "sphere", radius: 1 }, x: 5, collisionLayer: 1 });
    const box = world.addBody({ id: "box", type: "static", shape: { kind: "box", halfX: 1, halfY: 1, halfZ: 1 }, x: 10, collisionLayer: 2 });
    const handles = new Float64Array(1);
    expect(world.queryAabb(3, -2, -2, 7, 2, 2, handles)).toBe(1);
    expect(handles[0]).toBe(sphere);
    expect(world.queryAabb(0, -2, -2, 20, 2, 2, handles)).toBe(1);
    expect(world.diagnostics.queryTruncations).toBe(1);

    const hit = rayTarget();
    expect(world.raycast(0, 0, 0, 1, 0, 0, 20, 1, hit)).toBe(true);
    expect(hit).toEqual(expect.objectContaining({ handle: sphere, id: "sphere", distance: 4, normalX: -1 }));
    expect(world.raycast(0, 0, 0, 1, 0, 0, 20, 2, hit)).toBe(true);
    expect(hit).toEqual(expect.objectContaining({ handle: box, distance: 9 }));

    expect(world.debugSegmentCount(4)).toBe(24);
    const debug = new Float32Array(world.debugSegmentCount(4) * RIGID_DEBUG_SEGMENT_STRIDE_3D);
    expect(world.writeDebugSegments(debug, 4)).toBe(24);
    expect(() => world.writeDebugSegments(new Float32Array(2), 4)).toThrow("needs");
  });

  test("bounds candidate/contact work and exposes exact numeric storage", () => {
    const candidateBound = createRigidWorld3D({ capacity: 3, maxCandidatePairs: 1, maxContacts: 3, gravityY: 0 });
    for (let index = 0; index < 3; index += 1) candidateBound.addBody({ id: `c${index}`, shape: { kind: "sphere", radius: 2 } });
    candidateBound.step(0.01);
    expect(candidateBound.diagnostics).toEqual(expect.objectContaining({ candidatePairs: 1, candidateOverflows: 1 }));

    const contactBound = createRigidWorld3D({ capacity: 3, maxCandidatePairs: 3, maxContacts: 1, gravityY: 0 });
    for (let index = 0; index < 3; index += 1) contactBound.addBody({ id: `k${index}`, shape: { kind: "sphere", radius: 2 } });
    contactBound.step(0.01);
    expect(contactBound.contactCount()).toBe(1);
    expect(contactBound.diagnostics.contactOverflows).toBe(2);
    expect(contactBound.numericStorageBytes).toBe(createRigidWorld3D({ capacity: 3, maxCandidatePairs: 3, maxContacts: 1 }).numericStorageBytes);
    expect(contactBound.numericStorageBytes).toBe(3 * 268 + 65);
  });

  test("replays the same operation stream exactly", () => {
    const run = () => {
      const world = createRigidWorld3D({ capacity: 4, gravityY: -4 });
      world.addBody({ id: "floor", type: "static", shape: { kind: "box", halfX: 20, halfY: 0.5, halfZ: 20 }, y: -0.5 });
      const ball = world.addBody({ id: "ball", shape: { kind: "sphere", radius: 0.5 }, x: -1, y: 4, velocityX: 2, restitution: 0.25, friction: 0.4 });
      const box = world.addBody({ id: "box", shape: { kind: "box", halfX: 0.5, halfY: 0.5, halfZ: 0.5 }, x: 1, y: 2 });
      world.applyImpulse(box, -0.25, 0.5, 0.125);
      for (let step = 0; step < 120; step += 1) world.step(1 / 60);
      return { ball: world.body(ball), box: world.body(box), diagnostics: { ...world.diagnostics } };
    };
    expect(run()).toEqual(run());
  });

  test("integrates normalized rotation and solves bounded distance constraints", () => {
    const world = createRigidWorld3D({ capacity: 3, gravityY: 0, maxConstraints: 1, constraintIterations: 4 });
    const anchor = world.addBody({ id: "anchor", type: "static", shape: { kind: "sphere", radius: 0.25 }, x: 0 });
    const rotated = world.addBody({ id: "rotated", shape: { kind: "box", halfX: 2, halfY: 0.5, halfZ: 0.5 }, x: 4, rotation: [0, 0, 0, 2], angularVelocity: [0, 0, 2] });
    const constraint = world.addDistanceConstraint({ id: "rope", a: anchor, b: rotated, distance: 2 });
    expect(world.constraint(constraint)).toMatchObject({ id: "rope", distance: 2, stiffness: 1 });
    world.applyTorqueImpulse(rotated, 0, 1, 0);
    world.step(0.1);
    const state = world.body(rotated)!;
    expect(state.x).toBeCloseTo(2, 5);
    expect(Math.hypot(state.rotationX, state.rotationY, state.rotationZ, state.rotationW)).toBeCloseTo(1, 6);
    expect(Math.abs(state.rotationZ)).toBeGreaterThan(0);
    expect(world.diagnostics.constraints).toBe(1);
    expect(world.removeConstraint("rope")).toBe(true);
    expect(world.constraintCount()).toBe(0);
  });

  test("rejects invalid rotational and constraint semantics explicitly", () => {
    const world = createRigidWorld3D({ capacity: 2, maxConstraints: 1 });
    expect(() => world.addBody({ id: "zero-rotation", shape: { kind: "box", halfX: 1, halfY: 1, halfZ: 1 }, rotation: [0, 0, 0, 0] })).toThrow("non-zero");
    expect(() => Reflect.apply(world.addBody, world, [{ id: "jointed", shape: { kind: "sphere", radius: 1 }, constraints: [] }])).toThrow("not an inline body property");
    expect(() => world.addBody({ id: "static-mass", type: "static", shape: { kind: "sphere", radius: 1 }, mass: 1 })).toThrow("infinite mass");
    expect(() => world.addBody({ id: "swept-trigger", shape: { kind: "sphere", radius: 1 }, continuous: true, trigger: true })).toThrow("Continuous trigger sweeps");
  });
});
