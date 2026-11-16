import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { combatMotionFixture as fixture } from '../combat-motion-fixture.ts';

test('walking diagonally into a solid obstacle slides along it and can immediately turn away', async () => {
  const { game, runtime } = await fixture({ obstacle: true });
  const start = runtime.physics.body('a')!.z;
  for (let frame = 0; frame < 90; frame++) game.step(['move-left', 'move-up']);
  expect(runtime.physics.body('a')!.z).toBeLessThan(start - 5);
  expect(runtime.physics.body('a')!.x).toBeGreaterThan(-.15);
  const touching = runtime.physics.body('a')!.x;
  for (let frame = 0; frame < 10; frame++) game.step(['move-right']);
  expect(runtime.physics.body('a')!.x).toBeGreaterThan(touching + .8);
});

test('a whiffed airborne attack preserves its fall instead of hovering through recovery', async () => {
  const { game, runtime } = await fixture();
  runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'a', position: [-20, 8, 0] }] });
  runtime.physics.setVelocity('a', 0, -3, 0);
  game.step(['a:jab']);
  expect(runtime.physics.body('a')!.velocityY).toBeLessThan(-3);
  for (let i = 0; i < 10; i++) game.step();
  expect(runtime.physics.body('a')!.velocityY).toBeLessThan(-4.5);
  expect(runtime.physics.body('a')!.y).toBeLessThan(7.3);
});

test('ground jump, one air dash and committed attacks reject unlinked special interruption', async () => {
  const { game, runtime } = await fixture();
  game.step(['a:jump']);
  expect(runtime.physics.body('a')?.velocityY).toBeGreaterThan(8);
  game.step(['a:dash', 'move-up']);
  expect(runtime.physics.body('a')?.velocityZ).toBeLessThan(-15);
  for (let i = 0; i < 28; i++) game.step();
  const stamina = game.snapshot().combat?.state.fighters[0]?.stamina;
  game.step(['a:dash', 'move-right']);
  expect(runtime.physics.body('a')?.velocityZ).toBeLessThan(-15);
  expect(Math.abs(runtime.physics.body('a')?.velocityX ?? 0)).toBeLessThan(1);
  expect(game.snapshot().combat?.state.fighters[0]?.stamina).toBeGreaterThanOrEqual(stamina ?? 0);
  game.reset(); game.step(['a:heavy']); game.step(['a:jab', 'move-left']);
  expect(game.snapshot().combat?.state.fighters[0]?.moveId).toBe('heavy');
  expect(runtime.physics.body('a')?.velocityX).toBeGreaterThan(0);
  game.step(['a:evade', 'move-left']);
  expect(game.snapshot().combat?.state.fighters[0]?.moveId).toBe('heavy');
  expect(runtime.physics.body('a')?.velocityX).toBeGreaterThan(0);
});

test('neutral jump accepts an early landing tap once without turning a held button into repeated hops', async () => {
  const { game, runtime } = await fixture();const supportHeight = runtime.physics.body('a')!.y;game.step(['a:jump']);
  for (let i = 0; i < 120; i++) { game.step();const body = runtime.physics.body('a')!;if (body.y < supportHeight + .5 && body.velocityY < -1) break; }
  expect(runtime.physics.body('a')!.velocityY).toBeLessThan(-1);
  game.step(['a:jump']);
  let jumped = false;
  for (let i = 0; i < 10; i++) { game.step(['a:jump']);if (runtime.physics.body('a')!.velocityY > 8) jumped = true; }
  expect(jumped).toBe(true);
  for (let i = 0; i < 120; i++) game.step(['a:jump']);
  expect(runtime.physics.body('a')!.velocityY).toBeLessThan(1);
  expect(game.snapshot().combat!.motion[0]!.jumpBuffer).toBe(0);
});

test('neutral jump buffers near attack recovery but never cancels commitment or carries tech out of hitstun', async () => {
  const { game, runtime } = await fixture();game.step(['a:heavy']);
  const save = game.snapshot();save.combat!.state.fighters[0]!.moveFrame = (() => { const move = createTouchOfDeathPreset().moves.find(move => move.id === 'heavy')!;return move.startupFrames + move.activeFrames + move.recoveryFrames - 4; })();game.restore(save);
  game.step(['a:jump']);expect(runtime.physics.body('a')!.velocityY).toBeLessThan(1);
  for (let i = 0; i < 6; i++) game.step();
  expect(runtime.physics.body('a')!.velocityY).toBeGreaterThan(7);
  const stunned = game.snapshot();stunned.combat!.state.fighters[0]!.stunKind = 'hit';stunned.combat!.state.fighters[0]!.stunFrames = 3;
  game.restore(stunned);game.step(['a:jump']);
  expect(game.snapshot().combat!.motion[0]!.jumpBuffer).toBe(0);
  expect(game.snapshot().combat!.motion[0]!.coyote).toBe(0);
});

