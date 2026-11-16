import { profileId, profileObject } from '../appearance/profile.ts';
import { readUploadRaster, type UploadRaster } from './raster.ts';

export const imageReportReasons = ['harassment', 'inappropriate', 'copyright', 'other'] as const;
export type ImageReportReason = typeof imageReportReasons[number];

export type UploadMetadata = { id: string; hash: string; width: number; height: number; status: 'pending' | 'approved' | 'rejected'; reason: string };
export type UploadCommand =
  | { type: 'upload-list'; requestId: string; ownerId: string }
  | { type: 'upload-read'; requestId: string; ownerId: string; uploadId: string }
  | { type: 'upload-report'; requestId: string; ownerId: string; uploadId: string; reason: ImageReportReason }
  | { type: 'upload-submit'; requestId: string; expectedRevision: number; raster: UploadRaster }
  | { type: 'upload-equip'; requestId: string; expectedRevision: number; slotId: string; uploadId: string }
  | { type: 'upload-remove'; requestId: string; expectedRevision: number; uploadId: string };
export type UploadResponse = { type: 'upload-result'; requestId: string; error: string; ownerId: string; revision: number; uploads: UploadMetadata[]; uploadId: string; raster: UploadRaster | null; equipment?: Record<string, string>; emblemEnabled?: boolean };

export function readUploadEquipment(value: unknown, uploads: readonly { id: string; status: string }[]): Record<string, string> {
  if (value === undefined) return {};
  profileObject(value);
  if (Object.keys(value).length > 4) throw new Error('Equip at most four uploaded pictures.');
  return Object.fromEntries(Object.entries(value).map(([slotId, uploadId]) => {
    profileId(slotId);profileId(uploadId);
    if (!uploads.some(upload => upload.id === uploadId && (upload.status === 'pending' || upload.status === 'approved'))) throw new Error('Equipment must reference a shared picture in this list.');
    return [slotId, uploadId];
  }));
}

export function readUploadInvalidation(value: unknown): { type: 'upload-invalidate'; ownerId: string } {
  profileObject(value, ['type', 'ownerId']);profileId(value.ownerId);
  if (value.type !== 'upload-invalidate') throw new Error('Invalid upload invalidation.');
  return { type: value.type, ownerId: value.ownerId };
}

export function readUploadRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new Error('Invalid upload revision.');
  return value;
}
function owner(value: unknown): string { if (value === '') return '';profileId(value);return value; }
function text(value: unknown): string {
  if (typeof value !== 'string' || new TextEncoder().encode(value).length > 512 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) throw new Error('Invalid upload message.');
  return value;
}
export function readUploadCommand(value: unknown): UploadCommand {
  profileObject(value);profileId(value.requestId);
  if (value.type === 'upload-equip') {
    profileObject(value, ['type', 'requestId', 'expectedRevision', 'slotId', 'uploadId']);profileId(value.slotId);
    return { type: value.type, requestId: value.requestId, expectedRevision: readUploadRevision(value.expectedRevision), slotId: value.slotId, uploadId: owner(value.uploadId) };
  }
  if (value.type === 'upload-list') {
    profileObject(value, ['type', 'requestId', 'ownerId']);return { type: value.type, requestId: value.requestId, ownerId: owner(value.ownerId) };
  }
  if (value.type === 'upload-read') {
    profileObject(value, ['type', 'requestId', 'ownerId', 'uploadId']);profileId(value.uploadId);
    return { type: value.type, requestId: value.requestId, ownerId: owner(value.ownerId), uploadId: value.uploadId };
  }
  if (value.type === 'upload-report') {
    profileObject(value, ['type', 'requestId', 'ownerId', 'uploadId', 'reason']);profileId(value.ownerId);profileId(value.uploadId);
    const reason = imageReportReasons.find(reason => reason === value.reason);if (!reason) throw new Error('Choose an image report reason.');
    return { type: value.type, requestId: value.requestId, ownerId: value.ownerId, uploadId: value.uploadId, reason };
  }
  if (value.type === 'upload-submit') {
    profileObject(value, ['type', 'requestId', 'expectedRevision', 'raster']);
    return { type: value.type, requestId: value.requestId, expectedRevision: readUploadRevision(value.expectedRevision), raster: readUploadRaster(value.raster) };
  }
  if (value.type === 'upload-remove') {
    profileObject(value, ['type', 'requestId', 'expectedRevision', 'uploadId']);profileId(value.uploadId);
    return { type: value.type, requestId: value.requestId, expectedRevision: readUploadRevision(value.expectedRevision), uploadId: value.uploadId };
  }
  throw new Error('Invalid upload command.');
}
export function readUploadMetadata(value: unknown): UploadMetadata {
  profileObject(value, ['id', 'hash', 'width', 'height', 'status', 'reason']);profileId(value.id);
  if (typeof value.hash !== 'string' || !/^[a-f0-9]{64}$/.test(value.hash)
    || typeof value.width !== 'number' || !Number.isInteger(value.width) || value.width < 1 || value.width > 128
    || typeof value.height !== 'number' || !Number.isInteger(value.height) || value.height < 1 || value.height > 128) throw new Error('Invalid upload metadata.');
  if (value.status !== 'pending' && value.status !== 'approved' && value.status !== 'rejected') throw new Error('Invalid upload status.');
  return { id: value.id, hash: value.hash, width: value.width, height: value.height, status: value.status, reason: text(value.reason) };
}
export function readUploadResponse(value: unknown): UploadResponse {
  profileObject(value);profileObject(value, ['type', 'requestId', 'error', 'ownerId', 'revision', 'uploads', 'uploadId', 'raster', ...(Object.hasOwn(value, 'equipment') ? ['equipment'] : []), ...(Object.hasOwn(value, 'emblemEnabled') ? ['emblemEnabled'] : [])]);
  if (value.type !== 'upload-result' || !Array.isArray(value.uploads) || value.uploads.length > 4) throw new Error('Invalid upload response.');
  profileId(value.requestId);profileId(value.ownerId);
  if (value.emblemEnabled !== undefined && typeof value.emblemEnabled !== 'boolean') throw new Error('Invalid emblem capability.');
  const uploads = value.uploads.map(readUploadMetadata);
  if (new Set(uploads.map(upload => upload.id)).size !== uploads.length) throw new Error('Duplicate upload identity.');
  const uploadId = owner(value.uploadId), raster = value.raster === null ? null : readUploadRaster(value.raster);
  if (raster) {
    const item = uploads.find(upload => upload.id === uploadId);
    if (!item || item.status === 'rejected' || item.width !== raster.width || item.height !== raster.height) throw new Error('Uploaded pixels do not match the response.');
  }
  const error = text(value.error);
  if (error && raster) throw new Error('Failed upload response contains pixels.');
  return { type: value.type, requestId: value.requestId, error, ownerId: value.ownerId, revision: readUploadRevision(value.revision), uploads, uploadId, raster, equipment: readUploadEquipment(value.equipment, uploads), emblemEnabled: value.emblemEnabled === true };
}
