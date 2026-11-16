import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../../combat-motion-fixture.ts';
import { createGameplay3D, createHyperfocus3DRuntime } from '../../../runtime-3d.ts';

async function fixture() {
  const base = await combatMotionFixture({ independentCombatInputs: true, movement: { separateJump: true } });
  const project = { ...base.project, extensions: { ...base.project.extensions, hyperfocusCombat: { ...base.project.extensions.hyperfocusCombat,
    interactions: { weapons: [], grappleStartupFrames: 8, grappleTechFrames: 6, grappleDamage: 5.2, grappleSpeed: 8.4, grappleHitstunFrames: 82 } } } };
  const runtime = await createHyperfocus3DRuntime(project, base.assets), game = createGameplay3D({ project, runtime, independentCombatInputs: true });
  const step = (a: string[] = [], b: string[] = []) => game.step([], [a, b].map(actions => ({ actions: new Set(actions), direction: { x: 0, y: 0, z: 0 } })));
  const state = () => game.snapshot().combat!;
  const advance = (a: string[] = [], b: string[] = []) => { const frame = state().state.frame;for (let i = 0; i < 60 && state().state.frame === frame; i++) step(a, b);expect(state().state.frame).toBeGreaterThan(frame); };
  for (let i = 0; i < 30; i++) step();
  const start = (seat: number) => { step(seat === 0 ? ['interact'] : [], seat === 1 ? ['interact'] : []);expect(state().interactions!.attempts).toHaveLength(1);for (let i = 0; i < 8; i++) step();expect(state().interactions!.grapples).toHaveLength(1); };
  return { runtime, game, step, state, start, advance };
}

test('both seats tech ordinary 3D grabs with fresh Jump and Dash throughout the six-frame grip', async () => {
  for (const attacker of [0, 1]) for (const key of ['jump', 'dash']) for (const delay of [0, 5, 6]) {
    const f = await fixture(), defender = 1 - attacker;f.step(attacker === 0 ? ['interact'] : [], attacker === 1 ? ['interact'] : []);for (let i = 0; i < 7 + delay; i++) f.step();
    const before = f.runtime.physics.body(defender === 0 ? 'a' : 'b')!;
    f.step(defender === 0 ? [key] : [], defender === 1 ? [key] : []);
    const state = f.state();expect(state.interactions!.trace.at(-1)!.kind).toBe(delay < 6 ? 'grapple-tech' : 'grapple-throw');expect(state.interactions!.grapples).toHaveLength(0);
    expect(state.state.fighters[defender]!.health).toBeCloseTo(delay < 6 ? 100 : 94.8);expect(state.motion[defender]!.dash).toBe(0);expect(state.motion[defender]!.jumpBuffer).toBe(0);
    if (delay < 6) expect(f.runtime.physics.body(defender === 0 ? 'a' : 'b')!.velocityY).toBeLessThanOrEqual(before.velocityY + .01);
    const save = f.game.checkpoint();f.advance();const expected = f.game.snapshot();save.restore();f.advance();expect(f.game.snapshot()).toEqual(expected);
  }
});

test('holding Jump or Dash from before grip does not manufacture a tech', async () => {
  for (const attacker of [0, 1]) for (const key of ['jump', 'dash']) {
    const f = await fixture(), defender = 1 - attacker;f.step(attacker === 0 ? ['interact'] : [], attacker === 1 ? ['interact'] : []);
    for (let i = 0; i < 6; i++) f.step();
    // Press before acquisition while still free; keep holding through the grip.
    for (let i = 0; i < 8; i++) f.step(defender === 0 ? [key] : [], defender === 1 ? [key] : []);
    expect(f.state().interactions!.trace.some(event => event.kind === 'grapple-tech')).toBe(false);
    expect(f.state().interactions!.trace.some(event => event.kind === 'grapple-throw')).toBe(true);
    expect(f.state().state.fighters[defender]!.health).toBeCloseTo(94.8);
  }
});

test('grab startup rejects duplicate grabs and attacks, and an ordinary jab interrupts it', async () => {
  const f = await fixture();f.step(['interact']);
  for (let i = 0; i < 7; i++) f.step(i % 2 ? [] : ['interact', 'jab', 'jump', 'dash', 'guard']);
  expect(f.state().interactions!.attempts).toHaveLength(1);expect(f.state().state.fighters[0]!.moveId).toBe('');expect(f.state().motion[0]!.dash).toBe(0);
  expect(f.state().interactions!.trace.filter(event => event.kind === 'grapple-windup')).toHaveLength(1);
  const hit = await fixture();hit.step([], ['jab']);for (let i = 0; i < 8; i++) hit.step();hit.step(['interact']);
  for (let i = 0; i < 10; i++) hit.advance();
  expect(hit.state().state.fighters[0]!.health).toBeLessThan(100);expect(hit.state().interactions!.attempts).toHaveLength(0);
  expect(hit.state().interactions!.trace.some(event => event.kind === 'grapple-start')).toBe(false);
});

test('throw release commits the attacker for seventeen frames and reset clears a pending startup', async () => {
  const f = await fixture();f.start(0);for (let i = 0; i < 6; i++) f.step();
  expect(f.state().interactions!.trace.at(-1)!.kind).toBe('grapple-throw');expect(f.state().state.fighters[0]!.stunFrames).toBe(16);
  for (let i = 0; i < 15; i++) { f.advance(i % 2 ? [] : ['jab', 'interact', 'jump', 'dash']);expect(f.state().state.fighters[0]!.moveId).toBe('');expect(f.state().motion[0]!.dash).toBe(0); }
  f.advance();expect(f.state().state.fighters[0]!.stunFrames).toBe(0);f.advance(['jab']);expect(f.state().state.fighters[0]!.moveId).toBe('jab');
  const pending = await fixture();pending.step(['interact']);pending.game.reset();expect(pending.state().interactions!.attempts).toHaveLength(0);for (let i = 0; i < 20; i++) pending.step();expect(pending.state().interactions!.grapples).toHaveLength(0);
});
