import { existsSync, lstatSync, realpathSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { snapshotDirectory } from "./directory-snapshot";
import { promoteStagedDirectory } from "./directory-transaction";
import { REQUIRED_UI_ENTRY_ASSETS } from "./ui-build-contract";

type CliArgs = Record<string, string>;

function parseArgs(argv: string[]) {
  const values: CliArgs = {};
  const allowed = new Set(["bundle-contents", "project-root", "ui-source"]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      if (argument.length === 0) {
        continue;
      }
      throw new Error(`Unexpected deploy-ui argument: ${argument}`);
    }
    const key = argument.slice(2);
    if (!allowed.has(key) || key in values) {
      throw new Error(`Unknown or duplicate deploy-ui argument: --${key}`);
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for deploy-ui argument: --${key}`);
    }
    values[key] = next;
    index += 1;
  }
  return values;
}

function validateBundleContents(bundleContents: string) {
  const resolved = path.resolve(bundleContents);
  const bundleRoot = path.dirname(resolved);
  if (path.basename(resolved).toLowerCase() !== "contents"
      || path.basename(bundleRoot).toLowerCase() !== "padpilot.vst3"
      || !existsSync(path.join(resolved, "x86_64-win", "PadPilot.vst3"))
      || !lstatSync(path.join(resolved, "x86_64-win", "PadPilot.vst3")).isFile()
      || lstatSync(path.join(resolved, "x86_64-win", "PadPilot.vst3")).size <= 0) {
    throw new Error("--bundle-contents must identify a built PadPilot.vst3/Contents directory.");
  }
  if (lstatSync(resolved).isSymbolicLink() || lstatSync(bundleRoot).isSymbolicLink()) {
    throw new Error("Refusing to deploy UI assets through a linked plugin bundle.");
  }
  return resolved;
}

function containedPath(root: string, candidate: string) {
  const relativePath = path.relative(root, candidate);
  return relativePath !== "" && relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
}

function validateUiSource(projectRoot: string, uiSource?: string) {
  const project = path.resolve(projectRoot);
  const resolved = path.resolve(uiSource ?? path.join(project, "ui", "dist"));
  if (
    !existsSync(project) || !lstatSync(project).isDirectory() || lstatSync(project).isSymbolicLink() ||
    !existsSync(resolved) || !lstatSync(resolved).isDirectory() || lstatSync(resolved).isSymbolicLink() ||
    !containedPath(realpathSync(project), realpathSync(resolved))
  ) {
    throw new Error(`UI deployment source must be a real directory inside the project: ${resolved}`);
  }
  for (const filename of REQUIRED_UI_ENTRY_ASSETS) {
    const filePath = path.join(resolved, filename);
    if (!existsSync(filePath)) {
      throw new Error(`Missing complete UI build output: ${filePath}`);
    }
    const fileStat = lstatSync(filePath);
    if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.size <= 0) {
      throw new Error(`UI deployment entry asset must be a nonempty regular file: ${filePath}`);
    }
  }
  return resolved;
}

export async function deployUiAssets(projectRoot: string, bundleContents: string, uiSource?: string) {
  const project = path.resolve(projectRoot);
  const resolvedBundleContents = validateBundleContents(bundleContents);
  const resolvedUiSource = validateUiSource(project, uiSource);
  const sourceSnapshot = await snapshotDirectory(resolvedUiSource);

  const resourcesDirectory = path.join(resolvedBundleContents, "Resources");
  const bundleUiDirectory = path.join(resourcesDirectory, "ui");
  if (existsSync(resourcesDirectory)) {
    const resourcesStat = lstatSync(resourcesDirectory);
    if (!resourcesStat.isDirectory() || resourcesStat.isSymbolicLink()) {
      throw new Error("Refusing to deploy UI assets through a linked or non-directory Resources path.");
    }
  } else {
    await mkdir(resourcesDirectory);
  }
  const stagingDirectory = await mkdtemp(path.join(resourcesDirectory, ".ui-deploy-"));
  let stagingExists = true;
  try {
    // index.html references sibling main.js and main.css assets.
    await cp(resolvedUiSource, stagingDirectory, { force: true, recursive: true });
    const [stagedSnapshot, sourceSnapshotAfterCopy] = await Promise.all([
      snapshotDirectory(stagingDirectory),
      snapshotDirectory(resolvedUiSource),
    ]);
    if (stagedSnapshot !== sourceSnapshot || sourceSnapshotAfterCopy !== sourceSnapshot) {
      throw new Error("UI output changed while deployment was being staged.");
    }
    const promotion = await promoteStagedDirectory(stagingDirectory, bundleUiDirectory, {
      validate: async (directory) => {
        if (await snapshotDirectory(directory) !== sourceSnapshot) {
          throw new Error("Staged UI deployment failed its final integrity check.");
        }
        if (REQUIRED_UI_ENTRY_ASSETS.some((filename) =>
          !existsSync(path.join(directory, filename)))) {
          throw new Error("Staged UI deployment is incomplete.");
        }
      },
    });
    stagingExists = false;
    if (promotion.retainedBackup) {
      console.warn(`[deploy-ui] Previous UI backup remains at ${promotion.retainedBackup}.`);
    }
    return promotion.destination;
  } finally {
    if (stagingExists) {
      await rm(stagingDirectory, { force: true, recursive: true });
    }
  }
}

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2));
  const bundleContents = args["bundle-contents"];
  if (!bundleContents) {
    throw new Error("Missing required argument: --bundle-contents <path>");
  }
  const projectRoot = path.resolve(args["project-root"] ?? path.resolve(import.meta.dir, ".."));
  const uiSource = args["ui-source"];
  console.log(`[deploy-ui] Deploying SolidJS UI assets from ${uiSource ?? "ui/dist"}...`);
  const destination = await deployUiAssets(projectRoot, bundleContents, uiSource);
  console.log(`[deploy-ui] Deployed UI assets to ${destination}`);
}
