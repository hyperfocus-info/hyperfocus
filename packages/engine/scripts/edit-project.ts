import { resolve } from "node:path";
import { createHyperfocusProjectFiles, type HyperfocusAssetInput } from "../src/project/index.ts";
import { readHyperfocusProjectPair, writeHyperfocusProjectPair } from "../src/project/filesystem.ts";
import { migrateProject, validateProject } from "../src/project/editor.ts";

const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

export type PlayerSpeedEditOptions = {
  entityId?: string;
  updatedAt?: string;
};

export type PlayerSpeedEditResult = {
  projectRoot: string;
  entityId: string;
  previousSpeed: number;
  speed: number;
  canonicalFileCount: 2;
};

/** A deliberately narrow data-only operation suitable for a first project. */
export async function setProjectPlayerSpeed(
  projectDirectory: string,
  speed: number,
  options: PlayerSpeedEditOptions = {},
): Promise<PlayerSpeedEditResult> {
  if (!Number.isFinite(speed) || speed < 1 || speed > 2_000) throw new Error("Player speed must be a finite number from 1 through 2000.");
  const projectRoot = resolve(projectDirectory);
  const opened = await readHyperfocusProjectPair(projectRoot, {
    maxArchiveBytes: MAX_ARCHIVE_BYTES,
    maxAssets: 5_000,
    maxUnpackedBytes: MAX_ARCHIVE_BYTES,
    parseProject: migrateProject,
  });
  validateProject(opened.project);
  const imported = opened.project.assets.filter((asset) => asset.source === "imported");
  if (imported.length !== opened.assets.length) throw new Error(`Project declares ${imported.length} imported assets but its verified pack exposes ${opened.assets.length}.`);
  const entityId = options.entityId ?? "player";
  const activeScene = opened.project.scenes.find((scene) => scene.id === opened.project.activeSceneId);
  const entity = activeScene?.entities.find((candidate) => candidate.id === entityId);
  if (!entity) throw new Error(`Active scene ${opened.project.activeSceneId} has no entity ${entityId}.`);
  const input = entity.components.find((component) => component.type === "input");
  if (!input) throw new Error(`Entity ${entityId} has no input component to edit.`);
  const previousSpeed = input.values.speed;
  if (typeof previousSpeed !== "number" || !Number.isFinite(previousSpeed)) throw new Error(`Entity ${entityId} input speed is not numeric.`);
  const updatedAt = options.updatedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(updatedAt))) throw new Error("Project edit timestamp must be an ISO-compatible date.");
  input.values.speed = speed;
  opened.project.updatedAt = updatedAt;
  validateProject(opened.project);
  const assetInputs: HyperfocusAssetInput[] = opened.assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    mimeType: asset.mimeType,
    bytes: new Uint8Array(asset.bytes),
  }));
  const files = await createHyperfocusProjectFiles(opened.project, assetInputs, {
    maxAssets: 5_000,
    maxUnpackedBytes: MAX_ARCHIVE_BYTES,
  });
  await writeHyperfocusProjectPair(projectRoot, files, {
    maxArchiveBytes: MAX_ARCHIVE_BYTES,
    maxAssets: 5_000,
    maxUnpackedBytes: MAX_ARCHIVE_BYTES,
  });
  return { projectRoot, entityId, previousSpeed, speed, canonicalFileCount: 2 };
}

export function projectEditCliHelp(): string {
  return [
    "Hyperfocus beginner-safe project edit",
    "",
    "Usage:",
    "  bun run edit:project -- --project <game-directory> --player-speed <1-2000> [--entity player]",
    "",
    "This changes one input-component value and crash-safely replaces the same two canonical files.",
    "It does not generate source, wrappers, backups, or additional canonical files.",
  ].join("\n");
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const prefixed = args.find((value) => value.startsWith(`${name}=`));
  return prefixed?.slice(name.length + 1);
}

export async function runProjectEditCli(args: readonly string[]): Promise<number> {
  if (!args.length || args.includes("--help") || args.includes("-h")) {
    console.log(projectEditCliHelp());
    return 0;
  }
  const projectDirectory = option(args, "--project");
  const speedText = option(args, "--player-speed");
  if (!projectDirectory || speedText === undefined) throw new Error("Both --project and --player-speed are required.");
  const result = await setProjectPlayerSpeed(projectDirectory, Number(speedText), { entityId: option(args, "--entity") });
  console.log(`Updated ${result.entityId} speed from ${result.previousSpeed} to ${result.speed}; project still has exactly 2 canonical files.`);
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await runProjectEditCli(process.argv.slice(2));
  } catch (cause) {
    console.error(`Project edit error: ${cause instanceof Error ? cause.message : String(cause)}`);
    console.error("Run with --help for the supported beginner-safe edit.");
    process.exitCode = 1;
  }
}
