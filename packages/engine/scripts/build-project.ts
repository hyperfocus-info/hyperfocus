import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { build, version as esbuildVersion } from "esbuild";
import { captureBundleInputs, createGameBuildReceipt, discoverBuildConfiguration, hashReceiptInput, verifyGameBuildReceiptFile } from "./project-build/receipt.ts";
import { openHyperfocusProjectFiles } from "../src/project/index.ts";
import type { PlayableProject2D } from "../src/project/runtime2d/runtime-2d-contracts.ts";
import { auditPlayableProject, isBuiltinPlayableBehavior2D, isPlayablePostEffect2D, playableBehaviorKey } from "../src/project/runtime2d/runtime-2d-support.ts";
import { auditNavigationProject2D, navigationBehaviorKey2D } from "../src/project/runtime-navigation-2d.ts";
import { validatePlayableSaveProject2D } from "../src/project/runtime-save-2d.ts";
import { validatePlayableStoryProject2D } from "../src/project/runtime-story-2d.ts";
import { hasHyperfocus3DProject } from "../src/project/metadata/index.ts";
import { createRuntimeStartup3D } from '../src/project/3d/runtime/startup.ts';
import { createStandalonePlayableHtml } from "../src/project/standalone-playable.ts";
import { migrateProject } from "../src/project/editor.ts";
import { buildWebProject, readAssetUrlMap } from './project-build/web-project.ts';

declare const __HYPERFOCUS_PACKAGED_TOOLING__: boolean;
const packagedTooling = typeof __HYPERFOCUS_PACKAGED_TOOLING__ !== "undefined" && __HYPERFOCUS_PACKAGED_TOOLING__;

