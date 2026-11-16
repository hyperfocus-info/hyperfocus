import { expect, test } from 'bun:test';
import { ESLint } from 'eslint';
import { collectStandards } from './policy';

const findings = (source: string) => collectStandards('apps/example/src/validation.ts', source).filter(item => item.rule === 'canonical-utilities');

test('finds renamed and reordered copies in focused utility files', () => {
  expect(findings(`function guard(input: unknown) { return !Array.isArray(input) && (input !== null && typeof input === 'object'); }
    const lower = (number: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, number));`)).toHaveLength(2);
});

test('does not substitute changed fallback, default arguments, async/generator or shadowed globals', () => {
  expect(findings(`const Math = domain();
    function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
    function text(value = 'default') { return typeof value === 'string' ? value : ''; }
    function other(value: unknown) { return typeof value === 'string' ? value : 'missing'; }
    async function asyncText(value: unknown) { return typeof value === 'string' ? value : ''; }
    function* generator(value: unknown) { return typeof value === 'string' ? value : ''; }`)).toEqual([]);
});

test('fix preserves local names and exports, then passes the configured lint', async () => {
  const lint = new ESLint({ overrideConfigFile: 'eslint.config.mjs', fix: true });
  const [result] = await lint.lintText(`export function extract(value: unknown) { return typeof value === 'string' ? value : ''; }`, { filePath: 'apps/example/src/extract.ts' });
  expect(result?.errorCount).toBe(0);
  expect(result?.output).toContain("import { text as extract } from '@hyperfocus/utilities/text';");
  expect(result?.output).toContain('export { extract };');
});

test('lower-bound precedence selects its exact owner; nested definitions have no unsafe import fix', () => {
  const lower = findings('function clamp(v: number, low: number, high: number) { return Math.max(low, Math.min(high, v)); }');
  expect(lower[0]?.fix?.text).toContain('clampLowerFirst as clamp');
  const nested = findings('function owner() { function text(v: unknown) { return typeof v === "string" ? v : ""; } return text; }');
  expect(nested[0]?.fix).toBeUndefined();
});

test('canonical package implementations are the allowed source of truth', () => {
  expect(collectStandards('packages/utilities/src/records.ts', 'export function isRecord(v: unknown) { return typeof v === "object" && v !== null && !Array.isArray(v); }')).toEqual([]);
});
