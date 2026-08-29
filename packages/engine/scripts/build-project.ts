import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { build } from "esbuild";
import { openHyperfocusProjectFiles } from "../src/project/index.ts";
import type { PlayableProject2D } from "../src/project/runtime-2d-contracts.ts";
import { auditPlayableProject, playableBehaviorKey } from "../src/project/runtime-2d-support.ts";
import { auditNavigationProject2D, navigationBehaviorKey2D } from "../src/project/runtime-navigation-2d.ts";
import { validatePlayableSaveProject2D } from "../src/project/runtime-save-2d.ts";
import { validatePlayableStoryProject2D } from "../src/project/runtime-story-2d.ts";
import { createHyperfocus3DRuntime, hasHyperfocus3DProject } from "../src/project/runtime-3d.ts";
import { createStandalonePlayableHtml } from "../src/project/standalone-playable.ts";
import { migrateProject } from "../src/project/editor.ts";

const MAX_PROJECT_JSON_BYTES = 10 * 1024 * 1024;
const MAX_ASSET_ARCHIVE_BYTES = 512 * 1024 * 1024;
type PortableBuildProject = Parameters<typeof createStandalonePlayableHtml>[0]["project"];

export type ProjectBehaviorImport = {
  key: string;
  modulePath: string;
  exportName: string;
};

