import { expect, test } from 'bun:test';
import type { CombatRoomFrame, CombatRoomInput } from '../../../combat/net/protocol.ts';
import { createHyperfocus3DRuntime } from '../../runtime-3d.ts';
import { createNetworkCombatSession } from '../combat-rollback/session.ts';
import { createCombatReplay3D } from '../combat-rollback/replay.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';

for (const grace of [false, true]) test(`dash ${grace ? 'late followup' : 'queue and manual wheel'} converges after delayed inputs and replay`, async () => {
  const fixture = await combatMotionFixture({ movement: { separateJump: true }, staminaRegen: 0 });
  const project = fixture.project;
  for (const entity of project.extensions.hyperfocus3D.scenes[0]!.entities) if (entity.id === 'a' || entity.id === 'b') entity.position[0] = entity.id === 'a' ? -20 : 20;
  const local = { project, runtime: await createHyperfocus3DRuntime(project, fixture.assets) }, remote = { project, runtime: await createHyperfocus3DRuntime(project, fixture.assets) }, viewing = { project, runtime: await createHyperfocus3DRuntime(project, fixture.assets) };
  const match = { matchId: 'dash', contentId: 'dash-v1', seed: 7, seats: ['one', 'two'] }, packets: CombatRoomInput[] = [], frames: Record<string, CombatRoomFrame> = {};
  const neutral: Pick<CombatRoomInput, 'actions' | 'direction'> = { actions: [], direction: { x: 0, y: 0, z: 0 } };
  const host = createNetworkCombatSession({ ...local, match, contentId: match.contentId, localPeerId: 'one', mode: 'training', getLocalInput: () => {
    const frame = packets.length;
    return { actions: grace ? frame === 35 ? ['dash'] : frame === 51 ? ['jab'] : [] : frame === 35 ? ['dash', 'heavy', 'drive'] : frame > 35 && frame < 44 || frame === 45 ? ['drive'] : [], direction: { x: -1, y: 0, z: 0 } };
  }, sendInput: packet => packets.push(packet) });
  const peer = createNetworkCombatSession({ ...remote, match, contentId: match.contentId, localPeerId: 'two', mode: 'training', getLocalInput: () => neutral, sendInput() {} });
  let sawHop = false, sawWheel = false;
  for (let frame = 0; frame < 100; frame++) {
    host.tick();peer.tick();frames[`0:${frame}`] = { ...packets[frame]!, seat: 0 };frames[`1:${frame}`] = { ...neutral, matchId: match.matchId, frame, seat: 1 };
    host.receive({ ...match, status: 'ready', confirmedFrame: frame, frames });
    peer.receive({ ...match, status: 'ready', confirmedFrame: frame - 6, frames: Object.fromEntries(Object.entries(frames).filter(([, input]) => input.frame <= frame - 6)) });
    const move = host.game.snapshot().combat!.state.fighters[0]!.moveId; sawHop ||= move === (grace ? 'dash-jab-away' : 'dash-drive-heavy-away'); sawWheel ||= grace ? host.game.snapshot().combat!.motion[0]!.dashFollowupFrames > 0 : move === 'dash-wheel-kick';
  }
  expect(sawHop).toBe(true);expect(sawWheel).toBe(true);
  peer.receive({ ...match, status: 'ready', confirmedFrame: 99, frames }); const expected = host.game.snapshot();expect(peer.game.snapshot()).toEqual(expected);
  const replay = createCombatReplay3D({ ...viewing, recording: host.exportRecording(), contentId: match.contentId });while (replay.tick()) {}
  expect(replay.game.snapshot()).toEqual(expected);replay.seek({ frame: grace ? 50 : 36 });if (grace) expect(replay.game.snapshot().combat!.motion[0]!.dashFollowupFrames).toBeGreaterThan(0);else expect(replay.game.snapshot().combat!.state.fighters[0]!.history.some(entry => entry.dashing)).toBe(true);
  replay.seek({ frame: 100 });expect(replay.game.snapshot()).toEqual(expected);
}, 20000);
