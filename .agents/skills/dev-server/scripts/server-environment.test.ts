import { expect, test } from 'bun:test';
import path from 'node:path';
import { createDevelopmentSession } from '@hyperfocus/website-host/development-auth';
import { createDevServerEnvironment, devServerRuntimeDirectory } from './server-environment';
import { resolveDevSurface } from './surfaces';

function environment(surface: string, id: string, localAuth = true, isolated = true) {
  const selected = resolveDevSurface(surface);
  if (!selected) throw new Error(`Unknown fixture surface: ${surface}`);
  const inherited = { NODE_ENV: 'production', HOST: '0.0.0.0', HYPERFOCUS_DEV_AUTH: '0', DATABASE_URL: 'postgres://remote/production',
    RAILWAY_ENVIRONMENT_ID: 'inherited-marker', railway_public_domain: 'remote.example',
    BOOKS_PUBLIC_ORIGIN: 'https://books.example', TRADE_PUBLIC_ORIGIN: 'https://trade.example', PADPILOT_PUBLIC_ORIGIN: 'https://market.example',
    BOOKS_SQLITE_PATH: 'persistent-books.sqlite', TRADE_DATABASE_PATH: 'persistent-trade.sqlite',
    PADPILOT_DB_PATH: 'persistent-market.sqlite', PADPILOT_MODULE_UPLOAD_ROOT: 'persistent-uploads', KEEP_LOCAL_SETTING: 'retained' };
  const env = createDevServerEnvironment({ surface: selected, worktreePath: path.resolve('fixture'), id, port: 45_200,
    isolated, localAuth, inherited });
  return { env, inherited };
}

test('explicit local auth overrides production connections with loopback identity and independent per-server storage', () => {
  for (const surface of ['books', 'trade-bot', 'marketplace']) {
    const { env, inherited } = environment(surface, 'first');
    expect(env.HOST).toBe('127.0.0.1'); expect(env.NODE_ENV).toBe('development'); expect(env.HYPERFOCUS_DEV_AUTH).toBe('1');
    expect(env.DATABASE_URL).toBe(''); expect(Object.keys(env).some(key => /^RAILWAY_/i.test(key))).toBe(false);
    expect(env.KEEP_LOCAL_SETTING).toBe('retained'); expect(inherited.RAILWAY_ENVIRONMENT_ID).toBe('inherited-marker');
    expect(inherited.BOOKS_SQLITE_PATH).toBe('persistent-books.sqlite');
    const origin = 'http://127.0.0.1:45200';
    const session = createDevelopmentSession({ env, origin });
    expect(session?.(new Request(origin + '/api/session'))?.id).toBe('user_localDevelopment');
    expect(session?.(new Request(origin + '/api/session', { headers: { Origin: 'https://foreign.example' } }))).toBeNull();
    const originKey = surface === 'books' ? 'BOOKS_PUBLIC_ORIGIN' : surface === 'trade-bot' ? 'TRADE_PUBLIC_ORIGIN' : 'PADPILOT_PUBLIC_ORIGIN';
    expect(env[originKey]).toBe(origin);
    const storageKey = surface === 'books' ? 'BOOKS_SQLITE_PATH' : surface === 'trade-bot' ? 'TRADE_DATABASE_PATH' : 'PADPILOT_DB_PATH';
    expect(env[storageKey]).toStartWith(devServerRuntimeDirectory({ worktreePath: path.resolve('fixture'), id: 'first' }));
    expect(environment(surface, 'second').env[storageKey]).not.toBe(env[storageKey]);
    if (surface === 'marketplace') expect(env.PADPILOT_MODULE_UPLOAD_ROOT).toBe(path.join(env.PADPILOT_DEV_RUNTIME_ROOT!, 'module-uploads'));
  }
});

test('default startup retains its existing environment policy and explicit mode rejects unsafe scopes', () => {
  const { env } = environment('books', 'default', false, false);
  expect(env.RAILWAY_ENVIRONMENT_ID).toBe('inherited-marker'); expect(env.HYPERFOCUS_DEV_AUTH).toBe('0');
  expect(env.BOOKS_SQLITE_PATH).toBe('persistent-books.sqlite');
  expect(() => environment('books', 'first', true, false)).toThrow('isolated');
  expect(() => environment('harness', 'first')).toThrow('Books, Trade Bot, or PadPilot');
  expect(() => environment('books', '../escape')).toThrow('safe runtime');
});
