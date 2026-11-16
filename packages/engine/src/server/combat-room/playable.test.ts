import { expect, test } from 'bun:test';
import { connectAuthoritative } from '../../net/authoritative-client.ts';
import { combatRoomInputCodec, combatRoomSnapshotSchema, type CombatRoomSnapshot } from '../../combat/net/protocol.ts';
import { createNetworkCombatSession } from '../../project/3d/combat-rollback/session.ts';
import { combatMotionFixture } from '../../project/3d/combat-motion-fixture.ts';
import { createAuthoritativeServer } from '../server.ts';
import { createCombatRelayRoom } from './room.ts';
import { createCombatRecording, readCombatRecording } from '../../combat/net/replay.ts';
import { createGameplay3D } from '../../project/3d/gameplay.ts';

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Playable combat transport timed out.');await Bun.sleep(2); }
}

test('two transported project sessions earn a physical hit and confirm matching state/audio', async () => {
  let recording: ReturnType<typeof createCombatRecording> | undefined;
  const server = createAuthoritativeServer({ transport: 'websocket', port: 0, devMode: true,
    rooms: [createCombatRelayRoom({ matchId: 'bout', contentId: 'fixture-v1', seed: 7, allowedActions: ['jab'], onConfirmedFrames(batch) {
      recording ??= createCombatRecording(batch);
      for (let i = 0; i < batch.frames.length; i += 2) recording.append({ frames: batch.frames.slice(i, i + 2) });
    } })],
    inputCodec: combatRoomInputCodec, replication: { binary: true, snapshotRate: 2, deltaRate: 60 } });
  server.start();
  const snapshots: Array<CombatRoomSnapshot | undefined> = [], sessions: ReturnType<typeof createNetworkCombatSession>[] = [];
  const errors: unknown[] = [], audio: string[][] = [[], []];
  const clients = [0, 1].map(index => {
    const client = connectAuthoritative<CombatRoomSnapshot>({ url: `ws://127.0.0.1:${server.getStats().port}`, token: `dev:physical-${index}`,
      roomId: 'physical', roomType: 'combat-relay', request: { matchId: 'bout', contentId: 'fixture-v1' },
      inputCodec: combatRoomInputCodec, schema: combatRoomSnapshotSchema, reconnect: false });
    const receive = (state: CombatRoomSnapshot) => {
      snapshots[index] = state;
      try { sessions[index]?.receive(state); } catch (error) { errors.push(error); }
    };
    client.onSnapshot(receive);client.onDelta(receive);return client;
  });
  try {
    const admitted = [await clients[0]!.connect(), await clients[1]!.connect()];
    await until(() => snapshots[0]?.status === 'ready' && snapshots[1]?.status === 'ready');
    for (const index of [0, 1]) {
      const f = await combatMotionFixture({ match: true });f.game.reset();
      const project = { ...f.project, extensions: { ...f.project.extensions, hyperfocusCombat: { ...f.project.extensions.hyperfocusCombat,
        audio: { music: 'music', cues: { hit: 'hit', swing: 'swing' }, voices: { a: { attack: 'attack' } } },
      } } };
      sessions.push(createNetworkCombatSession({ project, runtime: f.runtime, match: snapshots[index]!, contentId: 'fixture-v1', localPeerId: admitted[index]!.playerId,
        getLocalInput: () => ({ actions: index === 0 && sessions[index]!.frame() === 210 ? ['jab'] : [], direction: { x: 0, y: 0, z: 0 } }),
        sendInput: input => { expect(clients[index]!.sendInput(input).status).toBe('sent'); },
        onConfirmedAudio: cue => audio[index]!.push(`${cue.frame}:${cue.id}:${cue.event.assetId}`),
      }));
    }
    for (let batch = 0; batch < 27; batch++) {
      for (let i = 0; i < 10; i++) { expect(sessions[0]!.tick()).toBe(true);expect(sessions[1]!.tick()).toBe(true); }
      await until(() => sessions.every(session => session.confirmedFrame() === batch * 10 + 9) || errors.length > 0);
      expect(errors).toEqual([]);
    }
    expect(sessions[0]!.game.snapshot()).toEqual(sessions[1]!.game.snapshot());
    expect(sessions[0]!.stateHash(269)).toBe(sessions[1]!.stateHash(269));
    expect(sessions[0]!.game.snapshot().combat!.state.fighters[1]!.health).toBeLessThan(100);
    expect(audio[0]).toEqual(audio[1]);expect(audio[0]!.filter(cue => cue.endsWith(':hit'))).toHaveLength(1);
    expect(new Set(audio[0]).size).toBe(audio[0]!.length);
    const saved = readCombatRecording({ value: JSON.parse(JSON.stringify(recording!.snapshot())) });
    expect(saved.frames).toHaveLength(270);
    for (const session of sessions) {
      expect(session.exportRecording()).toEqual(saved);
      expect(session.recordingStatus).toEqual({ frames: 270, stoppedReason: '' });
    }
    const replayFixture = await combatMotionFixture({ match: true });replayFixture.game.reset();
    const replay = createGameplay3D({ project: replayFixture.project, runtime: replayFixture.runtime, independentCombatInputs: true, externalCombatMatch: true, combatQueueSeed: saved.seed });
    for (const pair of saved.frames) replay.step([], pair.map(input => ({ actions: new Set(input.actions), direction: input.direction })));
    expect(replay.snapshot()).toEqual(sessions[0]!.game.snapshot());
    expect(replay.snapshot().combat!.state.fighters[1]!.health).toBeLessThan(100);
    clients[1]!.close();await until(() => sessions[0]!.status.status === 'interrupted');
    const stopped = sessions[0]!.game.snapshot();expect(sessions[0]!.tick()).toBe(false);expect(sessions[0]!.game.snapshot()).toEqual(stopped);
  } finally { for (const client of clients) client.close();await server.stop(); }
});