test('leaving support permits a brief late jump but never a second jump from stale floor contact', async () => {
  const { game, runtime } = await fixture();
  runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'a', position: [60, 1, 0] }] });game.step();
  game.step(['a:jump']);expect(runtime.physics.body('a')!.velocityY).toBeGreaterThan(8);
  game.step();const descending = runtime.physics.body('a')!.velocityY;game.step(['a:jump']);
  expect(runtime.physics.body('a')!.velocityY).toBeLessThan(descending);
});

test('configured jump spends once on takeoff, not on buffered recovery frames or rejected air taps', async () => {
  const { game, runtime } = await fixture({ staminaRegen: 0, airStaminaRegen: 0, jumpCost: 14 });game.step(['a:heavy']);
  const save = game.snapshot();save.combat!.state.fighters[0]!.moveFrame = (() => { const move = createTouchOfDeathPreset().moves.find(move => move.id === 'heavy')!;return move.startupFrames + move.activeFrames + move.recoveryFrames - 4; })();game.restore(save);
  const initial = game.snapshot().combat!.state.fighters[0]!.stamina;
  game.step(['a:jump']);expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(initial);
  for (let i = 0; i < 6; i++) game.step();
  expect(runtime.physics.body('a')!.velocityY).toBeGreaterThan(7);
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(initial - 14);
  game.step(['a:jump']);for (let i = 0; i < 10; i++) game.step();
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(initial - 14);
});

test('holding a neutral jump while adding direction preserves momentum; a fresh airborne Cross dashes immediately', async () => {
  const { game, runtime } = await fixture({ staminaRegen: 0, airStaminaRegen: 0, jumpCost: 14 });
  runtime.physics.setVelocity('a', 0, 0, -7);game.step(['a:jump']);
  const paid = game.snapshot().combat!.state.fighters[0]!.stamina;
  for (let frame = 1; frame <= 8; frame++) {
    game.step(['a:jump', 'move-up']);
    expect(game.snapshot().combat!.motion[0]!.dash).toBe(0);
    expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(paid);
    expect(runtime.physics.body('a')!.velocityY).toBeGreaterThan(5);
    expect(runtime.physics.body('a')!.velocityZ).toBeGreaterThan(-8);
  }
  game.step();game.step(['a:jump', 'move-up']);
  expect(game.snapshot().combat!.motion[0]!.dash).toBeGreaterThan(0);
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(paid - 12);
});

test('airborne Cross dashes on its first press tick, charges once, and never repeats or queues a release jump', async () => {
  const { game, runtime } = await fixture({ staminaRegen: 0, airStaminaRegen: 0, jumpCost: 14 });
  game.step(['a:jump']);game.step();const paidJump = game.snapshot().combat!.state.fighters[0]!.stamina;
  game.step(['a:jump', 'move-up']);
  expect(runtime.physics.body('a')!.velocityZ).toBeLessThan(-15);
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(paidJump - 12);
  expect(game.snapshot().combat!.motion[0]!.airDash).toBe(true);
  for (let i = 0; i < 18; i++) game.step(['a:jump', 'move-right']);
  game.step(['move-right']);game.step(['a:jump', 'move-right']);game.step(['move-right']);
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(paidJump - 12);
  expect(game.snapshot().combat!.motion[0]!.jumpQueued).toBe(false);
  expect(game.snapshot().combat!.motion[0]!.jumpBuffer).toBe(0);
});

test('airborne Cross respects attack commitment, hitstun and exhausted stamina', async () => {
  const { game, runtime } = await fixture({ staminaRegen: 0, airStaminaRegen: 0 });
  for (const restriction of ['attack', 'stun', 'stamina']) {
    game.reset();for (let i = 0; i < 30; i++) game.step();game.step(['a:jump']);game.step();
    if (restriction === 'attack') game.step(['a:heavy']);
    else { const saved = game.snapshot();const fighter = saved.combat!.state.fighters[0]!;
      if (restriction === 'stun') { fighter.stunKind = 'hit';fighter.stunFrames = 30; } else fighter.stamina = 0;game.restore(saved); }
    game.step(['a:jump', 'move-up']);
    expect(game.snapshot().combat!.motion[0]!.dash).toBe(0);
    expect(Math.abs(runtime.physics.body('a')!.velocityZ)).toBeLessThan(8);
    if (restriction === 'attack') expect(game.snapshot().combat!.state.fighters[0]!.moveId).toBe('heavy');
  }
});

