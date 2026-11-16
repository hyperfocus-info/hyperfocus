import { timingSafeEqual } from 'node:crypto';
import { profileId } from '../../src/appearance/profile.ts';
import { readModerationCommand, readModerationResponse, type ModerationResponse } from '../../src/uploads/moderation-protocol.ts';
import type { createUploadService } from './service.ts';
import type { createUploadReportService } from './report-service.ts';

export function readModeratorConfig(value: { token: string; reviewerId: string }) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(value.token)) throw new Error('Moderator access requires a 32-128 character secret token.');
  profileId(value.reviewerId);return { ...value };
}

const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Touch of Death host review</title><body><div data-moderation-root></div><script src="/moderation.js" defer></script></body></html>';
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" };

/** Local host operations only. No development player token grants this authority. */
export function createUploadModerationHandler(options: {
  moderator: { token: string; reviewerId: string }; script: string;
  uploads: ReturnType<typeof createUploadService>; reports: ReturnType<typeof createUploadReportService>;
  page(input: { kind: 'owners' | 'reporters'; cursor: string }): { ids: string[]; nextCursor: string } | Promise<{ ids: string[]; nextCursor: string }>;
  now?: () => number;
}) {
  const moderator = readModeratorConfig(options.moderator), expected = new Bun.CryptoHasher('sha256').update(moderator.token).digest();
  let windowAt = 0, calls = 0;
  return async function handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    if (!['/moderation', '/moderation.js', '/moderation/api'].includes(url.pathname)) return null;
    const fail = (status: number, message: string) => new Response(message, { status, headers });
    // Local host names plus a configured bearer token; no cross-origin administration.
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return fail(403, 'Host review is local only.');
    const origin = request.headers.get('origin');if (origin && origin !== url.origin) return fail(403, 'Use the host review page on this origin.');
    if (url.pathname !== '/moderation/api') {
      if (request.method !== 'GET') return fail(405, 'Method not allowed.');
      return new Response(url.pathname === '/moderation' ? html : options.script, { headers: { ...headers, 'Content-Type': url.pathname === '/moderation' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8' } });
    }
    if (request.method !== 'POST') return fail(405, 'Method not allowed.');
    const authorization = request.headers.get('authorization') ?? '';
    if (!/^Bearer [A-Za-z0-9_-]{32,128}$/.test(authorization)
      || !timingSafeEqual(expected, new Bun.CryptoHasher('sha256').update(authorization.slice(7)).digest())) return fail(401, 'Moderator access was not accepted.');
    if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') return fail(415, 'Send JSON commands.');
    const now = (options.now ?? Date.now)();
    if (now - windowAt >= 60000) { windowAt = now;calls = 0; }
    if (++calls > 120) return fail(429, 'Too many review requests. Wait a minute.');
    let command: ReturnType<typeof readModerationCommand>;
    try { command = readModerationCommand(JSON.parse(await readBody(request))); }
    catch { return fail(400, 'Invalid or oversized moderator command.'); }
    const response: ModerationResponse = { type: 'moderation-result', requestId: command.requestId, error: '', owners: [], reporters: [], nextCursor: '', ownerId: '', revision: 0, uploads: [], uploadId: '', raster: null, reporterId: '', reports: [] };
    try {
      if (command.type === 'moderation-owners' || command.type === 'moderation-reporters') {
        const kind = command.type === 'moderation-owners' ? 'owners' : 'reporters', page = await options.page({ kind, cursor: command.cursor });response[kind] = page.ids;response.nextCursor = page.nextCursor;
      } else if (command.type === 'moderation-reports' || command.type === 'moderation-resolve') {
        if (command.type === 'moderation-resolve') await options.reports.resolve({ ...command, reviewerId: moderator.reviewerId });
        const result = await options.reports.list({ reporterId: command.reporterId });response.reporterId = command.reporterId;response.revision = result.revision;response.reports = result.reports;
      } else {
        response.ownerId = command.ownerId;
        if (command.type === 'moderation-review') await options.uploads.review({ ...command, reviewerId: moderator.reviewerId });
        if (command.type === 'moderation-preview') {
          const result = await options.uploads.readWithList({ ownerId: command.ownerId, viewerId: command.ownerId, uploadId: command.uploadId, roomId: 'host-review' });
          if (!result.image) throw new Error('Image unavailable.');
          response.revision = result.revision;response.uploads = result.uploads.map(wire);response.uploadId = command.uploadId;response.raster = result.image.raster;
        } else {
          const result = await options.uploads.list({ ownerId: command.ownerId });response.revision = result.revision;response.uploads = result.uploads.map(wire);
        }
      }
    } catch { response.error = 'This review could not be completed. Refresh to check for changes, or retry the same action.';response.raster = null;response.uploadId = ''; }
    return Response.json(readModerationResponse(response), { headers });
  };
}

function wire(upload: Awaited<ReturnType<ReturnType<typeof createUploadService>['list']>>['uploads'][number]) {
  return { id: upload.id, hash: upload.contentId, width: upload.width, height: upload.height, status: upload.status, reason: upload.reason };
}
async function readBody(request: Request) {
  const size = request.headers.get('content-length');
  if (size && (!/^\d+$/.test(size) || Number(size) > 16384)) throw new Error('Body too large.');
  const reader = request.body?.getReader();if (!reader) throw new Error('Missing body.');
  const parts: Uint8Array[] = [];let bytes = 0, timedOut = false;
  const timer = setTimeout(() => { timedOut = true;void reader.cancel('Review request timed out.').catch(() => {}); }, 5000);
  try {
    while (true) { const next = await reader.read();if (next.done) break;bytes += next.value.byteLength;if (bytes > 16384) { await reader.cancel();throw new Error('Body too large.'); }parts.push(next.value); }
    if (timedOut) throw new Error('Review request timed out.');
    const joined = new Uint8Array(bytes);let offset = 0;for (const part of parts) { joined.set(part, offset);offset += part.byteLength; }
    return new TextDecoder('utf-8', { fatal: true }).decode(joined);
  } finally { clearTimeout(timer);reader.releaseLock(); }
}
