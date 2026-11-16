import { expect, test } from 'bun:test';
import { sample3DFrame } from '../../../frame/3d.ts';
import type { CombatRoomFrame, CombatRoomInput } from '../../../combat/net/protocol.ts';
import { createHyperfocus3DRuntime } from '../../runtime-3d.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createCombatReplay3D } from '../combat-rollback/replay.ts';
import { createNetworkCombatSession } from '../combat-rollback/session.ts';
import { createWeaponSurfaceProbe } from '../combat-interaction/surfaces.ts';

async function fixture() {
  const base = await combatMotionFixture({ match: true }), declaration = base.project.extensions.hyperfocus3D;
  const config = structuredClone(base.project.extensions.hyperfocusCombat.config);
  Object.assign(config.moves.find(move => move.id === 'jab')!, { impulse: 12, hitstunFrames: 60, groundedHitstunFrames: 60 });
  const project = { ...base.project, extensions: { ...base.project.extensions,
    hyperfocusCombat: { ...base.project.extensions.hyperfocusCombat, config, environment: { surfaces: [
      { entityId: 'wall', trigger: { kind: 'impact', minSpeed: 4 }, revealIds: ['interior'], debrisIds: ['debris'] },
      { entityId: 'upper-floor', trigger: { kind: 'scheduled', warningFrame: 65, removeFrame: 90 }, warningIds: ['warning'] },
    ] } },
    hyperfocus3D: { ...declaration, scenes: declaration.scenes.map(scene => ({ ...scene, entities: [...scene.entities,
      { ...scene.entities[2]!, id: 'wall', position: [3.5, 2, 0], scale: [.4, 4, 4] },
      { ...scene.entities[2]!, id: 'upper-floor', position: [0, 6, 0], scale: [4, .4, 4] },
      ...['interior', 'debris', 'warning'].map(id => ({ id, meshId: 'mesh', materialId: 'material', position: [4, 1, 0], scale: [.1, .1, .1], rotationY: 0 })),
    ] })) },
  } };
  return { project, runtime: await createHyperfocus3DRuntime(project, base.assets) };
}

test('impact opening and scheduled demolition converge through delayed online inputs, replay seek and reset', async () => {
  const local = await fixture(), remote = await fixture(), replaying = await fixture();
  const match = { matchId: 'city', contentId: 'city-v1', seed: 7, seats: ['one', 'two'] };
  const packets: CombatRoomInput[] = [], frames: Record<string, CombatRoomFrame> = {};
  const actions: string[] = [], neutral = { actions, direction: { x: 0, y: 0, z: 0 } };
  const host = createNetworkCombatSession({ ...local, match, contentId: match.contentId, localPeerId: 'one', mode: 'training', getLocalInput: () => ({ ...neutral, actions: packets.length === 30 ? ['jab'] : [] }), sendInput: packet => packets.push(packet) });
  const peer = createNetworkCombatSession({ ...remote, match, contentId: match.contentId, localPeerId: 'two', mode: 'training', getLocalInput: () => neutral, sendInput() {} });
  const initial = host.game.checkpoint();
  for (let frame = 0; frame < 150; frame++) {
    host.tick();peer.tick();
    expect(host.game.presentation?.status ?? '').not.toContain('Demolition warning');
    frames[`0:${frame}`] = { ...packets[frame]!, seat: 0 };frames[`1:${frame}`] = { ...neutral, matchId: match.matchId, frame, seat: 1 };
    host.receive({ ...match, status: 'ready', confirmedFrame: frame, frames });
    peer.receive({ ...match, status: 'ready', confirmedFrame: frame - 6, frames: Object.fromEntries(Object.entries(frames).filter(([, input]) => input.frame <= frame - 6)) });
  }
  peer.receive({ ...match, status: 'ready', confirmedFrame: 149, frames });
  const expected = host.game.snapshot();
  expect(peer.game.snapshot()).toEqual(expected);
  expect(expected.combat!.environment!.surfaces.map(surface => surface.phase)).toEqual(['removed', 'removed']);
  expect(expected.combat!.environment!.trace.map(event => event.cause)).toEqual(['impact', 'scheduled', 'scheduled']);
  expect(expected.combat!.environment!.trace[0]!.actor).toBe('b');
  expect(expected.combat!.environment!.trace[0]!.speed).toBeGreaterThanOrEqual(4);
  expect(expected.combat!.exchange.some(event => event.kind === 'bounce' && event.targetId === 'b' && event.frame === expected.combat!.environment!.trace[0]!.frame)).toBe(false);
  expect(local.runtime.physics.body('b')!.x).toBeGreaterThan(3.8);
  function visible(game: typeof host.game, runtime: typeof local.runtime) {
    const frame = sample3DFrame({ declaration: runtime.declaration, clock: { kind: 'simulation', tick: runtime.snapshot().tick, ticksPerSecond: 60 }, viewport: { width: 800, height: 600 } });
    game.presentFrame(frame);
    return frame.entities.filter(entity => ['wall', 'upper-floor', 'interior', 'debris', 'warning'].includes(entity.id)).map(entity => ({ id: entity.id, visible: entity.visible }));
  }
  expect(visible(host.game, local.runtime)).toEqual(visible(peer.game, remote.runtime));
  expect(visible(host.game, local.runtime)).toEqual([{ id: 'wall', visible: false }, { id: 'upper-floor', visible: false }, { id: 'interior', visible: true }, { id: 'debris', visible: true }, { id: 'warning', visible: false }]);
  for (const runtime of [local.runtime, remote.runtime]) {
    expect(runtime.physics.body('wall')!.collisionMask).toBe(0);expect(runtime.physics.body('upper-floor')!.collisionMask).toBe(0);
    expect(createWeaponSurfaceProbe(runtime.physics, ['wall'])({ x: 2, y: 1, z: 0 }, { x: 5, y: 1, z: 0 })).toBeUndefined();
  }
  const replay = createCombatReplay3D({ ...replaying, recording: host.exportRecording(), contentId: match.contentId });
  while (replay.tick()) {}
  expect(replay.game.snapshot()).toEqual(expected);expect(visible(replay.game, replaying.runtime)).toEqual(visible(host.game, local.runtime));
  replay.seek({ frame: 0 });expect(replaying.runtime.physics.body('wall')!.collisionMask).not.toBe(0);expect(replaying.runtime.physics.body('upper-floor')!.collisionMask).not.toBe(0);
  replay.seek({ frame: 150 });expect(replay.game.snapshot()).toEqual(expected);expect(replaying.runtime.physics.body('wall')!.collisionMask).toBe(0);
  initial.restore();expect(local.runtime.physics.body('wall')!.collisionMask).not.toBe(0);expect(local.runtime.physics.body('upper-floor')!.collisionMask).not.toBe(0);
  expect(host.game.snapshot().combat!.environment!.trace).toEqual([]);
  replay.game.reset();expect(replaying.runtime.physics.body('wall')!.collisionMask).not.toBe(0);expect(replaying.runtime.physics.body('upper-floor')!.collisionMask).not.toBe(0);
}, 20000);
