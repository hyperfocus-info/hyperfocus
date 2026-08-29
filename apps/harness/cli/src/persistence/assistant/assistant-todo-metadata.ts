import type { AssistantTodo, AssistantTodoWorkKind } from "@hyperfocus/ai-core/protocol";

const ASSISTANT_TODO_SOURCES = new Set(["user", "assistant", "bootstrap", "job", "question"]);
const ASSISTANT_TODO_WORK_KINDS = new Set([
  "app-code",
  "automation-code",
  "documentation",
  "research",
  "blocked",
  "unspecified"
]);

export function normalizeAssistantTodoSource(source: string | null | undefined) {
  if (!source) return undefined;
  return isAssistantTodoSource(source) ? source : "assistant";
}

export function normalizeAssistantTodoWorkKind(workKind: string | null | undefined) {
  if (!workKind) return "unspecified";
  return isAssistantTodoWorkKind(workKind) ? workKind : "unspecified";
}

function isAssistantTodoSource(source: string): source is NonNullable<AssistantTodo["source"]> {
  return ASSISTANT_TODO_SOURCES.has(source) && (source === "user" || source === "assistant" || source === "bootstrap" || source === "job" || source === "question");
}

function isAssistantTodoWorkKind(workKind: string): workKind is AssistantTodoWorkKind {
  return ASSISTANT_TODO_WORK_KINDS.has(workKind) && (workKind === "app-code" || workKind === "automation-code" || workKind === "documentation" || workKind === "research" || workKind === "blocked" || workKind === "unspecified");
}
