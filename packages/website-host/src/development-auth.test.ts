import { expect, test } from 'bun:test';
import { createDevelopmentSession } from './development-auth';

test('only explicit development on loopback enables the shared identity', () => {
  for (const origin of ['http://localhost:8788', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
    const session = createDevelopmentSession({ env: { NODE_ENV: 'development' }, origin });
    const first = session?.(new Request(`${origin}/api/session`));
    expect(first?.fullName).toBe('Local developer');
    expect(session?.(new Request(`${origin}/api/books`))).toEqual(first);
    expect(first?.emailVerified).toBe(false);
  }
  for (const env of [{}, { NODE_ENV: 'test' }, { NODE_ENV: 'production', HYPERFOCUS_DEV_AUTH: '1' },
    { NODE_ENV: 'development', HYPERFOCUS_DEV_AUTH: '0' }, { NODE_ENV: 'development', RAILWAY_ENVIRONMENT_ID: 'hosted' }]) {
    expect(createDevelopmentSession({ env, origin: 'http://localhost:3000' })).toBeUndefined();
  }
  for (const origin of ['https://books.hyperfocus.info', 'http://192.168.1.2:3000', 'https://localhost.example.com', 'http://localhost:3000/path']) {
    expect(createDevelopmentSession({ env: { NODE_ENV: 'development' }, origin })).toBeUndefined();
  }
});

test('no bypass for alternate hosts, ports, cross-site requests or originless mutations', () => {
  const origin = 'http://127.0.0.1:3000';
  const session = createDevelopmentSession({ env: { NODE_ENV: 'development' }, origin })!;
  expect(session(new Request(`${origin}/api/books`, { method: 'PUT', headers: { Origin: origin } }))).not.toBeNull();
  for (const request of [
    new Request('http://evil.test/api/books', { headers: { 'X-Forwarded-Host': '127.0.0.1:3000' } }),
    new Request('http://127.0.0.1:3001/api/books'),
    new Request(`${origin}/api/books`, { headers: { Origin: 'https://evil.test' } }),
    new Request(`${origin}/api/books`, { headers: { 'Sec-Fetch-Site': 'cross-site' } }),
    new Request(`${origin}/api/books`, { method: 'DELETE' }),
  ]) expect(session(request)).toBeNull();
});
