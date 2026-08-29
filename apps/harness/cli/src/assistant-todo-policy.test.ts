import { expect, test } from "bun:test";
import type {  AssistantTodo } from "@hyperfocus/ai-core/protocol";
import {
  applyAssistantTodoPolicy,
  assistantGoalImpliesCoding,
  inferAssistantTodoWorkKind,
  readActiveAssistantTodosForPrompt,
  resolveAssistantTodoBiasStage
} from "./assistant-todo-policy";

test("active prompt todo scan retains priority items beyond presentation bounds", () => {
  const make = (index: number, state: AssistantTodo["state"]): AssistantTodo => ({ id: `todo-${index}`,
    assistantId: "assistant-1", title: `Todo ${index}`, state, sortOrder: index, source: "assistant",
    workKind: "research", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  const pages = [[...Array.from({ length: 8192 }, (_, index) => make(index, "pending"))],
    [make(8192, "in-progress")]];
  const selected = readActiveAssistantTodosForPrompt((cursor) => ({ items: pages[cursor ? 1 : 0] ?? [],
    nextCursor: cursor ? undefined : "next" }));
  expect(selected).toHaveLength(12); expect(selected[0]?.id).toBe("todo-8192");
});

const assistant = {
  name: "Builder",
  description: "Build a project",
  jobPrompt: "Build a TypeScript app and improve product behavior."
};

function todo(workKind: AssistantTodo["workKind"], source: AssistantTodo["source"] = "assistant") {
  return { workKind, source };
}

test("classifies assistant todo work kinds from text", () => {
  expect(inferAssistantTodoWorkKind("Implement Solid route", "Add bun test coverage")).toBe("app-code");
  expect(inferAssistantTodoWorkKind("Create validation script")).toBe("automation-code");
  expect(inferAssistantTodoWorkKind("Update README")).toBe("documentation");
  expect(inferAssistantTodoWorkKind("Research competitor behavior")).toBe("research");
  expect(inferAssistantTodoWorkKind("Blocked pending API key")).toBe("blocked");
});

test("detects build-oriented assistant goals", () => {
  expect(assistantGoalImpliesCoding(assistant)).toBe(true);
  expect(assistantGoalImpliesCoding({ name: "Notes", description: "Summarize notes", jobPrompt: "Maintain meeting notes." })).toBe(false);
});

test("allows early discovery before build-stage coding bias", () => {
  expect(resolveAssistantTodoBiasStage({ existingTodos: [todo("documentation")] })).toBe("early");
  expect(resolveAssistantTodoBiasStage({ existingTodos: [todo("documentation"), todo("research"), todo("app-code")] })).toBe("build");
});

test("adds coding todo when build-stage batch is docs-only", () => {
  const result = applyAssistantTodoPolicy({
    assistant,
    existingTodos: [todo("documentation"), todo("research"), todo("documentation")],
    drafts: [{ title: "Update project README", workKind: "documentation" }]
  });

  expect(result[0]?.workKind).toBe("app-code");
  expect(result[0]?.description).toContain("Bun runtime");
  expect(result[0]?.description).toContain("documentation comments for new functions and variables");
  expect(result[0]?.workTarget).toContain("documentation comments for new functions and variables");
});

test("keeps coding todos before limited non-coding todos in build stage", () => {
  const result = applyAssistantTodoPolicy({
    assistant,
    existingTodos: [todo("documentation"), todo("research"), todo("automation-code")],
    drafts: [
      { title: "Research workflow", workKind: "research" },
      { title: "Implement API", workKind: "app-code" },
      { title: "Update docs", workKind: "documentation" }
    ]
  });

  expect(result.map((entry) => entry.workKind)).toEqual(["app-code", "research"]);
});
