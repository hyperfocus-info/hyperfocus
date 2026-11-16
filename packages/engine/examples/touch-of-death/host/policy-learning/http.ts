import type { createPolicyLearningService } from './service.ts';

/** Same-origin authenticated nominations; the public surface cannot promote or roll back weights. */
export function createPolicyLearningHttp(options: {
  origin: string; contentId: string; service: ReturnType<typeof createPolicyLearningService>;
  authenticate(token: string): Promise<string | undefined>; wake(): void;
}) {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  return async (request: Request) => {
    const url = new URL(request.url);
    if (!['/tod-ai-policy', '/tod-ai-candidates'].includes(url.pathname)) return;
    if (url.origin !== options.origin || url.search || request.headers.has('host') && request.headers.get('host') !== new URL(options.origin).host
      || request.headers.has('origin') && request.headers.get('origin') !== options.origin
      || request.headers.has('sec-fetch-site') && !['same-origin', 'none'].includes(request.headers.get('sec-fetch-site')!)) return new Response('Forbidden', { status: 403, headers });
    if (url.pathname === '/tod-ai-policy') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });
      try { return Response.json(await options.service.read(), { headers }); }
      catch { return new Response('Shared policy unavailable', { status: 503, headers }); }
    }
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
    if (request.headers.get('origin') !== options.origin) return new Response('Same origin required', { status: 403, headers });
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) return new Response('JSON required', { status: 415, headers });
    const token = request.headers.get('authorization')?.match(/^Bearer (.{1,8192})$/)?.[1];
    if (!token) return new Response('Sign in required', { status: 401, headers });
    try {
      const submitter = await options.authenticate(token);
      if (!submitter) return new Response('Sign in required', { status: 401, headers });
      const value = await body(request);
      if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
        || !('contentId' in value) || value.contentId !== options.contentId || !('candidates' in value) || !Array.isArray(value.candidates)) throw Error('Invalid candidate batch.');
      const result = await options.service.submit({ submitter, candidates: value.candidates });
      options.wake();return Response.json(result, { headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Shared training unavailable';
      const status = /rate|minute|Too many/i.test(message) ? 429 : /full|capacity|limit reached/i.test(message) ? 503 : /invalid|mismatch|differ|identity|corrupt|checksum|candidate|record|evidence/i.test(message) ? 400 : 503;
      return Response.json({ error: message }, { status, headers });
    }
  };
}

async function body(request: Request): Promise<unknown> {
  const limit = 1048576;
  if (Number(request.headers.get('content-length') ?? 0) > limit) throw Error('Candidate batch exceeds byte limit.');
  const reader = request.body?.getReader();if (!reader) throw Error('Invalid candidate body.');
  const chunks: Uint8Array[] = [];let size = 0;
  const signal = AbortSignal.timeout(5000), abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();const next = await reader.read();signal.throwIfAborted();if (next.done) break;
      size += next.value.byteLength;if (size > limit) throw Error('Candidate batch exceeds byte limit.');chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);let offset = 0;for (const chunk of chunks) { bytes.set(chunk, offset);offset += chunk.length; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw Error('Invalid candidate JSON body.'); }
  } finally { signal.removeEventListener('abort', abort);await reader.cancel().catch(() => {});reader.releaseLock(); }
}
