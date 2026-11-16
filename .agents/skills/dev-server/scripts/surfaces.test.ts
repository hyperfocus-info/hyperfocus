import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { resolveDevSurface } from './surfaces.ts';
import { resolveHostStorageConfig } from '@hyperfocus/touch-of-death/host/postgres/config';

test('saved native runs reuse the lab server implementation without needing or replacing its active artifact',()=>{
  const surface=resolveDevSurface('touch-of-death-runs')!,lab=resolveDevSurface('touch-of-death-lab')!;
  const previous = process.env.PERF_LAB_ARTIFACT_DIR;
  try {
    process.env.PERF_LAB_ARTIFACT_DIR = '.local/lab-artifact';
    expect(surface.command(resolve('.'))).toEqual(lab.command(resolve('.')));
  } finally {
    if (previous === undefined) delete process.env.PERF_LAB_ARTIFACT_DIR;
    else process.env.PERF_LAB_ARTIFACT_DIR = previous;
  }
  expect(surface.defaultPort).not.toBe(lab.defaultPort);
  expect(surface.environment(8828).PERF_NATIVE_SHARES_ONLY).toBe('1');
  expect(surface.environment(8828).PORT).toBe('8828');
  expect(lab.environment(8827).PERF_NATIVE_SHARES_ONLY).toBeUndefined();
});

test('editor acceptance runs an extracted artifact from its own directory', () => {
  const previous = process.env.ENGINE_EDITOR_ARTIFACT_DIR;
  try {
    const surface = resolveDevSurface('editor')!;
    process.env.ENGINE_EDITOR_ARTIFACT_DIR = '.local/extracted-editor';
    const directory = resolve(process.env.ENGINE_EDITOR_ARTIFACT_DIR);
    expect(surface.command(resolve('.'))).toEqual([process.execPath, '--cwd', directory, resolve(directory, 'cli.js'), 'serve']);
    expect(surface.environment(8821).ENGINE_EDITOR_ARTIFACT_DIR).toBe(directory);
    expect(surface.environment(8821).HYPERFOCUS_EDITOR_OUTPUT_ROOT).toBe(directory);
    delete process.env.ENGINE_EDITOR_ARTIFACT_DIR;
    expect(surface.command(resolve('.'))).toEqual([process.execPath, resolve('apps/engine-editor/dev.ts')]);
    expect(surface.environment(8821).ENGINE_EDITOR_ARTIFACT_DIR).toBeUndefined();
  } finally {
    if (previous === undefined) delete process.env.ENGINE_EDITOR_ARTIFACT_DIR;
    else process.env.ENGINE_EDITOR_ARTIFACT_DIR = previous;
  }
});

test('Touch of Death audio runs the packaged server independently of the shared artifact review surface', () => {
  const previous = process.env.TOUCH_OF_DEATH_WEB_DIR;
  try {
    const surface = resolveDevSurface('touch-of-death-audio')!;expect(surface.defaultPort).toBe(8797);expect(surface.healthPath).toBe('/healthz');
    process.env.TOUCH_OF_DEATH_WEB_DIR = '.local/touch-of-death/music-playlists/web';const directory = resolve(process.env.TOUCH_OF_DEATH_WEB_DIR);
    expect(surface.command(resolve('.'))).toEqual([process.execPath, '--cwd', directory, resolve(directory, 'deploy.js')]);expect(surface.environment(8820)).toEqual({ PORT: '8820', HOST: '0.0.0.0', TOUCH_OF_DEATH_WEB_DIR: directory });
    expect(resolveDevSurface('artifact-review')!.defaultPort).toBe(4318);delete process.env.TOUCH_OF_DEATH_WEB_DIR;expect(() => surface.command(resolve('.'))).toThrow('TOUCH_OF_DEATH_WEB_DIR');
  } finally {
    if (previous === undefined) delete process.env.TOUCH_OF_DEATH_WEB_DIR;else process.env.TOUCH_OF_DEATH_WEB_DIR = previous;
  }
});

function withStorageMode(mode: string | undefined, run: () => void) {
  const previous = process.env.TOUCH_OF_DEATH_STORAGE;
  try {
    if (mode === undefined) delete process.env.TOUCH_OF_DEATH_STORAGE;
    else process.env.TOUCH_OF_DEATH_STORAGE = mode;
    run();
  } finally {
    if (previous === undefined) delete process.env.TOUCH_OF_DEATH_STORAGE;
    else process.env.TOUCH_OF_DEATH_STORAGE = previous;
  }
}

