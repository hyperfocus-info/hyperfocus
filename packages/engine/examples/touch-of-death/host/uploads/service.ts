import type { PersistenceAdapter } from '@hyperfocus/engine/server';
import { readUploadRaster } from '../../src/uploads/raster.ts';
import { readUploadEquipment } from '../../src/uploads/protocol.ts';

export type UploadMetadata = { id: string; contentId: string; width: number; height: number; status: 'pending' | 'approved' | 'rejected'; createdAt: number; reviewedAt: number | null; reviewerId: string; reason: string };
export type UploadList = { revision: number; uploads: UploadMetadata[]; equipment: Record<string, string> };
type StoredUpload = UploadMetadata & { rgba: string | null };
type Receipt = { key: string; fingerprint: string; result: UploadList };
type RecordData = { version: 1; ownerId: string; revision: number; uploads: StoredUpload[]; equipment: Record<string, string>; receipts: Receipt[]; activity: number[]; submissions: number[] };
const encoder = new TextEncoder();
function object(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).some(key => typeof key !== 'string' || !('value' in Object.getOwnPropertyDescriptor(value, key)!))
    || Object.keys(value).sort().join() !== [...keys].sort().join()) throw new Error('Invalid upload record fields.');
}
function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || encoder.encode(value).length > 128 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) throw new Error('Invalid upload identity.');
}
function integer(value: unknown, maximum = Number.MAX_SAFE_INTEGER): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error('Invalid upload revision or timestamp.');
}
function reason(value: unknown): string {
  if (typeof value !== 'string' || encoder.encode(value).length > 512 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) throw new Error('Review reasons must be at most 512 bytes without control characters.');
  const normalized = value.trim().normalize('NFC');if (encoder.encode(normalized).length > 512) throw new Error('Review reasons must be at most 512 bytes after normalization.');return normalized;
}
function content(raster: ReturnType<typeof readUploadRaster>): string {
  return new Bun.CryptoHasher('sha256').update(`tod-rgba-v1:${raster.width}:${raster.height}:`).update(Buffer.from(raster.rgba, 'base64')).digest('hex');
}
function metadata(value: StoredUpload): UploadMetadata { const { rgba: _pixels, ...rest } = value;return structuredClone(rest); }
function list(record: RecordData): UploadList { return { revision: record.revision, uploads: record.uploads.map(metadata), equipment: { ...record.equipment } }; }
function clearEquipment(record: RecordData, uploadId: string) { for (const [slotId, equipped] of Object.entries(record.equipment)) if (equipped === uploadId) delete record.equipment[slotId]; }
function visibleEquipment(record: RecordData, uploads: UploadMetadata[]) { return Object.fromEntries(Object.entries(record.equipment).filter(([, uploadId]) => uploads.some(upload => upload.id === uploadId && upload.status !== 'rejected'))); }
function readMetadata(raw: unknown): UploadMetadata {
  object(raw, ['id', 'contentId', 'width', 'height', 'status', 'createdAt', 'reviewedAt', 'reviewerId', 'reason']);id(raw.id);integer(raw.createdAt);
  if (typeof raw.contentId !== 'string' || !/^[a-f0-9]{64}$/.test(raw.contentId) || typeof raw.width !== 'number' || !Number.isInteger(raw.width) || raw.width < 1 || raw.width > 128
    || typeof raw.height !== 'number' || !Number.isInteger(raw.height) || raw.height < 1 || raw.height > 128 || raw.status !== 'pending' && raw.status !== 'approved' && raw.status !== 'rejected') throw new Error('Invalid upload metadata.');
  const reviewReason = reason(raw.reason);
  if (reviewReason !== raw.reason) throw new Error('Stored review reason is not normalized.');
  const reviewedAt = raw.reviewedAt, reviewerId = raw.reviewerId;
  if (raw.status === 'pending') { if (reviewedAt !== null || reviewerId !== '' || raw.reason !== '') throw new Error('Invalid pending review state.'); }
  else { integer(reviewedAt);id(reviewerId);if (reviewedAt < raw.createdAt) throw new Error('Invalid review time.'); }
  if (reviewedAt !== null && typeof reviewedAt !== 'number' || typeof reviewerId !== 'string') throw new Error('Invalid review state.');
  return { ...raw, id: raw.id, contentId: raw.contentId, width: raw.width, height: raw.height, status: raw.status, createdAt: raw.createdAt, reviewedAt, reviewerId, reason: reviewReason };
}
function readList(raw: unknown): UploadList {
  object(raw, ['revision', 'uploads', ...(raw && typeof raw === 'object' && Object.hasOwn(raw, 'equipment') ? ['equipment'] : [])]);integer(raw.revision, 0xffffffff);
  if (!Array.isArray(raw.uploads) || raw.uploads.length > 4) throw new Error('Invalid upload list.');
  const uploads = raw.uploads.map(readMetadata);
  if (new Set(uploads.map(upload => upload.id)).size !== uploads.length || new Set(uploads.map(upload => upload.contentId)).size !== uploads.length) throw new Error('Duplicate upload identity or content.');
  return { revision: raw.revision, uploads, equipment: readUploadEquipment(raw.equipment, uploads) };
}

