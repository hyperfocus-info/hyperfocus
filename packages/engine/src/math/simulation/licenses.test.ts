import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

test('minified browser bundles retain every vendored simulation math license family', async () => {
  const result = await Bun.build({ entrypoints: [fileURLToPath(new URL('../simulation.ts', import.meta.url))], target: 'browser', format: 'esm', minify: true });
  expect(result.success).toBe(true);
  const source = await result.outputs[0]!.text();
  for (const notice of ['Sun Microsystems', 'The Go Authors', 'The Stdlib Authors', 'Cephes', 'Stephen L. Moshier', 'Apache License', 'TERMS AND CONDITIONS', 'END OF TERMS AND CONDITIONS', 'Redistribution and use in source and binary forms', 'Permission to use, copy, modify, and distribute']) {
    expect(source).toContain(notice);
  }
  expect(source.match(/END OF TERMS AND CONDITIONS/g)).toHaveLength(1);
});

test('package bundling deduplicates the common Apache notice while retaining distinct upstream notices', async () => {
  const result = await build({ entryPoints: [fileURLToPath(new URL('../simulation.ts', import.meta.url))], bundle: true, minify: true, format: 'esm', write: false });
  const source = result.outputFiles[0]!.text;
  expect(source.match(/\* Licensed under the Apache License, Version 2\.0/g)).toHaveLength(1);
  for (const notice of ['Sun Microsystems', 'The Go Authors', 'The Stdlib Authors', 'Cephes', 'Stephen L. Moshier', 'TERMS AND CONDITIONS', 'END OF TERMS AND CONDITIONS', 'Redistribution and use in source and binary forms', 'Permission to use, copy, modify, and distribute']) {
    expect(source).toContain(notice);
  }
  expect(source.match(/END OF TERMS AND CONDITIONS/g)).toHaveLength(1);
});
