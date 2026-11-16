import { errorMessage as sharedErrorMessage } from "@hyperfocus/utilities/text";
import { hypot } from '../../math/simulation.ts';
import type { HumanoidGaitClipAnalysis } from "../../motion/humanoid/clip-gait-analysis.ts";

export type SceneAnimation3D = { kind: 'rotate-y'; radiansPerSecond: number } | { kind: 'ping-pong'; offset: [number, number, number]; periodSeconds: number; phase: number; travelSeconds?: number; varyByMatch?: boolean; turnRadius?: number; turnPivot?: [number, number, number] };

export const HARD = Object.freeze({ meshes: 4_096, vertices: 5_000_000, indices: 15_000_000, textures: 1_024, textureBytes: 268435456, materials: 4_096, lights: 256, entities: 100_000 });

export type PortableAsset3D = { id: string; name?: string; mimeType: string; bytes: Uint8Array };
export type Hyperfocus3DDiagnostic = { severity: "error"; code: string; pointer: string; message: string };
export type Hyperfocus3DBudgets = { [Key in keyof typeof HARD]: number };
export type Hyperfocus3DDeclaration = {
  version: 1;
  activeSceneId: string;
  budgets: Hyperfocus3DBudgets;
  meshes: Array<{ id: string; assetId: string; primitive: number; buffers: Array<{ uri: string; assetId: string }>; skin?: { rigId: string; meshIndex: number; primitiveIndex: number } }>;
  rigs?: Array<{ id: string; meshId: string; clips: Array<{ id: string; animation: number; durationSeconds: number; sourceName?: string; gait?: HumanoidGaitClipAnalysis }>; bones?: Array<{ id: string; node: number; parentId?: string; restPosition?: [number, number, number]; restRotation?: [number, number, number, number] }>; rootBoneId?: string }>;
  textures: Array<{ id: string; assetId: string; width: number; height: number; filter: "nearest" | "linear"; wrap: "clamp" | "repeat"; flipY: boolean }>;
  materials: Array<{ id: string; shading: "unlit" | "lit"; shader?: "pbr" | "toon" | "retro" | "hologram"; alphaMode?: "opaque" | "mask" | "blend" | "additive"; alphaCutoff?: number; baseColor: [number, number, number, number]; emissive?: [number, number, number]; textureId?: string; textureIds?: { baseColor?: string; metallicRoughness?: string; normal?: string; occlusion?: string; emissive?: string }; uv?: { offset: [number, number]; scale: [number, number]; rotation: number }; toon?: { bands: number; shadowColor: [number, number, number]; rimColor: [number, number, number]; rimStrength: number; outlineColor: [number, number, number, number]; outlineWidth: number }; metallic: number; roughness: number; doubleSided: boolean }>;
  scenes: Array<{
    id: string;
    effectCapacity?: number;
    clearColor?: [number, number, number, number];
    camera: { position: [number, number, number]; target: [number, number, number]; up: [number, number, number]; fovYRadians: number; near: number; far: number; followEntityId?: string; followOffset?: [number, number, number] };
    lights: Array<{ id: string; kind: "ambient" | "directional" | "point" | "spot"; color: [number, number, number]; intensity: number; position?: [number, number, number]; direction?: [number, number, number]; range?: number }>;
    entities: Array<{ id: string; meshId: string; materialId: string; position: [number, number, number]; scale: [number, number, number]; rotationY: number; variants?: Array<{ id: string; meshId: string; materialId: string }>; controller?: { speed: number }; animation?: SceneAnimation3D; skeleton?: { rigId: string; skinIndex: number; meshNode: number }; physics?: { type: "static" | "dynamic"; shape: "box" | "sphere"; gravityScale: number; continuous: boolean } }>;
  }>;
  audio: { policy: "gesture-unlock" | "disabled"; cues: string[] };
  save: { restoreOnBoot: boolean; slot: string; maxBytes: number };
};


type Hyperfocus3DScene = Hyperfocus3DDeclaration["scenes"][number];
type Vector3 = [number, number, number];
type Vector4 = [number, number, number, number];
const MAX_JSON_ASSET_BYTES = 16777216;
const MAX_GLB_ASSET_BYTES = 268435456;

