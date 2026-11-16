import { separation } from "../../../test-support/camera.ts";
import { expect, test } from 'bun:test';
import { createFighter, type CombatSnapshot } from '../../../combat/state.ts';
import { createCombatMatch3D } from './index.ts';
import { readGameplayPresentation3D } from '../gameplay-contracts.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { presentCombatCamera3D } from '../combat-visuals/camera.ts';
import { presentCombatVisuals3D } from '../combat-visuals.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createAppearancePosePresenter3D } from '../appearance/pose.ts';
import type { ResolvedAppearancePose3D } from '../appearance/catalog.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';

function fixture() {
  const match = createCombatMatch3D();
  const state: CombatSnapshot = { version: 1, configKey: '', frame: 0, fighters: [createFighter({ id: 'a', position: { x: -2, y: 1, z: 0 } }, 100), createFighter({ id: 'b', position: { x: 2, y: 1, z: 0 } }, 100)] };
  for (const fighter of state.fighters) fighter.stamina = 100;
  const step = (...actions: string[]) => match.step({ actions: new Set(actions), state, playerId: 'a', opponentId: 'b' });
  const ticks = (count: number) => { for (let index = 0; index < count; index++) step(); };
  const start = () => { step('match:start'); step(); step('pause'); ticks(180); };
  return { match, state, step, ticks, start };
}

test('host queue seeds vary fresh sessions while restored queues remain deterministic', () => {
  const first = createCombatMatch3D({ queueSeed: 1 }), second = createCombatMatch3D({ queueSeed: 2 });
  expect(first.capture().queueSeed).not.toBe(second.capture().queueSeed);
  second.restore(first.capture());expect(second.capture()).toEqual(first.capture());
  const legacy = first.capture();delete legacy.queueSeed;expect(() => second.restore(legacy)).not.toThrow();
  const { step, match } = fixture();step('match:practice');expect(Object.values(match.capture()).some(value => value === undefined)).toBe(false);
  expect(() => createCombatMatch3D({ queueSeed: -1 })).toThrow('seed');
});

test('menu distinguishes the selected AI fight from the random ladder', () => {
  const { match, step } = fixture();
  for (let i = 0; i < 4; i++) { step('match:easier');step(); }
  const menu = match.presentation({ title: 'Fight' });
  expect(menu.actions?.[0]?.action).toBe('match:start');
  expect(menu.overlay?.body).toContain('Start match uses this level');
  expect(menu.actions?.find(action => action.action === 'match:quick')?.label).toBe('Random AI · levels 3–9');
  expect(menu.actions?.find(action => action.action === 'match:difficulty')?.range).toEqual({ min: 1, max: 9, value: 1 });
  step('match:start');expect(match.difficulty).toBe(1);expect(match.capture().quick).toBe(false);
});

test('first fight starts level one in one action without changing ordinary restored difficulty', () => {
  const { match, step } = fixture();
  step('match:harder');step();const selected = match.capture();
  expect(match.difficulty).toBe(6);
  expect(match.presentation({ title: '' }).actions?.find(action => action.action === 'match:first')?.label).toContain('level 1');
  step('match:first');expect(match.phase).toBe('intro');expect(match.difficulty).toBe(1);
  expect(() => match.validate(match.capture())).not.toThrow();
  match.restore(selected);step('match:start');expect(match.difficulty).toBe(6);
});

test('quickmatch samples the requested ladder, preserves saves and rerolls only next opponent', () => {
  const { match, step } = fixture();let nines = 0;const seen = new Set<number>();
  for (let index = 0; index < 2000; index++) {
    step('match:quick');const saved = match.capture();seen.add(saved.difficulty);if (saved.difficulty === 9) nines++;
    expect(saved.difficulty).toBeGreaterThanOrEqual(3);expect(saved.difficulty).toBeLessThanOrEqual(9);
    match.restore({ ...saved, phase: 'match-result', ticks: 0, playerWins: 3, winner: 'player', held: [] });
    const result = match.capture();step('match:next');const replay = match.capture();
    match.restore(result);step('match:next');expect(match.capture()).toEqual(replay);
    expect(replay.queueSeed).not.toBe(saved.queueSeed);
    step('match:quit');step();
  }
  expect([...seen].sort()).toEqual([3, 4, 5, 6, 7, 8, 9]);expect(nines).toBeGreaterThan(65);expect(nines).toBeLessThan(135);
  step('match:start');expect(match.capture().quick).toBe(false);
});

