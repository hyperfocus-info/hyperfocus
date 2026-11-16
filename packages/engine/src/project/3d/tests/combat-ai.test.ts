import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createCombatAi3D } from '../combat-ai.ts';

function fixture() {
  const config = createTouchOfDeathPreset();
  const sim = createCombatSimulation({ config, fighters: [{ id: 'ai', position: { x: 0, y: 1, z: 0 } }, { id: 'player', position: { x: 2, y: 1, z: 0 }, facing: { x: -1, y: 0, z: 0 } }] });
  const ai = createCombatAi3D({ config });
  const playerInput: { fighterId: string; pressed: string[] } = { fighterId: 'player', pressed: [] };
  const options = { state: sim.capture(), fighterId: 'ai', targetId: 'player', difficulty: 9, playerInput, grounded: true, targetGrounded: true,
    body: { x: 0, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 }, targetBody: { x: 2, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 } };
  return { ai, options, config };
}

test('level nine cannot read an opponent command before it becomes observable startup', () => {
  const { ai, options } = fixture();
  const baseline = ai.step(options);
  for (const pressed of [['jab'], ['heavy'], ['interact']]) {
    ai.reset();options.playerInput.pressed = pressed;
    expect(ai.step(options)).toEqual(baseline);
  }
});

test('AI holds its own dive charge for visible distance and preserves delayed held inputs', () => {
  const { ai, options } = fixture();
  Object.assign(options.state.fighters[0]!, { moveId: 'drive-heavy-toward', moveFrame: 1, charging: true, chargeFrames: 0 });
  options.targetBody.x = 12;
  expect(ai.step(options).input.held).toEqual(['heavy']);
  options.targetBody.x = 2;
  expect(ai.step(options).input.held).toBeUndefined();
  options.targetBody.x = 12;options.state.fighters[0]!.chargeFrames = 30;
  expect(ai.step(options).input.held).toBeUndefined();
  ai.reset();options.difficulty = 8;options.state.fighters[0]!.chargeFrames = 0;
  ai.step(options);const saved = ai.capture();ai.restore(saved);
  expect(ai.capture()).toEqual(saved);
});

test('AI held input enters the actual startup charge gate before charging becomes observable', () => {
  const { config, options } = fixture();
  const dive = config.moves.find(move => move.id === 'drive-heavy-toward')!;
  const ai = createCombatAi3D({ config });
  const sim = createCombatSimulation({ config, fighters: options.state.fighters.map(f => ({ id: f.id, position: f.position, facing: f.facing })) });
  sim.step({ inputs: [{ fighterId: 'ai', pressed: ['heavy'], drive: true, direction: { x: 1, y: 0, z: 0 } }] });
  options.targetBody.x = 12;
  for (let frame = 0; frame < dive.startupFrames; frame++) {
    options.state = sim.capture();sim.step({ inputs: [ai.step(options).input] });
  }
  expect(sim.inspect().fighters[0]!.chargeFrames).toBeGreaterThan(0);
  expect(sim.inspect().fighters[0]!.charging).toBe(true);
});