export function parseDeclaration(project: unknown, assets: readonly PortableAsset3D[] | undefined, diagnostics: Hyperfocus3DDiagnostic[]): Hyperfocus3DDeclaration | undefined {
  const root = record(project), extensions = record(root?.extensions), raw = record(extensions?.hyperfocus3D);
  if (!raw) { diagnostics.push(error("declaration-required", "/extensions/hyperfocus3D", "extensions.hyperfocus3D must be an object.")); return undefined; }
  const assetById = new Map<string, PortableAsset3D>();
  const openedAssets = assets ?? [];
  for (let index = 0; index < openedAssets.length; index += 1) {
    const asset = openedAssets[index];
    if (!asset || typeof asset.id !== "string" || !(asset.bytes instanceof Uint8Array)) diagnostics.push(error("asset-invalid", `/assets/${index}`, "Opened archive asset is invalid."));
    else if (assetById.has(asset.id)) diagnostics.push(error("asset-id-duplicate", `/assets/${index}/id`, `Duplicate asset id ${asset.id}.`));
    else assetById.set(asset.id, asset);
  }
  exact(raw, ["activeSceneId", "audio", "budgets", "materials", "meshes", "save", "scenes", "textures", "version"], "/extensions/hyperfocus3D", diagnostics, ["rigs"]);
  if (raw.version !== 1) diagnostics.push(error("version", "/extensions/hyperfocus3D/version", "Only hyperfocus3D version 1 is supported."));
  const budgets = parseBudgets(raw.budgets, diagnostics);
  const meshes = parseArray(raw.meshes, "/extensions/hyperfocus3D/meshes", diagnostics, (value, pointer) => {
    const item = record(value); if (!item) return invalidObject(pointer, diagnostics);
    exact(item, ["assetId", "buffers", "id", "primitive"], pointer, diagnostics, ["skin"]);
    const id = text(item.id, `${pointer}/id`, diagnostics), assetId = text(item.assetId, `${pointer}/assetId`, diagnostics);
    const source = assetById.get(assetId);
    if (assets && !source) diagnostics.push(error("asset-reference", `${pointer}/assetId`, `Unknown archive asset ${assetId}.`));
    else if (source) {
      const binary = source.mimeType === "model/gltf-binary", allowed = binary || ["application/json", "model/gltf+json"].includes(source.mimeType), limit = binary ? MAX_GLB_ASSET_BYTES : MAX_JSON_ASSET_BYTES;
      if (!allowed || source.bytes.byteLength > limit) diagnostics.push(error("gltf-asset", `${pointer}/assetId`, `Asset ${assetId} must be glTF JSON or GLB no larger than ${limit} bytes.`));
    }
    const buffers = parseArray(item.buffers, `${pointer}/buffers`, diagnostics, (buffer, bufferPointer) => {
      const pair = record(buffer); if (!pair) return invalidObject(bufferPointer, diagnostics);
      exact(pair, ["assetId", "uri"], bufferPointer, diagnostics);
      const uri = text(pair.uri, `${bufferPointer}/uri`, diagnostics), bufferAssetId = text(pair.assetId, `${bufferPointer}/assetId`, diagnostics);
      if (/^(?:https?:|file:|data:)/i.test(uri) || uri.includes("\\") || uri.startsWith("/") || uri.includes("..")) diagnostics.push(error("buffer-uri", `${bufferPointer}/uri`, "External glTF buffer URI must be a safe relative logical name."));
      if (assets && !assetById.has(bufferAssetId)) diagnostics.push(error("asset-reference", `${bufferPointer}/assetId`, `Unknown archive asset ${bufferAssetId}.`));
      return { uri, assetId: bufferAssetId };
    });
    const skin = item.skin === undefined ? undefined : record(item.skin);
    if (item.skin !== undefined && !skin) invalidObject(`${pointer}/skin`, diagnostics); else if (skin) exact(skin, ["meshIndex", "primitiveIndex", "rigId"], `${pointer}/skin`, diagnostics);
    return { id, assetId, primitive: uint(item.primitive, `${pointer}/primitive`, diagnostics, 0, 1_000_000), buffers, ...(skin ? { skin: { rigId: text(skin.rigId, `${pointer}/skin/rigId`, diagnostics), meshIndex: uint(skin.meshIndex, `${pointer}/skin/meshIndex`, diagnostics, 0, 1_000_000), primitiveIndex: uint(skin.primitiveIndex, `${pointer}/skin/primitiveIndex`, diagnostics, 0, 1_000_000) } } : {}) };
  });
  const rigs = raw.rigs === undefined ? [] : parseArray(raw.rigs, "/extensions/hyperfocus3D/rigs", diagnostics, (value, pointer) => {
    const item = record(value); if (!item) return invalidObject(pointer, diagnostics);
    exact(item, ["clips", "id", "meshId"], pointer, diagnostics, ["bones", "rootBoneId"]);
    const clips = parseArray(item.clips, `${pointer}/clips`, diagnostics, (value, clipPointer) => {
      const clip = record(value); if (!clip) return invalidObject(clipPointer, diagnostics);
      exact(clip, ["animation", "durationSeconds", "id"], clipPointer, diagnostics, ["gait", "sourceName"]);
      const gait = clip.gait === undefined ? undefined : parseGaitClipAnalysis(clip.gait, `${clipPointer}/gait`, diagnostics);
      return { id: text(clip.id, `${clipPointer}/id`, diagnostics), animation: uint(clip.animation, `${clipPointer}/animation`, diagnostics, 0, 100_000), durationSeconds: finite(clip.durationSeconds, `${clipPointer}/durationSeconds`, diagnostics, 1, 0.000_001, 86_400), ...(clip.sourceName === undefined ? {} : { sourceName: text(clip.sourceName, `${clipPointer}/sourceName`, diagnostics) }), ...(gait ? { gait } : {}) };
    });
    unique(clips, "rig clip", diagnostics, `${pointer}/clips`);
    const bones = item.bones === undefined ? [] : parseArray(item.bones, `${pointer}/bones`, diagnostics, (value, bonePointer) => { const bone = record(value); if (!bone) return invalidObject(bonePointer, diagnostics); exact(bone, ["id", "node"], bonePointer, diagnostics, ["parentId", "restPosition", "restRotation"]); return { id: text(bone.id, `${bonePointer}/id`, diagnostics), node: uint(bone.node, `${bonePointer}/node`, diagnostics, 0, 1_000_000), ...(bone.parentId === undefined ? {} : { parentId: text(bone.parentId, `${bonePointer}/parentId`, diagnostics) }), ...(bone.restPosition === undefined ? {} : { restPosition: vector3(bone.restPosition, `${bonePointer}/restPosition`, diagnostics, [0, 0, 0]) }), ...(bone.restRotation === undefined ? {} : { restRotation: normalizedQuaternion(bone.restRotation, `${bonePointer}/restRotation`, diagnostics) }) }; });
    unique(bones, "rig bone", diagnostics, `${pointer}/bones`);
    const rootBoneId = item.rootBoneId === undefined ? undefined : text(item.rootBoneId, `${pointer}/rootBoneId`, diagnostics);
    if (rootBoneId && !bones.some((bone) => bone.id === rootBoneId)) diagnostics.push(error("root-bone-reference", `${pointer}/rootBoneId`, `Unknown stable bone ${rootBoneId}.`));
    for (let clipIndex = 0; clipIndex < clips.length; clipIndex += 1) if (clips[clipIndex]!.gait && bones.length) for (const [field, boneId] of [["leftFootBoneId", clips[clipIndex]!.gait!.leftFootBoneId], ["rightFootBoneId", clips[clipIndex]!.gait!.rightFootBoneId]] as const) if (!bones.some((bone) => bone.id === boneId)) diagnostics.push(error("gait-foot-reference", `${pointer}/clips/${clipIndex}/gait/${field}`, `Gait analysis references unknown stable bone ${boneId}. Reinspect the source rig or remove this analysis.`));
    for (let boneIndex = 0; boneIndex < bones.length; boneIndex += 1) if (bones[boneIndex]!.parentId && !bones.some((bone) => bone.id === bones[boneIndex]!.parentId)) diagnostics.push(error("bone-parent-reference", `${pointer}/bones/${boneIndex}/parentId`, `Unknown stable parent bone ${bones[boneIndex]!.parentId}.`));
    return { id: text(item.id, `${pointer}/id`, diagnostics), meshId: text(item.meshId, `${pointer}/meshId`, diagnostics), clips, ...(bones.length ? { bones } : {}), ...(rootBoneId ? { rootBoneId } : {}) };
  });
  const textures = parseArray(raw.textures, "/extensions/hyperfocus3D/textures", diagnostics, (value, pointer) => {
    const item = record(value); if (!item) return invalidObject(pointer, diagnostics);
    exact(item, ["assetId", "filter", "flipY", "height", "id", "width", "wrap"], pointer, diagnostics);
    const id = text(item.id, `${pointer}/id`, diagnostics), assetId = text(item.assetId, `${pointer}/assetId`, diagnostics);
    const width = uint(item.width, `${pointer}/width`, diagnostics, 1, 16_384), height = uint(item.height, `${pointer}/height`, diagnostics, 1, 16_384);
    const asset = assetById.get(assetId);
    if (assets && !asset) diagnostics.push(error("asset-reference", `${pointer}/assetId`, `Unknown archive asset ${assetId}.`));
    else if (asset && (asset.mimeType !== "application/octet-stream" || asset.bytes.byteLength !== width * height * 4)) diagnostics.push(error("rgba8-asset", `${pointer}/assetId`, `RGBA8 asset ${assetId} must be application/octet-stream with exactly ${width * height * 4} bytes.`));
    return { id, assetId, width, height, filter: choice(item.filter, ["nearest", "linear"], `${pointer}/filter`, diagnostics, "nearest"), wrap: choice(item.wrap, ["clamp", "repeat"], `${pointer}/wrap`, diagnostics, "clamp"), flipY: bool(item.flipY, `${pointer}/flipY`, diagnostics) };
  });
  const materials = parseArray(raw.materials, "/extensions/hyperfocus3D/materials", diagnostics, (value, pointer) => {
    const item = record(value); if (!item) return invalidObject(pointer, diagnostics);
    exact(item, ["baseColor", "doubleSided", "id", "metallic", "roughness", "shading"], pointer, diagnostics, ["alphaCutoff", "alphaMode", "emissive", "shader", "textureId", "textureIds", "toon", "uv"]);
    const textureIds = item.textureIds === undefined ? undefined : record(item.textureIds);
    if (item.textureIds !== undefined && !textureIds) invalidObject(`${pointer}/textureIds`, diagnostics); else if (textureIds) exact(textureIds, [], `${pointer}/textureIds`, diagnostics, ["baseColor", "metallicRoughness", "normal", "occlusion", "emissive"]);
    const uv = item.uv === undefined ? undefined : record(item.uv);
    if (item.uv !== undefined && !uv) invalidObject(`${pointer}/uv`, diagnostics); else if (uv) exact(uv, ["offset", "rotation", "scale"], `${pointer}/uv`, diagnostics);
    const toon = item.toon === undefined ? undefined : parseToonMaterial(item.toon, `${pointer}/toon`, diagnostics);
    return { id: text(item.id, `${pointer}/id`, diagnostics), shading: choice(item.shading, ["unlit", "lit"], `${pointer}/shading`, diagnostics, "lit"), ...(item.shader === undefined ? {} : { shader: choice(item.shader, ["pbr", "toon", "retro", "hologram"], `${pointer}/shader`, diagnostics, "pbr") }), ...(item.alphaMode === undefined ? {} : { alphaMode: choice(item.alphaMode, ["opaque", "mask", "blend", "additive"], `${pointer}/alphaMode`, diagnostics, "opaque") }), ...(item.alphaCutoff === undefined ? {} : { alphaCutoff: finite(item.alphaCutoff, `${pointer}/alphaCutoff`, diagnostics, 0.5, 0, 1) }), baseColor: vector4(item.baseColor, `${pointer}/baseColor`, diagnostics, [1, 1, 1, 1]), ...(item.emissive === undefined ? {} : { emissive: vector3(item.emissive, `${pointer}/emissive`, diagnostics, [0, 0, 0]) }), ...(item.textureId === undefined ? {} : { textureId: text(item.textureId, `${pointer}/textureId`, diagnostics) }), ...(textureIds ? { textureIds: { ...optionalText(textureIds, "baseColor", `${pointer}/textureIds/baseColor`, diagnostics), ...optionalText(textureIds, "metallicRoughness", `${pointer}/textureIds/metallicRoughness`, diagnostics), ...optionalText(textureIds, "normal", `${pointer}/textureIds/normal`, diagnostics), ...optionalText(textureIds, "occlusion", `${pointer}/textureIds/occlusion`, diagnostics), ...optionalText(textureIds, "emissive", `${pointer}/textureIds/emissive`, diagnostics) } } : {}), ...(uv ? { uv: { offset: vector2(uv.offset, `${pointer}/uv/offset`, diagnostics, [0, 0]), scale: vector2(uv.scale, `${pointer}/uv/scale`, diagnostics, [1, 1]), rotation: finite(uv.rotation, `${pointer}/uv/rotation`, diagnostics, 0) } } : {}), ...(toon ? { toon } : {}), metallic: finite(item.metallic, `${pointer}/metallic`, diagnostics, 0, 0, 1), roughness: finite(item.roughness, `${pointer}/roughness`, diagnostics, 1, 0, 1), doubleSided: bool(item.doubleSided, `${pointer}/doubleSided`, diagnostics) };
  });
  const scenes = parseArray(raw.scenes, "/extensions/hyperfocus3D/scenes", diagnostics, (value, pointer) => parseScene(value, pointer, diagnostics));
  const audioRaw = record(raw.audio); if (!audioRaw) invalidObject("/extensions/hyperfocus3D/audio", diagnostics);
  else exact(audioRaw, ["cues", "policy"], "/extensions/hyperfocus3D/audio", diagnostics);
  const saveRaw = record(raw.save); if (!saveRaw) invalidObject("/extensions/hyperfocus3D/save", diagnostics);
  else exact(saveRaw, ["maxBytes", "restoreOnBoot", "slot"], "/extensions/hyperfocus3D/save", diagnostics);
  if (!budgets || !audioRaw || !saveRaw) return undefined;
  unique(meshes, "mesh", diagnostics); unique(rigs, "rig", diagnostics); unique(textures, "texture", diagnostics); unique(materials, "material", diagnostics); unique(scenes, "scene", diagnostics);
  if (meshes.length > budgets.meshes) diagnostics.push(error("mesh-budget", "/extensions/hyperfocus3D/meshes", `Mesh declarations exceed budget ${budgets.meshes}.`));
  if (textures.length > budgets.textures) diagnostics.push(error("texture-budget", "/extensions/hyperfocus3D/textures", `Texture declarations exceed budget ${budgets.textures}.`));
  const textureBytes = textures.reduce((total, texture) => total + texture.width * texture.height * 4, 0);
  if (textureBytes > budgets.textureBytes) diagnostics.push(error("texture-byte-budget", "/extensions/hyperfocus3D/budgets/textureBytes", `Declared RGBA8 textures require ${textureBytes} bytes and exceed budget ${budgets.textureBytes}.`));
  if (materials.length > budgets.materials) diagnostics.push(error("material-budget", "/extensions/hyperfocus3D/materials", `Material declarations exceed budget ${budgets.materials}.`));
  const meshIds = new Set(meshes.map((item) => item.id)), rigIds = new Set(rigs.map((item) => item.id)), textureIds = new Set(textures.map((item) => item.id)), materialIds = new Set(materials.map((item) => item.id));
  for (let rigIndex = 0; rigIndex < rigs.length; rigIndex += 1) if (!meshIds.has(rigs[rigIndex]!.meshId)) diagnostics.push(error("mesh-reference", `/extensions/hyperfocus3D/rigs/${rigIndex}/meshId`, `Unknown mesh ${rigs[rigIndex]!.meshId}.`));
  for (let meshIndex = 0; meshIndex < meshes.length; meshIndex += 1) if (meshes[meshIndex]!.skin && !rigIds.has(meshes[meshIndex]!.skin!.rigId)) diagnostics.push(error("rig-reference", `/extensions/hyperfocus3D/meshes/${meshIndex}/skin/rigId`, `Unknown rig ${meshes[meshIndex]!.skin!.rigId}.`));
  for (let index = 0; index < materials.length; index += 1) {
    const material = materials[index];
    const references: Array<[string, string | undefined]> = [["textureId", material.textureId], ...Object.entries(material.textureIds ?? {}).map(([slot, id]): [string, string | undefined] => [`textureIds/${slot}`, id])];
    for (const [slot, textureId] of references) if (textureId && !textureIds.has(textureId)) diagnostics.push(error("texture-reference", `/extensions/hyperfocus3D/materials/${index}/${slot}`, `Unknown texture ${textureId}.`));
  }
  for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex += 1) {
    const scene = scenes[sceneIndex]; unique(scene.entities, "entity", diagnostics, `/extensions/hyperfocus3D/scenes/${sceneIndex}/entities`); unique(scene.lights, "light", diagnostics, `/extensions/hyperfocus3D/scenes/${sceneIndex}/lights`);
    if (scene.entities.length > budgets.entities) diagnostics.push(error("entity-budget", `/extensions/hyperfocus3D/scenes/${sceneIndex}/entities`, `Entity count exceeds budget ${budgets.entities}.`));
    if (scene.entities.length + (scene.effectCapacity ?? 0) > budgets.entities) diagnostics.push(error("effect-entity-budget", `/extensions/hyperfocus3D/scenes/${sceneIndex}/effectCapacity`, `Entities plus effect capacity exceed entity budget ${budgets.entities}.`));
    if (scene.lights.length > budgets.lights) diagnostics.push(error("light-budget", `/extensions/hyperfocus3D/scenes/${sceneIndex}/lights`, `Light count exceeds budget ${budgets.lights}.`));
    const ids = new Set(scene.entities.map((item) => item.id));
    if (scene.camera.followEntityId && !ids.has(scene.camera.followEntityId)) diagnostics.push(error("camera-follow-reference", `/extensions/hyperfocus3D/scenes/${sceneIndex}/camera/followEntityId`, `Unknown entity ${scene.camera.followEntityId}.`));
    if (scene.camera.far <= scene.camera.near) diagnostics.push(error("camera-range", `/extensions/hyperfocus3D/scenes/${sceneIndex}/camera/far`, "Camera far must be greater than near."));
    for (let entityIndex = 0; entityIndex < scene.entities.length; entityIndex += 1) {
      const entity = scene.entities[entityIndex], base = `/extensions/hyperfocus3D/scenes/${sceneIndex}/entities/${entityIndex}`;
      if (!meshIds.has(entity.meshId)) diagnostics.push(error("mesh-reference", `${base}/meshId`, `Unknown mesh ${entity.meshId}.`));
      if (!materialIds.has(entity.materialId)) diagnostics.push(error("material-reference", `${base}/materialId`, `Unknown material ${entity.materialId}.`));
      for (let variantIndex = 0; variantIndex < (entity.variants?.length ?? 0); variantIndex += 1) { const variant = entity.variants![variantIndex]!; if (!meshIds.has(variant.meshId)) diagnostics.push(error("variant-mesh-reference", `${base}/variants/${variantIndex}/meshId`, `Variant ${variant.id} references unknown canonical mesh ${variant.meshId}.`)); if (!materialIds.has(variant.materialId)) diagnostics.push(error("variant-material-reference", `${base}/variants/${variantIndex}/materialId`, `Variant ${variant.id} references unknown canonical material ${variant.materialId}.`)); }
      if (entity.skeleton && !rigIds.has(entity.skeleton.rigId)) diagnostics.push(error("rig-reference", `${base}/skeleton/rigId`, `Unknown rig ${entity.skeleton.rigId}.`));
      const mesh = meshes.find((candidate) => candidate.id === entity.meshId);
      if (entity.skeleton && mesh?.skin?.rigId !== entity.skeleton.rigId) diagnostics.push(error("skin-binding", `${base}/skeleton/rigId`, `Entity rig ${entity.skeleton.rigId} does not match mesh skin ${mesh?.skin?.rigId ?? "none"}.`));
      if (!entity.skeleton && mesh?.skin) diagnostics.push(error("skin-binding", `${base}/skeleton`, `Skinned mesh ${mesh.id} requires an entity skeleton binding.`));
    }
  }
  const activeSceneId = text(raw.activeSceneId, "/extensions/hyperfocus3D/activeSceneId", diagnostics);
  if (!scenes.some((scene) => scene.id === activeSceneId)) diagnostics.push(error("active-scene-reference", "/extensions/hyperfocus3D/activeSceneId", `Unknown 3D scene ${activeSceneId}.`));
  const cues = parseArray(audioRaw.cues, "/extensions/hyperfocus3D/audio/cues", diagnostics, (value, pointer) => { const id = text(value, pointer, diagnostics); if (assets && !assetById.has(id)) diagnostics.push(error("asset-reference", pointer, `Unknown audio asset ${id}.`)); return id; });
  return {
    version: 1, activeSceneId, budgets, meshes, ...(rigs.length ? { rigs } : {}), textures, materials, scenes,
    audio: { policy: choice(audioRaw.policy, ["gesture-unlock", "disabled"], "/extensions/hyperfocus3D/audio/policy", diagnostics, "disabled"), cues },
    save: { restoreOnBoot: bool(saveRaw.restoreOnBoot, "/extensions/hyperfocus3D/save/restoreOnBoot", diagnostics), slot: text(saveRaw.slot, "/extensions/hyperfocus3D/save/slot", diagnostics), maxBytes: uint(saveRaw.maxBytes, "/extensions/hyperfocus3D/save/maxBytes", diagnostics, 1024, 4194304) },
  };
}

