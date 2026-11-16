import type { Hyperfocus3DDeclaration } from '../project/3d/declaration.ts';
import type { Hyperfocus3DTimeline } from '../frame/3d.ts';

export function frameDeclarationFixture3D(): Hyperfocus3DDeclaration {
  return {
    version: 1, activeSceneId: "arena", budgets: { meshes: 1, vertices: 100, indices: 300, textures: 1, textureBytes: 4, materials: 1, lights: 3, entities: 2 },
    meshes: [{ id: "fighter", assetId: "fighter-gltf", primitive: 0, buffers: [] }], textures: [],
    materials: [{ id: "fighter-skin", shading: "lit", shader: "toon", baseColor: [1, 0.5, 0.1, 1], metallic: 0, roughness: 0.8, doubleSided: false }],
    scenes: [{ id: "arena", camera: { position: [0, 2, 8], target: [0, 1, 0], up: [0, 1, 0], fovYRadians: 1, near: 0.1, far: 100 }, lights: [
      { id: "ambient", kind: "ambient", color: [1, 1, 1], intensity: 0.2 }, { id: "key", kind: "directional", color: [1, 1, 1], intensity: 2, direction: [0, -1, 0] }, { id: "rim", kind: "directional", color: [0.2, 0.5, 1], intensity: 1, direction: [0, -1, 0] },
    ], entities: [
      { id: "goku", meshId: "fighter", materialId: "fighter-skin", position: [-1, 0, 0], scale: [1, 1, 1], rotationY: 0 },
      { id: "cell", meshId: "fighter", materialId: "fighter-skin", position: [1, 0, 0], scale: [1, 1, 1], rotationY: Math.PI },
    ] }], audio: { policy: "disabled", cues: [] }, save: { restoreOnBoot: false, slot: "main", maxBytes: 1024 },
  };
}

export function frameTimelineFixture3D(): Hyperfocus3DTimeline {
  return { version: 2, sceneId: "arena", durationFrames: 60, fps: 30, background: "#020407", groups: [{ id: "fighters", entityIds: ["goku", "cell"] }], materialTracks: [{ materialId: "fighter-skin", transitions: [{ startFrame: 10, durationFrames: 10, toPreset: "hologram-blue" }] }], shots: [{
    id: "impact", startFrame: 0, durationFrames: 60,
    camera: { positionFrom: [0, 2, 8], positionTo: [0, 1, 4], targetFrom: [0, 1, 0], targetTo: [0, 1.5, 0], fovFrom: 50, fovTo: 34, shake: 0.08 },
    formations: [{ groupId: "fighters", preset: "phalanx", radius: 2, depth: 0.4, spread: 2, height: 1, scale: 1, spinTurns: 0, travel: 0 }],
    lighting: { ambientLightId: "ambient", ambientColor: "#101020", ambientIntensity: 0.4, keyLightId: "key", keyColor: "#fff4dd", keyIntensity: 4, keyPosition: [4, 8, 6], rimLightId: "rim", rimColor: "#55aaff", rimIntensity: 3, rimPosition: [-4, 3, -2] },
    post: { exposure: 1.1, bloomStrength: 0.5, bloomRadius: 0.3, bloomThreshold: 0.6, fogDensity: 0.01, vignette: 0.2, grain: 0.02 }, transition: { kind: "flash", frames: 3 },
  }] };
}
