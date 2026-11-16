import { existsSync } from "node:fs";
import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { rgPath as installedRipgrepPath } from "@vscode/ripgrep";
import harnessPackage from "../package.json";
import { resolveBundledCodexExecutablePath, resolveBundledCodexTargetTriple } from "../cli/src/agent-runtimes/codex-installation";
import { isBundledSkillAsset } from "../cli/src/global-skills";

export async function copyLauncherRuntimeAssets(repoRoot: string, targetDir: string,
  options: { platform?: NodeJS.Platform; arch?: string; codexExecutablePath?: string } = {}) {
  await cp(path.join(repoRoot, "dist/ui"), path.join(targetDir, "dist/ui"), { recursive: true });
  await writeFile(path.join(targetDir, "package.json"), JSON.stringify({ name: "hyperfocus-harness-portable",
    private: true, type: "module", dependencies: { "@openai/codex": harnessPackage.dependencies["@openai/codex"],
      "chrome-remote-interface": harnessPackage.dependencies["chrome-remote-interface"],
      playwright: harnessPackage.devDependencies.playwright } }, null, 2));
  await mkdir(path.join(targetDir, "bin"), { recursive: true });
  await cp(installedRipgrepPath, path.join(targetDir, "bin", process.platform === "win32" ? "rg.exe" : "rg"));
  const targetTriple = resolveBundledCodexTargetTriple(options.platform, options.arch);
  const codexExecutable = options.codexExecutablePath ?? resolveBundledCodexExecutablePath(options);
  const codexTargetRoot = path.dirname(path.dirname(codexExecutable));
  await cp(codexTargetRoot, path.join(targetDir, "bin", "codex", targetTriple!), { recursive: true });
  const harnessAssetRoot = existsSync(path.join(repoRoot, "apps", "harness", "runtime-agents.md"))
    ? path.join(repoRoot, "apps", "harness")
    : repoRoot;
  const runtimeAgentsPath = existsSync(path.join(harnessAssetRoot, "runtime-agents.md"))
    ? path.join(harnessAssetRoot, "runtime-agents.md")
    : path.join(harnessAssetRoot, "agents.md");
  await cp(runtimeAgentsPath, path.join(targetDir, "agents.md"));
  const bundledSkillsPath = path.join(harnessAssetRoot, ".agents", "skills");
  if (existsSync(bundledSkillsPath)) {
    await cp(bundledSkillsPath, path.join(targetDir, ".agents", "skills"), { recursive: true, filter: isBundledSkillAsset });
  }
}