test('a completed airborne Cross tap during hitstop dashes on resume and never becomes a deferred landing jump', async () => {
  const { game, runtime } = await fixture({ staminaRegen: 0, airStaminaRegen: 0, jumpCost: 14 });
  game.step(['a:jump']);game.step();const saved = game.snapshot();saved.combat!.hitstop.remaining = 3;game.restore(saved);
  game.step(['a:jump', 'move-up']);game.step(['move-up']);game.step(['move-up']);
  game.step(['move-left']);
  expect(runtime.physics.body('a')!.velocityX).toBeLessThan(-15);
  expect(game.snapshot().combat!.motion[0]!.airDash).toBe(true);
  expect(game.snapshot().combat!.motion[0]!.jumpQueued).toBe(false);
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(74);
  for (let i = 0; i < 18; i++) game.step(['move-left']);
  expect(game.snapshot().combat!.motion[0]!.jumpBuffer).toBe(0);
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(74);
});

test('a fresh neutral attack after frozen directional Cross preserves dash direction without canceling the attack or queuing a jump', async () => {
  const { game, runtime } = await fixture({ staminaRegen: 0, airStaminaRegen: 0, jumpCost: 14 });
  game.step(['a:jump']);game.step();const saved = game.snapshot();saved.combat!.hitstop.remaining = 3;game.restore(saved);
  game.step(['a:jump', 'move-up']);game.step();game.step();
  game.step(['a:jab']);
  const combat = game.snapshot().combat!;
  expect(combat.state.fighters[0]!.moveId).toBe('jab');
  expect(combat.motion[0]!.stepBuffer).toBeGreaterThan(0);
  expect(combat.motion[0]!.queuedZ).toBeLessThan(-.9);
  expect(combat.motion[0]!.jumpQueued).toBe(false);
  expect(combat.motion[0]!.dash).toBe(0);
  expect(Math.abs(runtime.physics.body('a')!.velocityZ)).toBeLessThan(8);
  for (let i = 0; i < 30; i++) game.step();
  expect(game.snapshot().combat!.motion[0]!.jumpBuffer).toBe(0);
});

test('Drive tap jumps with direction held and queues behind a committed attack without canceling it', async () => {
  const { game, runtime } = await fixture({ staminaRegen: 0, airStaminaRegen: 0, jumpCost: 14 });
  game.step(['a:jump-tap', 'move-up']);
  expect(runtime.physics.body('a')!.velocityY).toBeGreaterThan(8);
  expect(game.snapshot().combat!.motion[0]!.dash).toBe(0);
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(86);
  game.reset();for (let i = 0; i < 30; i++) game.step();
  game.step(['a:heavy', 'a:drive', 'move-left']);game.step(['a:jump-tap', 'move-left']);
  expect(game.snapshot().combat!.state.fighters[0]!.moveId).toBe('drive-heavy-away');
  expect(game.snapshot().combat!.motion[0]!.jumpQueued).toBe(true);
  expect(runtime.physics.body('a')!.velocityY).toBeLessThan(1);
  let jumped = false;
  for (let i = 0; i < 100; i++) {
    game.step();const fighter = game.snapshot().combat!.state.fighters[0]!;
    if (runtime.physics.body('a')!.velocityY > 8) { expect(fighter.moveId).toBe('');jumped = true;break; }
  }
  expect(jumped).toBe(true);expect(game.snapshot().combat!.motion[0]!.jumpBuffer).toBe(0);
});

test('queued Drive tap is discarded when hit and remains compatible with old motion saves', async () => {
  const { game } = await fixture();game.step(['a:heavy']);game.step(['a:jump-tap']);
  const saved = game.snapshot();saved.combat!.state.fighters[0]!.stunKind = 'hit';saved.combat!.state.fighters[0]!.stunFrames = 3;
  game.restore(saved);game.step();expect(game.snapshot().combat!.motion[0]!.jumpBuffer).toBe(0);
  const legacy = JSON.parse(JSON.stringify(game.snapshot()));
  for (const motion of legacy.combat.motion) { delete motion.jumpBuffer;delete motion.jumpQueued;delete motion.jumpIntent;delete motion.coyote; }
  expect(() => game.restore(legacy)).not.toThrow();
});