test('practice is available from menu/results, stays live after defeat and leaves Start to pause', () => {
  const { match, state, step, ticks } = fixture();
  expect(match.presentation({ title: '' }).actions?.some(action => action.action === 'match:practice')).toBe(true);
  expect(step('match:practice').resetRound).toBe(true);
  expect(match.phase).toBe('practice'); expect(match.handlesStart).toBe(false);
  expect(step('pause').consumedStart).toBe(false);
  state.fighters[0]!.health = 0; ticks(250);
  expect(match.phase).toBe('practice'); expect(match.capture().playerWins).toBe(0);
  expect(step('practice:reset').resetRound).toBe(true);
  expect(step('practice:reset').resetRound).toBe(false);
  step('match:menu'); expect(match.phase).toBe('menu');
  match.restore({ ...match.capture(), phase: 'match-result', playerWins: 3, winner: 'player', held: [] });
  expect(match.presentation({ title: '' }).actions?.some(action => action.action === 'match:practice')).toBe(true);
  step('match:practice');
  expect(match.capture()).toMatchObject({ phase: 'practice', playerWins: 0, opponentWins: 0, winner: '' });
  expect(() => match.validate(match.capture())).not.toThrow();
});

function cameraFrame(state: CombatSnapshot, aspect = 1.7777777777777777): Hyperfocus3DEvaluatedFrame {
  const frame: Hyperfocus3DEvaluatedFrame = {
    sceneId: 'arena', frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0,
    camera: { position: [0, 5, 10], target: [0, 1, 0], up: [0, 1, 0], fovYRadians: .85, near: .1, far: 100 },
    entities: [...state.fighters.map((fighter): Hyperfocus3DEvaluatedFrame['entities'][number] => ({ id: fighter.id, position: [fighter.position.x, fighter.position.y, fighter.position.z], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true })),
      { id: 'tod:arena', position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true }],
    materials: [], performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [],
    renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 }, localProgress: 0,
  };
  presentCombatCamera3D({ frame, state, viewportAspect: aspect }); return frame;
}

function posedFrame(state: CombatSnapshot) {
  const frame = cameraFrame(state);
  for (const fighter of state.fighters) for (const part of ['head', 'hair', 'face', 'left-hand', 'right-hand', 'left-arm', 'right-arm', 'left-forearm', 'right-forearm', 'left-boot', 'right-boot']) frame.entities.push({ id: `${fighter.id}:${part}`, position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true });
  presentCombatVisuals3D({ frame, state, config: createTouchOfDeathPreset(), grounded: new Set(state.fighters.map(fighter => fighter.id)) });
  return frame;
}

test('selected intro poses are per actor, preview matches default, and countdown settles without simulation edits', () => {
  const { match, state, step, ticks } = fixture();step('match:start');ticks(60);
  const poses: ResolvedAppearancePose3D[] = [{ actorId: 'a', phase: 'intro', style: 'bow' }, { actorId: 'b', phase: 'intro', style: 'fists-up' }];
  const before = structuredClone(state), memory = match.capture(), frame = posedFrame(state);
  match.presentFrame({ frame, state, poses });const once = structuredClone(frame);match.presentFrame({ frame, state, poses });expect(frame).toEqual(once);
  const original = posedFrame(state);expect(frame.entities.find(e => e.id === 'a:head')!.position).not.toEqual(original.entities.find(e => e.id === 'a:head')!.position);
  expect(frame.entities.find(e => e.id === 'b:right-hand')!.position[1]).toBeGreaterThan(original.entities.find(e => e.id === 'b:right-hand')!.position[1]);
  expect(state).toEqual(before);expect(match.capture()).toEqual(memory);
  const defaultFrame = posedFrame(state), preview = posedFrame(state);match.presentFrame({ frame: defaultFrame, state });
  const present = createAppearancePosePresenter3D();
  for (const [index, fighter] of state.fighters.entries()) present({ frame: preview, actorId: fighter.id, style: 'default', phase: 'intro', fighterIndex: index === 0 ? 0 : 1, progress: .25, settle: 1 });
  for (const entity of preview.entities) {
    const expected = defaultFrame.entities.find(e => e.id === entity.id)!;
    entity.position.forEach((v, index) => expect(v).toBeCloseTo(expected.position[index]!, 12));
    entity.rotation.forEach((v, index) => expect(v).toBeCloseTo(expected.rotation[index]!, 12));
  }
  step('pause');ticks(180);const fighting = posedFrame(state), untouched = structuredClone(fighting);match.presentFrame({ frame: fighting, state, poses });expect(fighting).toEqual(untouched);
});

