import path from "node:path";
import { withProcessLock } from "./directory-transaction";
import { generateFactoryModuleHeader } from "./generate-factory-modules";
import {
  cmakeEnvironment,
  processDeadlines,
  resolveCmakePath,
  runCheckedProcess,
} from "./process-runner";

const allowedTargets = new Set(["PadPilot_Standalone", "PadPilot_VST3"]);

function runCmake(cmakePath: string, args: string[], projectRoot: string, timeoutMs: number, label: string) {
  runCheckedProcess([cmakePath, ...args], {
    cwd: projectRoot,
    env: cmakeEnvironment(),
    label,
    timeoutMs,
  });
}

async function main() {
  const target = Bun.argv[2];
  if (!target || !allowedTargets.has(target) || Bun.argv.length > 3) {
    throw new Error("Usage: bun run ./scripts/build-cmake-target.ts <PadPilot_VST3|PadPilot_Standalone>");
  }
  const projectRoot = path.resolve(import.meta.dir, "..");
  const buildDirectory = path.join(projectRoot, "build", "plugin");
  const cmakePath = resolveCmakePath();

  await generateFactoryModuleHeader();
  await withProcessLock(path.join(projectRoot, ".padpilot-cmake-build.lock"), () => {
    runCmake(cmakePath, [
      "-S", path.join(projectRoot, "plugin"),
      "-B", buildDirectory,
      "-G", "Visual Studio 17 2022",
      "-A", "x64",
      "-DPADPILOT_ENABLE_TESTS=OFF",
    ], projectRoot, processDeadlines.cmakeConfigure, "CMake configure");
    runCmake(cmakePath, [
      "--build", buildDirectory,
      "--config", "Debug",
      "--target", target,
    ], projectRoot, processDeadlines.cmakeBuild, `${target} build`);
  }, 30 * 60_000);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
