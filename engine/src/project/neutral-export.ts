import {
  canonicalHyperfocusJson,
  hashHyperfocusAsset,
  type HyperfocusExchangeFile,
  type HyperfocusPortableAsset,
} from "./index.ts";
import { truncateUtf8 } from "../core/text.ts";

export const NEUTRAL_EXPORT_FORMAT = "hyperfocus-neutral-export" as const;
export const NEUTRAL_EXPORT_VERSION = 1;
export const MAX_NEUTRAL_EXPORT_ASSETS = 5_000;
export const MAX_NEUTRAL_EXPORT_BYTES = 1024 * 1024 * 1024;

const NEUTRAL_COMPONENTS = new Set(["transform", "sprite", "collider", "input", "camera", "audio", "ui"]);

type NeutralProjectAsset = {
  id: string;
  name: string;
  kind: string;
  source: string;
  mimeType: string;
  size: number;
  sha256?: string;
  objectUrl?: string;
};

export type NeutralExportProject = {
  format: string;
  version: number;
  assets: NeutralProjectAsset[];
  scenes: Array<{ entities: Array<{ components: Array<{ type: string; values: Record<string, unknown> }> }> }>;
  postProcessing: { effects: Array<{ id: string; enabled: boolean }> };
  extensions?: unknown;
};

export type NeutralExportDiagnostic = {
  severity: "warning";
  code: "behavior-requires-port" | "generated-asset" | "engine-post-effect" | "extension-namespace" | "unknown-component";
  pointer: string;
  message: string;
};

export type NeutralExportAsset = {
  id: string;
  name: string;
  kind: string;
  source: string;
  path: string;
  mimeType: string;
  size: number;
  sha256: string;
};

export type NeutralExportManifest = {
  format: typeof NEUTRAL_EXPORT_FORMAT;
  version: typeof NEUTRAL_EXPORT_VERSION;
  project: {
    path: "project.json";
    sha256: string;
    sourceFormat: string;
    sourceVersion: number;
  };
  assets: NeutralExportAsset[];
  scripts: Array<{ sourcePath: string; path: string; mimeType: "text/typescript"; size: number }>;
  diagnostics: NeutralExportDiagnostic[];
};

export type NeutralExportBundle = {
  files: HyperfocusExchangeFile[];
  manifest: NeutralExportManifest;
  fileCount: number;
  bytesWritten: number;
};

/** Builds the same bounded, ordinary-file escape export in browsers and CLIs. */
export async function createNeutralExportBundle<TProject extends NeutralExportProject>(
  project: TProject,
  packedAssets: readonly HyperfocusPortableAsset[],
): Promise<NeutralExportBundle> {
  assertPortableAssetCatalog(project, packedAssets);
  if (packedAssets.length > MAX_NEUTRAL_EXPORT_ASSETS) {
    throw new Error(`Project exceeds neutral export asset limit ${MAX_NEUTRAL_EXPORT_ASSETS}.`);
  }
  const totalAssetBytes = packedAssets.reduce((total, asset) => total + asset.bytes.byteLength, 0);
  if (!Number.isSafeInteger(totalAssetBytes) || totalAssetBytes > MAX_NEUTRAL_EXPORT_BYTES) {
    throw new Error(`Project exceeds neutral export byte limit ${MAX_NEUTRAL_EXPORT_BYTES}.`);
  }
  const projectBytes = new TextEncoder().encode(canonicalHyperfocusJson(project));
  const exportedAssets = assignNeutralAssetPaths(project, packedAssets);
  const exportedScripts = assignNeutralScriptPaths(project);
  const manifest: NeutralExportManifest = {
    format: NEUTRAL_EXPORT_FORMAT,
    version: NEUTRAL_EXPORT_VERSION,
    project: {
      path: "project.json",
      sha256: await hashHyperfocusAsset(projectBytes),
      sourceFormat: project.format,
      sourceVersion: project.version,
    },
    assets: exportedAssets.map(({ bytes: _bytes, ...entry }) => entry),
    scripts: exportedScripts.map(({ bytes, ...entry }) => ({ ...entry, size: bytes.byteLength })),
    diagnostics: auditNeutralExport(project),
  };
  const manifestBytes = new TextEncoder().encode(canonicalHyperfocusJson(manifest));
  const files: HyperfocusExchangeFile[] = [
    { path: "project.json", mimeType: "application/json", bytes: projectBytes },
    { path: "manifest.json", mimeType: "application/json", bytes: manifestBytes },
    ...exportedAssets.map((entry) => ({ path: entry.path, mimeType: entry.mimeType, bytes: new Uint8Array(entry.bytes) })),
    ...exportedScripts.map((entry) => ({ path: entry.path, mimeType: entry.mimeType, bytes: entry.bytes })),
  ];
  return {
    files,
    manifest,
    fileCount: files.length,
    bytesWritten: files.reduce((total, file) => total + file.bytes.byteLength, 0),
  };
}