test('victory cosmetics pose only the terminal winner and never the live round result or loser', () => {
  const { match, state } = fixture();
  const poses: ResolvedAppearancePose3D[] = ['a', 'b'].map(actorId => ({ actorId, phase: 'victory', style: 'salute' }));
  for (const phase of ['fighting', 'practice', 'round-result'] as const) {
    match.restore({ ...match.capture(), phase, ticks: phase === 'round-result' ? 90 : 0, winner: phase === 'round-result' ? 'player' : '' });
    const frame = posedFrame(state), before = structuredClone(frame);match.presentFrame({ frame, state, poses });expect(frame).toEqual(before);
  }
  match.restore({ ...match.capture(), phase: 'match-result', ticks: 0, playerWins: 3, winner: 'player' });
  const frame = posedFrame(state), before = structuredClone(frame);match.presentFrame({ frame, state, poses, playerId: 'b', opponentId: 'a' });
  expect(frame.entities.filter(e => e.id === 'a' || e.id.startsWith('a:'))).toEqual(before.entities.filter(e => e.id === 'a' || e.id.startsWith('a:')));
  expect(frame.entities.find(e => e.id === 'b:right-hand')!.position).not.toEqual(before.entities.find(e => e.id === 'b:right-hand')!.position);
  const once = structuredClone(frame);match.presentFrame({ frame, state, poses, playerId: 'b', opponentId: 'a' });expect(frame).toEqual(once);
});

test('presentation selections preserve actual jab contacts and complete gameplay checkpoints', async () => {
  const control = await combatMotionFixture(), styled = await combatMotionFixture();
  const poses: ResolvedAppearancePose3D[] = [{ actorId: 'a', phase: 'intro', style: 'salute' }, { actorId: 'a', phase: 'victory', style: 'fists-up' }];
  const health = control.game.snapshot().combat!.state.fighters[1]!.health;
  for (let tick = 0; tick < 45; tick++) {
    const actions = tick === 0 ? ['a:jab'] : [];control.game.step(actions);styled.game.step(actions);
    const before = styled.game.checkpoint().state, frame = posedFrame(styled.game.snapshot().combat!.state);
    styled.game.presentFrame(frame, { poses });expect(styled.game.checkpoint().state).toEqual(before);
  }
  expect(styled.game.snapshot().combat!.state.fighters[1]!.health).toBeLessThan(health);
  expect(styled.game.checkpoint().state).toEqual(control.game.checkpoint().state);
});

test('reused victory frames reset when choices clear or the match returns to countdown', () => {
  for (const transition of ['missing', 'default', 'countdown'] as const) {
    const { match, state } = fixture();
    match.restore({ ...match.capture(), phase: 'match-result', ticks: 0, playerWins: 3, winner: 'player' });
    const frame = posedFrame(state), original = structuredClone(frame);
    match.presentFrame({ frame, state, poses: [{ actorId: 'a', phase: 'victory', style: 'bow' }] });
    expect(frame.entities).not.toEqual(original.entities);
    if (transition === 'countdown') {
      match.restore({ ...match.capture(), phase: 'countdown', ticks: 180, playerWins: 0, winner: '', introExit: 0 });
      const fresh = structuredClone(original);match.presentFrame({ frame: fresh, state });
      match.presentFrame({ frame, state });expect(frame).toEqual(fresh);
    } else {
      match.presentFrame({ frame, state, ...(transition === 'default' ? { poses: [{ actorId: 'a', phase: 'victory' as const, style: 'default' as const }] } : {}) });
      expect(frame).toEqual(original);
    }
  }
});

