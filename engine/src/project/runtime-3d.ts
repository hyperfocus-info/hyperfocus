import { resolveAndCookGltfStaticMeshes, type CookedGltfStaticMesh } from "../assets/gltf-static.ts";
import { lookAtViewMat4, multiplyMat4, perspectiveMat4 } from "../render/3d-core.ts";
import { createBoundedScene3D, createRenderCommandBuffer3D, type BoundedScene3D, type RenderCommandBuffer3D } from "../render/3d-scene.ts";
import { createRigidWorld3D, type RigidWorld3D } from "../physics/rigid-3d.ts";

const MAX_JSON_ASSET_BYTES = 16 * 1024 * 1024;
const HARD = Object.freeze({ meshes: 4_096, vertices: 5_000_000, indices: 15_000_000, textures: 1_024, textureBytes: 256 * 1024 * 1024, materials: 4_096, lights: 256, entities: 100_000 });

export type PortableAsset3D = { id: string; name?: string; mimeType: string; bytes: Uint8Array };
export type Hyperfocus3DDiagnostic = { severity: "error"; code: string; pointer: string; message: string };
export type Hyperfocus3DBudgets = typeof HARD;
export type Hyperfocus3DDeclaration = {
  version: 1;
  activeSceneId: string;
  budgets: Hyperfocus3DBudgets;
  meshes: Array<{ id: string; assetId: string; primitive: number; buffers: Array<{ uri: string; assetId: string }> }>;
  textures: Array<{ id: string; assetId: string; width: number; height: number; filter: "nearest" | "linear"; wrap: "clamp" | "repeat"; flipY: boolean }>;
  materials: Array<{ id: string; shading: "unlit" | "lit"; baseColor: [number, number, number, number]; textureId?: string; metallic: number; roughness: number; doubleSided: boolean }>;
  scenes: Array<{
    id: string;
    camera: { position: [number, number, number]; target: [number, number, number]; up: [number, number, number]; fovYRadians: number; near: number; far: number; followEntityId?: string; followOffset?: [number, number, number] };
    lights: Array<{ id: string; kind: "ambient" | "directional" | "point" | "spot"; color: [number, number, number]; intensity: number; position?: [number, number, number]; direction?: [number, number, number]; range?: number }>;
    entities: Array<{ id: string; meshId: string; materialId: string; position: [number, number, number]; scale: [number, number, number]; rotationY: number; controller?: { speed: number }; animation?: { kind: "rotate-y"; radiansPerSecond: number }; physics?: { type: "static" | "dynamic"; shape: "box" | "sphere"; gravityScale: number; continuous: boolean } }>;
  }>;
  audio: { policy: "gesture-unlock" | "disabled"; cues: string[] };
  save: { restoreOnBoot: boolean; slot: string; maxBytes: number };
};

export type Hyperfocus3DSnapshot = { version: 1; sceneId: string; tick: number; entities: Array<{ id: string; position: [number, number, number]; rotationY: number }> };
export type Hyperfocus3DRuntime = {
  declaration: Readonly<Hyperfocus3DDeclaration>;
  scene: BoundedScene3D;
  commands: RenderCommandBuffer3D;
  physics: RigidWorld3D;
  diagnostics: readonly Hyperfocus3DDiagnostic[];
  step(actions?: Iterable<string>): Hyperfocus3DSnapshot;
  compile(): RenderCommandBuffer3D;
  cameraPosition(): [number, number, number];
  viewProjection(aspect: number): Float32Array;
  snapshot(): Hyperfocus3DSnapshot;
  restore(snapshot: Hyperfocus3DSnapshot): Hyperfocus3DSnapshot;
};

export function hasHyperfocus3DProject(project: unknown): boolean {
  return record(project)?.extensions !== undefined && record(record(project)?.extensions)?.hyperfocus3D !== undefined;
}

export function auditHyperfocus3DProject(project: unknown, assets: readonly PortableAsset3D[]): Hyperfocus3DDiagnostic[] {
  const diagnostics: Hyperfocus3DDiagnostic[] = [];
  parseDeclaration(project, assets, diagnostics);
  return diagnostics;
}

