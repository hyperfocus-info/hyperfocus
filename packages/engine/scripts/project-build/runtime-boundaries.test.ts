import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import type { readGameplaySnapshot3D } from '../../src/project/3d/gameplay/snapshot-reader.ts';
import { createBehaviorBundleEntry, resolveStandaloneRuntimeEntry } from '../build-project.ts';

test('matrix-only consumers do not initialize the deprecated hierarchy constructor', async () => {
  const result = await build({ stdin: { contents: "export { createMat4 } from './src/render/3d-core.ts';", resolveDir: resolve(import.meta.dir, '../..') },
    bundle: true, write: false, format: 'esm', platform: 'neutral', minify: true });
  const output = result.outputFiles[0]!.text;
  expect(output).not.toContain('transform hierarchy capacity');
  expect(output).not.toContain('Reflect.construct');
  const consumer = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
  expect(Array.from(consumer.createMat4())).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
});

test('WebGL packet views retain frustum extraction without transform hierarchy construction', async () => {
  const result = await build({ entryPoints: [resolve(import.meta.dir, '../../src/render/3d-webgl2.ts')],
    bundle: true, write: false, format: 'esm', platform: 'neutral', minify: true, metafile: true });
  const retained = Object.values(result.metafile.outputs).flatMap(output => Object.entries(output.inputs)
    .filter(([, contribution]) => contribution.bytesInOutput > 0).map(([path]) => path.replaceAll('\\', '/')));
  expect(retained.some(path => path.endsWith('/render/three/frustum.ts'))).toBe(true);
  expect(retained.some(path => path.endsWith('/render/3d-core.ts'))).toBe(false);
});

test('authoring preflight retains full startup validation without per-frame execution owners', async () => {
  for (const entry of ['../../tooling/create-project-runtime.ts', './web-project.ts']) {
    const result = await build({ entryPoints: [resolve(import.meta.dir, entry)], bundle: true, write: false,
      format: 'esm', platform: 'node', minify: true, metafile: true, external: ['esbuild'] });
    const retained = Object.values(result.metafile.outputs).flatMap(output => Object.entries(output.inputs)
      .filter(([, contribution]) => contribution.bytesInOutput > 0).map(([path]) => path.replaceAll('\\', '/')));
    for (const owner of ['/runtime/startup.ts', '/runtime/preflight.ts', '/runtime-assets.ts', '/runtime/delivery-resources.ts', '/physics/rigid-3d.ts']) {
      expect(retained.some(path => path.includes(owner))).toBe(true);
    }
    for (const owner of ['/project/runtime-3d.ts', '/physics/ragdoll-3d.ts', '/physics/physical-performance-3d.ts', '/frame/3d.ts', '/project/3d/gameplay.ts']) {
      expect(retained.some(path => path.includes(owner))).toBe(false);
    }
  }
});

test('selected 2D CLI runtime excludes 3D, combat and video implementations', async () => {
  const entry = resolveStandaloneRuntimeEntry('2d');
  expect(createBehaviorBundleEntry([], '2d')).toContain(JSON.stringify(entry));
  const runtime = await Bun.build({ entrypoints: [entry], format: 'esm', target: 'browser', splitting: true, minify: true, metafile: true });
  expect(runtime.success).toBe(true);
  const inputs = Object.values(runtime.metafile!.outputs).flatMap(output => Object.entries(output.inputs)
    .filter(([, contribution]) => contribution.bytesInOutput > 0).map(([path]) => path.replaceAll('\\', '/')));
  expect(inputs.some(path => path.endsWith('/standalone/entry-2d.ts'))).toBe(true);
  // Project declaration validators remain shared; simulation/render implementations do not.
  for (const boundary of ['/standalone-3d.ts', '/project/runtime-3d.ts', '/project/3d/runtime-assets.ts', '/project/3d/gameplay.ts', '/combat/simulation.ts', '/physics/rigid-3d.ts', '/mediabunny/']) {
    expect(inputs.some(path => path.includes(boundary))).toBe(false);
  }
});

test('metadata consumers do not retain timeline factories or any runtime', async () => {
  const result = await Bun.build({ entrypoints: [resolve(import.meta.dir, '../../src/project/metadata/index.ts')],
    format: 'esm', target: 'browser', minify: true, metafile: true });
  expect(result.success).toBe(true);
  expect(Object.keys(result.metafile!.inputs).every(path => path.replaceAll('\\', '/').includes('/project/metadata/'))).toBe(true);
  expect(result.outputs[0]!.size).toBeLessThan(1600);
});

