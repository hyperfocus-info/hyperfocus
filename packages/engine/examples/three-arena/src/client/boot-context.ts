import { PERF_FLAGS } from "./environment.ts";
import { requireEngineThreeModule } from "./three-guards.ts";
import { createAssetLoader, createAssetLoaderUi, createAssetLoadSnapshot, createSmoothedAssetProgress, runAssetLoaderRafLoop } from "@hyperfocus/engine/assets/loader";
import type { AssetLoadSnapshot } from "@hyperfocus/engine/assets/loader";
import { createThreeRender3D, type ThreeRender3DView } from "@hyperfocus/engine/render/3d";

export const bootUi = createAssetLoaderUi({
  title: "Three Arena",
  subtitle: "Preparing graveyard assets",
  backgroundImage: 'url("./assets/source/kenney/graveyard-kit/Sample.png")',
  zIndex: 12,
  palette: {
    accent: "#d7ff8d",
    accentAlt: "#7bd6ff",
    border: "rgba(226, 244, 185, 0.38)"
  }
});
bootUi.attach();
export const bootSmoother = createSmoothedAssetProgress({ speed: 6.6, completeSpeed: 13, minAdvancePerSecond: 0.035 });
export let bootSnapshot: AssetLoadSnapshot = createAssetLoadSnapshot({
  status: "loading",
  total: 1,
  label: "Preparing arena",
  activeLabel: "Starting renderer",
  startedAt: performance.now(),
  updatedAt: performance.now()
});
export const bootContext = {
  get snapshot(): AssetLoadSnapshot { return bootSnapshot; },
  set snapshot(value: AssetLoadSnapshot) { bootSnapshot = value; },
};
export const bootLoop = runAssetLoaderRafLoop({
  read: () => bootSnapshot,
  smoother: bootSmoother,
  render: (snapshot) => bootUi.render(snapshot)
});
export type ThreeNamespace = typeof import("three");
export type FbxLoaderModule = typeof import("three/examples/jsm/loaders/FBXLoader.js");
export type GltfLoaderModule = typeof import("three/examples/jsm/loaders/GLTFLoader.js");
export type SkeletonUtilsModule = typeof import("three/examples/jsm/utils/SkeletonUtils.js");
export type LocalThreeModules = {
  three: ThreeNamespace;
  FBXLoader: FbxLoaderModule["FBXLoader"];
  GLTFLoader: GltfLoaderModule["GLTFLoader"];
  skeletonUtils: SkeletonUtilsModule;
};
export let localThreeModules: LocalThreeModules | null = null;

function parseThreeRender3DView(value: unknown): ThreeRender3DView {
  if (!isThreeRender3DView(value)) throw new TypeError("renderer asset must be a ThreeRender3DView");
  return value;
}

function isThreeRender3DView(value: unknown): value is ThreeRender3DView {
  if (typeof value !== "object" || value === null) return false;
  for (const method of [
    "registerMesh",
    "unregisterMesh",
    "registerMaterial",
    "unregisterMaterial",
    "createAnimationController",
    "createRagdoll",
    "render",
    "resize",
    "setPixelRatioCap",
    "loadAddon",
    "dispose"
  ]) {
    if (typeof Reflect.get(value, method) !== "function") return false;
  }
  return typeof Reflect.get(value, "THREE") === "object"
    && typeof Reflect.get(value, "renderer") === "object"
    && typeof Reflect.get(value, "scene") === "object"
    && typeof Reflect.get(value, "camera") === "object";
}

export const bootLoader = createAssetLoader([{
  id: "renderer",
  label: "Starting renderer",
  weight: 1.2,
  async load(context) {
    context.reportProgress(0.18, "Importing Three.js");
    const [three, fbxModule, gltfModule, skeletonUtils] = await Promise.all([
      import("three"),
      import("three/examples/jsm/loaders/FBXLoader.js"),
      import("three/examples/jsm/loaders/GLTFLoader.js"),
      import("three/examples/jsm/utils/SkeletonUtils.js")
    ]);
    localThreeModules = {
      three,
      FBXLoader: fbxModule.FBXLoader,
      GLTFLoader: gltfModule.GLTFLoader,
      skeletonUtils
    };
    const view = await createThreeRender3D({
      backend: "webgl2",
      pixelRatioCap: 2,
      shadows: PERF_FLAGS.shadows,
      three: requireEngineThreeModule(three)
    });
    context.reportProgress(1, "Renderer ready");
    return view;
  }
}], {
  label: "Preparing arena",
  concurrency: 1,
  onSnapshot(snapshot) {
    bootSnapshot = snapshot;
  }
});
export const bootRenderer = await bootLoader.loadAsset("renderer", parseThreeRender3DView);
export const threeView = bootRenderer;
