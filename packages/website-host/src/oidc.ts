import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { checkOrigin, exactOrigin, reject } from './http';
import { createHostedOidcProvider, type HostedOidcConfig, type HostedOidcFetch } from './oidc-provider';
import { authCookie, loginCookie, sessionCookie, createHostedSessions, readAuthCookie } from './oidc-session';

const loginSeconds = 600;
const random = () => randomBytes(32).toString('base64url');

/** Single replica owns pending logins; restarts invalidate them, but not app sessions. */
export function createHostedOidc(options: HostedOidcConfig & { publicOrigin: string; fetcher?: HostedOidcFetch; now?: () => number }) {
  const origin = exactOrigin(options.publicOrigin), now = options.now ?? Date.now;
  if (!origin.startsWith('https:')) throw new Error('OIDC requires an HTTPS public origin.');
  const provider = createHostedOidcProvider(options, options.fetcher), sessions = createHostedSessions(options, origin, now);
  const pending = new Map<string, { state: string; nonce: string; verifier: string; expires: number }>();
  let active = 0;
  const hostedLoginCookie = loginCookie(options.sessionNamespace), hostedSessionCookie = sessionCookie(options.sessionNamespace);
  const clearLogin = () => authCookie(hostedLoginCookie, '', 0);
  return {
    publicOrigin: origin,
    session: sessions.read,
    async route(request: Request, path: string) {
      if (path === '/auth/logout' && request.method === 'POST') {
        checkOrigin(request, origin);
        const id = readAuthCookie(request, hostedLoginCookie);
        if (id) pending.delete(id);
        const response = Response.json({ user: null });
        response.headers.append('Set-Cookie', authCookie(hostedSessionCookie, '', 0));
        response.headers.append('Set-Cookie', clearLogin());
        return response;
      }
      if (!['/auth/login', '/auth/callback'].includes(path) || request.method !== 'GET') reject(405, 'Unsupported sign-in request.');
      if (active >= 32) reject(429, 'Sign-in is busy. Try again shortly.');
      active++;
      try {
        for (const [key, row] of pending) if (row.expires <= now()) pending.delete(key);
        if (path === '/auth/login') {
          // Bookmarks, external sign-in links and canonical-host redirects may
          // arrive cross-site. Allow only top-level GET navigation; fetches,
          // frames and every authenticated mutation keep the strict origin gate.
          const navigation = request.headers.get('sec-fetch-mode') === 'navigate'
            && request.headers.get('sec-fetch-dest') === 'document'
            && (!request.headers.has('origin') || request.headers.get('origin') === origin);
          if (!navigation) checkOrigin(request, origin);
          if (pending.size >= 1000) reject(429, 'Sign-in is busy. Try again shortly.');
          const url = new URL(await provider.authorizationUrl());
          const id = random(), state = random(), nonce = random(), verifier = random();
          const values = { response_type: 'code', client_id: options.clientId, redirect_uri: `${origin}/auth/callback`,
            scope: 'openid profile email', state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' };
          for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
          const previous = readAuthCookie(request, hostedLoginCookie);
          if (previous) pending.delete(previous);
          pending.set(id, { state, nonce, verifier, expires: now() + 600_000 });
          return new Response(null, { status: 302, headers: { Location: url.href, 'Set-Cookie': authCookie(hostedLoginCookie, id, loginSeconds) } });
        }
        // The IdP callback is a cross-site navigation: state + the host-only cookie
        // authorize this one route; ordinary API/logout mutations require Origin.
        try {
          const query = new URL(request.url).searchParams;
          const id = readAuthCookie(request, hostedLoginCookie), transaction = id ? pending.get(id) : undefined;
          if (id) pending.delete(id); // Consume before the first await, including failed callbacks.
          const state = query.get('state'), code = query.get('code');
          if (!transaction || transaction.expires <= now() || !state || state.length !== transaction.state.length
            || !timingSafeEqual(Buffer.from(state), Buffer.from(transaction.state))
            || query.getAll('state').length !== 1 || query.getAll('code').length !== 1 || query.has('error')
            || !code || code.length > 4096 || (query.has('iss') && (query.getAll('iss').length !== 1 || query.get('iss') !== options.issuer))) throw new Error('Invalid login transaction.');
          const user = await provider.exchange({ code, nonce: transaction.nonce, verifier: transaction.verifier, redirectUri: `${origin}/auth/callback`, signal: request.signal });
          const response = new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': clearLogin() } });
          response.headers.append('Set-Cookie', await sessions.issue(user));
          return response;
        } catch {
          return Response.json({ error: 'Sign-in could not be completed. Start sign-in again.' }, { status: 400, headers: { 'Set-Cookie': clearLogin() } });
        }
      } finally { active--; }
    },
  };
}

export type HostedOidc = ReturnType<typeof createHostedOidc>;
