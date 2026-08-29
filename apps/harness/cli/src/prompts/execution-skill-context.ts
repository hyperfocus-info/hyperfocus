import { discoverRepoSkillPaths, resolveRepoRoot } from "../subagent-environment";

export function buildExecutionSkillContext(cwd: string) {
  const availableSkillPaths = discoverRepoSkillPaths(resolveRepoRoot(cwd));
  if (availableSkillPaths.length === 0) {
    return "Available repository/global skill files: none discovered.";
  }
  return [
    "Available repository/global skill files:",
    ...availableSkillPaths.map((skillPath) => `- ${skillPath}`),
    "If the user asks what skills are available, include these repository/global skills in the answer."
  ].join("\n");
}
