import { expect, test } from 'bun:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createClerkIdentity, readClerkFrontendOrigin } from './clerk.ts';

test('production Clerk public keys select one exact HTTPS frontend without policy injection', () => {
  expect(readClerkFrontendOrigin('pk_live_Y2xlcmsuaHlwZXJmb2N1cy5pbmZvJA')).toBe('https://clerk.hyperfocus.info');
  for (const domain of ['clerk.example/path$', 'clerk.example:443$', 'clerk.example; https:$', 'clerk.example\"$', 'clerk.example$\n']) {
    expect(() => readClerkFrontendOrigin(`pk_live_${Buffer.from(domain).toString('base64')}`)).toThrow();
  }
  expect(() => readClerkFrontendOrigin('sk_live_invalid')).toThrow();
});

test('Clerk identity requires the configured issuer, party, live signed session and user subject', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const origin = 'https://game.example', issuer = 'https://fixture.clerk.accounts.dev';
  const verify = createClerkIdentity({ publishableKey: `pk_test_${Buffer.from('fixture.clerk.accounts.dev$').toString('base64')}`, secretKey: 'sk_test_fixture', jwtKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(), origin });
  const time = Math.floor(Date.now() / 1000);
  const payload = { iss: issuer, azp: origin, sub: 'user_123', sid: 'sess_123', exp: time + 60, nbf: time - 5, iat: time - 5 };
  function request(patch: Record<string, unknown> = {}, tamper = false) {
    const data = `${Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'fixture' })).toString('base64url')}.${Buffer.from(JSON.stringify({ ...payload, ...patch })).toString('base64url')}`;
    const signature = sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url');
    return new Request(origin, { headers: { authorization: `Bearer ${data}.${tamper ? signature.slice(3) : signature}` } });
  }
  expect(await verify(request())).toBe('clerk:user_123');
  for (const patch of [{ iss: 'https://foreign.clerk.accounts.dev' }, { azp: 'https://foreign.example' }, { azp: undefined }, { exp: time - 60 }, { sub: 'guest:forged' }, { sid: undefined }]) await expect(verify(request(patch))).rejects.toThrow();
  await expect(verify(request({}, true))).rejects.toThrow();
  await expect(verify(new Request(origin))).rejects.toThrow();
});
