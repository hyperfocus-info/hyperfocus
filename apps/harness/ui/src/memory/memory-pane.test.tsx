import { getCommandType } from "../utils/tests/transport-fixtures";
/** @jsxImportSource solid-js */
import type { MemoryEntry } from "@hyperfocus/ai-core/protocol";
import { fireEvent,render,screen } from "@solidjs/testing-library";
import { beforeEach,expect,it } from "bun:test";
import {
captureDispatchedCommands,
clearBrowserStateForTests
} from "../utils/tests/store-test-utils";
import { createUiTest,requireInput } from "../utils/tests/test-harness";
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

    fireEvent.click(screen.getByText("Add a focused note"));
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

  it("combines note text, tags and pins and restores the full list", () => {
    render(() => <MemoryPane projectId="project-memory" entries={[
      createEntry({ id: "one", title: "Frontend decision", priority: 1, pinned: true, tags: ["area:frontend"] }),
      createEntry({ id: "two", title: "Backend decision", priority: 2, tags: ["area:backend"] }),
    ]} />);
    fireEvent.click(screen.getByRole("button", { name: "Filter notes by area:frontend" }));
    expect(screen.queryByText("Backend decision")).toBeNull();
    expect(screen.getByRole("button", { name: "Move memory up" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Show pinned notes only" }));
    expect(screen.getByText("Frontend decision")).not.toBeNull();
    fireEvent.input(screen.getByRole("textbox", { name: "Search project notes" }), { target: { value: "missing" } });
    expect(screen.getByText("No notes match these filters.")).not.toBeNull();
    expect(screen.queryByText(/No project notes yet/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear note filters" }));
    expect(screen.getByText("Backend decision")).not.toBeNull();
    expect(screen.getByText("Frontend decision")).not.toBeNull();
  });

  it("shows archived notes through the status filter", () => {
    render(() => <MemoryPane projectId="project-memory" entries={[
      createEntry({ id: "active", title: "Active decision", priority: 1 }),
      createEntry({ id: "archived", title: "Archived decision", priority: 2, status: "archived" }),
    ]} />);
    fireEvent.click(screen.getByRole("button", { name: "Note status" }));
    fireEvent.click(screen.getByRole("option", { name: "Archived" }));
    expect(screen.queryByText("Active decision")).toBeNull();
    expect(screen.getByText("Archived decision")).not.toBeNull();
  });

  it("reuses an existing semantic tag without losing a newly typed tag", () => {
    render(() => <MemoryPane projectId="project-memory" entries={[createEntry({ id: "tagged", title: "Tagged note", priority: 1, tags: ["area:harness"] })]} />);
    fireEvent.click(screen.getByText("Add a focused note"));
    fireEvent.input(screen.getByLabelText("Semantic tags"), { target: { value: "feature:new-work" } });
    fireEvent.click(screen.getByRole("button", { name: "Choose existing semantic tags" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "area:harness" }));
    expect(requireInput(screen.getByLabelText("Semantic tags")).value).toBe("feature:new-work, area:harness");
  });
});
