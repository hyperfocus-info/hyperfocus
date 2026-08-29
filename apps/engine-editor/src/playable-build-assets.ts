import { hashHyperfocusAsset } from "@hyperfocus/engine/project";
import { validatePlayablePlatformers2D } from "@hyperfocus/engine/project/runtime-2d";
import { auditNavigationProject2D } from "@hyperfocus/engine/project/runtime-navigation-2d";
import { validatePlayableSaveProject2D } from "@hyperfocus/engine/project/runtime-save-2d";
import { auditPlayableStoryProject2D } from "@hyperfocus/engine/project/runtime-story-2d";
import type { EditorAsset, EditorProject } from "@hyperfocus/engine/project";

const DEFAULT_MAX_ASSETS = 5_000;
const DEFAULT_MAX_ASSET_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const DEFAULT_BUILTIN_BEHAVIORS = new Set(["builtin:player", "builtin:patrol", "builtin:navigate", "builtin:platformer", "builtin:pong-paddle", "builtin:pong-ai", "builtin:pong-ball"]);
const MIME_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/;

export type PlayableBuildDiagnosticCode =
  | "ASSET_COUNT_LIMIT_EXCEEDED"
  | "ASSET_TOTAL_LIMIT_EXCEEDED"
  | "ASSET_SIZE_LIMIT_EXCEEDED"
  | "DUPLICATE_ASSET_ID"
  | "MISSING_ASSET"
  | "ASSET_READ_FAILED"
  | "ASSET_SIZE_MISMATCH"
  | "ASSET_MIME_MISMATCH"
  | "ASSET_HASH_MISMATCH"
  | "UNSAFE_ASSET_MIME"
  | "UNSUPPORTED_ASSET"
  | "MISSING_COMPONENT_ASSET"
  | "ASSET_KIND_MISMATCH"
  | "INVALID_BEHAVIOR_MODULE"
  | "UNSUPPORTED_BEHAVIOR_MODULE"
  | "UNKNOWN_BUILTIN_BEHAVIOR"
  | "INVALID_PLATFORMER"
  | "INVALID_SAVE_POLICY"
  | "INVALID_STORY"
  | "INVALID_NAVIGATION"
  | "NAVIGATION_UNREACHABLE"
  | "NAVIGATION_BUDGET_EXCEEDED"
  | "NAVIGATION_PATH_TOO_LONG";

export type PlayableBuildDiagnostic = {
  severity: "error" | "warning";
  code: PlayableBuildDiagnosticCode;
  message: string;
  assetId?: string;
  sceneId?: string;
  entityId?: string;
  componentId?: string;
};

/** One copy of an imported payload, safe to place in a JSON value in a standalone HTML file. */
export type PlayableBuildObject = {
  sha256: string;
  size: number;
  base64: string;
};

/** Catalog metadata references a deduplicated payload instead of repeating its base64. */
export type PlayableBuildAsset = {
  id: string;
  name: string;
  kind: EditorAsset["kind"];
  mimeType: string;
  size: number;
  sha256: string;
  objectIndex: number;
  dataUrlPrefix: string;
};

export type PlayableBuildAssetCollection = {
  ok: boolean;
  assets: PlayableBuildAsset[];
  objects: PlayableBuildObject[];
  diagnostics: PlayableBuildDiagnostic[];
  totalBytes: number;
};

export type PlayableBuildAssetLimits = {
  maxAssets?: number;
  maxAssetBytes?: number;
  maxTotalBytes?: number;
  supportedBehaviorModules?: readonly string[];
  /** The editor's loopback compiler can bundle source already stored in the
   * portable project. File-backed CLI callers continue to use their own lane. */
  allowEmbeddedProjectSource?: boolean;
};

/**
 * Resolves and verifies every imported asset needed by a single-file playable.
 *
 * Reads are deliberately sequential so a large catalog cannot make every Blob
 * allocate an ArrayBuffer at once. Expected build problems are accumulated as
 * diagnostics; invalid API limits still throw as programmer errors.
 */
