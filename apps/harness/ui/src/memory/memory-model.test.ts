import { describe, expect, test } from "bun:test";
import type { MemoryEntry } from "@hyperfocus/ai-core/protocol";
import {
  buildMemoryAudit,
  isSemanticMemoryTag,
  parseSemanticMemoryTags,
  upsertProjectMemoryEntry
} from "./memory-model";

function createEntry(input: Partial<MemoryEntry> & Pick<MemoryEntry, "id">): MemoryEntry {
  const { id, ...overrides } = input;
  return {
    id,
    projectId: "project-1",
    kind: "repo-fact",
    status: "active",
    title: input.id,
    summary: "Focused context",
    tags: ["feature:frontend-refactor"],
    pathGlobs: [],
    confidence: "high",
    freshness: "fresh",
    pinned: false,
    priority: 100,
    hitCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("memory audit", () => {
  test("surfaces unused, stale, and cleanup-candidate notes", () => {
    const audit = buildMemoryAudit([
      createEntry({ id: "unused" }),
      createEntry({ id: "stale", freshness: "stale", hitCount: 2 }),
      createEntry({ id: "pinned", pinned: true }),
      createEntry({ id: "archived", status: "archived" })
    ], Date.parse("2026-02-15T00:00:00.000Z"));

    expect(audit).toEqual({
      activeCount: 3,
      archivedCount: 1,
      neverRetrievedCount: 2,
      staleCount: 1,
      cleanupCandidateIds: ["unused"]
    });
  });

  test("normalizes and validates semantic tags", () => {
    expect(parseSemanticMemoryTags(" Feature:Frontend-Refactor, area:harness, area:harness ")).toEqual([
      "feature:frontend-refactor",
      "area:harness"
    ]);
    expect(isSemanticMemoryTag("feature:frontend-refactor")).toBe(true);
    expect(isSemanticMemoryTag("frontend")).toBe(false);
  });

  test("inserts new entries and updates matching entries without duplicating them", () => {
    const first = createEntry({ id: "first", priority: 200 });
    const created = createEntry({ id: "created", priority: 100 });
    const project = { id: "project-1", memoryEntries: [first] };

    const inserted = upsertProjectMemoryEntry(project, created);
    expect(inserted.memoryEntries.map((entry) => entry.id)).toEqual(["created", "first"]);

    const updated = upsertProjectMemoryEntry(inserted, { ...created, summary: "Updated context" });
    expect(updated.memoryEntries).toHaveLength(2);
    expect(updated.memoryEntries[0]?.summary).toBe("Updated context");
  });
});
