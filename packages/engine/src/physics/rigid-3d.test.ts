import { describe, expect, test } from "bun:test";
import {
  RIGID_DEBUG_SEGMENT_STRIDE_3D,
  createRigidWorld3D,
  identifyRigidMaterialPreset3D,
  rigidMaterialPreset3D,
  type RigidConstraintTelemetry3D,
  type RigidContact3D,
  type RigidRaycastHit3D,
  type RigidSweepHit3D,
} from "./rigid-3d.ts";

const contactTarget = (): RigidContact3D => ({
  a: 0, b: 0, aId: "", bId: "", normalX: 0, normalY: 0, normalZ: 0,
  penetration: 0, pointX: 0, pointY: 0, pointZ: 0, trigger: false,
  closingSpeedMetersPerSecond: 0, effectiveMassKg: 0, impactEnergyJoules: 0,
  normalImpulseNewtonSeconds: 0, breakthrough: false,
});

test('selected velocity reads preserve ownership, body type and stale identity semantics', () => {
  const world = createRigidWorld3D({ capacity: 1 });
  const handle = world.addBody({ id: 'body', type: 'dynamic', mass: 1, shape: { kind: 'sphere', radius: 1 } });
  world.setVelocity(handle, 2, 3, 4);
  const output = { x: -1, y: -1, z: -1 };
  expect(world.readVelocity(handle, output)).toBe('dynamic');expect(output).toEqual({ x: 2, y: 3, z: 4 });
  output.x = 99;expect(world.body(handle)!.velocityX).toBe(2);
  world.removeBody(handle);
  const replacement = world.addBody({ id: 'next', type: 'static', shape: { kind: 'sphere', radius: 1 } });
  expect(world.readVelocity(handle, output)).toBeUndefined();expect(output.x).toBe(99);
  expect(world.readVelocity('missing', output)).toBeUndefined();expect(output.x).toBe(99);
  expect(world.readVelocity(replacement, output)).toBe('static');expect(output).toEqual({ x: 0, y: 0, z: 0 });
});