function parseBudgets(value: unknown, diagnostics: Hyperfocus3DDiagnostic[]): Hyperfocus3DBudgets | undefined {
  const item = record(value); if (!item) return invalidObject("/extensions/hyperfocus3D/budgets", diagnostics);
  exact(item, ["entities", "indices", "lights", "materials", "meshes", "textureBytes", "textures", "vertices"], "/extensions/hyperfocus3D/budgets", diagnostics);
  return {
    meshes: uint(item.meshes, "/extensions/hyperfocus3D/budgets/meshes", diagnostics, 1, HARD.meshes),
    vertices: uint(item.vertices, "/extensions/hyperfocus3D/budgets/vertices", diagnostics, 1, HARD.vertices),
    indices: uint(item.indices, "/extensions/hyperfocus3D/budgets/indices", diagnostics, 1, HARD.indices),
    textures: uint(item.textures, "/extensions/hyperfocus3D/budgets/textures", diagnostics, 1, HARD.textures),
    textureBytes: uint(item.textureBytes, "/extensions/hyperfocus3D/budgets/textureBytes", diagnostics, 1, HARD.textureBytes),
    materials: uint(item.materials, "/extensions/hyperfocus3D/budgets/materials", diagnostics, 1, HARD.materials),
    lights: uint(item.lights, "/extensions/hyperfocus3D/budgets/lights", diagnostics, 1, HARD.lights),
    entities: uint(item.entities, "/extensions/hyperfocus3D/budgets/entities", diagnostics, 1, HARD.entities),
  };
}

