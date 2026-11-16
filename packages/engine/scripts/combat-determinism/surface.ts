import { createRigidWorld3D, type RigidContact3D } from '../../src/physics/rigid-3d.ts';
import { createCombatSimulation } from '../../src/combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../src/combat/touch-of-death.ts';
import type { CombatCollision, CombatEvent } from '../../src/combat/state.ts';
import { createCombatAi3D } from '../../src/project/3d/combat-ai.ts';
import { createCombatSurfaceForecast } from '../../src/project/3d/combat-motion/surface-forecast.ts';

/** Raised-deck/wall fixture shares the real forecast and AI inputs used by versus play. */
export function surfaceScenario(wall: boolean, difficulty: number) {
  const config = { ...createTouchOfDeathPreset(), escapeCharges: 0 };
  const world = createRigidWorld3D({ capacity: 4, gravityY: -31.392 });
  for (const [id, x] of [['attacker', 0], ['defender', 1.4]] as const) world.addBody({ id, shape: { kind: 'sphere', radius: .5 }, x, y: 4.5, continuous: true });
  world.addBody({ id: 'deck', type: 'static', shape: { kind: 'box', halfX: 30, halfY: .2, halfZ: 30 }, y: 3.8 });
  if (wall) world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfX: .2, halfY: 8, halfZ: 30 }, x: 2.3, y: 5 });
  const fighters = [{ id: 'attacker', position: { x: 0, y: 4.5, z: 0 } }, { id: 'defender', position: { x: 1.4, y: 4.5, z: 0 }, facing: { x: -1, y: 0, z: 0 } }];
  const sim = createCombatSimulation({ config, fighters }), ai = createCombatAi3D({ config });
  const forecast = createCombatSurfaceForecast({ world, bodyIds: ['deck', 'wall'] });
  const events: CombatEvent[] = [];
  const contact: RigidContact3D = { a: 0, b: 0, aId: '', bId: '', normalX: 0, normalY: 0, normalZ: 0, penetration: 0, pointX: 0, pointY: 0, pointZ: 0, trigger: false, closingSpeedMetersPerSecond: 0, effectiveMassKg: 0, impactEnergyJoules: 0, normalImpulseNewtonSeconds: 0, breakthrough: false };
  let frame = 0;
  return { step() {
    const collisions: CombatCollision[] = [];
    for (let index = 0; index < world.contactCount(); index++) {
      world.contact(index, contact);
      if (contact.closingSpeedMetersPerSecond <= 1 || ![contact.aId, contact.bId].includes('defender') || [contact.aId, contact.bId].includes('attacker')) continue;
      const body = world.body('defender')!;
      const sign = (body.x - contact.pointX) * contact.normalX + (body.y - contact.pointY) * contact.normalY + (body.z - contact.pointZ) * contact.normalZ >= 0 ? 1 : -1;
      collisions.push({ fighterId: 'defender', normal: { x: contact.normalX * sign, y: contact.normalY * sign, z: contact.normalZ * sign } });
    }
    const state = sim.capture(), body = world.body('defender')!, targetBody = world.body('attacker')!;
    const decision = state.fighters[1]!.stunKind === 'hit' ? ai.step({ state, fighterId: 'defender', targetId: 'attacker', difficulty,
      grounded: false, targetGrounded: true, body, targetBody,
      surfaceContactFrames: forecast('defender', -31.392, 12), collision: collisions.length > 0 }) : undefined;
    const current = sim.step({ inputs: [{ fighterId: 'attacker', pressed: frame === 1 ? ['heavy'] : [] }, decision?.input ?? { fighterId: 'defender' }], collisions,
      poses: fighters.map(fighter => { const pose = world.body(fighter.id)!;return { fighterId: fighter.id, position: { x: pose.x, y: pose.y, z: pose.z } }; }) });
    events.push(...current);
    for (const event of current) world.applyImpulse(event.targetId, event.impulse.x, event.impulse.y, event.impulse.z);
    if (sim.capture().fighters[1]!.stunKind === 'hit') { const moved = world.body('defender')!;world.setVelocity('defender', moved.velocityX * .985, moved.velocityY, moved.velocityZ * .985); }
    world.step(0.016666666666666666);frame++;
    const done = current.some(event => event.kind === 'tech' || event.kind === 'bounce');
    if (frame > 180) throw new Error('Surface scenario never reached physical contact.');
    if (done) {
      const result = events.find(event => event.kind === (difficulty === 9 ? 'tech' : 'bounce'));
      if (!events.some(event => event.kind === 'hit' && event.moveId === 'heavy') || !result
        || (wall ? Math.abs(result.contactNormal!.x) : result.contactNormal!.y) < .9) throw new Error('Surface scenario did not earn the expected launch and defensive outcome.');
    }
    return { done, metrics: { events: events.map(event => event.kind), wall, difficulty }, state: { combat: sim.capture(), physics: world.checkpoint(), ai: ai.capture() } };
  } };
}