test('optional body lookup rejects missing and stale handles without changing strict mutation errors', () => {
  const world = createRigidWorld3D({ capacity: 2 });
  const handle = world.addBody({ id: 'body', type: 'static', shape: { kind: 'sphere', radius: 1 } });
  expect(world.body(handle)?.id).toBe('body');
  world.removeBody(handle);
  world.addBody({ id: 'replacement', type: 'static', shape: { kind: 'sphere', radius: 1 } });
  for (const key of ['missing', 'body', handle, -1, 0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    expect(world.body(key)).toBeUndefined();expect(world.hasBody(key)).toBe(false);
  }
  expect(() => world.setPosition('missing', 0, 0, 0)).toThrow('does not exist');
  expect(() => world.setPosition(handle, 0, 0, 0)).toThrow('stale');
});

const rayTarget = (): RigidRaycastHit3D => ({
  handle: 0, id: "", distance: 0, x: 0, y: 0, z: 0, normalX: 0, normalY: 0, normalZ: 0,
});

const sweepTarget = (): RigidSweepHit3D => ({
  ...rayTarget(), time: 0, conservative: false,
});

function worldPoint(state: NonNullable<ReturnType<ReturnType<typeof createRigidWorld3D>["body"]>>, local: readonly [number, number, number]) {
  const { rotationX: qx, rotationY: qy, rotationZ: qz, rotationW: qw } = state, [x, y, z] = local;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [state.x + x + qw * tx + (qy * tz - qz * ty), state.y + y + qw * ty + (qz * tx - qx * tz), state.z + z + qw * tz + (qx * ty - qy * tx)] as const;
}

describe("bounded rigid 3D world", () => {
  test("reused body slots cannot inherit impulses from a removed body", () => {
    const world = createRigidWorld3D({ capacity: 2, gravityY: -9.81 });
    world.addBody({ id: "floor", type: "static", shape: { kind: "box", halfX: 4, halfY: .5, halfZ: 4 }, y: -.5 });
    const crate = { id: "crate", shape: { kind: "box" as const, halfX: 1, halfY: .5, halfZ: .75 }, y: .499 };
    world.addBody(crate);
    world.step(0.008333333333333333);
    world.step(0.008333333333333333);
    expect(world.contact(0, contactTarget())).toMatchObject({ warmStartedPointCount: 4 });
    world.removeBody("crate");
    world.addBody({ ...crate, id: "replacement" });
    world.step(0.008333333333333333);
    expect(world.contact(0, contactTarget())).toMatchObject({ warmStartedPointCount: 0 });
  });

  test("expands semantic material presets into independent portable coefficients", () => {
    const stone = rigidMaterialPreset3D("stone"), copy = rigidMaterialPreset3D("stone");
    expect(stone).toEqual({ friction: .75, restitution: .08, linearDamping: .2, angularDamping: .15 });
    expect(rigidMaterialPreset3D("ice").friction).toBeLessThan(stone.friction);
    expect(rigidMaterialPreset3D("rubber").restitution).toBeGreaterThan(stone.restitution);
    stone.friction = 0;
    expect(copy.friction).toBe(.75);
    expect(identifyRigidMaterialPreset3D(copy)).toBe("stone");
    expect(identifyRigidMaterialPreset3D({ ...copy, friction: .74 })).toBeUndefined();
    expect(() => Reflect.apply(rigidMaterialPreset3D, undefined, ["glass"])).toThrow("choose character, soil, wood, stone, metal, ice, rubber");
  });

  test("applies deterministic linear damping without hidden position correction", () => {
    const create = () => {
      const world = createRigidWorld3D({ capacity: 1, gravityY: 0, precision: "float64" });
      world.addBody({ id: "fighter", shape: { kind: "sphere", radius: .5 }, velocityX: 10, linearDamping: 1, angularDamping: 0 });
      return world;
    };
    const world = create();
    world.step(.1);
    expect(world.body("fighter")).toEqual(expect.objectContaining({ x: .9, velocityX: 9 }));
    const checkpoint = world.checkpoint();
    world.step(.1);
    const sequential = world.body("fighter");
    const resumed = create();
    resumed.restoreCheckpoint(checkpoint);
    resumed.step(.1);
    expect(resumed.body("fighter")).toEqual(sequential);
  });

  test("can round persistent state through float32 storage for JS/WASM parity", () => {
    const world = createRigidWorld3D({ capacity: 1, maxContacts: 1, maxCandidatePairs: 1, maxCcdTests: 1, gravityY: 0, precision: "float32" });
    world.addBody({ id: "body", shape: { kind: "sphere", radius: 0.1 }, x: 0.3333333333333333, velocityX: 0.14285714285714285 });
    world.step(0.016666666666666666);

    expect(world.precision).toBe("float32");
    expect(world.body("body")!.x).toBe(Math.fround(Math.fround(0.3333333333333333) + Math.fround(0.14285714285714285) * (0.016666666666666666)));
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

  test("hands simulation authority across one stable body handle", () => {
    const world = createRigidWorld3D({ capacity: 1, gravityY: -10 });
    const handle = world.addBody({ id: "fighter", type: "dynamic", shape: { kind: "box", halfX: .2, halfY: .5, halfZ: .2 }, y: 1, mass: 8, collisionLayer: 2, collisionMask: 4, continuous: true });
    expect(world.configureBody(handle, { type: "kinematic", collisionMask: 0, continuous: false })).toEqual(expect.objectContaining({ handle, type: "kinematic", mass: Number.POSITIVE_INFINITY, collisionMask: 0, continuous: false }));
    world.step(.1);
    expect(world.body(handle)).toEqual(expect.objectContaining({ handle, y: 1, velocityY: 0 }));
    expect(world.configureBody(handle, { type: "dynamic", mass: 8, collisionLayer: 2, collisionMask: 4, continuous: true })).toEqual(expect.objectContaining({ handle, type: "dynamic", mass: 8, collisionMask: 4, continuous: true }));
    world.step(.1);
    expect(world.body(handle)).toEqual(expect.objectContaining({ handle, y: .9, velocityY: -1 }));
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

  test("derives deterministic contact energy and preserves residual motion through failed material", () => {
    const run = (resistance: number) => {
      const world = createRigidWorld3D({ capacity: 2, gravityY: 0, velocityIterations: 4, positionIterations: 4 });
      world.addBody({ id: "fist", shape: { kind: "sphere", radius: .25 }, x: -.45, velocityX: 10, mass: 2, friction: 0, restitution: 0 });
      world.addBody({ id: "wall", type: "static", shape: { kind: "box", halfX: .25, halfY: 1, halfZ: 1 }, impactResponse: { fractureEnergyJoules: resistance, retainedEnergyRatio: .8 } });
      world.step(.01);
      return { fist: world.body("fist")!, contact: world.contact(0, contactTarget()), checkpoint: world.checkpoint() };
    };

    const failed = run(20), blocked = run(200);
    expect(failed.contact).toEqual(expect.objectContaining({
      closingSpeedMetersPerSecond: 10,
      effectiveMassKg: 2,
      impactEnergyJoules: 100,
      breakthrough: true,
      failedBodyId: "wall",
    }));
    expect(failed.contact.normalImpulseNewtonSeconds).toBeGreaterThan(0);
    expect(failed.fist.velocityX).toBeGreaterThan(0);
    expect(blocked.contact.breakthrough).toBe(false);
    expect(blocked.fist.velocityX).toBeLessThanOrEqual(0);
    expect(run(20)).toEqual(failed);
    expect(failed.checkpoint.contacts.impactEnergyJoules[0]).toBe(100);
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

  test("solves broad box faces through one causal contact backed by a bounded manifold", () => {
    const world = createRigidWorld3D({ capacity: 2, gravityY: 0, velocityIterations: 8 });
    world.addBody({ id: "floor", type: "static", shape: { kind: "box", halfX: 4, halfY: .5, halfZ: 4 }, y: -.5, friction: 1 });
    world.addBody({ id: "crate", shape: { kind: "box", halfX: 1, halfY: .5, halfZ: .75 }, y: .49, velocityY: -2, friction: 1 });

    world.step(0.016666666666666666);

    expect(world.contactCount()).toBe(1);
    const contact = world.contact(0, contactTarget());
    expect((contact).manifoldPointCount).toBe(4);
    expect(contact.normalY).toBe(1);
    expect(contact.normalImpulseNewtonSeconds).toBeGreaterThan(0);
    const checkpoint = world.checkpoint();
    expect((checkpoint.contacts).manifoldPointCount).toEqual(new Uint8Array([4]));

    const resumed = createRigidWorld3D({ capacity: 2, gravityY: 0, velocityIterations: 8 });
    resumed.addBody({ id: "floor", type: "static", shape: { kind: "box", halfX: 4, halfY: .5, halfZ: 4 }, y: -.5, friction: 1 });
    resumed.addBody({ id: "crate", shape: { kind: "box", halfX: 1, halfY: .5, halfZ: .75 }, y: .49, velocityY: -2, friction: 1 });
    resumed.restoreCheckpoint(checkpoint);
    expect((resumed.contact(0, contactTarget())).manifoldPointCount).toBe(4);

    const legacy = structuredClone(checkpoint);
    delete legacy.contacts.manifoldPointCount; delete legacy.contacts.manifoldPointX; delete legacy.contacts.manifoldPointY; delete legacy.contacts.manifoldPointZ;
    delete legacy.contacts.manifoldNormalImpulse; delete legacy.contacts.manifoldFrictionX; delete legacy.contacts.manifoldFrictionY; delete legacy.contacts.manifoldFrictionZ; delete legacy.contacts.warmStartedPointCount;
    resumed.restoreCheckpoint(legacy);
    expect((resumed.contact(0, contactTarget())).manifoldPointCount).toBe(1);
  });

  test("uses separated face contacts to resist unsupported angular skating", () => {
    const world = createRigidWorld3D({ capacity: 2, gravityY: 0, velocityIterations: 8 });
    world.addBody({ id: "floor", type: "static", shape: { kind: "box", halfX: 4, halfY: .5, halfZ: 4 }, y: -.5, friction: 1 });
    world.addBody({ id: "crate", shape: { kind: "box", halfX: 1, halfY: .5, halfZ: .75 }, y: .49, angularVelocity: [0, 0, 3], angularDamping: 0, friction: 1 });

    world.step(0.008333333333333333);

    expect(world.contactCount()).toBe(1);
    expect((world.contact(0, contactTarget())).manifoldPointCount).toBeGreaterThan(1);
    expect(Math.abs(world.body("crate")!.angularVelocityZ)).toBeLessThan(2.5);
  });

  test("matches sustained manifold points and warm-starts them without duplicating causal contacts", () => {
    const create = () => {
      const world = createRigidWorld3D({ capacity: 2, gravityY: -9.81, velocityIterations: 8 });
      world.addBody({ id: "floor", type: "static", shape: { kind: "box", halfX: 4, halfY: .5, halfZ: 4 }, y: -.5, friction: 1 });
      world.addBody({ id: "crate", shape: { kind: "box", halfX: 1, halfY: .5, halfZ: .75 }, y: .499, friction: 1, angularDamping: 0 });
      return world;
    };
    const world = create();
    world.step(0.008333333333333333);
    const checkpoint = world.checkpoint();
    world.step(0.008333333333333333);

    expect(world.contactCount()).toBe(1);
    const contact = world.contact(0, contactTarget());
    expect(contact.manifoldPointCount).toBe(4);
    expect(contact.warmStartedPointCount).toBe(4);
    expect(contact.normalImpulseNewtonSeconds).toBeGreaterThan(0);
    expect((world.checkpoint().contacts).manifoldNormalImpulse?.some((impulse) => impulse > 0)).toBe(true);

    const resumed = create(); resumed.restoreCheckpoint(checkpoint); resumed.step(0.008333333333333333);
    expect(resumed.body("crate")).toEqual(world.body("crate"));
    expect(resumed.contact(0, contactTarget())).toEqual(contact);

    const inconsistent = structuredClone(checkpoint);
    delete inconsistent.contacts.manifoldFrictionZ;
    expect(() => create().restoreCheckpoint(inconsistent)).toThrow("contact cache storage is inconsistent");
  });

  test("uses off-center manifold correction to rotate out of penetration without changing velocity", () => {
    const world = createRigidWorld3D({ capacity: 2, gravityY: 0, velocityIterations: 1, positionIterations: 4 });
    const angle = .18;
    world.addBody({ id: "floor", type: "static", shape: { kind: "box", halfX: 4, halfY: .5, halfZ: 4 }, y: -.5 });
    world.addBody({ id: "beam", shape: { kind: "box", halfX: 2, halfY: .1, halfZ: .25 }, y: .15, rotation: [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)], angularDamping: 0 });

    world.step(0.008333333333333333);

    const beam = world.body("beam")!;
    expect(Math.abs(beam.rotationZ)).toBeLessThan(Math.sin(angle / 2));
    expect(beam.y).toBeLessThan(.4);
    expect([beam.velocityX, beam.velocityY, beam.velocityZ, beam.angularVelocityX, beam.angularVelocityY, beam.angularVelocityZ]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  test("keeps a warm-started two-box support stack quiet over ten seconds", () => {
    const world = createRigidWorld3D({ capacity: 3, gravityY: -9.81, velocityIterations: 8, positionIterations: 4 });
    world.addBody({ id: "floor", type: "static", shape: { kind: "box", halfX: 4, halfY: .5, halfZ: 4 }, y: -.5, friction: 1 });
    world.addBody({ id: "lower", shape: { kind: "box", halfX: .7, halfY: .5, halfZ: .7 }, y: .5, mass: 2, friction: 1, angularDamping: .1 });
    world.addBody({ id: "upper", shape: { kind: "box", halfX: .6, halfY: .5, halfZ: .6 }, y: 1.5, friction: 1, angularDamping: .1 });
    let maximumLateSpeed = 0;
    for (let tick = 0; tick < 1_200; tick += 1) {
      world.step(0.008333333333333333);
      if (tick < 600) continue;
      for (const id of ["lower", "upper"]) {
        const body = world.body(id)!;
        maximumLateSpeed = Math.max(maximumLateSpeed, Math.hypot(body.velocityX, body.velocityY, body.velocityZ), Math.hypot(body.angularVelocityX, body.angularVelocityY, body.angularVelocityZ));
      }
    }

    expect(maximumLateSpeed).toBeLessThan(1e-6);
    expect(world.body("lower")).toEqual(expect.objectContaining({ y: expect.closeTo(.5, 3) }));
    expect(world.body("upper")).toEqual(expect.objectContaining({ y: expect.closeTo(1.5, 3) }));
    expect(world.contactCount()).toBe(2);
  });

  test("rejects separated oriented boxes whose world bounds overlap", () => {
    const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });
    const angle = Math.PI / 4;
    const rotation = [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)] as const;
    world.addBody({ id: "rail-a", shape: { kind: "box", halfX: 2, halfY: .05, halfZ: .1 }, rotation });
    world.addBody({
      id: "rail-b",
      type: "static",
      shape: { kind: "box", halfX: 2, halfY: .05, halfZ: .1 },
      x: -Math.sin(angle) * .3,
      y: Math.cos(angle) * .3,
      rotation,
    });

    world.step(.01);

    expect(world.contactCount()).toBe(0);
    expect(world.body("rail-a")).toEqual(expect.objectContaining({ x: 0, y: 0 }));
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
    expect(continuous.diagnostics).toEqual(expect.objectContaining({ ccdHits: 1, ccdConservativeHits: 0, ccdTests: 1 }));

    const boxSweep = createRigidWorld3D({ capacity: 2, gravityY: 0 });
    boxSweep.addBody({ id: "wall", type: "static", shape: { kind: "box", halfX: 0.05, halfY: 2, halfZ: 2 } });
    boxSweep.addBody({ id: "box", shape: { kind: "box", halfX: 0.5, halfY: 0.5, halfZ: 0.5 }, x: -5, velocityX: 100, continuous: true });
    boxSweep.step(0.1);
    expect(boxSweep.body("box")!.x).toBeCloseTo(-0.55, 8);
    expect(boxSweep.diagnostics.ccdConservativeHits).toBe(0);
  });

  test("uses exact oriented-box intervals for fast linear hits and near misses", () => {
    const angle = Math.PI / 4, sin = Math.sin(angle), cos = Math.cos(angle);
    const rotation = [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)] as const;
    const hit = createRigidWorld3D({ capacity: 2, gravityY: 0 });
    hit.addBody({ id: "rail", type: "static", shape: { kind: "box", halfX: 2, halfY: .05, halfZ: .1 }, rotation });
    hit.addBody({ id: "tool", shape: { kind: "box", halfX: .1, halfY: .1, halfZ: .1 }, x: sin * 2, y: -cos * 2, velocityX: -sin * 40, velocityY: cos * 40, continuous: true });
    hit.step(.1);
    expect(hit.contactCount()).toBe(1);
    expect(hit.diagnostics).toEqual(expect.objectContaining({ ccdHits: 1, ccdConservativeHits: 0 }));
    expect(hit.contact(0, contactTarget()).closingSpeedMetersPerSecond).toBeGreaterThan(30);

    const miss = createRigidWorld3D({ capacity: 2, gravityY: 0 });
    miss.addBody({ id: "rail", type: "static", shape: { kind: "box", halfX: 2, halfY: .05, halfZ: .1 }, rotation });
    miss.addBody({ id: "parallel-tool", shape: { kind: "box", halfX: .2, halfY: .05, halfZ: .1 }, x: -sin * .3 - cos * 2, y: cos * .3 - sin * 2, rotation, velocityX: cos * 40, velocityY: sin * 40, continuous: true });
    miss.step(.1);
    expect(miss.contactCount()).toBe(0);
    expect(miss.diagnostics.ccdHits).toBe(0);
  });

  test("sweeps continuous dynamic bodies against moving dynamic targets and transfers momentum", () => {
    const run = () => {
      const world = createRigidWorld3D({ capacity: 2, gravityY: 0, velocityIterations: 4 });
      world.addBody({ id: "hand", shape: { kind: "sphere", radius: .25 }, x: -1, velocityX: 100, mass: 2, continuous: true, restitution: 0 });
      world.addBody({ id: "chest", shape: { kind: "sphere", radius: .25 }, x: 1, velocityX: -10, mass: 8, restitution: 0 });
      world.step(.03);
      return { hand: world.body("hand"), chest: world.body("chest"), contact: world.contactCount() ? world.contact(0, contactTarget()) : undefined, diagnostics: structuredClone(world.diagnostics) };
    };
    const first = run(), second = run();
    expect(first).toEqual(second);
    expect(first.contact).toMatchObject({ aId: "hand", bId: "chest", trigger: false });
    expect(first.chest!.velocityX).toBeGreaterThan(-10);
    expect(first.hand!.x).toBeLessThan(first.chest!.x);
    expect(first.diagnostics).toEqual(expect.objectContaining({ ccdHits: 1, ccdTests: 1 }));
  });

  test("sweeps fast angular motion even when the continuous body's center does not translate", () => {
    const run = () => {
      const world = createRigidWorld3D({ capacity: 2, gravityY: 0, velocityIterations: 6 });
      const halfAngle = -Math.PI / 8;
      world.addBody({
        id: "spinning-tool",
        shape: { kind: "box", halfX: 2, halfY: .04, halfZ: .04 },
        rotation: [0, 0, Math.sin(halfAngle), Math.cos(halfAngle)],
        angularVelocity: [0, 0, Math.PI * 2],
        angularDamping: 0,
        mass: 3,
        continuous: true,
      });
      world.addBody({ id: "target", shape: { kind: "sphere", radius: .04 }, x: 1.92, mass: 8 });
      const checkpoint = world.checkpoint();
      const simulate = () => {
        world.step(.25);
        return {
        contact: world.contactCount() ? world.contact(0, contactTarget()) : undefined,
        tool: world.body("spinning-tool"),
        target: world.body("target"),
        diagnostics: structuredClone(world.diagnostics),
        };
      };
      const first = simulate();
      world.restoreCheckpoint(checkpoint);
      expect(simulate()).toEqual(first);
      const legacy = structuredClone(checkpoint);
      delete legacy.bodies.previousRotationX; delete legacy.bodies.previousRotationY; delete legacy.bodies.previousRotationZ; delete legacy.bodies.previousRotationW;
      Reflect.deleteProperty(legacy.diagnostics, "ccdAngularTests"); Reflect.deleteProperty(legacy.diagnostics, "ccdAngularHits");
      world.restoreCheckpoint(legacy);
      expect(simulate()).toEqual(first);
      return first;
    };
    const first = run();
    expect(first).toEqual(run());
    expect(first.contact).toMatchObject({ aId: "spinning-tool", bId: "target", trigger: false });
    expect(first.contact!.closingSpeedMetersPerSecond).toBeGreaterThan(1);
    expect(Math.hypot(first.target!.velocityX, first.target!.velocityY, first.target!.velocityZ)).toBeGreaterThan(0);
    expect(first.diagnostics).toEqual(expect.objectContaining({ ccdHits: 1, ccdAngularHits: 1, ccdConservativeHits: 0 }));
  });

  test("sweeps a rotating box against oriented box geometry without accepting world-bound contact", () => {
    const run = () => {
      const world = createRigidWorld3D({ capacity: 2, gravityY: 0, velocityIterations: 6 });
      const halfAngle = -Math.PI / 8;
      world.addBody({
        id: "spinning-tool",
        shape: { kind: "box", halfX: 2, halfY: .04, halfZ: .04 },
        rotation: [0, 0, Math.sin(halfAngle), Math.cos(halfAngle)],
        angularVelocity: [0, 0, Math.PI * 2],
        angularDamping: 0,
        mass: 3,
        continuous: true,
      });
      world.addBody({ id: "target", shape: { kind: "box", halfX: .04, halfY: .12, halfZ: .12 }, x: 1.92, mass: 8 });
      world.step(.25);
      return {
        contact: world.contactCount() ? world.contact(0, contactTarget()) : undefined,
        target: world.body("target"),
        diagnostics: structuredClone(world.diagnostics),
      };
    };

    const first = run();
    expect(run()).toEqual(first);
    expect(first.contact).toEqual(expect.objectContaining({ aId: "spinning-tool", bId: "target" }));
    expect(first.contact!.closingSpeedMetersPerSecond).toBeGreaterThan(1);
    expect(Math.hypot(first.contact!.normalX, first.contact!.normalY, first.contact!.normalZ)).toBeCloseTo(1, 8);
    expect(first.target!.velocityX).toBeGreaterThan(0);
    expect(first.diagnostics).toEqual(expect.objectContaining({ ccdHits: 1, ccdAngularHits: 1, ccdConservativeHits: 0 }));
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

  test("raycasts the actual oriented box instead of its loose world AABB", () => {
    const world = createRigidWorld3D({ capacity: 1, gravityY: 0 });
    const angle = .3;
    world.addBody({ id: "slope", type: "static", shape: { kind: "box", halfX: 2, halfY: .1, halfZ: 1 }, rotation: [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)], collisionLayer: 1 });
    const hit = rayTarget();

    expect(world.raycast(1, 3, 0, 0, -1, 0, 5, 1, hit)).toBe(true);
    const expectedHeight = Math.tan(angle) + .1 / Math.cos(angle);
    expect(hit.x).toBeCloseTo(1, 10);
    expect(hit.y).toBeCloseTo(expectedHeight, 10);
    expect(hit.z).toBeCloseTo(0, 10);
    expect(hit.distance).toBeCloseTo(3 - expectedHeight, 10);
    expect(hit.normalX).toBeCloseTo(-Math.sin(angle), 10);
    expect(hit.normalY).toBeCloseTo(Math.cos(angle), 10);
  });

  test("sweeps high-speed spherical effectors to the earliest stable contact", () => {
    const world = createRigidWorld3D({ capacity: 3, gravityY: 0 });
    const sphere = world.addBody({ id: "target-sphere", type: "static", shape: { kind: "sphere", radius: 0.5 }, x: 4, collisionLayer: 1 });
    world.addBody({ id: "later-box", type: "static", shape: { kind: "box", halfX: 0.25, halfY: 2, halfZ: 2 }, x: 8, collisionLayer: 1 });
    world.addBody({ id: "ignored", type: "static", shape: { kind: "sphere", radius: 1 }, x: 2, collisionLayer: 2 });
    const hit = sweepTarget();

    expect(world.sweepSphere(0, 0, 0, 12, 0, 0, 0.25, 1, hit)).toBe(true);
    expect(hit).toEqual(expect.objectContaining({ handle: sphere, id: "target-sphere", time: 0.2708333333333333, distance: 3.25, x: 3.5, normalX: -1, conservative: false }));
    expect(world.sweepSphere(5, 0, 0, 5, 0, 0, 0.25, 1, hit)).toBe(true);
    expect(hit).toEqual(expect.objectContaining({ id: "later-box", time: 0.5, distance: 2.5, x: 7.75, normalX: -1, conservative: true }));
    expect(() => world.sweepSphere(0, 0, 0, 0, 0, 0, 0.25, 1, hit)).toThrow("non-zero");
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
    expect(contactBound.numericStorageBytes).toBe(1_669);
  });

  test("replays the same operation stream exactly", () => {
    const run = () => {
      const world = createRigidWorld3D({ capacity: 4, gravityY: -4 });
      world.addBody({ id: "floor", type: "static", shape: { kind: "box", halfX: 20, halfY: 0.5, halfZ: 20 }, y: -0.5 });
      const ball = world.addBody({ id: "ball", shape: { kind: "sphere", radius: 0.5 }, x: -1, y: 4, velocityX: 2, restitution: 0.25, friction: 0.4 });
      const box = world.addBody({ id: "box", shape: { kind: "box", halfX: 0.5, halfY: 0.5, halfZ: 0.5 }, x: 1, y: 2 });
      world.applyImpulse(box, -0.25, 0.5, 0.125);
      for (let step = 0; step < 120; step += 1) world.step(0.016666666666666666);
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

  test("keeps articulated local anchors joined while an off-center impulse swings a limb", () => {
    const run = () => {
      const world = createRigidWorld3D({ capacity: 2, gravityY: 0, maxConstraints: 1, constraintIterations: 12 });
      world.addBody({ id: "shoulder", type: "static", shape: { kind: "sphere", radius: 0.15 } });
      const limb = world.addBody({ id: "upper-arm", shape: { kind: "box", halfX: 0.18, halfY: 1, halfZ: 0.18 }, y: -1, mass: 3, angularDamping: 0.1 });
      const joint = world.addPointConstraint({ id: "shoulder-joint", a: "shoulder", b: limb, localAnchorB: [0, 1, 0], stiffness: 0.9 });
      expect(world.constraint(joint)).toMatchObject({ kind: "point", id: "shoulder-joint", localAnchorA: [0, 0, 0], localAnchorB: [0, 1, 0] });
      world.applyImpulseAtPoint(limb, 6, 0, 0, 0, -2, 0);
      for (let frame = 0; frame < 90; frame += 1) world.step(0.008333333333333333);
      const state = world.body(limb)!;
      return { state, anchor: worldPoint(state, [0, 1, 0]), diagnostics: { ...world.diagnostics } };
    };
    const first = run();
    expect(Math.hypot(...first.anchor)).toBeLessThan(0.025);
    expect(Math.abs(first.state.rotationZ)).toBeGreaterThan(0.05);
    expect(first.diagnostics).toEqual(expect.objectContaining({ constraints: 1, constraintBreaks: 0 }));
    expect(first).toEqual(run());
  });

  test("damps planted anchor velocity with a bounded grip impulse", () => {
    const run = () => {
      const world = createRigidWorld3D({ capacity: 2, gravityY: 0, maxConstraints: 1, constraintIterations: 12 });
      world.addBody({ id: "ground", type: "static", shape: { kind: "sphere", radius: .1 } });
      world.addBody({ id: "foot", shape: { kind: "sphere", radius: .15 }, mass: 2 });
      const grip = world.addPointConstraint({ id: "foot-grip", a: "ground", b: "foot", stiffness: 1, damping: 1, maxImpulse: 100 });
      world.applyImpulse("foot", 12, 0, 0); for (let step = 0; step < 30; step += 1) world.step(0.008333333333333333);
      return { foot: world.body("foot"), grip: world.constraint(grip) };
    };
    const first = run();
    expect(first.foot!.x).toBeCloseTo(0, 4); expect(first.foot!.velocityX).toBeCloseTo(0, 6);
    expect(first.grip).toMatchObject({ kind: "point", damping: 1, maxImpulse: 100 });
    expect(first).toEqual(run());
  });

  test("breaks an overstressed joint deterministically and preserves body momentum", () => {
    const world = createRigidWorld3D({ capacity: 2, gravityY: 0, maxConstraints: 1, constraintIterations: 8 });
    world.addBody({ id: "anchor", type: "static", shape: { kind: "sphere", radius: 0.1 } });
    const panel = world.addBody({ id: "panel", shape: { kind: "box", halfX: 0.5, halfY: 0.5, halfZ: 0.1 }, x: 1, mass: 2 });
    world.addPointConstraint({ id: "breakable-bolt", a: "anchor", b: panel, localAnchorB: [-1, 0, 0], breakImpulse: 0.1 });
    world.applyImpulseAtPoint(panel, 20, 0, 0, 1, 0.5, 0);
    world.step(0.016666666666666666);
    expect(world.constraintCount()).toBe(0);
    expect(world.diagnostics.constraintBreaks).toBe(1);
    expect(world.body(panel)!.velocityX).toBeCloseTo(10, 10);
  });

  test("drives articulated bodies toward editable relative poses through bounded torque", () => {
    const run = () => {
      const world = createRigidWorld3D({ capacity: 2, gravityY: 0, maxConstraints: 1, constraintIterations: 8 });
      world.addBody({ id: "torso", type: "static", shape: { kind: "box", halfX: 0.2, halfY: 0.2, halfZ: 0.2 } });
      world.addBody({ id: "arm", shape: { kind: "box", halfX: 0.2, halfY: 1, halfZ: 0.2 }, x: 2, mass: 2, angularDamping: 0.2 });
      const motor = world.addAngularMotorConstraint({ id: "shoulder-motor", a: "torso", b: "arm", targetRelativeRotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2], stiffness: 0.18, damping: 1, maxTorqueImpulse: 0.5 });
      for (let frame = 0; frame < 240; frame += 1) world.step(0.008333333333333333);
      const active = world.body("arm")!;
      const passive = world.configureAngularMotorConstraint(motor, { stiffness: 0, damping: 0, maxTorqueImpulse: 0 });
      return { active, passive, motor: world.constraint(motor) };
    };
    const first = run();
    expect(first.active.rotationZ).toBeCloseTo(Math.SQRT1_2, 3);
    expect(first.active.rotationW).toBeCloseTo(Math.SQRT1_2, 3);
    expect(Math.hypot(first.active.angularVelocityX, first.active.angularVelocityY, first.active.angularVelocityZ)).toBeLessThan(.01);
    expect(first.passive).toMatchObject({ kind: "angular-motor", stiffness: 0, damping: 0, maxTorqueImpulse: 0 });
    expect(first).toEqual(run());
  });

  test("approaches a new angular target without a one-tick limb snap", () => {
    const world = createRigidWorld3D({ capacity: 2, gravityY: 0, maxConstraints: 1, constraintIterations: 8 });
    world.addBody({ id: "torso", type: "static", shape: { kind: "sphere", radius: .1 } });
    world.addBody({ id: "limb", shape: { kind: "box", halfX: .12, halfY: .5, halfZ: .12 }, mass: 2, angularDamping: 0 });
    world.addAngularMotorConstraint({ id: "joint", a: "torso", b: "limb", targetRelativeRotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2], stiffness: 1, damping: 1, maxTorqueImpulse: 100 });
    let previous: readonly [number, number, number, number] = [0, 0, 0, 1], maximumFrameTurn = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      world.step(0.008333333333333333);
      const body = world.body("limb")!, current = [body.rotationX, body.rotationY, body.rotationZ, body.rotationW] as const;
      const dot = Math.min(1, Math.abs(previous[0] * current[0] + previous[1] * current[1] + previous[2] * current[2] + previous[3] * current[3]));
      maximumFrameTurn = Math.max(maximumFrameTurn, 2 * Math.acos(dot));
      previous = current;
    }
    const settled = world.body("limb")!;
    expect(maximumFrameTurn).toBeLessThan(Math.PI / 10);
    expect(settled.rotationZ).toBeCloseTo(Math.SQRT1_2, 6);
    expect(settled.rotationW).toBeCloseTo(Math.SQRT1_2, 6);
  });

  test("keeps passive articulation inside a deterministic rest-pose angular cone", () => {
    const run = () => {
      const world = createRigidWorld3D({ capacity: 2, gravityY: 0, maxConstraints: 1, constraintIterations: 10 });
      world.addBody({ id: "torso", type: "static", shape: { kind: "sphere", radius: 0.25 } });
      const angle = 2 * Math.PI / 3;
      world.addBody({ id: "arm", shape: { kind: "box", halfX: 0.2, halfY: 1, halfZ: 0.2 }, rotation: [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)], mass: 2, angularDamping: 0.25 });
      const limit = world.addAngularLimitConstraint({ id: "shoulder-limit", a: "torso", b: "arm", referenceRelativeRotation: [0, 0, 0, 1], maxAngleRadians: Math.PI / 6, stiffness: 0.8, damping: 0.9, maxTorqueImpulse: 4 });
      for (let frame = 0; frame < 240; frame += 1) world.step(0.008333333333333333);
      const state = world.body("arm")!, constrainedAngle = 2 * Math.acos(Math.min(1, Math.abs(state.rotationW)));
      return { constrainedAngle, state, limit: world.constraint(limit) };
    };
    const first = run();
    expect(first.constrainedAngle).toBeLessThanOrEqual(Math.PI / 6 + 1e-5);
    expect(first.limit).toMatchObject({ kind: "angular-limit", maxAngleRadians: Math.PI / 6, stiffness: 0.8, damping: 0.9, maxTorqueImpulse: 4 });
    expect(first).toEqual(run());
  });

  test("bounds anatomical swing and signed twist independently", () => {
    const run = () => {
      const world = createRigidWorld3D({ capacity: 3, gravityY: 0, maxConstraints: 2, constraintIterations: 12 });
      world.addBody({ id: "torso", type: "static", shape: { kind: "sphere", radius: .1 }, collisionMask: 0 });
      const swingAngle = Math.PI * .75, twistAngle = Math.PI * .8;
      world.addBody({ id: "swing", shape: { kind: "sphere", radius: .1 }, x: -1, rotation: [0, 0, Math.sin(swingAngle / 2), Math.cos(swingAngle / 2)], mass: 1, angularDamping: .25, collisionMask: 0 });
      world.addBody({ id: "twist", shape: { kind: "sphere", radius: .1 }, x: 1, rotation: [0, Math.sin(twistAngle / 2), 0, Math.cos(twistAngle / 2)], mass: 1, angularDamping: .25, collisionMask: 0 });
      const definition = { referenceRelativeRotation: [0, 0, 0, 1], twistAxis: [0, 1, 0], maxSwingRadians: Math.PI / 6, minTwistRadians: -Math.PI / 9, maxTwistRadians: Math.PI / 9, stiffness: .8, damping: .9, maxTorqueImpulse: 4 } as const;
      const swing = world.addAngularSwingTwistLimitConstraint({ id: "shoulder", a: "torso", b: "swing", ...definition });
      const twist = world.addAngularSwingTwistLimitConstraint({ id: "forearm", a: "torso", b: "twist", ...definition });
      for (let frame = 0; frame < 300; frame += 1) world.step(0.008333333333333333);
      const swingState = world.body("swing")!, twistState = world.body("twist")!;
      const checkpoint = world.checkpoint(), checkpointState = { swing: structuredClone(swingState), twist: structuredClone(twistState), swingLimit: world.constraint(swing), twistLimit: world.constraint(twist) };
      world.applyTorqueImpulse("swing", 20, 10, 5); world.step(0.03333333333333333); world.restoreCheckpoint(checkpoint);
      expect({ swing: world.body("swing"), twist: world.body("twist"), swingLimit: world.constraint(swing), twistLimit: world.constraint(twist) }).toEqual(checkpointState);
      return {
        swingAngle: 2 * Math.acos(Math.min(1, Math.abs(swingState.rotationW))),
        twistAngle: 2 * Math.atan2(twistState.rotationY, twistState.rotationW),
        swing: world.constraint(swing),
        twist: world.constraint(twist),
      };
    };
    const first = run();
    expect(first.swingAngle).toBeLessThanOrEqual(Math.PI / 6 + 1e-5);
    expect(first.twistAngle).toBeGreaterThanOrEqual(-Math.PI / 9 - 1e-5);
    expect(first.twistAngle).toBeLessThanOrEqual(Math.PI / 9 + 1e-5);
    expect(first.swing).toMatchObject({ kind: "angular-swing-twist-limit", twistAxis: [0, 1, 0], maxSwingRadians: Math.PI / 6, minTwistRadians: -Math.PI / 9, maxTwistRadians: Math.PI / 9 });
    expect(first).toEqual(run());

    const invalid = createRigidWorld3D({ capacity: 2, gravityY: 0, maxConstraints: 1 });
    invalid.addBody({ id: "a", type: "static", shape: { kind: "sphere", radius: .1 } });
    invalid.addBody({ id: "b", shape: { kind: "sphere", radius: .1 } });
    expect(() => invalid.addAngularSwingTwistLimitConstraint({ id: "zero-axis", a: "a", b: "b", twistAxis: [0, 0, 0], maxSwingRadians: 1, minTwistRadians: -1, maxTwistRadians: 1 })).toThrow("twistAxis must be non-zero");
    expect(() => invalid.addAngularSwingTwistLimitConstraint({ id: "reversed", a: "a", b: "b", twistAxis: [0, 1, 0], maxSwingRadians: 1, minTwistRadians: 1, maxTwistRadians: -1 })).toThrow("minimum twist");
  });

  test("reports deterministic allocation-free constraint telemetry from the latest step", () => {
    const run = () => {
      const world = createRigidWorld3D({ capacity: 2, gravityY: 0, maxConstraints: 1, constraintIterations: 4 });
      world.addBody({ id: "torso", type: "static", shape: { kind: "sphere", radius: .25 } });
      world.addBody({ id: "arm", shape: { kind: "sphere", radius: .2 }, mass: 1, rotation: [0, 0, Math.sin(Math.PI / 3), Math.cos(Math.PI / 3)] });
      const limit = world.addAngularLimitConstraint({ id: "shoulder-limit", a: "torso", b: "arm", referenceRelativeRotation: [0, 0, 0, 1], maxAngleRadians: Math.PI / 6, maxTorqueImpulse: .001 });
      world.step(0.008333333333333333);
      const target: RigidConstraintTelemetry3D = { handle: 0, id: "", kind: "distance", error: 0, appliedImpulse: 0, saturated: false };
      const returned = world.constraintTelemetry(limit, target);
      expect(returned).toBe(target);
      return structuredClone(target);
    };
    const first = run();
    expect(first).toEqual(expect.objectContaining({ id: "shoulder-limit", kind: "angular-limit", saturated: true }));
    expect(first.error).toBeGreaterThan(1);
    expect(first.appliedImpulse).toBeCloseTo(.004, 10);
    expect(first).toEqual(run());
  });

  test("uses shape inertia for torque and off-center point impulses", () => {
    const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });
    const compact = world.addBody({ id: "compact", shape: { kind: "box", halfX: 0.5, halfY: 0.5, halfZ: 0.5 }, mass: 2 });
    const tall = world.addBody({ id: "tall", shape: { kind: "box", halfX: 0.5, halfY: 2, halfZ: 0.5 }, mass: 2, x: 4 });

    world.applyTorqueImpulse(compact, 0, 0, 1);
    world.applyTorqueImpulse(tall, 0, 0, 1);
    expect(world.body(compact)!.angularVelocityZ).toBeCloseTo(3, 10);
    expect(world.body(tall)!.angularVelocityZ).toBeCloseTo(0.35294117647058826, 10);

    world.applyImpulseAtPoint(compact, 2, 0, 0, 0, 0.5, 0);
    expect(world.body(compact)).toEqual(expect.objectContaining({ velocityX: 1 }));
    expect(world.body(compact)!.angularVelocityZ).toBeCloseTo(0, 10);
    expect(() => world.applyImpulseAtPoint("missing", 1, 0, 0, 0, 0, 0)).toThrow("does not exist");
  });

  test("transfers off-center collision impulse into continuous angular motion", () => {
    const run = () => {
      const world = createRigidWorld3D({ capacity: 2, gravityY: 0, velocityIterations: 4 });
      world.addBody({ id: "striker", shape: { kind: "sphere", radius: 0.5 }, x: -0.9, y: 0.7, velocityX: 8, mass: 1, restitution: 0 });
      world.addBody({ id: "target", shape: { kind: "box", halfX: 0.5, halfY: 1, halfZ: 0.4 }, x: 0, mass: 4, restitution: 0 });
      world.step(0.016666666666666666);
      const target = world.body("target")!;
      return { velocityX: target.velocityX, angularVelocityZ: target.angularVelocityZ };
    };
    const first = run();
    expect(first.velocityX).toBeGreaterThan(0);
    expect(Math.abs(first.angularVelocityZ)).toBeGreaterThan(0.1);
    expect(first).toEqual(run());
  });

  test("restores bodies, contacts, constraints, telemetry, and diagnostics for exact continuation", () => {
    const world = createRigidWorld3D({ capacity: 3, gravityY: -4, maxConstraints: 2, constraintIterations: 8 });
    world.addBody({ id: "anchor", type: "static", shape: { kind: "sphere", radius: .1 }, y: 3, collisionMask: 0 });
    world.addBody({ id: "arm", shape: { kind: "box", halfX: .15, halfY: .6, halfZ: .15 }, y: 2, mass: 2, angularVelocity: [0, 0, 1] });
    world.addBody({ id: "ground", type: "static", shape: { kind: "box", halfX: 5, halfY: .1, halfZ: 5 }, y: -.1 });
    const motor = world.addAngularMotorConstraint({ id: "motor", a: "anchor", b: "arm", targetRelativeRotation: [0, 0, 0, 1], stiffness: .4, damping: .8, maxTorqueImpulse: 2 });
    const seam = world.addDistanceConstraint({ id: "seam", a: "anchor", b: "arm", distance: 1, stiffness: .8, breakImpulse: 100 });
    for (let tick = 0; tick < 12; tick += 1) world.step(0.008333333333333333);
    const checkpoint = world.checkpoint();
    const continueFromCheckpoint = () => {
      for (let tick = 0; tick < 40; tick += 1) world.step(0.008333333333333333);
      const telemetry: RigidConstraintTelemetry3D = { handle: 0, id: "", kind: "distance", error: 0, appliedImpulse: 0, saturated: false };
      return { arm: world.body("arm"), motor: world.constraint(motor), seam: world.constraint(seam), telemetry: structuredClone(world.constraintTelemetry(motor, telemetry)), contacts: world.contactCount(), diagnostics: structuredClone(world.diagnostics) };
    };
    const expected = continueFromCheckpoint();
    world.removeConstraint(seam); world.setPosition("arm", 99, 99, 99); world.setVelocity("arm", -20, 3, 7); world.step(0.03333333333333333);
    world.restoreCheckpoint(checkpoint);
    expect(world.body("arm")!.x).toBe(checkpoint.bodies.positionX[1]);
    expect(world.constraint(seam)).toBeDefined();
    expect(continueFromCheckpoint()).toEqual(expected);
    world.removeBody("arm");
    expect(() => world.restoreCheckpoint(checkpoint)).toThrow("body topology differs");
  });

  test("rejects invalid rotational and constraint semantics explicitly", () => {
    const world = createRigidWorld3D({ capacity: 4, maxConstraints: 1 });
    expect(() => world.addBody({ id: "zero-rotation", shape: { kind: "box", halfX: 1, halfY: 1, halfZ: 1 }, rotation: [0, 0, 0, 0] })).toThrow("non-zero");
    expect(() => Reflect.apply(world.addBody, world, [{ id: "jointed", shape: { kind: "sphere", radius: 1 }, constraints: [] }])).toThrow("not an inline body property");
    expect(() => world.addBody({ id: "static-mass", type: "static", shape: { kind: "sphere", radius: 1 }, mass: 1 })).toThrow("infinite mass");
    expect(() => world.addBody({ id: "swept-trigger", shape: { kind: "sphere", radius: 1 }, continuous: true, trigger: true })).toThrow("Continuous trigger sweeps");
    world.addBody({ id: "limit-a", type: "static", shape: { kind: "sphere", radius: 1 } });
    world.addBody({ id: "limit-b", shape: { kind: "sphere", radius: 1 }, x: 4 });
    expect(() => world.addAngularLimitConstraint({ id: "impossible-limit", a: "limit-a", b: "limit-b", maxAngleRadians: Math.PI + 0.01 })).toThrow("maxAngleRadians");
  });
});