test('one Drive tap survives a legal Strike string into Heavy and jumps only after the entire chain recovers', async () => {
  const { game, runtime } = await fixture({ staminaRegen: 0, airStaminaRegen: 0, jumpCost: 14 });
  game.step(['a:jab']);game.step(['a:jump-tap']);
  while (game.snapshot().combat!.state.fighters[0]!.moveFrame < createTouchOfDeathPreset().moves.find(move => move.id === 'jab')!.cancels[0]!.fromFrame) game.step();
  expect(game.snapshot().combat!.state.fighters[0]!.hitConfirmed).toBe(true);
  game.step(['a:jab']);expect(game.snapshot().combat!.state.fighters[0]!.moveId).toBe('jab-link');
  while (game.snapshot().combat!.state.fighters[0]!.moveFrame < 8) game.step();
  game.step(['a:heavy']);expect(game.snapshot().combat!.state.fighters[0]!.moveId).toBe('heavy');
  const saved = game.snapshot();expect(saved.combat!.motion[0]!.jumpQueued).toBe(true);game.restore(saved);
  let jumped = false;
  for (let frame = 0; frame < 100; frame++) {
    game.step();const fighter = game.snapshot().combat!.state.fighters[0]!;
    if (fighter.moveId) expect(runtime.physics.body('a')!.velocityY).toBeLessThan(1);
    if (runtime.physics.body('a')!.velocityY > 8) { expect(fighter.moveId).toBe('');jumped = true;break; }
  }
  expect(jumped).toBe(true);expect(game.snapshot().combat!.motion[0]!.jumpQueued).toBe(false);
});

test('a queued airborne Drive jump expires shortly after attack recovery rather than hopping much later', async () => {
  const { game, runtime } = await fixture();
  runtime.applyCommands({ commands: [{ type: 'teleport', entityId: 'a', position: [-20, 40, 0] }] });
  for (let i = 0; i < 8; i++) game.step();game.step(['a:jab']);game.step(['a:jump-tap']);
  for (let i = 0; i < 45; i++) game.step();
  expect(game.snapshot().combat!.motion[0]!.jumpQueued).toBe(false);
  expect(game.snapshot().combat!.motion[0]!.jumpBuffer).toBe(0);
  expect(runtime.physics.body('a')!.velocityY).toBeLessThan(0);
});

test('heavy directions earn distinct physical setup, launcher and cash-out outcomes at delivered body spacing', async () => {
  const { game, runtime } = await fixture({ hurtRadius: 1 });
  function strike(direction?: string) {
    game.reset();for (let i = 0; i < 30; i++) game.step();
    game.step(['a:heavy', ...(direction ? [direction] : [])]);
    const selected = game.snapshot().combat!.state.fighters[0]!.moveId;
    for (let i = 0; i < 90; i++) {
      game.step();const target = game.snapshot().combat!.state.fighters[1]!;
      if (target.health < 100) return { selected, health: target.health, stun: target.stunFrames, x: runtime.physics.body('b')!.velocityX, y: runtime.physics.body('b')!.velocityY };
    }
    throw new Error(`${selected} never connected at normal spacing`);
  }
  const setup = strike('move-left'), launcher = strike(), cashout = strike('move-right');
  expect(setup.selected).toBe('heavy-away');expect(setup.health).toBe(88);expect(setup.stun).toBeLessThan(launcher.stun);
  expect(setup.y).toBeLessThan(launcher.y - 2);expect(launcher.health).toBe(76);
  expect(cashout.selected).toBe('heavy-toward');expect(cashout.health).toBe(70);expect(cashout.x).toBeGreaterThan(launcher.x + 5);
});

