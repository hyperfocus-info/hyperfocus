import type { ThreadTitleSource } from "@hyperfocus/ai-core/protocol";
import { isRecord } from "@hyperfocus/utilities/records";
import { stringifyAnsiFree } from "../../ansi-storage";
import { debugLog } from "../../logging";
import { ASSISTANT_LOG_DETAILS_JSON_MAX_CHARS } from "./contracts";

export type PersistedSchema<T> = {
  safeParse(input: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues?: unknown[] } };
};

export type PersistedValidationIssue = {
  code: string;
  path: Array<string | number>;
  maximum?: number;
  minimum?: number;
  type?: string;
  expected?: string;
  received?: string;
  message?: string;
};

export type PersistedRecoveryContext = {
  table: string;
  rowId?: string;
  field?: string;
};

export type PersistedParseOptions = {
  fallbacks?: Record<string, unknown>;
  maxRepairAttempts?: number;
};

export function normalizeRequiredString(value: unknown, max: number, fallback: string) {
  const stringValue = typeof value === "string" ? value.trim() : "";
  const normalized = stringValue || fallback;
  return normalized.length > max ? normalized.slice(0, max) : normalized;
}

export function normalizeOptionalString(value: unknown, max: number) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function normalizeRequiredTrimmedString(value: unknown, max: number, fallback: string) {
  return normalizeRequiredString(value, max, fallback);
}

export function normalizeInteger(value: unknown, min: number, max: number, fallback: number) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeOptionalInteger(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return normalizeInteger(value, min, max, min);
}

export function normalizeOptionalNumber(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.min(max, Math.max(min, value));
}

export function normalizeBooleanNumber(value: unknown) {
  return value === true || value === 1;
}


export function normalizeComposerReasoningStrength(value: unknown) {
  return value === "low" || value === "medium" || value === "high" || value === "extra-high" ? value : undefined;
}

export function normalizeBackgroundJobSchedulerStatus(value: unknown) {
  return value === "idle" ||
    value === "due" ||
    value === "queued" ||
    value === "blocked" ||
    value === "running" ||
    value === "stale"
    ? value
    : undefined;
}

export function normalizeThreadTitleSource(value: unknown): ThreadTitleSource {
  if (value === "custom" || value === "manual") {
    return "custom";
  }
  return "generated";
}

