import { expect, test } from 'bun:test';
import type { CombatRoomFrame, CombatRoomInput } from '../../../../combat/net/protocol.ts';
import { createHyperfocus3DRuntime } from '../../../runtime-3d.ts';
import { combatMotionFixture } from '../../combat-motion-fixture.ts';
import { createNetworkCombatSession } from '../../combat-rollback/session.ts';
import { createCombatReplay3D } from '../../combat-rollback/replay.ts';

async function fixture() {
  const source = await combatMotionFixture({ match: true }), project = source.project;
  const scene = project.extensions.hyperfocus3D.scenes[0]!;
  scene.entities.find(entity => entity.id === 'b')!.position[0] = 15;
  for (const id of ['fire', 'water']) scene.entities.push({ id, meshId: 'mesh', materialId: 'material', position: [0, .5, 0], scale: [8, .5, 8], rotationY: 0 });
  (project.extensions.hyperfocusCombat).environment = { surfaces: [], hazards: [{ entityId: 'fire', kind: 'fire', damage: 2, intervalFrames: 17 }, { entityId: 'water', kind: 'flood', groundSpeedScale: .65 }] };
  return { project, runtime: await createHyperfocus3DRuntime(project, source.assets) };
}

test('fire cadence and water movement converge with delayed network inputs and replay seek', async () => {
  const local = await fixture(), remote = await fixture(), replaying = await fixture();
  const match = { matchId: 'hazards', contentId: 'hazards-v1', seed: 1, seats: ['one', 'two'] };
  const packets: CombatRoomInput[] = [], frames: Record<string, CombatRoomFrame> = {};
  const neutral: Pick<CombatRoomInput, 'actions' | 'direction'> = { actions: [], direction: { x: 0, y: 0, z: 0 } };
  const host = createNetworkCombatSession({ ...local, match, contentId: match.contentId, localPeerId: 'one', mode: 'training', getLocalInput: () => ({ ...neutral, direction: { x: packets.length < 30 ? 1 : 0, y: 0, z: 0 } }), sendInput: packet => packets.push(packet) });
  const peer = createNetworkCombatSession({ ...remote, match, contentId: match.contentId, localPeerId: 'two', mode: 'training', getLocalInput: () => neutral, sendInput() {} });
  for (let frame = 0; frame < 90; frame++) {
    host.tick();peer.tick();
    frames[`0:${frame}`] = { ...packets[frame]!, seat: 0 };frames[`1:${frame}`] = { ...neutral, matchId: match.matchId, frame, seat: 1 };
    host.receive({ ...match, status: 'ready', confirmedFrame: frame, frames });
    peer.receive({ ...match, status: 'ready', confirmedFrame: frame - 6, frames: Object.fromEntries(Object.entries(frames).filter(([, input]) => input.frame <= frame - 6)) });
  }
  peer.receive({ ...match, status: 'ready', confirmedFrame: 89, frames });
  const expected = host.game.snapshot();expect(expected.combat!.state.fighters[0]!.health).toBeLessThan(100);
  expect(peer.game.snapshot()).toEqual(expected);
  const replay = createCombatReplay3D({ ...replaying, recording: host.exportRecording(), contentId: match.contentId });
  while (replay.tick()) {}
  expect(replay.game.snapshot()).toEqual(expected);
  replay.seek({ frame: 30 });replay.seek({ frame: 90 });expect(replay.game.snapshot()).toEqual(expected);
});
