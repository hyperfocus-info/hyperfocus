import { expect, test } from 'bun:test';
import { requireRecord } from '@hyperfocus/utilities/records';
import { requireArray } from '@hyperfocus/utilities/validation';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createDurableMmoServices, createMemoryDurableServiceStore } from '@hyperfocus/engine/server';
import { createSqliteDurableServiceStore } from '@hyperfocus/engine/server';
import { createSqlitePersistenceAdapter } from '@hyperfocus/engine/server';
import { readSocialSnapshot } from '../../src/network/social-protocol.ts';
import { createRoomSocialService } from './social.ts';
import { createUploadService } from '../uploads/service.ts';

async function fixture() {
  let time = 1000, failSave = false;
  const records = new Map<string, unknown>();
  const services = createDurableMmoServices(createMemoryDurableServiceStore(), { now: () => time, maxChatMessagesPerChannel: 32, maxChatMessageLength: 280 });
  const persistence = { async loadPlayer(id: string) { return structuredClone(records.get(id) ?? null); },
    async savePlayer(id: string, record: unknown) { if (failSave) throw new Error('disk unavailable');records.set(id, structuredClone(record)); } };
  const social = createRoomSocialService({ services, persistence, now: () => time });
  for (const roomId of ['one', 'two']) for (const userId of ['alice', 'bob']) await social.join({ roomId, userId });
  const handle = (userId: string, command: unknown, roomId = 'one') => social.handle({ roomId, userId, command });
  const view = (userId: string, roomId = 'one') => readSocialSnapshot(social.view({ roomId, userId }));
  return { social, services, persistence, records, handle, view, advance(ms: number) { time += ms; }, set failSave(value: boolean) { failSave = value; }, get failSave() { return failSave; } };
}
const send = (requestId: string, text = requestId) => ({ type: 'social-send', requestId, text });

test('leaving and disposing revoke authenticated image access without erasing other rooms or durable preferences', async () => {
  const f = await fixture();
  const uploads = createUploadService({ persistence: f.persistence, allowView: ({ roomId, ownerId, viewerId }) => f.social.allowCommunication({ roomId, userId: viewerId, otherUserId: ownerId }) });
  const submitted = await uploads.submit({ ownerId: 'alice', requestId: 'picture', expectedRevision: 0, raster: { width: 1, height: 1, rgba: '/wAA/w==' } });
  const uploadId = submitted.uploads[0]!.id;
  await uploads.review({ ownerId: 'alice', requestId: 'approve', expectedRevision: 1, uploadId, reviewerId: 'host', status: 'approved', reason: '' });
  const read = (roomId = 'one') => uploads.readWithList({ roomId, ownerId: 'alice', viewerId: 'bob', uploadId });
  expect((await read()).image).not.toBeNull();
  await f.social.leave({ roomId: 'one', userId: 'alice' });
  expect((await read()).image).toBeNull();expect((await read('two')).image).not.toBeNull();
  await expect(f.handle('alice', send('departed'))).rejects.toThrow('Join');
  await f.social.join({ roomId: 'one', userId: 'alice' });expect((await read()).image).not.toBeNull();
  await f.handle('bob', { type: 'social-block', requestId: 'block', targetId: 'alice', enabled: true });
  f.failSave = true;await f.social.dispose({ roomId: 'one' });
  expect(() => f.view('bob')).toThrow('Join');expect(f.view('bob', 'two').blocked).toEqual(['alice']);
  await f.social.join({ roomId: 'one', userId: 'bob' });await f.social.join({ roomId: 'one', userId: 'alice' });
  expect(f.view('bob').blocked).toEqual(['alice']);expect((await read()).image).toBeNull();
  await f.social.dispose({ roomId: 'one' });await f.social.dispose({ roomId: 'two' });
  for (let index = 0; index < 130; index++) { const roomId = `temporary-${index}`;await f.social.join({ roomId, userId: 'alice' });await f.social.leave({ roomId, userId: 'alice' }); }
});

