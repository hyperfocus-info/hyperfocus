import { resolve } from 'node:path';

const directory = resolve('.local/touch-of-death/tactical-evaluation/pre-default-adaptive');
const manifestPath = resolve(directory, 'controller.json');
if (await Bun.file(manifestPath).exists()) throw Error('Previous adaptive factory already frozen; refusing overwrite.');
const entry = resolve('packages/engine/src/project/3d/combat-ai.ts'), sources: Record<string, string> = {}, sourceDigests: Record<string, string> = {};
for await (const path of new Bun.Glob('**/*.ts').scan({ cwd: directory })) {
  const text = await Bun.file(resolve(directory, path)).text();
  sources[resolve('packages/engine/src/project/3d', path)] = text;sourceDigests[path] = new Bun.CryptoHasher('sha256').update(text).digest('hex');
}
if (sourceDigests['combat-ai.ts'] !== 'ad3421ca2058830b239b6223c1d146750a8127f09d1b107771a5f58000f154c4') throw Error('Pre-steering entry source changed or missing.');
const result = await Bun.build({ entrypoints: [entry], outdir: directory, naming: 'controller.js', target: 'bun', plugins: [{ name: 'previous-adaptive-source', setup(builder) {
  builder.onLoad({ filter: /\.ts$/ }, args => sources[resolve(args.path)] === undefined ? undefined : { loader: 'ts', contents: sources[resolve(args.path)]! });
} }] });
if (!result.success) throw new AggregateError(result.logs, 'Could not preserve previous adaptive factory.');
const checkpoint = resolve(directory, 'controller.js');
const manifest = { version: 1, frozenAt: new Date().toISOString(), checkpoint,
  sha256: new Bun.CryptoHasher('sha256').update(new Uint8Array(await Bun.file(checkpoint).arrayBuffer())).digest('hex'), sourceDigests,
  priorEngineSha256: '03bae2d134a6186a7a84e881beff53040315cb7e7d6ad27827d446ef0d0ca51c',
  note: 'Retained pre-steering AI entry/subtree loaded at original import paths. Non-AI dependencies resolve current source; seeded replay against prior engine required.' };
await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));console.log(JSON.stringify(manifest));
