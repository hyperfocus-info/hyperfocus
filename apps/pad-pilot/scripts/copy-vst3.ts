import { existsSync, lstatSync } from "node:fs";
import { cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { snapshotDirectory } from "./directory-snapshot";
import { promoteStagedDirectory } from "./directory-transaction";

type CopyOptions = {
  config: "Debug" | "Release";
};

function parseArgs(argv: string[]) {
  const options: CopyOptions = { config: "Debug" };
  let configured = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--config") {
      const value = argv[index + 1];
      if (configured || (value !== "Debug" && value !== "Release")) {
        throw new Error("copy-vst3 --config must be specified once as Debug or Release.");
      }
      options.config = value;
      configured = true;
      index += 1;
    } else if (arg === "--release") {
      if (configured) {
        throw new Error("copy-vst3 configuration was specified more than once.");
      }
      options.config = "Release";
      configured = true;
    } else if (arg.length > 0) {
      throw new Error(`Unknown copy-vst3 argument: ${arg}`);
    }
  }
  return options;
}

function bundleBinary(bundleRoot: string) {
  return path.join(bundleRoot, "Contents", "x86_64-win", "PadPilot.vst3");
}

function hasBundleBinary(bundleRoot: string) {
  const binary = bundleBinary(bundleRoot);
  return existsSync(binary) && lstatSync(binary).isFile() && lstatSync(binary).size > 0;
}

export async function deployVst3Bundle(sourceBundle: string, destinationBundle: string) {
  const source = path.resolve(sourceBundle);
  const destination = path.resolve(destinationBundle);
  if (!hasBundleBinary(source) || !lstatSync(source).isDirectory()) {
    throw new Error(`Built bundle not found: ${source}`);
  }
  if (path.basename(source).toLowerCase() !== "padpilot.vst3" || path.basename(destination).toLowerCase() !== "padpilot.vst3") {
    throw new Error("PadPilot deployment source and destination must be PadPilot.vst3 bundle directories.");
  }
  const sourceSnapshot = await snapshotDirectory(source);

  const destinationParent = path.dirname(destination);
  await mkdir(destinationParent, { recursive: true });
  if (lstatSync(destinationParent).isSymbolicLink()) {
    throw new Error("Refusing to deploy through a linked VST3 destination directory.");
  }
  const staged = await mkdtemp(path.join(destinationParent, ".PadPilot.vst3.copy-"));
  let stagedExists = true;
  try {
    await cp(source, staged, { force: false, recursive: true });
    if (!hasBundleBinary(staged)) {
      throw new Error("Staged VST3 bundle is incomplete.");
    }
    const [stagedSnapshot, sourceSnapshotAfterCopy] = await Promise.all([
      snapshotDirectory(staged),
      snapshotDirectory(source),
    ]);
    if (stagedSnapshot !== sourceSnapshot || sourceSnapshotAfterCopy !== sourceSnapshot) {
      throw new Error("Built VST3 bundle changed while deployment was being staged.");
    }
    const promotion = await promoteStagedDirectory(staged, destination, {
      validate: async (directory) => {
        if (await snapshotDirectory(directory) !== sourceSnapshot) {
          throw new Error("Staged VST3 bundle failed its final integrity check.");
        }
        if (!hasBundleBinary(directory)) {
          throw new Error("Staged VST3 bundle lost its plugin binary.");
        }
      },
    });
    stagedExists = false;
    return { destination, retainedBackup: promotion.retainedBackup, source };
  } finally {
    if (stagedExists) {
      await rm(staged, { force: true, recursive: true });
    }
  }
}

if (import.meta.main) {
  const options = parseArgs(process.argv.slice(2));
  const projectRoot = path.resolve(import.meta.dir, "..");
  const sourceBundle = path.join(
    projectRoot,
    "build",
    "plugin",
    "PadPilot_artefacts",
    options.config,
    "VST3",
    "PadPilot.vst3",
  );
  const destinationBundle = "C:/Program Files/Common Files/VST3/PadPilot.vst3";

  try {
    const result = await deployVst3Bundle(sourceBundle, destinationBundle);
    console.log(`[copy] SUCCESS (${options.config})`);
    console.log(`[copy] Source directory: ${result.source}`);
    console.log(`[copy] Destination directory: ${result.destination}`);
    if (result.retainedBackup) {
      console.warn(`[copy] Old bundle backup retained: ${result.retainedBackup}`);
    }
  } catch (error) {
    console.error(`[copy] ERROR (${options.config})`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
