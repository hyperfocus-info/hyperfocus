import { expect, test } from 'bun:test';
import { defineSchema, decodeDelta, decodeSnapshot, encodeDelta, encodeSnapshot } from '@hyperfocus/engine/protocol';
import { emptySocialSnapshot, readSocialCommand, readSocialSnapshot, socialSnapshotDefinition } from './social-protocol.ts';

test('social controls canonicalize text and admit only bounded identity-free intents', () => {
  expect(readSocialCommand({ type: 'social-send', requestId: 'r1', text: '  Good match!  ' })).toEqual({ type: 'social-send', requestId: 'r1', text: 'Good match!' });
  for (const type of ['social-mute', 'social-block'] as const) expect(readSocialCommand({ type, requestId: 'r2', targetId: 'peer', enabled: true })).toEqual({ type, requestId: 'r2', targetId: 'peer', enabled: true });
  for (const reason of ['harassment', 'spam', 'inappropriate', 'other'] as const) expect(readSocialCommand({ type: 'social-report', requestId: 'r3', messageId: 'm1', reason })).toEqual({ type: 'social-report', requestId: 'r3', messageId: 'm1', reason });
  const send = { type: 'social-send', requestId: 'r1', text: 'hello' };
  for (const invalid of [null, {}, { ...send, senderId: 'someone' }, { ...send, createdAt: 1 }, { ...send, winner: 'me' },
    { ...send, requestId: '' }, { ...send, requestId: 'é'.repeat(65) }, { ...send, text: '  ' }, { ...send, text: 'x'.repeat(281) },
    { ...send, text: '界'.repeat(171) }, { type: 'social-mute', requestId: 'r', targetId: 'p', enabled: 1 },
    { type: 'social-report', requestId: 'r', messageId: 'm', reason: 'free text' }]) expect(() => readSocialCommand(invalid)).toThrow();
  expect(readSocialCommand({ ...send, text: '界'.repeat(170) }).type).toBe('social-send');
});

test('social snapshots detach bounded histories and preferences without requiring historical senders to remain present', () => {
  const source = emptySocialSnapshot();source.messages.push({ id: 'm', senderId: 'departed-peer', text: 'gg', createdAt: 12 });source.muted.push('peer');
  const read = readSocialSnapshot(source);read.messages[0]!.text = 'changed';read.muted.length = 0;
  expect(source.messages[0]!.text).toBe('gg');expect(source.muted).toEqual(['peer']);expect(emptySocialSnapshot()).toEqual(emptySocialSnapshot());
  for (const invalid of [{ ...source, messages: [...source.messages, ...source.messages] }, { ...source, messages: Array(33).fill(source.messages[0]) },
    { ...source, messages: [{ ...source.messages[0], createdAt: Infinity }] }, { ...source, messages: [{ ...source.messages[0], text: '界'.repeat(171) }] },
    { ...source, muted: ['peer', 'peer'] }, { ...source, blocked: Array.from({ length: 65 }, (_, index) => `p${index}`) },
    { ...source, reported: [''] }, { ...source, error: 'x'.repeat(513) }, { ...source, notice: 'x'.repeat(513) }]) expect(() => readSocialSnapshot(invalid)).toThrow();
});

test('social binary metadata round-trips bounded unicode and costs no unchanged delta payload', () => {
  const social = emptySocialSnapshot();social.messages = Array.from({ length: 32 }, (_, index) => ({ id: `m${index}`, senderId: 'peer', text: '界'.repeat(170), createdAt: index }));
  social.muted = Array.from({ length: 64 }, (_, index) => `peer${index}`);social.reported = ['old-message'];
  const schema = defineSchema({ frame: 'u32', social: socialSnapshotDefinition }), base = defineSchema({ frame: 'u32' });
  const before = { frame: 1, social }, after = { frame: 2, social };
  const encoded = encodeSnapshot(schema, before);
  expect(readSocialSnapshot(decodeSnapshot(schema, encoded).social)).toEqual(social);
  const delta = encodeDelta(schema, before, after), plain = encodeDelta(base, { frame: 1 }, { frame: 2 });
  expect(decodeDelta(schema, before, delta)).toEqual(after);expect(delta.byteLength - plain.byteLength).toBeLessThanOrEqual(1);
  expect(encoded.byteLength).toBeLessThan(20000);
  console.info('Unchanged social metadata delta overhead', { bytes: delta.byteLength - plain.byteLength, fullHistoryBytes: encoded.byteLength });
});
