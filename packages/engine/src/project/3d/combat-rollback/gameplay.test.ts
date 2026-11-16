import { expect, test } from 'bun:test';
import { createCombatRollbackSession } from '../../../runtime/combat-rollback/session.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createGameplay3D } from '../gameplay.ts';

const input = (frame: number, peer: string) => ({
  actions: new Set(frame === 0 && peer === 'a' ? ['heavy'] : frame === 60 && peer === 'a' ? ['dash'] : frame === 76 && peer === 'a' ? ['jab', 'drive'] : []),
  direction: { x: frame === 60 && peer === 'a' ? 1 : 0, y: 0, z: frame >= 35 && peer === 'b' ? .4 : 0 },
});
const wireInput = (frame: number, peer: string) => { const sample = input(frame, peer);return { ...sample, actions: [...sample.actions] }; };

test('gameplay physics diagnostics remain detached across KO world reset, portable restore and rollback', async () => {
  const { game, runtime } = await combatMotionFixture(), read = game.readPhysicsDiagnostics;
  // The defeated save is an API fixture, not evidence of an earned combat KO.
  const defeated = game.snapshot();defeated.combat!.state.fighters[0]!.health = 0;game.restore(defeated);
  for (let frame = 0; frame < 3; frame++) { game.advance();game.drainAudio(); }
  const historical = read(), expected = structuredClone(historical), saved = game.snapshot(), retained = game.checkpoint();
  expect(historical.runtime).toEqual(runtime.physics.diagnostics);
  expect(historical.knockout?.steps).toBe(3);
  const edited = read();edited.runtime.steps = -1;edited.runtime.ccdEligiblePairs = -1;edited.knockout!.steps = -1;edited.knockout!.ccdBoundsRejects = -1;
  expect(read()).toEqual(expected);
  game.advance();game.drainAudio();expect(read().knockout?.steps).toBe(4);
  expect(historical).toEqual(expected);
  game.reset();const reset = read();
  expect(reset.knockout).toMatchObject({ steps: 0, ccdTests: 0, ccdEligiblePairs: 0, ccdBoundsRejects: 0 });
  expect(reset.knockout!.bodies).toBe(expected.knockout!.bodies - 10);
  expect(reset.runtime).toEqual(runtime.physics.diagnostics);
  game.restore(saved);const restored = read();
  expect(restored.knockout).toMatchObject({ steps: 0, bodies: expected.knockout!.bodies });
  expect(restored.runtime).toEqual(runtime.physics.diagnostics);
  game.advance();game.drainAudio();expect(read().knockout?.steps).toBe(1);
  retained.restore();expect(read()).toEqual(expected);expect(historical).toEqual(expected);
});

test('gameplay physics diagnostics omit the KO owner when combat is absent', async () => {
  const { runtime } = await combatMotionFixture();
  const game = createGameplay3D({ runtime, project: { activeSceneId: 'logic', scenes: [{ id: 'logic', entities: [] }] } });
  const report = game.readPhysicsDiagnostics();
  expect(report.knockout).toBeUndefined();expect(report.runtime).toEqual(runtime.physics.diagnostics);
  report.runtime.ccdTests = -1;report.runtime.steps = -1;
  expect(game.readPhysicsDiagnostics().runtime).toEqual(runtime.physics.diagnostics);
});

test('portable airborne and grounded saves retain contact history through natural contact changes', async () => {
  for (const airborne of [false, true]) {
    const { game, runtime } = await combatMotionFixture({ independentCombatInputs: true, movement: { separateJump: true, airJumps: 0 } });
    const advance = (jump = false) => { game.step([], [{ actions: new Set(jump ? ['jump'] : []), direction: { x: 0, y: 0, z: 0 } }, input(-1, '')]);game.drainAudio(); };
    const standing = runtime.physics.body('a')!.y;
    if (airborne) {
      advance(true);
      for (let tick = 0; tick < 150 && runtime.physics.body('a')!.velocityY >= -.1; tick++) advance();
      expect(runtime.physics.body('a')!.y).toBeGreaterThan(standing + 1);
    }
    const saved = JSON.parse(JSON.stringify(game.snapshot()));
    const continuation = () => { const result = [];for (let tick = 0; tick < 20; tick++) { advance(tick === 0 || tick === 2);result.push(game.snapshot()); }return result; };
    const expected = continuation();
    if (airborne) {
      for (let tick = 0; tick < 180; tick++) { advance();if (runtime.physics.body('a')!.y < standing + .01 && Math.abs(runtime.physics.body('a')!.velocityY) < .1) break; }
      expect(runtime.physics.body('a')!.y).toBeLessThan(standing + .01);
    } else { advance();advance(true);for (let tick = 0; tick < 12; tick++) advance();expect(runtime.physics.body('a')!.y).toBeGreaterThan(standing + 1); }
    game.restore(saved);
    expect(continuation()).toEqual(expected);
  }
});