test('authenticated chat rejects aliases, bounds rate and text, and retries without duplicate messages or rate charges', async () => {
  const f = await fixture();
  expect(() => f.handle('alice', { ...send('spoof'), senderId: 'bob' })).toThrow();
  expect(() => f.handle('alice', send('long', 'a'.repeat(281)))).toThrow();
  expect(() => f.handle('alice', send('bytes', '界'.repeat(180)))).toThrow();
  for (let index = 0; index < 4; index++) expect((await f.handle('alice', send(`m${index}`))).error).toBe('');
  expect((await f.handle('alice', send('m0'))).messages).toHaveLength(4);
  expect((await f.handle('alice', send('m0', 'changed'))).error).toContain('already used');
  expect((await f.handle('alice', send('fifth'))).error).toContain('Wait');
  expect(f.view('bob').messages.every(message => message.senderId === 'alice')).toBe(true);
  f.advance(10000);expect((await f.handle('alice', send('fifth'))).messages).toHaveLength(5);
  await f.services.moderation.record({ targetId: 'alice', moderatorId: 'host', kind: 'mute' }, 'mod-mute');
  expect((await f.handle('alice', send('moderated'))).error).toContain('muted');expect(f.view('bob').messages).toHaveLength(5);
});

test('failed preference writes preserve filtering and durable blocks hide both directions across rooms', async () => {
  const f = await fixture();await f.handle('alice', send('hello'));await f.handle('alice', send('elsewhere'), 'two');
  f.failSave = true;expect((await f.handle('bob', { type: 'social-mute', requestId: 'mute', targetId: 'alice', enabled: true })).error).toContain('Could not save');
  expect(f.view('bob').muted).toEqual([]);expect(f.view('bob').messages).toHaveLength(1);
  f.failSave = false;await f.handle('bob', { type: 'social-mute', requestId: 'mute', targetId: 'alice', enabled: true });
  expect(f.view('bob').messages).toEqual([]);expect(f.view('bob', 'two').messages).toEqual([]);
  await f.handle('bob', { type: 'social-mute', requestId: 'unmute', targetId: 'alice', enabled: false });
  await f.handle('bob', { type: 'social-block', requestId: 'block', targetId: 'alice', enabled: true });
  await f.handle('bob', send('reply'));await f.handle('bob', send('other-reply'), 'two');
  expect(f.view('alice').messages.map(message => message.senderId)).toEqual(['alice']);
  expect(f.view('alice', 'two').messages.map(message => message.senderId)).toEqual(['alice']);
  expect(f.view('bob').messages.map(message => message.senderId)).toEqual(['bob']);
  await f.handle('alice', send('future'));expect(f.view('bob').messages.map(message => message.senderId)).toEqual(['bob']);
  const copy = f.view('bob');copy.blocked.length = 0;expect(f.view('bob').blocked).toEqual(['alice']);
});

test('reports retain actual quoted evidence once and failed writes neither acknowledge nor publish preferences', async () => {
  const f = await fixture();const message = (await f.handle('alice', send('actual', 'Please leave.'))).messages[0]!;
  const command = { type: 'social-report', requestId: 'report', messageId: message.id, reason: 'harassment' };
  expect((await f.handle('bob', { ...command, messageId: 'unknown' })).error).toContain('retained');
  f.failSave = true;expect((await f.handle('bob', command)).reported).toEqual([]);
  f.failSave = false;const result = await f.handle('bob', command);
  expect(result.reported).toEqual([message.id]);expect(result.notice).toContain('not been reviewed');
  await f.handle('bob', command);const reports = requireArray(requireRecord(f.records.get('tod-social:bob')).reports);expect(reports).toHaveLength(1);
  expect(reports[0]).toMatchObject({ reporterId: 'bob', senderId: 'alice', text: 'Please leave.', messageId: message.id, roomId: 'one' });
  expect((await f.handle('bob', { ...command, reason: 'spam' })).error).toContain('already used');
});

