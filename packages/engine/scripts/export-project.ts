import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  HYPERFOCUS_ASSETS_FILENAME,
  HYPERFOCUS_DIRECTORY,
  HYPERFOCUS_PROJECT_FILENAME,
  openHyperfocusProjectFiles,
} from "../src/project/index.ts";
import {
  MAX_NEUTRAL_EXPORT_ASSETS,
  MAX_NEUTRAL_EXPORT_BYTES,
  createNeutralExportBundle,
  parseNeutralExportProject,
  type NeutralExportManifest,
  type NeutralExportProject,
} from "../src/project/neutral-export.ts";
import { migrateProject } from "../src/project/editor.ts";

export {
  NEUTRAL_EXPORT_FORMAT,
  NEUTRAL_EXPORT_VERSION,
  auditNeutralExport,
  parseNeutralExportManifest,
  type NeutralExportAsset,
  type NeutralExportDiagnostic,
  type NeutralExportManifest,
} from "../src/project/neutral-export.ts";

const MAX_PROJECT_BYTES = 10 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const NEUTRAL_COMPONENTS = new Set(["transform", "sprite", "collider", "input", "camera", "audio", "ui"]);

export type NeutralExportResult = {
  outputDirectory: string;
  manifest: NeutralExportManifest;
  fileCount: number;
  bytesWritten: number;
};

export type ExportNeutralProjectOptions = {
  projectDirectory: string;
  outputDirectory: string;
};

/**
 * Expands the canonical pair into ordinary JSON and named assets only when the
 * user explicitly requests an escape export. The destination must not exist.
 */
export async function exportNeutralProject(options: ExportNeutralProjectOptions): Promise<NeutralExportResult> {
  const projectRoot = resolve(options.projectDirectory);
  const outputDirectory = resolve(options.outputDirectory);
  if (existsSync(outputDirectory)) throw new Error(`Export destination already exists: ${outputDirectory}. Choose a new directory so no files can be overwritten.`);
  const canonicalDirectory = join(projectRoot, HYPERFOCUS_DIRECTORY);
  await assertCanonicalPair(canonicalDirectory);
  const projectPath = join(canonicalDirectory, HYPERFOCUS_PROJECT_FILENAME);
  const archivePath = join(canonicalDirectory, HYPERFOCUS_ASSETS_FILENAME);
  const [projectBuffer, archiveBuffer] = await Promise.all([readFile(projectPath), readFile(archivePath)]);
  if (projectBuffer.byteLength > MAX_PROJECT_BYTES) throw new Error(`${HYPERFOCUS_PROJECT_FILENAME} exceeds ${MAX_PROJECT_BYTES} bytes.`);
  if (archiveBuffer.byteLength > MAX_ARCHIVE_BYTES) throw new Error(`${HYPERFOCUS_ASSETS_FILENAME} exceeds ${MAX_ARCHIVE_BYTES} bytes.`);
  const opened = await openHyperfocusProjectFiles(
    new Uint8Array(projectBuffer),
    new Uint8Array(archiveBuffer),
    {
      maxArchiveBytes: MAX_ARCHIVE_BYTES,
      maxAssets: MAX_NEUTRAL_EXPORT_ASSETS,
      maxUnpackedBytes: MAX_NEUTRAL_EXPORT_BYTES,
      parseProject: parseNeutralExportProject,
    },
  );
  validateNeutralProject(opened.project);
  const bundle = await createNeutralExportBundle(opened.project, opened.assets);
  const parent = dirname(outputDirectory);
  await mkdir(parent, { recursive: true });
  const staging = join(parent, `.${basename(outputDirectory)}.neutral-staging-${process.pid}-${crypto.randomUUID()}`);
  if (dirname(resolve(staging)) !== resolve(parent)) throw new Error("Neutral export staging directory escaped its destination parent.");
  try {
    await mkdir(staging);
    if (bundle.manifest.assets.length) await mkdir(join(staging, "assets"), { recursive: true });
    await Promise.all(bundle.files.map((file) => writeFile(resolveExportPath(staging, file.path), file.bytes, { flag: "wx" })));
    await rename(staging, outputDirectory);
  } catch (cause) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    throw cause;
  }
  return {
    outputDirectory,
    manifest: bundle.manifest,
    fileCount: bundle.fileCount,
    bytesWritten: bundle.bytesWritten,
  };
}

