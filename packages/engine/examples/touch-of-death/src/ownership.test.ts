import { expect, test } from 'bun:test';
import { resolve } from 'node:path';

test('game authoring and relay bundle without editor application source', async () => {
  const result = await Bun.build({
    entrypoints: [resolve(import.meta.dir, 'presentation/arena.ts'), resolve(import.meta.dir, '../host/relay.ts')],
    target: 'bun', metafile: true,
  });
  expect(result.logs.filter(log => log.level === 'error')).toEqual([]);
  expect(result.success).toBe(true);
  const inputs = Object.keys(result.metafile?.inputs ?? {}).map(path => path.replaceAll('\\', '/'));
  expect(inputs.length).toBeGreaterThan(20);
  expect(inputs.filter(path => /(?:^|\/)apps\//.test(path))).toEqual([]);
});
