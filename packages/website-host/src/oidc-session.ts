import { createHash } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { isHostedUserId, profileText, type HostedOidcConfig } from './oidc-provider';

export type HostedUser = { id: string; fullName?: string; email?: string; emailVerified?: boolean };
export const sessionCookie = (namespace: string) => `__Host-${namespace}_session`;
export const loginCookie = (namespace: string) => `__Host-${namespace}_login`;
// Browsers cap persistent cookies at 400 days. Active use renews the window.
export const hostedSessionSeconds = 34_560_000;
const renewalSeconds = 86_400;

export function authCookie(name: string, value: string, seconds: number) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}

export function readAuthCookie(request: Request, name: string) {
  const header = request.headers.get('cookie') ?? '';
  if (header.length > 16_384) return undefined;
  const matches = header.split(';').map(value => value.trim()).filter(value => value.startsWith(`${name}=`));
  // Reject ambiguity rather than let duplicate cookies select a different identity.
  return matches.length === 1 ? matches[0]!.slice(name.length + 1) : undefined;
}

export function createHostedSessions(config: HostedOidcConfig, origin: string, now = Date.now) {
  const key = createHash('sha256').update(JSON.stringify([`${config.sessionNamespace}-session-v1`, config.issuer, config.clientId, origin, config.sessionSecret])).digest();
  async function issue(user: HostedUser) {
    if (!isHostedUserId(user.id)) throw new Error('Invalid session subject.');
    const issued = Math.floor(now() / 1000);
    const token = await new EncryptJWT({ fullName: profileText(user.fullName, 256), email: profileText(user.email, 320), emailVerified: user.emailVerified === true, clientId: config.clientId })
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: `${config.sessionNamespace}-session+jwt` })
      .setIssuer(config.issuer).setAudience(origin).setSubject(user.id)
      .setIssuedAt(issued).setExpirationTime(issued + hostedSessionSeconds).encrypt(key);
    return authCookie(sessionCookie(config.sessionNamespace), token, hostedSessionSeconds);
  }
  return {
    issue,
    async read(request: Request, responseHeaders?: Headers): Promise<HostedUser | null> {
      const token = readAuthCookie(request, sessionCookie(config.sessionNamespace));
      if (!token || token.length > 4096) return null;
      try {
        const { payload } = await jwtDecrypt(token, key, {
          keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'], typ: `${config.sessionNamespace}-session+jwt`,
          issuer: config.issuer, audience: origin, requiredClaims: ['sub', 'iat', 'exp'],
          maxTokenAge: hostedSessionSeconds, currentDate: new Date(now()),
        });
        if (!isHostedUserId(payload.sub) || payload.clientId !== config.clientId
          || typeof payload.exp !== 'number' || typeof payload.iat !== 'number'
          || payload.exp > payload.iat + hostedSessionSeconds) return null;
        const user = { id: payload.sub, fullName: profileText(payload.fullName, 256), email: profileText(payload.email, 320), ...(payload.emailVerified === true ? { emailVerified: true } : {}) };
        // Upgrade still-valid one-hour sessions too; expired cookies stay invalid.
        if (responseHeaders && (Math.floor(now() / 1000) - payload.iat >= renewalSeconds
          || payload.exp - payload.iat < hostedSessionSeconds)) responseHeaders.append('Set-Cookie', await issue(user));
        return user;
      } catch { return null; }
    },
  };
}
