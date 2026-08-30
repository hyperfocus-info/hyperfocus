import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  cmakeEnvironment,
  processDeadlines,
  resolveCmakePath,
  runCheckedProcess,
} from "./process-runner";

export type NativeTestTarget =
  | "padpilot-native-tests"
  | "padpilot-processor-tests"
  | "padpilot-updater-tests";

export function runNativeTestTargets(targets: readonly NativeTestTarget[]) {
  if (targets.length === 0) return;

  const suiteName = targets.join("-");
  const projectRoot = path.resolve(import.meta.dir, "..");
  const buildDirectory = mkdtempSync(path.join(tmpdir(), `${suiteName}-`));
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
      label: `${suiteName} CMake configure`,
      timeoutMs: processDeadlines.cmakeConfigure,
    });
    for (const target of targets) {
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
      runCheckedProcess([path.join(buildDirectory, "Debug", `${target}.exe`)], {
        cwd: projectRoot,
        label: `${target} execution`,
        timeoutMs: processDeadlines.nativeTest,
      });
    }
  } finally {
    try {
      rmSync(buildDirectory, { force: true, recursive: true });
    } catch (error) {
      console.warn(`[${suiteName}] Temporary build remains at ${buildDirectory}: ${error instanceof Error ? error.message : error}`);
    }
  }
}

export function runNativeTestTarget(target: NativeTestTarget) {
  runNativeTestTargets([target]);
}
