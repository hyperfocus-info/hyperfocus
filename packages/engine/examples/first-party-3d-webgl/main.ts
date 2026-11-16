import {
  createFrustumPlanes3D,
  createMat4,
  composeMat4FromTrs,
  extractFrustumPlanes3D,
  lookAtViewMat4,
  multiplyMat4,
  orthographicMat4,
  perspectiveMat4
} from "@hyperfocus/engine/render/3d-core";
import { createFixedStepLoop } from "@hyperfocus/engine";
import { createBoundedScene3D, createRenderCommandBuffer3D } from "@hyperfocus/engine/render/3d-scene";
import { createWebGl2Renderer3D } from "@hyperfocus/engine/render/3d-webgl2";

type AcceptanceState = {
  ready: boolean;
  error?: string;
  snapshot(): {
    draws: number; instances: number; triangles: number; width: number; height: number; generation: number;
    textureUploads: number; ambientLights: number; directionalLights: number; shadowDraws: number; outlineDraws: number;
    paletteUploads: number; skinnedDraws: number; skinnedInstances: number; pose: number;
  };
  contextRoundTrip(): Promise<{ supported: boolean; generation: number }>;
};

declare global {
  var __firstParty3D: AcceptanceState;
}

const browserState = window;
function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Acceptance fixture is missing ${selector}.`);
  return element;
}

const canvas = requiredElement<HTMLCanvasElement>("#view");
const status = requiredElement<HTMLElement>("#status");

const cubePositions = new Float32Array([
  -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
  -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1
]);
const normalScale = 1 / Math.sqrt(3);
const cubeNormals = new Float32Array(cubePositions.length);
for (let index = 0; index < cubePositions.length; index += 1) cubeNormals[index] = Math.sign(cubePositions[index]) * normalScale;
const cubeMorph = new Float32Array(cubePositions.length), cubeMorphWeights = new Float32Array(1);
for (let vertex = 0; vertex < cubePositions.length / 3; vertex += 1) if (cubePositions[vertex * 3 + 1]! > 0) cubeMorph[vertex * 3 + 1] = 0.18;
const scene = createBoundedScene3D({
  transforms: 8, meshes: 3, materials: 4, lights: 2, instances: 8, textures: 1, textureBytes: 64,
  skeletons: 1, jointsPerSkeleton: 2
});
const cube = scene.registerMesh({
  label: "cube",
  positions: cubePositions,
  normals: cubeNormals,
  uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]),
  morphPositions: [cubeMorph],
  morphWeights: cubeMorphWeights,
  indices: new Uint16Array([
    0, 1, 2, 0, 2, 3, 1, 5, 6, 1, 6, 2,
    5, 4, 7, 5, 7, 6, 4, 0, 3, 4, 3, 7,
    3, 2, 6, 3, 6, 7, 4, 5, 1, 4, 1, 0
  ])
});
const checkerPixels = new Uint8Array(64);
for (let pixel = 0; pixel < 16; pixel += 1) {
  const x = pixel % 4, y = Math.floor(pixel / 4), bright = (x + y) % 2 === 0, offset = pixel * 4;
  checkerPixels[offset] = bright ? 255 : 35;
  checkerPixels[offset + 1] = bright ? 196 : 55;
  checkerPixels[offset + 2] = bright ? 70 : 115;
  checkerPixels[offset + 3] = bright || (x !== 1 && y !== 2) ? 255 : 0;
}
const checker = scene.registerTexture({ width: 4, height: 4, pixels: checkerPixels, filter: "nearest", wrapU: "repeat", wrapV: "repeat" });
const ribbon = scene.registerMesh({
  label: "two-joint ribbon",
  positions: new Float32Array([-0.65, 0, 0, 0.65, 0, 0, -0.65, 0.8, 0, 0.65, 0.8, 0, -0.65, 1.6, 0, 0.65, 1.6, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
  uvs: new Float32Array([0, 0, 1, 0, 0, 0.5, 1, 0.5, 0, 1, 1, 1]),
  joints: new Uint8Array([
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 1, 0, 0, 0, 1, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0
  ]),
  weights: new Float32Array([
    1, 0, 0, 0, 1, 0, 0, 0,
    0.5, 0.5, 0, 0, 0.5, 0.5, 0, 0,
    1, 0, 0, 0, 1, 0, 0, 0
  ]),
  indices: new Uint16Array([0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4])
});
const blue = scene.createMaterial({ shading: "lit", shader: "toon", baseColor: [0.16, 0.57, 0.95, 1], roughness: 0.7, toon: { bands: 3, shadowColor: [0.1, 0.18, 0.42], rimColor: [0.7, 0.95, 1], rimStrength: 0.42, outlineColor: [0.01, 0.015, 0.04, 1], outlineWidth: 0.006 } });
const coral = scene.createMaterial({ shading: "lit", baseColor: [1, 1, 1, 1], baseColorTexture: checker, alphaMode: "mask", alphaCutoff: 0.4 });
const ground = scene.createMaterial({ shading: "lit", baseColor: [0.2, 0.28, 0.38, 1], roughness: 1 });
const animated = scene.createMaterial({ shading: "lit", skinning: true, doubleSided: true, baseColor: [0.35, 0.95, 0.54, 1] });
scene.createLight({ kind: "ambient", color: [0.72, 0.8, 1], intensity: 0.34 });
scene.createLight({ kind: "directional", direction: [-0.7, -1, -0.45], color: [1, 0.88, 0.72], intensity: 1.15 });

const left = scene.transforms.create(), right = scene.transforms.create(), rear = scene.transforms.create(), floor = scene.transforms.create();
const ribbonTransform = scene.transforms.create();
scene.transforms.setPosition(left, -1.45, 0, 0);
scene.transforms.setPosition(right, 1.45, 0.2, -0.5);
scene.transforms.setScale(right, 0.72, 1.2, 0.72);
scene.transforms.setPosition(rear, 0, -0.25, -2.3);
scene.transforms.setScale(rear, 0.85, 0.85, 0.85);
scene.transforms.setPosition(floor, 0, -1.35, -0.7);
scene.transforms.setScale(floor, 4.2, 0.12, 4.2);
scene.transforms.setPosition(ribbonTransform, 2.9, -1.2, -1.35);
scene.transforms.setRotationQuaternion(ribbonTransform, 0, Math.sin(-0.35), 0, Math.cos(-0.35));
scene.createInstance({ mesh: cube, material: blue, transform: left });
scene.createInstance({ mesh: cube, material: coral, transform: right });
scene.createInstance({ mesh: cube, material: blue, transform: rear });
scene.createInstance({ mesh: cube, material: ground, transform: floor });
const skeleton = scene.createSkeleton(2);
const animatedJointMatrix = scene.skeletonMatrices.subarray(
  scene.skeletonMatrixOffset(skeleton) + 16,
  scene.skeletonMatrixOffset(skeleton) + 32
);
scene.createInstance({ mesh: ribbon, material: animated, transform: ribbonTransform, skeleton });

const commands = createRenderCommandBuffer3D({ commands: 8, instances: 8, lights: 2 });
const view = createMat4(), projection = createMat4(), viewProjection = createMat4();
const shadowView = createMat4(), shadowProjection = createMat4(), shadowViewProjection = createMat4();
const frustum = createFrustumPlanes3D();
lookAtViewMat4(view, [5, 3.4, 7], [0, -0.2, -0.8]);
lookAtViewMat4(shadowView, [6, 8, 5], [0, -0.5, -0.7]);
orthographicMat4(shadowProjection, { left: -6, right: 6, bottom: -6, top: 6, near: 0.1, far: 24 });
multiplyMat4(shadowViewProjection, shadowProjection, shadowView);

let renderer: ReturnType<typeof createWebGl2Renderer3D>;
let lastStats = {
  draws: 0, instances: 0, triangles: 0, width: 0, height: 0, generation: 0,
  textureUploads: 0, ambientLights: 0, directionalLights: 0, shadowDraws: 0, outlineDraws: 0,
  paletteUploads: 0, skinnedDraws: 0, skinnedInstances: 0, pose: 0
};
browserState.__firstParty3D = {
  ready: false,
  snapshot: () => ({ ...lastStats }),
  async contextRoundTrip() {
    const gl = canvas.getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) return { supported: false, generation: lastStats.generation };
    const priorGeneration = lastStats.generation;
    const lost = new Promise<void>((resolve) => canvas.addEventListener("webglcontextlost", () => resolve(), { once: true }));
    extension.loseContext();
    await lost;
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    extension.restoreContext();
    for (let frame = 0; frame < 120; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (browserState.__firstParty3D.ready && lastStats.generation > priorGeneration) {
        return { supported: true, generation: lastStats.generation };
      }
      if (browserState.__firstParty3D.error) throw new Error(browserState.__firstParty3D.error);
    }
    throw new Error("WebGL2 context did not resume rendering within 120 animation frames.");
  }
};

function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  browserState.__firstParty3D.error = message;
  browserState.__firstParty3D.ready = false;
  status.dataset.state = "error";
  status.textContent = message;
}

try {
  renderer = createWebGl2Renderer3D({ pixelRatio: () => globalThis.devicePixelRatio || 1,
    canvas,
    scene,
    maxInstances: 8,
    directionalShadowMapSize: 1024,
    validateGlErrors: true,
    maxDevicePixelRatio: 2,
    clearColor: [0.025, 0.04, 0.07, 1],
    onDiagnostic(diagnostic) {
      if (diagnostic.level === "error") showError(diagnostic.message);
      else status.textContent = diagnostic.message;
    }
  });
} catch (error) {
  showError(error);
  throw error;
}

function renderFrame(nowSeconds: number): void {
  try {
    const phase = nowSeconds * 0.45;
    scene.transforms.setRotationQuaternion(left, 0, Math.sin(phase), 0, Math.cos(phase));
    scene.transforms.setRotationQuaternion(right, Math.sin(phase * 0.45) * 0.18, Math.sin(-phase * 0.7), 0, Math.cos(phase * 0.7));
    const bend = Math.sin(phase * 1.7) * 0.42;
    cubeMorphWeights[0] = 0.5 + Math.sin(phase * 1.2) * 0.5;
    composeMat4FromTrs(animatedJointMatrix, [0, 0, 0], [0, 0, Math.sin(bend / 2), Math.cos(bend / 2)], [1, 1, 1]);
    const aspect = Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight);
    perspectiveMat4(projection, { fovYRadians: Math.PI / 3, aspect, near: 0.1, far: 100 });
    multiplyMat4(viewProjection, projection, view);
    extractFrustumPlanes3D(frustum, viewProjection);
    scene.compile(commands, { frustumPlanes: frustum });
    const stats = renderer.render(commands, viewProjection, { cameraPosition: [5, 3.4, 7], shadowViewProjection, shadowBias: 0.0015 });
    lastStats = {
      draws: stats.drawCalls,
      instances: stats.instances,
      triangles: stats.triangles,
      width: stats.width,
      height: stats.height,
      generation: stats.contextGeneration,
      textureUploads: Math.max(lastStats.textureUploads, stats.textureUploads),
      ambientLights: Math.max(lastStats.ambientLights, stats.ambientLightsUsed),
      directionalLights: Math.max(lastStats.directionalLights, stats.directionalLightsUsed),
      shadowDraws: stats.shadowDrawCalls,
      outlineDraws: stats.outlineDrawCalls,
      paletteUploads: Math.max(lastStats.paletteUploads, stats.paletteUploads),
      skinnedDraws: stats.skinnedDrawCalls,
      skinnedInstances: stats.skinnedInstances,
      pose: bend
    };
    status.dataset.state = "ready";
    status.textContent = `first-party WebGL2 lit+textured+skinned / ${stats.drawCalls} draws / ${stats.instances} instances / ${stats.triangles} triangles\n${stats.width}x${stats.height} / context generation ${stats.contextGeneration}`;
    browserState.__firstParty3D.ready = stats.drawCalls > 0
      && lastStats.textureUploads > 0
      && lastStats.ambientLights > 0
      && lastStats.directionalLights > 0
      && lastStats.shadowDraws > 0
      && lastStats.outlineDraws > 0
      && lastStats.paletteUploads > 0
      && !stats.contextLost;
  } catch (error) {
    showError(error);
  }
}

let animationSeconds = performance.now() / 1000;
createFixedStepLoop({
  step: 0.016666666666666666,
  maxFrame: 0.1,
  update(dt) { animationSeconds += dt; },
  render() { renderFrame(animationSeconds); },
}).start();
