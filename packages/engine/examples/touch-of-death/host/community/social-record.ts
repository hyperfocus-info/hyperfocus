import { communityId, communityRoomId, communityTime } from './validation.ts';
import { readObject, readList, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';

export type SocialReport = { requestId: string; roomId: string; messageId: string; senderId: string; reporterId: string; text: string; createdAt: number; reportedAt: number; reason: 'harassment' | 'spam' | 'inappropriate' | 'other' };
export type SocialRecord = { version: 1; muted: string[]; blocked: string[];
  sends: Array<{ requestId: string; roomId: string; text: string; at: number }>;
  reports: SocialReport[]; edits: Array<{ requestId: string; fingerprint: string }> };

const id = (value: unknown) => { communityId(value);return value; };
const time = (value: unknown) => { communityTime(value);return value; };
const text = (value: unknown) => { socialText(value, 512);return value; };
const fields: ObjectReaders<SocialRecord> = {
  version: value => requireOneOf(value, [1]), muted: value => readList(value, id), blocked: value => readList(value, id),
  sends: value => readList(value, value => readObject(value, { requestId: text, roomId: id, text, at: time })),
  reports: value => readList(value, value => readObject(value, { requestId: text, roomId: id, messageId: text, senderId: id, reporterId: id, text, createdAt: time, reportedAt: time, reason: value => requireOneOf(value, ['harassment', 'spam', 'inappropriate', 'other']) })),
  edits: value => readList(value, value => readObject(value, { requestId: text, fingerprint: text })),
};

export function socialText(value: unknown, maximum: number): asserts value is string {
  if (typeof value !== 'string' || !value || new TextEncoder().encode(value).length > maximum) throw new Error('Invalid stored social text.');
}
function object(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== keys.sort().join()) throw new Error('Invalid social record shape.');
}
function list(value: unknown): asserts value is unknown[] { if (!Array.isArray(value) || value.length > 64) throw new Error('Invalid social record list.'); }
function ids(value: unknown): asserts value is string[] {
  list(value);value.forEach(communityId);if (new Set(value).size !== value.length) throw new Error('Duplicate social preference.');
}
export function readSocialRecord(value: unknown, userId: string): SocialRecord {
  if (value === null) return { version: 1, muted: [], blocked: [], sends: [], reports: [], edits: [] };
  object(value, ['version', 'muted', 'blocked', 'sends', 'reports', 'edits']);
  if (value.version !== 1) throw new Error('Unsupported social record version.');
  ids(value.muted);ids(value.blocked);list(value.sends);list(value.reports);list(value.edits);
  if ([...value.muted, ...value.blocked].includes(userId)) throw new Error('Invalid self communication preference.');
  const requests = new Set<string>(), messages = new Set<string>();
  function request(value: unknown) { socialText(value, 128);if (requests.has(value)) throw new Error('Duplicate social receipt.');requests.add(value); }
  function text(value: unknown) { socialText(value, 512);if (value.length > 280 || value.trim() !== value) throw new Error('Invalid stored chat text.'); }
  for (const send of value.sends) {
    object(send, ['requestId', 'roomId', 'text', 'at']);request(send.requestId);communityRoomId(send.roomId);text(send.text);communityTime(send.at);
  }
  for (const report of value.reports) {
    object(report, ['requestId', 'roomId', 'messageId', 'senderId', 'reporterId', 'text', 'createdAt', 'reportedAt', 'reason']);
    request(report.requestId);communityRoomId(report.roomId);communityId(report.senderId);communityId(report.reporterId);socialText(report.messageId, 128);
    text(report.text);communityTime(report.createdAt);communityTime(report.reportedAt);
    if (report.reporterId !== userId || !['harassment', 'spam', 'inappropriate', 'other'].includes(String(report.reason)) || messages.has(report.messageId)) throw new Error('Invalid stored report.');
    messages.add(report.messageId);
  }
  for (const edit of value.edits) { object(edit, ['requestId', 'fingerprint']);request(edit.requestId);socialText(edit.fingerprint, 512); }
  return structuredClone(readObject(value, fields));
}