test('AI reads the current held shaft length and only committed weapon startup', () => {
  const { ai, options, config } = fixture();
  options.targetBody.x = 4;options.state.fighters[1]!.position.x = 4;
  const weapon = { owner: 'player', projectileOwner: '', position: { x: 4, y: 1, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, length: 4, lightMoveId: 'jab', heavyMoveId: 'heavy' };
  expect(ai.step({ ...options, weapons: [weapon] }).input.guard).toBe(false);
  ai.reset();options.state.fighters[1]!.moveId = 'jab';options.state.fighters[1]!.moveFrame = config.moves.find(move => move.id === 'jab')!.startupFrames;
  expect(ai.step({ ...options, weapons: [weapon] }).input.guard).toBe(true);
  ai.reset();expect(ai.step({ ...options, weapons: [{ ...weapon, length: 1 }] }).input.guard).toBe(false);
});

test('incoming visible projectiles take priority over a route, while departing objects do not trigger guard', () => {
  const { ai, options } = fixture();
  options.targetBody.x = 8;options.state.fighters[1]!.position.x = 8;
  const weapon = { owner: '', projectileOwner: 'player', position: { x: 1, y: 1, z: 0 }, velocity: { x: -18, y: 0, z: 0 }, length: 2, lightMoveId: 'jab', heavyMoveId: 'heavy' };
  expect(ai.step({ ...options, weapons: [weapon], route: { x: 0, y: 0, z: 1 } }).input.guard).toBe(true);
  ai.reset();expect(ai.step({ ...options, weapons: [{ ...weapon, velocity: { x: 18, y: 0, z: 0 } }] }).input.guard).toBe(false);
});

test('AI cannot directly issue held-weapon commands for lethal cashout or a wall breach', () => {
  const { options, config } = fixture();
  const weapon = { ...config.moves.find(move => move.id === 'jab')!, id: 'weapon-only', command: ['weapon-only'], damage: 100, startupFrames: 1 };
  config.moves.push(weapon);
  const ai = createCombatAi3D({ config, indirectMoveIds: [weapon.id] });
  options.state.fighters[1]!.health = 10;options.state.fighters[1]!.stunKind = 'hit';options.state.fighters[1]!.stunFrames = 60;
  expect(ai.step(options).input.pressed).not.toContain('weapon-only');
  ai.reset();expect(ai.step({ ...options, breach: { direction: { x: 1, y: 0, z: 0 }, moveId: weapon.id } }).input.pressed).not.toContain('weapon-only');
});

test('level seven schedules a parry before its six-frame input delay', () => {
  const { ai, options, config } = fixture(); options.difficulty = 7;
  const startup = config.moves.find(move => move.id === 'flurry')!.startupFrames;
  const target = options.state.fighters[1]!;
  target.moveId = 'flurry';
  for (let frame = startup - 6; frame < startup; frame++) {
    target.moveFrame = frame;
    expect(ai.step(options).input.guard).toBe(false);
  }
  target.moveFrame = startup;
  expect(ai.step(options).input.guard).toBe(true);
});

test('surface tech forecast schedules one fresh input through each difficulty delay and respects lockout', () => {
  for (let difficulty = 1; difficulty <= 9; difficulty++) {
    const { ai, options } = fixture(); options.difficulty = difficulty;
    Object.assign(options.state.fighters[0]!, { stunKind: 'hit', stunFrames: 60, escapeCharges: 0 });
    options.body.y = 8; options.body.velocityY = -2;
    const presses: number[] = [];
    const delay = (9 - difficulty) * 3, contact = delay + 5;
    for (let frame = 0; frame <= contact; frame++) {
      const action = ai.step({ ...options, surfaceContactFrames: contact - frame });
      if (action.input.tech) { presses.push(frame); options.state.fighters[0]!.techLockoutFrames = 12; }
    }
    expect(presses).toEqual([contact - 3]);
    ai.reset(); options.state.fighters[0]!.techLockoutFrames = 12;
    for (let frame = 0; frame < 30; frame++) expect(ai.step({ ...options, surfaceContactFrames: 1 }).input.tech).toBe(false);
  }
});

test('an explicit absent surface forecast prevents false floor techs below an arbitrary world height', () => {
  const { ai, options } = fixture();
  Object.assign(options.state.fighters[0]!, { stunKind: 'hit', stunFrames: 40, escapeCharges: 0 });
  options.body.y = -3; options.body.velocityY = -8;
  expect(ai.step({ ...options, surfaceContactFrames: Infinity }).input.tech).toBe(false);
  expect(ai.step({ ...options, surfaceContactFrames: Infinity, collision: true }).input.tech).toBe(true);
});

test('the short surface observation cannot overcome a lower level reaction delay', () => {
  for (const difficulty of [1, 9]) {
    const { ai, options } = fixture(); options.difficulty = difficulty;
    Object.assign(options.state.fighters[0]!, { stunKind: 'hit', stunFrames: 60, escapeCharges: 0 });
    let first = Infinity;
    for (let frame = 0; frame < 30; frame++) {
      const remaining = 16 - frame;
      const forecast = remaining > 12 || remaining < 0 ? Infinity : remaining;
      if (ai.step({ ...options, surfaceContactFrames: forecast }).input.tech) { first = frame; break; }
    }
    expect(difficulty === 1 ? first > 16 : first < 16).toBe(true);
  }
});

test('queued imminent tech is not followed by a redundant escape; lost surface can still prompt escape', () => {
  for (const remaining of [6, Infinity]) {
    const { ai, options } = fixture(); options.difficulty = 7;
    Object.assign(options.state.fighters[0]!, { stunKind: 'hit', stunFrames: 40 });
    options.targetBody.x = 4;
    ai.step({ ...options, surfaceContactFrames: 7 });
    options.targetBody.x = 2;
    ai.step({ ...options, surfaceContactFrames: remaining });
    expect(ai.capture().queue.at(-1)!.input.pressed).toEqual(Number.isFinite(remaining) ? [] : ['escape']);
  }
});

test('high AI uses authored anti-air reach and baits early parries only through legal feint windows', () => {
  const { ai, options, config } = fixture();
  options.targetGrounded = false;options.targetBody.y = 3.2;options.targetBody.x = 1.6;
  const antiAir = ai.step(options);
  expect(antiAir.input.pressed).toEqual(['heavy']);expect(antiAir.input.drive).toBe(true);
  options.targetBody.y = 9;
  expect(ai.step(options).input.pressed).toEqual([]);
  options.targetGrounded = true;options.targetBody.y = 1;
  const heavy = config.moves.find(move => move.id === 'drive-heavy')!;
  const window = heavy.cancels.find(cancel => cancel.moveId === 'feint')!;
  Object.assign(options.state.fighters[0]!, { moveId: heavy.id, moveFrame: window.fromFrame });
  Object.assign(options.state.fighters[1]!, { guarding: true, guardStarted: options.state.frame });
  expect(ai.step(options).input.pressed).toEqual(['feint']);
  options.state.fighters[0]!.moveFrame = heavy.startupFrames;
  expect(ai.step(options).input.pressed).toEqual([]);
});

test('grounded lethal pressure spends a legal escape and influence varies deterministically', () => {
  const { ai, options } = fixture();
  Object.assign(options.state.fighters[0]!, { health: 20, stunKind: 'hit', stunFrames: 18 });
  expect(ai.step(options).input.pressed).toEqual(['escape']);
  options.state.fighters[0]!.escapeCharges = 0;
  const saved = ai.capture();
  const directions = Array.from({ length: 100 }, () => ai.step(options).input.direction);
  expect(new Set(directions.map(value => JSON.stringify(value))).size).toBeGreaterThan(1);
  ai.restore(saved);
  expect(Array.from({ length: 100 }, () => ai.step(options).input.direction)).toEqual(directions);
});

test('delayed defense keeps a fallback block when an attack is already too close to react', () => {
  const { ai, options, config } = fixture(); options.difficulty = 7;
  Object.assign(options.state.fighters[1]!, { moveId: 'flurry', moveFrame: config.moves.find(move => move.id === 'flurry')!.startupFrames });
  for (let frame = 0; frame < 6; frame++) expect(ai.step(options).input.guard).toBe(false);
  for (let frame = 0; frame < 4; frame++) expect(ai.step(options).input.guard).toBe(true);
});

test('grounded escape decision resolves through the same charge and hitstun rules as a player', () => {
  const { ai, options, config } = fixture();
  Object.assign(options.state.fighters[0]!, { health: 20, stunKind: 'hit', stunFrames: 18 });
  const decision = ai.step(options);
  const automated = createCombatSimulation({ config, fighters: options.state.fighters });
  automated.restore({ snapshot: options.state });
  const events = automated.step({ inputs: [decision.input], contacts: [] });
  expect(events.map(event => event.kind)).toEqual(['escape']);
  expect(automated.capture().fighters[0]).toMatchObject({ stunFrames: 0, escapeCharges: 0 });
  options.state.fighters[0]!.escapeCharges = 0;
  expect(ai.step(options).input.pressed).toEqual([]);
});

test('all AI levels obey hitstun even when queued attacks arrive after being hit', () => {
  for (let difficulty = 1; difficulty <= 9; difficulty++) {
    const { ai, options, config } = fixture();
    options.difficulty = difficulty; options.targetBody.x = 1.6;
    // Fill lower-level reaction queues with offensive intentions before impact.
    for (let tick = 0; tick < 30; tick++) ai.step(options);
    const sim = createCombatSimulation({ config, fighters: options.state.fighters });
    Object.assign(options.state.fighters[0]!, { stunKind: 'hit', stunFrames: 40, escapeCharges: 0 });
    sim.restore({ snapshot: options.state });
    for (let remaining = 40; remaining > 1; remaining--) {
      options.state = sim.capture();
      const observed = structuredClone(options.state), body = structuredClone(options.body);
      const decision = ai.step(options);
      expect(options.state).toEqual(observed); expect(options.body).toEqual(body);
      const events = sim.step({ inputs: [decision.input], contacts: [{ attackerId: 'ai', targetId: 'player' }] });
      expect(sim.capture().fighters[0]).toMatchObject({ stunKind: 'hit', stunFrames: remaining - 1, moveId: '', escapeCharges: 0 });
      expect(events).toEqual([]);
    }
  }
});

test('AI hitstun exits require the same escape charge or collision tech as manual input', () => {
  for (const mode of ['escape', 'tech'] as const) {
    const { ai, options, config } = fixture();
    options.grounded = false; options.body.y = 3;
    Object.assign(options.state.fighters[0]!, { stunKind: 'hit', stunFrames: 40, escapeCharges: mode === 'escape' ? 1 : 0 });
    const decision = ai.step({ ...options, collision: mode === 'tech' });
    const automated = createCombatSimulation({ config, fighters: options.state.fighters });
    const manual = createCombatSimulation({ config, fighters: options.state.fighters });
    automated.restore({ snapshot: options.state }); manual.restore({ snapshot: options.state });
    const collisions = mode === 'tech' ? [{ fighterId: 'ai', normal: { x: 0, y: 1, z: 0 } }] : [];
    const events = automated.step({ inputs: [decision.input], collisions, contacts: [] });
    const manualEvents = manual.step({ inputs: [{ fighterId: 'ai', pressed: mode === 'escape' ? ['escape'] : [], guard: false, tech: mode === 'tech', direction: { x: mode === 'tech' ? -1 : 0, y: 0, z: 0 }, drive: false, airborne: true }], collisions, contacts: [] });
    expect(events.map(event => event.kind)).toEqual([mode]);
    expect(events).toEqual(manualEvents);
    expect(JSON.stringify(automated.capture())).toBe(JSON.stringify(manual.capture()));
    expect(automated.capture().fighters[0]).toMatchObject({ stunFrames: 0, escapeCharges: 0 });
    if (mode === 'tech') {
      automated.restore({ snapshot: options.state });
      automated.step({ inputs: [decision.input], contacts: [] });
      expect(automated.capture().fighters[0]).toMatchObject({ stunKind: 'hit', stunFrames: 39 });
    }
  }
});
test('level nine fresh-parries observed committed strikes', () => {
  const { ai, options, config } = fixture();
  const flurry = config.moves.find(move => move.id === 'flurry')!;
  const player = options.state.fighters.find(f => f.id === 'player')!;
  player.moveId = 'flurry'; player.moveFrame = flurry.startupFrames;
  expect(ai.step(options).input.guard).toBe(true);
  player.moveFrame = flurry.startupFrames + 1;
  expect(ai.step(options).input.guard).toBe(false);
  player.moveFrame = flurry.startupFrames + flurry.strikeFrames![1]!;
  expect(ai.step(options).input.guard).toBe(true);
});
test('defender techs actual impacts and uses directional influence without free resources', () => {
  const { ai, options } = fixture();
  const fighter = options.state.fighters[0]!;
  fighter.stunKind = 'hit'; fighter.stunFrames = 40; fighter.escapeCharges = 0;
  expect(ai.step({ ...options, collision: true }).input.tech).toBe(true);
  expect(ai.step({ ...options, collision: true }).input.tech).toBe(false);
  expect(ai.step(options).direction.x).toBe(-1);
});
test('safe punish requires enough recovery, and pursuit uses paid normal chase and attack inputs', () => {
  const { ai, options, config } = fixture();
  const target = options.state.fighters[1]!;
  target.moveId = 'escape'; target.moveFrame = 21;
  expect(ai.step(options).input.pressed).toEqual(['heavy']);
  const escape = config.moves.find(move => move.id === 'escape')!;
  target.moveFrame = escape.startupFrames + escape.activeFrames + escape.recoveryFrames - 4;
  expect(ai.step(options).input.pressed).toEqual([]);
  target.moveId = ''; target.stunKind = 'hit'; target.stunFrames = 40;
  options.targetBody.y = 3;
  options.body.velocityX = 7;
  expect(ai.step(options).dash).toBe(true);
  options.grounded = false; options.body.y = 3;
  expect(ai.step(options).input.drive).toBe(true);
});
test('each lower setting adds delay before delivering an ordinary legal candidate', () => {
  for (let difficulty = 1; difficulty <= 9; difficulty++) {
    const { ai, options } = fixture(); options.difficulty = difficulty;options.targetBody.x = 1.6;
    const delay = (9 - difficulty) * 3;
    for (let tick = 0; tick < delay; tick++) expect(ai.step(options).input.pressed).toEqual([]);
    const command = ai.step(options).input.pressed?.[0];
    expect(['jab', 'heavy']).toContain(command ?? '');
  }
});

test('low-level neutral decisions vary by seed instead of a periodic forced heavy script', () => {
  const choices = new Set<string>();
  for (let seed = 1; seed <= 80; seed++) {
    const { ai, options } = fixture();options.difficulty = 2;options.targetBody.x = 1.6;
    let decision = ai.step({ ...options, seed });
    for (let tick = 0; tick < 21; tick++) decision = ai.step({ ...options, seed });
    choices.add(JSON.stringify([decision.input.pressed, decision.input.drive, decision.input.direction, decision.direction]));
  }
  expect(choices.size).toBeGreaterThan(3);
});
test('reaction queue restores deterministically and stays bounded', () => {
  const { ai, options } = fixture(); options.difficulty = 3;
  for (let i = 0; i < 30; i++) ai.step(options);
  const saved = ai.capture(), expected = Array.from({ length: 50 }, () => ai.step(options));
  expect(JSON.stringify(saved.queue).length).toBeLessThan(10000);
  expect(saved.learning!.traces.length).toBeLessThanOrEqual(64);
  ai.restore(saved);
  expect(Array.from({ length: 50 }, () => ai.step(options))).toEqual(expected);
  expect(() => ai.restore({ ...saved, queue: Array(33).fill(saved.queue[0]) })).toThrow();
  ai.reset(); expect(ai.capture().tick).toBe(0);
});

test('level nine brakes sprint momentum before entering startup and active attack reach', () => {
  for (const phase of ['startup', 'active']) {
    const { ai, options, config } = fixture();
    const moveFrame = phase === 'startup' ? 4 : config.moves.find(move => move.id === 'heavy-toward')!.startupFrames;
    options.targetBody.x = phase === 'startup' ? 5.8 : 3.1;
    options.body.velocityX = 12;
    Object.assign(options.state.fighters[1]!, { moveId: 'heavy-toward', moveFrame });
    const action = ai.step(options);
    expect(action.direction.x).toBe(-1);
    expect(action.sprint).toBe(false);expect(action.dash).toBe(false);
    expect(action.input.pressed).toEqual([]);expect(action.input.guard).toBe(false);
  }
});

test('level nine observes committed Drive startup outside four metres and waits for contact to parry', () => {
  const { ai, options, config } = fixture();
  options.targetBody.x = 6.5;
  const target = options.state.fighters[1]!;target.moveId = 'drive-heavy-toward';target.moveFrame = 0;
  const intent = ai.step(options);
  expect(intent.input.pressed).toEqual([]);expect(intent.sprint).toBe(false);expect(intent.direction.x).toBe(0);expect(intent.input.guard).toBe(false);
  target.moveFrame = config.moves.find(move => move.id === target.moveId)!.startupFrames;
  options.targetBody.x = 2;options.playerInput.pressed = [];
  expect(ai.step(options).input.guard).toBe(true);
});

test('level nine distinguishes a committed attack facing away from an approaching threat', () => {
  const { ai, options } = fixture();options.targetBody.x = 6;
  const target = options.state.fighters[1]!;target.moveId = 'heavy-toward';target.moveFrame = 5;
  target.facing = { x: 1, y: 0, z: 0 };
  const action = ai.step(options);
  expect(action.direction.x).toBeGreaterThan(0);expect(action.input.guard).toBe(false);
  expect(action.input.pressed).toEqual([]);
});

test('AI forecasts authored active travel rather than legacy constant speed', () => {
  const { ai, options, config } = fixture();
  const move = config.moves.find(move => move.id === 'heavy-toward')!;
  move.movementSpeed = 0;move.startupMovementSpeed = -6;move.activeMovementSpeed = 0;move.activeFrames = 20;
  options.targetBody.x = 12;
  Object.assign(options.state.fighters[1]!, { moveId: move.id, moveFrame: move.startupFrames, chargeFrames: 0 });
  expect(ai.step(options).direction.x).toBe(1);
  ai.reset();move.activeMovementSpeed = 60;
  expect(ai.step(options).direction.x).toBe(0);
});

test('post-KO AI stops at settled bodies and only chooses reachable airborne followups', () => {
  for (const difficulty of [5,7,9]) {
    const { ai, options } = fixture();options.difficulty = difficulty;options.state.fighters[1]!.health = 0;
    for(let i=0;i<30;i++) expect(ai.step(options).input.pressed).toEqual([]);
    ai.reset();options.targetGrounded = false;options.targetBody.y = 1.3;options.targetBody.velocityY = 2;
    const actions = Array.from({length:30},()=>ai.step(options));
    expect(actions.some(action=>action.input.pressed?.length)).toBe(difficulty>=7);
    ai.reset();options.targetBody.x = 20;
    expect(Array.from({length:30},()=>ai.step(options)).every(action=>!action.input.pressed?.length)).toBe(true);
    options.state.fighters[0]!.health=0;ai.reset();expect(ai.step(options).input.pressed).toEqual([]);
  }
});

test('level four pursues distant retreat using paid ordinary sprint and dash inputs instead of far heavy whiffs', () => {
  const {ai,options}=fixture();options.difficulty=4;options.targetBody.x=7;options.targetBody.velocityX=8;
  const actions=Array.from({length:160},()=>ai.step(options));
  expect(actions.some(action=>action.dash)).toBe(true);
  expect(actions.some(action=>action.sprint)).toBe(true);
  expect(actions.every(action=>!action.input.pressed?.length)).toBe(true);
  expect(actions.filter(action=>action.dash).every(action=>action.direction.x>0)).toBe(true);
  options.state.fighters[0]!.stamina=10;
  expect(Array.from({length:40},()=>ai.step(options)).slice(16).every(action=>!action.dash)).toBe(true);
});


test('level nine forecasts both vertical velocities and keeps manual combo heading', () => {
  const { ai, options } = fixture();
  options.grounded = options.targetGrounded = false;
  options.body.y = options.targetBody.y = 3;
  options.state.fighters[1]!.stunKind = 'hit';options.state.fighters[1]!.stunFrames = 50;
  options.body.velocityY = 36;
  expect(ai.step({ ...options, gravityY: -31.392, targetGravityY: -31.392 }).input.pressed).toEqual([]);
  options.targetBody.velocityY = 36;
  expect(ai.step({ ...options, gravityY: -31.392, targetGravityY: -31.392 }).input.drive).toBe(true);
  options.state.fighters[0]!.facing = { x: -1, y: 0, z: 0 };
  expect(ai.step(options).input.pressed).toEqual([]);
});

test('level nine chases a low wall deflection with an ordinary grounded dash and cashes out lethal health', () => {
  const { ai, options } = fixture();
  options.targetBody.x = 4;options.targetBody.y = 1.3;options.targetGrounded = false;
  options.state.fighters[1]!.stunKind = 'hit';options.state.fighters[1]!.stunFrames = 31;
  expect(ai.step(options).dash).toBe(true);
  options.targetBody.x = 2;options.targetBody.y = 1;options.state.fighters[1]!.health = 8;
  const finish = ai.step(options);
  expect(finish.input.pressed).toEqual(['jab']);expect(finish.input.drive).toBe(false);
});

test('AI selects contacted wall routes through ordinary jump and directional input', () => {
  const { ai, options } = fixture(); options.grounded = false;
  options.targetBody.x = 8;
  const wall = { normal: { x: 1, y: 0, z: 0 }, jumpCost: 14, runCost: .6 };
  expect(ai.step({ ...options, wall }).jump).toBe(true);
  options.targetBody.x = 0; options.targetBody.z = 8;
  const run = ai.step({ ...options, wall });
  expect(run.direction.x).toBeLessThan(0); expect(run.direction.z).toBeGreaterThan(.8);
  expect(run.jump).toBe(false); expect(run.dash).toBe(false);
  options.state.fighters[0]!.stamina = 0;
  expect(ai.step({ ...options, wall }).direction.z).toBeLessThanOrEqual(0);
});

test('AI navigation capture is JSON portable before, during and after a traversal', () => {
  const { config, options } = fixture();
  let enabled = false;
  const ai = createCombatAi3D({ config, navigate: () => enabled ? { plan: { surfaceId: 'roof', point: { x: 0, y: 4, z: 0 }, takeoff: { x: -2, y: 1, z: 0 }, phase: 'approach', wait: 0 }, direction: { x: -1, y: 0, z: 0 }, jump: false } : undefined });
  for (const active of [false, true, false]) {
    enabled = active;ai.step(options);
    const captured = ai.capture(), json = JSON.parse(JSON.stringify(captured));
    expect(json).toEqual(captured);expect(ai.validate(json)).toEqual(captured);
    expect(Object.hasOwn(captured, 'navigation')).toBe(active);
  }
});

test('JSON reaction queues preserve omitted optional drive inputs', () => {
  const { ai, options } = fixture(); options.difficulty = 3; options.targetBody.x = 20;
  for (let i = 0; i < 3; i++) ai.step(options);
  const saved = ai.capture();
  expect(saved.queue.some(action => !('drive' in action.input))).toBe(true);
  ai.restore(JSON.parse(JSON.stringify(saved)));
  expect(ai.capture()).toEqual(saved);
});
