import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { sampleCombatAttackPose } from '../combat-visuals/attack-pose.ts';

function setup() {
  const config = createTouchOfDeathPreset();
  const fighter = createCombatSimulation({ config, fighters: [{ id: 'fighter', position: { x: 0, y: 1, z: 0 } }] }).capture().fighters[0]!;
  return { config, fighter };
}

test('every directional attack meets its collision center throughout active frames including airborne aim', () => {
  const { config, fighter } = setup();
  for (const move of config.moves.filter(move => move.direction)) for (const side of [-1, 1]) {
    fighter.attackSide = side;
    fighter.facing = { x: .6, y: .6, z: Math.sqrt(.28) };
    for (let frame = move.startupFrames; frame < move.startupFrames + move.activeFrames; frame++) {
      fighter.moveFrame = frame;
      fighter.strikeIndex = (move.strikeFrames ?? [0]).filter(start => start <= frame - move.startupFrames).length - 1;
      const pose = sampleCombatAttackPose(fighter, move);
      const low = fighter.facing.y * move.reach, high = low + (move.hitHeight ?? 0);
      const dy = pose.fist[1] - Math.max(low, Math.min(high, pose.fist[1]));
      expect(Math.hypot(pose.fist[0], dy, pose.fist[2] - Math.hypot(fighter.facing.x, fighter.facing.z) * move.reach)).toBeLessThanOrEqual(move.hitRadius + .00001);
    }
  }
});

test('directions and heavy/light families have distinct anticipation and active silhouettes', () => {
  const { config, fighter } = setup();
  const anticipation = new Set<string>(), impact = new Set<string>();
  const moves = config.moves.filter(move => move.direction && !move.drive && !move.stringOnly && !move.dashAttack);
  for (const move of moves) {
    fighter.moveFrame = Math.floor(move.startupFrames * .7);
    const ready = sampleCombatAttackPose(fighter, move);
    anticipation.add(JSON.stringify([ready.fist, ready.pitch, ready.yaw]));
    fighter.moveFrame = move.startupFrames;
    const active = sampleCombatAttackPose(fighter, move);
    impact.add(JSON.stringify([active.fist, active.pitch, active.yaw]));
  }
  expect(anticipation.size).toBe(moves.length);
  expect(impact.size).toBe(moves.length);
});

test('side attacks mirror, strings alternate hands, and all moves settle smoothly to ready', () => {
  const { config, fighter } = setup();
  for (const move of config.moves.filter(move => move.direction)) {
    fighter.moveFrame = Math.floor(move.startupFrames * .7);
    fighter.attackSide = 1;
    const right = sampleCombatAttackPose(fighter, move);
    if (move.direction === 'side') {
      fighter.attackSide = -1;
      const left = sampleCombatAttackPose(fighter, move);
      expect(left.fist[0]).toBeCloseTo(-right.fist[0]);
      expect(left.fist[1]).toBeCloseTo(right.fist[1]);
      expect(left.fist[2]).toBeCloseTo(right.fist[2]);
      expect(left.yaw).toBeCloseTo(-right.yaw);
    }
    fighter.moveFrame = move.startupFrames + move.activeFrames + move.recoveryFrames;
    const settled = sampleCombatAttackPose(fighter, move);
    expect(settled.fist[0]).toBeCloseTo(.46 * settled.hand);
    expect(settled.fist[1]).toBeCloseTo(.2);
    expect(settled.fist[2]).toBeCloseTo(.28);
    expect(settled.pitch).toBeCloseTo(0);
    expect(settled.yaw).toBeCloseTo(0);
  }
  const jab = config.moves.find(move => move.id === 'jab')!;
  expect(sampleCombatAttackPose(fighter, jab).hand).toBe(-sampleCombatAttackPose(fighter, { ...jab, stringOnly: true }).hand);
});

test('heavy windups have visibly separated fist paths and opposite approach/check torso lean', () => {
  const { config, fighter } = setup();
  const poses = (['neutral', 'toward', 'away', 'side'] as const).map(direction => {
    const move = { ...config.moves.find(move => move.id === 'heavy')!, direction };
    fighter.moveFrame = Math.floor(move.startupFrames * .7);
    return sampleCombatAttackPose(fighter, move);
  });
  for (let i = 0; i < poses.length; i++) for (let j = i + 1; j < poses.length; j++) {
    const a = poses[i]!.fist, b = poses[j]!.fist;
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeGreaterThan(.55);
  }
  expect(poses[1]!.pitch).toBeGreaterThan(.4);
  expect(poses[2]!.pitch).toBeLessThan(-.5);
  expect(poses[2]!.fist[1]).toBeGreaterThan(.9);
  expect(Math.abs(poses[3]!.fist[0])).toBeGreaterThan(1.3);
});


test('Drive heavy loads a broad swing while feint retracts without a false contact pose', () => {
  const {config,fighter}=setup();const heavy=config.moves.find(m=>m.id==='drive-heavy')!;
  fighter.moveFrame=Math.floor(heavy.startupFrames*.7);const load=sampleCombatAttackPose(fighter,heavy);
  expect(Math.abs(load.fist[0])).toBeGreaterThan(.8);expect(load.fist[1]).toBeLessThan(-.5);
  fighter.moveFrame=heavy.startupFrames;expect(sampleCombatAttackPose(fighter,heavy).fist[2]).toBeCloseTo(heavy.reach);
  const feint=config.moves.find(m=>m.id==='feint')!;fighter.moveFrame=feint.startupFrames;
  const bait=sampleCombatAttackPose(fighter,feint);expect(bait.force).toBe(0);expect(bait.fist[2]).toBeLessThan(feint.reach*.5);
});
