import { expect, test } from "bun:test";
import type { SubagentResult } from "../pi-subagents";
import { formatSubagentCompletionDetail, formatSubagentResults } from "./subagent-results";

const task = { id: "one", title: "One", instruction: "Edit one.ts" };
const completed: SubagentResult = { ...task, status: "completed", attemptCount: 1, durationMs: 1, output: "Done" };

test("shared observations retain unexpected files without blaming a worker", () => {
  const text = formatSubagentResults([task], [{ ...completed, unattributedChangePaths: ["sibling.ts", "unknown.ts"] }]);
  expect(text).toContain("author unknown");
  expect(text).toContain("sibling.ts, unknown.ts");
  expect(text).not.toContain("Contract drift paths:");
  expect(formatSubagentCompletionDetail("Done", ["unknown.ts"])).toContain("author unknown");
});

test("isolated contract verification remains distinct and empty observations add no warning", () => {
  expect(formatSubagentResults([task], [{ ...completed, contractDriftPaths: ["outside.ts"] }])).toContain("Contract drift paths: outside.ts");
  expect(formatSubagentResults([task], [completed])).not.toContain("author unknown");
  expect(formatSubagentCompletionDetail("Done", [])).toBe("Done");
});
