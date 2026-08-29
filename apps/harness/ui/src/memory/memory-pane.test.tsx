/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import type { MemoryEntry } from "@hyperfocus/ai-core/protocol";
import { createUiTest } from "../utils/tests/test-harness";
import {
  captureDispatchedCommands,
  clearBrowserStateForTests
} from "../utils/tests/store-test-utils";
import { MemoryPane } from "./memory-pane";

function createEntry(input: Pick<MemoryEntry, "id" | "title" | "priority"> & Partial<MemoryEntry>): MemoryEntry {
  const { id, title, priority, ...overrides } = input;
  const now = new Date().toISOString();
  return {
    id,
    projectId: "project-memory",
    kind: "repo-fact",
    status: "active",
    title,
    summary: `${title} summary`,
    tags: ["feature:frontend-refactor"],
    pathGlobs: [],
    confidence: "medium",
    freshness: "fresh",
    pinned: false,
    priority,
    hitCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function getCommandType(value: unknown) {
  if (!value || typeof value !== "object" || !("type" in value) || typeof value.type !== "string") {
    return undefined;
  }
  return value.type;
}

createUiTest("MemoryPane", () => {
  beforeEach(clearBrowserStateForTests);

  it("shows the retrieval audit and confirms deletion before dispatch", () => {
    const commands: unknown[] = [];
    const entries = [
      createEntry({ id: "memory-1", title: "First memory", priority: 100 }),
      createEntry({ id: "memory-2", title: "Second memory", priority: 200, confidence: "high", hitCount: 3 })
    ];
    captureDispatchedCommands(commands);
    render(() => <MemoryPane projectId="project-memory" entries={entries} />);

    expect(screen.getByText(/priority 100 \/ medium \/ fresh \/ hits 0/)).not.toBeNull();
    expect(screen.getByText(/2 active \/ 0 archived \/ 1 never retrieved/)).not.toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Move memory down" })[0]!);
    expect(getCommandType(commands.at(-1))).toBe("memory.reorder");

    const deleteButtons = screen.getAllByRole("button", { name: "Permanently delete this memory entry" });
    fireEvent.click(deleteButtons[0]!);
    expect(commands.some((command) => getCommandType(command) === "memory.delete")).toBe(false);
    fireEvent.click(deleteButtons[0]!);
    expect(getCommandType(commands.at(-1))).toBe("memory.delete");
  });

  it("creates a focused project note with semantic tags", () => {
    const commands: unknown[] = [];
    captureDispatchedCommands(commands);
    render(() => <MemoryPane projectId="project-memory" entries={[]} />);

    fireEvent.input(screen.getByLabelText("Note title"), { target: { value: "Frontend refactor" } });
    fireEvent.input(screen.getByLabelText("Focused context"), {
      target: { value: "Keep workspace contracts framework-neutral." }
    });
    fireEvent.input(screen.getByLabelText("Semantic tags"), {
      target: { value: "feature:frontend-refactor, area:harness" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));

    expect(commands[0]).toMatchObject({
      type: "memory.create",
      payload: {
        projectId: "project-memory",
        title: "Frontend refactor",
        summary: "Keep workspace contracts framework-neutral.",
        tags: ["feature:frontend-refactor", "area:harness"]
      }
    });
  });

  it("explains the empty state without implying automatic recording", () => {
    render(() => <MemoryPane projectId="project-memory" entries={[]} />);

    expect(screen.getByText(/No project notes yet/i)).not.toBeNull();
    expect(screen.getByText(/durable context is worth retrieving later/i)).not.toBeNull();
  });
});