test('dash direction, edge inputs and air charge survive portable save restore', async () => {
  const { game } = await fixture();
  game.step(['a:jump']); game.step(['a:dash', 'move-up']);
  const saved = JSON.parse(JSON.stringify(game.snapshot()));
  for (let i = 0; i < 8; i++) game.step(['a:dash', 'move-left']);
  const expected = game.snapshot();
  game.restore(saved);
  for (let i = 0; i < 8; i++) game.step(['a:dash', 'move-left']);
  const actual = game.snapshot();
  expect(actual.combat?.motion).toEqual(expected.combat?.motion);
  expect(actual.combat?.held).toEqual(expected.combat?.held);
  for (const entity of actual.entities) {
    const other = expected.entities.find(item => item.id === entity.id);
    for (const axis of [0, 1, 2]) expect(entity.position[axis]).toBeCloseTo(other?.position[axis] ?? 0, 6);
  }
  expect(actual.combat?.state.fighters.map(f => [f.moveId, f.moveFrame, f.health, f.escapeCharges])).toEqual(expected.combat?.state.fighters.map(f => [f.moveId, f.moveFrame, f.health, f.escapeCharges]));
});

test('launcher creates real vertical velocity and lifts the defender off the floor', async () => {
  const { game, runtime } = await fixture();
  game.step(['a:heavy']);
  for (let i = 0; i < 28; i++) game.step();
  const launched = game.snapshot().combat?.state.fighters.find(f => f.id === 'b');
  expect(launched?.health).toBe(76);
  expect(runtime.physics.body('b')?.velocityY).toBeGreaterThan(8);
  let rose = false;
  for (let i = 0; i < 40; i++) { game.step(); if ((runtime.physics.body('b')?.y ?? 0) > 2) rose = true; }
  expect(rose).toBe(true);
});

test('direction Cross waits a quarter second before stepping into sprint, and neutral jump keeps coasting momentum', async () => {
  const { game, runtime } = await fixture({ staminaRegen: 0 });
  const initial = game.snapshot().combat!.state.fighters[0]!.stamina;
  for (let frame = 0; frame < 14; frame++) game.step(['a:jump', 'move-up']);
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(initial);
  expect(runtime.physics.body('a')!.velocityZ).toBeGreaterThan(-7);
  game.step(['a:jump', 'move-up']);
  expect(runtime.physics.body('a')!.velocityZ).toBeLessThan(-15);
  expect(runtime.physics.body('a')!.velocityY).toBeLessThan(1);
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(initial - 12);
  for (let i = 0; i < 15; i++) game.step(['a:jump', 'move-up']);
  expect(runtime.physics.body('a')!.velocityZ).toBeLessThan(-11.8);
  expect(runtime.physics.body('a')!.velocityZ).toBeGreaterThan(-12.1);
  const sprint = game.snapshot(), checkpoint = runtime.physics.checkpoint();
  game.step();
  const coast = runtime.physics.body('a')!.velocityZ;
  expect(coast).toBeLessThan(-11);
  game.step(['a:jump']);
  expect(runtime.physics.body('a')!.velocityY).toBeGreaterThan(8);
  expect(runtime.physics.body('a')!.velocityZ).toBeCloseTo(coast, 3);
  const expected = game.snapshot();
  game.restore(sprint); runtime.physics.restoreCheckpoint(checkpoint); game.step(); game.step(['a:jump']);
  expect(game.snapshot().combat).toEqual(expected.combat);
  expect(runtime.physics.body('a')!.velocityZ).toBeCloseTo(coast, 3);
});

test('short direction-held Cross always jumps on release, while neutral Cross jumps immediately only once', async () => {
  const { game, runtime } = await fixture({ staminaRegen: 0, airStaminaRegen: 0, jumpCost: 14 });
  for (const duration of [1, 5, 14]) {
    game.reset();for (let i = 0; i < 30; i++) game.step();
    for (let i = 0; i < duration; i++) game.step(['a:jump', 'move-up']);
    expect(runtime.physics.body('a')!.velocityY).toBeLessThan(1);
    expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(100);
    const saved = game.snapshot();game.restore(saved);game.step(['move-up']);
    expect(runtime.physics.body('a')!.velocityY).toBeGreaterThan(8);
    expect(game.snapshot().combat!.motion[0]!.dash).toBe(0);
    expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(86);
  }
  game.reset();for (let i = 0; i < 30; i++) game.step();game.step(['a:jump']);
  const launch = runtime.physics.body('a')!.velocityY;game.step(['move-up']);
  expect(runtime.physics.body('a')!.velocityY).toBeLessThan(launch);
  expect(game.snapshot().combat!.motion[0]!.jumpQueued).toBe(false);
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(86);
});

