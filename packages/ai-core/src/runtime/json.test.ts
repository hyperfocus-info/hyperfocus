import { expect, test } from "bun:test";
import { extractAppActionPlan, extractJsonValue } from "./json";

const plan = { schema: "hyperfocus-app-action-plan-v1" as const, requestId: "request", intent: 'Rename braces { and escaped "quotes"',
  baseRevision: 2, actions: [{ id: "rename", input: { name: "After" } }] };
test("selects the only schema-valid plan after metadata JSON", () => {
  const result = extractAppActionPlan(`Metadata: {"elapsed":42}\nPlan:\n${JSON.stringify(plan)}\nDone.`);
  expect(result).toEqual({ ...plan, atomic: true });
});
test("rejects ambiguous plans and malformed input without selecting an arbitrary mutation", () => {
  expect(() => extractAppActionPlan(`${JSON.stringify(plan)}\n${JSON.stringify({ ...plan, requestId: "other" })}`)).toThrow("multiple action plans");
  expect(() => extractAppActionPlan('{"schema":"wrong"}')).toThrow();
  expect(() => extractJsonValue('{"a":1}\n{"b":2}')).toThrow("multiple JSON values");
});
test("extracts a single fenced object or array", () => {
  expect(extractJsonValue('```json\n{"a":[1,2]}\n```')).toEqual({ a: [1,2] });
  expect(extractJsonValue('[{"a":1}]')).toEqual([{ a: 1 }]);
  expect(extractJsonValue('```json\n42\n```')).toBe(42);
  expect(extractJsonValue('```json\n"hello"\n```')).toBe("hello");
  expect(extractJsonValue('```json\n"{}"\n```')).toBe("{}");
  expect(extractJsonValue('null')).toBeNull();
});
test("bounds text and candidate processing", () => {
  expect(() => extractAppActionPlan('{} '.repeat(65))).toThrow("too many JSON candidates");
  expect(() => extractAppActionPlan('x'.repeat(2097153))).toThrow("exceeds");
});
