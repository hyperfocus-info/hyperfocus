import type { PersistenceAdapter } from '@hyperfocus/engine/server';
import type { createUploadService } from './service.ts';
import { readUploadReportMetadata, type UploadReportMetadata } from '../../src/uploads/moderation-protocol.ts';

export type UploadImageReport = UploadReportMetadata;
type Result = { revision: number; report: UploadImageReport };
type Receipt = { key: string; fingerprint: string; result: Result };
type RecordData = { version: 1; reporterId: string; revision: number; reports: UploadImageReport[]; receipts: Receipt[]; submissions: number[] };
const encoder = new TextEncoder();
function object(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !('value' in Object.getOwnPropertyDescriptor(value, key)!))
    || Object.keys(value).sort().join() !== [...keys].sort().join()) throw new Error('Invalid image report fields.');
}
function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || encoder.encode(value).length > 128 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) throw new Error('Invalid report identity.');
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) throw new Error('Invalid report revision or timestamp.');
}
function resolution(value: unknown): string {
  if (typeof value !== 'string' || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) throw new Error('Invalid report resolution.');
  const normalized = value.trim().normalize('NFC');if (!normalized || encoder.encode(normalized).length > 512) throw new Error('Provide a resolution of 1–512 bytes.');return normalized;
}
function readReport(value: unknown, reporterId: string): UploadImageReport {
  object(value, ['id', 'reporterId', 'roomId', 'ownerId', 'uploadId', 'contentId', 'reason', 'createdAt', 'status', 'reviewerId', 'reviewedAt', 'resolution']);
  for (const key of ['id', 'reporterId', 'roomId', 'ownerId', 'uploadId']) id(value[key]);integer(value.createdAt);
  if (value.reporterId !== reporterId || value.ownerId === reporterId || typeof value.contentId !== 'string' || !/^[a-f0-9]{64}$/.test(value.contentId)
    || !['harassment', 'inappropriate', 'copyright', 'other'].some(reason => reason === value.reason) || !['pending', 'reviewed', 'dismissed'].some(status => status === value.status)) throw new Error('Invalid stored report identity or state.');
  if (value.status === 'pending') { if (value.reviewerId !== '' || value.reviewedAt !== null || value.resolution !== '') throw new Error('Pending report has a resolution.'); }
  else { id(value.reviewerId);integer(value.reviewedAt);if (value.reviewedAt < value.createdAt || resolution(value.resolution) !== value.resolution) throw new Error('Invalid stored report resolution.'); }
  return readUploadReportMetadata(value);
}
function hash(value: unknown): string { return new Bun.CryptoHasher('sha256').update(JSON.stringify(value)).digest('hex'); }

