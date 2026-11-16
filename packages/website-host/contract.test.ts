import { expect, test } from 'bun:test';
import { createHostedSessions } from '@hyperfocus/website-host/oidc-session';
import { validateHostedOidcConfig } from '@hyperfocus/website-host/oidc-provider';

test('public session contract separates app namespaces and retains verified email', async () => {
  const config = { issuer: 'https://clerk.hyperfocus.info', clientId: 'test-client', clientSecret: 'test-client-secret', sessionSecret: 'disposable-session-secret-at-least-32-bytes', sessionNamespace: 'trade' };
  expect(validateHostedOidcConfig(config)).toBe(config.issuer + '/.well-known/openid-configuration');
  const trade = createHostedSessions(config, 'https://trade.example'), books = createHostedSessions({ ...config, sessionNamespace: 'books' }, 'https://trade.example');
  const cookie = (await trade.issue({ id: 'user_test', email: 'owner@example.com', emailVerified: true })).split(';')[0]!;
  const request = new Request('https://trade.example', { headers: { Cookie: cookie } });
  expect((await trade.read(request))?.emailVerified).toBe(true); expect(await books.read(request)).toBeNull();
  const renamed = new Request(request.url, { headers: { Cookie: cookie.replace('__Host-trade_session', '__Host-books_session') } });
  expect(await books.read(renamed)).toBeNull();
});
