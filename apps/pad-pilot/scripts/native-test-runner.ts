import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  cmakeEnvironment,
  processDeadlines,
  resolveCmakePath,
  runCheckedProcess,
} from "./process-runner";

export function runNativeTestTarget(target: "padpilot-native-tests" | "padpilot-updater-tests") {
  const prefix = target === "padpilot-native-tests" ? "padpilot-native-tests-" : "padpilot-updater-tests-";
  const projectRoot = path.resolve(import.meta.dir, "..");
  const buildDirectory = mkdtempSync(path.join(tmpdir(), prefix));
  const testBinary = path.join(buildDirectory, "Debug", `${target}.exe`);
  try {
    runCheckedProcess([
      resolveCmakePath(),
      "-S", path.join(projectRoot, "plugin"),
      "-B", buildDirectory,
      "-G", "Visual Studio 17 2022",
      "-A", "x64",
      "-DPADPILOT_ENABLE_TESTS=ON",
    ], {
      cwd: projectRoot,
      env: cmakeEnvironment(),
      label: `${target} CMake configure`,
      timeoutMs: processDeadlines.cmakeConfigure,
    });
    runCheckedProcess([
      resolveCmakePath(),
      "--build", buildDirectory,
      "--config", "Debug",
      "--target", target,
    ], {
      cwd: projectRoot,
      env: cmakeEnvironment(),
      label: `${target} build`,
      timeoutMs: processDeadlines.cmakeBuild,
    });
    runCheckedProcess([testBinary], {
      cwd: projectRoot,
      label: `${target} execution`,
      timeoutMs: processDeadlines.nativeTest,
    });
  } finally {
    try {
      rmSync(buildDirectory, { force: true, recursive: true });
    } catch (error) {
      console.warn(`[${target}] Temporary build remains at ${buildDirectory}: ${error instanceof Error ? error.message : error}`);
    }
  }
}
