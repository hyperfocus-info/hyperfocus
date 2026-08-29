import { randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { withProcessLock, promoteStagedDirectory } from "./directory-transaction";
import {
  cmakeEnvironment,
  processDeadlines,
  resolveCmakePath,
  runCheckedProcess,
} from "./process-runner";
import { boundedFetchBytes } from "./synaesthetic-evaluator/bounded-fetch";
import { hashBoundedFile, readBoundedUtf8File } from "@hyperfocus/pad-pilot/bounded-file";

const pluginvalArchiveMaximumBytes = 8 * 1024 * 1024;
const validatorExecutableMaximumBytes = 100 * 1024 * 1024;
const manifestMaximumBytes = 16 * 1024;
const networkDeadlineMs = 2 * 60_000;
const gitDeadlineMs = 10 * 60_000;

export const validatorToolPins = Object.freeze({
  pluginval: Object.freeze({
    archiveSha256: "c08e61ce3b96db41636f8ec7e76f4c7e2c13ebdac7fa1b5a1f52b4f32ec715ab",
    archiveUrl: "https://github.com/Tracktion/pluginval/releases/download/v1.0.4/pluginval_Windows.zip",
    version: "1.0.4",
  }),
  steinberg: Object.freeze({
    commit: "3cdf9ca5d1f5b1b21e0a86832aa4abe55607bd96",
    repository: "https://github.com/steinbergmedia/vst3sdk.git",
    tag: "v3.8.1_build_84",
    version: "3.8.1-build-84",
  }),
});

type ValidatorManifest = {
  pluginval: {
    archiveSha256: string;
    executableSha256: string;
    version: string;
  };
  schemaVersion: 1;
  steinberg: {
    commit: string;
    executableSha256: string;
    version: string;
  };
};

export function parseBootstrapArguments(args: string[]) {
  let force = false;
  for (const argument of args) {
    if (argument === "--force" && !force) {
      force = true;
      continue;
    }
    throw new Error(`Unknown or repeated argument: ${argument}`);
  }
  return { force };
}

export function validatorToolPaths(projectRoot: string) {
  const root = path.join(path.resolve(projectRoot), "build", "vst-validators");
  return Object.freeze({
    manifest: path.join(root, "manifest.json"),
    pluginval: path.join(root, "pluginval", "pluginval.exe"),
    root,
    steinberg: path.join(root, "steinberg", "validator.exe"),
  });
}

export function sha256Bytes(bytes: Uint8Array) {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}

function isManifest(value: unknown): value is ValidatorManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<ValidatorManifest>;
  return manifest.schemaVersion === 1
    && manifest.pluginval?.version === validatorToolPins.pluginval.version
    && manifest.pluginval.archiveSha256 === validatorToolPins.pluginval.archiveSha256
    && typeof manifest.pluginval.executableSha256 === "string"
    && /^[a-f0-9]{64}$/.test(manifest.pluginval.executableSha256)
    && manifest.steinberg?.version === validatorToolPins.steinberg.version
    && manifest.steinberg.commit === validatorToolPins.steinberg.commit
    && typeof manifest.steinberg.executableSha256 === "string"
    && /^[a-f0-9]{64}$/.test(manifest.steinberg.executableSha256);
}

