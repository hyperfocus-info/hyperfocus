import { readHyperfocus3DDeclaration, type Hyperfocus3DDeclaration } from "@hyperfocus/engine/project/runtime-3d";
import { uniqueId, type EditorProject } from "@hyperfocus/engine/project";

export type Editor3DEntity = Hyperfocus3DDeclaration["scenes"][number]["entities"][number];

export function readEditor3DDeclaration(project: EditorProject): Hyperfocus3DDeclaration | undefined {
  const declaration = readHyperfocus3DDeclaration(project);
  if (declaration && project.extensions) project.extensions.hyperfocus3D = declaration;
  return declaration;
}

export function activeEditor3DScene(project: EditorProject): Hyperfocus3DDeclaration["scenes"][number] {
  const declaration = readEditor3DDeclaration(project);
  if (!declaration) throw new Error("This project does not contain a Hyperfocus 3D declaration.");
  const scene = declaration.scenes.find((candidate) => candidate.id === declaration.activeSceneId);
  if (!scene) throw new Error(`Active 3D scene does not exist: ${declaration.activeSceneId}`);
  return scene;
}

export function createEditor3DEntity(project: EditorProject, options: Partial<Editor3DEntity> & { id?: string } = {}): string {
  const declaration = requiredDeclaration(project);
  const scene = activeEditor3DScene(project);
  const meshId = options.meshId ?? declaration.meshes[0]?.id;
  const materialId = options.materialId ?? declaration.materials[0]?.id;
  if (!meshId) throw new Error("Import or declare a mesh before adding a 3D object.");
  if (!materialId) throw new Error("Create a material before adding a 3D object.");
  if (!declaration.meshes.some((mesh) => mesh.id === meshId)) throw new Error(`Unknown 3D mesh: ${meshId}`);
  if (!declaration.materials.some((material) => material.id === materialId)) throw new Error(`Unknown 3D material: ${materialId}`);
  const id = unique3DId(scene.entities.map((entity) => entity.id), options.id ?? "object");
  scene.entities.push({
    id,
    meshId,
    materialId,
    position: options.position ? [...options.position] : [0, 0, 0],
    scale: options.scale ? [...options.scale] : [1, 1, 1],
    rotationY: options.rotationY ?? 0,
    ...(options.controller ? { controller: structuredClone(options.controller) } : {}),
    ...(options.animation ? { animation: structuredClone(options.animation) } : {}),
    ...(options.physics ? { physics: structuredClone(options.physics) } : {}),
  });
  return id;
}

export function duplicateEditor3DEntity(project: EditorProject, entityId: string): string {
  const scene = activeEditor3DScene(project);
  const source = scene.entities.find((entity) => entity.id === entityId);
  if (!source) throw new Error(`3D object does not exist: ${entityId}`);
  return createEditor3DEntity(project, { ...structuredClone(source), id: `${source.id}-copy`, position: [source.position[0] + 0.5, source.position[1], source.position[2] + 0.5] });
}

export function removeEditor3DEntity(project: EditorProject, entityId: string): void {
  const scene = activeEditor3DScene(project);
  const before = scene.entities.length;
  scene.entities = scene.entities.filter((entity) => entity.id !== entityId);
  if (scene.entities.length === before) throw new Error(`3D object does not exist: ${entityId}`);
  if (scene.camera.followEntityId === entityId) {
    delete scene.camera.followEntityId;
    delete scene.camera.followOffset;
  }
}

export function placeImportedGltf(project: EditorProject, assetId: string): string {
  const declaration = requiredDeclaration(project);
  const asset = project.assets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new Error(`Asset does not exist: ${assetId}`);
  if (!new Set(["model/gltf+json", "application/json"]).has(asset.mimeType)) {
    throw new Error(`${asset.name} is not portable glTF JSON. Convert GLB to .gltf plus imported buffers before placing it.`);
  }
  let mesh = declaration.meshes.find((candidate) => candidate.assetId === asset.id && candidate.primitive === 0);
  if (!mesh) {
    mesh = { id: unique3DId(declaration.meshes.map((candidate) => candidate.id), asset.name.replace(/\.[^.]+$/, "") || "mesh"), assetId, primitive: 0, buffers: [] };
    declaration.meshes.push(mesh);
  }
  return createEditor3DEntity(project, { id: asset.name.replace(/\.[^.]+$/, "") || "model", meshId: mesh.id });
}

export function createEditor3DMaterial(project: EditorProject, requestedId = "material"): string {
  const declaration = requiredDeclaration(project);
  const id = unique3DId(declaration.materials.map((material) => material.id), requestedId);
  declaration.materials.push({ id, shading: "lit", baseColor: [0.75, 0.82, 0.86, 1], metallic: 0, roughness: 0.75, doubleSided: false });
  return id;
}

export function createEditor3DLight(project: EditorProject, kind: "ambient" | "directional" | "point" | "spot" = "point"): string {
  const scene = activeEditor3DScene(project);
  const id = unique3DId(scene.lights.map((light) => light.id), `${kind}-light`);
  const direction: [number, number, number] = [0, -1, 0];
  const position: [number, number, number] = [0, 3, 0];
  scene.lights.push({
    id,
    kind,
    color: [1, 1, 1],
    intensity: kind === "ambient" ? 0.3 : 1,
    ...(kind === "directional" || kind === "spot" ? { direction } : {}),
    ...(kind === "point" || kind === "spot" ? { position, range: 12 } : {}),
  });
  return id;
}

function requiredDeclaration(project: EditorProject) {
  const declaration = readEditor3DDeclaration(project);
  if (!declaration) throw new Error("This project does not contain a Hyperfocus 3D declaration.");
  return declaration;
}

function unique3DId(existing: readonly string[], requested: string) {
  const root = requested.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || uniqueId("object");
  const ids = new Set(existing);
  if (!ids.has(root)) return root;
  for (let suffix = 2; suffix < 100_000; suffix += 1) if (!ids.has(`${root}-${suffix}`)) return `${root}-${suffix}`;
  throw new Error(`Could not create a unique 3D id for ${requested}.`);
}