export async function collectPlayableBuildAssets(
  project: EditorProject,
  resolveBlob: (assetId: string) => Promise<Blob | undefined>,
  limits: PlayableBuildAssetLimits = {},
): Promise<PlayableBuildAssetCollection> {
  const maxAssets = positiveInteger(limits.maxAssets ?? DEFAULT_MAX_ASSETS, "maxAssets");
  const maxAssetBytes = positiveInteger(limits.maxAssetBytes ?? DEFAULT_MAX_ASSET_BYTES, "maxAssetBytes");
  const maxTotalBytes = positiveInteger(limits.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES, "maxTotalBytes");
  const supportedBehaviors = new Set(limits.supportedBehaviorModules ?? DEFAULT_BUILTIN_BEHAVIORS);
  const diagnostics: PlayableBuildDiagnostic[] = [
    ...behaviorDiagnostics(project, supportedBehaviors, limits.allowEmbeddedProjectSource === true),
    ...componentAssetDiagnostics(project),
    ...platformerDiagnostics(project),
    ...saveDiagnostics(project),
    ...storyDiagnostics(project),
    ...navigationDiagnostics(project),
  ];
  const imported = project.assets.filter((asset) => asset.source === "imported");
  const assets: PlayableBuildAsset[] = [];
  const objects: PlayableBuildObject[] = [];

  if (imported.length > maxAssets) {
    diagnostics.push(error(
      "ASSET_COUNT_LIMIT_EXCEEDED",
      `Standalone builds support at most ${maxAssets} imported assets; this project has ${imported.length}.`,
    ));
    return result(assets, objects, diagnostics, 0);
  }

  const seenIds = new Set<string>();
  let catalogBytes = 0;
  for (const asset of imported) {
    if (seenIds.has(asset.id)) {
      diagnostics.push(error("DUPLICATE_ASSET_ID", `Imported asset id ${asset.id} appears more than once.`, asset.id));
    }
    seenIds.add(asset.id);
    if (!Number.isSafeInteger(asset.size) || asset.size < 0 || asset.size > maxAssetBytes) {
      diagnostics.push(error(
        "ASSET_SIZE_LIMIT_EXCEEDED",
        `Asset ${asset.name} (${asset.id}) declares ${asset.size} bytes; the per-asset build limit is ${maxAssetBytes}.`,
        asset.id,
      ));
    } else {
      catalogBytes += asset.size;
    }
  }
  if (!Number.isSafeInteger(catalogBytes) || catalogBytes > maxTotalBytes) {
    diagnostics.push(error(
      "ASSET_TOTAL_LIMIT_EXCEEDED",
      `Imported assets declare ${catalogBytes} bytes; the standalone build limit is ${maxTotalBytes}.`,
    ));
  }
  if (diagnostics.some((item) => item.code === "ASSET_SIZE_LIMIT_EXCEEDED" || item.code === "ASSET_TOTAL_LIMIT_EXCEEDED" || item.code === "DUPLICATE_ASSET_ID")) {
    return result(assets, objects, diagnostics, 0);
  }

  const objectIndexes = new Map<string, number>();
  let totalBytes = 0;
  for (const asset of imported) {
    const mimeType = normalizeMimeType(asset.mimeType);
    if (!mimeType) {
      diagnostics.push(error("UNSAFE_ASSET_MIME", `Asset ${asset.name} (${asset.id}) has an unsafe MIME type.`, asset.id));
      continue;
    }
    if (!supportsAsset(asset.kind, mimeType)) {
      diagnostics.push(error(
        "UNSUPPORTED_ASSET",
        `Standalone builds do not support ${asset.kind} asset ${asset.name} with MIME type ${mimeType}.`,
        asset.id,
      ));
      continue;
    }

    let blob: Blob | undefined;
    try {
      blob = await resolveBlob(asset.id);
    } catch (cause) {
      diagnostics.push(error(
        "ASSET_READ_FAILED",
        `Could not read asset ${asset.name} (${asset.id}): ${errorMessage(cause)}.`,
        asset.id,
      ));
      continue;
    }
    if (!blob) {
      diagnostics.push(error("MISSING_ASSET", `Asset ${asset.name} (${asset.id}) is missing from the local cache.`, asset.id));
      continue;
    }
    if (blob.size > maxAssetBytes) {
      diagnostics.push(error(
        "ASSET_SIZE_LIMIT_EXCEEDED",
        `Asset ${asset.name} (${asset.id}) contains ${blob.size} bytes; the per-asset build limit is ${maxAssetBytes}.`,
        asset.id,
      ));
      continue;
    }
    if (blob.size !== asset.size) {
      diagnostics.push(error(
        "ASSET_SIZE_MISMATCH",
        `Asset ${asset.name} (${asset.id}) contains ${blob.size} bytes but its catalog declares ${asset.size}.`,
        asset.id,
      ));
      continue;
    }
    const blobMimeType = blob.type ? normalizeMimeType(blob.type) : undefined;
    if (blob.type && (!blobMimeType || blobMimeType !== mimeType)) {
      diagnostics.push(error(
        "ASSET_MIME_MISMATCH",
        `Asset ${asset.name} (${asset.id}) has Blob MIME type ${blob.type} but its catalog declares ${mimeType}.`,
        asset.id,
      ));
      continue;
    }
    if (totalBytes + blob.size > maxTotalBytes) {
      diagnostics.push(error(
        "ASSET_TOTAL_LIMIT_EXCEEDED",
        `Resolved imported assets exceed the standalone build limit of ${maxTotalBytes} bytes.`,
        asset.id,
      ));
      continue;
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await blob.arrayBuffer());
    } catch (cause) {
      diagnostics.push(error(
        "ASSET_READ_FAILED",
        `Could not read asset ${asset.name} (${asset.id}): ${errorMessage(cause)}.`,
        asset.id,
      ));
      continue;
    }
    totalBytes += bytes.byteLength;
    const sha256 = await hashHyperfocusAsset(bytes);
    if (asset.sha256 && asset.sha256 !== sha256) {
      diagnostics.push(error(
        "ASSET_HASH_MISMATCH",
        `Asset ${asset.name} (${asset.id}) does not match its catalog SHA-256.`,
        asset.id,
      ));
      continue;
    }

    let objectIndex = objectIndexes.get(sha256);
    if (objectIndex === undefined) {
      objectIndex = objects.length;
      objectIndexes.set(sha256, objectIndex);
      objects.push({ sha256, size: bytes.byteLength, base64: encodeBase64(bytes) });
    }
    assets.push({
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      mimeType,
      size: bytes.byteLength,
      sha256,
      objectIndex,
      dataUrlPrefix: `data:${mimeType};base64,`,
    });
  }

  return result(assets, objects, diagnostics, totalBytes);
}

