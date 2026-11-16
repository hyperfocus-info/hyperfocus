import { expect, test } from 'bun:test';
import { createCombatPreset } from '../../../../combat/config.ts';
import { createCombatSimulation } from '../../../../combat/simulation.ts';
import type { CombatInput } from '../../../../combat/state.ts';
import { createCombatInteractions } from '../session.ts';
import type { CombatInteractions } from '../config.ts';

function fixture(overrides: Partial<CombatInteractions> = {}) {
  const config = createCombatPreset();config.parryFrames = 6;config.directionalInfluence = .55;
  const simulation = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 1, y: 1, z: 0 }, facing: { x: -1, y: 0, z: 0 } }] });
  const session = createCombatInteractions({ config, fighterIds: ['a', 'b'], positions: new Map(), definition: { weapons: [], grappleStartupFrames: 8, grappleTechFrames: config.parryFrames, grappleDamage: 5.2, grappleSpeed: 8.4, grappleHitstunFrames: 82, ...overrides } });
  const tick = (inputs: CombatInput[] = []) => {
    const state = simulation.capture(), events = session.before(state, inputs);
    simulation.restore({ snapshot: state });simulation.step({ inputs });return events;
  };
  const start = (id = 'a') => { tick([{ fighterId: id, pressed: ['interact'] }]);for (let i = 0; i < (overrides.grappleStartupFrames ?? 8); i++) tick(); };
  return { config, simulation, session, tick, start };
}

test('grab startup leaves the defender free and commits attacker before rechecking range', () => {
  const f = fixture();f.tick([{ fighterId: 'a', pressed: ['interact'] }]);
  expect(f.session.capture().grapples).toHaveLength(0);expect(f.simulation.capture().fighters[1]!.stunFrames).toBe(0);
  for (let i = 0; i < 7; i++) {
    f.tick([{ fighterId: 'a', pressed: ['jab'], guard: true, tech: true }]);
    const actor = f.simulation.capture().fighters[0]!;expect(actor.moveId).toBe('');expect(actor.techWindowFrames).toBe(0);
  }
  const moved = f.simulation.capture();moved.fighters[1]!.position.x = 10;f.simulation.restore({ snapshot: moved });f.tick();
  expect(f.session.capture().grapples).toHaveLength(0);expect(f.session.capture().attempts).toHaveLength(0);
  expect(f.session.capture().trace.some(row => row.kind === 'grapple-whiff')).toBe(true);
});

test('a real hit interrupts startup without erasing its hitstun', () => {
  const f = fixture();f.tick([{ fighterId: 'a', pressed: ['interact'] }]);
  const state = f.simulation.capture();Object.assign(state.fighters[0]!, { stunKind: 'hit', stunFrames: 20 });f.simulation.restore({ snapshot: state });f.tick();
  expect(f.session.capture().attempts).toHaveLength(0);expect(f.simulation.capture().fighters[0]!.stunFrames).toBe(19);
});

test('all six advertised tech frames accept jump/dash semantic tech or grab, equally from either seat', () => {
  for (const attacker of ['a', 'b']) for (const useTech of [false, true]) for (let delay = 0; delay < 5; delay++) {
    const f = fixture(), defender = attacker === 'a' ? 'b' : 'a';f.start(attacker);
    expect(f.session.techWindow(defender)?.total).toBe(f.config.parryFrames);
    for (let i = 0; i < delay; i++) f.tick();
    const events = f.tick([{ fighterId: defender, ...(useTech ? { tech: true } : { pressed: ['interact'] }) }]);
    expect(events[0]?.kind).toBe('tech');expect(f.session.capture().grapples).toHaveLength(0);
    expect(f.simulation.capture().fighters.every(fighter => fighter.health === 100)).toBe(true);
  }
});

test('contact counts as tech frame one and release at frame six cannot be teched late', () => {
  for (const immediate of [false, true]) {
    const f = fixture();f.tick([{ fighterId: 'a', pressed: ['interact'] }]);for (let i = 0; i < 7; i++) f.tick();
    const contact = f.tick(immediate ? [{ fighterId: 'b', tech: true }] : []);
    if (immediate) { expect(contact[0]?.kind).toBe('tech');continue; }
    for (let i = 0; i < 5; i++) f.tick();
    expect(f.session.techWindow('b')).toBeUndefined();expect(f.tick([{ fighterId: 'b', tech: true }])[0]?.kind).toBe('hit');
  }
});

