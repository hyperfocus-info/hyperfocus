import { createCombatSimulation, type CombatConfig, type CombatSnapshot } from '@hyperfocus/engine/combat';
import { createWebGl2Renderer3D } from '@hyperfocus/engine/render/3d-webgl2';
import { createAppearancePosePresenter3D, presentCombatVisuals3D, type Hyperfocus3DEvaluatedFrame, type Hyperfocus3DRuntime } from '@hyperfocus/engine/project/runtime-3d';

import type { WardrobeStylePreview } from '@hyperfocus/touch-of-death/presentation/art-direction/integration/runtime';
export type WardrobeView = 'front' | 'three-quarter' | 'side';

/** Scope the shared render scene override, including a failed render. */
export function withWardrobePreviewFrame(options: { runtime: Pick<Hyperfocus3DRuntime, 'applyFrame'>; frame: Hyperfocus3DEvaluatedFrame; preview: Hyperfocus3DEvaluatedFrame; render(): void }) {
  try { options.runtime.applyFrame(options.preview);options.render(); } finally { options.runtime.applyFrame(options.frame); }
}

/** Reset only detached presentation, so live attacks, knockouts and arena walls cannot enter the dressing view. */
export function prepareWardrobePreviewFrame(options: { frame: Hyperfocus3DEvaluatedFrame; actorId: string; config: CombatConfig; state: CombatSnapshot }) {
  const { frame, actorId, config, state } = options;
  const preview: Hyperfocus3DEvaluatedFrame = { ...frame, camera: structuredClone(frame.camera), renderGraph: structuredClone(frame.renderGraph), materials: frame.materials.map(material => ({ ...material })),
    entities: frame.entities.map(entity => entity.id === actorId || entity.id.startsWith(actorId + ':') ? structuredClone(entity) : { ...entity, visible: false }) };
  const actor = preview.entities.find(entity => entity.id === actorId);if (!actor) throw new Error('Wardrobe preview actor is missing.');
  actor.position = [0, 1, 0];actor.visible = true;
  const ready = { ...state, fighters: state.fighters.map(fighter => ({ ...fighter, stamina: config.maxStamina ?? 100 })) };
  presentCombatVisuals3D({ frame: preview, state: ready, config, grounded: new Set([actorId]), reducedMotion: true });
  preview.camera = { ...frame.camera, position: [2.3, 1.7, 3.15], target: [0, 1.15, 0], fovYRadians: .62 };
  return preview;
}

/** A second renderer reads the same compiled scene. It never advances or repositions the simulation. */
export function createWardrobePreview(options: { canvas: HTMLCanvasElement; runtime: Hyperfocus3DRuntime; actorId: string; config: CombatConfig; presentFighter?: (frame: Hyperfocus3DEvaluatedFrame, actorId: string, pose?: { style: 'default' | 'bow' | 'salute' | 'fists-up'; settle: number }, style?: WardrobeStylePreview) => void }) {
  const { canvas, runtime } = options;
  const neutral = createCombatSimulation({ config: options.config, fighters: [{ id: options.actorId, position: { x: 0, y: 1, z: 0 }, facing: { x: 0, y: 0, z: 1 } }] }).capture();
  const presentPose = createAppearancePosePresenter3D();
  let view: WardrobeView = 'three-quarter';
  const renderer = createWebGl2Renderer3D({ pixelRatio: () => globalThis.devicePixelRatio || 1, canvas, scene: runtime.scene, maxInstances: runtime.declaration.budgets.entities,
    clearColor: [.025, .045, .065, 1], maxDrawingBufferWidth: 1024, maxDrawingBufferHeight: 1024, maxDevicePixelRatio: 2 });
  return {
    setView(value: WardrobeView) { view = value; },
    render(frame: Hyperfocus3DEvaluatedFrame, actorId: string, pose?: { style: 'default' | 'bow' | 'salute' | 'fists-up'; progress: number; settle: number; phase?: 'intro' | 'victory'; fighterIndex?: 0 | 1 }, decorate?: (frame: Hyperfocus3DEvaluatedFrame, state: CombatSnapshot) => void, style?: WardrobeStylePreview) {
      const preview = prepareWardrobePreviewFrame({ frame, actorId, config: options.config, state: neutral });
      if (view !== 'three-quarter') preview.camera.position = view === 'front' ? [0, 1.65, 3.9] : [3.9, 1.65, 0];
      const camera = preview.camera;
      const render = () => renderer.render(runtime.compile(), runtime.viewProjectionForFrame(preview, Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight)), { cameraPosition: camera.position });
      if (pose) presentPose({ frame: preview, actorId, ...pose });
      decorate?.(preview, neutral);
      options.presentFighter?.(preview, actorId, pose, style);
      canvas.dataset.previewParticles = String(preview.entities.filter(entity => entity.id.startsWith(`${actorId}:dust:`) && entity.visible).length);
      canvas.dataset.previewStyle = style?.style ?? '';
      withWardrobePreviewFrame({ runtime, frame, preview, render });
    }, dispose: () => renderer.dispose(),
  };
}
