import { cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runConsumerCommand } from "./peers.ts";
import { bunCommand, rootDir } from "./core.ts";

export async function verifyWebGlConsumer(consumerDir: string) {
  cpSync(join(rootDir, "src/test-support/webgl2.ts"), join(consumerDir, "webgl2-fixture.ts"));
  writeFileSync(join(consumerDir, "render-3d-webgl2-consumer.ts"), webGlConsumerSource);
  console.log((await runConsumerCommand([bunCommand, "./render-3d-webgl2-consumer.ts"], consumerDir)).trim());
}

const webGlConsumerSource = String.raw`
import { createWebGl2Renderer3D, supportsWebGl2Renderer3D } from "@hyperfocus/engine/render/3d-webgl2";
import { createBoundedScene3D, createRenderCommandBuffer3D } from "@hyperfocus/engine/render/3d-scene";
import { createMat4 } from "@hyperfocus/engine/render/3d-core";
import { createFakeWebGl2, createFakeCanvas } from "./webgl2-fixture.js";
if (typeof createWebGl2Renderer3D !== 'function' || supportsWebGl2Renderer3D() !== false) throw new Error('unexpected first-party WebGL2 surface');
for (const kind of ['static', 'skin', 'morph']) {
const gl = createFakeWebGl2(), canvas = createFakeCanvas(gl);
const scene = createBoundedScene3D({ transforms: 2, instances: 2, meshes: 1, materials: 1, lights: 0, textures: 1, textureBytes: 4, skeletons: 1, jointsPerSkeleton: 1 });
const positions = new Float32Array([-.5, -.5, 0, .5, -.5, 0, 0, .5, 0]);
const mesh = scene.registerMesh({ positions, normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), uvs: new Float32Array([0, 0, 1, 0, .5, 1]), indices: new Uint16Array([0, 1, 2]), ...(kind === 'skin' ? { joints: new Uint16Array(12), weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]) } : {}), ...(kind === 'morph' ? { morphPositions: [new Float32Array(9).fill(.1)], morphWeights: new Float32Array([.25]) } : {}) });
const texture = scene.registerTexture({ width: 1, height: 1, pixels: new Uint8Array([255, 255, 255, 255]) });
const material = scene.createMaterial({ shading: 'lit', baseColorTexture: texture, skinning: kind === 'skin' });
const skeleton = kind === 'skin' ? scene.createSkeleton(1, createMat4()) : undefined;
for (const x of [0, 100]) { const transform = scene.transforms.create(); scene.transforms.setPosition(transform, x, 0, 0); scene.createInstance({ mesh, material, transform, skeleton }); }
const commands = scene.compile(createRenderCommandBuffer3D({ commands: 2, instances: 2, lights: 0 }));
const renderer = createWebGl2Renderer3D({ canvas, context: gl, scene, maxInstances: 2, cameraCulling: true, directionalShadowMapSize: 64 });
try {
const first = renderer.render(commands, createMat4(), { shadowViewProjection: createMat4() });
if (first.instances !== (kind === 'static' ? 1 : 2) || first.meshUploads !== 1 || first.shadowDrawCalls !== 1) throw new Error('installed WebGL packet/mesh path failed: ' + kind);
if (renderer.render(commands, createMat4()).meshUploads !== 0) throw new Error('installed WebGL repeated mesh upload');
canvas.dispatch('webglcontextlost'); canvas.dispatch('webglcontextrestored');
if (renderer.render(commands, createMat4()).meshUploads !== 1) throw new Error('installed WebGL restore lost mesh data');
} finally { renderer.dispose(); }
if ([...canvas.listeners.values()].some(listeners => listeners.size) || gl.deletedBuffers.length === 0) throw new Error('installed WebGL cleanup failed');
}
console.log(JSON.stringify({ packedWebGlCases: 3, culling: true, skin: true, morph: true, restore: true, cleanup: true }));
`;
