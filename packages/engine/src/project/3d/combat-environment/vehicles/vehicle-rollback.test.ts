import { expect, test } from 'bun:test';
import type { CombatRoomFrame, CombatRoomInput } from '../../../../combat/net/protocol.ts';
import { createNetworkCombatSession } from '../../combat-rollback/session.ts';
import { createCombatReplay3D } from '../../combat-rollback/replay.ts';
import { vehicleFixture } from './vehicle-fixture.ts';

test('secondary traffic crash converges after delayed inputs and replay seeking', async () => {
  const local = await vehicleFixture(), remote = await vehicleFixture(), viewing = await vehicleFixture();
  const match = { matchId: 'vehicle', contentId: 'vehicle-v1', seed: 7, seats: ['one', 'two'] }, packets: CombatRoomInput[] = [], frames: Record<string, CombatRoomFrame> = {};
  const neutral: Pick<CombatRoomInput, 'actions' | 'direction'> = { actions: [], direction: { x: 0, y: 0, z: 0 } };
  const host = createNetworkCombatSession({ ...local, match, contentId: match.contentId, localPeerId: 'one', mode: 'training', getLocalInput: () => ({ actions: packets.length === 0 ? ['jab'] : [], direction: { x: 0, y: 0, z: packets.length > 30 ? 1 : 0 } }), sendInput: packet => packets.push(packet) });
  const peer = createNetworkCombatSession({ ...remote, match, contentId: match.contentId, localPeerId: 'two', mode: 'training', getLocalInput: () => neutral, sendInput() {} });
  for (let frame = 0; frame < 180; frame++) {
    host.tick();peer.tick();frames[`0:${frame}`] = { ...packets[frame]!, seat: 0 };frames[`1:${frame}`] = { ...neutral, matchId: match.matchId, frame, seat: 1 };
    host.receive({ ...match, status: 'ready', confirmedFrame: frame, frames });
    peer.receive({ ...match, status: 'ready', confirmedFrame: frame - 6, frames: Object.fromEntries(Object.entries(frames).filter(([, input]) => input.frame <= frame - 6)) });
  }
  peer.receive({ ...match, status: 'ready', confirmedFrame: 179, frames });
  const expected = host.game.snapshot();expect(expected.combat!.environment!.vehicleStops).toHaveLength(2);
  expect(expected.combat!.environment!.vehicleStops!.map(stop => stop.cause)).toEqual(['impact', 'impact']);expect(peer.game.snapshot()).toEqual(expected);
  const replay = createCombatReplay3D({ ...viewing, recording: host.exportRecording(), contentId: match.contentId });while (replay.tick()) {}
  expect(replay.game.snapshot()).toEqual(expected);replay.seek({ frame: 0 });expect(replay.game.snapshot().combat!.environment!.vehicleStops).toBeUndefined();
  replay.seek({ frame: 180 });expect(replay.game.snapshot()).toEqual(expected);
  expect(local.runtime.physics.body('car')!.collisionMask).not.toBe(0);expect(remote.runtime.physics.body('following')!.x).toBe(local.runtime.physics.body('following')!.x);
}, 20000);
