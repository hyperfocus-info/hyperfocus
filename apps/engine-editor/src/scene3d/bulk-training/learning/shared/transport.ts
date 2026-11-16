import { createGuestCredentials, discoverHostedDemo } from '../../../network/hosted/discovery.ts';
import type { SharedCandidate } from './protocol.ts';

export function createSharedTransport(options: { origin: string; contentId: string; fetch?: typeof fetch; signal: AbortSignal }) {
  const origin = new URL(options.origin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== options.origin || origin.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw Error('Shared training requires the game HTTPS host or loopback.');
  const request = options.fetch ?? fetch;
  let credentials: (() => Promise<string>) | undefined;
  async function json(response: Response, signal: AbortSignal) {
    if (!response.ok) throw Error(`Shared training request failed (${response.status}).`);
    const reader = response.body?.getReader();if (!reader) throw Error('Empty shared training response.');
    const chunks: Uint8Array[] = [];let size = 0;
    const abort = () => { void reader.cancel().catch(() => {}); };signal.addEventListener('abort', abort, { once: true });
    try {
      while (true) {
        signal.throwIfAborted();const next = await reader.read();signal.throwIfAborted();if (next.done) break;
        size += next.value.byteLength;if (size > 1048576) throw Error('Shared training response exceeds its limit.');chunks.push(next.value);
      }
      const bytes = new Uint8Array(size);let offset = 0;for (const chunk of chunks) { bytes.set(chunk, offset);offset += chunk.length; }
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } finally { signal.removeEventListener('abort', abort);await reader.cancel().catch(() => {});reader.releaseLock(); }
  }
  return {
    async read() {
      const signal = AbortSignal.any([options.signal, AbortSignal.timeout(10000)]);
      const response = await request(new URL('/tod-ai-policy', origin), { credentials: 'omit', redirect: 'error', cache: 'no-store', signal });
      if (response.status === 404) return undefined;
      return json(response, signal);
    },
    async prepare() {
      const host = await discoverHostedDemo({ origin: options.origin, contentId: options.contentId, signal: options.signal, fetch: request });
      if (!host) throw Error('This game host does not accept shared training.');
      credentials = createGuestCredentials({ host, signal: options.signal, fetch: request });
      // Sign-in happens only on the user's training action, never in a background upload.
      await credentials();
      credentials = createGuestCredentials({ host, signal: options.signal, fetch: request, interactive: false });
    },
    async upload(candidates: SharedCandidate[]) {
      if (!credentials) {
        const host = await discoverHostedDemo({ origin: options.origin, contentId: options.contentId, signal: options.signal, fetch: request });
        if (!host) throw Error('This game host does not accept shared training.');
        credentials = createGuestCredentials({ host, signal: options.signal, fetch: request, interactive: false });
      }
      const token = await credentials(), signal = AbortSignal.any([options.signal, AbortSignal.timeout(10000)]);
      const response = await request(new URL('/tod-ai-candidates', origin), { method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ version: 1, contentId: options.contentId, candidates }) });
      return json(response, signal);
    },
  };
}