test('neutral throw goes slightly up, analog releases preserve direction/strength and defender DI changes trajectory', () => {
  const release = (x: number, z = 0, influenceX = 0) => {
    const f = fixture();f.start();let events: ReturnType<typeof f.tick> = [];
    for (let i = 0; i < 6; i++) events = f.tick([{ fighterId: 'a', direction: { x, y: 0, z } }, { fighterId: 'b', influenceDirection: { x: influenceX, y: 0, z: 0 } }]);
    expect(events[0]?.damage).toBe(5.2);expect(f.simulation.capture().fighters[1]!.stunFrames).toBe(81);
    return events[0]!.impulse;
  };
  expect(release(.1)).toEqual({ x: 0, y: 4, z: 0 });expect(release(1).x).toBeCloseTo(8.4);
  expect(release(.5).x).toBeCloseTo(4.2);expect(release(-1).x).toBeCloseTo(-8.4);expect(release(0, 1).z).toBeCloseTo(8.4);
  expect(release(0, 0, 1).x).toBeGreaterThan(0);expect(release(0, 0, .2).x).toBeLessThan(release(0, 0, 1).x);
});

test('startup and analog direction restore exactly and malformed attempts are rejected', () => {
  const f = fixture();f.tick([{ fighterId: 'a', pressed: ['interact'] }]);for (let i = 0; i < 4; i++) f.tick();
  const combat = f.simulation.capture(), saved = f.session.validate(f.session.capture());
  for (let i = 0; i < 4; i++) f.tick([{ fighterId: 'a', direction: { x: -.6, y: 0, z: 0 } }]);const expected = f.session.capture();
  f.simulation.restore({ snapshot: combat });f.session.restore(saved);for (let i = 0; i < 4; i++) f.tick([{ fighterId: 'a', direction: { x: -.6, y: 0, z: 0 } }]);
  expect(f.session.capture()).toEqual(expected);
  saved.attempts![0]!.remaining = 9;expect(() => f.session.validate(saved)).toThrow();
});

test('authored grab commitment and vertical scaling reach the real release and whiff paths', () => {
  const tuning = { grappleStartupFrames: 9, grappleRecoveryFrames: 19, grappleWhiffFrames: 20, grappleDamage: 6.5, grappleSpeed: 7.56, grappleVerticalSpeedScale: .9, grappleHitstunFrames: 69 };
  for (const x of [0, 1]) {
    const f = fixture(tuning);f.start();let events: ReturnType<typeof f.tick> = [];
    for (let i = 0; i < 6; i++) events = f.tick([{ fighterId: 'a', direction: { x, y: 0, z: 0 } }]);
    expect(events[0]).toMatchObject({ kind: 'hit', damage: 6.5, impulse: { x: x * 7.56, y: x ? 1.8 : 3.6, z: 0 } });
    expect(f.simulation.capture().fighters[1]!.health).toBe(93.5);
    expect(f.simulation.capture().fighters[1]!.stunFrames).toBe(68);
    expect(f.simulation.capture().fighters[0]!.stunFrames).toBe(18);
    for (let i = 0; i < 17; i++) { f.tick([{ fighterId: 'a', pressed: ['jab'] }]);expect(f.simulation.capture().fighters[0]!.moveId).toBe(''); }
    f.tick();expect(f.simulation.capture().fighters[0]!.stunFrames).toBe(0);
    f.tick([{ fighterId: 'a', pressed: ['jab'] }]);expect(f.simulation.capture().fighters[0]!.moveId).toBe('jab');
  }
  const missed = fixture(tuning);missed.tick([{ fighterId: 'a', pressed: ['interact'] }]);
  const state = missed.simulation.capture();state.fighters[1]!.position.x = 10;missed.simulation.restore({ snapshot: state });for (let i = 0; i < 9; i++) missed.tick();
  expect(missed.session.capture().trace.some(event => event.kind === 'grapple-whiff')).toBe(true);
  expect(missed.simulation.capture().fighters[0]!.stunFrames).toBe(19);
});
