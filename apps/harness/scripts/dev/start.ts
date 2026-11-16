import path from "node:path";
import { runDevProcess } from "@hyperfocus/desktop-runtime/dev-process";

export function createHarnessDevProcessOptions(options: {
  repositoryRoot: string;
  argv?: readonly string[];
  platform?: NodeJS.Platform;
}) {
  const { repositoryRoot, argv = [], platform = process.platform } = options;
  const windows = platform === "win32";
  return {
    cmd: [process.execPath, ...(windows ? [] : ["--hot"]),
      path.join(repositoryRoot, "apps/harness/cli/src/index.ts"), "--no-open", ...argv],
    cwd: repositoryRoot,
    env: { ...process.env, NODE_ENV: "development" },
    watchPaths: windows ? [
      "apps/harness/cli/src",
      "packages/ai-core/src",
      "packages/workspace/src",
      "packages/ui/build-tools",
      "packages/desktop-runtime/src"
    ].map((directory) => path.join(repositoryRoot, directory)) : []
  };
}

if (import.meta.main) {
  process.exitCode = await runDevProcess(createHarnessDevProcessOptions({
    repositoryRoot: path.resolve(import.meta.dir, "../../../.."),
    argv: process.argv.slice(2)
  }));
}