/** Reconstructs a data URL while keeping the returned manifest payload deduplicated. */
export function playableAssetDataUrl(asset: PlayableBuildAsset, object: PlayableBuildObject): string {
  if (asset.sha256 !== object.sha256 || asset.size !== object.size) {
    throw new Error(`Asset ${asset.id} does not reference the supplied build object.`);
  }
  return `${asset.dataUrlPrefix}${object.base64}`;
}

function behaviorDiagnostics(project: EditorProject, supported: ReadonlySet<string>, allowEmbeddedProjectSource: boolean): PlayableBuildDiagnostic[] {
  const diagnostics: PlayableBuildDiagnostic[] = [];
  for (const scene of project.scenes) {
    for (const entity of scene.entities) {
      for (const component of entity.components) {
        if (!component.enabled || component.type !== "behavior") continue;
        const module = component.values.module;
        const location = { sceneId: scene.id, entityId: entity.id, componentId: component.id };
        if (typeof module !== "string" || module.length === 0) {
          diagnostics.push({
            severity: "error",
            code: "INVALID_BEHAVIOR_MODULE",
            message: `Enabled behavior ${component.id} on ${entity.label} has no module.`,
            ...location,
          });
        } else if (module.startsWith("builtin:")) {
          if (!supported.has(module)) {
            diagnostics.push({
              severity: "error",
              code: "UNKNOWN_BUILTIN_BEHAVIOR",
              message: `Behavior ${module} is not implemented by this standalone runtime.`,
              ...location,
            });
          }
        } else if (!allowEmbeddedProjectSource || !hasEmbeddedBehaviorSource(project, module, component.values.export)) {
          diagnostics.push({
            severity: "error",
            code: "UNSUPPORTED_BEHAVIOR_MODULE",
            message: allowEmbeddedProjectSource
              ? `Behavior module ${module} does not resolve to a valid source file embedded in this project.`
              : `Behavior module ${module} requires the source-bundling build lane.`,
            ...location,
          });
        }
      }
    }
  }
  return diagnostics;
}

