import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadAgentsMdRuleSource, withAgentsMdRuleSource } from "./agent-rules";
import { createHarnessTestTempPath } from "./test-support/test-temp-root";

describe("agent rules", () => {
  test("loads agents.md as a workspace rule source", () => {
    const root = createHarnessTestTempPath("agent-rules");
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, "agents.md"), "# Agents\n\n- Use terse updates.\n");

    try {
      const rule = loadAgentsMdRuleSource(root);

      expect(rule).toMatchObject({
        id: "workspace-agents-md",
        scope: "workspace",
        label: "agents.md",
        content: "# Agents\n\n- Use terse updates."
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("loads conventional AGENTS.md when runtime agents.md is absent", () => {
    const root = createHarnessTestTempPath("agent-rules-uppercase");
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, "AGENTS.md"), "# Contributor rules\n");

    try {
      expect(loadAgentsMdRuleSource(root)).toMatchObject({
        label: "AGENTS.md",
        content: "# Contributor rules"
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("prepends agents.md to existing rule sources without requiring a project file copy", () => {
    const root = createHarnessTestTempPath("agent-rules");
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, "agents.md"), "# Agents\n");

    try {
      const rules = withAgentsMdRuleSource(
        [
          {
            id: "project-rules",
            scope: "project",
            label: "Project rules",
            content: "Project local guidance",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        ],
        root
      );

      expect(rules.map((rule) => rule.label)).toEqual(["agents.md", "Project rules"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
