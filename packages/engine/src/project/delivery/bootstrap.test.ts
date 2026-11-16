import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { deliveryBootstrapSource } from './bootstrap.ts';

test('minified build preserves the self-contained stream reader in generated HTML', async () => {
  const bundle = await build({ entryPoints: [import.meta.path.replace('bootstrap.test.ts', 'bootstrap.ts')], bundle: true, minify: true, platform: 'browser', format: 'cjs', write: false });
  const exports = {}, module = { exports };
  runInNewContext(bundle.outputFiles[0]!.text, { module, exports });
  const object = { url: 'object.bin', size: 2, sha256: 'a'.repeat(64) };
  const sandbox = { AbortController, URL, Map, Uint8Array, setTimeout, clearTimeout, document: { baseURI: 'https://game.test/' }, addEventListener() {}, fetch: async () => new Response(new Uint8Array([1, 2])) };
  runInNewContext(Reflect.get(module.exports, 'deliveryBootstrapSource')({ manifest: object, project: object, core: object }), sandbox);
  const bytes = await Reflect.get(sandbox, '__hyperfocusDeliveryBootstrap').objects.get('https://game.test/object.bin').bytes;
  expect([...bytes]).toEqual([1, 2]);
});

test('early downloads overlap, omit credentials, bound decoded bytes, and abort on page disposal', async () => {
  const requests: Array<{ url: string; signal: AbortSignal; credentials: string }> = [];
  let pagehide!: () => void;
  const objects = ['manifest', 'project', 'core'].map(name => ({ url: `${name}.bin`, size: 2, sha256: 'a'.repeat(64) }));
  const sandbox = { AbortController, URL, Map, Uint8Array, setTimeout, clearTimeout, document: { baseURI: 'https://game.test/build/' },
    addEventListener: (_: string, listener: () => void) => { pagehide = listener; },
    fetch: async (url: string, options: { signal: AbortSignal; credentials: string }) => {
      requests.push({ url, ...options });
      return new Response(new Uint8Array(url.includes('core') ? [1, 2, 3] : [1, 2]));
    },
  };
  runInNewContext(deliveryBootstrapSource({ manifest: objects[0]!, project: objects[1]!, core: objects[2]! }), sandbox);
  expect(requests).toHaveLength(3);expect(requests.every(request => request.credentials === 'omit')).toBe(true);
  const early = Reflect.get(sandbox, '__hyperfocusDeliveryBootstrap');
  const results = await Promise.allSettled([...early.objects.values()].map((value: { bytes: Promise<Uint8Array> }) => value.bytes));
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled', 'rejected']);
  pagehide();expect(requests.every(request => request.signal.aborted)).toBe(true);
});

test('early requests also bound a connection that never sends response headers', async () => {
  const object = { url: 'object.bin', size: 2, sha256: 'a'.repeat(64) };
  const sandbox = { AbortController, URL, Map, Uint8Array, clearTimeout,
    setTimeout: (callback: () => void) => setTimeout(callback, 5),
    document: { baseURI: 'https://game.test/' }, addEventListener() {},
    fetch: (_url: string, options: { signal: AbortSignal }) => new Promise<Response>((_, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }),
  };
  runInNewContext(deliveryBootstrapSource({ manifest: object, project: object, core: object }), sandbox);
  const early = Reflect.get(sandbox, '__hyperfocusDeliveryBootstrap');
  await expect(early.objects.get('https://game.test/object.bin').bytes).rejects.toThrow('connection stalled');
  expect(early.controller.signal.aborted).toBe(false);
});

test('page disposal aborts all early requests while headers are pending', async () => {
  let pagehide!: () => void;
  const object = { size: 2, sha256: 'a'.repeat(64) };
  const sandbox = { AbortController, URL, Map, Uint8Array, setTimeout, clearTimeout,
    document: { baseURI: 'https://game.test/' }, addEventListener: (_: string, listener: () => void) => { pagehide = listener; },
    fetch: (_url: string, options: { signal: AbortSignal }) => new Promise<Response>((_, reject) => {
      options.signal.addEventListener('abort', () => reject(Error('Page disposed')), { once: true });
    }),
  };
  runInNewContext(deliveryBootstrapSource({ manifest: { ...object, url: 'manifest' }, project: { ...object, url: 'project' }, core: { ...object, url: 'core' } }), sandbox);
  const early = Reflect.get(sandbox, '__hyperfocusDeliveryBootstrap');pagehide();
  const outcomes = await Promise.allSettled([...early.objects.values()].map((item: { bytes: Promise<Uint8Array> }) => item.bytes));
  expect(outcomes.map(result => result.status)).toEqual(['rejected', 'rejected', 'rejected']);
});
