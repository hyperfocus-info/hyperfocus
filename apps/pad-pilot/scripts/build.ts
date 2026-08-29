import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { withProcessLock } from "./directory-transaction";
import {
  cmakeEnvironment,
  processDeadlines,
  resolveCmakePath,
  runCheckedProcess,
} from "./process-runner";

type BuildOptions = {
  config: "Debug" | "Release";
  copy: boolean;
};

function parseArgs(argv: string[]) {
  const options: BuildOptions = {
    config: "Release",
    copy: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config") {
      const next = argv[i + 1];
      if (next !== "Debug" && next !== "Release") {
        throw new Error("--config must be Debug or Release.");
      }
      options.config = next;
      i += 1;
      continue;
    }
    if (arg === "--release") {
      options.config = "Release";
      continue;
    }
    if (arg === "--no-copy") {
      options.copy = false;
      continue;
    }
    if (arg === "--minify" || arg.length === 0) {
      continue;
    }
    throw new Error(`Unknown build argument: ${arg}`);
  }

  return options;
}

function runCommand(command: string, args: string[], cwd: string, timeoutMs: number, label: string) {
  runCheckedProcess([command, ...args], {
    cwd,
    env: cmakeEnvironment(),
    label,
    timeoutMs,
  });
}

function runBunScript(projectRoot: string, scriptPath: string, args: string[] = []) {
  runCommand(
    process.execPath,
    ["run", scriptPath, ...args],
    projectRoot,
    processDeadlines.script,
    `${scriptPath} script`,
  );
}

function removeBuildDirectory(buildRoot: string, buildDirectory: string) {
  if (path.dirname(buildDirectory) !== buildRoot || path.basename(buildDirectory) !== "plugin") {
    throw new Error("Refusing to remove an unexpected CMake build directory.");
  }
  if (!existsSync(buildDirectory)) {
    return;
  }
  const buildStat = lstatSync(buildDirectory);
  if (!buildStat.isDirectory() || buildStat.isSymbolicLink()) {
    throw new Error("Refusing to remove a non-directory or linked CMake build tree.");
  }
  rmSync(buildDirectory, { recursive: true });
}

function configureCmake(projectRoot: string, cmakePath: string) {
  const buildDir = path.join(projectRoot, "build", "plugin");
  const buildRoot = path.join(projectRoot, "build");
  if (path.relative(buildRoot, buildDir) !== "plugin") {
    throw new Error("CMake build directory escaped the repository build root.");
  }
  const configureArgs = [
    "-S", path.join(projectRoot, "plugin"),
    "-B", buildDir,
    "-G", "Visual Studio 17 2022",
    "-A", "x64",
    "-DPADPILOT_ENABLE_TESTS=OFF",
  ];

  try {
    runCommand(cmakePath, configureArgs, projectRoot, processDeadlines.cmakeConfigure, "CMake configure");
  } catch (error) {
    console.warn("[build] CMake configure failed. Retrying with a clean transactional build directory...");
    const backup = path.join(buildRoot, `.plugin-config-backup-${process.pid}-${randomUUID()}`);
    const hadBuild = existsSync(buildDir);
    if (hadBuild) {
      if (!lstatSync(buildDir).isDirectory() || lstatSync(buildDir).isSymbolicLink()) {
        throw new AggregateError([error], "Refusing to replace a non-directory or linked CMake build tree.");
      }
      renameSync(buildDir, backup);
    }
    try {
      runCommand(cmakePath, configureArgs, projectRoot, processDeadlines.cmakeConfigure, "Clean CMake configure");
    } catch (retryError) {
      try {
        removeBuildDirectory(buildRoot, buildDir);
        if (hadBuild) {
          renameSync(backup, buildDir);
        }
      } catch (restoreError) {
        throw new AggregateError([error, retryError, restoreError], `CMake configure failed and its previous build tree remains at ${backup}.`);
      }
      throw new AggregateError([error, retryError], "CMake configure failed twice; the previous build tree was restored.");
    }
    if (hadBuild) {
      try {
        rmSync(backup, { recursive: true });
      } catch (cleanupError) {
        console.warn(`[build] Clean configure succeeded; old build backup remains at ${backup}: ${cleanupError instanceof Error ? cleanupError.message : cleanupError}`);
      }
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = path.resolve(import.meta.dir, "..");
  const cmakePath = resolveCmakePath();
  const srcBundle = path.join(
    projectRoot,
    "build",
    "plugin",
    "PadPilot_artefacts",
    options.config,
    "VST3",
    "PadPilot.vst3",
  );
  const srcBundleBinary = path.join(srcBundle, "Contents", "x86_64-win", "PadPilot.vst3");

  await withProcessLock(path.join(projectRoot, ".padpilot-cmake-build.lock"), async () => {
    console.log("[build] Generating factory Module catalog...");
    runBunScript(projectRoot, "./scripts/generate-factory-modules.ts");

    console.log("[build] Generating protobuf bindings...");
    runBunScript(projectRoot, "./scripts/generate-proto.ts");

    console.log(`[build] Building web assets (${options.config})...`);
    runBunScript(projectRoot, "./scripts/build-ui.ts", options.config === "Release" ? ["--minify"] : []);

    console.log("[build] Configuring CMake...");
    configureCmake(projectRoot, cmakePath);

    console.log(`[build] Building plugin target PadPilot_VST3 (${options.config})...`);
    runCommand(
      cmakePath,
      ["--build", path.join("build", "plugin"), "--config", options.config, "--target", "PadPilot_VST3"],
      projectRoot,
      processDeadlines.cmakeBuild,
      `PadPilot_VST3 ${options.config} build`,
    );

    if (!(await Bun.file(srcBundleBinary).exists())) {
      throw new Error(`Built bundle not found: ${srcBundle}`);
    }

    if (options.copy) {
      runBunScript(projectRoot, "./scripts/copy-vst3.ts", ["--config", options.config]);
    }
  }, 30 * 60_000);

  console.log(`[build] SUCCESS (${options.config})`);
  console.log(`[build] Built directory: ${srcBundle}`);
  if (options.copy) {
    console.log("[build] Copied directory: C:/Program Files/Common Files/VST3/PadPilot.vst3");
  } else {
    console.log("[build] Copied directory: (skipped by --no-copy)");
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error("[build] ERROR");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

