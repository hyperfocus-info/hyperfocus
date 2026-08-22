import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

export type PackageArtifact = {
  label: string;
  relativePath: string;
};

export const requiredPackageArtifacts: readonly PackageArtifact[] = [
  { label: "browser runtime build", relativePath: "browser/engine.js" },
  { label: "generated declaration entry", relativePath: "dist/src/index.d.ts" },
  { label: "generated DOM-free core module", relativePath: "dist/core.js" },
  { label: "generated DOM-free core declarations", relativePath: "dist/src/core.d.ts" },
  { label: "generated WASM runtime helpers", relativePath: "dist/wasm-runtime.js" },
  { label: "generated WASM runtime declarations", relativePath: "dist/src/wasm/index.d.ts" },
  { label: "generated experimental adapters", relativePath: "dist/experimental.js" },
  { label: "generated experimental adapter declarations", relativePath: "dist/src/experimental/index.d.ts" },
  { label: "generated multiplayer net module", relativePath: "dist/net.js" },
  { label: "generated multiplayer net declarations", relativePath: "dist/src/net/index.d.ts" },
  { label: "generated protocol module", relativePath: "dist/protocol.js" },
  { label: "generated protocol declarations", relativePath: "dist/src/protocol/index.d.ts" },
  { label: "generated authoritative server module", relativePath: "dist/server.js" },
  { label: "generated authoritative server declarations", relativePath: "dist/src/server/index.d.ts" },
  { label: "generated MMO module", relativePath: "dist/mmo.js" },
  { label: "generated MMO declarations", relativePath: "dist/src/mmo/index.d.ts" },
  { label: "generated render module", relativePath: "dist/render.js" },
  { label: "generated render declarations", relativePath: "dist/src/render/index.d.ts" },
  { label: "generated 3D render module", relativePath: "dist/render-3d.js" },
  { label: "generated 3D render declarations", relativePath: "dist/src/render/3d.d.ts" },
  { label: "generated first-party 3D core module", relativePath: "dist/render-3d-core.js" },
  { label: "generated first-party 3D core declarations", relativePath: "dist/src/render/3d-core.d.ts" },
  { label: "generated first-party 3D scene module", relativePath: "dist/render-3d-scene.js" },
  { label: "generated first-party 3D scene declarations", relativePath: "dist/src/render/3d-scene.d.ts" },
  { label: "generated first-party WebGL2 module", relativePath: "dist/render-3d-webgl2.js" },
  { label: "generated first-party WebGL2 declarations", relativePath: "dist/src/render/3d-webgl2.d.ts" },
  { label: "generated 3D physics module", relativePath: "dist/physics-3d.js" },
  { label: "generated 3D physics declarations", relativePath: "dist/src/physics/3d.d.ts" },
  { label: "generated 2D physics module", relativePath: "dist/physics-2d.js" },
  { label: "generated 2D physics declarations", relativePath: "dist/src/physics/2d.d.ts" },
  { label: "generated rigid 3D physics module", relativePath: "dist/physics-rigid-3d.js" },
  { label: "generated rigid 3D physics declarations", relativePath: "dist/src/physics/rigid-3d.d.ts" },
  { label: "generated motion module", relativePath: "dist/motion.js" },
  { label: "generated motion declarations", relativePath: "dist/src/motion/index.d.ts" },
  { label: "generated Three motion adapter", relativePath: "dist/motion-three.js" },
  { label: "generated Three motion declarations", relativePath: "dist/src/motion/three.d.ts" },
  { label: "generated migration module", relativePath: "dist/migrations.js" },
  { label: "generated migration declarations", relativePath: "dist/src/migrations/index.d.ts" },
  { label: "generated portable project module", relativePath: "dist/project.js" },
  { label: "generated portable project declarations", relativePath: "dist/src/project/index.d.ts" },
  { label: "generated portable 2D runtime module", relativePath: "dist/project-runtime-2d.js" },
  { label: "generated portable 2D runtime declarations", relativePath: "dist/src/project/runtime-2d.d.ts" },
  { label: "generated portable navigation runtime module", relativePath: "dist/project-runtime-navigation-2d.js" },
  { label: "generated portable navigation runtime declarations", relativePath: "dist/src/project/runtime-navigation-2d.d.ts" },
  { label: "generated portable save runtime module", relativePath: "dist/project-runtime-save-2d.js" },
  { label: "generated portable save runtime declarations", relativePath: "dist/src/project/runtime-save-2d.d.ts" },
  { label: "generated portable story runtime module", relativePath: "dist/project-runtime-story-2d.js" },
  { label: "generated portable story runtime declarations", relativePath: "dist/src/project/runtime-story-2d.d.ts" },
  { label: "generated portable 3D runtime module", relativePath: "dist/project-runtime-3d.js" },
  { label: "generated portable 3D runtime declarations", relativePath: "dist/src/project/runtime-3d.d.ts" },
  { label: "generated portable filesystem module", relativePath: "dist/project-filesystem.js" },
  { label: "generated portable filesystem declarations", relativePath: "dist/src/project/filesystem.d.ts" },
  { label: "generated neutral export module", relativePath: "dist/project-neutral-export.js" },
  { label: "generated neutral export declarations", relativePath: "dist/src/project/neutral-export.d.ts" },
  { label: "generated navigation module", relativePath: "dist/navigation.js" },
  { label: "generated navigation declarations", relativePath: "dist/src/navigation/index.d.ts" },
  { label: "generated content module", relativePath: "dist/content.js" },
  { label: "generated content declarations", relativePath: "dist/src/content/index.d.ts" },
  { label: "generated save module", relativePath: "dist/save.js" },
  { label: "generated save declarations", relativePath: "dist/src/save/index.d.ts" },
  { label: "generated browser save module", relativePath: "dist/save-browser.js" },
  { label: "generated browser save declarations", relativePath: "dist/src/save/browser.d.ts" },
  { label: "generated audio module", relativePath: "dist/audio.js" },
  { label: "generated audio declarations", relativePath: "dist/src/audio/index.d.ts" },
  { label: "generated effects module", relativePath: "dist/effects.js" },
  { label: "generated effects declarations", relativePath: "dist/src/effects/index.d.ts" },
  { label: "generated UI module", relativePath: "dist/ui.js" },
  { label: "generated UI declarations", relativePath: "dist/src/ui/index.d.ts" },
  { label: "generated DOM-free UI core", relativePath: "dist/ui-core.js" },
  { label: "generated DOM-free UI core declarations", relativePath: "dist/src/ui/core.d.ts" },
  { label: "generated asset loader module", relativePath: "dist/assets/loader.js" },
  { label: "generated asset loader declarations", relativePath: "dist/src/assets/loader.d.ts" },
  { label: "generated static glTF cooker module", relativePath: "dist/assets/gltf-static.js" },
  { label: "generated static glTF cooker declarations", relativePath: "dist/src/assets/gltf-static.d.ts" },
  { label: "generated glTF skin and animation cooker module", relativePath: "dist/assets/gltf-skin-animation.js" },
  { label: "generated glTF skin and animation cooker declarations", relativePath: "dist/src/assets/gltf-skin-animation.d.ts" },
  { label: "generated template assets module", relativePath: "dist/assets/templates.js" },
  { label: "generated template assets declarations", relativePath: "dist/src/assets/templates/index.d.ts" },
  { label: "generated prototype post-processing module", relativePath: "dist/post-processing-prototype.js" },
  { label: "generated prototype post-processing declarations", relativePath: "dist/src/canvas/post-processing-prototype.d.ts" },
  { label: "WASM asset", relativePath: "wasm/collision-kernel.wasm" },
  { label: "WASM asset type declaration", relativePath: "wasm/collision-kernel.wasm.d.ts" },
];

export function getMissingPackageArtifacts(rootDir: string, artifacts = requiredPackageArtifacts) {
  return artifacts.filter((artifact) => {
    const path = join(rootDir, artifact.relativePath);
    return !existsSync(path) || !statSync(path).isFile();
  });
}

export function formatMissingPackageArtifactsMessage(missingArtifacts: readonly PackageArtifact[]) {
  return [
    "package smoke cannot run from a partial engine artifact state.",
    "Missing artifacts:",
    ...missingArtifacts.map((artifact) => `- ${artifact.label}: ${artifact.relativePath}`),
    'Run "bun run build" from ./engine before smoke:package.',
  ].join("\n");
}
