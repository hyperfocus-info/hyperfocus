import { gzipSync } from 'node:zlib';
import { hostedClerkDocument } from './demo-document-policy.ts';

/** RFC 9110 §12.5.3. Invalid weights exclude that coding; duplicate entries use
 * their lowest weight so an explicit refusal cannot be overridden accidentally. */
function encoding(header: string | null): 'gzip' | 'identity' | undefined {
  if (!header?.trim()) return 'identity';
  const weights = new Map<string, number>();
  for (const entry of header.split(',')) {
    const [name = '', ...parameters] = entry.trim().toLowerCase().split(';');
    const token = name.trim() === 'x-gzip' ? 'gzip' : name.trim();
    if (!['gzip', 'identity', '*'].includes(token)) continue;
    const match = parameters.length === 1 ? /^\s*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)\s*$/.exec(parameters[0]!) : null;
    const weight = parameters.length === 0 ? 1 : match ? Number(match[1]) : 0;
    weights.set(token, Math.min(weights.get(token) ?? 1, weight));
  }
  const gzip = weights.get('gzip') ?? weights.get('*') ?? 0;
  const identity = weights.get('identity') ?? (weights.get('*') === 0 ? 0 : 1);
  // Implicit identity is an acceptable fallback, not an explicit preference.
  if (gzip > 0 && (!weights.has('identity') || gzip >= identity)) return 'gzip';
  return identity > 0 ? 'identity' : undefined;
}

/** Build a deployment response once without changing the exported artifact on disk. */
export function createDemoDocument({ html, clerkFrontendOrigin }: { html: string; clerkFrontendOrigin?: string }) {
  const served = clerkFrontendOrigin === undefined ? html : hostedClerkDocument({ html, origin: clerkFrontendOrigin });
  const identity = Buffer.from(served, 'utf8'), gzip = gzipSync(identity);
  return {
    sourceSha256: new Bun.CryptoHasher('sha256').update(html).digest('hex'),
    servedSha256: new Bun.CryptoHasher('sha256').update(identity).digest('hex'),
    respond(request: Request): Response {
      const selected = encoding(request.headers.get('accept-encoding'));
      const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', vary: 'Accept-Encoding' });
      if (!selected) { headers.set('content-length', '0');return new Response(null, { status: 406, headers }); }
      const bytes = selected === 'gzip' ? gzip : identity;
      if (selected === 'gzip') headers.set('content-encoding', 'gzip');
      headers.set('content-length', String(bytes.byteLength));
      return new Response(request.method === 'HEAD' ? null : bytes, { headers });
    },
  };
}
