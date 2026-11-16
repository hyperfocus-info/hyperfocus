import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';import { join } from 'node:path';
import { optimizePackageJavaScript } from './optimize-javascript';

test('optimization preserves public properties, exports, dynamic chunks, directives, and non-JavaScript assets', async () => {
 const root = await mkdtemp(join(tmpdir(), 'engine-optimize-'));
 try {
  await mkdir(join(root, 'chunks'));
  await writeFile(join(root, 'entry.js'), '/*! preserved license */\nexport const publicObject = { publicField: 7 }; export async function load() { return (await import("./chunks/lazy.js")).value; }');
  await writeFile(join(root, 'chunks/lazy.js'), 'export const value = 9;');
  await writeFile(join(root, 'empty.js'), '/* intentionally empty side-effect chunk */');
  await writeFile(join(root, 'asset.wasm'), new Uint8Array([0, 1, 2]));
  await optimizePackageJavaScript(root);
  const module = await import(join(root, 'entry.js'));
  expect(module.publicObject.publicField).toBe(7);expect(await module.load()).toBe(9);
  expect(await readFile(join(root, 'entry.js'), 'utf8')).toContain('preserved license');
  expect([...await readFile(join(root, 'asset.wasm'))]).toEqual([0, 1, 2]);
 } finally { await rm(root, { recursive: true, force: true }); }
});
