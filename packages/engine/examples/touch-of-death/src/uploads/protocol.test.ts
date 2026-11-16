import { expect, test } from 'bun:test';
import { readUploadCommand, readUploadResponse } from './protocol.ts';

const raster = { width: 1, height: 1, rgba: '/wAA/w==' };
const item = { id: 'one', hash: 'a'.repeat(64), width: 1, height: 1, status: 'pending' as const, reason: '' };
const response = { type: 'upload-result' as const, requestId: 'request', ownerId: 'alice', error: '', revision: 1, uploads: [item], uploadId: 'one', raster };

test('upload commands have exact fields and never accept owner or moderator authority from a client', () => {
  for (const command of [
    { type: 'upload-list', requestId: 'request', ownerId: '' },
    { type: 'upload-read', requestId: 'request', ownerId: 'alice', uploadId: 'one' },
    { type: 'upload-submit', requestId: 'request', expectedRevision: 0, raster },
    { type: 'upload-remove', requestId: 'request', expectedRevision: 1, uploadId: 'one' },
  ] as const) expect(readUploadCommand(command)).toEqual(command);
  for (const command of [
    { type: 'upload-review', requestId: 'request', status: 'approved' },
    { type: 'upload-submit', requestId: 'request', expectedRevision: 0, raster, ownerId: 'bob' },
    { type: 'upload-remove', requestId: 'request', expectedRevision: -1, uploadId: 'one' },
    { type: 'upload-list', requestId: 'request', ownerId: '', roomId: 'elsewhere' },
    { type: 'upload-read', requestId: 'request', ownerId: 'alice', uploadId: '' },
  ]) expect(() => readUploadCommand(command)).toThrow();
});

test('responses bound metadata and bind decoded pixels to an unrejected listed item', () => {
  expect(readUploadResponse(response)).toEqual({ ...response, equipment: {}, emblemEnabled: false });
  expect(readUploadResponse({ ...response, raster: null, uploadId: '' }).raster).toBeNull();
  for (const value of [
    { ...response, uploads: [item, item] }, { ...response, uploads: Array(5).fill(item) },
    { ...response, uploads: [{ ...item, status: 'rejected' }] }, { ...response, uploads: [{ ...item, width: 2 }] },
    { ...response, uploads: [{ ...item, hash: 'not-a-hash' }] }, { ...response, uploadId: 'other' },
    { ...response, error: 'No permission' }, { ...response, ownerId: '' },
    { ...response, url: 'https://example.com' }, { ...response, revision: 0x100000000 },
  ]) expect(() => readUploadResponse(value)).toThrow();
});

test('emblem capability is explicit and malformed flags are rejected', () => {
  expect(readUploadResponse({ ...response, emblemEnabled: true }).emblemEnabled).toBe(true);
  expect(() => readUploadResponse({ ...response, emblemEnabled: 'true' })).toThrow();
});

test('shared unreviewed equipment is accepted while rejected or missing references fail closed', () => {
  const equipment = { 'profile-emblem': item.id, top: item.id };
  expect(readUploadResponse({ ...response, equipment }).equipment).toEqual(equipment);
  for (const uploads of [[], [{ ...item, status: 'rejected' }]]) expect(() => readUploadResponse({ ...response, raster: null, uploadId: '', uploads, equipment })).toThrow('shared');
});
