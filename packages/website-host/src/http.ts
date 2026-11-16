export function reject(status: number, error: string): never { throw Response.json({ error }, { status }); }

export function exactOrigin(value: string) {
  const url = new URL(value);
  if (url.origin !== value || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Configure an exact public origin.');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Public hosts require HTTPS.');
  return value;
}

export function checkOrigin(request: Request, origin: string) {
  const supplied = request.headers.get('origin');
  const mutation = !['GET', 'HEAD'].includes(request.method);
  if ((supplied && supplied !== origin) || (mutation && supplied !== origin)
    || ['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site') ?? '')) reject(403, 'Use this application from its configured origin.');
}

export async function timed<T>(work: (signal: AbortSignal) => Promise<T>, ms: number, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(parent?.reason);
  if (parent?.aborted) abort();
  else parent?.addEventListener('abort', abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, fail) => {
    timer = setTimeout(() => { controller.abort(); fail(Response.json({ error: 'Request timed out.' }, { status: 504 })); }, ms);
  });
  try { return await Promise.race([work(controller.signal), timeout]); }
  finally { clearTimeout(timer); parent?.removeEventListener('abort', abort); }
}

export async function readBody(request: Request, limit: number) {
  if (request.headers.has('content-encoding') && request.headers.get('content-encoding') !== 'identity') reject(415, 'HTTP content encoding is not supported.');
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) reject(413, 'Request body is too large.');
  if (!request.body) reject(400, 'A request body is required.');
  const reader = request.body.getReader();
  try {
    return await timed(async signal => {
      signal.addEventListener('abort', () => { void reader.cancel().catch(() => {}); }, { once: true });
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        signal.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > limit) reject(413, 'Request body is too large.');
        chunks.push(chunk.value);
      }
      signal.throwIfAborted();
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return bytes;
    }, 15_000, request.signal);
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function createRateLimit({ limit = 120, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {}) {
  const buckets = new Map<string, { count: number; until: number }>();
  return (userId: string) => {
    const now = Date.now();
    for (const [key, row] of buckets) if (row.until <= now) buckets.delete(key);
    const row = buckets.get(userId);
    if (!row && buckets.size >= 10_000) reject(429, 'Server request limit reached. Try again shortly.');
    if (row && row.count >= limit) reject(429, 'Request limit reached. Try again shortly.');
    if (row) row.count++;
    else buckets.set(userId, { count: 1, until: now + windowMs });
  };
}

export function secureResponse(response: Response, csp: string, https: boolean) {
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('Vary', 'Authorization, Cookie, Origin');
  if (https) response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  if (response.status === 429) response.headers.set('Retry-After', '60');
  return response;
}