/** One trusted host owner; callers authenticate owner/viewer/reviewer before invoking these methods. */
export function createUploadService(options: {
  persistence: Pick<PersistenceAdapter, 'loadPlayer' | 'savePlayer'>;
  allowView(input: { roomId: string; ownerId: string; viewerId: string; upload: UploadMetadata }): boolean;
  now?: () => number;
  allowedSlots?: readonly string[];
}) {
  if (typeof options.allowView !== 'function') throw new Error('Upload visibility policy is required.');
  const allowedSlots = new Set(options.allowedSlots ?? []);
  if (allowedSlots.size !== (options.allowedSlots?.length ?? 0) || allowedSlots.size > 32) throw new Error('Invalid uploaded-picture slot allowlist.');
  for (const slot of allowedSlots) { id(slot);if (['__proto__', 'prototype', 'constructor'].includes(slot)) throw new Error('Invalid uploaded-picture slot allowlist.'); }
  let lane: Promise<unknown> = Promise.resolve();
  const listeners = new Set<(ownerId: string) => void>();
  function changed(ownerId: string) { for (const listener of listeners) { try { void Promise.resolve(listener(ownerId)).catch(() => undefined); } catch { /* Observers cannot undo a durable commit. */ } } }
  function serial<T>(operation: () => Promise<T>): Promise<T> { const task = lane.then(operation);lane = task.catch(() => undefined);return task; }
  function now() { const value = (options.now ?? Date.now)();integer(value);return value; }
  async function load(ownerId: string): Promise<RecordData> {
    const raw = await options.persistence.loadPlayer(`tod-uploads:${ownerId}`);
    if (raw === null) return { version: 1, ownerId, revision: 0, uploads: [], equipment: {}, receipts: [], activity: [], submissions: [] };
    object(raw, ['version', 'ownerId', 'revision', 'uploads', 'receipts', 'activity', 'submissions', ...(typeof raw === 'object' && raw && Object.hasOwn(raw, 'equipment') ? ['equipment'] : [])]);
    if (raw.version !== 1 || raw.ownerId !== ownerId || !Array.isArray(raw.uploads) || raw.uploads.length > 4 || !Array.isArray(raw.receipts) || raw.receipts.length > 64) throw new Error('Invalid stored upload owner or version.');
    integer(raw.revision, 0xffffffff);const revision = raw.revision;
    const uploads = raw.uploads.map(value => {
      object(value, ['id', 'contentId', 'width', 'height', 'status', 'createdAt', 'reviewedAt', 'reviewerId', 'reason', 'rgba']);
      const { rgba, ...rest } = value, meta = readMetadata(rest);
      if (meta.status === 'rejected') { if (rgba !== null) throw new Error('Rejected upload retained pixels.');return { ...meta, rgba }; }
      const raster = readUploadRaster({ width: meta.width, height: meta.height, rgba });if (content(raster) !== meta.contentId) throw new Error('Upload pixels do not match content identity.');
      return { ...meta, rgba: raster.rgba };
    });
    const equipment = readList({ revision: raw.revision, uploads: uploads.map(metadata), equipment: raw.equipment }).equipment;
    const seen = new Set<string>(), receipts = raw.receipts.map(value => {
      object(value, ['key', 'fingerprint', 'result']);if (typeof value.key !== 'string' || encoder.encode(value.key).length > 512 || seen.has(value.key) || typeof value.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.fingerprint)) throw new Error('Invalid upload receipt.');
      seen.add(value.key);const result = readList(value.result);if (result.revision > revision) throw new Error('Future upload receipt.');return { key: value.key, fingerprint: value.fingerprint, result };
    });
    if (!Array.isArray(raw.activity) || raw.activity.length > 20 || !Array.isArray(raw.submissions) || raw.submissions.length > 4) throw new Error('Invalid upload rate history.');
    const activity = raw.activity.map(value => { integer(value);return value; });
    const submissions = raw.submissions.map(value => { integer(value);return value; });
    return { version: 1, ownerId, revision, uploads, equipment, receipts, activity, submissions };
  }
  function mutate(input: { ownerId: string; requestId: string; expectedRevision: number }, scope: string, payload: unknown, operation: (record: RecordData, time: number) => void): Promise<UploadList> {
    input = { ...input };
    id(input.ownerId);id(input.requestId);integer(input.expectedRevision, 0xffffffff);
    const key = new Bun.CryptoHasher('sha256').update(JSON.stringify([scope, input.requestId])).digest('hex'), fingerprint = new Bun.CryptoHasher('sha256').update(JSON.stringify(payload)).digest('hex');
    return serial(async () => {
      const before = await load(input.ownerId), prior = before.receipts.find(receipt => receipt.key === key);
      if (prior) { if (prior.fingerprint !== fingerprint) throw new Error('That upload request ID was already used for another action.');changed(input.ownerId);return structuredClone(prior.result); }
      if (before.revision !== input.expectedRevision) throw new Error('Uploads changed. Reload before trying again.');
      if (before.revision === 0xffffffff) throw new Error('Upload revision limit reached.');
      const time = now(), next = structuredClone(before);
      next.activity = next.activity.filter(at => time - at < 60000);next.submissions = next.submissions.filter(at => time - at < 60000);
      if (scope === 'owner' && next.activity.length >= 20) throw new Error('Too many upload changes. Try again in a minute.');
      operation(next, time);if (scope === 'owner') next.activity.push(time);next.revision++;
      const result = list(next);next.receipts = [...next.receipts, { key, fingerprint, result }].slice(-64);
      await options.persistence.savePlayer(`tod-uploads:${input.ownerId}`, structuredClone(next));changed(input.ownerId);return structuredClone(result);
    });
  }
  return {
    supportsSlot({ slotId }: { slotId: string }): boolean { return allowedSlots.has(slotId); },
    onChange(listener: (ownerId: string) => void) { listeners.add(listener);return () => { listeners.delete(listener); }; },
    list({ ownerId }: { ownerId: string }): Promise<UploadList> { id(ownerId);return serial(async () => list(await load(ownerId))); },
    listForViewer({ ownerId, viewerId, roomId }: { ownerId: string; viewerId: string; roomId: string }): Promise<UploadList> {
      id(ownerId);id(viewerId);id(roomId);
      return serial(async () => {
        const record = await load(ownerId);if (ownerId === viewerId) return list(record);
        const uploads = record.uploads.filter(upload => upload.status !== 'rejected'
          && options.allowView({ roomId, ownerId, viewerId, upload: metadata(upload) }) === true).map(metadata);
        return { revision: 0, uploads, equipment: visibleEquipment(record, uploads) };
      });
    },
    readWithList({ ownerId, viewerId, uploadId, roomId }: { ownerId: string; viewerId: string; uploadId: string; roomId: string }) {
      id(ownerId);id(viewerId);id(uploadId);id(roomId);
      return serial(async () => {
        const record = await load(ownerId), visible = record.uploads.filter(upload => viewerId === ownerId
          || upload.status !== 'rejected' && options.allowView({ roomId, ownerId, viewerId, upload: metadata(upload) }) === true);
        const upload = visible.find(upload => upload.id === uploadId);
        return { revision: viewerId === ownerId ? record.revision : 0, uploads: visible.map(metadata), equipment: visibleEquipment(record, visible),
          image: !upload || upload.rgba === null || upload.status === 'rejected' ? null : { upload: metadata(upload), raster: readUploadRaster({ width: upload.width, height: upload.height, rgba: upload.rgba }) } };
      });
    },
    submit(input: { ownerId: string; requestId: string; expectedRevision: number; raster: unknown }): Promise<UploadList> {
      const raster = readUploadRaster(input.raster), contentId = content(raster);
      return mutate(input, 'owner', { type: 'submit', expectedRevision: input.expectedRevision, contentId }, (record, time) => {
        if (record.uploads.some(upload => upload.contentId === contentId)) return;
        if (record.uploads.length >= 4) throw new Error('Keep at most four uploads. Remove one before adding another.');
        if (record.submissions.length >= 4) throw new Error('Upload at most four new images per minute.');
        record.submissions.push(time);record.uploads.push({ id: crypto.randomUUID(), contentId, ...raster, status: 'pending', createdAt: time, reviewedAt: null, reviewerId: '', reason: '' });
      });
    },
    remove(input: { ownerId: string; requestId: string; expectedRevision: number; uploadId: string }): Promise<UploadList> {
      input = { ...input };
      id(input.uploadId);return mutate(input, 'owner', { type: 'remove', expectedRevision: input.expectedRevision, uploadId: input.uploadId }, record => {
        if (!record.uploads.some(upload => upload.id === input.uploadId)) throw new Error('Upload does not belong to this owner.');record.uploads = record.uploads.filter(upload => upload.id !== input.uploadId);clearEquipment(record, input.uploadId);
      });
    },
    equip(input: { ownerId: string; requestId: string; expectedRevision: number; slotId: string; uploadId: string }): Promise<UploadList> {
      input = { ...input };id(input.slotId);if (input.uploadId !== '') id(input.uploadId);
      if (!allowedSlots.has(input.slotId)) throw new Error('This uploaded-picture slot is unavailable.');
      return mutate(input, 'owner', { type: 'equip', expectedRevision: input.expectedRevision, slotId: input.slotId, uploadId: input.uploadId }, record => {
        if (!input.uploadId) { delete record.equipment[input.slotId];return; }
        if (!record.uploads.some(upload => upload.id === input.uploadId && upload.status !== 'rejected')) throw new Error('Only your available pictures can be equipped.');
        if (!Object.hasOwn(record.equipment, input.slotId) && Object.keys(record.equipment).length >= 4) throw new Error('Equip at most four uploaded pictures.');
        Object.defineProperty(record.equipment, input.slotId, { value: input.uploadId, enumerable: true, configurable: true, writable: true });
      });
    },
    review(input: { ownerId: string; reviewerId: string; requestId: string; expectedRevision: number; uploadId: string; status: 'approved' | 'rejected'; reason: string }): Promise<UploadList> {
      input = { ...input };
      id(input.reviewerId);id(input.uploadId);const reviewReason = reason(input.reason);
      if (!['approved', 'rejected'].includes(input.status)) throw new Error('Invalid trusted review decision.');
      return mutate(input, `review:${input.reviewerId}`, { type: 'review', expectedRevision: input.expectedRevision, uploadId: input.uploadId, status: input.status, reason: reviewReason }, (record, time) => {
        const upload = record.uploads.find(upload => upload.id === input.uploadId);if (!upload) throw new Error('Upload does not belong to this owner.');
        if (input.status === 'approved' && upload.rgba === null) throw new Error('Rejected pixels were removed. A new upload is required.');
        if (time < upload.createdAt) throw new Error('Review clock precedes upload creation.');
        upload.status = input.status;upload.reviewedAt = time;upload.reviewerId = input.reviewerId;upload.reason = reviewReason;if (input.status === 'rejected') { upload.rgba = null;clearEquipment(record, input.uploadId); }
      });
    },
    read({ ownerId, viewerId, uploadId, roomId }: { ownerId: string; viewerId: string; uploadId: string; roomId: string }) {
      id(ownerId);id(viewerId);id(uploadId);id(roomId);
      return serial(async () => {
        const upload = (await load(ownerId)).uploads.find(upload => upload.id === uploadId);
        if (!upload || upload.rgba === null || upload.status === 'rejected') return null;
        if (viewerId !== ownerId && options.allowView({ roomId, ownerId, viewerId, upload: metadata(upload) }) !== true) return null;
        return { upload: metadata(upload), raster: readUploadRaster({ width: upload.width, height: upload.height, rgba: upload.rgba }) };
      });
    },
  };
}