function assignNeutralScriptPaths(project: NeutralExportProject) {
  const extensions = isRecord(project.extensions) ? project.extensions : undefined;
  const scripts = extensions && isRecord(extensions.hyperfocusScripts) ? extensions.hyperfocusScripts : undefined;
  if (!scripts || !Array.isArray(scripts.files)) return [];
  if (scripts.files.length > 512) throw new Error("Project exceeds neutral export script limit 512.");
  const used = new Set<string>();
  const exported = scripts.files.filter(isRecord).flatMap((file) => {
    if (typeof file.path !== "string" || typeof file.source !== "string") return [];
    const segments = file.path.replace(/\\/g, "/").split("/").filter((segment) => segment && segment !== "." && segment !== "..").map((segment) => safeFileSegment(segment, 120));
    if (!segments.length) return [];
    let path = `scripts/${segments.join("/")}`;
    let suffix = 2;
    while (used.has(path.toLowerCase())) path = `scripts/${segments.join("/")}--${suffix++}`;
    used.add(path.toLowerCase());
    return [{ sourcePath: file.path, path, mimeType: "text/typescript" as const, bytes: new TextEncoder().encode(file.source) }];
  }).sort((a, b) => compareText(a.path, b.path));
  const bytes = exported.reduce((total, file) => total + file.bytes.byteLength, 0);
  if (bytes > 16 * 1024 * 1024) throw new Error("Project exceeds neutral export script byte limit 16777216.");
  return exported;
}

