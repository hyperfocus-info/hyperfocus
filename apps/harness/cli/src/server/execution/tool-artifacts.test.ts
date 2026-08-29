import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeToolDebugArtifactIfEnabled } from "./tool-artifacts";

const originalCwd = process.cwd();
let temporaryRoot: string | undefined;
afterEach(() => {
  process.chdir(originalCwd);
  if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
});

test("tool artifacts isolate delimiter, truncation, owner, and project identities", () => {
  temporaryRoot = mkdtempSync(path.join(tmpdir(), "tool-artifacts-")); process.chdir(temporaryRoot);
  const repository = { getDebugEnabledDefault: () => true };
  const base = { projectId: "project-a", runId: "shared-run", owner: "subagent" as const,
    subagentId: "agent", kind: "args" };
  const identities = [
    { ...base, toolCallId: "a:b" }, { ...base, toolCallId: "a/b" },
    { ...base, toolCallId: `${"x".repeat(128)}-first` }, { ...base, toolCallId: `${"x".repeat(128)}-second` },
    { ...base, projectId: "project-b", toolCallId: "a:b" },
    { ...base, owner: "aggregator" as const, toolCallId: "a:b" },
  ];
  const paths = identities.map((identity, index) =>
    writeToolDebugArtifactIfEnabled(repository, identity, { index }));
  expect(new Set(paths).size).toBe(identities.length);
  paths.forEach((artifactPath, index) => {
    expect(artifactPath).toBeDefined();
    expect(JSON.parse(readFileSync(artifactPath!, "utf8"))).toEqual({ index });
  });
  const replaced = writeToolDebugArtifactIfEnabled(repository, identities[0]!, { index: "replacement" });
  expect(replaced).toBe(paths[0]);
  expect(JSON.parse(readFileSync(replaced!, "utf8"))).toEqual({ index: "replacement" });
});