test('uncertain chat commit retries its reserved request without an extra rate slot', async () => {
  const f = await fixture();let uncertain = true;
  const social = createRoomSocialService({ services: { chat: { ...f.services.chat,
    async send(...args) { const message = await f.services.chat.send(...args);if (uncertain) { uncertain = false;throw new Error('connection lost after commit'); }return message; },
  } }, persistence: f.persistence, now: () => 1000 });
  await social.join({ roomId: 'one', userId: 'alice' });
  const handle = (command: unknown) => social.handle({ roomId: 'one', userId: 'alice', command });
  expect((await handle(send('uncertain'))).error).toContain('same request');
  expect((await handle(send('uncertain'))).messages).toHaveLength(1);
  for (let index = 0; index < 3; index++) expect((await handle(send(`new-${index}`))).error).toBe('');
  expect((await handle(send('fifth'))).error).toContain('Wait');
  expect((await f.services.chat.history('tod-chat:one')).items).toHaveLength(4);
});

test('history remains bounded and malformed persisted preferences fail before publication', async () => {
  const f = await fixture();
  for (let index = 0; index < 37; index++) { f.advance(10000);await f.handle('alice', send(`retained-${index}`)); }
  expect(f.view('bob').messages).toHaveLength(32);
  expect(f.view('bob').messages[0]!.text).toBe('retained-5');
  expect((await f.services.chat.history('tod-chat:one', { limit: 32 })).items).toHaveLength(32);
  f.records.set('tod-social:cara', { version: 1, muted: ['alice', 'alice'], blocked: [], reports: [], sends: [], edits: [] });
  await expect(f.social.join({ roomId: 'one', userId: 'cara' })).rejects.toThrow('Duplicate');
  expect(() => f.social.view({ roomId: 'one', userId: 'cara' })).toThrow('Join');
});

test('SQLite reopen preserves chat idempotency, report evidence and bilateral blocks before first view', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tod-social-')), path = join(directory, 'community.sqlite');
  let store = createSqliteDurableServiceStore({ path }), persistence = createSqlitePersistenceAdapter({ path });
  const make = () => createRoomSocialService({ services: createDurableMmoServices(store, { now: () => 1000, maxChatMessagesPerChannel: 32, maxChatMessageLength: 280 }), persistence, now: () => 1000 });
  try {
    let social = make();await social.join({ roomId: 'one', userId: 'alice' });await social.join({ roomId: 'one', userId: 'bob' });
    const message = (await social.handle({ roomId: 'one', userId: 'bob', command: send('once') })).messages[0]!;
    await social.handle({ roomId: 'one', userId: 'alice', command: { type: 'social-report', requestId: 'report', messageId: message.id, reason: 'spam' } });
    await social.handle({ roomId: 'one', userId: 'bob', command: { type: 'social-block', requestId: 'block', targetId: 'alice', enabled: true } });
    store.close();persistence.close();store = createSqliteDurableServiceStore({ path });persistence = createSqlitePersistenceAdapter({ path });social = make();
    const alice = await social.join({ roomId: 'one', userId: 'alice' });expect(alice.messages).toEqual([]);expect(alice.reported).toEqual([message.id]);
    await social.join({ roomId: 'one', userId: 'bob' });
    const replay = await social.handle({ roomId: 'one', userId: 'bob', command: send('once') });expect(replay.messages).toHaveLength(1);
    for (let index = 0; index < 3; index++) expect((await social.handle({ roomId: 'one', userId: 'bob', command: send(`more-${index}`) })).error).toBe('');
    expect((await social.handle({ roomId: 'one', userId: 'bob', command: send('too-many') })).error).toContain('Wait');
  } finally {
    store.close();persistence.close();
    if (resolve(dirname(directory)) !== resolve(tmpdir()) || !directory.includes('tod-social-')) throw new Error('Unsafe temporary test directory.');
    await rm(directory, { recursive: true, force: true });
  }
});
