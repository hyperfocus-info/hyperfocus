import { createTouchOfDeathPreset } from '../src/combat/preset.ts';
import { createGameplay3D, createHyperfocus3DRuntime } from '@hyperfocus/engine/project/runtime-3d';
import type { CombatProject3D } from '@hyperfocus/engine/project/runtime-3d';

export async function combatMotionFixture(options: { independentCombatInputs?: boolean; match?: boolean; staminaRegen?: number; idleStaminaRegen?: number; airStaminaRegen?: number; cameraPosition?: number[]; obstacle?: boolean; jumpCost?: number; hurtRadius?: number; gravityScale?: number; movement?: Partial<NonNullable<CombatProject3D['movement']>> } = {}) {
  const positions = new Float32Array([-.5, -.5, 0, .5, -.5, 0, 0, .5, 0]);
  const gltf = { asset: { version: '2.0' }, buffers: [{ uri: 'mesh.bin', byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }] };
  const entity = (id: string, x: number) => ({ id, meshId: 'mesh', materialId: 'material', position: [x, 1, 0], scale: [.6, 1.6, .6], rotationY: 0,
    physics: { type: 'dynamic', shape: 'box', gravityScale: options.gravityScale ?? 1, continuous: true } });
  const project = { activeSceneId: "logic", scenes: [{ id: "logic", entities: [] }], extensions: { hyperfocusCombat: { version: 1, config: { ...createTouchOfDeathPreset(), ...(options.staminaRegen === undefined ? {} : { staminaRegen: options.staminaRegen, idleStaminaRegen: options.idleStaminaRegen ?? options.staminaRegen }), ...(options.airStaminaRegen === undefined ? {} : { airStaminaRegen: options.airStaminaRegen }), ...(options.hurtRadius === undefined ? {} : { hurtRadius: options.hurtRadius }) },
    ...(options.match ? { match: { difficulty: 9 } } : {}),
    movement: { speed: 6, jumpSpeed: 9, dashSpeed: 18, dashFrames: 10, dashRecoveryFrames: 16, ...options.movement, ...(options.jumpCost === undefined ? {} : { jumpCost: options.jumpCost }) },
    fighters: [{ entityId: 'a', actionPrefix: 'a:', control: 'player' }, { entityId: 'b', actionPrefix: 'b:', control: 'dummy' }] },
    hyperfocus3D: { version: 1, activeSceneId: 'arena', budgets: { meshes: 4, vertices: 100, indices: 300, textures: 4, textureBytes: 1024, materials: 4, lights: 4, entities: 8 },
      meshes: [{ id: 'mesh', assetId: 'gltf', primitive: 0, buffers: [{ uri: 'mesh.bin', assetId: 'bin' }] }], textures: [],
      materials: [{ id: 'material', shading: 'lit', baseColor: [1, 1, 1, 1], metallic: 0, roughness: 1, doubleSided: true }],
      scenes: [{ id: 'arena', camera: { position: options.cameraPosition ?? [0, 4, 7], target: [0, 0, 0], up: [0, 1, 0], fovYRadians: 1, near: .1, far: 100 }, lights: [],
        entities: [entity('a', 0), entity('b', 1.4), ...(options.obstacle ? [{ id: 'obstacle', meshId: 'mesh', materialId: 'material', position: [-1.2, 4, 0], scale: [.5, 4, 20], rotationY: 0, physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } }] : []), { id: 'floor', meshId: 'mesh', materialId: 'material', position: [0, -.25, 0], scale: [100, .5, 100], rotationY: 0,
          physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } }] }],
      audio: { policy: 'gesture-unlock', cues: [] }, save: { restoreOnBoot: true, slot: 'auto', maxBytes: 65536 } } } };
  const assets = [{ id: 'gltf', mimeType: 'model/gltf+json', bytes: new TextEncoder().encode(JSON.stringify(gltf)) },
    { id: 'bin', mimeType: 'application/octet-stream', bytes: new Uint8Array(positions.buffer) }];
  const runtime = await createHyperfocus3DRuntime(project, assets);
  const game = createGameplay3D({ project, runtime, independentCombatInputs: options.independentCombatInputs });
  for (let i = 0; i < 30; i++) game.step([], options.independentCombatInputs ? [0, 1].map(() => ({ actions: new Set<string>(), direction: { x: 0, y: 0, z: 0 } })) : undefined);
  return { game, runtime, project, assets };
}