function hasEmbeddedBehaviorSource(project: EditorProject, module: string, exportName: unknown): boolean {
  if (!module.startsWith("./") || !/^[A-Za-z_$][\w$]*$/.test(typeof exportName === "string" ? exportName : "update")) return false;
  const scripts = project.extensions?.hyperfocusScripts;
  if (!isRecord(scripts) || !Array.isArray(scripts.files)) return false;
  const base = module.slice(2).replace(/\\/g, "/");
  if (!base || base === ".." || base.startsWith("../") || base.split("/").some((part) => !part || part === "..")) return false;
  const candidates = /\.[cm]?[jt]sx?$/i.test(base)
    ? [base]
    : [base, ...[".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"].map((extension) => `${base}${extension}`), ...["ts", "tsx", "js", "jsx"].map((extension) => `${base}/index.${extension}`)];
  return scripts.files.some((file) => isRecord(file) && typeof file.path === "string" && typeof file.source === "string" && candidates.includes(file.path.replace(/^\.\//, "").replace(/\\/g, "/")));
}

function componentAssetDiagnostics(project: EditorProject): PlayableBuildDiagnostic[] {
  const diagnostics: PlayableBuildDiagnostic[] = [];
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  for (const scene of project.scenes) {
    for (const entity of scene.entities) {
      for (const component of entity.components) {
        if (!component.enabled || (component.type !== "sprite" && component.type !== "audio")) continue;
        const reference = component.values.assetId ?? component.values.asset;
        const location = { sceneId: scene.id, entityId: entity.id, componentId: component.id };
        if (typeof reference !== "string" || !reference || reference === "generated") {
          if (component.type === "audio") diagnostics.push({
            severity: "error",
            code: "MISSING_COMPONENT_ASSET",
            message: `Audio component ${component.id} must reference an imported audio asset.`,
            ...location,
          });
          continue;
        }
        const asset = assets.get(reference);
        if (!asset) {
          diagnostics.push({
            severity: "error",
            code: "MISSING_COMPONENT_ASSET",
            message: `${component.type} component ${component.id} references missing asset ${reference}.`,
            ...location,
          });
          continue;
        }
        const expectedKind = component.type === "sprite" ? "image" : "audio";
        if (asset.kind !== expectedKind) {
          diagnostics.push({
            severity: "error",
            code: "ASSET_KIND_MISMATCH",
            message: `${component.type} component ${component.id} requires a ${expectedKind} asset; ${reference} is ${asset.kind}.`,
            assetId: asset.id,
            ...location,
          });
        }
      }
    }
  }
  return diagnostics;
}

function navigationDiagnostics(project: EditorProject): PlayableBuildDiagnostic[] {
  const codes = {
    "invalid-navigation": "INVALID_NAVIGATION",
    "navigation-unreachable": "NAVIGATION_UNREACHABLE",
    "navigation-budget-exceeded": "NAVIGATION_BUDGET_EXCEEDED",
    "navigation-path-too-long": "NAVIGATION_PATH_TOO_LONG",
  } as const;
  return auditNavigationProject2D(project).map((diagnostic) => ({ ...diagnostic, code: codes[diagnostic.code] }));
}

function platformerDiagnostics(project: EditorProject): PlayableBuildDiagnostic[] {
  try {
    validatePlayablePlatformers2D(project);
    return [];
  } catch (cause) {
    return [error("INVALID_PLATFORMER", cause instanceof Error ? cause.message : String(cause))];
  }
}

function saveDiagnostics(project: EditorProject): PlayableBuildDiagnostic[] {
  try {
    validatePlayableSaveProject2D(project);
    return [];
  } catch (cause) {
    return [error("INVALID_SAVE_POLICY", cause instanceof Error ? cause.message : String(cause))];
  }
}

function storyDiagnostics(project: EditorProject): PlayableBuildDiagnostic[] {
  return auditPlayableStoryProject2D(project).map((diagnostic) => ({ ...diagnostic, code: "INVALID_STORY" }));
}

function normalizeMimeType(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  return MIME_TYPE.test(normalized) ? normalized : undefined;
}

function supportsAsset(kind: EditorAsset["kind"], mimeType: string): boolean {
  if (kind === "image") return /^(image\/(?:avif|bmp|gif|jpeg|png|svg\+xml|webp|x-icon))$/.test(mimeType);
  if (kind === "audio") return /^(audio\/(?:aac|flac|mp4|mpeg|ogg|wav|webm|x-wav))$/.test(mimeType);
  if (kind === "font") return /^(?:font\/(?:otf|ttf|woff|woff2)|application\/(?:font-woff|vnd\.ms-fontobject|x-font-opentype|x-font-ttf))$/.test(mimeType);
  if (kind === "data") return mimeType.startsWith("text/") || /^(?:application\/(?:json|octet-stream|xml)|model\/gltf\+json)$/.test(mimeType);
  return false;
}

function encodeBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let encoded = "";
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const a = bytes[offset] ?? 0;
    const b = bytes[offset + 1] ?? 0;
    const c = bytes[offset + 2] ?? 0;
    const remaining = bytes.length - offset;
    encoded += alphabet[a >>> 2];
    encoded += alphabet[((a & 3) << 4) | (b >>> 4)];
    encoded += remaining > 1 ? alphabet[((b & 15) << 2) | (c >>> 6)] : "=";
    encoded += remaining > 2 ? alphabet[c & 63] : "=";
  }
  return encoded;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive safe integer.`);
  return value;
}

function error(code: PlayableBuildDiagnosticCode, message: string, assetId?: string): PlayableBuildDiagnostic {
  return { severity: "error", code, message, ...(assetId ? { assetId } : {}) };
}

function result(
  assets: PlayableBuildAsset[],
  objects: PlayableBuildObject[],
  diagnostics: PlayableBuildDiagnostic[],
  totalBytes: number,
): PlayableBuildAssetCollection {
  return { ok: !diagnostics.some((item) => item.severity === "error"), assets, objects, diagnostics, totalBytes };
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
