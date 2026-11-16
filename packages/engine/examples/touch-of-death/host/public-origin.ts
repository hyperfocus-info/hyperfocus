/** App deployment boundary: one trusted HTTPS origin and optional public container binding. */
export function createDemoOriginPolicy(options: { port: number; publicOrigin?: string; publicBinding?: boolean; previewOrigin?: string; audioPaths?: ReadonlySet<string> }) {
  if (!Number.isSafeInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('Demo backend port must be 1 to 65535.');
  const localOrigin = `http://127.0.0.1:${options.port}`;
  let origin = localOrigin;
  if (options.publicOrigin !== undefined) {
    let parsed: URL;try { parsed = new URL(options.publicOrigin); } catch { throw new Error('Public demo origin must be an exact HTTPS origin.'); }
    if (parsed.protocol !== 'https:' || parsed.origin !== options.publicOrigin || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('Public demo origin must be an exact HTTPS origin.');
    origin = parsed.origin;
  }
  let previewHost: string | undefined;
  if (options.previewOrigin !== undefined) {
    let parsed: URL;try { parsed = new URL(options.previewOrigin); } catch { throw new Error('Preview origin must be an exact HTTPS origin.'); }
    if (!options.publicOrigin || parsed.protocol !== 'https:' || parsed.origin !== options.previewOrigin || parsed.username || parsed.password
      || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.origin === origin) throw new Error('Preview origin must be a distinct exact HTTPS origin with a configured public origin.');
    previewHost = parsed.host;
  }
  const publicHost = new URL(origin).host, localHost = new URL(localOrigin).host;
  const publicPaths = new Set(['/', '/tod-demo.json', '/tod-guest-session', '/tod-guest-recovery', '/tod-health', '/tod-ai-policy', '/tod-ai-candidates', '/tod-replay-share']);
  const localPaths = new Set(['/moderation', '/moderation.js', '/moderation/api', '/tod-ai-ingestion-receipts']);
  const rejected = (status: number) => new Response(status === 404 ? 'Not found' : 'Forbidden', { status, headers: { 'Cache-Control': 'no-store' } });
  function guard(request: Request): Response | undefined {
    if (options.publicOrigin === undefined) return;
    const url = new URL(request.url), host = request.headers.get('host');
    const websocket = request.headers.get('upgrade')?.toLowerCase() === 'websocket';
    if (options.publicBinding && host === 'healthcheck.railway.app' && url.pathname === '/tod-health' && request.method === 'GET' && !websocket) return;
    if (previewHost && host === previewHost) {
      if (websocket) return rejected(403);
      const readable = (url.pathname === '/' || options.audioPaths?.has(url.pathname)) && ['GET', 'HEAD'].includes(request.method)
        || ['/tod-demo.json', '/tod-health'].includes(url.pathname) && request.method === 'GET';
      return readable ? undefined : rejected(403);
    }
    if (host === publicHost) {
      if (websocket) return url.pathname === '/' && request.method === 'GET' && request.headers.get('origin') === origin ? undefined : rejected(403);
      if (options.audioPaths?.has(url.pathname)) return ['GET', 'HEAD'].includes(request.method) ? undefined : rejected(403);
      return publicPaths.has(url.pathname) ? undefined : rejected(404);
    }
    if (!options.publicBinding && !websocket && host === localHost && url.origin === localOrigin) {
      if (request.method === 'GET' && ['/healthz', '/stats.json'].includes(url.pathname)) return;
      if (localPaths.has(url.pathname)) return;
      return rejected(404);
    }
    return rejected(403);
  }
  function guestRequest(request: Request): Request {
    const url = new URL(request.url);
    if (options.publicOrigin === undefined) {
      if (url.origin !== localOrigin) throw new Error('Guest request origin does not match this host.');
      return request;
    }
    if (request.headers.get('host') !== publicHost) throw new Error('Guest request Host does not match the public origin.');
    // The reverse proxy terminates TLS. No forwarded header can choose identity origin.
    const normalized = new URL(origin);normalized.pathname = url.pathname;normalized.search = url.search;
    return new Request(normalized, request);
  }
  return { origin, endpoint: origin.replace(/^http/, 'ws'), guard, guestRequest,
    isPreview(request: Request) { return previewHost !== undefined && request.headers.get('host') === previewHost; } };
}
