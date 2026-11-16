import type { CombatConfig } from '@hyperfocus/engine/combat';
import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

/** Normal health, movement and engine physics; no weapons, hazards or city geometry. */
export function arena(createTouchOfDeathPreset: () => CombatConfig) {
  const positions = new Float32Array([-.5, -.5, 0, .5, -.5, 0, 0, .5, 0]);
  const gltf = { asset: { version: '2.0' }, buffers: [{ uri: 'mesh.bin', byteLength: positions.byteLength }], bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }] };
  const actor = (id: string, x: number): Hyperfocus3DDeclaration['scenes'][number]['entities'][number] => ({ id, meshId: 'mesh', materialId: 'material', position: [x, 1, 0], scale: [.6, 1.6, .6], rotationY: 0,
    physics: { type: 'dynamic', shape: 'box', gravityScale: 1, continuous: true } });
  return { project: { activeSceneId: 'logic', scenes: [{ id: 'logic', entities: [] }], extensions: {
    hyperfocusCombat: { version: 1, config: createTouchOfDeathPreset(), match: { difficulty: 9 },
      movement: { speed: 6, jumpSpeed: 9, dashSpeed: 18, dashFrames: 10, dashRecoveryFrames: 16 },
      fighters: [{ entityId: 'a', actionPrefix: 'a:', control: 'player' }, { entityId: 'b', actionPrefix: 'b:', control: 'dummy' }] },
    hyperfocus3D: { version: 1, activeSceneId: 'arena', budgets: { meshes: 4, vertices: 100, indices: 300, textures: 4, textureBytes: 1024, materials: 4, lights: 4, entities: 8 },
      meshes: [{ id: 'mesh', assetId: 'gltf', primitive: 0, buffers: [{ uri: 'mesh.bin', assetId: 'bin' }] }], textures: [],
      materials: [{ id: 'material', shading: 'lit', baseColor: [1, 1, 1, 1], metallic: 0, roughness: 1, doubleSided: true }],
      scenes: [{ id: 'arena', camera: { position: [0, 4, 7], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 }, lights: [],
        entities: [actor('a', 0), actor('b', 1.4), { id: 'floor', meshId: 'mesh', materialId: 'material', position: [0, -.25, 0], scale: [100, .5, 100], rotationY: 0,
          physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } }] }],
      audio: { policy: 'gesture-unlock', cues: [] }, save: { restoreOnBoot: true, slot: 'auto', maxBytes: 65536 } },
  } }, assets: [{ id: 'gltf', mimeType: 'model/gltf+json', bytes: new TextEncoder().encode(JSON.stringify(gltf)) }, { id: 'bin', mimeType: 'application/octet-stream', bytes: new Uint8Array(positions.buffer) }] };
}