test('Cross pressed and released during hitstop remains a short directional jump even when direction changes on resume', async () => {
  for (const resumeDirection of ['move-up', 'move-right']) {
  const { game, runtime } = await fixture({ staminaRegen: 0, airStaminaRegen: 0, jumpCost: 14 });
  const saved = game.snapshot();saved.combat!.hitstop.remaining = 3;game.restore(saved);
  const frame = game.snapshot().combat!.state.frame;
  game.step(['a:jump', 'move-up']);game.step(['move-up']);game.step(['move-up']);
  expect(game.snapshot().combat!.state.frame).toBe(frame);
  game.step([resumeDirection]);game.step([resumeDirection]);
  expect(runtime.physics.body('a')!.velocityY).toBeGreaterThan(8);
  expect(game.snapshot().combat!.motion[0]!.dash).toBe(0);
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBe(86);
  }
});

test('exhausted fighters retain camera-relative walking, guard, and neutral jumping', async () => {
  const { game, runtime } = await fixture({ staminaRegen: 0, cameraPosition: [7, 4, 0] });
  const saved = game.snapshot(); saved.combat!.state.fighters[0]!.stamina = 0; game.restore(saved);
  game.step(['a:jump', 'move-up']);
  expect(runtime.physics.body('a')!.velocityX).toBeLessThan(-5.8);
  expect(runtime.physics.body('a')!.velocityX).toBeGreaterThan(-6.1);
  expect(Math.abs(runtime.physics.body('a')!.velocityZ)).toBeLessThan(.01);
  expect(game.snapshot().combat!.state.fighters[0]!.locomotionAllowed).toBe(false);
  game.step(['a:guard']);
  expect(game.snapshot().combat!.state.fighters[0]!.guarding).toBe(true);
  game.step(); game.step(['a:jump']);
  expect(runtime.physics.body('a')!.velocityY).toBeGreaterThan(8);
});

test('Cross held before hitstun cannot tech automatically; a fresh press arms free tech', async () => {
  const { game } = await fixture({ staminaRegen: 0 });
  game.step(['a:jump']);
  const saved = game.snapshot(), fighter = saved.combat!.state.fighters[0]!;
  fighter.stunKind = 'hit'; fighter.stunFrames = 30; fighter.stamina = 0;
  game.restore(saved); game.step(['a:jump']);
  expect(game.snapshot().combat!.state.fighters[0]!.techWindowFrames).toBe(0);
  game.step(); game.step(['a:jump']);
  expect(game.snapshot().combat!.state.fighters[0]!.techWindowFrames).toBeGreaterThan(0);
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBeCloseTo(1.215);
});

test('airborne hitstun preserves launch momentum without continuous directional thrust', async () => {
  const { game, runtime } = await fixture();
  game.step(['a:jump']);
  const saved = game.snapshot(), fighter = saved.combat!.state.fighters[0]!;
  fighter.stunKind = 'hit'; fighter.stunFrames = 60;
  game.restore(saved); runtime.physics.setVelocity('a', 0, 8, -10);
  for (let i = 0; i < 10; i++) game.step(['move-left']);
  const body = runtime.physics.body('a')!;
  expect(body.velocityX).toBeCloseTo(0, 6);
  expect(game.snapshot().combat!.state.fighters[0]!.influenceDirection.x).toBe(-1);
  expect(body.velocityZ).toBeLessThan(-8);
  expect(body.velocityZ).toBeGreaterThan(-9);
});

test('idle regenerates after a paid step; exhausted sustained sprint backs off to walking', async () => {
  const recovering = await fixture();
  recovering.game.step(['a:dash', 'move-up']);
  const spent = recovering.game.snapshot().combat!.state.fighters[0]!.stamina;
  recovering.game.step();
  expect(recovering.game.snapshot().combat!.state.fighters[0]!.stamina).toBeGreaterThan(spent);
  const { game, runtime } = await fixture({ staminaRegen: 0 });
  const saved = game.snapshot(); saved.combat!.state.fighters[0]!.stamina = 13; game.restore(saved);
  for (let i = 0; i < 60; i++) game.step(['a:jump', 'move-up']);
  const fighter = game.snapshot().combat!.state.fighters[0]!;
  expect(fighter.stamina).toBeGreaterThanOrEqual(0);
  expect(fighter.stamina).toBeLessThan(.35);
  expect(fighter.locomotionAllowed).toBe(false);
  expect(runtime.physics.body('a')!.velocityZ).toBeLessThan(-5.8);
  expect(runtime.physics.body('a')!.velocityZ).toBeGreaterThan(-6.1);
});






