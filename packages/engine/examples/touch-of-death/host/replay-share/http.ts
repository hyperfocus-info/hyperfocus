import { replayContentType } from '../../src/replay/archive.ts';
import { shareMaxBytes, type createReplayShares } from './service.ts';

export function createReplayShareHttp(options: { origin: string; service: ReturnType<typeof createReplayShares>; authenticate(token: string): Promise<string | undefined> }) {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  let pending = 0;
  return async (request: Request) => {
    const url = new URL(request.url);if (url.pathname !== '/tod-replay-share') return;
    if (url.origin !== options.origin || request.headers.has('host') && request.headers.get('host') !== new URL(options.origin).host
      || request.headers.has('origin') && request.headers.get('origin') !== options.origin
      || request.headers.has('sec-fetch-site') && !['same-origin', 'none'].includes(request.headers.get('sec-fetch-site')!)) return new Response('Forbidden', { status: 403, headers });
    if (request.method === 'GET') {
      try {
        const bytes = await options.service.read(url.searchParams.get('id') ?? '');
        return bytes ? new Response(bytes, { headers: { ...headers, 'Content-Type': replayContentType } }) : new Response('This replay link has expired or is unavailable.', { status: 404, headers });
      } catch { return new Response('This replay is unavailable. Ask your friend for the downloaded file.', { status: 503, headers }); }
    }
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
    if (request.headers.get('origin') !== options.origin || url.search) return new Response('Same origin required', { status: 403, headers });
    if (request.headers.get('content-type') !== replayContentType) return new Response('Replay archive required', { status: 415, headers });
    const token = request.headers.get('authorization')?.match(/^Bearer (.{1,8192})$/)?.[1];
    if (!token) return new Response('Join a room before sharing a replay.', { status: 401, headers });
    if (pending >= 4) return new Response('Replay sharing is busy. Try again.', { status: 429, headers });
    pending++;
    try {
      const owner = await options.authenticate(token);
      if (!owner) return new Response('Your session expired. Rejoin before sharing.', { status: 401, headers });
      const result = await options.service.create(owner, await readBody(request));return Response.json(result, { headers });
    } catch (cause) {
      return new Response(cause instanceof Error ? cause.message : 'Replay sharing is unavailable. Try again.', { status: 400, headers });
    } finally { pending--; }
  };
}

async function readBody(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > shareMaxBytes) throw Error('Replay link limit is 512 KiB. Download the replay file instead.');
  const reader = request.body?.getReader();if (!reader) throw Error('Replay body is missing.');
  const signal = AbortSignal.timeout(5000), abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  const chunks: Uint8Array[] = [];let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();const next = await reader.read();signal.throwIfAborted();if (next.done) break;
      size += next.value.length;if (size > shareMaxBytes) throw Error('Replay link limit is 512 KiB. Download the replay file instead.');chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);let offset = 0;for (const chunk of chunks) { bytes.set(chunk, offset);offset += chunk.length; }return bytes;
  } finally { signal.removeEventListener('abort', abort);await reader.cancel().catch(() => {});reader.releaseLock(); }
}