/** Validates, resolves and cooks a portable 3D declaration without filesystem or network access. */
export async function createHyperfocus3DRuntime(project: unknown, assets: readonly PortableAsset3D[]): Promise<Hyperfocus3DRuntime> {
  const diagnostics: Hyperfocus3DDiagnostic[] = [];
  const declaration = parseDeclaration(project, assets, diagnostics);
  if (!declaration || diagnostics.length) throw preflightFailure(diagnostics);
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const cookedById = new Map<string, CookedGltfStaticMesh>();
  let vertexCount = 0, indexCount = 0;
  for (let index = 0; index < declaration.meshes.length; index += 1) {
    const mesh = declaration.meshes[index];
    const source = assetById.get(mesh.assetId)!;
    let document: unknown;
    try { document = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(source.bytes)); }
    catch (cause) {
      diagnostics.push(error("gltf-json", `/extensions/hyperfocus3D/meshes/${index}/assetId`, `Asset ${mesh.assetId} is not valid UTF-8 glTF JSON: ${message(cause)}`));
      continue;
    }
    const bufferMap = new Map(mesh.buffers.map((item) => [item.uri, assetById.get(item.assetId)!]));
    const cooked = await resolveAndCookGltfStaticMeshes(document, {
      maxBuffers: 64,
      maxBufferBytes: declaration.budgets.textureBytes,
      resolveExternal: ({ uri }) => {
        const resolved = bufferMap.get(uri);
        if (!resolved) throw new Error(`URI ${JSON.stringify(uri)} is not mapped to a canonical archive asset.`);
        return resolved.bytes;
      },
      cook: { maxMeshes: declaration.budgets.meshes, maxPrimitives: declaration.budgets.meshes, maxVertices: declaration.budgets.vertices, maxIndices: declaration.budgets.indices, maxOutputBytes: declaration.budgets.vertices * 32 + declaration.budgets.indices * 4 },
    });
    for (const item of cooked.diagnostics) diagnostics.push(error(`gltf-${item.code}`, `/extensions/hyperfocus3D/meshes/${index}/asset${item.pointer}`, item.message));
    if (!cooked.ok) continue;
    const primitive = cooked.meshes[mesh.primitive];
    if (!primitive) {
      diagnostics.push(error("mesh-primitive", `/extensions/hyperfocus3D/meshes/${index}/primitive`, `Cooked glTF has ${cooked.meshes.length} primitives; index ${mesh.primitive} does not exist.`));
      continue;
    }
    vertexCount += primitive.positions.length / 3;
    indexCount += primitive.indices.length;
    if (vertexCount > declaration.budgets.vertices) diagnostics.push(error("vertex-budget", "/extensions/hyperfocus3D/budgets/vertices", `Cooked vertex count ${vertexCount} exceeds budget ${declaration.budgets.vertices}.`));
    if (indexCount > declaration.budgets.indices) diagnostics.push(error("index-budget", "/extensions/hyperfocus3D/budgets/indices", `Cooked index count ${indexCount} exceeds budget ${declaration.budgets.indices}.`));
    cookedById.set(mesh.id, primitive);
  }
  if (diagnostics.length) throw preflightFailure(diagnostics);

  const active = declaration.scenes.find((item) => item.id === declaration.activeSceneId)!;
  const scene = createBoundedScene3D({
    transforms: active.entities.length,
    meshes: declaration.meshes.length,
    textures: declaration.textures.length,
    textureBytes: declaration.budgets.textureBytes,
    materials: declaration.materials.length,
    lights: active.lights.length,
    instances: active.entities.length,
  });
  const meshHandles = new Map(declaration.meshes.map((mesh) => {
    const cooked = cookedById.get(mesh.id)!;
    return [mesh.id, scene.registerMesh({ positions: cooked.positions, normals: cooked.normals, uvs: cooked.uvs, indices: cooked.indices, topology: cooked.topology, bounds: cooked.bounds, label: mesh.id })] as const;
  }));
  const textureHandles = new Map(declaration.textures.map((texture) => {
    const source = assetById.get(texture.assetId)!;
    return [texture.id, scene.registerTexture({ width: texture.width, height: texture.height, pixels: source.bytes, filter: texture.filter, wrapU: texture.wrap, wrapV: texture.wrap, flipY: texture.flipY, label: texture.id })] as const;
  }));
  const materialHandles = new Map(declaration.materials.map((material) => [material.id, scene.createMaterial({
    shading: material.shading,
    baseColor: material.baseColor,
    baseColorTexture: material.textureId === undefined ? undefined : textureHandles.get(material.textureId),
    metallic: material.metallic,
    roughness: material.roughness,
    doubleSided: material.doubleSided,
  })] as const));
  for (const light of active.lights) scene.createLight(light);
  const transforms = new Map<string, number>();
  for (const entity of active.entities) {
    const transform = scene.transforms.create();
    scene.transforms.setPosition(transform, ...entity.position);
    scene.transforms.setScale(transform, ...entity.scale);
    setRotationY(scene, transform, entity.rotationY);
    scene.createInstance({ mesh: meshHandles.get(entity.meshId)!, material: materialHandles.get(entity.materialId)!, transform });
    transforms.set(entity.id, transform);
  }
  const commands = createRenderCommandBuffer3D({ commands: active.entities.length, instances: active.entities.length, lights: active.lights.length });
  const physicsEntities = active.entities.filter((entity) => entity.physics !== undefined);
  const physics = createRigidWorld3D({
    capacity: Math.max(1, physicsEntities.length),
    maxContacts: Math.max(1, physicsEntities.length * 4),
    maxCandidatePairs: Math.max(1, physicsEntities.length * 8),
    maxCcdTests: Math.max(1, physicsEntities.length * 4),
  });
  const physicsHandles = new Map<string, number>();
  for (const entity of physicsEntities) {
    const definition = entity.physics!;
    const shape = definition.shape === "sphere"
      ? { kind: "sphere" as const, radius: Math.max(...entity.scale.map(Math.abs)) }
      : { kind: "box" as const, halfX: Math.abs(entity.scale[0]), halfY: Math.abs(entity.scale[1]), halfZ: Math.abs(entity.scale[2]) };
    physicsHandles.set(entity.id, physics.addBody({ id: entity.id, type: definition.type, shape, x: entity.position[0], y: entity.position[1], z: entity.position[2], gravityScale: definition.gravityScale, continuous: definition.continuous }));
  }
  let tick = 0;
  const positions = new Map(active.entities.map((entity) => [entity.id, [...entity.position] as [number, number, number]]));
  const rotations = new Map(active.entities.map((entity) => [entity.id, entity.rotationY]));
  const snapshot = (): Hyperfocus3DSnapshot => ({ version: 1, sceneId: active.id, tick, entities: active.entities.map((entity) => ({ id: entity.id, position: [...positions.get(entity.id)!] as [number, number, number], rotationY: rotations.get(entity.id)! })) });
  const apply = (value: Hyperfocus3DSnapshot) => {
    tick = value.tick;
    for (const item of value.entities) {
      const transform = transforms.get(item.id)!;
      positions.set(item.id, [...item.position]); rotations.set(item.id, item.rotationY);
      const physicsHandle = physicsHandles.get(item.id);
      if (physicsHandle !== undefined) {
        physics.setPosition(physicsHandle, ...item.position);
        if (physics.body(physicsHandle)?.type === "dynamic") physics.setVelocity(physicsHandle, 0, 0, 0);
      }
      scene.transforms.setPosition(transform, ...item.position); setRotationY(scene, transform, item.rotationY);
    }
    return snapshot();
  };
  const cameraPosition = (): [number, number, number] => {
    const camera = active.camera;
    const targetEntity = camera.followEntityId ? positions.get(camera.followEntityId) : undefined;
    const offset = camera.followOffset ?? [0, 0, 0];
    return targetEntity
      ? [targetEntity[0] + offset[0], targetEntity[1] + offset[1], targetEntity[2] + offset[2]]
      : [...camera.position];
  };
  return Object.freeze({
    declaration: Object.freeze(declaration), scene, commands, physics, diagnostics,
    step(actions: Iterable<string> = []) {
      const actionSet = new Set(actions);
      tick += 1;
      for (const entity of active.entities) {
        const position = positions.get(entity.id)!;
        if (entity.controller) {
          const distance = entity.controller.speed / 60;
          const moveX = (actionSet.has("move-right") ? entity.controller.speed : 0) - (actionSet.has("move-left") ? entity.controller.speed : 0);
          const moveZ = (actionSet.has("move-down") ? entity.controller.speed : 0) - (actionSet.has("move-up") ? entity.controller.speed : 0);
          const physicsHandle = physicsHandles.get(entity.id);
          if (physicsHandle !== undefined) {
            const body = physics.body(physicsHandle)!;
            physics.setVelocity(physicsHandle, moveX, body.velocityY, moveZ);
          } else {
            position[0] += Math.sign(moveX) * distance;
            position[2] += Math.sign(moveZ) * distance;
            scene.transforms.setPosition(transforms.get(entity.id)!, ...position);
          }
        }
        if (entity.animation) {
          const rotation = entity.rotationY + tick * entity.animation.radiansPerSecond / 60;
          rotations.set(entity.id, rotation); setRotationY(scene, transforms.get(entity.id)!, rotation);
        }
      }
      physics.step(1 / 60);
      for (const entity of physicsEntities) {
        const body = physics.body(physicsHandles.get(entity.id)!)!;
        const position = positions.get(entity.id)!;
        position[0] = body.x; position[1] = body.y; position[2] = body.z;
        scene.transforms.setPosition(transforms.get(entity.id)!, ...position);
      }
      return snapshot();
    },
    compile: () => scene.compile(commands),
    cameraPosition,
    viewProjection(aspect: number) {
      if (!Number.isFinite(aspect) || aspect <= 0) throw new RangeError("3D camera aspect must be positive and finite.");
      const camera = active.camera;
      const targetEntity = camera.followEntityId ? positions.get(camera.followEntityId) : undefined;
      const target: [number, number, number] = targetEntity ? [targetEntity[0], targetEntity[1], targetEntity[2]] : [...camera.target];
      const eye = cameraPosition();
      const projection = perspectiveMat4(new Float32Array(16), { fovYRadians: camera.fovYRadians, aspect, near: camera.near, far: camera.far });
      const view = lookAtViewMat4(new Float32Array(16), eye, target, camera.up);
      return multiplyMat4(new Float32Array(16), projection, view);
    },
    snapshot,
    restore(value: Hyperfocus3DSnapshot) {
      validateSnapshot(value, active);
      return apply(value);
    },
  });
}

