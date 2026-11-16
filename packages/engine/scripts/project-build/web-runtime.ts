import { resolve } from 'node:path';
import type { HyperfocusExchangeFile } from '../../src/project/index.ts';

/** Bun emits actual browser ESM boundaries for import(), including their shared chunks. */
export async function buildWebRuntime(options: { entrypoint?: string; source?: string; resolveDirectory?: string; debug?: boolean }) {
  const source = options.source;
  if (!source && !options.entrypoint) throw Error('A web runtime entrypoint is required.');
  // Runtime supports this Bun 1.4 option before the workspace's declaration package exposes it.
  const configuration: Parameters<typeof Bun.build>[0] & { modulePreload: boolean } = {
    entrypoints: [source ? 'hyperfocus-web-entry' : resolve(options.entrypoint!)],
    target: 'browser', format: 'esm', splitting: true, modulePreload: true,
    minify: !options.debug, sourcemap: options.debug ? 'external' : 'none', metafile: true,
    naming: { entry: 'runtime/[name]-[hash].[ext]', chunk: 'runtime/chunk-[hash].[ext]', asset: 'runtime/[name]-[hash].[ext]' },
    ...(source ? { define: { __HYPERFOCUS_STANDALONE_AUTO_BOOT__: 'false' }, plugins: [{ name: 'hyperfocus-generated-entry', setup(build) {
      build.onResolve({ filter: /^hyperfocus-web-entry$/ }, () => ({ path: 'hyperfocus-web-entry', namespace: 'hyperfocus' }));
      build.onLoad({ filter: /.*/, namespace: 'hyperfocus' }, () => ({ contents: source, loader: 'ts', resolveDir: options.resolveDirectory ?? process.cwd() }));
    } }] } : {}),
  };
  const result = await Bun.build(configuration);
  if (!result.success) throw Error(`Web runtime compilation failed:\n${result.logs.map(log => log.message).join('\n')}`);
  const entry = result.outputs.find(output => output.kind === 'entry-point' && output.path.endsWith('.js'));
  if (!entry) throw Error('The web runtime build did not emit an entry.');
  const path = (value: string) => value.replace(/\\/g, '/').replace(/^\.\//, '');
  const files: HyperfocusExchangeFile[] = await Promise.all(result.outputs.map(async output => ({ path: path(output.path),
    mimeType: output.path.endsWith('.js') ? 'text/javascript' : 'application/json', bytes: new Uint8Array(await output.arrayBuffer()) })));
  const preload = new Set<string>(), outputs = result.metafile?.outputs ?? {};
  function visit(name: string) {
    const normalized = path(name);if (preload.has(normalized)) return;
    preload.add(normalized);
    const output = Object.entries(outputs).find(([key]) => path(key) === normalized)?.[1];
    for (const dependency of output?.imports ?? []) if (dependency.kind === 'import-statement' && Object.keys(outputs).some(key => path(key) === path(dependency.path))) visit(dependency.path);
  }
  visit(entry.path);
  return { entry: path(entry.path), files, preload: [...preload], inputs: Object.keys(result.metafile?.inputs ?? {}) };
}