export function parseJsonObjectOrUndefined(input: string | null): Record<string, unknown> | undefined {
  if (!input) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function boundAssistantLogDetailsJson(input: unknown) {
  if (input === undefined) {
    return { json: null };
  }
  const serialized = stringifyAnsiFree(input);
  if (serialized.length <= ASSISTANT_LOG_DETAILS_JSON_MAX_CHARS) {
    return { json: serialized };
  }
  return {
    json: JSON.stringify({
      truncated: true,
      originalChars: serialized.length,
      preview: serialized.slice(0, ASSISTANT_LOG_DETAILS_JSON_MAX_CHARS)
    })
  };
}

export function parseAssistantLogDetailsSummary(input: string | null) {
  if (!input || input.length <= ASSISTANT_LOG_DETAILS_JSON_MAX_CHARS) {
    return undefined;
  }
  return `Details JSON truncated to ${ASSISTANT_LOG_DETAILS_JSON_MAX_CHARS} characters.`;
}

export function parseJsonArrayOrEmpty(input: string | null): unknown[] {
  if (!input) {
    return [];
  }

  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function normalizeStringArray(input: string | null, maxItems: number, maxItemLength: number) {
  return parseJsonArrayOrEmpty(input)
    .filter((value): value is string => typeof value === "string")
    .map((value) => normalizeRequiredString(value, maxItemLength, "Recovered"))
    .slice(0, maxItems);
}

export function safeParsePersisted<T>(
  schema: PersistedSchema<T>,
  value: unknown,
  context: PersistedRecoveryContext,
  options: PersistedParseOptions = {}
): T | undefined {
  let candidate = clonePersistedValue(value);
  const maxRepairAttempts = options.maxRepairAttempts ?? 6;

  for (let attempt = 0; attempt <= maxRepairAttempts; attempt += 1) {
    const parsed = schema.safeParse(candidate);
    if (parsed.success) {
      if (attempt > 0) {
        recordPersistenceRecovery(context, "repaired");
      }
      return parsed.data;
    }

    const issues = normalizePersistedIssues(parsed.error.issues ?? [])
      .sort((left, right) => right.path.length - left.path.length);
    let repaired = false;
    for (const issue of issues) {
      if (repairPersistedIssue(candidate, issue, context, options)) repaired = true;
    }
    if (!repaired) {
      recordPersistenceRecovery(context, issues.map((issue) => issue.message ?? issue.code).join("; ") || "invalid persisted row");
      return undefined;
    }
  }

  const parsed = schema.safeParse(candidate);
  if (parsed.success) {
    recordPersistenceRecovery(context, "repaired");
    return parsed.data;
  }
  recordPersistenceRecovery(context, "max repair attempts reached");
  return undefined;
}

export function normalizePersistedIssues(issues: unknown[]): PersistedValidationIssue[] {
  return issues.map((issue) => {
    const record = isRecord(issue) ? issue : {};
    return {
      code: typeof record.code === "string" ? record.code : "invalid",
      path: Array.isArray(record.path) ? record.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number") : [],
      maximum: typeof record.maximum === "number" ? record.maximum : undefined,
      minimum: typeof record.minimum === "number" ? record.minimum : undefined,
      type: typeof record.type === "string" ? record.type : undefined,
      expected: typeof record.expected === "string" ? record.expected : undefined,
      received: typeof record.received === "string" ? record.received : undefined,
      message: typeof record.message === "string" ? record.message : undefined
    };
  });
}

export function clonePersistedValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

export function repairPersistedIssue(
  root: unknown,
  issue: PersistedValidationIssue,
  context: PersistedRecoveryContext,
  options: PersistedParseOptions
) {
  if (issue.path.length === 0 || isNonRecoverablePersistedIssue(issue)) {
    return false;
  }

  const current = getPersistedPath(root, issue.path);
  const pathKey = issue.path.join(".");
  const fallback = options.fallbacks?.[pathKey] ?? inferPersistedFallback(issue.path, context);

  if (issue.code === "too_big" && typeof issue.maximum === "number") {
    if (typeof current === "string" && (issue.type === "string" || issue.type === undefined)) {
      setPersistedPath(root, issue.path, current.slice(0, issue.maximum));
      return true;
    }
    if (Array.isArray(current)) {
      setPersistedPath(root, issue.path, current.slice(0, issue.maximum));
      return true;
    }
    if (typeof current === "number") {
      setPersistedPath(root, issue.path, issue.maximum);
      return true;
    }
  }

  if (issue.code === "too_small" && typeof issue.minimum === "number") {
    if (typeof current === "string" && issue.minimum <= 1) {
      setPersistedPath(root, issue.path, fallback);
      return true;
    }
    if (typeof current === "number") {
      setPersistedPath(root, issue.path, issue.minimum);
      return true;
    }
  }

  if (issue.code === "invalid_type") {
    if (issue.expected === "boolean") {
      setPersistedPath(root, issue.path, false);
      return true;
    }
    if (issue.expected === "number") {
      setPersistedPath(root, issue.path, typeof issue.minimum === "number" ? issue.minimum : 0);
      return true;
    }
    if (issue.expected === "array") {
      setPersistedPath(root, issue.path, []);
      return true;
    }
    if (issue.expected === "string" || issue.received === "undefined" || issue.received === "null") {
      setPersistedPath(root, issue.path, fallback);
      return true;
    }
  }

  return false;
}

export function isNonRecoverablePersistedIssue(issue: PersistedValidationIssue) {
  if (issue.code === "invalid_enum_value" || issue.code === "invalid_union_discriminator" || issue.code === "invalid_literal") {
    return true;
  }
  return issue.path.length === 1 && issue.path[0] === "id";
}

export function getPersistedPath(root: unknown, pathParts: Array<string | number>) {
  let current = root;
  for (const part of pathParts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = Reflect.get(current, String(part));
  }
  return current;
}

export function setPersistedPath(root: unknown, pathParts: Array<string | number>, value: unknown) {
  if (root === null || root === undefined || typeof root !== "object") {
    return;
  }

  let current = root;
  for (let index = 0; index < pathParts.length - 1; index += 1) {
    const key = String(pathParts[index]);
    let next: unknown = Reflect.get(current, key);
    if (next === null || next === undefined || typeof next !== "object") {
      const created = {};
      Reflect.set(current, key, created);
      current = created;
    } else {
      current = next;
    }
  }
  Reflect.set(current, String(pathParts[pathParts.length - 1]), value);
}

export function inferPersistedFallback(pathParts: Array<string | number>, context: PersistedRecoveryContext) {
  const field = String(pathParts[pathParts.length - 1] ?? context.field ?? "value");
  if (field === "content") {
    return "Recovered content";
  }
  if (field === "title" || field === "name" || field === "label") {
    return "Recovered";
  }
  if (field === "summary") {
    return "Recovered summary";
  }
  if (field === "description" || field === "detail" || field === "inputSummary") {
    return "Recovered detail";
  }
  if (field === "prompt" || field === "jobPrompt" || field === "personalityPrompt" || field === "latestUserPrompt") {
    return "Recovered prompt";
  }
  if (field.endsWith("At") || field === "updatedAt" || field === "createdAt") {
    return new Date().toISOString();
  }
  return "Recovered";
}

export function recordPersistenceRecovery(context: PersistedRecoveryContext, reason: string) {
  debugLog("workspace.persisted-state-recovery", {
    table: context.table,
    rowId: context.rowId,
    field: context.field,
    reason
  });
}

export { isRecord } from "@hyperfocus/utilities/records";