/** Stable, explicit list of data that a target-engine importer must port. */
export function auditNeutralExport(project: NeutralExportProject): NeutralExportDiagnostic[] {
  const diagnostics: NeutralExportDiagnostic[] = [];
  const scriptPaths = neutralScriptSourcePaths(project);
  for (const [assetIndex, asset] of project.assets.entries()) {
    if (asset.source !== "generated") continue;
    const pointer = `/assets/${assetIndex}`;
    diagnostics.push({
      severity: "warning",
      code: "generated-asset",
      pointer,
      message: `Generated asset ${asset.id} has no original binary to extract; its complete catalog record is preserved at ${pointer}.`,
    });
  }
  for (const [sceneIndex, scene] of project.scenes.entries()) {
    for (const [entityIndex, entity] of scene.entities.entries()) {
      for (const [componentIndex, component] of entity.components.entries()) {
        const pointer = `/scenes/${sceneIndex}/entities/${entityIndex}/components/${componentIndex}`;
        if (component.type === "behavior") {
          const moduleName = typeof component.values.module === "string" ? component.values.module : "(missing module)";
          diagnostics.push({
            severity: "warning",
            code: "behavior-requires-port",
            pointer,
            message: scriptPaths.has(moduleName.replace(/^\.\//, ""))
              ? `Behavior ${moduleName} and its TypeScript source are copied, but a target engine must port the runtime contract preserved at ${pointer}.`
              : `Behavior ${moduleName} is preserved as data at ${pointer}, but no matching embedded source was available; a target engine must port its runtime semantics.`,
          });
        } else if (!NEUTRAL_COMPONENTS.has(component.type)) {
          diagnostics.push({
            severity: "warning",
            code: "unknown-component",
            pointer,
            message: `Component type ${component.type} is preserved at ${pointer}, but has no generic translation.`,
          });
        }
      }
    }
  }
  for (const [effectIndex, effect] of project.postProcessing.effects.entries()) {
    if (!effect.enabled) continue;
    const pointer = `/postProcessing/effects/${effectIndex}`;
    diagnostics.push({
      severity: "warning",
      code: "engine-post-effect",
      pointer,
      message: `Post effect ${effect.id} is preserved at ${pointer}, but shader/runtime semantics are target-engine-specific.`,
    });
  }
  if (isRecord(project.extensions)) {
    for (const key of Object.keys(project.extensions).sort(compareText)) {
      const pointer = `/extensions/${escapePointer(key)}`;
      diagnostics.push({
        severity: "warning",
        code: "extension-namespace",
        pointer,
        message: `Extension namespace ${key} is preserved at ${pointer}; a target importer must decide how to translate it.`,
      });
    }
  }
  return diagnostics;
}

function neutralScriptSourcePaths(project: NeutralExportProject) {
  const extensions = isRecord(project.extensions) ? project.extensions : undefined;
  const scripts = extensions && isRecord(extensions.hyperfocusScripts) ? extensions.hyperfocusScripts : undefined;
  return new Set(Array.isArray(scripts?.files) ? scripts.files.filter(isRecord).flatMap((file) => typeof file.path === "string" ? [file.path] : []) : []);
}

function assignNeutralAssetPaths(project: NeutralExportProject, assets: readonly HyperfocusPortableAsset[]) {
  const metadata = new Map(project.assets.map((asset) => [asset.id, asset]));
  const used = new Set<string>();
  return [...assets].sort((a, b) => compareText(a.id, b.id)).map((asset) => {
    const record = metadata.get(asset.id);
    if (!record) throw new Error(`Packed asset ${asset.id} has no project catalog record.`);
    const base = `${safeFileSegment(asset.id, 80)}--${safeFileSegment(asset.name, 140)}`;
    let filename = base;
    let suffix = 2;
    while (used.has(filename.toLowerCase())) filename = `${base}--${suffix++}`;
    used.add(filename.toLowerCase());
    return {
      id: asset.id,
      name: asset.name,
      kind: record.kind,
      source: record.source,
      path: `assets/${filename}`,
      mimeType: asset.mimeType,
      size: asset.bytes.byteLength,
      sha256: asset.sha256,
      bytes: asset.bytes,
    };
  });
}

function assertPortableAssetCatalog(project: NeutralExportProject, packedAssets: readonly HyperfocusPortableAsset[]): void {
  const ids = new Set<string>();
  const expected = new Map<string, NeutralProjectAsset>();
  for (const asset of project.assets) {
    if (ids.has(asset.id)) throw new Error(`Project asset catalog contains duplicate id ${asset.id}.`);
    ids.add(asset.id);
    if (asset.objectUrl) throw new Error(`Project asset ${asset.id} contains a machine-local object URL and is not portable.`);
    if (asset.source !== "imported") {
      if (asset.sha256) throw new Error(`Generated asset ${asset.id} unexpectedly references packed binary data.`);
      continue;
    }
    if (!asset.sha256) throw new Error(`Imported asset ${asset.id} has no SHA-256 content address.`);
    expected.set(asset.id, asset);
  }
  if (packedAssets.length !== expected.size) {
    throw new Error(`Asset pack exposes ${packedAssets.length} assets; project.json expects ${expected.size} imported assets.`);
  }
  const seen = new Set<string>();
  for (const packed of packedAssets) {
    const asset = expected.get(packed.id);
    if (!asset) throw new Error(`Asset pack exposes unexpected asset ${packed.id}.`);
    if (seen.has(packed.id)) throw new Error(`Asset pack exposes duplicate asset ${packed.id}.`);
    seen.add(packed.id);
    if (packed.name !== asset.name || packed.mimeType !== asset.mimeType || packed.sha256 !== asset.sha256 || packed.bytes.byteLength !== asset.size) {
      throw new Error(`Packed asset ${packed.id} metadata does not match project.json.`);
    }
  }
}

function safeFileSegment(value: string, maximum: number): string {
  let safe = value.normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  safe = truncateUtf8(safe, maximum).replace(/[. ]+$/g, "");
  if (!safe) safe = "asset";
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) safe = `_${safe}`;
  return safe;
}

function escapePointer(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
