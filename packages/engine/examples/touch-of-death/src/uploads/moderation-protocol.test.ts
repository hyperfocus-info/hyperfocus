import { expect, test } from 'bun:test';
import { moderationText, readModerationCommand, readModerationResponse, readUploadReportMetadata } from './moderation-protocol.ts';

test('moderator commands reject caller identity, stale revisions and unexplained decisions', () => {
  const command = { type: 'moderation-review', requestId: 'request', ownerId: 'alice', uploadId: 'picture', expectedRevision: 1, status: 'rejected', reason: ' Needs removal ' };
  expect(readModerationCommand(command)).toMatchObject({ reason: 'Needs removal' });
  for (const value of [{ ...command, reviewerId: 'forged' }, { ...command, reason: '' }, { ...command, expectedRevision: -1 }, { ...command, status: 'pending' }, { ...command, reason: '\u0344'.repeat(256) }]) expect(() => readModerationCommand(value)).toThrow();
  expect(() => moderationText('\u0344'.repeat(256))).toThrow();
  expect(() => readModerationCommand({ type: 'moderation-resolve', requestId: 'r', reporterId: 'bob', reportId: 'report', expectedRevision: 1, status: 'reviewed', resolution: '' })).toThrow();
});

test('moderator responses bind report identity and reject hidden pixels or mismatched image dimensions', () => {
  const report = { id: 'report', reporterId: 'bob', roomId: 'friends', ownerId: 'alice', uploadId: 'picture', contentId: 'a'.repeat(64), reason: 'other', createdAt: 10, status: 'pending', reviewerId: '', reviewedAt: null, resolution: '' };
  expect(readUploadReportMetadata(report).status).toBe('pending');
  expect(() => readUploadReportMetadata({ ...report, status: 'reviewed', reviewerId: 'mod', reviewedAt: 9, resolution: 'Done' })).toThrow();
  const response = { type: 'moderation-result', requestId: 'one', error: '', owners: [], reporters: [], nextCursor: '', ownerId: '', revision: 1, uploads: [], uploadId: '', raster: null, reporterId: 'bob', reports: [report] };
  expect(readModerationResponse(response).reports).toHaveLength(1);
  for (const value of [{ ...response, reporterId: 'alice' }, { ...response, reports: [report, report] }, { ...response, owners: Array(21).fill('alice') }, { ...response, raster: { width: 1, height: 1, rgba: '/wAA/w==' } }]) expect(() => readModerationResponse(value)).toThrow();
});
