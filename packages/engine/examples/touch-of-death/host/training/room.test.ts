import { expect, test } from 'bun:test';
import { createAuthoritativeRoom } from '@hyperfocus/engine/server';
import type { AuthoritativePlayer } from '@hyperfocus/engine/server';
import { readTrainingSnapshot, trainingProtocolVersion } from '../../src/training/protocol.ts';
import { createTrainingRoom } from './room.ts';
import { createProfileService } from '../profiles/service.ts';

function fixture(withProfiles = false) {
  let time = 1000;
  const records = new Map<string, unknown>();
  const profiles = withProfiles ? createProfileService({ persistence: { async loadPlayer(id) { return records.get(id) ?? null; }, async savePlayer(id, value) { records.set(id, value); } },
    catalog: { version: 1, actors: [{ entityId: 'fighter' }], slots: [{ id: 'body', label: 'Body', defaultOptionId: 'red', options: [{ id: 'red', label: 'Red', colors: [{ materialSuffix: ':body', baseColor: [1, 0, 0, 1] }] }] }] } }) : undefined;
  const room = createAuthoritativeRoom({ id: 'training', now: () => 3.14159, metrics: { record() {} }, type: createTrainingRoom({ contentId: 'content', seed: 7, allowedActions: ['jab', 'guard', 'match:rematch'], now: () => time, profiles }) });
  const player = (id: string, userId = id): AuthoritativePlayer => ({ id, userId, roomId: 'training', sessionId: id, joinedAt: 0, lastInputAt: 0 });
  const join = (id: string, userId = id, request: unknown = { contentId: 'content', trainingVersion: trainingProtocolVersion, role: 'fighter' }) => room.join(player(id, userId), request);
  const snapshot = (id = 'a') => readTrainingSnapshot(room.snapshotFor(id));
  const input = (matchId: string, frame = 0) => ({ matchId, frame, actions: ['jab'], direction: { x: 0, y: 0, z: 0 } });
  return { room, join, snapshot, input, advance(ms: number) { time += ms; } };
}
test('two authenticated partners reset and swap only by mutual consent, preserving ordinary inputs', async () => {
  const f = fixture();expect(await f.join('a')).toEqual({ ok: true });expect(f.snapshot().training.phase).toBe('waiting');
  await expect(f.join('duplicate', 'a')).rejects.toThrow('both training seats');expect(f.snapshot().training.revision).toBe(1);
  expect(await f.join('b')).toEqual({ ok: true });expect(await f.join('third')).toMatchObject({ ok: false });
  const first = f.snapshot();expect(first.training).toMatchObject({ mode: 'training', phase: 'playing', users: ['a', 'b'] });
  await f.room.input('a', f.input(first.matchId));await f.room.input('b', f.input(first.matchId));expect(f.snapshot().confirmedFrame).toBe(0);
  const command = { type: 'training-propose', matchId: first.matchId, requestId: 'swap', action: 'swap' };
  await f.room.event('a', command);const proposal = f.snapshot();
  await f.room.event('a', command);expect(f.snapshot().training.revision).toBe(proposal.training.revision);
  await f.room.event('a', { type: 'training-respond', matchId: first.matchId, proposalId: proposal.training.proposalId, accept: true });
  expect(f.snapshot().training.error).toContain('partner');expect(f.snapshot().matchId).toBe(first.matchId);
  await f.room.event('b', { type: 'training-respond', matchId: first.matchId, proposalId: proposal.training.proposalId, accept: true });
  const swapped = f.snapshot();expect(swapped.matchId).not.toBe(first.matchId);expect(swapped.seats).toEqual(['b', 'a']);expect(swapped.training.users).toEqual(['b', 'a']);expect(swapped.confirmedFrame).toBe(-1);expect(swapped.seed).toBe(first.seed);expect(swapped.training.error).toBe('');
  await f.room.input('a', f.input(first.matchId, 1));await f.room.input('b', f.input(first.matchId, 1));expect(f.snapshot().confirmedFrame).toBe(-1);
  await f.room.event('b', { type: 'training-propose', matchId: swapped.matchId, requestId: 'reset', action: 'reset' });
  await f.room.event('a', { type: 'training-respond', matchId: swapped.matchId, proposalId: f.snapshot().training.proposalId, accept: true });
  expect(f.snapshot().seats).toEqual(['b', 'a']);expect(f.snapshot().matchId).not.toBe(swapped.matchId);
  const current = f.snapshot();await f.room.input('a', { ...f.input(current.matchId), actions: ['match:rematch'] });expect(f.snapshot().confirmedFrame).toBe(-1);
});
test('profile wrapper preserves interrupted identities, unlocks saving and rebinds a fresh partner connection', async () => {
  const f = fixture(true);await f.join('a');await f.join('b');const first = f.snapshot();
  const command = { type: 'profile-save', requestId: 'look', expectedRevision: 0, name: 'Red', icon: 'star', selections: { body: 'red' } };
  await f.room.event('a', command);expect(f.snapshot().profileResult.error).toContain('Finish this fight');
  await f.room.leave('b', 'disconnect');const interrupted = f.snapshot();
  expect(interrupted.training.phase).toBe('interrupted');expect(interrupted.profileBindings.some(binding => binding.playerId === 'b')).toBe(true);
  await f.room.event('a', command);expect(f.snapshot().profileResult.error).toBe('');expect(f.snapshot().profiles.find(profile => profile.userId === 'a')?.name).toBe('Red');
  await f.join('b2', 'b');const next = f.snapshot();expect(next.matchId).not.toBe(first.matchId);
  expect(next.profileBindings.map(binding => binding.playerId).sort()).toEqual(['a', 'b2']);expect(next.profiles.find(profile => profile.userId === 'a')?.name).toBe('Red');
});
test('expired, declined, malformed and disconnected requests cannot replace an attempt', async () => {
  const f = fixture();expect(await f.join('old', 'old', { contentId: 'content', role: 'fighter' })).toMatchObject({ ok: false });
  expect(await f.join('previous', 'previous', { contentId: 'content', trainingVersion: 3, role: 'fighter' })).toMatchObject({ ok: false });
  expect(await f.join('watch', 'watch', { contentId: 'content', trainingVersion: trainingProtocolVersion, role: 'spectator' })).toMatchObject({ ok: false });
  await f.join('a');await f.join('b');const first = f.snapshot();
  await f.room.event('a', { type: 'training-propose', matchId: first.matchId, requestId: 'one', action: 'reset', winner: 0 });expect(f.snapshot().training.proposalId).toBe('');
  await f.room.event('a', { type: 'training-propose', matchId: first.matchId, requestId: 'two', action: 'reset' });const proposal = f.snapshot().training.proposalId;
  f.advance(15000);await f.room.event('b', { type: 'training-respond', matchId: first.matchId, proposalId: proposal, accept: true });expect(f.snapshot().matchId).toBe(first.matchId);expect(f.snapshot().training.proposalId).toBe('');
  await f.room.event('a', { type: 'training-propose', matchId: first.matchId, requestId: 'three', action: 'swap' });
  await f.room.event('b', { type: 'training-respond', matchId: first.matchId, proposalId: f.snapshot().training.proposalId, accept: false });expect(f.snapshot().matchId).toBe(first.matchId);
  await f.room.event('a', { type: 'training-propose', matchId: first.matchId, requestId: 'four', action: 'swap' });const departed = f.snapshot().training.proposalId;
  await f.room.leave('a', 'disconnect');expect(f.snapshot('b').training.phase).toBe('interrupted');expect(f.snapshot('b').training.proposalId).toBe('');
  await f.join('a2', 'a');const next = f.snapshot('b');expect(next.matchId).not.toBe(first.matchId);
  await f.room.event('b', { type: 'training-respond', matchId: first.matchId, proposalId: departed, accept: true });
  expect(f.snapshot('b').matchId).toBe(next.matchId);expect(f.snapshot('b').confirmedFrame).toBe(-1);
});

test('reserved training partner recovery preserves the attempt and confirmed timeline until timeout', async () => {
  const f = fixture();await f.join('a');await f.join('b');const initial = f.snapshot();
  await f.room.input('a', f.input(initial.matchId));await f.room.input('b', f.input(initial.matchId));
  const before = f.snapshot(), player = f.room.ctx.players.get('a')!;player.reconnectUntil = 10000;
  const recovering = f.snapshot('b');expect(recovering.status).toBe('recovering');expect(recovering.training.phase).toBe('playing');
  expect(recovering.matchId).toBe(before.matchId);expect(recovering.training.users).toEqual(before.training.users);expect(recovering.seats).toEqual(before.seats);expect(recovering.confirmedFrame).toBe(0);expect(recovering.frames).toEqual(before.frames);
  delete player.reconnectUntil;expect(f.snapshot('b')).toEqual(before);
  player.reconnectUntil = 20000;await f.room.leave('a', 'reconnect-timeout');const ended = f.snapshot('b');
  expect(ended.status).toBe('interrupted');expect(ended.training.phase).toBe('interrupted');expect(ended.matchId).toBe(before.matchId);
});
