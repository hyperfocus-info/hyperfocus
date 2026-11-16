import { expect, test } from 'bun:test';
import { createFighter } from '../../../../combat/state.ts';
import { movementPlanKey, readPlan, reusableMovement } from './plan.ts';
import type { TacticalCandidate } from './selection.ts';

function fixture() {
  const self = createFighter({ id: 'self', position: { x: 0, y: 0, z: 0 } }, 100);
  const target = createFighter({ id: 'target', position: { x: 5, y: 0, z: 0 } }, 100);
  self.stamina = target.stamina = 100;
  return { self, target, body: { x: 0, y: 0, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 },
    targetBody: { x: 5, y: 0, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 },
    distance: 5, grounded: true, targetGrounded: true, difficulty: 9, enemyPhase: 'idle', maxStamina: 100 };
}

test('movement reuse excludes attacks, grabs and mobility commitments', () => {
  const choices: TacticalCandidate[] = [
    { id: 'approach', score: 1, movement: 'toward' }, { id: 'sprint', score: 2, movement: 'toward', sprint: true },
    { id: 'flank', score: 1, movement: 'flank' }, { id: 'space', score: 1, movement: 'away' }, { id: 'recover', score: 1 },
  ];
  for (const choice of choices) expect(reusableMovement(choice)).toBe(true);
  for (const choice of [
    { id: 'attack:jab', score: 1, moveId: 'jab' }, { id: 'grapple', score: 1, grapple: true },
    { id: 'dash', score: 1, movement: 'toward', dash: true }, { id: 'jump', score: 1, jump: true },
    { id: 'approach', score: 1, movement: 'toward', priority: true }, { id: 'unknown', score: 1, movement: 'toward' },
  ] as const) expect(reusableMovement(choice)).toBe(false);
});

test('observable danger, movement, resource and opponent phase changes invalidate a plan', () => {
  const original = fixture(), key = movementPlanKey(original);
  const changes: ((state: ReturnType<typeof fixture>) => void)[] = [
    state => { state.distance = 5.11; }, state => { state.targetBody.z = .11; }, state => { state.targetBody.y = .11; },
    state => { state.body.velocityX = 1.01; }, state => { state.targetBody.velocityY = -1; },
    state => { state.grounded = false; }, state => { state.targetGrounded = false; },
    state => { state.self.stunFrames = 1; }, state => { state.self.landingFrames = 1; },
    state => { state.target.armorFrames = 1; }, state => { state.target.protectionFrames = 1; },
    state => { state.target.guarding = true; }, state => { state.target.attackSerial++; },
    state => { state.enemyPhase = 'startup'; }, state => { state.target.moveId = 'jab'; },
    state => { state.self.health--; }, state => { state.self.facing.z = .2; },
  ];
  for (const change of changes) { const state = structuredClone(original);change(state);expect(movementPlanKey(state)).not.toBe(key); }
  const nearby = fixture();nearby.distance = 5.01;nearby.targetBody.x = 5.01;
  expect(movementPlanKey(nearby)).toBe(key);
  for (const threshold of [15, 24, 32]) {
    const below = fixture(), at = fixture();below.self.stamina = threshold - .01;at.self.stamina = threshold;
    expect(movementPlanKey(below)).not.toBe(movementPlanKey(at));
  }
  const weapon = { owner: 'self', projectileOwner: '', position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, length: 1, lightMoveId: 'light', heavyMoveId: 'heavy' };
  expect(movementPlanKey({ ...original, weapons: [weapon] })).not.toBe(key);
  expect(movementPlanKey({ ...original, weapons: [weapon] })).not.toBe(movementPlanKey({ ...original, weapons: [{ ...weapon, length: 2 }] }));
});

test('plan restoration supports old checkpoints, copies choices and rejects unsafe or unbounded data', () => {
  expect(readPlan(undefined)).toBeUndefined();
  const plan = { key: movementPlanKey(fixture()), choice: { id: 'sprint', score: 2, movement: 'toward' as const, sprint: true }, until: 6, serial: 0 };
  const restored = readPlan(plan);expect(restored).toEqual(plan);
  plan.choice.score = 9;expect(restored?.choice.score).toBe(2);
  for (const invalid of [null, { ...plan, extra: true }, { ...plan, until: -1 }, { ...plan, serial: -1 },
    { ...plan, key: 'x'.repeat(2049) }, { ...plan, choice: { ...plan.choice, score: Infinity } },
    { ...plan, choice: { ...plan.choice, dash: true } }, { ...plan, choice: { id: 'attack:jab', score: 1, moveId: 'jab' } }]) {
    expect(() => readPlan(invalid)).toThrow();
  }
});
