import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { portableSqrt, sqrt } from './sqrt.ts';
import { isRecord } from '@hyperfocus/utilities/records';

// Independent IEEE oracle for the integer algorithm; both production paths must agree.
const oracleExport = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array([
  0,97,115,109,1,0,0,0,1,6,1,96,1,124,1,124,3,2,1,0,7,8,1,4,115,113,114,116,0,0,10,7,1,5,0,32,0,159,11,
]))).exports.sqrt;
function oracle(value: number): number { if (typeof oracleExport !== "function") throw new Error("Missing oracle export"); return oracleExport(value); }

test('portable sqrt preserves IEEE exceptional values, signed zero, subnormals and rounding boundaries', () => {
  const values = [0, -0, NaN, Infinity, -Infinity, -1, Number.MIN_VALUE, Number.MAX_VALUE,
    2.2250738585072014e-308, 2.2250738585072014e-308 - Number.MIN_VALUE, 1, 2, 3, 4, 9, .25, 1e-300, 1e300];
  const bits = new DataView(new ArrayBuffer(8));
  for (let exponent = -1074; exponent <= 1023; exponent++) {
    const value = 2 ** exponent;
    bits.setFloat64(0, value);const encoding = bits.getBigUint64(0);
    for (const offset of [-1n, 0n, 1n]) {
      bits.setBigUint64(0, encoding + offset);values.push(bits.getFloat64(0));
    }
  }
  for (const value of values) {
    expect(Object.is(portableSqrt(value), oracle(value))).toBe(true);
    expect(Object.is(sqrt(value), oracle(value))).toBe(true);
  }
});

test('portable sqrt matches exact oracle bits for one million seeded binary64 samples', () => {
  let seed = 7;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;return seed; };
  const bits = new DataView(new ArrayBuffer(8));
  for (let index = 0; index < 1_000_000; index++) {
    bits.setUint32(0, next() & 0x7fffffff);bits.setUint32(4, next());
    const value = bits.getFloat64(0), actual = portableSqrt(value), expected = oracle(value);
    if (!Object.is(actual, expected) || !Object.is(sqrt(value), expected)) throw new Error(`sqrt differs at sample ${index}: ${value}: ${actual} != ${expected}`);
  }
  expect(true).toBe(true);
});

test('sqrt selects acceleration once and falls back when WebAssembly is absent or compilation is blocked', async () => {
  const build = await Bun.build({ entrypoints: [fileURLToPath(new URL('./sqrt.ts', import.meta.url))], target: 'browser', format: 'cjs' });
  if (!build.success) throw Error(build.logs.join('\n'));
  const source = await build.outputs[0]!.text();
  // Execute the real bundled module in a private lexical scope, without changing globals.
  const load = (wasm: unknown) => {
    const loaded: unknown = new Function('WebAssembly', `const module = { exports: {} };const exports = module.exports;${source}\nreturn module.exports;`)(wasm);
    if (!isRecord(loaded) || typeof loaded.sqrt !== 'function' || typeof loaded.portableSqrt !== 'function') throw Error('Missing sqrt fixture exports');
    return { sqrt: loaded.sqrt, portableSqrt: loaded.portableSqrt };
  };
  const accelerated = load(WebAssembly);
  expect(accelerated.sqrt).not.toBe(accelerated.portableSqrt);
  let compilations = 0;
  // Intercept construction of the actual native constructor, preserving its
  // construct-only platform contract and the exact production module input.
  const blocked = { Instance: WebAssembly.Instance, Module: new Proxy(WebAssembly.Module, {
    construct(target, args) {
      expect(target).toBe(WebAssembly.Module);expect(args[0]).toBeInstanceOf(Uint8Array);
      compilations++;throw Error('CSP blocks compilation');
    },
  }) };
  for (const host of [undefined, blocked]) {
    const kernel = load(host);
    expect(kernel.sqrt).toBe(kernel.portableSqrt);
    for (const value of [0, -0, 2, Number.MIN_VALUE, Number.MAX_VALUE, -1, Infinity, NaN]) expect(Object.is(kernel.sqrt(value), portableSqrt(value))).toBe(true);
  }
  expect(compilations).toBe(1);
});
