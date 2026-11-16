import { expect, test } from "bun:test";
import { parseBackgroundJobDefinition } from "./models";
import { createWorkspaceRepository } from "../../workspace-repository";

test("loading shell arguments preserves literal spaces, empty arguments and order", () => {
  const args = ["--message", "  customer message  ", "", "\t", "path with spaces"];
  const definition = parseBackgroundJobDefinition("shell", JSON.stringify({ kind: "shell", executable: "bun", args, timeoutSeconds: 60 }));
  expect(definition.args).toEqual(args);
});

test("malformed persisted shell arguments remain bounded without changing valid entries", () => {
  const definition = parseBackgroundJobDefinition("shell", JSON.stringify({ kind: "shell", executable: "bun", args: [null, 2, "", "x".repeat(5000), ...Array.from({ length: 70 }, () => " item ")], timeoutSeconds: 60 }));
  const args = definition.args;
  if (!Array.isArray(args)) throw new Error("Expected parsed shell arguments");
  expect(args.length).toBe(64);
  expect(args[0]).toBe("");
  expect(args[1]?.length).toBe(4096);
  expect(args[2]).toBe(" item ");
});

test("SQLite job save and reload retain literal argument values", () => {
  const repository = createWorkspaceRepository(":memory:", process.cwd(), { durability: "test-fast" });
  const project = repository.addProject(process.cwd());
  const now = "2026-09-23T12:00:00Z";
  const args = ["", "  message  ", "line one\nline two"];
  try {
    const job = repository.saveBackgroundJob({ id: "literal-arguments", projectId: project.id, automationThreadId: "literal-thread", kind: "shell", name: "Literal argument test", status: "enabled", riskLevel: "unsafe", definition: { kind: "shell", executable: "bun", args, timeoutSeconds: 60 }, schedule: { type: "interval", intervalSeconds: 3600, nextRunAt: now, sourceText: "1h" }, scheduleInput: "1h", nextRunAt: now, createdAt: now, updatedAt: now });
    expect(job.definition.kind === "shell" ? job.definition.args : undefined).toEqual(args);
  } finally {
    repository.close();
  }
});