test('replay file codecs are reachable only across dynamic import boundaries', async () => {
  const result = await Bun.build({ entrypoints: [resolve(import.meta.dir, '../../../../apps/engine-editor/src/scene3d/replay/controller.ts'),
    resolve(import.meta.dir, '../../../../apps/engine-editor/src/scene3d/replay/download.ts')],
    format: 'esm', target: 'browser', splitting: true, minify: true, metafile: true });
  expect(result.success).toBe(true);
  const outputs = result.metafile!.outputs, initial = new Set<string>();
  function visit(path: string) {
    if (initial.has(path)) return;
    const output = outputs[path];if (!output) throw Error(`Missing static output ${path}`);
    initial.add(path);
    for (const item of output.imports) if (item.kind !== 'dynamic-import' && outputs[item.path]) visit(item.path);
  }
  for (const [path, output] of Object.entries(outputs)) if (output.entryPoint?.endsWith('/controller.ts') || output.entryPoint?.endsWith('/download.ts')) visit(path);
  expect(initial.size).toBeGreaterThan(0);
  const eager = [...initial].flatMap(path => Object.entries(outputs[path]!.inputs).filter(([, value]) => value.bytesInOutput > 0).map(([input]) => input));
  expect(eager.some(path => /protobuf|replay\/archive\.ts|replay-pb\.ts/.test(path))).toBe(false);
  expect(Object.values(outputs).some(output => Object.keys(output.inputs).some(path => path.endsWith('/replay/archive.ts')))).toBe(true);
});

const root = resolve(import.meta.dir, '../..');

test('current save reader initializes private optional metadata once, including after a rejected read', async () => {
  const result = await build({
    stdin: { contents: "export { readGameplaySnapshot3D } from './src/project/3d/gameplay/snapshot-reader.ts'; export { allocations } from 'reader-allocation-probe';", resolveDir: root },
    bundle: true, write: false, format: 'esm', platform: 'neutral',
    plugins: [{ name: 'reader-allocation-probe', setup(builder) {
      builder.onResolve({ filter: /^reader-allocation-probe$/ }, () => ({ path: 'reader-allocation-probe', namespace: 'probe' }));
      builder.onLoad({ filter: /.*/, namespace: 'probe' }, () => ({ contents: 'export const allocations = []; export function record(reader) { allocations.push(reader.name); }' }));
      builder.onLoad({ filter: /utilities[\\/]src[\\/]validation\.ts$/ }, async ({ path }) => {
        const source = await Bun.file(path).text();
        const signature = 'export function optional<Value>(reader: Reader<Value>): OptionalReader<Value> {';
        if (!source.includes(signature)) throw Error('Optional reader instrumentation no longer matches its owner.');
        return { contents: "import { record } from 'reader-allocation-probe';\n" + source.replace(signature, signature + '\nrecord(reader);'), loader: 'ts' };
      });
    } }],
  });
  const consumer: { readGameplaySnapshot3D: typeof readGameplaySnapshot3D; allocations: string[] } =
    await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.contents).toString('base64')}`);
  const imported = consumer.allocations.length;
  expect(() => consumer.readGameplaySnapshot3D({})).toThrow('Missing required field version.');
  expect(consumer.allocations.length - imported).toBe(1);
  const value = { version: 1 as const, sceneId: 'schema-probe', tick: 0, entities: [] };
  expect(consumer.readGameplaySnapshot3D(value)).toEqual(value);
  expect(consumer.allocations.length - imported).toBe(4);
  const initialized = consumer.allocations.length;
  for (let read = 0; read < 100; read++) {
    const parsed = consumer.readGameplaySnapshot3D(value);
    expect(parsed).toEqual(value);expect(parsed).not.toBe(value);
    expect(Object.hasOwn(parsed, 'combat')).toBe(false);
  }
  expect(consumer.allocations.length).toBe(initialized);
});

test('a consumer of minified public project reader excludes unrelated private schemas', async () => {
  const emitted = await build({ entryPoints: [resolve(root, 'src/project/runtime-3d.ts')],
    bundle: true, write: false, minify: true, format: 'esm', platform: 'neutral', external: ['three'] });
  const result = await build({ stdin: { contents: "export { readGameplayProject3D } from 'emitted-runtime';", resolveDir: root },
    bundle: true, write: false, minify: true, format: 'esm', platform: 'neutral', external: ['three'],
    plugins: [{ name: 'actual-minified-runtime', setup(builder) {
      builder.onResolve({ filter: /^emitted-runtime$/ }, () => ({ path: 'emitted-runtime', namespace: 'emitted' }));
      builder.onLoad({ filter: /.*/, namespace: 'emitted' }, () => ({ contents: emitted.outputFiles[0]!.text }));
    } }],
  });
  const output = result.outputFiles[0]!.text;
  for (const field of ['queuedLearning', 'searchStartFrame', 'maximumPenetrationMeters']) expect(output).not.toContain(field);
  const consumer = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
  const source = { activeSceneId: 'scene', scenes: [{ id: 'scene', entities: [{ components: [{ id: 'c', type: 'motion', enabled: true, values: { speed: 3 } }] }] }] };
  expect(consumer.readGameplayProject3D(source)).toEqual(source);
  source.scenes[0]!.entities[0]!.components[0]!.values.speed = NaN;
  expect(() => consumer.readGameplayProject3D(source)).toThrow();
});
