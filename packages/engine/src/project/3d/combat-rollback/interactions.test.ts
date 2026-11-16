import { expect, test } from 'bun:test';
import type { CombatRoomFrame, CombatRoomInput } from '../../../combat/net/protocol.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { createHyperfocus3DRuntime } from '../../runtime-3d.ts';
import { createCombatReplay3D } from './replay.ts';
import { createNetworkCombatSession } from './session.ts';
import { createNetworkCombatSpectator } from './spectator.ts';

async function fixture() {
  const base = await combatMotionFixture({ match: true });
  const declaration = base.project.extensions.hyperfocus3D;
  const project = { ...base.project, extensions: { ...base.project.extensions,
    hyperfocusCombat: { ...base.project.extensions.hyperfocusCombat, interactions: { weapons: [{ entityId: 'tool', material: 'wood', durability: 40, length: 1.5, lightMoveId: 'jab', heavyMoveId: 'heavy' }] } },
    hyperfocus3D: { ...declaration, scenes: declaration.scenes.map(scene => ({ ...scene, entities: [...scene.entities, { ...scene.entities[2]!, id: 'tool', position: [.4, 1, 0], scale: [.1, .1, .4] }] })) },
  } };
  return { project, runtime: await createHyperfocus3DRuntime(project, base.assets) };
}

test('weapon pickup and throw survive confirmed recording, spectator playback, replay seek and takeover', async () => {
  const local = await fixture(), watching = await fixture(), replaying = await fixture(), delayed = await fixture();
  const match = { matchId: 'tools', contentId: 'tools-v1', seed: 7, seats: ['one', 'two'] };
  const packets: CombatRoomInput[] = [], frames: Record<string, CombatRoomFrame> = {};
  const actions: string[] = [];
  const neutral = { actions, direction: { x: 0, y: 0, z: 0 } };
  const session = createNetworkCombatSession({ ...local, match, contentId: match.contentId, localPeerId: 'one', mode: 'training',
    getLocalInput: () => ({ ...neutral, actions: packets.length === 0 || packets.length === 3 ? ['interact'] : [] }), sendInput: packet => packets.push(packet) });
  const spectator = createNetworkCombatSpectator({ ...watching, match, contentId: match.contentId, mode: 'training', onCursor() {} });
  const peer = createNetworkCombatSession({ ...delayed, match, contentId: match.contentId, localPeerId: 'two', mode: 'training', getLocalInput: () => neutral, sendInput() {} });
  for (let frame = 0; frame < 24; frame++) {
    expect(session.tick()).toBe(true);
    expect(peer.tick()).toBe(true);
    frames[`0:${frame}`] = { ...packets[frame]!, seat: 0 };
    frames[`1:${frame}`] = { ...neutral, matchId: match.matchId, frame, seat: 1 };
    const snapshot = { ...match, status: 'ready' as const, confirmedFrame: frame, frames };
    session.receive(snapshot);spectator.receive(snapshot);spectator.tick();
    peer.receive({ ...snapshot, confirmedFrame: frame - 3, frames: Object.fromEntries(Object.entries(frames).filter(([, input]) => input.frame <= frame - 3)) });
  }
  const expected = session.game.snapshot();
  peer.receive({ ...match, status: 'ready', confirmedFrame: 23, frames });
  expect(peer.game.snapshot()).toEqual(expected);
  expect(expected.combat?.interactions?.trace.some(entry => entry.kind === 'weapon-picked-up')).toBe(true);
  expect(expected.combat?.interactions?.trace.some(entry => entry.kind === 'weapon-thrown')).toBe(true);
  expect(spectator.game.snapshot()).toEqual(expected);
  const replay = createCombatReplay3D({ ...replaying, recording: session.exportRecording(), contentId: match.contentId });
  while (replay.tick()) {}
  expect(replay.game.snapshot()).toEqual(expected);
  replay.seek({ frame: 1 });
  expect(replay.game.snapshot().combat?.interactions?.weapons[0]?.owner).toBe('a');
  const checkpoint = replay.game.checkpoint(), saved = replay.game.snapshot();
  replay.takeOver({ seat: 0 });replay.tick({ ...neutral, actions: [] });replay.tick({ ...neutral, actions: ['interact'] });
  expect(replay.game.snapshot().combat?.interactions?.weapons[0]?.owner).toBe('');
  checkpoint.restore();expect(replay.game.snapshot()).toEqual(saved);
  replay.seek({ frame: 24 });expect(replay.game.snapshot()).toEqual(expected);
});