function parseScene(value: unknown, pointer: string, diagnostics: Hyperfocus3DDiagnostic[]): Hyperfocus3DScene | undefined {
  const item = record(value); if (!item) return invalidObject(pointer, diagnostics);
  exact(item, ["camera", "entities", "id", "lights"], pointer, diagnostics, ["effectCapacity", "clearColor"]);
  const camera = record(item.camera); if (!camera) invalidObject(`${pointer}/camera`, diagnostics); else exact(camera, ["far", "followEntityId", "followOffset", "fovYRadians", "near", "position", "target", "up"], `${pointer}/camera`, diagnostics, ["followEntityId", "followOffset"]);
  const c = camera ?? {};
  const entities = parseArray(item.entities, `${pointer}/entities`, diagnostics, (input, p) => {
    const entity = record(input); if (!entity) return invalidObject(p, diagnostics);
    exact(entity, ["id", "materialId", "meshId", "position", "rotationY", "scale"], p, diagnostics, ["animation", "controller", "physics", "skeleton", "variants"]);
    const controller = entity.controller === undefined ? undefined : record(entity.controller); if (entity.controller !== undefined && !controller) invalidObject(`${p}/controller`, diagnostics); else if (controller) exact(controller, ["speed"], `${p}/controller`, diagnostics);
    const animation = entity.animation === undefined ? undefined : record(entity.animation); if (entity.animation !== undefined && !animation) invalidObject(`${p}/animation`, diagnostics); else if (animation) exact(animation, animation.kind === 'ping-pong' ? ['kind', 'offset', 'periodSeconds', 'phase'] : ["kind", "radiansPerSecond"], `${p}/animation`, diagnostics, animation.kind === 'ping-pong' ? ['travelSeconds', 'varyByMatch', 'turnRadius', 'turnPivot'] : []);
    const parsedAnimation: SceneAnimation3D | undefined = !animation ? undefined : animation.kind === 'ping-pong'
      ? { kind: 'ping-pong', offset: vector3(animation.offset, `${p}/animation/offset`, diagnostics, [4, 0, 0]), periodSeconds: finite(animation.periodSeconds, `${p}/animation/periodSeconds`, diagnostics, 8, 1, 3600), phase: finite(animation.phase, `${p}/animation/phase`, diagnostics, 0, 0, 1), ...(animation.travelSeconds === undefined ? {} : { travelSeconds: finite(animation.travelSeconds, `${p}/animation/travelSeconds`, diagnostics, 1, .1, 1800) }), ...(animation.varyByMatch === undefined ? {} : { varyByMatch: bool(animation.varyByMatch, `${p}/animation/varyByMatch`, diagnostics) }), ...(animation.turnRadius === undefined ? {} : { turnRadius: finite(animation.turnRadius, `${p}/animation/turnRadius`, diagnostics, 2, -100, 100) }), ...(animation.turnPivot === undefined ? {} : { turnPivot: vector3(animation.turnPivot, `${p}/animation/turnPivot`, diagnostics, [0, 0, 0]) }) }
      : { kind: choice(animation.kind, ['rotate-y'], `${p}/animation/kind`, diagnostics, 'rotate-y'), radiansPerSecond: finite(animation.radiansPerSecond, `${p}/animation/radiansPerSecond`, diagnostics, 1, -100, 100) };
    if (parsedAnimation?.kind === 'ping-pong' && entity.physics && (record(entity.physics)?.type !== 'static' || record(entity.physics)?.shape !== 'box')) diagnostics.push({ severity: 'error', code: 'platform-body', pointer: `${p}/physics`, message: 'Moving platforms require a static box body, or no body for visual motion.' });
    if (parsedAnimation?.kind === 'ping-pong' && (parsedAnimation.travelSeconds !== undefined ? parsedAnimation.travelSeconds * 2 > parsedAnimation.periodSeconds || hypot(...parsedAnimation.offset) / parsedAnimation.travelSeconds > 40 : hypot(...parsedAnimation.offset) * Math.PI / parsedAnimation.periodSeconds > 8)) diagnostics.push({ severity: 'error', code: 'platform-speed', pointer: `${p}/animation/periodSeconds`, message: 'Continuous platforms allow 8 m/s; traffic legs allow 40 m/s and must fit twice within the round trip.' });
    if (parsedAnimation?.kind === 'ping-pong' && (parsedAnimation.turnRadius !== undefined || parsedAnimation.turnPivot !== undefined)) {
      const travel = parsedAnimation.travelSeconds ?? 0, turn = (parsedAnimation.periodSeconds - travel * 2) / 2, radius = Math.abs(parsedAnimation.turnRadius ?? 0), length = hypot(...parsedAnimation.offset);
      if (!parsedAnimation.turnPivot || radius < .25 || !travel || turn <= 0 || parsedAnimation.offset[1] !== 0 || length < .1 || radius * Math.PI / turn > Math.min(20, length / travel) || length * 1.5 / travel > 36) diagnostics.push({ severity: 'error', code: 'circuit-motion', pointer: `${p}/animation`, message: 'A traffic circuit requires a horizontal leg, shared pivot, nonzero radius, forward travel and turn time within bounded speeds.' });
    }
    const skeleton = entity.skeleton === undefined ? undefined : record(entity.skeleton); if (entity.skeleton !== undefined && !skeleton) invalidObject(`${p}/skeleton`, diagnostics); else if (skeleton) exact(skeleton, ["meshNode", "rigId", "skinIndex"], `${p}/skeleton`, diagnostics);
    const physics = entity.physics === undefined ? undefined : record(entity.physics); if (entity.physics !== undefined && !physics) invalidObject(`${p}/physics`, diagnostics); else if (physics) exact(physics, ["continuous", "gravityScale", "shape", "type"], `${p}/physics`, diagnostics);
    const variants = entity.variants === undefined ? [] : parseArray(entity.variants, `${p}/variants`, diagnostics, (value, variantPointer) => { const variant = record(value); if (!variant) return invalidObject(variantPointer, diagnostics); exact(variant, ["id", "materialId", "meshId"], variantPointer, diagnostics); return { id: text(variant.id, `${variantPointer}/id`, diagnostics), meshId: text(variant.meshId, `${variantPointer}/meshId`, diagnostics), materialId: text(variant.materialId, `${variantPointer}/materialId`, diagnostics) }; }); unique(variants, "entity variant", diagnostics, `${p}/variants`);
    const scale = vector3(entity.scale, `${p}/scale`, diagnostics, [1, 1, 1]);
    if (physics && scale.some((value) => value === 0)) diagnostics.push(error("physics-scale", `${p}/scale`, "A physics entity requires non-zero scale on every axis."));
    return { id: text(entity.id, `${p}/id`, diagnostics), meshId: text(entity.meshId, `${p}/meshId`, diagnostics), materialId: text(entity.materialId, `${p}/materialId`, diagnostics), position: vector3(entity.position, `${p}/position`, diagnostics, [0, 0, 0]), scale, rotationY: finite(entity.rotationY, `${p}/rotationY`, diagnostics, 0), ...(variants.length ? { variants } : {}), ...(controller ? { controller: { speed: finite(controller.speed, `${p}/controller/speed`, diagnostics, 1, 0, 1000) } } : {}), ...(parsedAnimation ? { animation: parsedAnimation } : {}), ...(skeleton ? { skeleton: { rigId: text(skeleton.rigId, `${p}/skeleton/rigId`, diagnostics), skinIndex: uint(skeleton.skinIndex, `${p}/skeleton/skinIndex`, diagnostics, 0, 100_000), meshNode: uint(skeleton.meshNode, `${p}/skeleton/meshNode`, diagnostics, 0, 1_000_000) } } : {}), ...(physics ? { physics: { type: choice(physics.type, ["static", "dynamic"], `${p}/physics/type`, diagnostics, "static"), shape: choice(physics.shape, ["box", "sphere"], `${p}/physics/shape`, diagnostics, "box"), gravityScale: finite(physics.gravityScale, `${p}/physics/gravityScale`, diagnostics, 1, 0, 100), continuous: bool(physics.continuous, `${p}/physics/continuous`, diagnostics) } } : {}) };
  });
  const lights = parseArray(item.lights, `${pointer}/lights`, diagnostics, (input, p) => {
    const light = record(input); if (!light) return invalidObject(p, diagnostics);
    exact(light, ["color", "direction", "id", "intensity", "kind", "position", "range"], p, diagnostics, ["direction", "position", "range"]);
    const kind = choice(light.kind, ["ambient", "directional", "point", "spot"], `${p}/kind`, diagnostics, "ambient");
    const direction = light.direction === undefined ? undefined : vector3(light.direction, `${p}/direction`, diagnostics, [0, -1, 0]);
    if ((kind === "directional" || kind === "spot") && (!direction || hypot(...direction) === 0)) diagnostics.push(error("light-direction", `${p}/direction`, `${kind} light requires a non-zero direction.`));
    return { id: text(light.id, `${p}/id`, diagnostics), kind, color: vector3(light.color, `${p}/color`, diagnostics, [1, 1, 1]), intensity: finite(light.intensity, `${p}/intensity`, diagnostics, 1, 0), ...(light.position === undefined ? {} : { position: vector3(light.position, `${p}/position`, diagnostics, [0, 0, 0]) }), ...(direction === undefined ? {} : { direction }), ...(light.range === undefined ? {} : { range: finite(light.range, `${p}/range`, diagnostics, 10, 0) }) };
  });
  return { id: text(item.id, `${pointer}/id`, diagnostics), ...(item.clearColor === undefined ? {} : { clearColor: vector4(item.clearColor, `${pointer}/clearColor`, diagnostics, [0.025, 0.045, 0.075, 1]) }), ...(item.effectCapacity === undefined ? {} : { effectCapacity: uint(item.effectCapacity, `${pointer}/effectCapacity`, diagnostics, 0, 2_048) }), camera: { position: vector3(c.position, `${pointer}/camera/position`, diagnostics, [0, 4, 8]), target: vector3(c.target, `${pointer}/camera/target`, diagnostics, [0, 0, 0]), up: vector3(c.up, `${pointer}/camera/up`, diagnostics, [0, 1, 0]), fovYRadians: finite(c.fovYRadians, `${pointer}/camera/fovYRadians`, diagnostics, Math.PI / 3, 0.01, Math.PI - 0.01), near: finite(c.near, `${pointer}/camera/near`, diagnostics, 0.1, 0.0001), far: finite(c.far, `${pointer}/camera/far`, diagnostics, 100, 0.001), ...(c.followEntityId === undefined ? {} : { followEntityId: text(c.followEntityId, `${pointer}/camera/followEntityId`, diagnostics) }), ...(c.followOffset === undefined ? {} : { followOffset: vector3(c.followOffset, `${pointer}/camera/followOffset`, diagnostics, [0, 4, 8]) }) }, lights, entities };
}

