import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../touch-of-death.ts';
import { createFighter } from '../state.ts';
import { resolveContacts } from '../step.ts';

function fixture(id = 'jab') {
  const config = createTouchOfDeathPreset(), move = config.moves.find(move => move.id === id)!;
  const attacker = createFighter({ id: 'a', position: { x: 0, y: 0, z: 0 } }, 100);
  const target = createFighter({ id: 'b', position: { x: 1, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } }, 100);
  Object.assign(attacker, { moveId: id, moveFrame: move.startupFrames, attackSerial: 1 });
  return { config, move, attacker, target };
}

test('contact records its own grounded and velocity-adjusted stun, independent of leftover stun and lethal health clamp', () => {
  for (const grounded of [false, true]) {
    const { config, move, attacker, target } = fixture('drive-jab');target.stunFrames = 500;target.stunKind = 'hit';target.health = 1;
    const event = resolveContacts([attacker, target], config, 20, [{ attackerId: 'a', targetId: 'b' }], grounded ? new Set(['b']) : new Set(), undefined, new Map([['a', { x: 5, y: 0, z: 0 }]]))[0]!;
    expect(event.hitstunFrames).toBe(Math.round((grounded ? move.groundedHitstunFrames! : move.hitstunFrames) * 1.05));
    expect(event.damage).toBe(1);expect(target.stunFrames).toBe(500);expect(event.armored).toBeUndefined();
  }
});

test('armor distinguishes damaging contact from interruption and removes counter while heavy breaks ordinary armor', () => {
  for (const heavy of [false, true]) {
    const { config, move, attacker, target } = fixture(heavy ? 'heavy' : 'jab');
    Object.assign(target, { armorFrames: 15, moveId: 'heavy-away', moveFrame: 1 });
    const event = resolveContacts([attacker, target], config, 20, [{ attackerId: 'a', targetId: 'b' }])[0]!;
    expect(event.damage).toBeGreaterThan(0);
    if (heavy) { expect(event.armored).toBeUndefined();expect(event.hitstunFrames).toBe(move.hitstunFrames);expect(target.moveId).toBe(''); }
    else { expect(event.armored).toBe(true);expect(event.hitstunFrames).toBe(0);expect(event.impulse).toEqual({ x: 0, y: 0, z: 0 });expect(event.counter).toBeUndefined();expect(target.moveId).toBe('heavy-away');expect(target.stunFrames).toBe(0); }
  }
});

test('block and parry have no body-hit stun metadata even when block damage is positive', () => {
  for (const parry of [false, true]) {
    const { config, attacker, target } = fixture();target.guarding = true;target.guardStarted = parry ? 20 : 0;target.guardMeter = 100;
    const event = resolveContacts([attacker, target], config, 20, [{ attackerId: 'a', targetId: 'b' }])[0]!;
    expect(event.kind).toBe(parry ? 'parry' : 'block');expect(event.hitstunFrames).toBeUndefined();expect(event.armored).toBeUndefined();
  }
});
