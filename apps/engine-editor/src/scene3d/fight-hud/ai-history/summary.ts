import type { AiHistoryEntry } from './archive.ts';

/** Stable ordering and literal counts support manual prompt analysis without invented win rates. */
export function summarizeAiHistory(entries: readonly AiHistoryEntry[]) {
  const groups = new Map<string, { sessions: number; liveSegments: number; observedTicks: number; counts: Record<string, number> }>();
  for (const entry of entries) {
    const group = groups.get(entry.identity) ?? { sessions: 0, liveSegments: 0, observedTicks: 0, counts: {} };
    group.sessions++;
    const report = entry.report;
    for (const segment of [...report.segments, report]) {
      if (segment.source !== 'live') continue;
      if (!segment.observedTicks && !Object.keys(segment.counts).length) continue;
      group.liveSegments++;group.observedTicks += Number.isSafeInteger(segment.observedTicks) ? segment.observedTicks : 0;
      for (const [key, count] of Object.entries(segment.counts)) group.counts[key] = (group.counts[key] ?? 0) + count;
    }
    groups.set(entry.identity, group);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([contentIdentity, group]) => ({ contentIdentity, ...group, counts: Object.fromEntries(Object.entries(group.counts).sort(([a], [b]) => a.localeCompare(b))) }));
}
