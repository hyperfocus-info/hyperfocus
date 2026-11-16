import { expect, test } from 'bun:test';
import { createCombatMotion3D } from '../combat-motion.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { readCombatProject3D } from '../combat-declaration.ts';

async function fallingContact(height: number, initialDownwardSpeed = 0, tech = false) {
  const f = await combatMotionFixture({ gravityScale: 1.9, staminaRegen: 0, airStaminaRegen: 0 });
  const standingHeight = f.runtime.physics.body('a')!.y;
  const saved = f.game.snapshot();
  const actor = saved.entities.find(entity => entity.id === 'a')!;
  actor.position = [-20, standingHeight + height, 0];
  saved.entities.find(entity => entity.id === 'b')!.position = [20, standingHeight, 0];
  Object.assign(saved.combat!.state.fighters[0]!, { position: { x: -20, y: actor.position[1], z: 0 }, stunKind: 'hit', stunFrames: 300 });
  f.game.restore(saved);
  f.runtime.physics.setVelocity('a', 0, -initialDownwardSpeed, 0);
  const observer = createCombatMotion3D({ runtime: f.runtime, definition: readCombatProject3D(f.project.extensions.hyperfocusCombat)! });
  const impacts: number[] = [];
  let firstContactHeight: number | undefined, bounceHeight = 0, firstContactFrame = -1, recovered = false;
  for (let frame = 0; frame < 180; frame++) {
    const collision = observer.surfaces().collisions.find(item => item.fighterId === 'a');
    if (collision && f.game.snapshot().combat!.state.fighters[0]!.stunKind === 'hit') {
      impacts.push(collision.impulse!);
      if (firstContactHeight === undefined) { firstContactHeight = f.runtime.physics.body('a')!.y;firstContactFrame = frame; }
    }
    f.game.step(tech && collision ? ['a:tech'] : []);
    if (firstContactHeight !== undefined) bounceHeight = Math.max(bounceHeight, f.runtime.physics.body('a')!.y - firstContactHeight);
    if (tech && collision) {
      const fighter = f.game.snapshot().combat!.state.fighters[0]!;
      recovered ||= fighter.stunFrames === 0 && fighter.stunKind === '' && fighter.protectionFrames > 0;
    }
  }
  return { ...f, impacts, bounceHeight, firstContactFrame, recovered, standingHeight };
}

test('a low missed-tech fall makes a small dissipating rebound instead of a fixed-height launch', async () => {
  const low = await fallingContact(.06), medium = await fallingContact(.2);
  expect(low.impacts.length).toBeGreaterThan(0);
  expect(low.impacts[0]!).toBeLessThan(1.2);
  expect(low.bounceHeight).toBeLessThan(.04);
  expect(medium.impacts[0]!).toBeGreaterThan(low.impacts[0]!);
  expect(medium.bounceHeight).toBeGreaterThan(low.bounceHeight);
  expect(low.impacts.length).toBeLessThanOrEqual(2);
  expect(low.runtime.physics.body('a')!.y).toBeCloseTo(low.standingHeight, 3);
  expect(Math.abs(low.runtime.physics.body('a')!.velocityY)).toBeLessThan(.1);
});

test('high falls and an intentional fast downward slam retain strong surface bounce', async () => {
  const high = await fallingContact(3), slam = await fallingContact(.06, 20);
  expect(high.impacts[0]!).toBeGreaterThan(6);
  expect(high.bounceHeight).toBeGreaterThan(.8);
  expect(slam.impacts[0]).toBe(10);
  expect(slam.bounceHeight).toBeGreaterThan(2);
  for (let index = 1; index < high.impacts.length; index++) expect(high.impacts[index]!).toBeLessThan(high.impacts[index - 1]!);
});

test('fresh tech at a low physical impact still clears hitstun and gives protected control', async () => {
  const miss = await fallingContact(.06), success = await fallingContact(.06, 0, true);
  expect(success.impacts[0]).toBeCloseTo(miss.impacts[0]!, 8);
  expect(success.recovered).toBe(true);
  expect(success.impacts).toHaveLength(1);
  expect(miss.game.snapshot().combat!.state.fighters[0]!.stunKind).toBe('hit');
});

test('resting stunned contacts do not create bounce events or frame-rate impact sounds', async () => {
  const rest = await fallingContact(0);
  expect(rest.impacts).toEqual([]);
  expect(rest.bounceHeight).toBe(0);
  expect(rest.firstContactFrame).toBe(-1);
});

test('a physical low fall and its dissipating rebound reconstruct exactly across rollback', async () => {
  const f = await combatMotionFixture({ gravityScale: 1.9 });
  const saved = f.game.snapshot(), actor = saved.entities.find(entity => entity.id === 'a')!;
  actor.position = [-20, actor.position[1] + .1, 0];
  Object.assign(saved.combat!.state.fighters[0]!, { position: { x: -20, y: actor.position[1], z: 0 }, stunKind: 'hit', stunFrames: 90 });
  f.game.restore(saved);
  const checkpoint = f.game.checkpoint();
  const run = () => {
    const heights: number[] = [];
    for (let frame = 0; frame < 70; frame++) { f.game.step();heights.push(f.runtime.physics.body('a')!.y); }
    return { heights, snapshot: f.game.snapshot() };
  };
  const first = run();
  checkpoint.restore();
  expect(run()).toEqual(first);
});