function parseDeclaration(project: unknown, assets: readonly PortableAsset3D[], diagnostics: Hyperfocus3DDiagnostic[]): Hyperfocus3DDeclaration | undefined {
  const root = record(project), extensions = record(root?.extensions), raw = record(extensions?.hyperfocus3D);
  if (!raw) { diagnostics.push(error("declaration-required", "/extensions/hyperfocus3D", "extensions.hyperfocus3D must be an object.")); return undefined; }
  const assetById = new Map<string, PortableAsset3D>();
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    if (!asset || typeof asset.id !== "string" || !(asset.bytes instanceof Uint8Array)) diagnostics.push(error("asset-invalid", `/assets/${index}`, "Opened archive asset is invalid."));
    else if (assetById.has(asset.id)) diagnostics.push(error("asset-id-duplicate", `/assets/${index}/id`, `Duplicate asset id ${asset.id}.`));
    else assetById.set(asset.id, asset);
  }
  exact(raw, ["activeSceneId", "audio", "budgets", "materials", "meshes", "save", "scenes", "textures", "version"], "/extensions/hyperfocus3D", diagnostics);
  if (raw.version !== 1) diagnostics.push(error("version", "/extensions/hyperfocus3D/version", "Only hyperfocus3D version 1 is supported."));
  const budgets = parseBudgets(raw.budgets, diagnostics);
  const meshes = parseArray(raw.meshes, "/extensions/hyperfocus3D/meshes", diagnostics, (value, pointer) => {
    const item = record(value); if (!item) return invalidObject(pointer, diagnostics);
    exact(item, ["assetId", "buffers", "id", "primitive"], pointer, diagnostics);
    const id = text(item.id, `${pointer}/id`, diagnostics), assetId = text(item.assetId, `${pointer}/assetId`, diagnostics);
    const source = assetById.get(assetId);
    if (!source) diagnostics.push(error("asset-reference", `${pointer}/assetId`, `Unknown archive asset ${assetId}.`));
    else if (source.bytes.byteLength > MAX_JSON_ASSET_BYTES || !["application/json", "model/gltf+json"].includes(source.mimeType)) diagnostics.push(error("gltf-asset", `${pointer}/assetId`, `Asset ${assetId} must be glTF JSON no larger than ${MAX_JSON_ASSET_BYTES} bytes.`));
    const buffers = parseArray(item.buffers, `${pointer}/buffers`, diagnostics, (buffer, bufferPointer) => {
      const pair = record(buffer); if (!pair) return invalidObject(bufferPointer, diagnostics);
      exact(pair, ["assetId", "uri"], bufferPointer, diagnostics);
      const uri = text(pair.uri, `${bufferPointer}/uri`, diagnostics), bufferAssetId = text(pair.assetId, `${bufferPointer}/assetId`, diagnostics);
      if (/^(?:https?:|file:|data:)/i.test(uri) || uri.includes("\\") || uri.startsWith("/") || uri.includes("..")) diagnostics.push(error("buffer-uri", `${bufferPointer}/uri`, "External glTF buffer URI must be a safe relative logical name."));
      if (!assetById.has(bufferAssetId)) diagnostics.push(error("asset-reference", `${bufferPointer}/assetId`, `Unknown archive asset ${bufferAssetId}.`));
      return { uri, assetId: bufferAssetId };
    });
    return { id, assetId, primitive: uint(item.primitive, `${pointer}/primitive`, diagnostics, 0, 1_000_000), buffers };
  });
  const textures = parseArray(raw.textures, "/extensions/hyperfocus3D/textures", diagnostics, (value, pointer) => {
    const item = record(value); if (!item) return invalidObject(pointer, diagnostics);
    exact(item, ["assetId", "filter", "flipY", "height", "id", "width", "wrap"], pointer, diagnostics);
    const id = text(item.id, `${pointer}/id`, diagnostics), assetId = text(item.assetId, `${pointer}/assetId`, diagnostics);
    const width = uint(item.width, `${pointer}/width`, diagnostics, 1, 16_384), height = uint(item.height, `${pointer}/height`, diagnostics, 1, 16_384);
    const asset = assetById.get(assetId);
    if (!asset) diagnostics.push(error("asset-reference", `${pointer}/assetId`, `Unknown archive asset ${assetId}.`));
    else if (asset.mimeType !== "application/octet-stream" || asset.bytes.byteLength !== width * height * 4) diagnostics.push(error("rgba8-asset", `${pointer}/assetId`, `RGBA8 asset ${assetId} must be application/octet-stream with exactly ${width * height * 4} bytes.`));
    return { id, assetId, width, height, filter: choice(item.filter, ["nearest", "linear"], `${pointer}/filter`, diagnostics, "nearest"), wrap: choice(item.wrap, ["clamp", "repeat"], `${pointer}/wrap`, diagnostics, "clamp"), flipY: bool(item.flipY, `${pointer}/flipY`, diagnostics) };
  });
  const materials = parseArray(raw.materials, "/extensions/hyperfocus3D/materials", diagnostics, (value, pointer) => {
    const item = record(value); if (!item) return invalidObject(pointer, diagnostics);
    exact(item, ["baseColor", "doubleSided", "id", "metallic", "roughness", "shading", "textureId"], pointer, diagnostics, ["textureId"]);
    return { id: text(item.id, `${pointer}/id`, diagnostics), shading: choice(item.shading, ["unlit", "lit"], `${pointer}/shading`, diagnostics, "lit"), baseColor: vector(item.baseColor, 4, `${pointer}/baseColor`, diagnostics, [1, 1, 1, 1]) as [number, number, number, number], ...(item.textureId === undefined ? {} : { textureId: text(item.textureId, `${pointer}/textureId`, diagnostics) }), metallic: finite(item.metallic, `${pointer}/metallic`, diagnostics, 0, 0, 1), roughness: finite(item.roughness, `${pointer}/roughness`, diagnostics, 1, 0, 1), doubleSided: bool(item.doubleSided, `${pointer}/doubleSided`, diagnostics) };
  });
  const scenes = parseArray(raw.scenes, "/extensions/hyperfocus3D/scenes", diagnostics, (value, pointer) => parseScene(value, pointer, diagnostics));
  const audioRaw = record(raw.audio); if (!audioRaw) invalidObject("/extensions/hyperfocus3D/audio", diagnostics);
  else exact(audioRaw, ["cues", "policy"], "/extensions/hyperfocus3D/audio", diagnostics);
  const saveRaw = record(raw.save); if (!saveRaw) invalidObject("/extensions/hyperfocus3D/save", diagnostics);
  else exact(saveRaw, ["maxBytes", "restoreOnBoot", "slot"], "/extensions/hyperfocus3D/save", diagnostics);
  if (!budgets || !audioRaw || !saveRaw) return undefined;
  unique(meshes, "mesh", diagnostics); unique(textures, "texture", diagnostics); unique(materials, "material", diagnostics); unique(scenes, "scene", diagnostics);
  if (meshes.length > budgets.meshes) diagnostics.push(error("mesh-budget", "/extensions/hyperfocus3D/meshes", `Mesh declarations exceed budget ${budgets.meshes}.`));
  if (textures.length > budgets.textures) diagnostics.push(error("texture-budget", "/extensions/hyperfocus3D/textures", `Texture declarations exceed budget ${budgets.textures}.`));
  const textureBytes = textures.reduce((total, texture) => total + texture.width * texture.height * 4, 0);
  if (textureBytes > budgets.textureBytes) diagnostics.push(error("texture-byte-budget", "/extensions/hyperfocus3D/budgets/textureBytes", `Declared RGBA8 textures require ${textureBytes} bytes and exceed budget ${budgets.textureBytes}.`));
  if (materials.length > budgets.materials) diagnostics.push(error("material-budget", "/extensions/hyperfocus3D/materials", `Material declarations exceed budget ${budgets.materials}.`));
  const meshIds = new Set(meshes.map((item) => item.id)), textureIds = new Set(textures.map((item) => item.id)), materialIds = new Set(materials.map((item) => item.id));
  for (let index = 0; index < materials.length; index += 1) if (materials[index].textureId && !textureIds.has(materials[index].textureId!)) diagnostics.push(error("texture-reference", `/extensions/hyperfocus3D/materials/${index}/textureId`, `Unknown texture ${materials[index].textureId}.`));
  for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex += 1) {
    const scene = scenes[sceneIndex]; unique(scene.entities, "entity", diagnostics, `/extensions/hyperfocus3D/scenes/${sceneIndex}/entities`); unique(scene.lights, "light", diagnostics, `/extensions/hyperfocus3D/scenes/${sceneIndex}/lights`);
    if (scene.entities.length > budgets.entities) diagnostics.push(error("entity-budget", `/extensions/hyperfocus3D/scenes/${sceneIndex}/entities`, `Entity count exceeds budget ${budgets.entities}.`));
    if (scene.lights.length > budgets.lights) diagnostics.push(error("light-budget", `/extensions/hyperfocus3D/scenes/${sceneIndex}/lights`, `Light count exceeds budget ${budgets.lights}.`));
    const ids = new Set(scene.entities.map((item) => item.id));
    if (scene.camera.followEntityId && !ids.has(scene.camera.followEntityId)) diagnostics.push(error("camera-follow-reference", `/extensions/hyperfocus3D/scenes/${sceneIndex}/camera/followEntityId`, `Unknown entity ${scene.camera.followEntityId}.`));
    if (scene.camera.far <= scene.camera.near) diagnostics.push(error("camera-range", `/extensions/hyperfocus3D/scenes/${sceneIndex}/camera/far`, "Camera far must be greater than near."));
    for (let entityIndex = 0; entityIndex < scene.entities.length; entityIndex += 1) {
      const entity = scene.entities[entityIndex], base = `/extensions/hyperfocus3D/scenes/${sceneIndex}/entities/${entityIndex}`;
      if (!meshIds.has(entity.meshId)) diagnostics.push(error("mesh-reference", `${base}/meshId`, `Unknown mesh ${entity.meshId}.`));
      if (!materialIds.has(entity.materialId)) diagnostics.push(error("material-reference", `${base}/materialId`, `Unknown material ${entity.materialId}.`));
    }
  }
  const activeSceneId = text(raw.activeSceneId, "/extensions/hyperfocus3D/activeSceneId", diagnostics);
  if (!scenes.some((scene) => scene.id === activeSceneId)) diagnostics.push(error("active-scene-reference", "/extensions/hyperfocus3D/activeSceneId", `Unknown 3D scene ${activeSceneId}.`));
  const cues = parseArray(audioRaw.cues, "/extensions/hyperfocus3D/audio/cues", diagnostics, (value, pointer) => { const id = text(value, pointer, diagnostics); if (!assetById.has(id)) diagnostics.push(error("asset-reference", pointer, `Unknown audio asset ${id}.`)); return id; });
  return {
    version: 1, activeSceneId, budgets, meshes, textures, materials, scenes,
    audio: { policy: choice(audioRaw.policy, ["gesture-unlock", "disabled"], "/extensions/hyperfocus3D/audio/policy", diagnostics, "disabled"), cues },
    save: { restoreOnBoot: bool(saveRaw.restoreOnBoot, "/extensions/hyperfocus3D/save/restoreOnBoot", diagnostics), slot: text(saveRaw.slot, "/extensions/hyperfocus3D/save/slot", diagnostics), maxBytes: uint(saveRaw.maxBytes, "/extensions/hyperfocus3D/save/maxBytes", diagnostics, 1024, 4 * 1024 * 1024) },
  };
}

