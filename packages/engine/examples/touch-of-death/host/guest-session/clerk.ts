import { verifyToken } from '@clerk/backend';
import { guestRejected } from './request.ts';

/** The configured public key selects one exact HTTPS frontend and JWT issuer. */
export function readClerkFrontendOrigin(publishableKey: string) {
  if (!/^pk_(test|live)_[A-Za-z0-9+/=]+$/.test(publishableKey)) throw new Error('Invalid Clerk publishable key.');
  const domain = Buffer.from(publishableKey.split('_')[2]!, 'base64').toString('utf8');
  if (!/^[a-z0-9.-]+\$$/.test(domain) || !domain.includes('.')) throw new Error('Invalid Clerk frontend domain.');
  const issuer = `https://${domain.slice(0, -1)}`;
  if (new URL(issuer).origin !== issuer) throw new Error('Invalid Clerk frontend domain.');
  return issuer;
}

/** Clerk owns OAuth; the game exchanges its short-lived session JWT for a one-use lease token. */
export function createClerkIdentity(options: { publishableKey: string; secretKey: string; jwtKey?: string; origin: string }) {
  if (!/^sk_(test|live)_/.test(options.secretKey)) throw new Error('Configure both Clerk publishable and secret keys.');
  const issuer = readClerkFrontendOrigin(options.publishableKey);
  return async (request: Request) => {
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ') || authorization.length > 16384) throw guestRejected('Sign in to play online.', 401, 'clerk-sign-in-required');
    try {
      const claims = await verifyToken(authorization.slice(7), { secretKey: options.secretKey, jwtKey: options.jwtKey, authorizedParties: [options.origin] });
      if (claims.iss !== issuer || claims.azp !== options.origin || !/^user_[A-Za-z0-9]+$/.test(claims.sub) || !claims.sid) throw new Error('Wrong Clerk session.');
      return `clerk:${claims.sub}`;
    } catch { throw guestRejected('Your sign-in expired. Sign in again.', 401, 'clerk-sign-in-required'); }
  };
}
