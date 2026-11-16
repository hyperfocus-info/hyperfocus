import { z } from 'zod';
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';

export const hyperfocusOidcIssuer = 'https://clerk.hyperfocus.info';
export type HostedOidcConfig = { issuer: string; clientId: string; clientSecret: string; sessionSecret: string; discoveryUrl?: string; sessionNamespace: string };
export type HostedOidcFetch = (url: string, init: RequestInit) => Promise<Response>;

function trustedUrl(value: unknown, issuer: string) {
  if (typeof value !== 'string') throw new Error('Missing OIDC endpoint.');
  const url = new URL(value);
  if (url.origin !== issuer || url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Untrusted OIDC endpoint.');
  return url;
}

export function validateHostedOidcConfig(config: HostedOidcConfig) {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(config.sessionNamespace)) throw new Error('Invalid session namespace.');
  // This host trusts one identity namespace, never a caller-supplied discovery host.
  if (config.issuer !== hyperfocusOidcIssuer) throw new Error('OIDC issuer must be the trusted Hyperfocus Clerk issuer.');
  if (!config.clientId || !config.clientSecret || config.clientId.length > 1024 || config.clientSecret.length > 4096) throw new Error('Configure OIDC client credentials.');
  if (Buffer.byteLength(config.sessionSecret) < 32) throw new Error('Session secret must contain at least 32 random bytes.');
  const discovery = trustedUrl(config.discoveryUrl ?? `${config.issuer}/.well-known/openid-configuration`, config.issuer);
  if (!['/.well-known/openid-configuration', '/.well-known/oauth-authorization-server'].includes(discovery.pathname) || discovery.search) throw new Error('Untrusted OIDC discovery URL.');
  return discovery.href;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid OIDC response.');
  // JSON objects have string keys; values remain unknown until checked below.
  return z.record(z.unknown()).parse(value);
}

function supports(value: unknown, required: string) {
  return Array.isArray(value) && value.includes(required);
}

/** Trusted, bounded, non-redirecting backchannel. Never log or return provider bodies. */
export function createHostedOidcProvider(config: HostedOidcConfig, fetcher: HostedOidcFetch = fetch) {
  const discovery = validateHostedOidcConfig(config);
  async function fetchJson(url: string, init: RequestInit = {}) {
    trustedUrl(url, config.issuer);
    const timeout = AbortSignal.timeout(5000);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    const response = await fetcher(url, { ...init, signal, redirect: 'error', credentials: 'omit' });
    if (response.status !== 200 || response.redirected || !response.body) throw new Error('OIDC endpoint unavailable.');
    const reader = response.body.getReader();
    const abort = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 262_144) throw new Error('OIDC response is too large.');
        chunks.push(value);
      }
      signal.throwIfAborted();
      return object(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } finally {
      signal.removeEventListener('abort', abort);
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  async function discover() {
    const data = await fetchJson(discovery);
    if (data.issuer !== config.issuer || !supports(data.response_types_supported, 'code')
      || !supports(data.id_token_signing_alg_values_supported, 'RS256')
      || (data.code_challenge_methods_supported !== undefined && !supports(data.code_challenge_methods_supported, 'S256'))
      || (data.token_endpoint_auth_methods_supported !== undefined && !supports(data.token_endpoint_auth_methods_supported, 'client_secret_basic'))) throw new Error('Unsupported OIDC metadata.');
    const authorizationUrl = trustedUrl(data.authorization_endpoint, config.issuer).href;
    const tokenUrl = trustedUrl(data.token_endpoint, config.issuer).href;
    const jwksUrl = trustedUrl(data.jwks_uri, config.issuer);
    const keys = createRemoteJWKSet(jwksUrl, {
      [customFetch]: async (url, init) => Response.json(await fetchJson(url, init)),
    });
    return { authorizationUrl, tokenUrl, keys };
  }
  let metadata: ReturnType<typeof discover> | undefined;
  const getMetadata = () => metadata ??= discover().catch(error => { metadata = undefined; throw error; });
  return {
    async authorizationUrl() { return (await getMetadata()).authorizationUrl; },
    async exchange(options: { code: string; verifier: string; nonce: string; redirectUri: string; signal: AbortSignal }) {
      const { tokenUrl, keys } = await getMetadata();
      // RFC 6749 client_secret_basic encodes each credential as a form value first.
      const form = (value: string) => new URLSearchParams({ value }).toString().slice(6);
      const authorization = Buffer.from(`${form(config.clientId)}:${form(config.clientSecret)}`).toString('base64');
      const tokens = await fetchJson(tokenUrl, {
        method: 'POST', signal: options.signal,
        headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code: options.code, redirect_uri: options.redirectUri, code_verifier: options.verifier }),
      });
      if (typeof tokens.id_token !== 'string' || tokens.id_token.length > 16_384) throw new Error('Missing ID token.');
      const { payload } = await jwtVerify(tokens.id_token, keys, {
        algorithms: ['RS256'], issuer: config.issuer, audience: config.clientId,
        requiredClaims: ['sub', 'iat', 'exp', 'nonce'], maxTokenAge: 600,
      });
      if (payload.nonce !== options.nonce || !isHostedUserId(payload.sub)
        || (payload.azp !== undefined && payload.azp !== config.clientId)
        || (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.clientId)) throw new Error('Invalid OIDC identity.');
      return { id: payload.sub, fullName: profileText(payload.name, 256), email: profileText(payload.email, 320), ...(payload.email_verified === true ? { emailVerified: true } : {}) };
    },
  };
}

export function isHostedUserId(value: unknown): value is string {
  return typeof value === 'string' && /^user_[A-Za-z0-9]{1,128}$/.test(value);
}

export function profileText(value: unknown, limit: number) {
  return typeof value === 'string' && value.length > 0 && value.length <= limit ? value : undefined;
}
