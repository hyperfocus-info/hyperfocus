import type { EditorAsset, EditorProject } from "@hyperfocus/engine/project";

export type EditorAssetUsage = {
  kind: "component" | "tilemap" | "atlas" | "timeline" | "3d-mesh" | "3d-texture" | "3d-audio" | "source";
  label: string;
  pointer: string;
};

export function findEditorAssetUsages(project: EditorProject, assetId: string): EditorAssetUsage[] {
  const usages: EditorAssetUsage[] = [];
  for (const [sceneIndex, scene] of project.scenes.entries()) for (const [entityIndex, entity] of scene.entities.entries()) for (const [componentIndex, component] of entity.components.entries()) {
    if (component.values.asset === assetId || component.values.assetId === assetId) usages.push({
      kind: "component",
      label: `${scene.name} / ${entity.label} / ${component.type}`,
      pointer: `/scenes/${sceneIndex}/entities/${entityIndex}/components/${componentIndex}`,
    });
  }
  if (project.tilemap.sourceAssetId === assetId) usages.push({ kind: "tilemap", label: `Tilemap ${project.tilemap.name}`, pointer: "/tilemap/sourceAssetId" });
  if (project.atlas.sourceAssetId === assetId) usages.push({ kind: "atlas", label: `Atlas ${project.atlas.name}`, pointer: "/atlas/sourceAssetId" });
  for (const [index, track] of project.timeline.audioTracks.entries()) if (track.assetId === assetId) usages.push({ kind: "timeline", label: `Audio track ${track.name}`, pointer: `/timeline/audioTracks/${index}/assetId` });
  const declaration = record(project.extensions?.hyperfocus3D);
  if (declaration) {
    if (Array.isArray(declaration.meshes)) declaration.meshes.forEach((mesh, index) => { if (record(mesh)?.assetId === assetId) usages.push({ kind: "3d-mesh", label: `3D mesh ${String(record(mesh)?.id ?? index + 1)}`, pointer: `/extensions/hyperfocus3D/meshes/${index}/assetId` }); });
    if (Array.isArray(declaration.textures)) declaration.textures.forEach((texture, index) => { if (record(texture)?.assetId === assetId) usages.push({ kind: "3d-texture", label: `3D texture ${String(record(texture)?.id ?? index + 1)}`, pointer: `/extensions/hyperfocus3D/textures/${index}/assetId` }); });
    const audio = record(declaration.audio);
    if (Array.isArray(audio?.cues)) audio.cues.forEach((cue, index) => { if (cue === assetId) usages.push({ kind: "3d-audio", label: `3D audio cue ${index + 1}`, pointer: `/extensions/hyperfocus3D/audio/cues/${index}` }); });
  }
  const scripts = record(project.extensions?.hyperfocusScripts);
  if (Array.isArray(scripts?.files)) scripts.files.forEach((file, index) => {
    const source = record(file)?.source;
    if (typeof source === "string" && source.includes(assetId)) usages.push({ kind: "source", label: `Source ${String(record(file)?.path ?? index + 1)}`, pointer: `/extensions/hyperfocusScripts/files/${index}/source` });
  });
  return usages;
}

export function renameEditorAsset(project: EditorProject, assetId: string, requestedName: string): void {
  const asset = requiredAsset(project, assetId);
  const name = requestedName.trim();
  if (!name || name.length > 512 || /[\u0000-\u001f]/.test(name)) throw new Error("Asset name must be from 1 through 512 printable characters.");
  asset.name = name;
}

export function replaceEditorAssetMetadata(project: EditorProject, assetId: string, replacement: Pick<EditorAsset, "name" | "kind" | "mimeType" | "size" | "lastModified"> & { sha256?: string }): void {
  const asset = requiredAsset(project, assetId);
  Object.assign(asset, replacement, { source: "imported" as const });
}

export function removeEditorAssetMetadata(project: EditorProject, assetId: string, options: { force?: boolean } = {}): EditorAssetUsage[] {
  const asset = requiredAsset(project, assetId);
  const usages = findEditorAssetUsages(project, assetId);
  if (usages.length && !options.force) throw new Error(`${asset.name} is used in ${usages.length} place${usages.length === 1 ? "" : "s"}. Remove or replace those references first.`);
  if (options.force) detachAsset(project, assetId);
  project.assets = project.assets.filter((candidate) => candidate.id !== assetId);
  return usages;
}

function detachAsset(project: EditorProject, assetId: string) {
  for (const scene of project.scenes) for (const entity of scene.entities) for (const component of entity.components) {
    if (component.values.asset === assetId) component.values.asset = "generated";
    if (component.values.assetId === assetId) delete component.values.assetId;
  }
  if (project.tilemap.sourceAssetId === assetId) delete project.tilemap.sourceAssetId;
  if (project.atlas.sourceAssetId === assetId) delete project.atlas.sourceAssetId;
  for (const track of project.timeline.audioTracks) if (track.assetId === assetId) delete track.assetId;
  const declaration = record(project.extensions?.hyperfocus3D);
  if (declaration) {
    if (Array.isArray(declaration.meshes)) declaration.meshes = declaration.meshes.filter((mesh) => record(mesh)?.assetId !== assetId);
    if (Array.isArray(declaration.textures)) declaration.textures = declaration.textures.filter((texture) => record(texture)?.assetId !== assetId);
    const audio = record(declaration.audio);
    if (audio && Array.isArray(audio.cues)) audio.cues = audio.cues.filter((cue) => cue !== assetId);
  }
}

function requiredAsset(project: EditorProject, assetId: string) {
  const asset = project.assets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new Error(`Asset does not exist: ${assetId}`);
  return asset;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : undefined;
}
