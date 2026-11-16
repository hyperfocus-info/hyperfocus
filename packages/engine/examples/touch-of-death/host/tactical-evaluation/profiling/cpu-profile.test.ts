import { expect, test } from 'bun:test';
import { readCpuProfile, summarizeCpuProfile } from './cpu-profile.ts';

const callFrame = { functionName: 'runCcd', scriptId: '1', url: 'file.ts', lineNumber: 2, columnNumber: -1 };
const source = { startTime: 1, endTime: 9, nodes: [
  { id: 1, callFrame, hitCount: 1, children: [2], deoptReason: '', positionTicks: [{ line: 3, ticks: 1 }] },
  { id: 2, callFrame: { ...callFrame, functionName: 'leaf' } },
], samples: [2, 1], timeDeltas: [3, 1] };

test('CPU profile aggregation preserves self/inclusive sample weights, grouping and default weight one', () => {
  const profile = readCpuProfile(source), report = summarizeCpuProfile(profile);
  expect(report.topSelf).toEqual([
    { name: 'leaf', file: 'file.ts', line: 3, selfPercent: 75, inclusivePercent: 75 },
    { name: 'runCcd', file: 'file.ts', line: 3, selfPercent: 25, inclusivePercent: 100 },
  ]);
  expect(report.namedStages).toEqual([report.topSelf[1]!]);expect(report.samples).toBe(2);expect(report.units).toBe('microseconds');
  const unweighted = { ...source };Reflect.deleteProperty(unweighted, 'timeDeltas');
  expect(summarizeCpuProfile(readCpuProfile(unweighted)).topSelf.map(row => row.selfPercent)).toEqual([50, 50]);
  expect(summarizeCpuProfile(readCpuProfile({ ...source, timeDeltas: [3] })).topSelf).toEqual(report.topSelf);
  const unsampled = { ...unweighted };Reflect.deleteProperty(unsampled, 'samples');const parsed = readCpuProfile(unsampled);
  expect(Object.hasOwn(parsed, 'samples')).toBe(false);expect(Object.hasOwn(parsed, 'timeDeltas')).toBe(false);expect(summarizeCpuProfile(parsed).samples).toBe(0);
  profile.nodes[0]!.children!.push(3);expect(source.nodes[0]!.children).toEqual([2]);
});

test('CPU profile reader checks every promised native profile, node, call frame and optional leaf', () => {
  for (const key of ['startTime', 'endTime', 'nodes', 'samples', 'timeDeltas']) expect(() => readCpuProfile({ ...source, [key]: false })).toThrow();
  for (const [index, item] of source.nodes.entries()) {
    const invalid = structuredClone(source);Reflect.set(invalid.nodes[index]!, 'id', 'wrong');expect(() => readCpuProfile(invalid)).toThrow();
    for (const [key, value] of Object.entries(item.callFrame)) {
      const invalid = structuredClone(source);Reflect.set(invalid.nodes[index]!.callFrame, key, typeof value === 'number' ? 'wrong' : false);expect(() => readCpuProfile(invalid)).toThrow();
    }
  }
  for (const key of ['samples', 'timeDeltas'] as const) for (const index of source[key].keys()) {
    const invalid = structuredClone(source);Reflect.set(invalid[key], index, 'wrong');expect(() => readCpuProfile(invalid)).toThrow();
  }
  for (const [key, value] of [['hitCount', 'wrong'], ['children', ['wrong']], ['deoptReason', false], ['positionTicks', [{ line: 'wrong', ticks: 1 }]], ['positionTicks', [{ line: 3, ticks: 'wrong' }]]] as const) {
    const invalid = structuredClone(source);Reflect.set(invalid.nodes[0]!, key, value);expect(() => readCpuProfile(invalid)).toThrow();
  }
  for (const key of ['startTime', 'endTime', 'nodes']) { const invalid = { ...source };Reflect.deleteProperty(invalid, key);expect(() => readCpuProfile(invalid)).toThrow(); }
  for (const key of Object.keys(callFrame)) {
    const invalid = structuredClone(source);Reflect.deleteProperty(invalid.nodes[0]!.callFrame, key);expect(() => readCpuProfile(invalid)).toThrow();
  }
  // Native number fields do not imply an authored positivity or timestamp-order policy.
  expect(readCpuProfile({ ...source, startTime: -1, endTime: -2 }).startTime).toBe(-1);
});
