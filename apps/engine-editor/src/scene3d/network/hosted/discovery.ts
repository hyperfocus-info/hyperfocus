import { isRecord } from '@hyperfocus/utilities/records';
import { requireOneOf } from '../../../app/client-runtime-guards.ts';
import { getClerkSessionToken } from './clerk.ts';
export type HostedFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
export type HostedDemo = { version: 1; contentId: string; endpoint: string; guestSessionPath: string; recoveryPath?: string; clerkPublishableKey?: string; roomTypes: Array<'combat-relay' | 'tod-community' | 'tod-quick-play' | 'tod-training'>; matchId: string };
const types = ['combat-relay', 'tod-community', 'tod-quick-play', 'tod-training'] as const;
function record(value: unknown, keys: string[]) {
  if (!isRecord(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error('The game host supplied invalid connection details.');
  return value;
}
export function readHostedDemo(options: { value: unknown; origin: string; contentId: string }): HostedDemo {
  const value = record(options.value, ['version', 'contentId', 'endpoint', 'guestSessionPath', 'recoveryPath', 'clerkPublishableKey', 'roomTypes', 'matchId']);
  const origin = new URL(options.origin);
  if (!['http:', 'https:'].includes(origin.protocol) || value.version !== 1 || value.contentId !== options.contentId) throw new Error('This host uses a different game version. Reload the game and try again.');
  if (typeof value.endpoint !== 'string' || value.endpoint.length > 2048 || typeof value.guestSessionPath !== 'string' || value.guestSessionPath.length > 256) throw new Error('Invalid guest host address.');
  const endpoint = new URL(value.endpoint), session = new URL(value.guestSessionPath, origin);
  const expected = origin.protocol === 'https:' ? 'wss:' : 'ws:';
  if (origin.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Guest play requires HTTPS or a local demo host.');
  if (endpoint.protocol !== expected || endpoint.host !== origin.host || endpoint.username || endpoint.password || endpoint.hash || session.origin !== origin.origin || session.username || session.password || session.hash || !value.guestSessionPath.startsWith('/') || value.guestSessionPath.startsWith('//')) throw new Error('Guest connections must use this game host.');
  if (!Array.isArray(value.roomTypes) || !value.roomTypes.length || value.roomTypes.length > 4 || value.roomTypes.some(type => !types.includes(type)) || new Set(value.roomTypes).size !== value.roomTypes.length || typeof value.matchId !== 'string' || !value.matchId || value.matchId.length > 96) throw new Error('Invalid guest room options.');
  if (value.clerkPublishableKey !== undefined && (typeof value.clerkPublishableKey !== 'string' || !/^pk_(test|live)_[A-Za-z0-9+/=]{8,512}$/.test(value.clerkPublishableKey))) throw new Error('Invalid sign-in provider.');
  let recoveryPath: string | undefined;
  if (value.recoveryPath !== undefined) {
    if (typeof value.recoveryPath !== 'string' || !/^\/[a-z0-9/-]{1,128}$/.test(value.recoveryPath) || value.recoveryPath.startsWith('//')) throw new Error('Invalid account recovery address.');
    recoveryPath = new URL(value.recoveryPath, origin).href;
  }
  return { version: 1, contentId: options.contentId, endpoint: endpoint.href, guestSessionPath: session.href, ...(recoveryPath ? { recoveryPath } : {}), ...(typeof value.clerkPublishableKey === 'string' ? { clerkPublishableKey: value.clerkPublishableKey } : {}), roomTypes: value.roomTypes.map(type => requireOneOf(type, types, 'Guest room type')), matchId: value.matchId };
}
export async function discoverHostedDemo(options: { origin: string; contentId: string; signal?: AbortSignal; fetch?: HostedFetch }): Promise<HostedDemo | undefined> {
  if (!/^https?:/.test(options.origin)) return undefined;
  const signal = AbortSignal.any([AbortSignal.timeout(5000), ...(options.signal ? [options.signal] : [])]);
  const response = await (options.fetch ?? fetch)(new URL('/tod-demo.json', options.origin), { credentials: 'omit', redirect: 'error', signal });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error('Online play is unavailable. Retry or use connection details.');
  return readHostedDemo({ value: await readResponse(response, signal), origin: options.origin, contentId: options.contentId });
}
/** One lease per connection; only the host cookie survives this in-memory provider. */
export function createGuestCredentials(options: { host: HostedDemo; signal?: AbortSignal; fetch?: HostedFetch; interactive?: boolean }) {
  let lease: string | undefined;
  return async () => {
    options.signal?.throwIfAborted();
    const clerkToken = options.host.clerkPublishableKey ? await getClerkSessionToken({ publishableKey: options.host.clerkPublishableKey, signal: options.signal, interactive: options.interactive }) : undefined;
    const signal = AbortSignal.any([AbortSignal.timeout(5000), ...(options.signal ? [options.signal] : [])]);
    const response = await (options.fetch ?? fetch)(options.host.guestSessionPath, { method: 'POST', credentials: 'same-origin', redirect: 'error', headers: { 'Content-Type': 'application/json', ...(clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {}) }, body: JSON.stringify(lease ? { lease } : {}), signal });
    options.signal?.throwIfAborted();
    if (!response.ok) {
      if (response.status === 429) throw new Error('Too many guest requests. Wait a minute, then try again.');
      if (response.status !== 401) throw new Error('Guest sign-in is temporarily unavailable. Try again shortly.');
      let code: unknown;
      try { const value = record(await readResponse(response, signal), ['error', 'code']);code = value.code; }
      catch { signal.throwIfAborted(); }
      if (code === 'clerk-sign-in-required') throw new Error('Your sign-in expired. Reload and sign in again to keep playing.');
      if (code === 'guest-identity-unavailable') throw new Error(options.host.recoveryPath
        ? 'This browser no longer has valid guest access. Return to local play, open Play with friends, then use Keep or restore your fighter with your saved recovery file. Without an activated key, the previous profile and rating cannot be restored.'
        : 'This browser no longer has valid guest access. Rejoining cannot restore your previous profile or rating. To start a new guest, clear this site’s cookie in browser settings.');
      if (code === 'guest-lease-expired') throw new Error('Your connection expired. Leave and join again; your guest identity is still available.');
      throw new Error('The host could not verify your guest access. Rejoining may not restore it. Ask the host for help.');
    }
    const value = record(await readResponse(response, signal), ['token', 'lease']);options.signal?.throwIfAborted();
    if (typeof value.token !== 'string' || !value.token || value.token.length > 8192 || typeof value.lease !== 'string' || !/^[0-9a-f]{64}$/.test(value.lease)) throw new Error('The host supplied an invalid guest session.');
    lease = value.lease;return value.token;
  };
}

export async function readResponse(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader();if (!reader) throw new Error('The game host returned an empty response.');
  const abort = () => { void reader.cancel().catch(() => undefined); };signal.addEventListener('abort', abort, { once: true });
  const chunks: Uint8Array[] = [];let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();const next = await reader.read();signal.throwIfAborted();
      if (next.done) break;
      size += next.value.byteLength;if (size > 16384) throw new Error('The game host response is too large.');chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset);offset += chunk.length; }
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));signal.throwIfAborted();return value;
  } finally { signal.removeEventListener('abort', abort);await reader.cancel().catch(() => undefined);reader.releaseLock(); }
}
