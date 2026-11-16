import { expect, test } from 'bun:test';
import { createRigidWorld3D, type RigidContact3D } from '../../../physics/rigid-3d.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import type { CombatCollision, CombatEvent } from '../../../combat/state.ts';
import { createCombatAi3D } from '../combat-ai.ts';
import { createCombatSurfaceForecast } from './surface-forecast.ts';

function launchIntoSurface(difficulty: number, wall: boolean) {
  const config = { ...createTouchOfDeathPreset(), escapeCharges: 0 };
  const world = createRigidWorld3D({ capacity: 4, gravityY: -31.392 });
  for (const [id, x] of [['attacker', 0], ['defender', 1.4]] as const) world.addBody({ id, shape: { kind: 'sphere', radius: .5 }, x, y: 4.5, continuous: true });
  world.addBody({ id: 'deck', type: 'static', shape: { kind: 'box', halfX: 30, halfY: .2, halfZ: 30 }, y: 3.8 });
  if (wall) world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfX: .2, halfY: 8, halfZ: 30 }, x: 2.3, y: 5 });
  const fighters = [{ id: 'attacker', position: { x: 0, y: 4.5, z: 0 } }, { id: 'defender', position: { x: 1.4, y: 4.5, z: 0 }, facing: { x: -1, y: 0, z: 0 } }];
  const sim = createCombatSimulation({ config, fighters }), ai = createCombatAi3D({ config });
  const forecast = createCombatSurfaceForecast({ world, bodyIds: ['deck', 'wall'] });
  const all: CombatEvent[] = [];
  const contact: RigidContact3D = { a: 0, b: 0, aId: '', bId: '', normalX: 0, normalY: 0, normalZ: 0, penetration: 0, pointX: 0, pointY: 0, pointZ: 0, trigger: false, closingSpeedMetersPerSecond: 0, effectiveMassKg: 0, impactEnergyJoules: 0, normalImpulseNewtonSeconds: 0, breakthrough: false };
  for (let frame = 0; frame < 180; frame++) {
    const collisions: CombatCollision[] = [];
    for (let index = 0; index < world.contactCount(); index++) {
      world.contact(index, contact);
      if (contact.closingSpeedMetersPerSecond <= 1 || ![contact.aId, contact.bId].includes('defender') || [contact.aId, contact.bId].includes('attacker')) continue;
      const body = world.body('defender')!;
      const sign = (body.x - contact.pointX) * contact.normalX + (body.y - contact.pointY) * contact.normalY + (body.z - contact.pointZ) * contact.normalZ >= 0 ? 1 : -1;
      collisions.push({ fighterId: 'defender', normal: { x: contact.normalX * sign, y: contact.normalY * sign, z: contact.normalZ * sign } });
    }
    const state = sim.capture(), body = world.body('defender')!, targetBody = world.body('attacker')!;
    const decision = state.fighters.find(fighter => fighter.id === 'defender')!.stunKind === 'hit'
      ? ai.step({ state, fighterId: 'defender', targetId: 'attacker', difficulty, grounded: false, targetGrounded: true,
        body, targetBody, surfaceContactFrames: forecast('defender', -31.392, 12), collision: collisions.length > 0 }) : undefined;
    const events = sim.step({ inputs: [{ fighterId: 'attacker', pressed: frame === 1 ? ['heavy'] : [] }, decision?.input ?? { fighterId: 'defender' }], collisions,
      poses: fighters.map(fighter => { const body = world.body(fighter.id)!; return { fighterId: fighter.id, position: { x: body.x, y: body.y, z: body.z } }; }) });
    all.push(...events);
    for (const event of events) world.applyImpulse(event.targetId, event.impulse.x, event.impulse.y, event.impulse.z);
    if (sim.capture().fighters.find(fighter => fighter.id === 'defender')!.stunKind === 'hit') {
      const moved = world.body('defender')!;
      world.setVelocity('defender', moved.velocityX * .985, moved.velocityY, moved.velocityZ * .985);
    }
    world.step(0.016666666666666666);
    if (events.some(event => event.kind === 'tech' || event.kind === 'bounce')) break;
  }
  return all;
}

test('earned launcher reaches physical raised deck and wall techs; slow reactions can miss', () => {
  for (const wall of [false, true]) {
    const high = launchIntoSurface(9, wall), low = launchIntoSurface(1, wall);
    expect(high.some(event => event.kind === 'hit' && event.moveId === 'heavy')).toBe(true);
    expect(high.some(event => event.kind === 'tech')).toBe(true);
    const tech = high.find(event => event.kind === 'tech')!;
    expect(wall ? Math.abs(tech.contactNormal!.x) : tech.contactNormal!.y).toBeGreaterThan(.9);
    expect(low.some(event => event.kind === 'bounce')).toBe(true);
  }
});
