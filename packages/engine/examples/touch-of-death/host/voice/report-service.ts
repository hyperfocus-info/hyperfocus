import type { PersistenceAdapter } from '@hyperfocus/engine/server';
import { profileId, profileObject } from '../../src/appearance/profile.ts';
import type { VoiceReportReason } from '../../src/network/voice/protocol.ts';
import { readObject, requireOneOf } from '@hyperfocus/utilities/validation';

type IncidentInput = { reporterId: string; roomId: string; reporterSessionId: string; targetId: string; targetSessionId: string; requestId: string; reason: VoiceReportReason };
export type VoiceIncident = IncidentInput & { createdAt: number };
function readInput(value: unknown): IncidentInput {
  profileObject(value, ['reporterId', 'roomId', 'reporterSessionId', 'targetId', 'targetSessionId', 'requestId', 'reason']);
  for (const field of ['reporterId', 'roomId', 'reporterSessionId', 'targetId', 'targetSessionId', 'requestId']) profileId(value[field]);
  if (value.reporterId === value.targetId || !['harassment', 'hate', 'threats', 'other'].some(reason => reason === value.reason)) throw Error('Invalid voice incident.');
  const id = (value: unknown) => { profileId(value);return value; };
  return readObject(value, { reporterId: id, roomId: id, reporterSessionId: id, targetId: id, targetSessionId: id, requestId: id, reason: value => requireOneOf(value, ['harassment', 'hate', 'threats', 'other']) });
}
function timestamp(value: unknown): asserts value is number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw Error('Invalid incident timestamp.'); }
function same(a: IncidentInput, b: IncidentInput) { return Object.keys(b).every(key => Reflect.get(a, key) === Reflect.get(b, key)); }

/** One host owner; caller supplies authenticated, server-observed session evidence. No media is accepted. */
export function createVoiceReportService(options: { persistence: Pick<PersistenceAdapter, 'loadPlayer' | 'savePlayer'>; now?: () => number }) {
  let lane: Promise<unknown> = Promise.resolve();
  function serial<T>(run: () => Promise<T>) { const task = lane.then(run);lane = task.catch(() => undefined);return task; }
  async function load(reporterId: string): Promise<VoiceIncident[]> {
    const raw = await options.persistence.loadPlayer(`tod-voice-reports:${reporterId}`);
    if (raw === null) return [];
    profileObject(raw, ['version', 'reports']);
    if (raw.version !== 1 || !Array.isArray(raw.reports) || raw.reports.length > 64) throw Error('Invalid stored voice incidents.');
    const seen = new Set<string>();
    return raw.reports.map(value => {
      profileObject(value, ['reporterId', 'roomId', 'reporterSessionId', 'targetId', 'targetSessionId', 'requestId', 'reason', 'createdAt']);
      const { createdAt, ...fields } = value, input = readInput(fields);timestamp(createdAt);
      if (input.reporterId !== reporterId || seen.has(input.requestId)) throw Error('Invalid stored incident identity.');
      seen.add(input.requestId);return { ...input, createdAt };
    });
  }
  return {
    receipt({ reporterId, requestId }: { reporterId: string; requestId: string }) { profileId(reporterId);profileId(requestId);return serial(async () => (await load(reporterId)).find(report => report.requestId === requestId)); },
    read({ reporterId }: { reporterId: string }) { profileId(reporterId);return serial(() => load(reporterId)); },
    report(raw: IncidentInput): Promise<VoiceIncident> {
      const input = readInput(raw);
      return serial(async () => {
        const reports = await load(input.reporterId), prior = reports.find(report => report.requestId === input.requestId);
        if (prior) { if (!same(prior, input)) throw Error('That report request ID was already used.');return structuredClone(prior); }
        if (reports.length >= 64) throw Error('Your voice report limit has been reached. Existing reports are retained.');
        const now = (options.now ?? Date.now)();timestamp(now);
        if (reports.filter(report => now - report.createdAt < 60000).length >= 4) throw Error('Report at most four new voice incidents per minute.');
        const report = { ...input, createdAt: now };
        await options.persistence.savePlayer(`tod-voice-reports:${input.reporterId}`, { version: 1, reports: [...reports, report] });
        return structuredClone(report);
      });
    },
  };
}
