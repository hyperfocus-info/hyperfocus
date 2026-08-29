import type { Assistant, AssistantTodo } from "@hyperfocus/ai-core/protocol";
import { DEFAULT_CODING_STACK, DEFAULT_CODING_STACK_GUIDANCE } from "./prompts/coding-stack-defaults";

export type AssistantTodoDraft = {
  title: string;
  description?: string;
  workKind?: AssistantTodo["workKind"];
  workTarget?: string;
};

export type NormalizedAssistantTodoDraft = Required<Pick<AssistantTodoDraft, "title" | "workKind">> &
  Pick<AssistantTodoDraft, "description" | "workTarget">;

const DEFAULT_STACK_TARGET = DEFAULT_CODING_STACK;

export function readAllAssistantTodos(readPage: (cursor: string | undefined) =>
  { items: AssistantTodo[]; nextCursor?: string }) { const todos: AssistantTodo[] = []; let cursor: string | undefined;
  do { const page = readPage(cursor); todos.push(...page.items); cursor = page.nextCursor; } while (cursor !== undefined); return todos; }

export function readActiveAssistantTodosForPrompt(readPage: (cursor: string | undefined) =>
  { items: AssistantTodo[]; nextCursor?: string }, limit: number = 12) {
  let selected: AssistantTodo[] = []; let cursor: string | undefined;
  do { const page = readPage(cursor); selected = [...selected, ...page.items.filter((todo) =>
    ["pending", "in-progress", "blocked"].includes(todo.state))].sort((left, right) =>
      todoPromptRank(left) - todoPromptRank(right) || left.sortOrder - right.sortOrder).slice(0, limit);
    cursor = page.nextCursor; } while (cursor !== undefined); return selected;
}

export function readAssistantTodoOperationalAggregate(readPage: (cursor: string | undefined) =>
  { items: AssistantTodo[]; nextCursor?: string }, promptLimit: number = 12) {
  let items: AssistantTodo[] = []; let cursor: string | undefined; let activeCount = 0; let maximumSortOrder = -1;
  let assistantGeneratedCount = 0; let codingCount = 0;
  do { const page = readPage(cursor); for (const todo of page.items) { maximumSortOrder = Math.max(maximumSortOrder, todo.sortOrder);
      if (todo.source !== "user") assistantGeneratedCount += 1; if (isCodingTodoKind(todo.workKind)) codingCount += 1;
      if (["pending", "in-progress", "blocked"].includes(todo.state)) { activeCount += 1; items.push(todo); } }
    items = items.sort((left, right) => todoPromptRank(left) - todoPromptRank(right) || left.sortOrder - right.sortOrder)
      .slice(0, promptLimit); cursor = page.nextCursor; } while (cursor !== undefined);
  return { items, activeCount, nextSortOrder: maximumSortOrder + 1, assistantGeneratedCount, codingCount };
}

function todoPromptRank(todo: AssistantTodo) {
  if (todo.state === "in-progress") return 0;
  if (todo.state === "pending" && isCodingTodoKind(todo.workKind)) return 1;
  return todo.state === "pending" ? 2 : 3;
}

export function inferAssistantTodoWorkKind(title: string, description?: string): AssistantTodo["workKind"] {
  const text = `${title} ${description ?? ""}`.toLowerCase();
  if (/\b(blocked|waiting|approval|decide|choose|clarify|question)\b/.test(text)) {
    return "blocked";
  }
  if (/\b(doc|docs|readme|guide|notes|write[- ]?up|changelog)\b/.test(text)) {
    return "documentation";
  }
  if (/\b(research|compare|investigate|audit|survey|market|explore)\b/.test(text)) {
    return "research";
  }
  if (/\b(script|skill|automation|validator|generator|cli|workflow|check)\b/.test(text)) {
    return "automation-code";
  }
  if (/\b(build|implement|code|component|screen|route|api|backend|frontend|sqlite|database|schema|test|typecheck|solid|tailwind|bun|typescript|tsx|ts)\b/.test(text)) {
    return "app-code";
  }
  return "unspecified";
}

export function isCodingTodoKind(kind: AssistantTodo["workKind"]) {
  return kind === "app-code" || kind === "automation-code";
}

export function assistantGoalImpliesCoding(assistant: Pick<Assistant, "description" | "jobPrompt" | "name">) {
  const text = `${assistant.name} ${assistant.description ?? ""} ${assistant.jobPrompt}`.toLowerCase();
  return /\b(build|implement|code|coding|app|product|feature|workflow|automation|script|frontend|backend|ui|api|database|sqlite|solid|tailwind|typescript|bun)\b/.test(text);
}

export function resolveAssistantTodoBiasStage(input: {
  existingTodos?: Array<Pick<AssistantTodo, "source" | "workKind">>;
  existingTodoCounts?: { assistantGeneratedCount: number; codingCount: number };
}) {
  const assistantGeneratedCount = input.existingTodoCounts?.assistantGeneratedCount ??
    input.existingTodos?.filter((todo) => todo.source !== "user").length ?? 0;
  const codingCount = input.existingTodoCounts?.codingCount ??
    input.existingTodos?.filter((todo) => isCodingTodoKind(todo.workKind)).length ?? 0;
  return assistantGeneratedCount <= 2 && codingCount === 0 ? "early" : "build";
}

export function applyAssistantTodoPolicy(input: {
  assistant: Pick<Assistant, "description" | "jobPrompt" | "name">;
  existingTodos?: Array<Pick<AssistantTodo, "source" | "workKind">>;
  existingTodoCounts?: { assistantGeneratedCount: number; codingCount: number };
  drafts: AssistantTodoDraft[];
}) {
  const normalized = input.drafts
    .map(normalizeDraft)
    .filter((todo) => todo.title.trim().length > 0);
  const codingGoal = assistantGoalImpliesCoding(input.assistant);
  const stage = resolveAssistantTodoBiasStage(input);

  if (!codingGoal || stage === "early") {
    return normalized;
  }

  const codingTodos = normalized.filter((todo) => isCodingTodoKind(todo.workKind));
  const nonCodingTodos = normalized.filter((todo) => !isCodingTodoKind(todo.workKind));
  const allowedNonCoding = nonCodingTodos.slice(0, codingTodos.length > 0 ? 1 : 0);
  const result = [...codingTodos, ...allowedNonCoding];
  if (result.some((todo) => isCodingTodoKind(todo.workKind))) {
    return result;
  }

  return [buildDefaultCodingTodoDraft(input.assistant), ...allowedNonCoding];
}

export function buildDefaultCodingTodoDraft(
  assistant: Pick<Assistant, "description" | "jobPrompt" | "name">
): NormalizedAssistantTodoDraft {
  const target = assistantGoalImpliesCoding(assistant) ? DEFAULT_STACK_TARGET : "Smallest useful TypeScript implementation target";
  return {
    title: "Build the smallest usable TypeScript project behavior",
    description:
      `Create or update real project files before adding more docs. ${DEFAULT_CODING_STACK_GUIDANCE}`,
    workKind: "app-code",
    workTarget: target
  };
}

function normalizeDraft(draft: AssistantTodoDraft): NormalizedAssistantTodoDraft {
  const workKind = draft.workKind ?? inferAssistantTodoWorkKind(draft.title, draft.description);
  return {
    title: draft.title.trim(),
    description: draft.description?.trim() || undefined,
    workKind,
    workTarget: draft.workTarget?.trim() || undefined
  };
}