function parseBudgets(value: unknown, diagnostics: Hyperfocus3DDiagnostic[]): Hyperfocus3DBudgets | undefined {
  const item = record(value); if (!item) return invalidObject("/extensions/hyperfocus3D/budgets", diagnostics);
  const keys = Object.keys(HARD) as Array<keyof Hyperfocus3DBudgets>; exact(item, [...keys].sort(), "/extensions/hyperfocus3D/budgets", diagnostics);
  return Object.fromEntries(keys.map((key) => [key, uint(item[key], `/extensions/hyperfocus3D/budgets/${key}`, diagnostics, 1, HARD[key])])) as unknown as Hyperfocus3DBudgets;
}

function parseScene(value: unknown, pointer: string, diagnostics: Hyperfocus3DDiagnostic[]): Hyperfocus3DDeclaration["scenes"][number] {
  const item = record(value); if (!item) return invalidObject(pointer, diagnostics) as never;
  exact(item, ["camera", "entities", "id", "lights"], pointer, diagnostics);
  const camera = record(item.camera); if (!camera) invalidObject(`${pointer}/camera`, diagnostics); else exact(camera, ["far", "followEntityId", "followOffset", "fovYRadians", "near", "position", "target", "up"], `${pointer}/camera`, diagnostics, ["followEntityId", "followOffset"]);
  const c = camera ?? {};
  const entities = parseArray(item.entities, `${pointer}/entities`, diagnostics, (input, p) => {
    const entity = record(input); if (!entity) return invalidObject(p, diagnostics) as never;
    exact(entity, ["animation", "controller", "id", "materialId", "meshId", "physics", "position", "rotationY", "scale"], p, diagnostics, ["animation", "controller", "physics"]);
    const controller = entity.controller === undefined ? undefined : record(entity.controller); if (entity.controller !== undefined && !controller) invalidObject(`${p}/controller`, diagnostics); else if (controller) exact(controller, ["speed"], `${p}/controller`, diagnostics);
    const animation = entity.animation === undefined ? undefined : record(entity.animation); if (entity.animation !== undefined && !animation) invalidObject(`${p}/animation`, diagnostics); else if (animation) exact(animation, ["kind", "radiansPerSecond"], `${p}/animation`, diagnostics);
    const physics = entity.physics === undefined ? undefined : record(entity.physics); if (entity.physics !== undefined && !physics) invalidObject(`${p}/physics`, diagnostics); else if (physics) exact(physics, ["continuous", "gravityScale", "shape", "type"], `${p}/physics`, diagnostics);
    const scale = vector(entity.scale, 3, `${p}/scale`, diagnostics, [1, 1, 1]) as [number, number, number];
    if (physics && scale.some((value) => value === 0)) diagnostics.push(error("physics-scale", `${p}/scale`, "A physics entity requires non-zero scale on every axis."));
    return { id: text(entity.id, `${p}/id`, diagnostics), meshId: text(entity.meshId, `${p}/meshId`, diagnostics), materialId: text(entity.materialId, `${p}/materialId`, diagnostics), position: vector(entity.position, 3, `${p}/position`, diagnostics, [0, 0, 0]) as [number, number, number], scale, rotationY: finite(entity.rotationY, `${p}/rotationY`, diagnostics, 0), ...(controller ? { controller: { speed: finite(controller.speed, `${p}/controller/speed`, diagnostics, 1, 0, 1000) } } : {}), ...(animation ? { animation: { kind: choice(animation.kind, ["rotate-y"], `${p}/animation/kind`, diagnostics, "rotate-y"), radiansPerSecond: finite(animation.radiansPerSecond, `${p}/animation/radiansPerSecond`, diagnostics, 1, -100, 100) } } : {}), ...(physics ? { physics: { type: choice(physics.type, ["static", "dynamic"], `${p}/physics/type`, diagnostics, "static"), shape: choice(physics.shape, ["box", "sphere"], `${p}/physics/shape`, diagnostics, "box"), gravityScale: finite(physics.gravityScale, `${p}/physics/gravityScale`, diagnostics, 1, 0, 100), continuous: bool(physics.continuous, `${p}/physics/continuous`, diagnostics) } } : {}) };
  });
  const lights = parseArray(item.lights, `${pointer}/lights`, diagnostics, (input, p) => {
    const light = record(input); if (!light) return invalidObject(p, diagnostics) as never;
    exact(light, ["color", "direction", "id", "intensity", "kind", "position", "range"], p, diagnostics, ["direction", "position", "range"]);
    const kind = choice(light.kind, ["ambient", "directional", "point", "spot"], `${p}/kind`, diagnostics, "ambient");
    const direction = light.direction === undefined ? undefined : vector(light.direction, 3, `${p}/direction`, diagnostics, [0, -1, 0]) as [number, number, number];
    if ((kind === "directional" || kind === "spot") && (!direction || Math.hypot(...direction) === 0)) diagnostics.push(error("light-direction", `${p}/direction`, `${kind} light requires a non-zero direction.`));
    return { id: text(light.id, `${p}/id`, diagnostics), kind, color: vector(light.color, 3, `${p}/color`, diagnostics, [1, 1, 1]) as [number, number, number], intensity: finite(light.intensity, `${p}/intensity`, diagnostics, 1, 0), ...(light.position === undefined ? {} : { position: vector(light.position, 3, `${p}/position`, diagnostics, [0, 0, 0]) as [number, number, number] }), ...(direction === undefined ? {} : { direction }), ...(light.range === undefined ? {} : { range: finite(light.range, `${p}/range`, diagnostics, 10, 0) }) };
  });
  return { id: text(item.id, `${pointer}/id`, diagnostics), camera: { position: vector(c.position, 3, `${pointer}/camera/position`, diagnostics, [0, 4, 8]) as [number, number, number], target: vector(c.target, 3, `${pointer}/camera/target`, diagnostics, [0, 0, 0]) as [number, number, number], up: vector(c.up, 3, `${pointer}/camera/up`, diagnostics, [0, 1, 0]) as [number, number, number], fovYRadians: finite(c.fovYRadians, `${pointer}/camera/fovYRadians`, diagnostics, Math.PI / 3, 0.01, Math.PI - 0.01), near: finite(c.near, `${pointer}/camera/near`, diagnostics, 0.1, 0.0001), far: finite(c.far, `${pointer}/camera/far`, diagnostics, 100, 0.001), ...(c.followEntityId === undefined ? {} : { followEntityId: text(c.followEntityId, `${pointer}/camera/followEntityId`, diagnostics) }), ...(c.followOffset === undefined ? {} : { followOffset: vector(c.followOffset, 3, `${pointer}/camera/followOffset`, diagnostics, [0, 4, 8]) as [number, number, number] }) }, lights, entities };
}

