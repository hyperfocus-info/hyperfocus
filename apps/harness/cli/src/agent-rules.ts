import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { WorkspaceRuleSource } from "@hyperfocus/ai-core/protocol";

export function loadAgentsMdRuleSource(templateRoot: string = process.cwd()): WorkspaceRuleSource | undefined {
  if (!existsSync(templateRoot)) {
    return undefined;
  }

  const fileNames = new Set(
    readdirSync(templateRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
  );
  const agentsFileName = ["agents.md", "AGENTS.md"].find((candidate) => fileNames.has(candidate));
  if (!agentsFileName) {
    return undefined;
  }

  const agentsPath = path.join(templateRoot, agentsFileName);

  const stats = statSync(agentsPath);

  const content = readFileSync(agentsPath, "utf8").trim();
  if (!content) {
    return undefined;
  }

  return {
    id: "workspace-agents-md",
    scope: "workspace",
    label: agentsFileName,
    content: content.slice(0, 32000),
    updatedAt: stats.mtime.toISOString()
  };
}

export function withAgentsMdRuleSource(ruleSources: WorkspaceRuleSource[], templateRoot?: string) {
  const agentsRule = loadAgentsMdRuleSource(templateRoot);
  return agentsRule ? [agentsRule, ...ruleSources] : ruleSources;
}