export async function buildPortableProject(projectRoot: string, outputPath?: string) {
  const root = resolve(projectRoot);
  const projectPath = join(root, ".hyperfocus", "project.json");
  const assetsPath = join(root, ".hyperfocus", "assets.hfp");
  await assertBoundedFile(projectPath, MAX_PROJECT_JSON_BYTES, "project.json");
  await assertBoundedFile(assetsPath, MAX_ASSET_ARCHIVE_BYTES, "assets.hfp");
  const [projectJsonBuffer, assetsArchiveBuffer] = await Promise.all([readFile(projectPath), readFile(assetsPath)]);
  const projectJson = new Uint8Array(projectJsonBuffer);
  const assetsArchive = new Uint8Array(assetsArchiveBuffer);
  const opened = await openHyperfocusProjectFiles(projectJson, assetsArchive, {
    maxArchiveBytes: MAX_ASSET_ARCHIVE_BYTES,
    maxAssets: 5_000,
    maxUnpackedBytes: MAX_ASSET_ARCHIVE_BYTES,
    parseProject: migrateProject,
  });
  assertBuildMetadata(opened.project);
  validatePlayableSaveProject2D(opened.project);
  validatePlayableStoryProject2D(opened.project);
  const behaviorImports = collectProjectBehaviorImports(opened.project, root);
  const is3D = hasHyperfocus3DProject(opened.project);
  if (is3D) await createHyperfocus3DRuntime(opened.project, opened.assets);
  const diagnostics = is3D ? [] : [
    ...auditPlayableProject(opened.project, [...behaviorImports.map((item) => item.key), navigationBehaviorKey2D()]),
    ...auditNavigationProject2D(opened.project),
  ];
  if (diagnostics.length) throw new Error(`Project runtime preflight failed:\n${diagnostics.map((item) => `- ${item.message}`).join("\n")}`);

  const entry = createBehaviorBundleEntry(behaviorImports);
  const result = await build({
    stdin: { contents: entry, resolveDir: root, sourcefile: "hyperfocus-project-entry.ts", loader: "ts" },
    bundle: true,
    define: { __HYPERFOCUS_STANDALONE_AUTO_BOOT__: "false" },
    format: "iife",
    minify: true,
    platform: "browser",
    target: "es2022",
    write: false,
  });
  if (result.outputFiles.length !== 1 || !result.outputFiles[0]) {
    throw new Error(`Project behavior bundle must produce exactly one JavaScript output; received ${result.outputFiles.length}. CSS, workers, WASM sidecars, and emitted assets are not supported by the one-file lane.`);
  }
  const runtimeSource = new TextDecoder().decode(result.outputFiles[0].contents);
  if (/\bimport\s*(?:\(|["'{*])/.test(runtimeSource)) throw new Error("Project behavior bundle retained an unresolved import.");
  const html = createStandalonePlayableHtml({ project: opened.project, projectJson, assetsArchive, runtimeSource });
  const destination = resolve(outputPath ?? join(root, "dist", `${slug(opened.project.name)}.html`));
  const temporary = `${destination}.staging-${process.pid}-${crypto.randomUUID()}`;
  await mkdir(dirname(destination), { recursive: true });
  try {
    await writeFile(temporary, html, "utf8");
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
  return { outputPath: destination, bytes: new TextEncoder().encode(html).byteLength, behaviorCount: behaviorImports.length };
}

export function collectProjectBehaviorImports(project: PlayableProject2D, projectRoot: string): ProjectBehaviorImport[] {
  const root = resolve(projectRoot);
  const imports = new Map<string, ProjectBehaviorImport>();
  for (const scene of project.scenes) {
    for (const entity of scene.entities) {
      for (const component of entity.components) {
        if (!component.enabled || component.type !== "behavior") continue;
        const moduleName = component.values.module;
        if (moduleName === "builtin:player" || moduleName === "builtin:patrol" || moduleName === "builtin:navigate" || moduleName === "builtin:platformer" || moduleName === "builtin:pong-paddle" || moduleName === "builtin:pong-ai" || moduleName === "builtin:pong-ball") continue;
        const key = playableBehaviorKey(component);
        const exportName = component.values.export ?? "update";
        if (!key || typeof moduleName !== "string" || typeof exportName !== "string") throw new Error(`Behavior ${component.id} has an invalid module or export name.`);
        if (!moduleName.startsWith("./") && !moduleName.startsWith("../")) throw new Error(`Behavior ${key} must use a relative source-module path.`);
        const modulePath = resolve(root, moduleName);
        const outside = relative(root, modulePath);
        if (outside === ".." || outside.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(outside)) throw new Error(`Behavior ${key} resolves outside the project root.`);
        const existing = imports.get(key);
        if (existing && existing.modulePath !== modulePath) throw new Error(`Behavior key ${key} resolves ambiguously.`);
        imports.set(key, { key, modulePath, exportName });
      }
    }
  }
  return [...imports.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function createBehaviorBundleEntry(imports: readonly ProjectBehaviorImport[]) {
  const runtimePath = resolveStandaloneRuntimeEntry();
  const modules = new Map<string, string>();
  for (const item of imports) if (!modules.has(item.modulePath)) modules.set(item.modulePath, `behaviorModule${modules.size}`);
  const importLines = [...modules].map(([path, alias]) => `import * as ${alias} from ${JSON.stringify(path.replace(/\\/g, "/"))};`);
  const registryLines = imports.map((item) => `  ${JSON.stringify(item.key)}: ${modules.get(item.modulePath)}[${JSON.stringify(item.exportName)}],`);
  return [
    `import { startStandalonePlayable } from ${JSON.stringify(runtimePath)};`,
    ...importLines,
    "const behaviors = {",
    ...registryLines,
    "};",
    "for (const [key, behavior] of Object.entries(behaviors)) if (typeof behavior !== 'function') throw new Error(`Behavior export ${key} is not a function.`);",
    "startStandalonePlayable({ behaviors });",
  ].join("\n");
}

export function resolveStandaloneRuntimeEntry() {
  return resolve(import.meta.dir, "..", "..", "..", "apps", "engine-editor", "src", "standalone-entry.ts").replace(/\\/g, "/");
}

async function assertBoundedFile(path: string, maximum: number, label: string) {
  if (!existsSync(path)) throw new Error(`Missing ${label}: ${path}`);
  const details = await stat(path);
  if (!details.isFile() || details.size > maximum) throw new Error(`${label} must be a file no larger than ${maximum} bytes.`);
}

function assertBuildMetadata(project: PortableBuildProject) {
  if (!project || typeof project !== "object" || typeof project.name !== "string" || !project.name || !project.settings || typeof project.settings.locale !== "string" || typeof project.settings.targetProfile !== "string") {
    throw new Error("project.json does not contain the editor build metadata required for standalone HTML.");
  }
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "game";
}

function argument(name: string) {
  const exactIndex = process.argv.indexOf(name);
  if (exactIndex >= 0) return process.argv[exactIndex + 1];
  const prefixed = process.argv.find((value) => value.startsWith(`${name}=`));
  return prefixed?.slice(name.length + 1);
}

if (import.meta.main) {
  const result = await buildPortableProject(argument("--project") ?? process.cwd(), argument("--out"));
  console.log(`Built ${basename(result.outputPath)} (${result.bytes} bytes, ${result.behaviorCount} custom behaviors): ${result.outputPath}`);
}
