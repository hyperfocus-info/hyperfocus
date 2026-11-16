import { tokens } from "./utils/compact-shaders-values";
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { compactShaderSource } from './compact-shaders';



test('compacted shipped shader templates preserve every GLSL token and version directive', () => {
 const source = readFileSync(new URL('../../src/render/webgl2/shaders.ts', import.meta.url), 'utf8');
 const shaders = [...source.matchAll(/`([^`]+)`/g)];expect(shaders.length).toBe(4);
 for (const [, shader] of shaders) {
  const compact = compactShaderSource(shader!);
  expect(compact.startsWith('#version 300 es\n')).toBe(true);
  expect(tokens(compact)).toEqual(tokens(shader!));
  expect(compact.length).toBeLessThan(shader!.length);
 }
});

test('compaction keeps operator boundaries and preprocessor line endings', () => {
 const source = '#version 300 es\n#define VALUE 1\nvoid main() { float x = a + +b; x = x - -b; }';
 const compact = compactShaderSource(source);
 expect(compact).toContain('#define VALUE 1\n');expect(tokens(compact)).toEqual(tokens(source));
});