test('distinct connected intro gestures blend into ready without skip pops or cumulative offsets', () => {
  const { match, state, step, ticks } = fixture();
  step('match:start'); ticks(75);
  const frame = posedFrame(state), original = structuredClone(frame);
  match.presentFrame({ frame, state }); const once = structuredClone(frame);
  match.presentFrame({ frame, state }); expect(frame).toEqual(once);
  const find = (id: string) => frame.entities.find(entity => entity.id === id)!;
  expect(find('a:right-hand').position[1]).toBeGreaterThan(find('b:right-hand').position[1] + .25);
  expect(find('a').rotation).not.toEqual(original.entities.find(entity => entity.id === 'a')!.rotation);
  expect(find('a:head').rotation).not.toEqual(original.entities.find(entity => entity.id === 'a:head')!.rotation);
  expect(find('a:left-boot')).toEqual(original.entities.find(entity => entity.id === 'a:left-boot')!);
  for (const fighter of state.fighters) for (const side of ['left', 'right']) {
    const arm = find(`${fighter.id}:${side}-arm`), forearm = find(`${fighter.id}:${side}-forearm`), hand = find(`${fighter.id}:${side}-hand`);
    const ends = (limb: typeof arm, width: number) => {
      const [x, y, z, w] = limb.rotation, half = limb.scale[1] - width * .175;
      const axis = [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
      return [-1, 1].map(sign => limb.position.map((value, i) => value + sign * axis[i]! * half));
    };
    const elbowA = ends(arm, .2)[1]!, elbowB = ends(forearm, .18)[0]!, wrist = ends(forearm, .18)[1]!;
    expect(Math.hypot(...elbowA.map((value, i) => value - elbowB[i]!))).toBeLessThan(.000001);
    expect(Math.hypot(...wrist.map((value, i) => value - hand.position[i]!))).toBeLessThan(.000001);
  }
  step('pause');
  const skipped = posedFrame(state); match.presentFrame({ frame: skipped, state }); expect(skipped.entities).toEqual(frame.entities);
  ticks(179);
  const last = posedFrame(state); match.presentFrame({ frame: last, state }); step();
  const live = posedFrame(state); match.presentFrame({ frame: live, state });
  for (const entity of last.entities) {
    const next = live.entities.find(item => item.id === entity.id)!;
    expect(Math.hypot(...entity.position.map((value, i) => value - next.position[i]!))).toBeLessThan(.0001);
  }
});

test('intro, moving countdown and live camera share continuous boundaries and stable repeated sampling', () => {
  const { match, state, step, ticks } = fixture();
  const shot = () => { const frame = cameraFrame(state); match.presentFrame({ frame, state }); return frame.camera; };

  step('match:start'); ticks(239);
  const lastIntro = shot(); step();
  const three = shot(); expect(separation(lastIntro.position, three.position)).toBeLessThan(.001);
  ticks(60); const two = shot(); ticks(60); const one = shot();
  expect(separation(three.position, two.position)).toBeGreaterThan(.2);
  expect(separation(two.position, one.position)).toBeGreaterThan(.2);
  ticks(59); const lastCount = shot(); step();
  const live = shot(); expect(separation(lastCount.position, live.position)).toBeLessThan(.001);
  expect(live).toEqual(cameraFrame(state).camera);
  match.reset(); step(); step('match:start'); ticks(80);
  const frame = cameraFrame(state); match.presentFrame({ frame, state }); const once = structuredClone(frame);
  match.presentFrame({ frame, state }); expect(frame).toEqual(once);
  expect(shot()).toEqual(frame.camera);
});

test('skipping midway continues from the exact intro pose and survives snapshot restore', () => {
  const { match, state, step, ticks } = fixture();
  step('match:start'); ticks(75);
  const before = cameraFrame(state); match.presentFrame({ frame: before, state });
  step('pause');
  const after = cameraFrame(state); match.presentFrame({ frame: after, state });
  expect(after.camera).toEqual(before.camera);
  const restored = createCombatMatch3D(); restored.restore(match.capture());
  const recalled = cameraFrame(state); restored.presentFrame({ frame: recalled, state });
  expect(recalled.camera).toEqual(after.camera);
  const legacy = match.capture(); delete legacy.introExit; restored.restore(legacy);
  expect(restored.capture().introExit).toBe(1);
  expect(() => restored.restore({ ...legacy, introExit: Number.NaN })).toThrow();
});

test('cinematic orbit retains full fighters and overhead space on narrow and wide viewports', () => {
  const { match, state } = fixture();
  state.fighters[0]!.position = { x: -5, y: 1, z: -3 };
  state.fighters[1]!.position = { x: 5, y: 4, z: 3 };
  for (const aspect of [0.46208530805687204, 1.7777777777777777]) for (const phase of ['intro', 'countdown'] as const) for (const ticks of [1, 60, 120, 180]) {
    match.restore({ ...match.capture(), phase, ticks, introExit: 1 });
    const frame = cameraFrame(state, aspect); match.presentFrame({ frame, state });
    const camera = frame.camera, f = camera.target.map((value, index) => value - camera.position[index]!);
    const length = Math.hypot(...f); for (let i = 0; i < 3; i++) f[i] = f[i]! / length;
    const right = [-f[2]!, 0, f[0]!], horizontal = Math.hypot(...right);
    for (let i = 0; i < 3; i++) right[i] = right[i]! / horizontal;
    const up = [-right[2]! * f[1]!, right[2]! * f[0]! - right[0]! * f[2]!, right[0]! * f[1]!];
    for (const fighter of state.fighters) for (const side of [-1, 1]) for (const height of [-1, 1.8]) {
      const p = [fighter.position.x + side - camera.position[0], fighter.position.y + height - camera.position[1], fighter.position.z - camera.position[2]];
      const dot = (axis: number[]) => p.reduce((sum, value, index) => sum + value * axis[index]!, 0);
      const denominator = dot(f) * Math.tan(camera.fovYRadians / 2);
      expect(Math.abs(dot(right) / denominator / aspect)).toBeLessThan(1);
      expect(Math.abs(dot(up) / denominator)).toBeLessThan(1);
    }
  }
});

test('explicit pause-menu quit ends an active match without changing difficulty', () => {
  const { match, step, start } = fixture();step('match:harder');step();start();
  expect(match.phase).toBe('fighting');
  expect(step('match:quit').resetRound).toBe(true);
  expect(match.phase).toBe('menu');expect(match.difficulty).toBe(6);
  expect(match.capture().playerWins).toBe(0);expect(match.capture().opponentWins).toBe(0);
});

test('menu has bounded difficulty, Start is edge-triggered and countdown lasts three seconds', () => {
  const { match, step, ticks } = fixture();
  expect(match.difficulty).toBe(5);
  for (let index = 0; index < 12; index++) { step('match:harder'); step(); }
  expect(match.difficulty).toBe(9);
  for (let index = 0; index < 12; index++) { step('match:easier'); step(); }
  expect(match.difficulty).toBe(1);
  expect(step('pause')).toEqual({ resetRound: true, recoverRound: false, fighting: false, consumedStart: true });
  step('pause'); expect(match.phase).toBe('intro');
  step(); step('pause'); expect(match.phase).toBe('countdown');
  ticks(179); expect(match.phase).toBe('countdown');
  expect(step().fighting).toBe(true); expect(match.handlesStart).toBe(false);
});

test('intro automatically completes after four seconds', () => {
  const { match, step, ticks } = fixture();
  step('match:start'); ticks(239); expect(match.phase).toBe('intro');
  step(); expect(match.phase).toBe('countdown');
});

test('KO keeps 210 live post-impact ticks then 180 recovery ticks, locks winner and shows only final match result', () => {
  const { match, state, step, ticks, start } = fixture();start();
  for (let round = 0; round < 3; round++) {
    state.fighters[1]!.health = 0;
    expect(step().fighting).toBe(true);
    expect(match.handlesStart).toBe(false);
    expect(match.presentation({ title: 'Fight' }).overlay).toBeUndefined();
    const saved = match.capture();match.restore(saved);
    expect(match.capture().ticks).toBe(390);
    expect(match.postKnockout).toBe(true);ticks(209);expect(match.postKnockout).toBe(true);
    step();expect(match.postKnockout).toBe(false);
    ticks(179);expect(match.phase).toBe('round-result');
    state.fighters[0]!.health = 0;
    const result = step();
    expect(match.capture().playerWins).toBe(round + 1);
    expect(match.capture().opponentWins).toBe(0);
    expect(result.fighting).toBe(round < 2);
    if (round < 2) {
      expect(match.phase).toBe('fighting');expect(result.resetRound).toBe(false);expect(result.recoverRound).toBe(true);
      state.fighters.forEach(fighter => { fighter.health = 100; });
    } else {
      expect(match.phase).toBe('match-result');expect(result.resetRound).toBe(false);
      expect(match.presentation({ title: 'Fight' }).overlay?.title).toBe('You win');
    }
  }
});

test('best of five ends at three wins, double knockout adds no score, replay and menu reset', () => {
  const { match, state, step, ticks, start } = fixture();
  start();
  state.fighters[0]!.health = 0; state.fighters[1]!.health = 0;
  step(); ticks(389); expect(step().recoverRound).toBe(true);
  expect(match.capture().playerWins).toBe(0); expect(match.capture().opponentWins).toBe(0);
  state.fighters[0]!.health = 100; state.fighters[1]!.health = 100; ticks(180);
  for (const loser of [1, 0, 1, 0, 1]) {
    state.fighters[loser]!.health = 0;
    step(); ticks(390);
    if (match.phase !== 'match-result') { state.fighters[loser]!.health = 100; ticks(180); }
  }
  expect(match.phase).toBe('match-result');
  expect(match.capture().playerWins).toBe(3); expect(match.capture().opponentWins).toBe(2);
  expect(match.presentation({ title: 'Fight' }).overlay?.title).toBe('You win');
  const completed = match.capture();
  expect(step('match:replay').resetRound).toBe(true); expect(match.phase).toBe('intro');
  expect(match.capture().playerWins).toBe(0);
  match.restore(completed); step('match:menu'); expect(match.phase).toBe('menu');
  expect(match.capture().opponentWins).toBe(0);
});

test('snapshot restore preserves edges and validates timer, score and portable presentation', () => {
  const { match, step, ticks } = fixture();
  step('pause'); ticks(60); step('pause');
  const saved = match.capture(); const restored = createCombatMatch3D(); restored.restore(saved);
  expect(restored.capture()).toEqual(saved);
  expect(() => restored.restore({ ...saved, difficulty: 10 })).toThrow();
  expect(() => restored.restore({ ...saved, ticks: 181 })).toThrow();
  expect(() => restored.restore({ ...saved, phase: 'match-result' })).toThrow();
  expect(() => restored.restore({ ...saved, held: ['pause', 'pause'] })).toThrow();
  saved.held.push('match:start'); expect(restored.capture().held).toEqual(['pause']);
  expect(() => readGameplayPresentation3D(match.presentation({ title: 'Fight' }))).not.toThrow();
  match.reset(); expect(match.phase).toBe('menu');
});


test('rematch retains quick opponent and RNG; next opponent advances once and loss opens defense', () => {
  const { match, step } = fixture();step('match:quick');
  const result = { ...match.capture(), phase: 'match-result' as const, ticks: 0, playerWins: 0, opponentWins: 3, winner: 'opponent' as const, held: [] };
  match.restore(result);
  const presented = match.presentation({ title: 'Fight' });
  expect(presented.overlay?.body).toContain(`Level ${result.difficulty} / 9`);
  expect(presented.actions?.map(item => item.action)).toContain('match:learn-defense');
  step('match:replay');expect(match.capture()).toMatchObject({ difficulty: result.difficulty, queueSeed: result.queueSeed, quick: true, phase: 'intro' });
  match.restore(result);step('match:next');expect(match.capture().queueSeed).not.toBe(result.queueSeed);
  const next = match.capture();step('match:next');expect(match.capture().queueSeed).toBe(next.queueSeed);
  match.restore(result);step('match:learn-defense');expect(match.phase).toBe('practice');
});


test('only the pending match-winning knockout suppresses between-round recovery', () => {
  const { match, state, step, start } = fixture();start();
  state.fighters[1]!.health = 0;step();expect(match.terminalRound).toBe(false);
  match.restore({ ...match.capture(), playerWins: 2 });expect(match.terminalRound).toBe(true);
  match.restore({ ...match.capture(), winner: 'draw' });expect(match.terminalRound).toBe(false);
});
