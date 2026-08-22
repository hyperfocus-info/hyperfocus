import { describe, expect, test } from "bun:test";
import { createHyperfocus3DRuntime, type PortableAsset3D } from "./runtime-3d.ts";

describe("portable Hyperfocus 3D runtime", () => {
  test("cooks canonical glTF/RGBA assets and deterministically moves, animates and restores", async () => {
    const { project, assets } = fixture();
    const runtime = await createHyperfocus3DRuntime(project, assets);
    expect(runtime.scene.meshCount).toBe(1);
    expect(runtime.scene.textureCount).toBe(1);
    expect(runtime.compile()).toMatchObject({ instanceCount: 2, lightCount: 2 });
    const initial = runtime.snapshot();
    for (let tick = 0; tick < 60; tick += 1) runtime.step(["move-right"]);
    const moved = runtime.snapshot();
    expect(moved.entities.find((item) => item.id === "actor")!.position[0]).toBeCloseTo(2);
    expect(moved.entities.find((item) => item.id === "spinner")!.rotationY).toBeCloseTo(1);
    expect(runtime.restore(initial)).toEqual(initial);
    expect(runtime.viewProjection(16 / 9)).toHaveLength(16);
  });

  test("reports exact pointers for archive and scene references", async () => {
    const { project, assets } = fixture();
    project.extensions.hyperfocus3D.scenes[0].entities[0].meshId = "missing";
    assets[1].bytes = new Uint8Array(3);
    await expect(createHyperfocus3DRuntime(project, assets)).rejects.toThrow("/extensions/hyperfocus3D/textures/0/assetId");
    await expect(createHyperfocus3DRuntime(project, assets)).rejects.toThrow("/extensions/hyperfocus3D/scenes/0/entities/0/meshId");
  });

  test("does not resolve network glTF buffers", async () => {
    const { project, assets } = fixture();
    project.extensions.hyperfocus3D.meshes[0].buffers[0].uri = "https://example.invalid/mesh.bin";
    await expect(createHyperfocus3DRuntime(project, assets)).rejects.toThrow("safe relative logical name");
  });

  test("runs declared first-party rigid bodies inside the portable fixed step", async () => {
    const { project, assets } = fixture();
    const entities = project.extensions.hyperfocus3D.scenes[0].entities;
    entities[0].physics = { type: "dynamic", shape: "box", gravityScale: 1, continuous: false };
    entities.push({ id: "floor", meshId: "triangle", materialId: "surface", position: [0, -1.25, 0], scale: [5, 0.25, 5], rotationY: 0, physics: { type: "static", shape: "box", gravityScale: 0, continuous: false } });
    const runtime = await createHyperfocus3DRuntime(project, assets);
    for (let tick = 0; tick < 120; tick += 1) runtime.step(["move-right"]);
    const actor = runtime.snapshot().entities.find((item) => item.id === "actor")!;
    expect(actor.position[0]).toBeGreaterThan(3.5);
    expect(actor.position[1]).toBeGreaterThan(-0.05);
    expect(runtime.physics.diagnostics.steps).toBe(120);
    expect(runtime.physics.contactCount()).toBeGreaterThan(0);
  });
});

function fixture(): { project: any; assets: PortableAsset3D[] } {
  const positions = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const uvs = new Float32Array([0, 0, 1, 0, 0.5, 1]);
  const indices = new Uint16Array([0, 1, 2]);
  const bytes = new Uint8Array(positions.byteLength + normals.byteLength + uvs.byteLength + indices.byteLength);
  let offset = 0;
  for (const source of [new Uint8Array(positions.buffer), new Uint8Array(normals.buffer), new Uint8Array(uvs.buffer), new Uint8Array(indices.buffer)]) { bytes.set(source, offset); offset += source.byteLength; }
  const gltf = {
    asset: { version: "2.0" }, buffers: [{ uri: "mesh.bin", byteLength: bytes.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: normals.byteLength },
      { buffer: 0, byteOffset: positions.byteLength + normals.byteLength, byteLength: uvs.byteLength },
      { buffer: 0, byteOffset: positions.byteLength + normals.byteLength + uvs.byteLength, byteLength: indices.byteLength },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    meshes: [{ name: "triangle", primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, mode: 4 }] }],
  };
  const extension = {
    version: 1, activeSceneId: "level",
    budgets: { meshes: 4, vertices: 100, indices: 300, textures: 4, textureBytes: 1024, materials: 4, lights: 4, entities: 8 },
    meshes: [{ id: "triangle", assetId: "gltf", primitive: 0, buffers: [{ uri: "mesh.bin", assetId: "bin" }] }],
    textures: [{ id: "checker", assetId: "rgba", width: 2, height: 2, filter: "nearest", wrap: "repeat", flipY: false }],
    materials: [{ id: "surface", shading: "lit", baseColor: [1, 1, 1, 1], textureId: "checker", metallic: 0, roughness: 1, doubleSided: true }],
    scenes: [{ id: "level", camera: { position: [0, 4, 7], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: 0.1, far: 100, followEntityId: "actor", followOffset: [0, 4, 7] }, lights: [{ id: "ambient", kind: "ambient", color: [1, 1, 1], intensity: 0.4 }, { id: "sun", kind: "directional", color: [1, 0.9, 0.8], intensity: 0.8, direction: [-1, -2, -1] }], entities: [{ id: "actor", meshId: "triangle", materialId: "surface", position: [0, 0, 0], scale: [1, 1, 1], rotationY: 0, controller: { speed: 2 } }, { id: "spinner", meshId: "triangle", materialId: "surface", position: [2, 0, 0], scale: [1, 1, 1], rotationY: 0, animation: { kind: "rotate-y", radiansPerSecond: 1 } }] }],
    audio: { policy: "gesture-unlock", cues: [] }, save: { restoreOnBoot: true, slot: "auto", maxBytes: 65536 },
  };
  return { project: { extensions: { hyperfocus3D: extension } }, assets: [{ id: "gltf", mimeType: "model/gltf+json", bytes: new TextEncoder().encode(JSON.stringify(gltf)) }, { id: "rgba", mimeType: "application/octet-stream", bytes: new Uint8Array([255, 80, 40, 255, 40, 255, 170, 255, 30, 60, 160, 255, 255, 220, 80, 255]) }, { id: "bin", mimeType: "application/octet-stream", bytes }] };
}
