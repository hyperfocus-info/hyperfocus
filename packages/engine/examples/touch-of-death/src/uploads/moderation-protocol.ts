import { profileId, profileObject } from '../appearance/profile.ts';
import { imageReportReasons, readUploadMetadata, readUploadRevision, type ImageReportReason, type UploadMetadata } from './protocol.ts';
import { readUploadRaster, type UploadRaster } from './raster.ts';

export { imageReportReasons, type ImageReportReason } from './protocol.ts';
export type UploadReportMetadata = { id: string; reporterId: string; roomId: string; ownerId: string; uploadId: string; contentId: string; reason: ImageReportReason; createdAt: number; status: 'pending' | 'reviewed' | 'dismissed'; reviewerId: string; reviewedAt: number | null; resolution: string };
export type ModerationCommand =
  | { type: 'moderation-owners'; requestId: string; cursor: string }
  | { type: 'moderation-reporters'; requestId: string; cursor: string }
  | { type: 'moderation-owner'; requestId: string; ownerId: string }
  | { type: 'moderation-preview'; requestId: string; ownerId: string; uploadId: string }
  | { type: 'moderation-review'; requestId: string; ownerId: string; uploadId: string; expectedRevision: number; status: 'approved' | 'rejected'; reason: string }
  | { type: 'moderation-reports'; requestId: string; reporterId: string }
  | { type: 'moderation-resolve'; requestId: string; reporterId: string; reportId: string; expectedRevision: number; status: 'reviewed' | 'dismissed'; resolution: string };
export type ModerationResponse = { type: 'moderation-result'; requestId: string; error: string; owners: string[]; reporters: string[]; nextCursor: string; ownerId: string; revision: number; uploads: UploadMetadata[]; uploadId: string; raster: UploadRaster | null; reporterId: string; reports: UploadReportMetadata[] };