function validateNeutralProject(project: NeutralExportProject): void {
  // The current editor validator intentionally rejects unknown component types.
  // Generic escape must preserve additive component records, so validate their
  // complete surrounding shape through a temporary known type, then report the
  // original type as an unsupported translation below.
  const validationCopy = structuredClone(project);
  if (Array.isArray(validationCopy.scenes)) {
    for (const scene of validationCopy.scenes) {
      if (!scene || !Array.isArray(scene.entities)) continue;
      for (const entity of scene.entities) {
        if (!entity || !Array.isArray(entity.components)) continue;
        for (const component of entity.components) {
          if (component && typeof component.type === "string" && component.type !== "behavior" && !NEUTRAL_COMPONENTS.has(component.type)) component.type = "ui";
        }
      }
    }
  }
  migrateProject(validationCopy);
}


async function assertCanonicalPair(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true }).catch((cause) => {
    throw new Error(`Cannot read canonical project directory ${directory}: ${errorMessage(cause)}`);
  });
  const names = entries.map((entry) => entry.name).sort(compareText);
  const expected = [HYPERFOCUS_ASSETS_FILENAME, HYPERFOCUS_PROJECT_FILENAME].sort(compareText);
  if (entries.some((entry) => !entry.isFile()) || names.length !== 2 || names.some((name, index) => name !== expected[index])) {
    throw new Error(`${HYPERFOCUS_DIRECTORY} must contain exactly ${HYPERFOCUS_PROJECT_FILENAME} and ${HYPERFOCUS_ASSETS_FILENAME}; found ${names.join(", ") || "nothing"}.`);
  }
}

function resolveExportPath(root: string, portablePath: string): string {
  if (portablePath === "project.json" || portablePath === "manifest.json") return join(root, portablePath);
  if (!/^assets\/[^/\\]+$/u.test(portablePath)) throw new Error(`Unsafe neutral export path: ${portablePath}`);
  const target = resolve(root, ...portablePath.split("/"));
  const assetRoot = resolve(root, "assets");
  if (dirname(target) !== assetRoot) throw new Error(`Neutral export path escaped its assets directory: ${portablePath}`);
  return target;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

export function neutralExportCliHelp(): string {
  return [
    "Hyperfocus neutral project export",
    "",
    "Usage:",
    "  bun run export:project -- --project <game-directory> --out <new-export-directory> [--json]",
    "",
    "Output:",
    "  project.json       Canonical ordinary JSON; no fields are silently dropped",
    "  manifest.json      Stable file/hash map and ordered portability diagnostics",
    "  assets/*           Original verified asset bytes under safe deterministic names",
    "",
    "The destination must not already exist. No runtime, generated wrappers, package manifest, or network dependency is emitted.",
  ].join("\n");
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const prefixed = args.find((value) => value.startsWith(`${name}=`));
  return prefixed?.slice(name.length + 1);
}

export async function runNeutralExportCli(args: readonly string[]): Promise<number> {
  if (!args.length || args.includes("--help") || args.includes("-h")) {
    console.log(neutralExportCliHelp());
    return 0;
  }
  const projectDirectory = option(args, "--project");
  const outputDirectory = option(args, "--out");
  if (!projectDirectory || !outputDirectory) throw new Error("Both --project and --out are required.");
  const result = await exportNeutralProject({ projectDirectory, outputDirectory });
  if (args.includes("--json")) console.log(JSON.stringify(result));
  else {
    console.log(`Exported ${result.fileCount} ordinary files to ${result.outputDirectory}.`);
    console.log(`${result.manifest.diagnostics.length} portability warning(s); inspect manifest.json before migrating.`);
  }
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await runNeutralExportCli(process.argv.slice(2));
  } catch (cause) {
    console.error(`Neutral export error: ${errorMessage(cause)}`);
    console.error("Run with --help for usage and output details.");
    process.exitCode = 1;
  }
}