async function readManifest(manifestPath: string) {
  try {
    const text = await readBoundedUtf8File(manifestPath, manifestMaximumBytes, "VST validator manifest");
    const parsed: unknown = JSON.parse(text);
    return isManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function currentInstallValid(projectRoot: string) {
  const paths = validatorToolPaths(projectRoot);
  const manifest = await readManifest(paths.manifest);
  if (!manifest) return false;
  try {
    const [pluginval, steinberg] = await Promise.all([
      hashBoundedFile(paths.pluginval, validatorExecutableMaximumBytes, "pluginval executable"),
      hashBoundedFile(paths.steinberg, validatorExecutableMaximumBytes, "Steinberg validator executable"),
    ]);
    return pluginval.sha256 === manifest.pluginval.executableSha256
      && steinberg.sha256 === manifest.steinberg.executableSha256;
  } catch {
    return false;
  }
}

function run(command: string[], cwd: string, timeoutMs: number, label: string, env?: Record<string, string | undefined>) {
  return runCheckedProcess(command, {
    cwd,
    env,
    label,
    timeoutMs,
  });
}

async function downloadPluginval(workRoot: string) {
  const response = await boundedFetchBytes(validatorToolPins.pluginval.archiveUrl, {
    maxBytes: pluginvalArchiveMaximumBytes,
    maxRedirects: 4,
    timeoutMs: networkDeadlineMs,
  });
  if (!response.ok) {
    throw new Error(`pluginval download failed with HTTP ${response.status}.`);
  }
  const archiveSha256 = sha256Bytes(response.bytes);
  if (archiveSha256 !== validatorToolPins.pluginval.archiveSha256) {
    throw new Error(`pluginval archive checksum mismatch: ${archiveSha256}.`);
  }

  const archivePath = path.join(workRoot, "pluginval.zip");
  const unpackedPath = path.join(workRoot, "pluginval-unpacked");
  await Bun.write(archivePath, response.bytes);
  await mkdir(unpackedPath);
  run(
    [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Expand-Archive -LiteralPath $env:PADPILOT_VALIDATOR_ARCHIVE -DestinationPath $env:PADPILOT_VALIDATOR_DESTINATION",
    ],
    workRoot,
    processDeadlines.archive,
    "pluginval archive extraction",
    {
      ...process.env,
      PADPILOT_VALIDATOR_ARCHIVE: archivePath,
      PADPILOT_VALIDATOR_DESTINATION: unpackedPath,
    },
  );
  const executable = path.join(unpackedPath, "pluginval.exe");
  const executableStat = await lstat(executable);
  if (!executableStat.isFile() || executableStat.isSymbolicLink()) {
    throw new Error("pluginval release archive omitted its regular executable.");
  }
  return executable;
}

async function buildSteinbergValidator(workRoot: string) {
  const source = path.join(workRoot, "vst3sdk");
  const build = path.join(workRoot, "vst3sdk-build");
  run([
    "git",
    "clone",
    "--branch",
    validatorToolPins.steinberg.tag,
    "--depth",
    "1",
    "--recurse-submodules",
    "--shallow-submodules",
    validatorToolPins.steinberg.repository,
    source,
  ], workRoot, gitDeadlineMs, "Steinberg VST3 SDK clone");
  const revisionResult = runCheckedProcess(
    ["git", "-C", source, "rev-parse", "HEAD"],
    {
      cwd: workRoot,
      label: "Steinberg VST3 SDK revision check",
      stdout: "pipe",
      timeoutMs: processDeadlines.script,
    },
  );
  if (!revisionResult.stdout) {
    throw new Error("Steinberg VST3 SDK revision check returned no output.");
  }
  const revision = revisionResult.stdout.toString().trim().toLowerCase();
  if (revision !== validatorToolPins.steinberg.commit) {
    throw new Error(`Steinberg VST3 SDK revision mismatch: ${revision}.`);
  }

  const cmakePath = resolveCmakePath();
  run([
    cmakePath,
    "-S",
    source,
    "-B",
    build,
    "-G",
    "Visual Studio 17 2022",
    "-A",
    "x64",
    "-DSMTG_ENABLE_VST3_PLUGIN_EXAMPLES=OFF",
    "-DSMTG_ENABLE_VSTGUI_SUPPORT=OFF",
  ], workRoot, processDeadlines.cmakeConfigure, "Steinberg validator configure", cmakeEnvironment());
  run([
    cmakePath,
    "--build",
    build,
    "--config",
    "Release",
    "--target",
    "validator",
  ], workRoot, processDeadlines.cmakeBuild, "Steinberg validator build", cmakeEnvironment());

  const candidates: string[] = [];
  const glob = new Bun.Glob("**/validator.exe");
  for await (const candidate of glob.scan({ absolute: true, cwd: build, onlyFiles: true })) {
    candidates.push(path.resolve(candidate));
  }
  const [executable] = candidates;
  if (!executable || candidates.length !== 1) {
    throw new Error(`Steinberg build produced ${candidates.length} validator executables.`);
  }
  return executable;
}

function isOwnedTemporaryDirectory(target: string, parent: string, prefix: string) {
  return path.dirname(target) === path.resolve(parent) && path.basename(target).startsWith(prefix);
}

async function removeOwnedTemporaryDirectory(target: string, parent: string, prefix: string) {
  if (!isOwnedTemporaryDirectory(target, parent, prefix)) {
    throw new Error(`Refusing to remove unexpected temporary directory: ${target}`);
  }
  await rm(target, { force: true, recursive: true });
}

async function installValidators(projectRoot: string) {
  const buildRoot = path.join(projectRoot, "build");
  await mkdir(buildRoot, { recursive: true });
  const systemTemp = path.resolve(tmpdir());
  const workRoot = await mkdtemp(path.join(systemTemp, "padpilot-vst-validators-"));
  const stagePrefix = ".vst-validators-input-";
  const stage = await mkdtemp(path.join(buildRoot, stagePrefix));
  try {
    const [pluginvalSource, steinbergSource] = await Promise.all([
      downloadPluginval(workRoot),
      buildSteinbergValidator(workRoot),
    ]);
    const stagePluginval = path.join(stage, "pluginval", "pluginval.exe");
    const stageSteinberg = path.join(stage, "steinberg", "validator.exe");
    await mkdir(path.dirname(stagePluginval));
    await mkdir(path.dirname(stageSteinberg));
    await copyFile(pluginvalSource, stagePluginval);
    await copyFile(steinbergSource, stageSteinberg);
    const [pluginvalHash, steinbergHash] = await Promise.all([
      hashBoundedFile(stagePluginval, validatorExecutableMaximumBytes, "staged pluginval executable"),
      hashBoundedFile(stageSteinberg, validatorExecutableMaximumBytes, "staged Steinberg validator executable"),
    ]);
    const manifest = {
      pluginval: {
        archiveSha256: validatorToolPins.pluginval.archiveSha256,
        executableSha256: pluginvalHash.sha256,
        version: validatorToolPins.pluginval.version,
      },
      schemaVersion: 1,
      steinberg: {
        commit: validatorToolPins.steinberg.commit,
        executableSha256: steinbergHash.sha256,
        version: validatorToolPins.steinberg.version,
      },
    } satisfies ValidatorManifest;
    await Bun.write(path.join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await promoteStagedDirectory(stage, validatorToolPaths(projectRoot).root, {
      validate: async (stagedDirectory) => {
        const stagedPaths = {
          manifest: path.join(stagedDirectory, "manifest.json"),
          pluginval: path.join(stagedDirectory, "pluginval", "pluginval.exe"),
          steinberg: path.join(stagedDirectory, "steinberg", "validator.exe"),
        };
        if (!isManifest(JSON.parse(await readBoundedUtf8File(
          stagedPaths.manifest,
          manifestMaximumBytes,
          "staged VST validator manifest",
        )))) {
          throw new Error("Staged VST validator manifest is invalid.");
        }
        await Promise.all([
          hashBoundedFile(stagedPaths.pluginval, validatorExecutableMaximumBytes, "staged pluginval executable"),
          hashBoundedFile(stagedPaths.steinberg, validatorExecutableMaximumBytes, "staged Steinberg validator executable"),
        ]);
      },
    });
  } finally {
    if (isOwnedTemporaryDirectory(stage, buildRoot, stagePrefix)) {
      await removeOwnedTemporaryDirectory(stage, buildRoot, stagePrefix);
    }
    await removeOwnedTemporaryDirectory(workRoot, systemTemp, "padpilot-vst-validators-");
  }
}

async function main() {
  if (process.platform !== "win32") {
    throw new Error("PadPilot validator bootstrap currently supports Windows only.");
  }
  const options = parseBootstrapArguments(Bun.argv.slice(2));
  const projectRoot = path.resolve(import.meta.dir, "..");
  const lockPath = path.join(projectRoot, "build", ".padpilot-vst-validator-bootstrap.lock");
  await mkdir(path.dirname(lockPath), { recursive: true });
  await withProcessLock(lockPath, async () => {
    if (!options.force && await currentInstallValid(projectRoot)) {
      console.log(`VST validators already match pinned manifest: ${validatorToolPaths(projectRoot).root}`);
      return;
    }
    await installValidators(projectRoot);
    if (!await currentInstallValid(projectRoot)) {
      throw new Error("Installed VST validators failed post-install integrity verification.");
    }
    console.log(`Installed pinned VST validators: ${validatorToolPaths(projectRoot).root}`);
  }, 45 * 60_000);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