export function preflightFailure(diagnostics: readonly Hyperfocus3DDiagnostic[]) { const failure = new Error(`Hyperfocus 3D preflight failed:\n${diagnostics.map((item) => `- ${item.pointer || "/"}: ${item.message}`).join("\n")}`); Object.assign(failure, { diagnostics }); return failure; }
export function error(code: string, pointer: string, message: string): Hyperfocus3DDiagnostic { return { severity: "error", code, pointer, message }; }
export function record(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : undefined; }
function parseGaitClipAnalysis(value: unknown, pointer: string, diagnostics: Hyperfocus3DDiagnostic[]): HumanoidGaitClipAnalysis | undefined {
  const gait = record(value); if (!gait) return invalidObject(pointer, diagnostics);
  exact(gait, ["confidence", "cycleSeconds", "initialPhase", "leftFootBoneId", "rightFootBoneId", "sampleRate", "stanceRatio", "version"], pointer, diagnostics);
  uint(gait.version, `${pointer}/version`, diagnostics, 1, 1); const leftFootBoneId = text(gait.leftFootBoneId, `${pointer}/leftFootBoneId`, diagnostics), rightFootBoneId = text(gait.rightFootBoneId, `${pointer}/rightFootBoneId`, diagnostics);
  if (leftFootBoneId === rightFootBoneId) diagnostics.push(error("gait-foot-reference", `${pointer}/rightFootBoneId`, "Gait analysis needs different stable left and right foot identities."));
  return { version: 1, cycleSeconds: finite(gait.cycleSeconds, `${pointer}/cycleSeconds`, diagnostics, .8, .01, 60), initialPhase: finite(gait.initialPhase, `${pointer}/initialPhase`, diagnostics, 0, 0, 1), stanceRatio: finite(gait.stanceRatio, `${pointer}/stanceRatio`, diagnostics, .6, .05, .95), confidence: finite(gait.confidence, `${pointer}/confidence`, diagnostics, 0, 0, 1), sampleRate: finite(gait.sampleRate, `${pointer}/sampleRate`, diagnostics, 60, 15, 1_000), leftFootBoneId, rightFootBoneId };
}
function parseToonMaterial(value: unknown, pointer: string, diagnostics: Hyperfocus3DDiagnostic[]) {
  const toon = record(value); if (!toon) return invalidObject(pointer, diagnostics);
  exact(toon, ["bands", "outlineColor", "outlineWidth", "rimColor", "rimStrength", "shadowColor"], pointer, diagnostics);
  return {
    bands: uint(toon.bands, `${pointer}/bands`, diagnostics, 2, 8),
    shadowColor: vector3(toon.shadowColor, `${pointer}/shadowColor`, diagnostics, [0.22, 0.25, 0.38]),
    rimColor: vector3(toon.rimColor, `${pointer}/rimColor`, diagnostics, [1, 1, 1]),
    rimStrength: finite(toon.rimStrength, `${pointer}/rimStrength`, diagnostics, 0.28, 0, 1),
    outlineColor: vector4(toon.outlineColor, `${pointer}/outlineColor`, diagnostics, [0.025, 0.03, 0.055, 1]),
    outlineWidth: finite(toon.outlineWidth, `${pointer}/outlineWidth`, diagnostics, 0.004, 0, 0.2),
  };
}
function invalidObject(pointer: string, diagnostics: Hyperfocus3DDiagnostic[]): undefined { diagnostics.push(error("object", pointer, "Expected an object.")); return undefined; }
function exact(value: Record<string, unknown>, required: readonly string[], pointer: string, diagnostics: Hyperfocus3DDiagnostic[], optional: readonly string[] = []) { const allowed = new Set([...required, ...optional]); for (const key of Object.keys(value)) if (!allowed.has(key)) diagnostics.push(error("unknown-field", `${pointer}/${escapePointer(key)}`, `Unknown field ${key}.`)); for (const key of required) if (!optional.includes(key) && !(key in value)) diagnostics.push(error("missing-field", `${pointer}/${escapePointer(key)}`, `Required field ${key} is missing.`)); }
function text(value: unknown, pointer: string, diagnostics: Hyperfocus3DDiagnostic[]): string { if (typeof value !== "string" || !value || new TextEncoder().encode(value).length > 256 || /[\u0000-\u001f\u007f]/.test(value)) { diagnostics.push(error("text", pointer, "Expected non-empty bounded text without control characters.")); return ""; } return value; }
function uint(value: unknown, pointer: string, diagnostics: Hyperfocus3DDiagnostic[], min: number, max: number): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) { diagnostics.push(error("integer", pointer, `Expected an integer from ${min} through ${max}.`)); return min; } return value; }
function finite(value: unknown, pointer: string, diagnostics: Hyperfocus3DDiagnostic[], fallback: number, min = -Number.MAX_VALUE, max = Number.MAX_VALUE): number { if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) { diagnostics.push(error("number", pointer, `Expected a finite number from ${min} through ${max}.`)); return fallback; } return value; }
function bool(value: unknown, pointer: string, diagnostics: Hyperfocus3DDiagnostic[]): boolean { if (typeof value !== "boolean") { diagnostics.push(error("boolean", pointer, "Expected a boolean.")); return false; } return value; }
function choice<const T extends string>(value: unknown, choices: readonly T[], pointer: string, diagnostics: Hyperfocus3DDiagnostic[], fallback: T): T { const match = typeof value === "string" ? choices.find((choice) => choice === value) : undefined; if (match === undefined) { diagnostics.push(error("enum", pointer, `Expected one of: ${choices.join(", ")}.`)); return fallback; } return match; }
function vector3(value: unknown, pointer: string, diagnostics: Hyperfocus3DDiagnostic[], fallback: Vector3): Vector3 { if (!Array.isArray(value) || value.length !== 3) { diagnostics.push(error("vector", pointer, "Expected an array of 3 finite numbers.")); return [fallback[0], fallback[1], fallback[2]]; } return [finite(value[0], `${pointer}/0`, diagnostics, fallback[0]), finite(value[1], `${pointer}/1`, diagnostics, fallback[1]), finite(value[2], `${pointer}/2`, diagnostics, fallback[2])]; }
function vector2(value: unknown, pointer: string, diagnostics: Hyperfocus3DDiagnostic[], fallback: [number, number]): [number, number] { if (!Array.isArray(value) || value.length !== 2) { diagnostics.push(error("vector", pointer, "Expected an array of 2 finite numbers.")); return [...fallback]; } return [finite(value[0], `${pointer}/0`, diagnostics, fallback[0]), finite(value[1], `${pointer}/1`, diagnostics, fallback[1])]; }
function optionalText(value: Record<string, unknown>, key: string, pointer: string, diagnostics: Hyperfocus3DDiagnostic[]): Record<string, string> { return value[key] === undefined ? {} : { [key]: text(value[key], pointer, diagnostics) }; }
function vector4(value: unknown, pointer: string, diagnostics: Hyperfocus3DDiagnostic[], fallback: Vector4): Vector4 { if (!Array.isArray(value) || value.length !== 4) { diagnostics.push(error("vector", pointer, "Expected an array of 4 finite numbers.")); return [fallback[0], fallback[1], fallback[2], fallback[3]]; } return [finite(value[0], `${pointer}/0`, diagnostics, fallback[0]), finite(value[1], `${pointer}/1`, diagnostics, fallback[1]), finite(value[2], `${pointer}/2`, diagnostics, fallback[2]), finite(value[3], `${pointer}/3`, diagnostics, fallback[3])]; }
function normalizedQuaternion(value: unknown, pointer: string, diagnostics: Hyperfocus3DDiagnostic[]): Vector4 { const parsed = vector4(value, pointer, diagnostics, [0, 0, 0, 1]), magnitude = hypot(...parsed); if (magnitude < 0.999 || magnitude > 1.001) { diagnostics.push(error("quaternion", pointer, "Expected a normalized xyzw quaternion.")); return [0, 0, 0, 1]; } return [parsed[0] / magnitude, parsed[1] / magnitude, parsed[2] / magnitude, parsed[3] / magnitude]; }
function parseArray<T>(value: unknown, pointer: string, diagnostics: Hyperfocus3DDiagnostic[], parse: (value: unknown, pointer: string) => T | undefined): T[] { if (!Array.isArray(value)) { diagnostics.push(error("array", pointer, "Expected an array.")); return []; } if (value.length > 100_000) { diagnostics.push(error("array-limit", pointer, "Array exceeds the hard item limit 100000.")); return []; } const result: T[] = []; value.forEach((item, index) => { const parsed = parse(item, `${pointer}/${index}`); if (parsed !== undefined) result.push(parsed); }); return result; }
function unique(items: readonly { id: string }[], label: string, diagnostics: Hyperfocus3DDiagnostic[], pointer = `/extensions/hyperfocus3D/${label}s`) { const ids = new Set<string>(); items.forEach((item, index) => { if (ids.has(item.id)) diagnostics.push(error(`${label}-id-duplicate`, `${pointer}/${index}/id`, `Duplicate ${label} id ${item.id}.`)); ids.add(item.id); }); }
function escapePointer(value: string) { return value.replace(/~/g, "~0").replace(/\//g, "~1"); }
export function message(value: unknown) { return sharedErrorMessage(value, { stringify: true }); }