/** Authenticated caller identities and moderator authority are supplied by the host, never report payloads. */
export function createUploadReportService(options: {
  persistence: Pick<PersistenceAdapter, 'loadPlayer' | 'savePlayer'>;
  uploads: Pick<ReturnType<typeof createUploadService>, 'readWithList'>;
  now?: () => number;
}) {
  let lane: Promise<unknown> = Promise.resolve();
  function serial<T>(operation: () => Promise<T>) { const task = lane.then(operation);lane = task.catch(() => undefined);return task; }
  function now() { const value = (options.now ?? Date.now)();integer(value);return value; }
  async function load(reporterId: string): Promise<RecordData> {
    const raw = await options.persistence.loadPlayer(`tod-upload-reports:${reporterId}`);
    if (raw === null) return { version: 1, reporterId, revision: 0, reports: [], receipts: [], submissions: [] };
    object(raw, ['version', 'reporterId', 'revision', 'reports', 'receipts', 'submissions']);integer(raw.revision, 0xffffffff);const revision = raw.revision;
    if (raw.version !== 1 || raw.reporterId !== reporterId || !Array.isArray(raw.reports) || raw.reports.length > 64 || !Array.isArray(raw.receipts) || raw.receipts.length > 64
      || !Array.isArray(raw.submissions) || raw.submissions.length > 4) throw new Error('Invalid stored image report record.');
    const reports = raw.reports.map(value => readReport(value, reporterId));
    if (new Set(reports.map(report => report.id)).size !== reports.length || new Set(reports.map(report => JSON.stringify([report.ownerId, report.uploadId]))).size !== reports.length) throw new Error('Duplicate stored image report.');
    const seen = new Set<string>(), receipts = raw.receipts.map(value => {
      object(value, ['key', 'fingerprint', 'result']);
      if (typeof value.key !== 'string' || !/^[a-f0-9]{64}$/.test(value.key) || seen.has(value.key) || typeof value.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.fingerprint)) throw new Error('Invalid report receipt.');
      seen.add(value.key);object(value.result, ['revision', 'report']);integer(value.result.revision, revision);
      const report = readReport(value.result.report, reporterId);
      if (!reports.some(current => current.id === report.id && current.contentId === report.contentId && current.ownerId === report.ownerId && current.uploadId === report.uploadId
        && current.roomId === report.roomId && current.reason === report.reason && current.createdAt === report.createdAt)) throw new Error('Report receipt has no evidence.');
      return { key: value.key, fingerprint: value.fingerprint, result: { revision: value.result.revision, report } };
    });
    const submissions = raw.submissions.map(value => { integer(value);return value; });return { version: 1, reporterId, revision, reports, receipts, submissions };
  }
  async function commit(record: RecordData, key: string, fingerprint: string, report: UploadImageReport): Promise<Result> {
    if (record.revision === 0xffffffff) throw new Error('Report revision limit reached.');
    record.revision++;const result = { revision: record.revision, report: structuredClone(report) };
    record.receipts = [...record.receipts, { key, fingerprint, result }].slice(-64);
    await options.persistence.savePlayer(`tod-upload-reports:${record.reporterId}`, structuredClone(record));return structuredClone(result);
  }
  function prior(record: RecordData, key: string, fingerprint: string) {
    const receipt = record.receipts.find(value => value.key === key);
    if (receipt && receipt.fingerprint !== fingerprint) throw new Error('That report request ID was already used for another action.');return receipt?.result;
  }
  return {
    list({ reporterId }: { reporterId: string }) { id(reporterId);return serial(async () => { const record = await load(reporterId);return { revision: record.revision, reports: structuredClone(record.reports) }; }); },
    report(input: { reporterId: string; roomId: string; ownerId: string; uploadId: string; reason: UploadImageReport['reason']; requestId: string }): Promise<UploadImageReport> {
      input = { ...input };for (const value of [input.reporterId, input.roomId, input.ownerId, input.uploadId, input.requestId]) id(value);
      if (input.reporterId === input.ownerId) throw new Error('You cannot report your own image.');
      if (!['harassment', 'inappropriate', 'copyright', 'other'].includes(input.reason)) throw new Error('Choose an available image report reason.');
      const key = hash(['report', input.requestId]), fingerprint = hash([input.roomId, input.ownerId, input.uploadId, input.reason]);
      return serial(async () => {
        const record = await load(input.reporterId), receipt = prior(record, key, fingerprint);if (receipt) return structuredClone(receipt.report);
        const image = (await options.uploads.readWithList({ ownerId: input.ownerId, viewerId: input.reporterId, uploadId: input.uploadId, roomId: input.roomId })).image;
        if (!image) throw new Error('Only an image visible in this room can be reported.');
        const existing = record.reports.find(report => report.ownerId === input.ownerId && report.uploadId === input.uploadId);
        if (existing && existing.reason !== input.reason) throw new Error('You already reported this image for another reason.');
        if (existing) return (await commit(record, key, fingerprint, existing)).report;
        if (record.reports.length >= 64) throw new Error('Your image report limit has been reached. Existing reports are retained.');
        const time = now();record.submissions = record.submissions.filter(at => time - at < 60000);
        if (record.submissions.length >= 4) throw new Error('Report at most four new images per minute.');
        const report: UploadImageReport = { id: crypto.randomUUID(), reporterId: input.reporterId, roomId: input.roomId, ownerId: input.ownerId, uploadId: input.uploadId,
          contentId: image.upload.contentId, reason: input.reason, createdAt: time, status: 'pending', reviewerId: '', reviewedAt: null, resolution: '' };
        record.reports.push(report);record.submissions.push(time);return (await commit(record, key, fingerprint, report)).report;
      });
    },
    resolve(input: { reporterId: string; reportId: string; expectedRevision: number; reviewerId: string; requestId: string; status: 'reviewed' | 'dismissed'; resolution: string }): Promise<Result> {
      input = { ...input };for (const value of [input.reporterId, input.reportId, input.reviewerId, input.requestId]) id(value);integer(input.expectedRevision, 0xffffffff);
      if (!['reviewed', 'dismissed'].includes(input.status)) throw new Error('Invalid trusted report resolution status.');
      const explanation = resolution(input.resolution), key = hash(['resolve', input.reviewerId, input.requestId]), fingerprint = hash([input.reportId, input.expectedRevision, input.status, explanation]);
      return serial(async () => {
        const record = await load(input.reporterId), receipt = prior(record, key, fingerprint);if (receipt) return structuredClone(receipt);
        if (record.revision !== input.expectedRevision) throw new Error('Reports changed. Reload before resolving.');
        const report = record.reports.find(report => report.id === input.reportId);if (!report) throw new Error('Report does not belong to this reporter.');
        const time = now();if (time < report.createdAt) throw new Error('Resolution clock precedes report creation.');
        report.status = input.status;report.reviewerId = input.reviewerId;report.reviewedAt = time;report.resolution = explanation;
        return commit(record, key, fingerprint, report);
      });
    },
  };
}