test('invalid portable contact history rejects atomically and legacy saves clear prior contacts', async () => {
  const { game, runtime } = await combatMotionFixture();
  const saved = game.snapshot();expect(saved.gameplay!.contacts!.contacts.length).toBeGreaterThan(0);
  const before = game.checkpoint().state;
  expect(() => game.restore({ ...saved, gameplay: { ...saved.gameplay, contacts: null } })).toThrow();
  expect(game.checkpoint().state).toEqual(before);
  for (const mutate of [
    (value: typeof saved) => { value.gameplay!.contacts!.contacts[0]!.aId = 'missing'; },
    (value: typeof saved) => { value.gameplay!.contacts!.contacts[0]!.normal[0] = Infinity; },
    (value: typeof saved) => { value.gameplay!.contacts!.contacts[0]!.manifold[0]!.normalImpulse = -1; },
    (value: typeof saved) => { value.gameplay!.contacts!.contacts[0]!.warmStartedPointCount = 5; },
    (value: typeof saved) => { value.gameplay!.contacts!.contacts.push(value.gameplay!.contacts!.contacts[0]!); },
  ]) {
    const invalid = structuredClone(saved);mutate(invalid);
    expect(() => game.restore(invalid)).toThrow();expect(game.checkpoint().state).toEqual(before);
  }
  delete saved.gameplay!.contacts;const motion = saved.combat!.motion;
  game.restore(saved);expect(runtime.physics.contactCount()).toBe(0);expect(game.snapshot().combat!.motion).toEqual(motion);
});

test('gameplay rollback refuses hidden custom-script state', async () => {
  const { runtime } = await combatMotionFixture();
  const game = createGameplay3D({ runtime, project: { activeSceneId: 'logic', scenes: [{ id: 'logic', entities: [{ components: [
    { id: 'script', type: 'behavior', enabled: true, values: { module: 'custom', export: 'update' } },
  ] }] }] }, behaviors: { 'custom#update': () => undefined } });
  expect(() => game.checkpoint()).toThrow('custom script closure state');
});

test('complete gameplay peers converge through physical launch, hitstop and delayed defensive steering', async () => {
  async function client(localPeerId: string) {
    const { game, runtime } = await combatMotionFixture({ independentCombatInputs: true });
    let frame = 0;
    const session = createCombatRollbackSession({
      peerIds: ['a', 'b'], localPeerId, defaultInput: wireInput(-1, ''),
      getLocalInput: () => wireInput(frame++, localPeerId),
      participants: [{ id: 'game', checkpoint: game.checkpoint }],
      update({ inputs }) { game.step([], [inputs.a!, inputs.b!].map(sample => ({ ...sample, actions: new Set(sample.actions) })));game.drainAudio(); },
    });
    return { game, runtime, session };
  }
  const a = await client('a'), b = await client('b');
  let launched = false;
  for (let frame = 0; frame < 100; frame++) {
    a.session.tick();b.session.tick();
    if (frame >= 3) a.session.receiveInput('b', frame - 3, wireInput(frame - 3, 'b'));
    if (frame >= 7) b.session.receiveInput('a', frame - 7, wireInput(frame - 7, 'a'));
    launched ||= a.runtime.physics.body('b')!.velocityY > 5;
  }
  for (let frame = 99; frame >= 0; frame--) {
    a.session.receiveInput('b', frame, wireInput(frame, 'b'));
    b.session.receiveInput('a', frame, wireInput(frame, 'a'));
  }
  expect(launched).toBe(true);
  expect(a.game.snapshot().combat!.state.fighters[1]!.health).toBeLessThan(100);
  expect(a.game.snapshot()).toEqual(b.game.snapshot());
  expect(a.runtime.physics.checkpoint()).toEqual(b.runtime.physics.checkpoint());
  expect(a.session.stateHash(99)).toBe(b.session.stateHash(99));
});

test('gameplay checkpoint restores a physical contact freeze and repeats the same continuation', async () => {
  const { game } = await combatMotionFixture({ independentCombatInputs: true });
  game.step([], [input(0, 'a'), input(0, 'b')]);
  for (let frame = 1; frame < 60 && game.snapshot().combat!.hitstop.remaining === 0; frame++) game.step([], [input(frame, 'a'), input(frame, 'b')]);
  expect(game.snapshot().combat!.hitstop.remaining).toBeGreaterThan(0);
  game.step([], [input(20, 'a'), input(20, 'b')]);
  const saved = game.checkpoint(), snapshot = game.snapshot();
  const advance = () => { for (let frame = 21; frame < 80; frame++) game.step([], [input(frame, 'a'), input(frame, 'b')]); };
  advance();const expected = game.checkpoint().state;
  saved.restore();expect(game.snapshot()).toEqual(snapshot);
  advance();expect(game.checkpoint().state).toEqual(expected);
  game.reset();saved.restore();advance();expect(game.checkpoint().state).toEqual(expected);
});

test('an earned knockout and corpse contacts replay identically through the complete gameplay checkpoint', async () => {
  const { game, runtime } = await combatMotionFixture({ independentCombatInputs: true });
  let checkpoint = game.checkpoint();
  let samples: ReturnType<typeof input>[][] = [];
  for (let frame = 0; frame < 2400 && game.snapshot().combat!.state.fighters[1]!.health > 0; frame++) {
    if (frame % 60 === 0) { checkpoint = game.checkpoint();samples = []; }
    const a = runtime.physics.body('a')!, b = runtime.physics.body('b')!;
    const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    const commands = [input(-1, ''), input(-1, '')];
    if (length > 1.3) commands[0]!.direction = { x: dx / length, y: 0, z: dz / length };
    if (frame % 30 === 0) commands[0]!.actions.add('jab');
    samples.push(commands);game.step([], commands);
  }
  expect(game.snapshot().combat!.state.fighters[1]!.health).toBe(0);
  for (let frame = 0; frame < 80; frame++) {
    const commands = [input(-1, ''), input(-1, '')];samples.push(commands);game.step([], commands);
  }
  expect(game.snapshot().combat!.knockout).toHaveLength(1);
  const expected = game.checkpoint().state;
  checkpoint.restore();
  for (const commands of samples) game.step([], commands);
  expect(game.checkpoint().state).toEqual(expected);
});