function validateSnapshot(value: Hyperfocus3DSnapshot, scene: Hyperfocus3DDeclaration["scenes"][number]) {
  if (!value || value.version !== 1 || value.sceneId !== scene.id || !Number.isSafeInteger(value.tick) || value.tick < 0 || !Array.isArray(value.entities) || value.entities.length !== scene.entities.length) throw new Error("3D save snapshot does not match the active scene.");
  const expected = new Set(scene.entities.map((item) => item.id));
  for (const item of value.entities) if (!expected.delete(item?.id) || !Array.isArray(item.position) || item.position.length !== 3 || item.position.some((part) => !Number.isFinite(part)) || !Number.isFinite(item.rotationY)) throw new Error("3D save snapshot contains invalid entity state.");
}

function setRotationY(scene: BoundedScene3D, transform: number, radians: number) { scene.transforms.setRotationQuaternion(transform, 0, Math.sin(radians / 2), 0, Math.cos(radians / 2)); }
function preflightFailure(diagnostics: readonly Hyperfocus3DDiagnostic[]) { const failure = new Error(`Hyperfocus 3D preflight failed:\n${diagnostics.map((item) => `- ${item.pointer || "/"}: ${item.message}`).join("\n")}`); Object.assign(failure, { diagnostics }); return failure; }
function error(code: string, pointer: string, message: string): Hyperfocus3DDiagnostic { return { severity: "error", code, pointer, message }; }
function record(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function invalidObject(pointer: string, diagnostics: Hyperfocus3DDiagnostic[]): undefined { diagnostics.push(error("object", pointer, "Expected an object.")); return undefined; }
function exact(value: Record<string, unknown>, required: readonly string[], pointer: string, diagnostics: Hyperfocus3DDiagnostic[], optional: readonly string[] = []) { const allowed = new Set([...required, ...optional]); for (const key of Object.keys(value)) if (!allowed.has(key)) diagnostics.push(error("unknown-field", `${pointer}/${escapePointer(key)}`, `Unknown field ${key}.`)); for (const key of required) if (!optional.includes(key) && !(key in value)) diagnostics.push(error("missing-field", `${pointer}/${escapePointer(key)}`, `Required field ${key} is missing.`)); }
function text(value: unknown, pointer: string, diagnostics: Hyperfocus3DDiagnostic[]): string { if (typeof value !== "string" || !value || new TextEncoder().encode(value).length > 256 || /[\u0000-\u001f\u007f]/.test(value)) { diagnostics.push(error("text", pointer, "Expected non-empty bounded text without control characters.")); return ""; } return value; }
function uint(value: unknown, pointer: string, diagnostics: Hyperfocus3DDiagnostic[], min: number, max: number): number { if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) { diagnostics.push(error("integer", pointer, `Expected an integer from ${min} through ${max}.`)); return min; } return value as number; }
function finite(value: unknown, pointer: string, diagnostics: Hyperfocus3DDiagnostic[], fallback: number, min = -Number.MAX_VALUE, max = Number.MAX_VALUE): number { if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) { diagnostics.push(error("number", pointer, `Expected a finite number from ${min} through ${max}.`)); return fallback; } return value; }
function bool(value: unknown, pointer: string, diagnostics: Hyperfocus3DDiagnostic[]): boolean { if (typeof value !== "boolean") { diagnostics.push(error("boolean", pointer, "Expected a boolean.")); return false; } return value; }
function choice<const T extends string>(value: unknown, choices: readonly T[], pointer: string, diagnostics: Hyperfocus3DDiagnostic[], fallback: T): T { if (typeof value !== "string" || !choices.includes(value as T)) { diagnostics.push(error("enum", pointer, `Expected one of: ${choices.join(", ")}.`)); return fallback; } return value as T; }
function vector(value: unknown, length: number, pointer: string, diagnostics: Hyperfocus3DDiagnostic[], fallback: number[]): number[] { if (!Array.isArray(value) || value.length !== length) { diagnostics.push(error("vector", pointer, `Expected an array of ${length} finite numbers.`)); return fallback; } return value.map((part, index) => finite(part, `${pointer}/${index}`, diagnostics, fallback[index])); }
function parseArray<T>(value: unknown, pointer: string, diagnostics: Hyperfocus3DDiagnostic[], parse: (value: unknown, pointer: string) => T | undefined): T[] { if (!Array.isArray(value)) { diagnostics.push(error("array", pointer, "Expected an array.")); return []; } if (value.length > 100_000) { diagnostics.push(error("array-limit", pointer, "Array exceeds the hard item limit 100000.")); return []; } const result: T[] = []; value.forEach((item, index) => { const parsed = parse(item, `${pointer}/${index}`); if (parsed !== undefined) result.push(parsed); }); return result; }
function unique(items: readonly { id: string }[], label: string, diagnostics: Hyperfocus3DDiagnostic[], pointer = `/extensions/hyperfocus3D/${label}s`) { const ids = new Set<string>(); items.forEach((item, index) => { if (ids.has(item.id)) diagnostics.push(error(`${label}-id-duplicate`, `${pointer}/${index}/id`, `Duplicate ${label} id ${item.id}.`)); ids.add(item.id); }); }
function escapePointer(value: string) { return value.replace(/~/g, "~0").replace(/\//g, "~1"); }
function message(value: unknown) { return value instanceof Error ? value.message : String(value); }
