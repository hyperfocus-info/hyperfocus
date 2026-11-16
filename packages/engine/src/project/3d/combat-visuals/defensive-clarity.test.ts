import { expect, test } from 'bun:test';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { materialPreset3D } from '../../../render/materials/3d-presets.ts';
import { presentCombatVisuals3D } from '../combat-visuals.ts';
import { presentGuardFractures3D } from './guard-fractures.ts';
import { presentCombatObstructions3D } from './obstructions.ts';
import { presentCombatTimingRings } from './timing-rings.ts';
import { presentCombatLocomotion3D } from './locomotion-effects.ts';
import { presentCombatCamera3D } from './camera.ts';
import type { WeaponState } from '../combat-interaction/weapons/utility.ts';

function fixture() {
  const config = createTouchOfDeathPreset(), state = createCombatSimulation({ config, fighters: [{ id: 'a', position: { x: 0, y: 1, z: 0 } }] }).capture();
  const ids = ['a', 'a:left-hand', 'a:right-hand', ...Array.from({ length: 24 }, (_, i) => `a:shield:${i}`), ...Array.from({ length: 24 }, (_, i) => `a:parry:${i}`), 'wall', 'other', ...Array.from({ length: 12 }, (_, i) => `wall:occlusion-edge:${i}`)];
  const frame: Hyperfocus3DEvaluatedFrame = {
    sceneId: 'arena', frameIndex: 0, timeSeconds: 0, tick: 0, deterministicSeed: 0,
    camera: { position: [0, 1, 10], target: [0, 1, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 },
    entities: ids.map(id => ({ id, position: [0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], visible: true })),
    materials: ['wall:occlusion', 'shared', 'a:timing'].map(id => ({ id, look: structuredClone(materialPreset3D('aged-iron').look) })), performances: [], poseCorrections: [], ikCorrections: [], socketAttachments: [], contacts: [], physicalBodies: [], physicalBreaks: [], audioEvents: [], effects: [], lights: [], renderGraph: { tier: 'gameplay', shadows: false, exposure: 1 }, localProgress: 0,
  };
  return { config, state, frame };
}

test('held guard cannot display an active shield during parry or grab release recovery', () => {
  const options = fixture(), fighter = options.state.fighters[0]!;
  fighter.guarding = true;fighter.stunKind = 'parry';fighter.stunFrames = 17;
  presentCombatVisuals3D(options);presentGuardFractures3D(options);
  expect(options.frame.entities.filter(entity => entity.id.startsWith('a:shield:')).every(entity => !entity.visible)).toBe(true);
  fighter.stunFrames = 0;fighter.stunKind = '';
  presentCombatVisuals3D(options);presentGuardFractures3D(options);
  expect(options.frame.entities.some(entity => entity.id.startsWith('a:shield:') && entity.visible)).toBe(true);
});

test('city prop rendering skips distant offscreen objects while retaining edge margins and broken state', () => {
  const options = fixture(), template = options.frame.entities[0]!;
  const positions: Array<[string, [number, number, number], boolean]> = [
    ['center', [0, 1, 0], true], ['edge', [9, 1, 0], true], ['far-side', [100, 1, 0], false],
    ['behind', [0, 1, 30], false], ['wreck:debris:0', [0, 1, 0], true],
  ];
  for (const [id, position] of positions) options.frame.entities.push({ ...structuredClone(template), id: `tod:city:prop:${id}`, position });
  const hidden = { ...structuredClone(template), id: 'tod:city:prop:removed', visible: false };options.frame.entities.push(hidden);
  const simulation = structuredClone(options.state);
  presentCombatObstructions3D({ ...options, viewportAspect: 1.6 });
  for (const [id, , visible] of positions) expect(options.frame.entities.find(entity => entity.id === `tod:city:prop:${id}`)!.visible).toBe(visible);
  expect(hidden.visible).toBe(false);expect(options.state).toEqual(simulation);
  expect(options.frame.entities.find(entity => entity.id === 'other')!.visible).toBe(true);
});

test('structural district scenery uses conservative render culling without changing saved state or transforms', () => {
  const options = fixture(), template = options.frame.entities[0]!;
  const pieces: Array<[string, [number, number, number], [number, number, number], boolean]> = [
    ['market:near-stall', [0, 1, 0], [2, 2, 2], true],
    ['market:edge-awning', [9, 1, 0], [2, .1, 2], true],
    ['residential:offscreen-wall', [100, 1, 0], [1, 4, 1], false],
    ['utility:behind-camera', [0, 1, 30], [2, 3, 2], false],
    // Its center lies outside the view, but the roof spans into the image.
    ['depot:wide-roof', [30, 3, 0], [30, .2, 10], true],
    ['construction:distant-frame', [0, 1, -150], [1, 5, 1], false],
  ];
  for (const [id, position, scale] of pieces) options.frame.entities.push({ ...structuredClone(template), id: `tod:city:overhaul:${id}`, position, scale });
  options.frame.entities.push({ ...structuredClone(template), id: 'tod:city:overhaul:market:broken-cover', visible: false });
  const savedState = structuredClone(options.state), sourceFrame = structuredClone(options.frame);
  for (const aspect of [1.7777777777777777, .4613733905579399]) {
    const frame = structuredClone(sourceFrame);
    presentCombatObstructions3D({ frame, state: options.state, viewportAspect: aspect });
    for (const [id, , , visible] of pieces) expect(frame.entities.find(entity => entity.id === `tod:city:overhaul:${id}`)!.visible).toBe(visible);
    expect(frame.entities.find(entity => entity.id.endsWith('broken-cover'))!.visible).toBe(false);
    expect(frame.entities.map(({ visible: _, ...entity }) => entity)).toEqual(sourceFrame.entities.map(({ visible: _, ...entity }) => entity));
    expect(options.state).toEqual(savedState);
  }
  // The next evaluated frame starts from authored/saved visibility, so returning
  // the camera to that district reveals it without mutating any persistence data.
  const returned = structuredClone(sourceFrame);returned.camera.position = [100, 1, 10];returned.camera.target = [100, 1, 0];
  presentCombatObstructions3D({ frame: returned, state: options.state });
  expect(returned.entities.find(entity => entity.id.endsWith('offscreen-wall'))!.visible).toBe(true);
  expect(sourceFrame.entities.find(entity => entity.id.endsWith('offscreen-wall'))!.visible).toBe(true);
  expect(options.state).toEqual(savedState);
});

test('ground and wall tech rings lie entirely outside their collision plane, with dust suppressed', () => {
  for (const normal of [{ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }]) {
    const options = fixture(), point = { x: 2, y: 3, z: 4 };
    const timingFeedback = [{ id: 'a', cue: { action: 'tech' as const, result: 'perfect' as const, frame: 0, contactPoint: point, contactNormal: normal } }];
    for (const age of [0, 6, 20, 29]) {
      options.state.frame = age;presentCombatTimingRings({ ...options, timingFeedback });
      for (const ring of options.frame.entities.filter(e => e.id.startsWith('a:parry:'))) {
        const distance = (ring.position[0] - point.x) * normal.x + (ring.position[1] - point.y) * normal.y + (ring.position[2] - point.z) * normal.z;
        expect(distance).toBeCloseTo(.12);
      }
    }
    const dust = { ...options.frame.entities[0]!, id: 'a:dust:0' };options.frame.entities.push(dust);options.state.frame = 6;
    const locomotionEvents = [{ fighterId: 'a', frame: 0, kind: 'land' as const, point, velocity: { x: 0, y: -8, z: 0 }, strength: 1 }];
    presentCombatLocomotion3D({ ...options, locomotionEvents });expect(dust.visible).toBe(true);
    presentCombatLocomotion3D({ ...options, locomotionEvents, timingFeedback });expect(dust.visible).toBe(false);
  }
});

test('shield cracks accumulate with damage and broken perimeter reconstructs over ten seconds', () => {
  const options = fixture(), fighter = options.state.fighters[0]!;
  fighter.guarding = true;
  const visible = (start: number, end: number) => options.frame.entities.filter(e => { const n = Number(e.id.split(':shield:')[1]);return n >= start && n < end && e.visible; }).length;
  presentGuardFractures3D(options);expect(visible(12, 24)).toBe(0);
  fighter.guardMeter = 50;presentGuardFractures3D(options);expect(visible(12, 24)).toBe(6);
  fighter.guardBrokenFrames = options.config.guardBreakFrames!;presentGuardFractures3D(options);expect(visible(0, 12)).toBe(0);
  fighter.guardBrokenFrames /= 2;presentGuardFractures3D(options);expect(visible(0, 12)).toBe(6);
  const before = structuredClone(options.frame);presentGuardFractures3D(options);expect(options.frame).toEqual(before);
});

test('parry circles use current posed hands; wall tech circles stay at contact after movement', () => {
  const options = fixture();options.state.fighters[0]!.guarding = true;
  const timingFeedback = [{ id: 'a', cue: { action: 'parry' as const, result: 'perfect' as const, frame: 0 } }];
  presentCombatVisuals3D({ ...options, timingFeedback });
  const ring = () => options.frame.entities.filter(e => e.id.startsWith('a:parry:'));
  const mean = (axis: number) => ring().reduce((sum, e) => sum + e.position[axis]!, 0) / 24;
  const hands = options.frame.entities.filter(e => e.id.endsWith('-hand'));
  for (let i = 0; i < 3; i++) expect(mean(i)).toBeCloseTo((hands[0]!.position[i]! + hands[1]!.position[i]!) / 2);
  const tech = [{ id: 'a', cue: { action: 'tech' as const, result: 'late' as const, frame: 0, contactPoint: { x: 2, y: 3, z: 4 } } }];
  presentCombatTimingRings({ ...options, timingFeedback: tech });
  expect(mean(0)).toBeCloseTo(2);expect(mean(1)).toBeLessThan(3);expect(mean(2)).toBeCloseTo(4);
  const before = ring().map(e => structuredClone(e));options.frame.entities[0]!.position = [10, 5, 8];
  presentCombatTimingRings({ ...options, timingFeedback: tech });expect(ring()).toEqual(before);
});

test('failed parries and techs droop downward while success retains centered expanding rings', () => {
  for (const action of ['parry', 'tech'] as const) for (const result of ['early', 'late', 'perfect'] as const) {
    const options = fixture(), cue = { action, result, frame: 0 };
    const mean = () => options.frame.entities.filter(e => e.id.startsWith('a:parry:')).reduce((sum, e) => sum + e.position[1], 0) / 24;
    options.state.frame = 2;presentCombatTimingRings({ ...options, timingFeedback: [{ id: 'a', cue }] });const start = mean();
    options.state.frame = 22;presentCombatTimingRings({ ...options, timingFeedback: [{ id: 'a', cue }] });
    if (result === 'perfect') expect(mean()).toBeCloseTo(start);else expect(mean()).toBeLessThan(start - .6);
    presentCombatTimingRings({ ...options, reducedMotion: true, timingFeedback: [{ id: 'a', cue }] });const reduced = mean();
    options.state.frame = 5;presentCombatTimingRings({ ...options, reducedMotion: true, timingFeedback: [{ id: 'a', cue }] });expect(mean()).toBeCloseTo(reduced);
  }
});

test('only obstructing solid fades, legacy cages stay hidden, repeated presentation restores material', () => {
  const options = fixture(), wall = options.frame.entities.find(e => e.id === 'wall')!;
  wall.position = [0, 1, 5];wall.scale = [2, 2, .2];
  const geometry = structuredClone(wall), shared = structuredClone(options.frame.materials[1]);
  presentCombatObstructions3D(options);
  expect(options.frame.materials[0]!.look.opacity).toBe(.035);
  expect(options.frame.materials[0]!.look.cutaway).toBe(true);
  expect(options.frame.entities.filter(e => e.id.includes(':occlusion-edge:') && e.visible)).toHaveLength(0);
  expect(wall).toEqual(geometry);expect(options.frame.materials[1]).toEqual(shared);
  const before = structuredClone(options.frame);presentCombatObstructions3D(options);expect(options.frame).toEqual(before);
  options.frame.camera.position = [10, 1, 0];presentCombatObstructions3D(options);
  expect(options.frame.materials[0]!.look.opacity).toBe(1);
  expect(options.frame.materials[0]!.look.cutaway).toBe(false);
  expect(options.frame.entities.some(e => e.id.includes(':occlusion-edge:') && e.visible)).toBe(false);
});

test('cue-only cover clears for guard and contact effects, but inactive and cosmetic pools do not reveal scenery', () => {
  for (const name of ['guard-shell', 'shield:0', 'parry:0', 'spark:0', 'armor', 'cosmetic:0']) for (const visible of [true, false]) {
    const options = fixture(), wall = options.frame.entities.find(entity => entity.id === 'wall')!;
    options.frame.entities = options.frame.entities.filter(entity => !entity.id.startsWith('a:'));
    wall.position = [1, 1, 5];wall.scale = [.15, 1, .1];
    options.frame.entities.push({ id: `a:${name}`, position: [2, 1, 0], rotation: [0, 0, 0, 1], scale: [.1, .1, .1], visible });
    const before = structuredClone(options.state);
    presentCombatObstructions3D(options);
    expect(!!options.frame.materials[0]!.look.cutaway).toBe(visible && name !== 'cosmetic:0');
    expect(options.state).toEqual(before);
  }
});

test('legacy low horizontal cage edges never render across fighter boots even without their former owner', () => {
  const options = fixture();
  const edge: typeof options.frame.entities[number] = { ...structuredClone(options.frame.entities[0]!), id: 'removed-wall:occlusion-edge:0', position: [0, .1, 5], scale: [20, .025, .025], visible: true };
  options.frame.entities.push(edge);const position = [...edge.position];
  presentCombatObstructions3D(options);
  expect(edge.visible).toBe(false);expect([...edge.position]).toEqual(position);
  expect(options.frame.entities.find(entity => entity.id === 'a')!.visible).toBe(true);
});

test('authored translucent scenery gains edges only while the camera fades it below its own opacity', () => {
  const options = fixture(), wall = options.frame.entities.find(e => e.id === 'wall')!;
  options.frame.materials[0]!.look = { ...options.frame.materials[0]!.look, opacity: .3 };
  wall.position = [20, 1, 5];wall.scale = [2, 2, .2];
  presentCombatObstructions3D(options);expect(options.frame.materials[0]!.look.cutaway).toBeFalsy();
  wall.position[0] = 0;presentCombatObstructions3D(options);expect(options.frame.materials[0]!.look.cutaway).toBe(true);
  wall.position[0] = 20;presentCombatObstructions3D(options);
  expect(options.frame.materials[0]!.look.opacity).toBe(.3);expect(options.frame.materials[0]!.look.cutaway).toBe(false);
});

test('a close foreground ceiling cuts away even beside fighter rays, then returns when the lens clears', () => {
  const options = fixture(), roof = options.frame.entities.find(entity => entity.id === 'wall')!;
  options.frame.camera.position = [0, 6, 12];roof.position = [-5, 6, 10];roof.scale = [3, .3, 5];
  const geometry = structuredClone(roof), state = structuredClone(options.state);
  presentCombatObstructions3D(options);
  expect(options.frame.materials[0]!.look.opacity).toBe(.035);
  expect(roof).toEqual(geometry);expect(options.state).toEqual(state);
  options.frame.camera.position = [5, 6, 12];presentCombatObstructions3D(options);
  expect(options.frame.materials[0]!.look.opacity).toBe(1);
});

test('a floor beneath a low knockout root stays opaque even when a foot sightline crosses it', () => {
  const options = fixture(), floor = options.frame.entities.find(entity => entity.id === 'wall')!;
  floor.position = [0, -.6, 0];floor.scale = [80, .6, 60];floor.rotation = [0, 0, 0, 1];
  options.frame.entities.find(entity => entity.id === 'a')!.position[1] = .15;
  options.frame.camera.position = [0, 5, 10];
  presentCombatObstructions3D(options);
  expect(options.frame.materials[0]!.look.opacity).toBe(1);
});

test('wall trim follows support fade and removal even when the trim itself misses both sightlines', () => {
  const options = fixture(), wall = options.frame.entities.find(entity => entity.id === 'wall')!;
  wall.position = [0, 1, 5];wall.scale = [2, 2, .2];
  const trim = { id: 'wall:occlusion-follow:thin-course', look: { ...structuredClone(options.frame.materials[1]!.look), opacity: .8 } };
  options.frame.materials.unshift(trim);
  const color = [...trim.look.baseColor];
  presentCombatObstructions3D(options);expect(trim.look.opacity).toBeCloseTo(.028);
  presentCombatObstructions3D(options);expect(trim.look.opacity).toBeCloseTo(.028);
  wall.visible = false;presentCombatObstructions3D(options);expect(trim.look.opacity).toBe(0);
  wall.visible = true;options.frame.camera.position = [10, 1, 0];presentCombatObstructions3D(options);
  expect(trim.look.opacity).toBe(.8);expect([...trim.look.baseColor]).toEqual(color);
});

test('nonphysical machinery and moving beams fade against complete posed silhouettes at landscape and portrait distance', () => {
  for (const aspect of [1.7777777777777777, 0.4613733905579399]) {
    const options = fixture(), root = options.frame.entities[0]!, obstruction = options.frame.entities.find(entity => entity.id === 'wall')!;
    options.state = createCombatSimulation({ config: options.config, fighters: [
      { id: 'a', position: { x: 0, y: 1, z: 0 } }, { id: 'b', position: { x: 3, y: 1, z: 0 } },
    ] }).capture();
    options.frame.entities.push({ ...structuredClone(root), id: 'b', position: [3, 1, 0] }, { ...structuredClone(root), id: 'tod:city:street', scale: [80, .1, 60] });
    options.frame.entities.push({ ...structuredClone(root), id: 'a:right-boot', position: [2, 1, 0], scale: [.14, .16, .24] });
    presentCombatCamera3D({ ...options, viewportAspect: aspect, reducedMotion: true });
    const eye = options.frame.camera.position;
    obstruction.position = [(eye[0] + 2) / 2, (eye[1] + 1) / 2, eye[2] / 2];obstruction.scale = [.04, .2, .1];
    const authored = structuredClone(obstruction), state = structuredClone(options.state), camera = structuredClone(options.frame.camera);
    presentCombatObstructions3D({ ...options, viewportAspect: aspect });
    expect(options.frame.materials[0]!.look.opacity).toBe(.035);
    expect(obstruction).toEqual(authored);expect(options.state).toEqual(state);expect(options.frame.camera).toEqual(camera);
    // A later evaluated mover position clears the kick without touching physics.
    obstruction.position[0] = 8;presentCombatObstructions3D({ ...options, viewportAspect: aspect });
    expect(options.frame.materials[0]!.look.opacity).toBe(1);
    // Cover touching only the outer torso silhouette also fades, rather than
    // waiting until its center entirely conceals the character.
    obstruction.position = [(eye[0] + .32) / 2, (eye[1] + 1.3) / 2, eye[2] / 2];obstruction.scale = [.03, .3, .05];
    presentCombatObstructions3D({ ...options, viewportAspect: aspect });expect(options.frame.materials[0]!.look.opacity).toBe(.035);
  }
});

test('shared decorative beams fade when any instance blocks even while their owner stays clear', () => {
  const options = fixture(), root = options.frame.entities[0]!, wall = options.frame.entities.find(entity => entity.id === 'wall')!;
  wall.position = [8, 1, 5];wall.scale = [1, 2, .2];
  const trim = { id: 'wall:occlusion-follow:shared-blue', look: { ...structuredClone(options.frame.materials[1]!.look), opacity: .8 } };
  options.frame.materials.unshift(trim);
  options.frame.entities.push({ ...structuredClone(root), id: 'beam-a', position: [0, 1, 5], scale: [.2, 2, .2] },
    { ...structuredClone(root), id: 'beam-b', position: [8, 3, 5], scale: [.2, 1, .2] });
  const materialIds = new Map([['beam-a', trim.id], ['beam-b', trim.id]]), color = [...trim.look.baseColor];
  presentCombatObstructions3D({ ...options, materialIds });
  expect(options.frame.materials.find(material => material.id === 'wall:occlusion')!.look.opacity).toBe(1);
  expect(trim.look.opacity).toBeCloseTo(.028);expect([...trim.look.baseColor]).toEqual(color);
  options.frame.entities.find(entity => entity.id === 'beam-a')!.position[0] = 8;
  presentCombatObstructions3D({ ...options, materialIds });expect(trim.look.opacity).toBe(.8);
  wall.visible = false;presentCombatObstructions3D({ ...options, materialIds });expect(trim.look.opacity).toBe(0);
});

test('low roof stock cannot be treated as supporting terrain when it conceals posed boots', () => {
  const options = fixture(), root = options.frame.entities[0]!, stock = options.frame.entities.find(entity => entity.id === 'wall')!;
  root.position = [-5, 7, 38];stock.position = [-5.8, 6.45, 40];stock.scale = [1.3, .45, .55];
  options.frame.entities.push({ ...structuredClone(root), id: 'a:left-boot', position: [-4.94, 6.18, 38.18], scale: [.14, .16, .24] });
  options.frame.camera.position = [-2.5, 12.7693155, 49.6875384];options.frame.camera.target = [-2.5, 7.55, 38];
  presentCombatObstructions3D(options);expect(options.frame.materials[0]!.look.opacity).toBe(.16);
});

test('vertical boot bounds reveal the body of a narrow foreground boiler even when center rays clear it', () => {
  const options = fixture(), root = options.frame.entities[0]!, boiler = options.frame.entities.find(entity => entity.id === 'wall')!;
  root.position = [-52, 1, -18];boiler.position = [-51.3, .8, -14.5];boiler.scale = [.28, .8, .8];
  options.frame.entities.push({ ...structuredClone(root), id: 'a:left-boot', position: [-51.94, .18, -17.82], scale: [.14, .16, .24] });
  options.frame.camera.position = [-50, 6.7691081, -6.3124616];options.frame.camera.target = [-50, 1.55, -18];
  presentCombatObstructions3D(options);expect(options.frame.materials[0]!.look.opacity).toBe(.035);
});

test('secondary pickup cutaways select only four nearby available loose objects on the fighter floor', () => {
  const options = fixture(), desk = options.frame.entities.find(entity => entity.id === 'wall')!;
  desk.position = [2, 1.5, 5];desk.scale = [.35, .8, .2];options.frame.camera.position = [0, 3, 10];
  const item = (id: string, x: number): WeaponState => ({ id, active: true, owner: '', projectileOwner: '', durability: 1, length: 1,
    position: { x, y: .15, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, serial: 0 });
  const blocked = item('blocked', 4), original = structuredClone(blocked), camera = structuredClone(options.frame.camera);
  for (const excluded of [{ active: false }, { durability: 0 }, { owner: 'a' }, { projectileOwner: 'a' },
    { position: { x: 4, y: 6.15, z: 0 } }, { position: { x: 7, y: .15, z: 0 } }]) {
    presentCombatObstructions3D({ ...options, weapons: [{ ...blocked, ...excluded }] });expect(options.frame.materials[0]!.look.opacity).toBe(1);
  }
  const near = [-2, -1, 1, 2].map((x, index) => item(`near:${index}`, x));
  presentCombatObstructions3D({ ...options, weapons: [blocked, ...near] });expect(options.frame.materials[0]!.look.opacity).toBe(1);
  presentCombatObstructions3D({ ...options, weapons: [blocked, ...near.slice(1)] });expect(options.frame.materials[0]!.look.opacity).toBe(.035);
  // A broad house crossing only the pickup rays keeps the district opaque.
  // Its foreground facade deliberately misses the fighter sightlines.
  desk.position = [5.5, 1.5, 5];desk.scale = [3.2, .8, .2];
  presentCombatObstructions3D({ ...options, weapons: [blocked] });expect(options.frame.materials[0]!.look.opacity).toBe(1);
  desk.position[0] = 0;
  presentCombatObstructions3D({ ...options, weapons: [blocked] });expect(options.frame.materials[0]!.look.opacity).toBe(.035);
  expect(blocked).toEqual(original);expect(options.frame.camera).toEqual(camera);
});
