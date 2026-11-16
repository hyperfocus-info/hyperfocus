import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';

async function fixture(airborne = false) {
  const value = await combatMotionFixture({ independentCombatInputs: true, movement: { separateJump: true }, staminaRegen: 0, airStaminaRegen: 0 });
  const saved = value.game.snapshot();
  for (const fighter of saved.combat!.state.fighters) { fighter.position.x = fighter.id === 'a' ? -20 : 20; fighter.position.y = airborne ? 8 : fighter.position.y; }
  for (const entity of saved.entities) if (entity.id === 'a' || entity.id === 'b') { entity.position[0] = entity.id === 'a' ? -20 : 20; if (airborne) entity.position[1] = 8; }
  value.game.restore(saved);
  const step = (actions: string[] = [], x = 0) => value.game.step([], [{ actions: new Set(actions), direction: { x, y: 0, z: 0 } }, { actions: new Set<string>(), direction: { x: 0, y: 0, z: 0 } }]);
  step();
  const fighter = () => value.game.snapshot().combat!.state.fighters[0]!;
  const motion = () => value.game.snapshot().combat!.motion![0]!;
  return { ...value, step, fighter, motion };
}

test('paid simultaneous dash and attack launches then cancels on ground and in air', async () => {
  for (const airborne of [false, true]) {
    const f = await fixture(airborne); const stamina = f.fighter().stamina;
    f.step(['dash', 'jab'], 1);
    expect(f.fighter().moveId).toBe(''); expect(f.fighter().stamina).toBe(stamina - 12);
    expect(f.motion().dash).toBeGreaterThan(0); expect(f.motion().dashAirborne).toBe(airborne);
    expect(f.runtime.physics.body('a')!.velocityX).toBeGreaterThan(0);
    f.step([], 0);
    expect(f.fighter().moveId).toBe('dash-jab-toward'); expect(f.fighter().stamina).toBe(stamina - 21);
    expect(f.motion().dash).toBe(0); expect(f.motion().dashCancelFrames).toBeGreaterThan(0);
    const checkpoint = f.game.checkpoint(); for (let i = 0; i < 8; i++) f.step(); const expected = f.game.snapshot();
    checkpoint.restore(); for (let i = 0; i < 8; i++) f.step(); expect(f.game.snapshot()).toEqual(expected);
    expect(f.motion().dashCancelFrames).toBe(0);
  }
});

test('neutral launch travels forward and attack press direction chooses neutral role', async () => {
  const f = await fixture(); f.step(['dash']); expect(f.runtime.physics.body('a')!.velocityX).toBeGreaterThan(0);
  f.step(['heavy']); expect(f.fighter().moveId).toBe('dash-heavy-neutral');
});

test('back hop retreats without auto wheel; release and fresh Drive launches wheel in ground and air', async () => {
  for (const airborne of [false, true]) {
    const f = await fixture(airborne); f.step(['dash'], -1); f.step(['heavy', 'drive'], -1);
    expect(f.fighter().moveId).toBe('dash-drive-heavy-away'); expect(f.runtime.physics.body('a')!.velocityY).toBeGreaterThan(0);
    for (let i = 0; i < 8; i++) f.step(['drive'], -1);
    expect(f.fighter().moveId).toBe('dash-drive-heavy-away'); expect(f.runtime.physics.body('a')!.x).toBeLessThan(-20);
    f.step([], -1); f.step(['drive'], -1); expect(f.fighter().moveId).toBe('dash-wheel-kick');
    expect(f.runtime.physics.body('a')!.velocityY).toBeGreaterThan(0);
  }
});


test('unaffordable simultaneous dash cannot create dash context or a free launch', async () => {
  const f = await fixture(); const saved = f.game.snapshot(); saved.combat!.state.fighters[0]!.stamina = 0;f.game.restore(saved);
  f.step(['dash', 'jab'], 1);expect(f.motion().dash).toBe(0);expect(f.fighter().moveId).toBe('');expect(f.fighter().history.some(entry => entry.dashing)).toBe(false);
  f.step();expect(f.fighter().moveId).toBe('');
});

test('dash followup lasts exactly six ticks after its cue ends and survives public save and rollback', async () => {
  for (const delay of [1, 6, 7]) {
    const f = await fixture();f.step(['dash'], 1);while (f.motion().dashCue > 0) f.step();
    expect(f.motion().dash).toBe(0);expect(f.motion().dashFollowupFrames).toBe(6);
    const save = f.game.snapshot();f.game.restore(save);
    for (let i = 1; i < delay; i++) f.step();
    const checkpoint = f.game.checkpoint();f.step(['jab']);const expected = f.game.snapshot();
    expect(f.fighter().moveId).toBe(delay <= 6 ? 'dash-jab-neutral' : 'jab');expect(f.motion().dashFollowupFrames).toBe(0);
    checkpoint.restore();f.step(['jab']);expect(f.game.snapshot()).toEqual(expected);
  }
});

test('attack recovery and hitstun cannot jump or dash out; eligible free air dash still works', async () => {
  for (const kind of ['attack', 'hit'] as const) for (const action of ['jump', 'dash']) {
    const f = await fixture(true), saved = f.game.snapshot(), fighter = saved.combat!.state.fighters[0]!;
    if (kind === 'attack') Object.assign(fighter, { moveId: 'heavy', moveFrame: 40 });else Object.assign(fighter, { stunKind: 'hit', stunFrames: 20 });
    f.game.restore(saved);const y = f.runtime.physics.body('a')!.velocityY;f.step([action], 1);
    expect(f.motion().dash).toBe(0);expect(f.runtime.physics.body('a')!.velocityY).toBeLessThanOrEqual(y);
  }
  const f = await fixture(true);f.step(['dash'], 1);expect(f.motion().dash).toBeGreaterThan(0);expect(f.motion().airDash).toBe(true);
});
