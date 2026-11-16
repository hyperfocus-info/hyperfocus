import {
  createHyperfocusProjectFiles,
  hashHyperfocusAsset,
  openHyperfocusProjectFiles,
  type HyperfocusAssetInput,
  type HyperfocusPortableAsset,
} from "@hyperfocus/engine/project";
import { migrateProject, type EditorProject } from "@hyperfocus/engine/project";

export type EditorPortableFiles = {
  projectJson: Uint8Array;
  assetsArchive: Uint8Array;
};

export type EditorPortableAsset = HyperfocusPortableAsset;

/**
 * Creates the two portable files from the editor model and its local asset cache.
 * Generated assets are project data; only imported binary assets enter the pack.
 */
export async function createEditorPortableFiles(
  project: EditorProject,
  readAsset: (id: string) => Promise<Blob | undefined>,
): Promise<EditorPortableFiles> {
  const inputs: HyperfocusAssetInput[] = [];
  const portableProject = structuredClone(project);
  const portableAssets = new Map(portableProject.assets.map((asset) => [asset.id, asset]));
  for (const asset of project.assets) {
    if (asset.source !== "imported") continue;
    const blob = await readAsset(asset.id);
    if (!blob) throw new Error(`Asset ${asset.name} (${asset.id}) is missing from the local cache.`);
    if (blob.size !== asset.size) throw new Error(`Asset ${asset.name} (${asset.id}) does not match its catalog size.`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const sha256 = await hashHyperfocusAsset(bytes);
    const portableAsset = portableAssets.get(asset.id);
    if (!portableAsset) throw new Error(`Asset ${asset.id} disappeared while creating portable files.`);
    portableAsset.sha256 = sha256;
    inputs.push({
      id: asset.id,
      name: asset.name,
      mimeType: asset.mimeType,
      bytes,
    });
  }
  return createHyperfocusProjectFiles(portableProject, inputs, {
    maxAssets: 5_000,
    maxUnpackedBytes: 1073741824,
  });
}

/** Opens and validates both files without mutating IndexedDB. */
export async function openEditorPortableFiles(
  projectJson: Uint8Array | string,
  assetsArchive: Uint8Array,
) {
  const opened = await openHyperfocusProjectFiles(projectJson, assetsArchive, {
    maxArchiveBytes: 1073741824,
    maxAssets: 5_000,
    maxUnpackedBytes: 1073741824,
  });
  const project = migrateProject(opened.project);
  const objects = new Map(opened.objects.map((object) => [object.sha256, object.bytes]));
  const usedObjects = new Set<string>();
  const assets: HyperfocusPortableAsset[] = [];
  for (const asset of project.assets) {
    if (asset.source !== "imported") continue;
    if (!asset.sha256) throw new Error(`Imported asset ${asset.name} (${asset.id}) has no SHA-256 content address in project.json.`);
    const bytes = objects.get(asset.sha256);
    if (!bytes) throw new Error(`Asset pack is missing ${asset.name} (${asset.id}) at ${asset.sha256}.`);
    usedObjects.add(asset.sha256);
    assets.push({ id: asset.id, name: asset.name, mimeType: asset.mimeType, sha256: asset.sha256, bytes: new Uint8Array(bytes) });
  }
  if (usedObjects.size !== objects.size) throw new Error(`Asset pack contains ${objects.size - usedObjects.size} unreferenced content object${objects.size - usedObjects.size === 1 ? "" : "s"}.`);
  validatePortableAssetCatalog(project, assets);
  return { project, assets };
}

export function validatePortableAssetCatalog(project: EditorProject, packedAssets: readonly HyperfocusPortableAsset[]) {
  const expected = new Map(project.assets.filter((asset) => asset.source === "imported").map((asset) => [asset.id, asset]));
  if (packedAssets.length !== expected.size) {
    throw new Error(`Asset pack contains ${packedAssets.length} imported assets; project.json expects ${expected.size}.`);
  }
  const seen = new Set<string>();
  for (const packed of packedAssets) {
    const asset = expected.get(packed.id);
    if (!asset) throw new Error(`Asset pack contains unexpected asset ${packed.id}.`);
    if (seen.has(packed.id)) throw new Error(`Asset pack contains duplicate asset ${packed.id}.`);
    seen.add(packed.id);
    if (packed.name !== asset.name) throw new Error(`Packed asset ${packed.id} has a different name than project.json.`);
    if (packed.mimeType !== asset.mimeType) throw new Error(`Packed asset ${packed.id} has a different MIME type than project.json.`);
    if (packed.sha256 !== asset.sha256) throw new Error(`Packed asset ${packed.id} has a different content address than project.json.`);
    if (packed.bytes.byteLength !== asset.size) throw new Error(`Packed asset ${packed.id} has a different size than project.json.`);
  }
  for (const asset of expected.values()) {
    if (!seen.has(asset.id)) throw new Error(`Asset pack is missing ${asset.name} (${asset.id}).`);
  }
}
