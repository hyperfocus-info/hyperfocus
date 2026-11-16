import type { Profiler, Runtime } from 'node:inspector';
import { readObject, readList, optional, requireNumber, type ObjectReaders } from '@hyperfocus/utilities/validation';
import { requireText } from '@hyperfocus/utilities/text';

const callFrame: ObjectReaders<Runtime.CallFrame> = {
  functionName: requireText, scriptId: requireText, url: requireText, lineNumber: requireNumber, columnNumber: requireNumber,
};
const position: ObjectReaders<Profiler.PositionTickInfo> = { line: requireNumber, ticks: requireNumber };
const node: ObjectReaders<Profiler.ProfileNode> = {
  id: requireNumber, callFrame: value => readObject(value, callFrame), hitCount: optional(requireNumber),
  children: optional(value => readList(value, requireNumber)), deoptReason: optional(requireText),
  positionTicks: optional(value => readList(value, value => readObject(value, position))),
};
const fields: ObjectReaders<Profiler.Profile> = {
  nodes: value => readList(value, value => readObject(value, node)), startTime: requireNumber, endTime: requireNumber,
  samples: optional(value => readList(value, requireNumber)), timeDeltas: optional(value => readList(value, requireNumber)),
};

/** Actual inspector profile structure; no extra sign, ordering or tree policy. */
export function readCpuProfile(value: unknown): Profiler.Profile { return readObject(value, fields); }

/** Sampling estimates, including initialization/warmup; inclusive costs overlap. */
export function summarizeCpuProfile(profile: Profiler.Profile) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node] as const));
  const parent = new Map<number, number>();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const self = new Map<number, number>(), inclusive = new Map<number, number>();
  let total = 0;
  const samples = profile.samples ?? [];
  for (const [index, id] of samples.entries()) {
    const weight = profile.timeDeltas?.[index] ?? 1;total += weight;self.set(id, (self.get(id) ?? 0) + weight);
    const visited = new Set<number>();
    for (let ancestor: number | undefined = id; ancestor !== undefined && !visited.has(ancestor); ancestor = parent.get(ancestor)) {
      visited.add(ancestor);inclusive.set(ancestor, (inclusive.get(ancestor) ?? 0) + weight);
    }
  }
  const groups = new Map<string, { name: string; file: string; line: number; selfPercent: number; inclusivePercent: number }>();
  for (const [id, node] of nodes) {
    const { functionName: name, url: file, lineNumber } = node.callFrame, key = JSON.stringify([name, file, lineNumber]);
    const row = groups.get(key) ?? { name, file, line: lineNumber + 1, selfPercent: 0, inclusivePercent: 0 };
    row.selfPercent += (self.get(id) ?? 0) / total * 100;row.inclusivePercent += (inclusive.get(id) ?? 0) / total * 100;groups.set(key, row);
  }
  const rows = [...groups.values()];rows.sort((a, b) => b.selfPercent - a.selfPercent);
  return { samples: samples.length, units: profile.timeDeltas ? 'microseconds' : 'samples', topSelf: rows.slice(0, 24),
    note: 'Repeated call stacks grouped by function location; inclusive costs overlap their children and must not be summed across stages.',
    namedStages: rows.filter(row => /runCcd|setQuaternion|detectCollision|updateAabb|stepLooseWeapon|samplePlatformPosition|createWeaponSurfaceProbe|sweepSphere|queryAabb|collectContacts|carryPlatform|clearSegment/.test(row.name)).sort((a, b) => b.inclusivePercent - a.inclusivePercent).slice(0, 24) };
}
