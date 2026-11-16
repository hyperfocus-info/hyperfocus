import { expect, test } from "bun:test";
import { inspectNativeCanaryOutput } from "./auth";

test("canary evidence preserves completion and tool events without native output", () => {
  const output = [
    { type: "item.started", item: { type: "command_execution", command: "echo harmless" } },
    { type: "item.completed", item: { type: "agent_message", text: "synthetic-canary-token" } },
    { type: "turn.completed", usage: { input_tokens: 20, output_tokens: 10 } },
  ].map(value => JSON.stringify(value)).join("\n");
  const result = inspectNativeCanaryOutput(output, "synthetic-canary-token");
  expect(result).toMatchObject({ nativeToolActivityObserved: true, canaryReadObserved: true, completed: true, malformed: false });
  expect(JSON.stringify(result)).not.toContain("synthetic-canary-token");
  expect(JSON.stringify(result)).not.toContain("echo harmless");
});

test("canary distinguishes no observed execution from incomplete or malformed native output", () => {
  const output = [{ type: "item.completed", item: { type: "agent_message", text: '{"nativeTools":"unavailable"}' } }, { type: "turn.completed" }].map(value => JSON.stringify(value)).join("\n");
  expect(inspectNativeCanaryOutput(output, "not-in-prompt")).toMatchObject({ nativeToolActivityObserved: false, canaryReadObserved: false, completed: true, malformed: false });
  expect(inspectNativeCanaryOutput("not-json", "not-in-prompt")).toMatchObject({ completed: false, malformed: true });
});