test('combat relay runs the selected external artifact with the explicit project', () => {
  const projectBefore = process.env.TOUCH_OF_DEATH_PROJECT_DIR;
  const artifactBefore = process.env.TOUCH_OF_DEATH_HOST_ARTIFACT;
  try {
    process.env.TOUCH_OF_DEATH_PROJECT_DIR = '.local/test-project';
    process.env.TOUCH_OF_DEATH_HOST_ARTIFACT = '.local/test-package/host.js';
    const surface = resolveDevSurface('combat-relay')!;
    expect(surface.command(resolve('.'))).toEqual([process.execPath, '--cwd', resolve('.local/test-package'), resolve('.local/test-package/host.js'), '--project', resolve('.local/test-project')]);
    withStorageMode(undefined, () => expect(surface.environment(8811)).toEqual({ PORT: '8811', HOST: '127.0.0.1',
      TOUCH_OF_DEATH_STORAGE: 'sqlite', TOUCH_OF_DEATH_REQUIRE_POSTGRES: '0', DATABASE_URL: '' }));
    delete process.env.TOUCH_OF_DEATH_HOST_ARTIFACT;
    expect(surface.command(resolve('.'))[1]).toBe(resolve('packages/engine/examples/touch-of-death/host/relay.ts'));
    delete process.env.TOUCH_OF_DEATH_PROJECT_DIR;
    expect(() => surface.command(resolve('.'))).toThrow('TOUCH_OF_DEATH_PROJECT_DIR');
  } finally {
    if (projectBefore === undefined) delete process.env.TOUCH_OF_DEATH_PROJECT_DIR;
    else process.env.TOUCH_OF_DEATH_PROJECT_DIR = projectBefore;
    if (artifactBefore === undefined) delete process.env.TOUCH_OF_DEATH_HOST_ARTIFACT;
    else process.env.TOUCH_OF_DEATH_HOST_ARTIFACT = artifactBefore;
  }
});

test('managed combat relay defaults to SQLite despite inherited production database settings', () => {
  withStorageMode(undefined, () => {
    const overrides = resolveDevSurface('combat-relay')!.environment(8811);
    const environment = { DATABASE_URL: 'postgres://fixture:credential@database.test/prod', TOUCH_OF_DEATH_REQUIRE_POSTGRES: '1', ...overrides };
    expect(resolveHostStorageConfig({ environment }).databaseUrl).toBeUndefined();
    expect(overrides.DATABASE_URL).toBe('');
    expect(JSON.stringify(overrides)).not.toContain('credential');
  });
});

test('managed PostgreSQL acceptance requires explicit storage mode and keeps credentials out of launch overrides', () => {
  withStorageMode('postgres', () => {
    const overrides = resolveDevSurface('combat-relay')!.environment(8811);
    expect(overrides.TOUCH_OF_DEATH_STORAGE).toBe('postgres');
    expect(overrides.TOUCH_OF_DEATH_REQUIRE_POSTGRES).toBe('1');
    expect(Object.hasOwn(overrides, 'DATABASE_URL')).toBe(false);
    expect(resolveHostStorageConfig({ environment: { DATABASE_URL: 'postgres://localhost/acceptance', ...overrides } }).databaseUrl).toBe('postgres://localhost/acceptance');
    expect(() => resolveHostStorageConfig({ environment: overrides })).toThrow('requires DATABASE_URL');
  });
});

test('managed storage rejects invalid mode and cannot override a real Railway deployment requirement', () => {
  withStorageMode('invalid', () => expect(() => resolveDevSurface('combat-relay')!.environment(8811)).toThrow('must be sqlite or postgres'));
  withStorageMode(undefined, () => {
    const overrides = resolveDevSurface('combat-relay')!.environment(8811);
    expect(() => resolveHostStorageConfig({ environment: { RAILWAY_ENVIRONMENT_ID: 'production', ...overrides } })).toThrow('sqlite is not allowed');
  });
});

test('external surfaces require explicit artifacts and never refer to excluded application sources', () => {
 for (const [name, variable, entry] of [['books','BOOKS_ARTIFACT_DIR','server.js'],['trade-bot','TRADE_ARTIFACT_DIR','server.js'],['touch-of-death-lab','PERF_LAB_ARTIFACT_DIR','serve.js'],['touch-of-death-runs','PERF_LAB_ARTIFACT_DIR','serve.js']]) {
 const previous = process.env[variable!];
 try {
 delete process.env[variable!];const surface = resolveDevSurface(name!)!;
 expect(() => surface.command(resolve('.'))).toThrow(variable!);
 process.env[variable!] = '.local/external-artifact';
 expect(surface.command(resolve('.'))).toEqual([process.execPath, '--cwd', resolve('.local/external-artifact'), resolve('.local/external-artifact', entry!)]);
 } finally { if (previous === undefined) delete process.env[variable!];else process.env[variable!] = previous; }
 }
});
