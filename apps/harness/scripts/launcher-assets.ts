import { existsSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { rgPath as installedRipgrepPath } from "@vscode/ripgrep";

export async function copyLauncherRuntimeAssets(repoRoot: string, targetDir: string) {
  await cp(path.join(repoRoot, "dist/ui"), path.join(targetDir, "dist/ui"), { recursive: true });
  await cp(path.join(repoRoot, "package.json"), path.join(targetDir, "package.json"));
  await mkdir(path.join(targetDir, "bin"), { recursive: true });
  await cp(installedRipgrepPath, path.join(targetDir, "bin", process.platform === "win32" ? "rg.exe" : "rg"));
  const harnessAssetRoot = existsSync(path.join(repoRoot, "apps", "harness", "runtime-agents.md"))
    ? path.join(repoRoot, "apps", "harness")
    : repoRoot;
  const runtimeAgentsPath = existsSync(path.join(harnessAssetRoot, "runtime-agents.md"))
    ? path.join(harnessAssetRoot, "runtime-agents.md")
    : path.join(harnessAssetRoot, "agents.md");
  await cp(runtimeAgentsPath, path.join(targetDir, "agents.md"));
  const bundledSkillsPath = path.join(harnessAssetRoot, ".agents", "skills");
  if (existsSync(bundledSkillsPath)) {
    await cp(bundledSkillsPath, path.join(targetDir, ".agents", "skills"), { recursive: true });
  }
}
