import { createDefaultProject } from '@hyperfocus/engine/project';
import { createCombatProject3D, createGameplay3D, createHyperfocus3DRuntime, readMutableHyperfocus3DDeclaration, type Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';
import { createTouchOfDeathPreset } from "../combat/preset.ts";
import { cookTouchOfDeathModels } from "../presentation/models.ts";
import { applyTouchOfDeathPresentation } from "../presentation/presentation.ts";
import { applyTouchOfDeathCity } from "../presentation/city/author.ts";

export const cpuWorkloadConfiguration = {
  schema: 'touch-of-death-cpu-preparation-v1', seed: 5, districtSize: 'compact', viewport: { width: 1366, height: 768 },
  warmupFrames: 120, measuredFrames: 240, stepsPerFrame: 1,
  scope: 'CPU simulation, sampling, presentation, application and command preparation; no browser/GPU/display freshness evidence',
} as const;

/** Reuses real game authoring and engine runtime; no copied simulation or renderer. */
export async function createCpuPreparationWorkload(options: { diagnostics?: boolean } = {}) {
  const project = createDefaultProject('Touch of Death swarm CPU workload'), combat = createCombatProject3D();
  combat.config = createTouchOfDeathPreset();
  combat.fighters = [{ entityId: 'swarm-player', actionPrefix: 'player:', control: 'player' }, { entityId: 'swarm-opponent', actionPrefix: 'opponent:', control: 'dummy' }];
  combat.movement = { speed: 7.28, jumpSpeed: 9, dashSpeed: 15.96, dashFrames: 10, dashRecoveryFrames: 16 };
  const declaration: Hyperfocus3DDeclaration = {
    version: 1, activeSceneId: 'swarm-arena', meshes: [{ id: 'seed-mesh', assetId: 'swarm-fighter', primitive: 0, buffers: [] }], textures: [],
    materials: [{ id: 'seed-material', shading: 'lit', baseColor: [1, 1, 1, 1], metallic: 0, roughness: 1, doubleSided: false }],
    budgets: { meshes: 16, vertices: 30000, indices: 120000, textures: 4, textureBytes: 1024, materials: 2048, lights: 16, entities: 6000 },
    scenes: [{ id: 'swarm-arena', camera: { position: [0, 7.5, 12.5], target: [0, 1, 0], up: [0, 1, 0], fovYRadians: 0.85, near: 0.1, far: 100 }, lights: [],
      entities: combat.fighters.map(fighter => ({ id: fighter.entityId, meshId: 'seed-mesh', materialId: 'seed-material', position: [0, 1, 0], scale: [1, 1, 1], rotationY: 0 })) }],
    audio: { policy: 'gesture-unlock', cues: [] }, save: { restoreOnBoot: false, slot: 'swarm', maxBytes: 1048576 },
  };
  project.extensions = { ...project.extensions, hyperfocus3D: declaration, hyperfocusCombat: combat };
  const models = cookTouchOfDeathModels(), assets = Object.entries(models).map(([kind, model]) => ({ id: `swarm-${kind}`, mimeType: 'model/gltf-binary', bytes: model.bytes }));
  project.assets.push(...assets.map(asset => ({ id: asset.id, name: `${asset.id}.glb`, mimeType: asset.mimeType, size: asset.bytes.length, lastModified: 0, source: 'generated' as const, kind: 'data' as const })));
  applyTouchOfDeathPresentation({ project, fighterIds: ['swarm-player', 'swarm-opponent'], assets: { fighter: 'swarm-fighter', box: 'swarm-box', sphere: 'swarm-sphere', impact: 'swarm-impact' } });
  const current = readMutableHyperfocus3DDeclaration(project);
  if (!current) throw new Error('Touch of Death CPU workload did not produce a 3D declaration.');
  applyTouchOfDeathCity({ declaration: current, combat, settings: { seed: cpuWorkloadConfiguration.seed, districtSize: 'compact' } });
  project.extensions.hyperfocusCombat = combat;
  const runtime = await createHyperfocus3DRuntime(project, assets, { entityApplicationDiagnostics: options.diagnostics }), game = createGameplay3D({ project, runtime, independentCombatInputs: true });
  const initial = game.checkpoint();
  const player = { actions: new Set<string>(), direction: { x: 0, y: 0, z: 0 } }, opponent = { actions: new Set<string>(), direction: { x: 0, y: 0, z: 0 } };
  let frameIndex = 0;
  function reset() {
    initial.restore(); runtime.resetPresentationTransforms(); runtime.resetPresentationMaterialHistory(); frameIndex = 0;
  }
  function frame() {
    player.actions.clear(); opponent.actions.clear();
    if (frameIndex % 60 === 0) player.actions.add('jab');
    opponent.direction.z = frameIndex % 120 < 60 ? 0.2 : -0.2;
    const start = performance.now();
    game.step([], [player, opponent]); game.drainAudio();
    const simulated = performance.now(), evaluated = runtime.sampleFrame({ viewport: cpuWorkloadConfiguration.viewport });
    const sampled = performance.now(); game.presentFrame(evaluated);
    const presented = performance.now(); runtime.applyFrame(evaluated);
    const applied = performance.now(), commands = runtime.compile(), compiled = performance.now();
    frameIndex++;
    return { simulationMs: simulated - start, samplingMs: sampled - simulated, presentationMs: presented - sampled, applicationMs: applied - presented,
      commandPreparationMs: compiled - applied, totalCpuMs: compiled - start, entityCount: evaluated.entities.length, commandCount: commands.commandCount };
  }
  // Diagnostic consumers own this disposable fixture. Acceptance timing never enables counters.
  return { reset, frame, checkpoint: () => game.checkpoint().state, configuration: cpuWorkloadConfiguration,
    diagnostics: options.diagnostics ? { runtime, game } : undefined };
}
