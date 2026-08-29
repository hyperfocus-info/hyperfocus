import type { MemoryEntry } from "@hyperfocus/ai-core/protocol";

export type MemoryAudit = {
  readonly activeCount: number;
  archivedCount: number;
  neverRetrievedCount: number;
  staleCount: number;
  cleanupCandidateIds: string[];
};

export function buildMemoryAudit(entries: readonly MemoryEntry[], nowMs = Date.now()): MemoryAudit {
  const active = entries.filter((entry) => entry.status === "active");
  return {
    activeCount: active.length,
    archivedCount: entries.length - active.length,
    neverRetrievedCount: active.filter((entry) => entry.hitCount === 0).length,
    staleCount: active.filter((entry) => entry.freshness === "stale").length,
    cleanupCandidateIds: active
      .filter((entry) => !entry.pinned && entry.hitCount === 0 && isCleanupCandidate(entry, nowMs))
      .map((entry) => entry.id)
  };
}

export function parseSemanticMemoryTags(value: string) {
  return [...new Set(value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

export function isSemanticMemoryTag(tag: string) {
  return /^[a-z][a-z0-9-]{0,31}:[a-z0-9][a-z0-9-]{0,63}$/.test(tag);
}

export function upsertProjectMemoryEntry<T extends { id: string; memoryEntries: MemoryEntry[] }>(
  project: T,
  entry: MemoryEntry
): T {
  if (project.id !== entry.projectId) {
    return project;
  }
  const exists = project.memoryEntries.some((candidate) => candidate.id === entry.id);
  return {
    ...project,
    memoryEntries: exists
      ? project.memoryEntries.map((candidate) => candidate.id === entry.id ? entry : candidate)
      : [...project.memoryEntries, entry].sort((left, right) => left.priority - right.priority)
  };
}

function isCleanupCandidate(entry: MemoryEntry, nowMs: number) {
  if (entry.freshness === "aging" || entry.freshness === "stale") {
    return true;
  }
  const updatedAtMs = Date.parse(entry.updatedAt);
  return Number.isFinite(updatedAtMs) && nowMs - updatedAtMs >= 30 * 24 * 60 * 60 * 1000;
}