export function moderationText(value: unknown): string {
  if (typeof value !== 'string' || new TextEncoder().encode(value).length > 512 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) throw new Error('Use at most 512 bytes without control characters.');
  const normalized = value.trim().normalize('NFC');
  if (new TextEncoder().encode(normalized).length > 512) throw new Error('Use at most 512 bytes after normalization.');
  return normalized;
}
function optionalId(value: unknown): string { if (value === '') return '';profileId(value);return value; }
export function readModerationCommand(value: unknown): ModerationCommand {
  profileObject(value);profileId(value.requestId);
  if (value.type === 'moderation-owners' || value.type === 'moderation-reporters') {
    profileObject(value, ['type', 'requestId', 'cursor']);return { type: value.type, requestId: value.requestId, cursor: optionalId(value.cursor) };
  }
  if (value.type === 'moderation-owner') {
    profileObject(value, ['type', 'requestId', 'ownerId']);profileId(value.ownerId);return { type: value.type, requestId: value.requestId, ownerId: value.ownerId };
  }
  if (value.type === 'moderation-preview') {
    profileObject(value, ['type', 'requestId', 'ownerId', 'uploadId']);profileId(value.ownerId);profileId(value.uploadId);
    return { type: value.type, requestId: value.requestId, ownerId: value.ownerId, uploadId: value.uploadId };
  }
  if (value.type === 'moderation-review') {
    profileObject(value, ['type', 'requestId', 'ownerId', 'uploadId', 'expectedRevision', 'status', 'reason']);profileId(value.ownerId);profileId(value.uploadId);
    if (value.status !== 'approved' && value.status !== 'rejected') throw new Error('Invalid review decision.');
    const reason = moderationText(value.reason);if (value.status === 'rejected' && !reason) throw new Error('Explain why this image is rejected.');
    return { type: value.type, requestId: value.requestId, ownerId: value.ownerId, uploadId: value.uploadId, expectedRevision: readUploadRevision(value.expectedRevision), status: value.status, reason };
  }
  if (value.type === 'moderation-reports') {
    profileObject(value, ['type', 'requestId', 'reporterId']);profileId(value.reporterId);return { type: value.type, requestId: value.requestId, reporterId: value.reporterId };
  }
  if (value.type === 'moderation-resolve') {
    profileObject(value, ['type', 'requestId', 'reporterId', 'reportId', 'expectedRevision', 'status', 'resolution']);profileId(value.reporterId);profileId(value.reportId);
    if (value.status !== 'reviewed' && value.status !== 'dismissed') throw new Error('Invalid report decision.');
    const resolution = moderationText(value.resolution);if (!resolution) throw new Error('Explain the report decision.');
    return { type: value.type, requestId: value.requestId, reporterId: value.reporterId, reportId: value.reportId, expectedRevision: readUploadRevision(value.expectedRevision), status: value.status, resolution };
  }
  throw new Error('Unknown moderator action.');
}
export function readUploadReportMetadata(value: unknown): UploadReportMetadata {
  profileObject(value, ['id', 'reporterId', 'roomId', 'ownerId', 'uploadId', 'contentId', 'reason', 'createdAt', 'status', 'reviewerId', 'reviewedAt', 'resolution']);
  const identity = (raw: unknown) => { profileId(raw);return raw; };
  const id = identity(value.id), reporterId = identity(value.reporterId), roomId = identity(value.roomId), ownerId = identity(value.ownerId), uploadId = identity(value.uploadId);
  const reason = imageReportReasons.find(reason => reason === value.reason);
  if (typeof value.contentId !== 'string' || !/^[a-f0-9]{64}$/.test(value.contentId)
    || reason === undefined
    || typeof value.createdAt !== 'number' || !Number.isSafeInteger(value.createdAt) || value.createdAt < 0
    || value.status !== 'pending' && value.status !== 'reviewed' && value.status !== 'dismissed') throw new Error('Invalid image report.');
  const resolution = moderationText(value.resolution);
  if (resolution !== value.resolution) throw new Error('Report resolution is not normalized.');
  const reviewedAt = value.reviewedAt, reviewerId = value.reviewerId;
  if (value.status === 'pending') { if (reviewedAt !== null || reviewerId !== '' || resolution) throw new Error('Invalid pending report.'); }
  else {
    profileId(reviewerId);
    if (!resolution || typeof reviewedAt !== 'number' || !Number.isSafeInteger(reviewedAt) || reviewedAt < value.createdAt) throw new Error('Invalid report decision.');
  }
  if (reviewedAt !== null && typeof reviewedAt !== 'number' || typeof reviewerId !== 'string') throw new Error('Invalid report decision.');
  return { ...value, id, reporterId, roomId, ownerId, uploadId, contentId: value.contentId, reason, createdAt: value.createdAt, status: value.status, reviewedAt, reviewerId, resolution };
}
export function readModerationResponse(value: unknown): ModerationResponse {
  profileObject(value, ['type', 'requestId', 'error', 'owners', 'reporters', 'nextCursor', 'ownerId', 'revision', 'uploads', 'uploadId', 'raster', 'reporterId', 'reports']);
  if (value.type !== 'moderation-result') throw new Error('Invalid moderator response.');profileId(value.requestId);
  const ids = (raw: unknown) => {
    if (!Array.isArray(raw) || raw.length > 20) throw new Error('Invalid moderator page.');
    const result = raw.map(value => { profileId(value);return value; });if (new Set(result).size !== result.length) throw new Error('Duplicate moderator page identity.');return result;
  };
  if (!Array.isArray(value.uploads) || value.uploads.length > 4 || !Array.isArray(value.reports) || value.reports.length > 64) throw new Error('Invalid moderator list.');
  const uploads = value.uploads.map(readUploadMetadata), reports = value.reports.map(readUploadReportMetadata);
  if (new Set(uploads.map(item => item.id)).size !== uploads.length || new Set(reports.map(item => item.id)).size !== reports.length) throw new Error('Duplicate moderator item.');
  const ownerId = optionalId(value.ownerId), uploadId = optionalId(value.uploadId), reporterId = optionalId(value.reporterId);
  if (uploads.length && !ownerId || reports.some(report => report.reporterId !== reporterId)) throw new Error('Moderator list identity mismatch.');
  const raster = value.raster === null ? null : readUploadRaster(value.raster), error = moderationText(value.error);
  if (raster && (error || !uploads.some(item => item.id === uploadId && item.status !== 'rejected' && item.width === raster.width && item.height === raster.height))) throw new Error('Moderator image identity mismatch.');
  return { type: value.type, requestId: value.requestId, error, owners: ids(value.owners), reporters: ids(value.reporters), nextCursor: optionalId(value.nextCursor), ownerId, revision: readUploadRevision(value.revision), uploads, uploadId, raster, reporterId, reports };
}
