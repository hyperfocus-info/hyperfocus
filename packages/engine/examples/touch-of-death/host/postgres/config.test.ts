import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { resolveHostStorageConfig } from './config.ts';

test('explicit local SQLite ignores inherited database secrets without reading them', () => {
  const environment = { TOUCH_OF_DEATH_STORAGE: 'sqlite', TOUCH_OF_DEATH_DATABASE_PATH: '.local/dev.sqlite',
    get DATABASE_URL(): string { throw Error('Connection secret must not be read in SQLite mode'); } };
  expect(resolveHostStorageConfig({ environment })).toEqual({ databasePath: resolve('.local/dev.sqlite'), databaseUrl: undefined });
});

test('direct launches preserve PostgreSQL URL selection and default local SQLite behavior', () => {
  expect(resolveHostStorageConfig({ environment: {} })).toEqual({ databasePath: undefined, databaseUrl: undefined });
  expect(resolveHostStorageConfig({ environment: { DATABASE_URL: 'postgres://user:fixture@localhost/test' } }).databaseUrl).toBe('postgres://user:fixture@localhost/test');
  expect(resolveHostStorageConfig({ environment: { TOUCH_OF_DEATH_STORAGE: 'postgres', DATABASE_URL: 'postgresql://localhost/test' } }).databaseUrl).toBe('postgresql://localhost/test');
});

test('invalid mode or connection scheme fails without exposing the supplied value', () => {
  expect(() => resolveHostStorageConfig({ environment: { TOUCH_OF_DEATH_STORAGE: 'secret-looking-invalid-value' } })).toThrow('must be sqlite or postgres');
  expect(() => resolveHostStorageConfig({ environment: { DATABASE_URL: 'https://sensitive-user:password@example.test' } })).toThrow('must be a PostgreSQL URL');
  try { resolveHostStorageConfig({ environment: { TOUCH_OF_DEATH_STORAGE: 'secret-looking-invalid-value' } }); }
  catch (error) { expect(String(error)).not.toContain('secret-looking-invalid-value'); }
});

test('explicit PostgreSQL and required production storage reject missing runtime credentials', () => {
  for (const environment of [{ TOUCH_OF_DEATH_STORAGE: 'postgres' }, { TOUCH_OF_DEATH_REQUIRE_POSTGRES: '1' }, { RAILWAY_ENVIRONMENT_ID: 'production' }, { RAILWAY_SERVICE_ID: 'relay' }]) {
    expect(() => resolveHostStorageConfig({ environment })).toThrow('requires DATABASE_URL');
  }
});

test('Railway and explicit PostgreSQL requirements cannot be downgraded to SQLite', () => {
  for (const guard of [{ RAILWAY_PROJECT_ID: 'project' }, { RAILWAY_ENVIRONMENT_ID: 'production' }, { RAILWAY_SERVICE_ID: 'relay' }, { RAILWAY_DEPLOYMENT_ID: 'deployment' }, { TOUCH_OF_DEATH_REQUIRE_POSTGRES: '1' }]) {
    expect(() => resolveHostStorageConfig({ environment: { ...guard, TOUCH_OF_DEATH_STORAGE: 'sqlite', DATABASE_URL: 'postgres://localhost/test' } })).toThrow('sqlite is not allowed');
  }
  expect(resolveHostStorageConfig({ environment: { RAILWAY_ENVIRONMENT_ID: 'production', DATABASE_URL: 'postgres://localhost/test' } }).databaseUrl).toBe('postgres://localhost/test');
});
