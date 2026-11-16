import { expect, test } from 'bun:test';
import type { Hyperfocus3DEvaluatedFrame } from '../../../../frame/3d.ts';
import type { Hyperfocus3DDeclaration } from '../../declaration.ts';
import { sampleCircuitMotion3D } from '../../motion/circuit-motion.ts';
import { createTrafficWheelPresenter } from './wheels.ts';
import type { VehicleStop } from './vehicle-motion.ts';

function fixture() {
  const body: Hyperfocus3DDeclaration['scenes'][number]['entities'][number] = {
    id: 'tod:city:traffic:car-east:body', meshId: 'box', materialId: 'paint', position: [0, .8, 0], scale: [.95, .55, 2.2], rotationY: 0,
    animation: { kind: 'ping-pong', offset: [0, 0, 44], travelSeconds: 3.5, periodSeconds: 11, phase: 0, turnRadius: 1.5, turnPivot: [0, 0, 0] },
  };
  const wheel = { ...body, id: 'tod:city:traffic:car-east:wheel:-1:1', position: [-.99, .35, 1.43], scale: [.14, .36, .36] };
  const entities: typeof body[] = [body, { ...wheel, position: [-.99, .35, 1.43], scale: [.14, .36, .36] },
    { ...wheel, id: 'tod:city:traffic:car-east:wheel:-1:-1', position: [-.99, .35, -1.43], scale: [.14, .36, .36] },
    { ...wheel, id: 'tod:city:traffic:car-east:hub:-1:1', position: [-1.138, .35, 1.43], scale: [.02, .19, .045] }];
  function frame(tick: number, poseTick = tick): Hyperfocus3DEvaluatedFrame {
    return { sceneId: 'city', frameIndex: tick, tick, timeSeconds: tick / 60, deterministicSeed: 0,
      camera: { position: [0, 3, 10], target: [0, 1, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 },
      entities: entities.map(entity => { const sample = sampleCircuitMotion3D(entity, poseTick, 0)!;return { id: entity.id, position: sample.position, rotation: [0, Math.sin(sample.rotationY / 2), 0, Math.cos(sample.rotationY / 2)], scale: [...entity.scale], visible: true }; }),
      materials: [], performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [], renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 }, localProgress: 0 };
  }
  return { body, entities, frame, present: createTrafficWheelPresenter({ entities }) };
}

test('wheel spin follows traveled distance, front wheels steer and hubs follow their axle', () => {
  const setup = fixture(), straight = setup.frame(75), before = structuredClone(straight.entities[0]);setup.present(straight, [], 0);
  const distance = sampleCircuitMotion3D(setup.body, 75, 0)!.distance;
  expect(straight.entities[1]!.rotation[0]).toBeCloseTo(Math.sin(distance / .72), 6);
  expect(straight.entities[0]).toEqual(before);
  const turn = setup.frame(270);setup.present(turn, [], 0);
  const front = turn.entities[1]!, rear = turn.entities[2]!, hub = turn.entities[3]!;
  const yaw = (rotation: readonly number[]) => Math.atan2(rotation[1]!, rotation[3]!) * 2;
  expect(Math.abs(Math.sin((yaw(front.rotation) - yaw(rear.rotation)) / 2))).toBeGreaterThan(.3);
  expect(hub.rotation).toEqual(front.rotation);
  expect(Math.hypot(...hub.position.map((value, axis) => value - front.position[axis]!))).toBeCloseTo(.148, 8);
  const original = structuredClone(turn);setup.present(turn, [], 0);expect(turn).toEqual(original);
});

test('wheel rolling stays continuous at a lap seam and freezes through portable wreck restore', () => {
  const setup = fixture(), before = setup.frame(659), after = setup.frame(660);setup.present(before, [], 0);setup.present(after, [], 0);
  const dot = before.entities[1]!.rotation.reduce((sum, value, axis) => sum + value * after.entities[1]!.rotation[axis]!, 0);
  expect(Math.abs(dot)).toBeGreaterThan(.99);
  const tick = 1400, sampled = sampleCircuitMotion3D(setup.body, tick, 0)!;
  const stop = { entityId: setup.body.id, position: sampled.position, cause: 'impact' as const, blockerId: '', rotationY: sampled.rotationY, wheelDistance: sampled.distance };
  const moving = setup.frame(tick);setup.present(moving, [], 0);
  const frozen = setup.frame(9000, tick);setup.present(frozen, [JSON.parse(JSON.stringify(stop))], 0);
  expect(frozen.entities).toEqual(moving.entities);
  const legacy: VehicleStop = { ...stop };delete legacy.wheelDistance;
  const oldA = setup.frame(9000, tick), oldB = setup.frame(18000, tick);setup.present(oldA, [legacy], 0);setup.present(oldB, [legacy], 0);
  expect(oldA.entities).toEqual(oldB.entities);
});


test('wheel bindings skip unrelated identities after warmup and rebind detached reordered frames', () => {
  const setup = fixture(), authored = [...setup.entities, ...Array.from({ length: 128 }, (_, index) => ({ ...setup.body, id: `scenery:${index}` }))];
  const present = createTrafficWheelPresenter({ entities: authored });
  let unrelatedReads = 0;
  const frame = (tick: number) => {
    const value = setup.frame(tick);
    value.entities.push(...authored.slice(setup.entities.length).map((entity): Hyperfocus3DEvaluatedFrame['entities'][number] => ({
      get id() { unrelatedReads++;return entity.id; }, position: [...entity.position],
      rotation: [0, 0, 0, 1], scale: [...entity.scale], visible: true,
    })));
    return value;
  };
  present(frame(75), [], 0); // Initial binding may index the complete scene once.
  const next = frame(90), expected = setup.frame(90);setup.present(expected, [], 0);
  unrelatedReads = 0;present(next, [], 0);expect(unrelatedReads).toBe(0);
  expect(next.entities.slice(0, setup.entities.length)).toEqual(expected.entities);
  const reordered = frame(270);reordered.entities.reverse();present(reordered, [], 0);
  const reference = setup.frame(270);setup.present(reference, [], 0);
  for (const entity of reference.entities) expect(reordered.entities.find(item => item.id === entity.id)).toEqual(entity);
  const missingHub = frame(400);missingHub.entities.splice(3, 1);expect(() => present(missingHub, [], 0)).not.toThrow();
  const restored = frame(401), restoredReference = setup.frame(401);present(restored, [], 0);setup.present(restoredReference, [], 0);
  expect(restored.entities.slice(0, setup.entities.length)).toEqual(restoredReference.entities);
});