test('forward step after a launcher makes a physical follow-up reachable', async () => {
  // Reduced knockback changes body-contact spacing; these are reachable timing samples, not a guaranteed continuous window.
  const heavy = createTouchOfDeathPreset().moves.find(move => move.id === 'heavy')!, end = heavy.startupFrames + heavy.activeFrames + heavy.hitRecoveryFrames!;
  for (const offset of [-3, 1, 7, 13, 19]) { const chaseFrame = end + offset;let reachable = false;
  for (const strikeDelay of [13, 16, 17]) {
    const { game } = await fixture();
    let followup = false;
    const startFrame = game.snapshot().combat!.state.frame;
    // Hitstop adds wall ticks, not combat frames or extra execution requirements.
    for (let wallTick = 0; wallTick < 1040; wallTick++) {
      const frame = game.snapshot().combat!.state.frame - startFrame;
      if (frame >= 130) break;
      const actions: string[] = [];
      if (frame === 0) actions.push('a:heavy');
      if (frame === chaseFrame) actions.push('a:dash', 'move-right');
      if (frame === chaseFrame + strikeDelay) actions.push('a:jab', 'a:drive');
      game.step(actions);
      if (frame === end - 3 && offset === -3) expect(game.snapshot().combat!.state.fighters[0]!.moveId).toBe('heavy');
      if ((game.snapshot().combat!.state.fighters[1]!.health) < 76) followup = true;
    }


    reachable ||= followup;
  }
  expect(reachable, `chase ${chaseFrame} has an earned continuation`).toBe(true);
  }
});


test('launch chase requires intent, stamina and lock-on, and stays deterministic after saving', async () => {
  for (const mode of ['away', 'exhausted', 'unlocked', 'chase']) {
    const { game, runtime } = await fixture();
    const start = game.snapshot().combat!.state.frame;
    game.step(['a:heavy']);
    while (game.snapshot().combat!.state.frame < start + 68) game.step();
    if (mode === 'exhausted') {
      const snapshot = game.snapshot(); snapshot.combat!.state.fighters[0]!.stamina = 0; game.restore(snapshot);
    }
    if (mode === 'unlocked') { game.step(['a:lockon']); game.step(); }
    game.step(['a:dash', mode === 'away' ? 'move-left' : 'move-right']);
    expect(runtime.physics.body('a')!.velocityY > 8).toBe(mode === 'chase');
    if (mode !== 'chase') continue;
    const saved = game.snapshot(), checkpoint = runtime.physics.checkpoint();
    for (let i = 0; i < 14; i++) game.step();
    const expected = game.snapshot();
    game.restore(saved); runtime.physics.restoreCheckpoint(checkpoint);
    for (let i = 0; i < 14; i++) game.step();
    expect(game.snapshot()).toEqual(expected);
  }
});



test('air dash accepted, spent and landing rearm cues follow paid mechanics and survive saves', async () => {
  const {game,runtime}=await fixture();
  runtime.applyCommands({commands:[{type:'teleport',entityId:'a',position:[-20,5,0]}]});game.step();
  game.step(['a:dash','move-right']);
  const accepted=game.snapshot();
  expect(accepted.combat!.motion![0]).toMatchObject({airDash:true,dashCueKind:1});
  expect(accepted.combat!.motion![0]!.dashCue).toBeGreaterThan(0);
  game.restore(accepted);
  game.step(); const stamina=game.snapshot().combat!.state.fighters[0]!.stamina;
  game.step(['a:dash','move-left']);
  expect(game.snapshot().combat!.motion![0]).toMatchObject({dashCueKind:2});
  expect(runtime.physics.body('a')!.velocityX).toBeGreaterThan(0);
  expect(game.snapshot().combat!.state.fighters[0]!.stamina).toBeGreaterThanOrEqual(stamina);
  let rearmed=false;
  for(let i=0;i<180;i++) { game.step(); const cue=game.snapshot().combat!.motion![0]!; if(cue.dashCueKind===3&&cue.dashCue>0) { rearmed=true; expect(cue.airDash).toBe(false); break; } }
  expect(rearmed).toBe(true);
  const saved=game.snapshot(); saved.combat!.state.fighters[0]!.stunFrames=8;saved.combat!.state.fighters[0]!.stunKind='hit';game.restore(saved);
  game.step(['a:dash']);expect(game.snapshot().combat!.motion![0]!.dashCue).toBe(0);
});