const MAX_PROJECT_JSON_BYTES = 10485760;
const MAX_ASSET_ARCHIVE_BYTES = 536870912;
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
  if (is3D) await createRuntimeStartup3D(opened.project, opened.assets);
  const diagnostics: Array<{ message: string }> = is3D ? [] : [
    ...auditPlayableProject(opened.project, [...behaviorImports.map((item) => item.key), navigationBehaviorKey2D()]),
    ...auditNavigationProject2D(opened.project),
  ];
  if (!is3D) {
    const unsupportedEffects = opened.project.postProcessing.effects.filter((effect) => effect.enabled && !isPlayablePostEffect2D(effect.id));
    if (unsupportedEffects.length) diagnostics.push({ message: `Enabled post effects are not executed by the portable runtime: ${unsupportedEffects.map((effect) => effect.id).join(", ")}.` });
  }
  if (diagnostics.length) throw new Error(`Project runtime preflight failed:\n${diagnostics.map((item) => `- ${item.message}`).join("\n")}`);

  const entry = createBehaviorBundleEntry(behaviorImports, is3D ? '3d' : '2d');
  const capture = captureBundleInputs();
  const result = await build({
    absWorkingDir: root,
    metafile: true,
    plugins: [capture.plugin],
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
  const closure = capture.closure(result.metafile, root, entry);
  const engineRoot = resolve(import.meta.dir, packagedTooling ? "../.." : "..");
  const configuration = await discoverBuildConfiguration([root, engineRoot, ...closure.filter((input) => !input.path.startsWith("generated:")).map((input) => dirname(input.path))]);
  const manifest = JSON.parse(await readFile(join(engineRoot, "package.json"), "utf8"));
  const receipt = createGameBuildReceipt({ artifactPath: destination, artifact: html, projectRoot: root,
    inputs: [...closure, ...configuration, hashReceiptInput(projectPath, projectJson, "canonical"), hashReceiptInput(assetsPath, assetsArchive, "canonical"),
      hashReceiptInput(import.meta.path, await readFile(import.meta.path), "tooling"),
      ...(packagedTooling ? await Promise.all((await readdir(import.meta.dir)).filter((name) => name.endsWith(".js")).map(async (name) => {
        const path = join(import.meta.dir, name);
        return hashReceiptInput(path, await readFile(path), "tooling");
      })) : [
        hashReceiptInput(join(import.meta.dir, "project-build/receipt.ts"), await readFile(join(import.meta.dir, "project-build/receipt.ts")), "tooling"),
        hashReceiptInput(join(engineRoot, "src/project/standalone-playable.ts"), await readFile(join(engineRoot, "src/project/standalone-playable.ts")), "tooling")])],
    toolVersions: { bun: Bun.version, esbuild: esbuildVersion, engine: manifest.version, platform: process.platform, arch: process.arch }
  });
  const receiptPath = `${destination}.receipt.json`;
  const temporary = `${destination}.staging-${process.pid}-${crypto.randomUUID()}`;
  await mkdir(dirname(destination), { recursive: true });
  try {
    await writeFile(temporary, html, "utf8");
    await writeFile(`${temporary}.receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    await rename(temporary, destination);
    await rename(`${temporary}.receipt.json`, receiptPath);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    await rm(`${temporary}.receipt.json`, { force: true }).catch(() => undefined);
    throw error;
  }
  return { outputPath: destination, receiptPath, buildIdentity: receipt.identity, bytes: new TextEncoder().encode(html).byteLength, behaviorCount: behaviorImports.length,
    sourceFiles: closure.filter(input => !input.path.startsWith('generated:')).map(input => input.path) };
}

export function collectProjectBehaviorImports(project: PlayableProject2D, projectRoot: string): ProjectBehaviorImport[] {
  const root = resolve(projectRoot);
  const imports = new Map<string, ProjectBehaviorImport>();
  for (const scene of project.scenes) {
    for (const entity of scene.entities) {
      for (const component of entity.components) {
        if (!component.enabled || component.type !== "behavior") continue;
        const moduleName = component.values.module;
        if (isBuiltinPlayableBehavior2D(moduleName)) continue;
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

export function createBehaviorBundleEntry(imports: readonly ProjectBehaviorImport[], dimension?: '2d' | '3d') {
  const runtimePath = resolveStandaloneRuntimeEntry(dimension);
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

export function resolveStandaloneRuntimeEntry(dimension?: '2d' | '3d') {
  if (packagedTooling) return resolve(import.meta.dir, `standalone-runtime${dimension ? `-${dimension}` : ''}.js`).replace(/\\/g, "/");
  return resolve(import.meta.dir, "..", "..", "..", "apps", "engine-editor", "src", dimension ? `standalone/entry-${dimension}.ts` : "standalone-entry.ts").replace(/\\/g, "/");
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

function argument(args: readonly string[], name: string) {
  const exactIndex = args.indexOf(name);
  if (exactIndex >= 0) return args[exactIndex + 1];
  const prefixed = args.find((value) => value.startsWith(`${name}=`));
  return prefixed?.slice(name.length + 1);
}

export async function runBuildProjectCli(args: readonly string[]) {
  const artifactPath = argument(args, "--verify-receipt");
  if (artifactPath) {
    const result = await verifyGameBuildReceiptFile({ artifactPath });
    console.log(JSON.stringify(result));
    if (!result.receiptMatches || !result.artifactMatches) process.exitCode = 1;
  } else {
    if (!args.includes('--offline')) {
      const result = await buildWebProject({ projectDirectory: argument(args, '--project') ?? process.cwd(), outputDirectory: argument(args, '--out'), assetBaseUrl: argument(args, '--asset-base-url'), assetUrls: await readAssetUrlMap(argument(args, '--asset-map')) });
      console.log(`Built streaming web game: ${result.outputPath}\nStartup project/assets: ${result.manifest.report.startupBytes} bytes; optional assets: ${result.manifest.report.optionalBytes} bytes. Serve the complete folder over HTTP.`);
      return;
    }
    const result = await buildPortableProject(argument(args, "--project") ?? process.cwd(), argument(args, "--out"));
    console.log(`Built ${basename(result.outputPath)} (${result.bytes} bytes, ${result.behaviorCount} custom behaviors): ${result.outputPath}\nReceipt: ${result.receiptPath}`);
  }
}

if (import.meta.main) await runBuildProjectCli(process.argv.slice(2));
