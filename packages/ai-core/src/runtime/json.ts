import { appActionPlanSchema, type AppActionPlan } from "./contracts";

export function extractJsonValue(text: string): unknown {
  const values = jsonValues(text);
  if (values.length !== 1) throw new Error(values.length
    ? "The AI response contained multiple JSON values."
    : "The AI response did not contain a JSON object.");
  return values[0];
}

export function extractAppActionPlan(text: string): AppActionPlan {
  const plans = jsonValues(text).flatMap(value => {
    const parsed = appActionPlanSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
  if (plans.length > 1) throw new Error("The AI response contained multiple action plans; select one plan before applying it.");
  if (plans.length === 1) return plans[0]!;
  return appActionPlanSchema.parse(extractJsonValue(text));
}

// Scan balanced top-level values once, respecting escaped braces in JSON strings.
// Metadata may surround a plan, but ambiguous valid plans never silently win.
function jsonValues(text: string): unknown[] {
  if (text.length > 2097152 || new TextEncoder().encode(text).byteLength > 2097152)
    throw new Error("The AI response exceeds the 2 MiB limit.");
  try { return [JSON.parse(text.trim())]; } catch { /* Prose or code fences surround the value. */ }
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  if (fenced.length > 64) throw new Error("The AI response contains too many JSON candidates.");
  const scalars: unknown[] = [];
  const scalarFences = new Map<number, number>();
  for (const fence of fenced) {
    try {
      const value: unknown = JSON.parse(fence[1]!.trim());
      if (value === null || typeof value !== "object") {
        scalars.push(value);
        scalarFences.set(fence.index, fence.index + fence[0].length);
      }
    } catch { /* The balanced scanner handles object candidates below. */ }
  }
  const values: unknown[] = scalars;
  let candidates = scalars.length;
  let start = -1, depth = 0, quoted = false, escaped = false;
  for (let index = 0; index < text.length; index++) {
    const scalarEnd = scalarFences.get(index);
    if (scalarEnd !== undefined) { index = scalarEnd - 1; continue; }
    const char = text[index];
    if (start < 0) {
      if (char === "{" || char === "[") { start = index; depth = 1; }
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") {
      depth--;
      if (depth === 0) {
        if (++candidates > 64) throw new Error("The AI response contains too many JSON candidates.");
        try { values.push(JSON.parse(text.slice(start, index + 1))); } catch { /* Invalid candidate. */ }
        start = -1;
      }
    }
  }
  return values;
}
