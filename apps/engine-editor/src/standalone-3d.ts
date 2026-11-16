import { createOpponentRoutine } from './scene3d/replay/opponent-routine';
import { createPracticeLibrary } from './scene3d/replay/practice-library';
import { standaloneUiOwnsKeyboard } from './scene3d/input/ui-keyboard.ts';
import { createCombatInputView } from './scene3d/input/combat-view/view.ts';
import { createStandaloneRewards } from './scene3d/rewards/standalone.ts';
import { createDirectedFighterPresenter } from '@hyperfocus/touch-of-death/presentation/art-direction/integration/runtime';
import { createGameplay3D, createHyperfocus3DRuntime, readReference3D, type GameplayProject3D, type GameplaySnapshot3D, type PortableAsset3D } from "@hyperfocus/engine/project/runtime-3d";
import { create3DSaveData, readSaved3DSnapshot } from './standalone/save-3d.ts';
import { createWebGl2Renderer3D, type WebGl2FrameStats3D } from "@hyperfocus/engine/render/3d-webgl2";
import { createGameplayShadows3D } from '@hyperfocus/touch-of-death/presentation/shadows';
import { createSaveProfileStore } from "@hyperfocus/engine/save";
import { createIndexedDbSaveStorage } from "@hyperfocus/engine/save/browser";
import { createStandaloneControls } from "./components/standalone-controls.ts";
import { createStandaloneSaveControls } from "./components/standalone-save-controls.ts";
import { createPlayableAssetStage } from './standalone/asset-stage.ts';
import { createCanonicalImpactOverlay, createCanonicalImpactTextureSources } from "./scene3d/canonical-impact-frame.ts";
import { createGameplayPresentation3D } from "./scene3d/presentation/gameplay-presentation.ts";
import { combatInputActions3D, readCombatProject3D } from '@hyperfocus/engine/project/runtime-3d';
import { controllerPresentation, create3DInputDevice, poll3DGamepadInput } from './scene3d/gamepad-input.ts';
import { createTrainingReleaseInput } from './scene3d/network/training/release-input.ts';
import { createGamepadMenu } from './scene3d/input/gamepad-menu.ts';
import { createRuntimeControls } from './scene3d/input/runtime-controls.ts';
import { createPauseInputGate } from './scene3d/input/pause-input.ts';
import { acceptsPhysicalCombatAction, practiceResetPressed } from './scene3d/input/physical-actions.ts';
import { createDriveTapInput } from './scene3d/input/drive-tap.ts';
import { createStandaloneAudioController } from "./standalone-audio.ts";
import { gameplayAudioCommand, combatPreloadAssets } from './audio-playback/gameplay-command.ts';
import { personalMusicState } from './audio-playback/combat-effects.ts';
import { createUiAudioFeedback } from './audio-playback/ui-feedback.ts';
import { mountStandaloneFightScreen } from './scene3d/fight-hud/fight-screen.ts';
import { createFighterBars } from './scene3d/fight-hud/fighter-bars.ts';
import { createGameplayPostProcess3D } from './scene3d/presentation/gameplay-postprocess.ts';
import { combatScreenEffects } from './scene3d/fight-hud/screen-effects.ts';
import { createPracticeDiagnostics } from './scene3d/fight-hud/practice/practice-diagnostics.ts';
import { combatControlPresentation } from './scene3d/fight-hud/control-hint.ts';
import { combatContentPrefix, standaloneCombatContentSource, previousCombatLearningIdentity } from '@hyperfocus/touch-of-death/network/identity';
import { isOnlineSetButtonKey, onlineSetPresentation } from './scene3d/network/set-presentation.ts';
import { createNetworkCombatSession, createNetworkCombatSpectator } from '@hyperfocus/engine/project/runtime-3d';
import { createCombatConnection } from './scene3d/network/connection.ts';
import { createDeferredNetworkPanel as createCombatConnectionPanel, createDeferredReplayPanel as createCombatReplayPanel } from './standalone/lazy/panels.ts';
import { migrateProject, supportsStandaloneCombatConnections, type StandaloneStreamedAudio } from '@hyperfocus/engine/project';
import { networkCombatInput } from './scene3d/network/input.ts';
import { createCombatReplay3D } from '@hyperfocus/engine/project/runtime-3d';
import { createCombatReplayController } from './scene3d/replay/controller.ts';
import { createReplaySharePanel } from './scene3d/replay/share-panel.ts';
import { createFriendRivalry } from './scene3d/network/rivalry.ts';
import { localExchangePresentation } from './scene3d/replay/local-presentation.ts';
import { createLocalExchangeReview } from './scene3d/replay/local-exchange.ts';
import type { ReplayAppearance } from './scene3d/replay/appearance.ts';
import { downloadCombatReplay } from './scene3d/replay/download.ts';
import { createStandaloneAppearance } from './scene3d/appearance/standalone.ts';
import { createStandaloneUploads } from './scene3d/uploads/standalone.ts';
import { createGuidedFight } from './scene3d/tutorial/guided-fight.ts';
import { createCombatTutorial } from './scene3d/tutorial/coach.ts';
import { createGuidedSpotlight } from './scene3d/tutorial/spotlight.ts';
import type { createAiReportExport } from './scene3d/fight-hud/ai-report.ts';
import type { createBulkTrainingPanel } from './scene3d/bulk-training/panel.ts';
import { createPolicyStore } from './scene3d/bulk-training/learning/store.ts';
import { createPolicyActivation } from './scene3d/bulk-training/learning/activation.ts';
import { createContextualTrainingStore } from './scene3d/bulk-training/adaptation/storage.ts';
import { createContextualTrainingActivation } from './scene3d/bulk-training/adaptation/activation.ts';
import { generalTrainingModel } from './scene3d/bulk-training/adaptation/general.ts';
import { createLiveCombatLearning } from './scene3d/bulk-training/adaptation/live.ts';
import { createSharedPolicySync } from './scene3d/bulk-training/learning/shared/sync.ts';
import { advancePhotoCaptureFrame, applyPhotoCaptureCamera, createPhotoCapturePresentation, type PhotoCaptureOptions, type PhotoCapturePresentation } from './standalone/capture/presentation.ts';
import { captureSubjectBounds, fitCaptureCamera, validateCaptureSubjects } from './standalone/capture/framing.ts';
import type { CaptureAudioSample } from './standalone/capture/audio.ts';
import { presentServiceCourt } from '@hyperfocus/touch-of-death/presentation/city/service-entrance';
import { createGameFrameScheduler } from './scene3d/performance/frame-scheduler';
import { createGamePerformance } from './scene3d/performance/settings';
import { createGameExperiments, defaultHudLayout, type HudLayoutStrategy } from './scene3d/performance/experiments';
import { readCanvasGeometry } from './scene3d/canvas-geometry';
import type { FighterBarWriteWork } from './scene3d/fight-hud/fighter-bars';
import type { ReticleGeometryWork } from './scene3d/presentation/gameplay-presentation';
import { createStandaloneWorldAuthority } from './standalone/world-authority';
import type { createStandaloneWorldController } from './standalone/world/controller';

export type Project3D = GameplayProject3D & { id: string; assets?: readonly { id: string; name?: string }[]; settings: { input: Array<{ action: string; bindings: string[] }>; masterVolume?: number }; extensions?: { hyperfocus3D?: unknown; [key: string]: unknown } };
export type Standalone3DHook = {
  ready: boolean;
  frameCount: number;
  assetCount: number;
  diagnostics: readonly unknown[];
  renderMode?: "webgl2-3d";
  rendererStats?: WebGl2FrameStats3D;
  performance?: Pick<ReturnType<typeof createGamePerformance>, 'snapshot' | 'clear'> & { setHudLayout(value: HudLayoutStrategy): void };
  photoCapture?: {
    restore(snapshot: unknown): unknown;
    step(actions?: Iterable<string>): unknown;
    setPresentation(options: PhotoCaptureOptions): void;
    renderAudio(options: { durationSeconds: number; samples: readonly CaptureAudioSample[] }): Promise<AudioBuffer>;
    renderFrame(options: { frameIndex: number; fps?: number; actions?: Iterable<string> }): { canvas: HTMLCanvasElement; tick: number; audio: ReturnType<ReturnType<typeof createGameplay3D>['drainAudio']>; subjects: ReturnType<typeof captureSubjectBounds> };
    removedFighterEntityIds(): string[];
  };
  snapshot?: () => unknown;
  snapshotAsync?: () => Promise<GameplaySnapshot3D>;
  save?: (slot?: string) => Promise<void>;
  load?: (slot?: string) => Promise<boolean>;
  reset?: () => unknown;
  deleteSaveSlot?: (slot?: string) => Promise<void>;
  deleteSaveProfile?: () => Promise<void>;
  exportSaveProfile?: () => Promise<string>;
  importSaveProfile?: (source: string, overwrite?: boolean) => Promise<void>;
  audioUnlocked?: () => boolean;
  music?: ReturnType<typeof createStandaloneAudioController>['musicSnapshot'];
  nextMusic?: () => Promise<void>;
  retryMusic?: () => Promise<void>;
  audioResources?: ReturnType<typeof createStandaloneAudioController>['resourceSnapshot'];
  network?: () => unknown;
  replay?: () => unknown;
  localReview?: () => unknown;
  guidedFight?: () => ReturnType<typeof createGuidedFight>['state'] | undefined;
  tutorial?: () => ReturnType<typeof createCombatTutorial>['state'] | undefined;
  wardrobe?: () => unknown;
  uploadedAppearance?: () => unknown;
  voice?: () => unknown;
  voiceStats?: () => Promise<unknown>;
};

const simulationStepSeconds = 0.016666666666666666; // Fixed 60 Hz simulation.

/** Browser host for the DOM-free portable 3D runtime. No URL or module loading occurs. */
export async function bootStandalone3D(project: Project3D, assets: readonly PortableAsset3D[], canvas: HTMLCanvasElement, hook: Standalone3DHook, options: { behaviors?: Readonly<Record<string, unknown>>; streamedMusic?: readonly StandaloneStreamedAudio[]; loadAsset?: (id: string) => Promise<Uint8Array>; loadAudioStage?: () => Promise<readonly import('./standalone-audio.ts').StandaloneAudioAsset[]>; world?: (bindings: Omit<Parameters<typeof createStandaloneWorldController>[0], 'workerSource'>) => ReturnType<typeof createStandaloneWorldController> } = {}): Promise<void> {
  const reference = readReference3D(project), aspect = reference ? reference.source.width / reference.source.height : undefined;
  canvas.width = aspect ? Math.max(1, Math.round(1120 * Math.min(1, aspect))) : 1120;
  canvas.height = aspect ? Math.max(1, Math.round(1120 * Math.min(1, 1 / aspect))) : 680;
  canvas.style.width = `min(${canvas.width}px, ${reference ? 'calc(100vw - 2px)' : '100vw'})`;
  if (reference) canvas.style.boxSizing = 'content-box';
  canvas.style.height = 'auto';
  if (canvas.parentElement) canvas.parentElement.style.minWidth = '0';
  const runtime = await createHyperfocus3DRuntime(project, assets);
  const directedFighters = createDirectedFighterPresenter({ project, runtime, assets });
  const inputView = createCombatInputView({ readCamera: () => {
    const camera = runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!.camera;
    return { position: runtime.cameraPosition(), target: camera.followEntityId ? runtime.snapshot().entities.find(entity => entity.id === camera.followEntityId)?.position ?? camera.target : camera.target };
  } });
  const combatIdentitySource = standaloneCombatContentSource({ project, streamedAudio: options.streamedMusic?.filter(source => source.originalCatalog) });
  const contentHash = crypto.subtle ? await crypto.subtle.digest('SHA-256', new TextEncoder().encode(combatIdentitySource)) : undefined;
  const policyContentId = contentHash ? combatContentPrefix + [...new Uint8Array(contentHash)].map(byte => byte.toString(16).padStart(2, '0')).join('') : undefined;
  const policyStore = policyContentId && Object.keys(options.behaviors ?? {}).length === 0 ? createPolicyStore({ identity: policyContentId }) : undefined;
  const learnedPolicy = (await policyStore?.read())?.active;
  const contextualStore = policyStore && policyContentId ? createContextualTrainingStore({ contentIdentity: policyContentId, previousContentIdentity: previousCombatLearningIdentity(policyContentId) }) : undefined;
  const savedLessons = await contextualStore?.load().catch(() => undefined);
  const learnedModel = savedLessons ? generalTrainingModel(savedLessons.rows) : undefined;
  let workerRuntime: ReturnType<typeof createStandaloneWorldController> | undefined;
  const localGameplay = createGameplay3D({ project, runtime, behaviors: options.behaviors, combatQueueSeed: crypto.getRandomValues(new Uint32Array(1))[0]!, combatAiPolicies: [learnedPolicy, learnedPolicy], combatAiLearning: [learnedModel, learnedModel], combatAiTuning: contextualStore ? [{ opponentId: 'general' }, { opponentId: 'general' }] : undefined });
  const worldAuthority = createStandaloneWorldAuthority({ local: localGameplay, current: () => gameplay });
  const worldUpdateFailed = (error: unknown) => diagnostics.push({ severity: 'error', code: 'world-update', message: message(error) });
  const policyActivation = policyStore ? createPolicyActivation({ store: policyStore, queue: policies => { void worldAuthority.policies({ policies }).catch(worldUpdateFailed); } }) : undefined;
  const lessonActivation = contextualStore ? createContextualTrainingActivation({ store: contextualStore, initial: savedLessons, queue: models => { void worldAuthority.learning({ models }).catch(worldUpdateFailed); } }) : undefined;
  const liveLearning = contextualStore ? createLiveCombatLearning({ game: localGameplay, store: contextualStore }) : undefined;
  const sharedPolicy = policyStore && policyContentId && (location.protocol === 'https:' || location.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname))
    ? createSharedPolicySync({ contentId: policyContentId, origin: location.origin, store: policyStore }) : undefined;
  const refreshPolicy = () => { if (!document.hidden) { void policyActivation?.refresh();void lessonActivation?.refresh();void sharedPolicy?.refresh(); } };
  document.addEventListener('visibilitychange', refreshPolicy);
  let gameplay = localGameplay, network: ReturnType<typeof createCombatConnection> | undefined;
  let photoCapturePresentation: PhotoCapturePresentation | undefined;
  let renderingCaptureFrame = false;
  let captureSubjects: ReturnType<typeof captureSubjectBounds> = [];
  let captureMusic: ReturnType<typeof gameplay.drainAudio>[number] | undefined;
  let captureStartupAudio: ReturnType<typeof gameplay.drainAudio> = [];
  let photoCaptureRemovedFighterEntityIds: string[] = [];
  let replay: ReturnType<typeof createCombatReplayController> | undefined;
  let aiReport: ReturnType<typeof createAiReportExport> | undefined;
  let bulkTraining: ReturnType<typeof createBulkTrainingPanel> | undefined;
  let localReview: ReturnType<typeof createLocalExchangeReview> | undefined;
  let guide: ReturnType<typeof createGuidedFight> | undefined;
  let tutorial: ReturnType<typeof createCombatTutorial> | undefined;
  const requireLocal = () => { if (workerRuntime?.starting) throw Error('Wait for world startup to finish.');if (workerRuntime?.host && workerRuntime.latest?.services.review?.active || network?.active || replay?.active || localReview?.state.active || tutorial?.watching) throw new Error('Return to local play before saving, loading or resetting.'); };
  const requireMainWorld = (mode: string) => { if (worldAuthority.remote || workerRuntime?.starting) throw Error(`Reload the standard playable to use ${mode}.`); };
  const requireCapture = () => { if (workerRuntime?.host && !workerRuntime.oracle) throw Error('Use worker input and capture.');requireLocal(); };
  let timeline: import('./motion/scene3d/editor-3d-video-sequence.ts').Editor3DVideoSequence | undefined;
  if (project.extensions?.hyperfocus3DVideo !== undefined) {
    const video: typeof import('./motion/scene3d/editor-3d-video-sequence.ts') = await import('./motion/scene3d/editor-3d-video-sequence.ts');
    timeline = video.readEditor3DVideoSequence(project);
    if (timeline) video.validateEditor3DVideoSequence(timeline, runtime.declaration);
  }
  const physicalPerformance = timeline ? runtime.compilePhysicalPerformance(timeline) : undefined;
  const diagnostics: unknown[] = [...runtime.diagnostics, ...(physicalPerformance?.diagnostics ?? [])];
  const shadows = createGameplayShadows3D({ declaration: runtime.declaration });
  const renderer = createWebGl2Renderer3D({ pixelRatio: () => globalThis.devicePixelRatio || 1,
    canvas,
    scene: runtime.scene,
    maxInstances: runtime.declaration.budgets.entities,
    clearColor: runtime.declaration.scenes.find((scene) => scene.id === runtime.declaration.activeSceneId)?.clearColor ?? [0.025, 0.045, 0.075, 1],
    maxDrawingBufferWidth: 3840,
    maxDrawingBufferHeight: 2160,
    maxDevicePixelRatio: 2,
    ...(shadows ? { directionalShadowMapSize: shadows.directionalShadowMapSize } : {}),
    onDiagnostic: (item) => diagnostics.push(item),
  });
  const postProcess = createGameplayPostProcess3D({ canvas });
  const impactOverlay = timeline?.impactFrames?.length ? createCanonicalImpactOverlay(canvas) : undefined;
  const impactTextures = impactOverlay ? createCanonicalImpactTextureSources(runtime.declaration, assets) : undefined;
  canvas.tabIndex = 0;
  const savePolicy = runtime.declaration.save;
  const audio = createStandaloneAudioController(assets, {
    combatAudio: readCombatProject3D(project.extensions?.hyperfocusCombat)?.audio,
    streamedMusic: options.streamedMusic,
    loadAsset: options.loadAsset,
    playlists: readCombatProject3D(project.extensions?.hyperfocusCombat)?.audio?.playlists,
    musicTransition: readCombatProject3D(project.extensions?.hyperfocusCombat)?.audio?.musicTransition,
    preloadAssetIds: combatPreloadAssets(readCombatProject3D(project.extensions?.hyperfocusCombat)?.audio),
    onError: (error) => diagnostics.push({ severity: "warning", code: "audio-runtime", message: error.message }),
  });
  let cancelAudioStage = () => {};
  const audioStage = createPlayableAssetStage({ host: canvas.parentElement ?? document.body, onCancel: () => cancelAudioStage(), prepare: options.loadAudioStage ? async () => { await audio.prepareAssets(await options.loadAudioStage!()); } : undefined });
  let queuedStarterAudio = false;
  const unlockAudio = () => {
    if (guide?.state.phase === 'sound') return;
    if (!gameplay.active && !queuedStarterAudio && runtime.declaration.audio.cues[0]) {
      queuedStarterAudio = true;
      audio.enqueue([{ type: 'play', commandId: '3d-first-input', sceneId: runtime.declaration.activeSceneId, entityId: 'runtime', componentId: 'audio', assetId: runtime.declaration.audio.cues[0], bus: 'sfx', gain: .22, pan: 0, loop: false, priority: 1 }]);
    }
    void audio.unlockAndFlush().catch((cause) => diagnostics.push({ severity: "warning", code: "audio-unlock", message: message(cause) }));
  };
  let hudLayout: HudLayoutStrategy = defaultHudLayout, hudWriteWork: Readonly<FighterBarWriteWork> | undefined, reticleWork: Readonly<ReticleGeometryWork> | undefined;
  const canvasGeometry = { width: 0, height: 0, left: 0, top: 0 };
  const gameplayUi = gameplay.active ? createGameplayPresentation3D({ canvas, onInteract: unlockAudio,
    reticleGeometry: () => hudLayout !== 'original' ? 'visible-only' : 'original', onReticleGeometryWork: work => { reticleWork = work; } }) : undefined;
  const developerTools = canvas.parentElement && new URLSearchParams(location.search).get('tools') === '1'
    ? (await import('./scene3d/game-menu/developer.ts')).createGameDeveloperTools({ host: canvas.parentElement, enabled: true }) : undefined;
  const storage = createIndexedDbSaveStorage({ maxBytes: savePolicy.maxBytes });
  const store = createSaveProfileStore(storage, project.id, { currentDataVersion: 0, limits: { maxBytes: savePolicy.maxBytes, maxSlots: 1 } });
  const slot = (requested?: string) => {
    const value = requested ?? savePolicy.slot;
    if (value !== savePolicy.slot) throw new Error(`3D save slot ${value} is not declared; expected ${savePolicy.slot}.`);
    return value;
  };
  const load = async (requested?: string) => {
    requireLocal();
    const saved = await store.loadSlot("local", slot(requested));
    requireLocal();
    if (!saved) return false;
    await audioStage.prepare();requireLocal();
    liveLearning?.invalidate();await worldAuthority.restore(readSaved3DSnapshot(saved.data));
    policyActivation?.reapply();lessonActivation?.reapply();await worldAuthority.settled();
    audio.stopScene(runtime.declaration.activeSceneId);
    return true;
  };
  hook.renderMode = "webgl2-3d";
  hook.assetCount = assets.length;
  hook.diagnostics = diagnostics;
  hook.snapshot = worldAuthority.snapshotSync;
  hook.snapshotAsync = worldAuthority.snapshot;
  if (location.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) {
    hook.photoCapture = {
      async renderAudio(capture) { const { renderCaptureAudio } = await import('./standalone/capture/audio.ts');return renderCaptureAudio({ ...capture, assets, loadAsset: options.loadAsset, combatAudio: readCombatProject3D(project.extensions?.hyperfocusCombat)?.audio, streamedMusic: options.streamedMusic }); },
      restore(snapshot) { requireCapture();const state = gameplay.restore(snapshot);liveLearning?.invalidate();localReview?.discard();directedFighters?.reset();runtime.resetPresentationTransforms();runtime.resetPresentationMaterialHistory();return state; },
      step(actions = []) { requireCapture();return gameplay.step(actions); },
      removedFighterEntityIds() { return photoCaptureRemovedFighterEntityIds.slice(); },
      renderFrame({ frameIndex, fps, actions = [] }) {
        requireCapture();
        if (!photoCapturePresentation) throw new Error('Set capture presentation before rendering.');
        const ticks = advancePhotoCaptureFrame(photoCapturePresentation, frameIndex, fps);
        for (let tick = 0; tick < ticks; tick += 1) gameplay.step(actions);
        const capturedAudio = [...(frameIndex === 0 ? captureStartupAudio : []), ...gameplay.drainAudio()];
        for (const sound of capturedAudio) if (sound.bus === 'music') captureMusic = sound;
        const previousFrameCount = hook.frameCount;
        renderingCaptureFrame = true;
        try { frame(photoCapturePresentation.startedAt + (photoCapturePresentation.elapsedMilliseconds ?? 0)); }
        finally { renderingCaptureFrame = false; }
        if (hook.frameCount !== previousFrameCount + 1 || hook.rendererStats?.skipped) throw new Error('Capture frame was not rendered. Close training or restore the graphics context before recording.');
        if (hook.rendererStats?.unsupportedLights) throw Error('Capture contains unsupported scene lighting.');
        if (!photoCapturePresentation.removeFighters) validateCaptureSubjects(captureSubjects);
        return { canvas: postProcess.source(), tick: gameplay.snapshot().tick, audio: capturedAudio, subjects: captureSubjects };
      },
      setPresentation(options) {
        requireLocal();
        const resume = photoCapturePresentation?.manual && !options.manual;
        if (options.manual) {
          for (const sound of gameplay.drainAudio()) if (sound.bus === 'music') captureMusic = sound;
          captureStartupAudio = captureMusic ? [captureMusic] : [];
        }
        photoCapturePresentation = Object.keys(options).length ? createPhotoCapturePresentation(options, performance.now()) : undefined;
        if (photoCapturePresentation?.freezeSimulation) audio.stopScene(runtime.declaration.activeSceneId);
        // Manual capture intentionally owns no running wall clock. Do not turn
        // inspection/export time into simulation catch-up on the first rAF.
        if (resume) { accumulator = 0;previous = performance.now();frameScheduler.schedule(); }
      },
    };
  }
  hook.save = async (requested) => { requireLocal();const snapshot = await worldAuthority.snapshot();requireLocal();await store.saveSlot("local", slot(requested), create3DSaveData(snapshot)); };
  hook.load = load;
  hook.reset = () => { requireLocal();liveLearning?.before({ actions: ['match:quit'] });liveLearning?.invalidate();audio.stopScene(runtime.declaration.activeSceneId);return worldAuthority.reset(); };
  hook.deleteSaveSlot = async (requested) => { requireLocal();await store.deleteSlot("local", slot(requested)); };
  hook.deleteSaveProfile = () => { requireLocal();return store.deleteProfile("local"); };
  hook.exportSaveProfile = async () => new TextDecoder().decode(await store.exportProfile("local"));
  hook.importSaveProfile = async (source, overwrite = false) => { requireLocal();await store.importProfile(source, overwrite); };
  hook.audioUnlocked = audio.isUnlocked;
  hook.music = audio.musicSnapshot;hook.nextMusic = audio.nextMusic;hook.retryMusic = audio.retryMusic;hook.audioResources = audio.resourceSnapshot;
  if (savePolicy.restoreOnBoot) {
    try { await load(); }
    catch (cause) { diagnostics.push({ severity: "warning", code: "save-runtime", message: message(cause) }); }
  }

  const held = new Set<string>(), bindingTaps = new Set<string>();
  const driveTap = createDriveTapInput({ mappings: project.settings.input });
  let reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false, pointerPause = false;
  const controls = createStandaloneControls({ canvas, mappings: project.settings.input.filter(mapping => mapping.action !== 'pause'), onInteract: unlockAudio, onPauseRequested: () => { pointerPause = true; }, onPaused: paused => { void audio.setPaused(network?.active ? false : paused); } });
  cancelAudioStage = () => { held.clear();bindingTaps.clear();controls.acknowledgeActions();gameplayUi?.acknowledgeActions(); };
  const combat = readCombatProject3D(project.extensions?.hyperfocusCombat);
  const uiFeedback = canvas.parentElement ? createUiAudioFeedback({ parent: canvas.parentElement, play: cue => { void audio.playUi(cue); } }) : undefined;
  const fighterBars = combat?.match ? createFighterBars({ canvas, definition: combat,
    writeStrategy: () => hudLayout !== 'original' ? 'changed-writes' : 'original', onWriteWork: work => { hudWriteWork = work; } }) : undefined;
  let practicePaused = false;
  const practiceUi = combat?.match ? createPracticeDiagnostics({ canvas, definition: combat, mappings: project.settings.input,
    setup() { if (!controls.paused) controls.togglePause();gameplayUi?.openPracticeSetup();clear(); },
    reset() { clear();gameplayUi?.command('practice:reset');canvas.focus({ preventScroll: true }); },
    opened() { practicePaused = !controls.paused;if (practicePaused) controls.togglePause();clear(); },
    closed() { if (practicePaused && controls.paused) controls.togglePause();practicePaused = false;clear(); },
  }) : undefined;
  if (combat?.match) mountStandaloneFightScreen(canvas);
  const player = combat?.fighters.find(fighter => fighter.control === 'player');
  const combatOwned = new Set(combat && player ? ['guard', 'tech', 'reset', ...combat.config.moves.flatMap(move => move.command)].map(action => player.actionPrefix + action) : []);
  if (combat && player) {
    controls.setActionLabels(new Map(project.settings.input.map(input => [input.action, input.action.startsWith(player.actionPrefix) ? input.action.slice(player.actionPrefix.length).replace('lockon', 'Lock on / free movement') : input.action.replaceAll('-', ' ')])));
  }
  const mappedActions = new Set(project.settings.input.map(mapping => mapping.action));
  let representedActionSignature = '';
  audio.setMasterVolume(combat?.audio?.mix?.master ?? project.settings.masterVolume ?? 0.5);
  createStandaloneSaveControls({ canvas, slots: [savePolicy.slot], defaultSlot: savePolicy.slot, maxBytes: savePolicy.maxBytes, save: hook.save, restore: load, exportProfile: hook.exportSaveProfile, importProfile: hook.importSaveProfile });
  const isMappedKey = (code: string) => project.settings.input.some(mapping => mapping.bindings.includes(code));
  const physicalKeys = new Set<string>(), trainingRelease = createTrainingReleaseInput(), inputDevice = create3DInputDevice();
  const clear = () => { held.clear();bindingTaps.clear();driveTap.reset(); };
  let replayAppearance: ReplayAppearance | undefined;
  let rewards: ReturnType<typeof createStandaloneRewards> | undefined;
  let requestedPracticeLesson = '';
  const appearance = combat ? createStandaloneAppearance({ project, runtime, canvas, storage, combat, requireWorld: () => requireMainWorld('appearance changes'), presentFighter: directedFighters?.preview, canEquip: (slot, option) => rewards?.canEquip(slot, option) ?? (slot !== 'recovery-style' || option === 'stand-up'), onTarget: target => rewards?.target(target), onInteract: unlockAudio, clearInput: clear, network: () => network, replayAppearance: () => replayAppearance, profileHost: roomType => networkPanel?.profileHost(roomType) }) : undefined;
  if (appearance) hook.wardrobe = () => appearance.state;
  rewards = appearance ? createStandaloneRewards({ canvas, projectId: project.id, storage, catalog: appearance.catalog, network: () => network, equip: appearance.equip, equipLook: appearance.equipLook, previewTarget: appearance.previewTarget, practiceLesson(id) { if (network?.active) return;if (controls.paused) controls.togglePause();requestedPracticeLesson = id;gameplayUi?.command('match:practice'); }, clearInput: clear }) : undefined;
  const editingText = () => rewards?.focused || appearance?.focused || standaloneUiOwnsKeyboard({ target: document.activeElement });
  const onlineButtonKey = (event: KeyboardEvent) => isOnlineSetButtonKey({ result: (network?.session?.confirmedMatch ?? network?.terminalPresentation?.match)?.phase === 'match-result', key: event.key, target: event.target });
  window.addEventListener("keydown", (event) => { physicalKeys.add(event.code);if (event.defaultPrevented || canvas.parentElement?.querySelector('dialog[open]') || editingText() || onlineButtonKey(event)) return;held.add(event.code); if (!event.repeat) { bindingTaps.add(event.code);driveTap.recordKeyboard({ binding: event.code, down: true, timeMs: event.timeStamp }); }if (isMappedKey(event.code)) event.preventDefault(); unlockAudio(); });
  window.addEventListener("keyup", (event) => { physicalKeys.delete(event.code);trainingRelease.releaseKeyboard({ binding: event.code });held.delete(event.code);if (editingText() || onlineButtonKey(event)) return;driveTap.recordKeyboard({ binding: event.code, down: false, timeMs: event.timeStamp }); if (isMappedKey(event.code)) event.preventDefault(); });
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", () => { trainingRelease.capture({ keyboard: physicalKeys, gamepad: poll3DGamepadInput().bindings });clear();network?.setVisibility({ visible: !document.hidden }); });
  const playedAudioEvents = new Set<string>();
  let previous = performance.now(), accumulator = 0, previousTick = 0, gameplayAudioId = 0, previousPhysicsOverflows = 0;
  const experiments = combat ? createGameExperiments({ onChange(flags) {
    const { mainPhysics, environmentMotion, ai, combat, koPhysics, traffic, hazards } = flags;
    runtime.setDiagnosticFeatures({ mainPhysics, environmentMotion, ai, combat, koPhysics, traffic, hazards });
    if (![flags.simulation, mainPhysics, environmentMotion, ai, combat, koPhysics, traffic, hazards].every(Boolean)) localReview?.discard();
  } }) : undefined;
  const gamePerformance = createGamePerformance({ canvas, contentId: policyContentId, experiments });
  hook.performance = { snapshot: gamePerformance.snapshot, clear: gamePerformance.clear, setHudLayout(value) { if (!experiments) throw Error('HUD experiments require combat gameplay.');experiments.setHudLayout(value); } };
  const frameScheduler = createGameFrameScheduler({ frame: now => frame(now), vsync: () => document.hidden || !!bulkTraining?.open || gamePerformance.vsync });
  const pauseInput = createPauseInputGate();
  let onlineMenu = false;
  const padMenu = createGamepadMenu({ canvas, mappings: project.settings.input });
  const inputSettings = createRuntimeControls({ canvas, mappings: project.settings.input, onReducedMotion: value => { reducedMotion = value;if (canvas.parentElement) canvas.parentElement.dataset.reducedMotion = String(value); }, performance: gamePerformance.section, initialAudio: { ...combat?.audio?.mix, master: combat?.audio?.mix?.master ?? project.settings.masterVolume ?? .5 }, onAudioMix: value => audio.setMixVolumes(value), music: { snapshot: audio.musicSnapshot, next: audio.nextMusic, retry: audio.retryMusic, title: id => { const name = Reflect.get(project.assets?.find(asset => asset.id === id) ?? {}, 'name');return typeof name === 'string' ? name : id; } } });
  let networkPanel: ReturnType<typeof createCombatConnectionPanel> | undefined;
  const uploads = createStandaloneUploads({ project, runtime, combat, network: () => network, visibility: () => networkPanel?.uploadVisibility() });
  hook.uploadedAppearance = () => uploads.state;
  let replayPanel: ReturnType<typeof createCombatReplayPanel> | undefined;
  let replayShare: ReturnType<typeof createReplaySharePanel> | undefined;
  let rivalry: ReturnType<typeof createFriendRivalry> | undefined;
  let networkSeat = 0, audioListener: string | undefined, audioListenerGame: typeof gameplay | undefined;
  let networkInput = { actions: new Array<string>(), direction: { x: 0, y: 0, z: 0 } };
  let confirmedAudio: ReturnType<typeof gameplay.drainAudio> = [];
  if (combat?.match && Object.keys(options.behaviors ?? {}).length === 0) localReview = createLocalExchangeReview({ game: localGameplay, clear() { if (!localReview?.state.active) { policyActivation?.reapply();lessonActivation?.reapply(); }clear();audio.stopScene(runtime.declaration.activeSceneId);accumulator = 0; } });
  const opponentRoutine = combat?.match && localReview ? createOpponentRoutine({ game: localGameplay, definition: combat, clear, requireWorld: () => { requireMainWorld('opponent routines');audioStage.requireReady(); } }) : undefined;
  let libraryPaused = false;
  const practiceLibrary = localReview && opponentRoutine && policyContentId ? createPracticeLibrary({ canvas, projectId: project.id, contentId: policyContentId, review: {
      get state() { return workerRuntime?.host ? workerRuntime.latest?.services.review ?? localReview!.state : localReview!.state; },
      async save() { return workerRuntime?.host ? (await workerRuntime.command({ type: 'review-save' })).exchange : localReview!.save(); },
      async load(exchange) { await audioStage.prepare();if (workerRuntime?.host) await workerRuntime.command({ type: 'review-load', exchange });else localReview!.load(exchange); },
    }, routine: opponentRoutine,
    opened() { libraryPaused = !controls.paused && !(workerRuntime?.host ? workerRuntime.latest?.services.review?.active : localReview?.state.active);if (libraryPaused) controls.togglePause();clear(); },
    closed() { if (libraryPaused && controls.paused) controls.togglePause();libraryPaused = false;clear(); },
    resume() { if (controls.paused) controls.togglePause();libraryPaused = false;clear(); },
  }) : undefined;
  const localInputActions = combat ? new Set(combatInputActions3D({ definition: combat })) : new Set<string>();
  hook.localReview = () => workerRuntime?.host ? workerRuntime.latest?.services.review : localReview?.state;
  const guideKey = `tod-guided-fight:${project.id}:v1`;
  let firstGuide = true;try { firstGuide = localStorage.getItem(guideKey) !== 'acknowledged'; } catch { /* Session guidance still works without storage. */ }
  if (combat?.match && player && localReview) guide = createGuidedFight({ firstTime: firstGuide, playerId: player.entityId, opponentId: combat.fighters.find(fighter => fighter.control !== 'player')!.entityId,
    command(actions) { requireMainWorld('guided fights');localGameplay.step(actions);clear();accumulator = 0; }, sound() { inputSettings.openAudio(); },
    acknowledge() { try { localStorage.setItem(guideKey, 'acknowledged'); } catch { /* Session-only dismissal is valid. */ } }, leaveReview() { if (localReview?.state.active) localReview.leave(); } });
  const guideSpotlight = guide ? createGuidedSpotlight({ canvas, playerId: player!.entityId }) : undefined;
  hook.guidedFight = () => guide?.state;
  if (combat?.match && player) tutorial = createCombatTutorial({ canvas, game: localGameplay, definition: combat, mappings: project.settings.input, guide, requireWorld: () => { requireMainWorld('tutorials');audioStage.requireReady(); },
    recordMastery: rewards?.recordMastery,
    awardLesson: rewards ? lessonId => rewards!.awardTutorialLesson({ lessonId, source: 'player' }) : undefined,
    clear() { clear();gameplayUi?.acknowledgeActions();audio.stopScene(runtime.declaration.activeSceneId);accumulator = 0; },
    resume() { if (controls.paused) controls.togglePause(); } });
  hook.tutorial = () => tutorial?.state;
  let connectionAttempt = 0, queueWarmup = false;
  let warmupCheckpoint: ReturnType<typeof localGameplay.checkpoint> | undefined;
  function stopQueueWarmup() { if (!queueWarmup) return;queueWarmup = false;warmupCheckpoint?.restore();warmupCheckpoint = undefined;clear();accumulator = 0; }
  function startQueueWarmup() {
    if (network?.state.quickPlay?.phase !== 'searching' || network.session || queueWarmup) return;
    warmupCheckpoint = localGameplay.checkpoint();queueWarmup = true;onlineMenu = false;gameplay = localGameplay;
    gameplay.step(['match:practice']);gameplay.step([]);clear();canvas.focus({ preventScroll: true });
  }
  function leaveOnline() {
    stopQueueWarmup();connectionAttempt++;
    if (network?.state.canSaveReplay) replay?.remember(network.exportReplay());
    network?.leave();
  }
  if (combat?.match && player && supportsStandaloneCombatConnections(migrateProject(project)) && Object.keys(options.behaviors ?? {}).length === 0 && crypto.subtle) {
    const contentId = policyContentId!;
    if (canvas.parentElement && developerTools) {
      const [{ createAiReportExport }, { createBulkTrainingPanel }] = await Promise.all([import('./scene3d/fight-hud/ai-report.ts'), import('./scene3d/bulk-training/panel.ts')]);
      aiReport = createAiReportExport({ host: canvas.parentElement, read: () => { if (!renderingCaptureFrame) requireMainWorld('AI reports');return localGameplay.aiReport(); }, contentIdentity: contentId });
      bulkTraining = createBulkTrainingPanel({ host: canvas.parentElement, project, assets, contentIdentity: contentId, policyStore, contextualStore, liveLearning, sharedPolicy });
    }
    replay = createCombatReplayController({
      prepare: audioStage.prepare,
      create(recording, look) {
        requireMainWorld('replay theater');audioStage.requireReady();
        if (localReview?.state.active) throw new Error('Return to the match result before opening another replay.');
        if (network?.active) throw new Error('Leave the online bout before opening a replay.');
        if (look && !appearance) throw new Error('This game cannot display the recorded fighter appearance.');
        appearance?.validateReplayAppearance(look);
        const previousGame = gameplay.checkpoint();
        try { localGameplay.reset();return createCombatReplay3D({ project, runtime, recording, contentId }); }
        catch (cause) { previousGame.restore();policyActivation?.reapply();lessonActivation?.reapply();throw cause; }
      },
      changed(session, look) { replayAppearance = look;gameplay = session?.game ?? localGameplay;if (!session) localGameplay.reset();accumulator = 0; },
      clear() { clear();audio.stopScene(runtime.declaration.activeSceneId);accumulator = 0; },
    });
    replayPanel = createCombatReplayPanel({ canvas, onWatchExample() { gameplayUi?.command('match:theater'); }, onOpen: file => replay!.open(file), onReviewRecent: () => replay!.openRecent(), onSaveRecent: () => downloadCombatReplay(replay!.exportRecent()), onToggle: () => replay!.toggle(), onSeek: frame => replay!.seek(frame),
      onNextDamage: () => replay!.findNextDamage(), onTakeOver: seat => replay!.takeOver(seat), onLeave: () => replay!.leave(), onInteract: unlockAudio });
    hook.replay = () => replay!.state;
    network = createCombatConnection({
      validateProfiles: profiles => appearance?.validateProfiles(profiles),
      createSession(match, localPeerId, sendInput, mode = 'set') {
        stopQueueWarmup();
        requireMainWorld('online play');
        networkSeat = match.seats.indexOf(localPeerId);
        if (mode === 'training') trainingRelease.capture({ keyboard: physicalKeys, gamepad: poll3DGamepadInput().bindings });
        clear();localGameplay.reset();audio.stopScene(runtime.declaration.activeSceneId);confirmedAudio = [];
        const session = createNetworkCombatSession({ project, runtime, match, contentId, localPeerId, mode, getLocalInput: () => networkInput, sendInput,
          onConfirmedAudio: cue => { confirmedAudio.push(cue.event); } });
        gameplay = session.game;return session;
      },
      createSpectator(match, onCursor) {
        requireMainWorld('spectating');
        networkSeat = 0;
        clear();localGameplay.reset();audio.stopScene(runtime.declaration.activeSceneId);confirmedAudio = [];
        const session = createNetworkCombatSpectator({ project, runtime, match, contentId, onCursor,
          onConfirmedAudio: cue => { confirmedAudio.push(cue.event); } });
        gameplay = session.game;return session;
      },
      onLeave() { gameplay.reset();gameplay = localGameplay;localGameplay.reset();clear();confirmedAudio = [];audio.stopScene(runtime.declaration.activeSceneId);accumulator = 0; },
      onBattleEnd(terminal) { if (!terminal) { gameplay = localGameplay;localGameplay.reset(); }clear();confirmedAudio = [];audio.stopScene(runtime.declaration.activeSceneId);accumulator = 0; },
      onChange() { if (queueWarmup && network?.state.quickPlay?.phase !== 'searching') stopQueueWarmup();if (!queueWarmup) clear();if (network?.active && controls.paused) controls.togglePause();networkPanel?.render(network!.state, true); },
    });
    networkPanel = createCombatConnectionPanel({ canvas, contentId, hostedOrigin: location.origin, hasAppearance: !!appearance, connect: async details => { const attempt = ++connectionAttempt;await audioStage.prepare();if (attempt !== connectionAttempt) throw Error('Connection cancelled.');requireMainWorld('online play');if (replay?.active || localReview?.state.active) throw new Error('Return to local play before joining a room.');return network!.connect({ ...details, initialProfile: appearance?.initialProfile() }); }, leave: leaveOnline, onInteract() { if (guide?.state.active) guide.handle(new Set(['guide:skip-all']));if (network?.active) onlineMenu = false;unlockAudio(); },
      reviewFight() { if (!network?.active || network.state.roomType !== 'tod-quick-play' || network.state.quickPlay?.phase !== 'result' || !network.state.canSaveReplay) throw new Error('This result is no longer available to review.');leaveOnline();replayPanel!.reviewRecent(); },
      shareReplay() { if (network?.state.canSaveReplay) replayShare?.show(network.exportReplay()); },
      practiceWhileSearching: startQueueWarmup, queueWarmup: () => queueWarmup, stopWarmup: stopQueueWarmup,
      practiceOffline() { if (!['idle', 'searching'].includes(network?.state.quickPlay?.phase ?? '')) return;leaveOnline();gameplayUi?.command('match:practice'); },
      queue: enabled => network!.queue(enabled), ready: battleId => network!.ready(battleId), social: command => network!.social(command), quickPlay: command => network!.quickPlay(command),
      training: command => network!.training(command),
      voice: command => network!.voice(command),
      requestUpload: uploads.request, textureSlots: uploads.textureSlots,
      saveReplay() { return downloadCombatReplay(network!.exportReplay()); } });
    hook.network = () => network!.state;
    rivalry = createFriendRivalry({ storage, projectId: project.id });
    replayShare = createReplaySharePanel({ canvas, create: archive => network!.shareReplay(archive), download: downloadCombatReplay,
      prepare: () => replayPanel!.prepare(), open: file => replay!.open(file), cancelOpen: () => replay!.leave(), interact() { clear();unlockAudio();if (guide?.state.active) guide.handle(new Set(['guide:skip-all'])); } });
    window.addEventListener('pagehide', () => replayShare?.dispose(), { once: true });
    network.setVisibility({ visible: !document.hidden });
    network.onVoiceSignal(networkPanel.receiveVoice);
    network.onVoiceReport(networkPanel.receiveVoiceReport);
    network.onUploadInvalidate(ownerId => { networkPanel!.invalidateUploads(ownerId);uploads.invalidate(ownerId); });
    hook.voice = networkPanel.voiceState;hook.voiceStats = networkPanel.voiceStats;
  }
  workerRuntime = options.world?.({
    project, assets, canvas, hook, runtime, combat, timeline, contextualStore, learnedPolicy, learnedModel,
    worldAuthority, controls, inputView, renderer, shadows, postProcess, impactOverlay, impactTextures, gameplayUi,
    fighterBars, appearance, uploads, rewards, audio, pauseInput, padMenu, inputSettings, inputDevice, driveTap, held, bindingTaps,
    frameScheduler, gamePerformance, diagnostics, liveLearning, bulkTraining, practiceLibrary, clear, editingText,
    get reducedMotion() { return reducedMotion; },
    get capturePresentation() { return photoCapturePresentation; },
    set capturePresentation(value) { photoCapturePresentation = value; },
    takePointerPause() { const requested = pointerPause;pointerPause = false;return requested; },
    rebase() { previous = performance.now();accumulator = 0; },
    requireStart() {
      audioStage.requireReady();
      if (Object.keys(options.behaviors ?? {}).length) throw Error('Custom behaviors require the standard playable.');
      if (network?.active || replay?.active || localReview?.state.active || tutorial?.active || guide?.state.active || opponentRoutine?.state.running || bulkTraining?.open || appearance?.focused || appearance?.state.busy || rewards?.focused || practiceLibrary?.focused)
        throw Error('Return to local play before starting the worker.');
    },
    mainSnapshot: () => gameplay.snapshot(),
    renderOracle(now) { renderingCaptureFrame = true;try { frame(now); }finally { renderingCaptureFrame = false; } },
  });
  const suspendTrainingFrame = (now: number, bindings: ReadonlySet<string>) => {
    previous = now;accumulator = 0;clear();controls.acknowledgeActions();gameplayUi?.acknowledgeActions();
    trainingRelease.capture({ keyboard: physicalKeys, gamepad: bindings });
    const actions = new Set<string>();
    pauseInput.step({ actions, paused: controls.paused, handlesStart: gameplay.handlesStart });
    inputSettings.apply({ actions, keyboard: new Set(), gamepad: new Set(), active: false });
    networkInput = { actions: [], direction: { x: 0, y: 0, z: 0 } };
    gamePerformance.resetWindow();frameScheduler.schedule();
  };
  const frame = (now: number) => {
    experiments?.allow(!network?.active && !replay?.active && !localReview?.state.active && !guide?.state.active && !tutorial?.active && !opponentRoutine?.state.running && !workerRuntime?.host);
    gamePerformance.present(now);
    if (workerRuntime?.frame(now, renderingCaptureFrame)) return;
    if (photoCapturePresentation?.manual && !renderingCaptureFrame) return;
    if (document.hidden && !renderingCaptureFrame) { previous = now;accumulator = 0;gamePerformance.resetWindow();frameScheduler.schedule();return; }
    const measuring = gamePerformance.enabled && !renderingCaptureFrame;
    const frameStarted = measuring ? performance.now() : 0;
    hudLayout = experiments?.hudLayout ?? defaultHudLayout;
    // The standalone fight stage has a stable canvas box while it stays in fight
    // layout. Menus can resize it: discard this read on a layout transition and
    // remeasure after menu writes. Never retain geometry across display frames.
    const earlyGeometry = hudLayout !== 'original' && canvas.parentElement?.classList.contains('hf-fight-stage') && canvas.parentElement.dataset.fightPhase === 'fight'
      ? readCanvasGeometry(canvas, canvasGeometry) : undefined;
    let hudGeometryReads = earlyGeometry ? 4 : 0;
    const tutorialDeltaMs = Math.max(0, now - previous);
    // Keep the dialog interactive without compiling or drawing the frozen game.
    // Availability comes first: training must never suspend an online session.
    bulkTraining?.available(!network?.active && !replay?.active && !localReview?.state.active);
    if (bulkTraining?.open) {
      const pad = inputDevice.poll();
      padMenu.poll({ ...pad, mode: 'menu', controller: inputDevice.controller });
      suspendTrainingFrame(now, pad.bindings);return;
    }
    if ((network?.active || replay?.active || localReview?.state.active) && controls.paused) { if (network?.active) onlineMenu = !onlineMenu;controls.togglePause(); }
    if (!network?.active) onlineMenu = false;
    replay?.advanceSeek();
    const droppedMs = controls.paused || photoCapturePresentation?.freezeSimulation ? 0 : Math.max(0, accumulator * 1000 + tutorialDeltaMs - 250);
    accumulator = controls.paused || photoCapturePresentation?.freezeSimulation ? 0 : Math.min(0.25, accumulator + Math.max(0, (now - previous) / 1000)); previous = now;
    const actions = controls.readActions();
    if (network?.active || replay?.active) requestedPracticeLesson = '';
    if (requestedPracticeLesson && gameplay.combatMatch()?.phase === 'practice') { actions.add(`practice:${requestedPracticeLesson}`);requestedPracticeLesson = ''; }
    if (pointerPause) { actions.add('pause');pointerPause = false; }
    if (reducedMotion) actions.add('reduced-motion');
    const rawPad = inputDevice.poll(), released = trainingRelease.filter({ keyboard: physicalKeys, gamepad: rawPad.bindings });
    const gamepad = { ...rawPad, bindings: released.gamepad };
    for (const key of held) if (!released.keyboard.has(key)) { held.delete(key);bindingTaps.delete(key); }
    const onlineResult = (network?.session?.confirmedMatch ?? network?.terminalPresentation?.match)?.phase === 'match-result';
    const spectating = network?.active && network.state.role === 'spectator';
    const nextAudioListener = network?.active ? combat?.fighters[networkSeat]?.entityId : replay?.active ? combat?.fighters[replay.state.controlledSeat ?? 0]?.entityId : player?.entityId;
    if (nextAudioListener !== audioListener || gameplay !== audioListenerGame) { gameplay.setAudioListener({ fighterId: nextAudioListener });audioListener = nextAudioListener;audioListenerGame = gameplay; }
    if (spectating && network!.state.status === 'catching-up') network!.tick({ catchUp: true });
    const fighting = !spectating && gameplay.presentation?.layout === 'fight' && (!replay?.active || replay.state.controlledSeat !== undefined) && (!network?.active || queueWarmup || Boolean(network.session) && !onlineResult);
    const mode = queueWarmup ? 'practice' : guide?.state.phase && (['sound', 'welcome', 'complete'].includes(guide.state.phase) || ['intro', 'countdown'].includes(gameplay.presentation?.layout ?? '')) ? 'menu' : localReview?.state.active ? localReview.state.playing ? 'play' : 'menu' : onlineMenu ? 'menu' : replay?.active ? 'play' : network?.active ? onlineResult ? 'menu' : 'play' : controls.paused || ['menu', 'result', 'intro'].includes(gameplay.presentation?.layout ?? '') ? 'menu' : gameplay.presentation?.actions?.some(action => action.action === 'practice:reset') ? 'practice' : 'play';
    const routedPad = padMenu.poll({ ...inputSettings.poll({ ...gamepad, visible: mode !== 'play' }), controller: inputDevice.controller,
      mode: replay?.active ? replay.state.controlledSeat === undefined ? 'menu' : 'practice' : mode,
      navigationToggle: replay?.active ? project.settings.input.find(mapping => mapping.action === 'pause')?.bindings.filter(binding => binding.startsWith('Gamepad')) ?? ['Gamepad.Button9'] : undefined });
    // Controller confirmation can open training during this frame's menu poll.
    if (bulkTraining?.open) { suspendTrainingFrame(now, rawPad.bindings);return; }
    for (const action of gameplayUi?.readActions() ?? []) actions.add(action);
    if (!audioStage.ready() && [...actions].some(action => !['reduced-motion', 'guide:skip-all', 'guide:sound', 'match:quit', 'match:menu'].includes(action))) {
      audioStage.request();accumulator = 0;frameScheduler.schedule();return;
    }
    if (opponentRoutine?.state.running && (actions.has('practice:reset') || actions.has(player?.actionPrefix + 'reset'))) {
      opponentRoutine.reset();actions.delete('practice:reset');actions.delete(player?.actionPrefix + 'reset');
      if (controls.paused) controls.togglePause();gameplayUi?.acknowledgeActions();accumulator = 0;
    }
    if (opponentRoutine?.state.running && [...actions].some(action => action.startsWith('match:') || action.startsWith('practice:') || action.startsWith('guide:'))) opponentRoutine.stop();
    if (tutorial?.watching && [...actions].some(action => action.startsWith('guide:') || action.startsWith('practice:') || action.startsWith('match:'))) {
      tutorial.close();
      // Closing playback restores the attempt and clears its simulation clock.
      // A visible Reset command still needs one ordinary simulation step.
      if (actions.has('practice:reset')) accumulator = simulationStepSeconds;
    }
    const guideAction = !network?.active && !replay?.active ? guide?.handle(actions) : false;
    if (guideAction) { if (guideAction !== 'menu' && controls.paused) controls.togglePause();clear();gameplayUi?.acknowledgeActions(); }
    if (!network?.active && !replay?.active && localReview) {
      const reviewAction = [...actions].find(action => action.startsWith('review:'));
      if (reviewAction) {
        liveLearning?.invalidate();
        if (reviewAction === 'review:open') localReview.open();
        if (reviewAction === 'review:practice') localReview.state.active ? localReview.retry() : localReview.open(true);
        if (reviewAction === 'review:watch') localReview.watch();
        if (reviewAction === 'review:resume') localReview.toggle();
        if (reviewAction === 'review:leave') localReview.leave();
        if (reviewAction === 'review:save') practiceLibrary?.saveExchange();
        actions.clear();gameplayUi?.acknowledgeActions();
      }
    }
    if (network?.active && actions.has('match:leave')) { leaveOnline();actions.clear();accumulator = 0; }
    if (network?.active && network.state.canSaveReplay && actions.has('match:share')) { replayShare?.show(network.exportReplay());actions.clear();gameplayUi?.acknowledgeActions(); }
    if (network?.active && network.state.canSaveReplay && actions.has('match:review')) { leaveOnline();replayPanel?.reviewRecent();actions.clear();gameplayUi?.acknowledgeActions(); }
    for (const mapping of project.settings.input) if (acceptsPhysicalCombatAction(mapping.action, mode === 'practice') && mapping.bindings.some((binding) => held.has(binding) || bindingTaps.has(binding) || routedPad.bindings.has(binding))) actions.add(mapping.action);
    const localDirection = inputView.direction({ actions, axes: routedPad.axes });
    if ((routedPad.axes?.[0] ?? 0) < -0.3) actions.add("move-left");
    if ((routedPad.axes?.[0] ?? 0) > 0.3) actions.add("move-right");
    if ((routedPad.axes?.[1] ?? 0) < -0.3) actions.add("move-up");
    if ((routedPad.axes?.[1] ?? 0) > 0.3) actions.add("move-down");
    inputSettings.apply({ actions, keyboard: held, gamepad: routedPad.bindings, active: !controls.paused && !photoCapturePresentation?.freezeSimulation && !editingText() && fighting });
    const sessionPaused = localReview?.state.active ? !localReview.state.playing : replay?.active ? !replay.state.playing : controls.paused || onlineMenu;
    if (queueWarmup && actions.has('pause')) { stopQueueWarmup();actions.delete('pause');gameplayUi?.acknowledgeActions(); }
    const pause = pauseInput.step({ actions, paused: sessionPaused, handlesStart: !network?.active && !replay?.active && !localReview?.state.active && gameplay.handlesStart && gameplay.presentation?.layout !== 'countdown' });
    if (pause.toggle) { if (localReview?.state.active) localReview.toggle();else if (network?.active) onlineMenu = !onlineMenu;else if (replay?.active) replay.toggle();else controls.togglePause(); }
    controls.presentPause(localReview?.state.active ? !localReview.state.playing : replay?.active ? !replay.state.playing : controls.paused || onlineMenu);
    if (pause.consumed) { accumulator = 0;bindingTaps.clear();controls.acknowledgeActions();gameplayUi?.acknowledgeActions(); }
    const settingsFocused = editingText() || practiceUi?.focused || document.activeElement instanceof HTMLElement && Boolean(document.activeElement.closest('.hf-runtime-controls[open], .hf3d-control-disclosure[open]'));
    const resetting = [...actions].some(action => action.endsWith(':reset') || action === 'match:quit') || [...(gameplayUi?.readActions() ?? [])].some(action => action.startsWith('match:'));
    for (const action of driveTap.poll({ nowMs: now, keyboard: held, gamepad: routedPad.bindings, gamepadConnected: gamepad.axes !== undefined, active: !controls.paused && !photoCapturePresentation?.freezeSimulation && !pause.consumed && !resetting && !settingsFocused && !routedPad.navigating && fighting })) actions.add(action);
    if (controls.paused && actions.has('match:quit')) { controls.togglePause();liveLearning?.before({ excluded: !!experiments?.tainted || !!network?.active || !!replay?.active || !!localReview?.state.active, actions });gameplay.step(['match:quit']);actions.clear();clear();accumulator = 0;gameplayUi?.acknowledgeActions(); }
    if (controls.paused && [...actions].some(action => action.startsWith('practice:'))) { controls.togglePause();accumulator = simulationStepSeconds; }
    if (controls.paused) { accumulator = 0;bindingTaps.clear();gameplayUi?.acknowledgeActions(); }
    if (!network?.active && !replay?.active && guide?.state.phase && ['sound', 'welcome', 'complete'].includes(guide.state.phase)) { accumulator = 0;actions.clear(); }
    if ((network?.active || replay?.active) && combat && player) {
      const camera = inputView.camera();
      networkInput = networkCombatInput({ actions, direction: localDirection, prefix: player.actionPrefix, allowed: new Set(combatInputActions3D({ definition: combat })), eye: camera.position, target: camera.target, enabled: !onlineMenu && !spectating && !settingsFocused && !networkPanel?.focused && document.hasFocus() && !document.hidden });
      if (!spectating && network?.state.roomType === 'combat-relay' && actions.has('match:rematch') && onlineResult) networkInput.actions.push('match:rematch');
    }
    if (practiceLibrary?.focused) { accumulator = 0;actions.clear(); }
    if (experiments?.flags.simulation === false) accumulator = [...actions].some(action => action.startsWith('match:') || action.startsWith('practice:')) ? simulationStepSeconds : 0;
    if (!audioStage.ready() && [...actions].some(action => !['reduced-motion', 'guide:skip-all', 'guide:sound', 'match:quit', 'match:menu'].includes(action))) { audioStage.request();accumulator = 0;frameScheduler.schedule();return; }
    const simulationStarted = measuring ? performance.now() : 0;let simulationSteps = 0;
    while (accumulator >= simulationStepSeconds) {
      simulationSteps++;
      if (tutorial?.active && player && !network?.active && !replay?.active && !localReview?.state.active && !opponentRoutine?.state.running && !tutorial.focused && !practiceUi?.focused
        && (actions.has('practice:reset') || actions.has(player.actionPrefix + 'reset')) && practiceResetPressed(actions, gameplay.combatMatch(), player.actionPrefix + 'reset')) {
        if (tutorial.watching) { tutorial.close();accumulator = simulationStepSeconds; }
        tutorial.reset();
      }
      const excludeLearning = !!experiments?.tainted || !!network?.active || !!replay?.active || !!localReview?.state.active || !!tutorial?.watching || !!opponentRoutine?.state.running;
      liveLearning?.before({ excluded: excludeLearning, actions });
      const hasTap = [...actions].some(action => action.endsWith(':jump-tap')), beforeTapFrame = hasTap ? gameplay.snapshot().combat?.state.frame : undefined;
      if (replay?.active) replay.tick(networkInput);else if (queueWarmup) gameplay.step(actions, undefined, localDirection);else if (network?.active) network.tick();else if (tutorial?.watching) tutorial.step();else if (opponentRoutine?.state.running && player) { const camera = inputView.camera();opponentRoutine.step(networkCombatInput({ actions, direction: localDirection, prefix: player.actionPrefix, allowed: localInputActions, eye: camera.position, target: camera.target, enabled: !practiceUi?.focused && !tutorial?.focused })); }else if (localReview && (!experiments?.tainted || localReview.state.active)) localReview.step((tutorial?.focused || practiceUi?.focused) ? [] : actions, (tutorial?.focused || practiceUi?.focused) ? undefined : localDirection);else gameplay.step((tutorial?.focused || practiceUi?.focused) ? [] : actions, undefined, (tutorial?.focused || practiceUi?.focused) ? undefined : localDirection);if (!network?.active && !replay?.active && !localReview?.state.active && !tutorial?.watching && !tutorial?.focused && !practiceUi?.focused && practiceUi?.captureEvidence) practiceUi.record(gameplay.snapshot(), actions);
      liveLearning?.after({ excluded: excludeLearning });
      if (!hasTap || gameplay.snapshot().combat?.state.frame !== beforeTapFrame) { driveTap.acknowledge();for (const action of actions) if (action.endsWith(':jump-tap')) actions.delete(action);networkInput.actions = networkInput.actions.filter(action => action !== 'jump-tap'); }
      controls.acknowledgeActions();gameplayUi?.acknowledgeActions();bindingTaps.clear();accumulator -= simulationStepSeconds;
    }
    const presentationStarted = measuring ? performance.now() : 0;
    let basePresented = onlineMenu ? { layout: 'menu' as const, title: 'Menu', overlay: { title: 'Menu', body: 'The online fight continues.' }, actions: [{ action: 'pause', label: 'Back to fight' }] } : replay?.active ? { layout: 'fight' as const, title: 'Replay', actions: [] } : network?.active && !queueWarmup ? network.state.roomType === 'tod-training' ? { layout: 'fight' as const, title: 'Shared training', actions: [] } : onlineSetPresentation({ match: network.session?.confirmedMatch ?? network.terminalPresentation?.match, localSeat: networkSeat, spectator: spectating, community: network.state.roomType === 'tod-community', quickPlay: network.state.roomType === 'tod-quick-play' }) : controls.paused && combat?.match ? { layout: 'menu' as const, title: 'Paused', overlay: { title: 'Paused', body: '' }, hint: combatControlPresentation({ presentation: gameplay.presentation, definition: combat, mappings: project.settings.input, controller: inputDevice.controller })?.hint, actions: [{ action: 'pause', label: 'Resume' }, ...(gameplay.presentation?.actions?.filter(action => action.action.startsWith('practice:')) ?? []), { action: 'match:quit', label: 'Main menu' }] } : combatControlPresentation({ presentation: controllerPresentation({ presentation: gameplay.presentation, connected: inputDevice.controller }), definition: combat, mappings: project.settings.input, controller: inputDevice.controller, practice: gameplay.presentation?.actions?.some(action => action.action === 'practice:reset') });
    if (network?.active) {
      const history = rivalry?.observe({ state: network.state, match: network.session?.confirmedMatch });
      if (history && basePresented?.layout === 'result' && basePresented.overlay) basePresented = { ...basePresented, overlay: { ...basePresented.overlay, body: `${basePresented.overlay.body ?? ''}\n\n${history}` } };
    }
    if (!network?.active && !replay?.active && guide?.state.active) guide.observe(gameplay.snapshot(), localReview?.state, { deltaMs: tutorialDeltaMs, suspended: controls.paused || !!tutorial?.watching || !!tutorial?.focused || document.hidden });
    if (opponentRoutine?.state.running && basePresented?.layout === 'fight') basePresented = { ...basePresented, hint: 'Opponent routine looping. Pause → Practice setup → Opponent routine to edit or stop. Each loop resets the arena.' };
    const reviewPresented = localExchangePresentation({ presentation: basePresented, review: (!experiments?.tainted || localReview?.state.active) && !network?.active && !replay?.active ? localReview?.state : undefined });
    const presented = !network?.active && !replay?.active && guide ? guide.present(reviewPresented, controls.paused) : reviewPresented;

    let geometry = presented?.layout === 'fight' ? earlyGeometry : undefined;
    // Only the stable fight layout permits late DOM presentation. Menus must
    // update first so sampling, projection and rendering use the resized box.
    const deferHud = hudLayout === 'post-first' && geometry !== undefined;
    const presentMenus = () => {
      practiceLibrary?.render({ available: !guide?.state.active && !network?.active && !replay?.active && !localReview?.state.active, practice: gameplay.combatMatch()?.phase === 'practice' });
      if (canvas.parentElement) { const value = String(controls.paused || onlineMenu);if (hudLayout === 'original' || canvas.parentElement.dataset.menuOpen !== value) canvas.parentElement.dataset.menuOpen = value; }
      gameplayUi?.render(presented, geometry);
      networkPanel?.render(network!.state, !replay?.active && !localReview?.state.active && (controls.paused || onlineMenu || ['menu', 'result'].includes(presented?.layout ?? '')));
      replayPanel?.render(replay!.state, !guide?.state.active && !localReview?.state.active && !network?.active && (controls.paused || onlineMenu || ['menu', 'result'].includes(gameplay.presentation?.layout ?? '')), inputDevice.controller);
      appearance?.render(!guide?.state.active && !localReview?.state.active && (controls.paused || onlineMenu || ['menu', 'result'].includes(gameplay.presentation?.layout ?? '')), !!replay?.active);
      uploads.render(!!replay?.active);
      if (canvas.parentElement) { const value = String(network?.active || replay?.active || false);if (hudLayout === 'original' || canvas.parentElement.dataset.networkActive !== value) canvas.parentElement.dataset.networkActive = value; }
      const representedActions = presented?.actions ?? [];
      const nextActionSignature = JSON.stringify(representedActions.map(action => action.action));
      if (nextActionSignature !== representedActionSignature) {
        representedActionSignature = nextActionSignature;
        const represented = new Set([...combatOwned, ...representedActions.map(action => action.action)]);
        controls.setActionAvailability({ ownedActions: mappedActions, availableActions: new Set([...mappedActions].filter(action => !represented.has(action) && !action.startsWith('match:') && !gameplay.handlesStart)) });
      }
    };
    if (!deferHud) presentMenus();
    const emittedAudio = photoCapturePresentation?.freezeSimulation ? [] : network?.active ? confirmedAudio.splice(0) : gameplay.drainAudio();
    for (const sound of emittedAudio) if (sound.bus === 'music') captureMusic = sound;
    audio.enqueue(emittedAudio.map(event => gameplayAudioCommand({ event, commandId: `3d-gameplay:${++gameplayAudioId}`, sceneId: runtime.declaration.activeSceneId })));
    audio.update();
    if (hudLayout !== 'original' && !geometry) { geometry = readCanvasGeometry(canvas, canvasGeometry);hudGeometryReads += 4; }
    const width = Math.max(1, (geometry?.width ?? canvas.clientWidth) || canvas.width), height = Math.max(1, (geometry?.height ?? canvas.clientHeight) || canvas.height);
    if (!geometry) hudGeometryReads += 2;
    const snapshot = { tick: runtime.tick };
    const evaluated = runtime.sampleFrame({ timeline, viewport: { width, height }, physicalPerformance });
    if (snapshot.tick < previousTick) playedAudioEvents.clear();
    previousTick = snapshot.tick;
    if (!network?.active && audio.isUnlocked()) for (const event of evaluated.audioEvents) {
      const key = `${event.id}:${event.frame}`;
      if (playedAudioEvents.has(key)) continue;
      playedAudioEvents.add(key);
      audio.enqueue([{ type: "play", commandId: `3d-event:${key}`, sceneId: runtime.declaration.activeSceneId, entityId: "runtime", componentId: event.id, assetId: event.assetId, bus: "sfx", gain: event.gain, pan: event.pan, loop: false, priority: 2 }]);
    }
    const gameSnapshot = gameplay.snapshot();
    gameplay.presentFrame(evaluated, { reducedMotion, viewportAspect: width / height, poses: appearance?.poses(!!replay?.active), styles: appearance?.styles(!!replay?.active),
      beforeVisibility: frame => {
        appearance?.apply(frame, !!replay?.active, gameSnapshot.combat?.state, reducedMotion);
        directedFighters?.present(frame, gameSnapshot, { styles: appearance?.styles(!!replay?.active), reducedMotion });
        uploads.apply?.(frame);
      },
      cameraTransform: camera => {
        presentServiceCourt({ ...evaluated, camera });
        if (photoCapturePresentation) {
          applyPhotoCaptureCamera(photoCapturePresentation, camera, now);
          if (photoCapturePresentation.followFighters && !photoCapturePresentation.removeFighters) fitCaptureCamera(camera, evaluated.entities.filter(entity => combat?.fighters.some(fighter => fighter.entityId === entity.id)).map(entity => entity.position), width / height);
        }
      } });
    audio.setPersonalMusicState(personalMusicState({ snapshot: gameSnapshot, definition: combat, paused: controls.paused || onlineMenu || !!replay?.active && (!replay.state.playing || replay.state.seeking) || !!localReview?.state.active && !localReview.state.playing,
      spectating: !!spectating || !!replay?.active && replay.state.controlledSeat === undefined || !!localReview?.state.active && !localReview.state.takeover,
      replayControlledSeat: replay?.active ? replay.state.controlledSeat : undefined,
      localFighterId: network?.active ? combat?.fighters[networkSeat]?.entityId : replay?.active ? combat?.fighters[replay.state.controlledSeat ?? 0]?.entityId : player?.entityId }));
    const presentReports = () => {
      const aiMatch = gameSnapshot.combat?.match;
      aiReport?.observe({ phase: aiMatch?.phase, round: (aiMatch?.playerWins ?? 0) + (aiMatch?.opponentWins ?? 0), match: aiMatch?.matchIndex, excluded: !!experiments?.tainted || !!network?.active || !!replay?.active || !!localReview?.state.active });
      bulkTraining?.available(!network?.active && !replay?.active && !localReview?.state.active);
    };
    if (!deferHud) presentReports();
    if (renderingCaptureFrame) directedFighters?.validateCapture(evaluated, gameSnapshot);
    if (photoCapturePresentation?.removeFighters) {
      const fighterIds = new Set([
        ...(gameSnapshot.combat?.state.fighters.map(fighter => fighter.id) ?? []),
        ...(combat?.fighters.map(fighter => fighter.entityId) ?? []),
      ]);
      photoCaptureRemovedFighterEntityIds = [];
      for (const entity of evaluated.entities) {
        if ([...fighterIds].some(id => entity.id === id || entity.id.startsWith(`${id}:`) || entity.id.startsWith(`${id}-`))) {
          entity.visible = false;
          photoCaptureRemovedFighterEntityIds.push(entity.id);
        }
      }
    } else {
      photoCaptureRemovedFighterEntityIds = [];
    }
    const features = experiments?.flags;
    if (features && (!features.effects || !features.renderFighters || !features.renderEnvironment)) {
      if (!features.effects) evaluated.effects.length = 0;
      const roots = combat?.fighters.map(fighter => fighter.entityId) ?? [];
      for (const entity of evaluated.entities) {
        const fighter = roots.some(id => entity.id === id || entity.id.startsWith(`${id}:`) || entity.id.startsWith(`${id}-`));
        const effect = /:(spark|trail|shield|influence|parry|guard-fracture|timing-ring|dash|dust|speed-line)(:|$)/.test(entity.id);
        if (fighter && !features.renderFighters || !fighter && !features.renderEnvironment || effect && !features.effects) entity.visible = false;
      }
    }
    runtime.applyFrame(evaluated);
    const matrix = runtime.viewProjectionForFrame(evaluated, width / height);
    captureSubjects = photoCapturePresentation && !photoCapturePresentation.removeFighters ? captureSubjectBounds(evaluated.camera, evaluated.entities.filter(entity => combat?.fighters.some(fighter => fighter.entityId === entity.id)).map(entity => entity.position), width / height) : [];
    const renderStarted = measuring ? performance.now() : 0;
    const shadowOptions = features?.shadows === false ? undefined : shadows?.renderOptions;
    const views = features?.cameraCulling === false ? { commands: runtime.compile(), shadowCommands: undefined } : runtime.compileViews(matrix, shadowOptions?.shadowViewProjection);
    hook.rendererStats = renderer.render(views.commands, matrix, { cameraPosition: evaluated.camera.position, ...shadowOptions, shadowCommands: views.shadowCommands,
      ...(geometry ? { cssWidth: width, cssHeight: height } : {}),
      pixelRatio: Math.min(globalThis.devicePixelRatio || 1, 2) * (experiments?.resolution ?? 1), features: features ? { ...features, cameraCulling: false } : undefined });
    const renderEnded = measuring ? performance.now() : 0;
    inputView.present({ camera: evaluated.camera });
    const presentAppearance = () => {
      appearance?.preview(evaluated);
      rewards?.render({ visible: !guide?.state.active && (network?.active ? onlineMenu || ['lobby', 'ready'].includes(network.state.status) && !network.session || (network.session?.confirmedMatch ?? network.terminalPresentation?.match)?.phase === 'match-result' : (controls.paused || ['menu', 'result'].includes(gameplay.presentation?.layout ?? ''))), replay: !!experiments?.tainted || !!replay?.active || !!localReview?.state.active || !!guide?.state.active, phase: network?.active ? (network.session?.confirmedMatch ?? network.terminalPresentation?.match)?.phase : gameSnapshot.combat?.match?.phase, winner: gameSnapshot.combat?.match?.winner });
      gameplayUi?.setResultStatus(rewards?.resultStatus ?? '');
    };
    if (!deferHud) presentAppearance();
    const postStarted = measuring ? performance.now() : 0;
    if (features?.post === false) postProcess.hide();
    else postProcess.render(evaluated.renderGraph, combatScreenEffects({ snapshot: gameSnapshot, definition: combat, reducedMotion, spectating: photoCapturePresentation?.spectator || photoCapturePresentation?.removeFighters || !!spectating || !!replay?.active && replay.state.controlledSeat === undefined, localFighterId: network?.active ? combat?.fighters[networkSeat]?.entityId : replay?.active ? combat?.fighters[replay.state.controlledSeat ?? 0]?.entityId : player?.entityId }), geometry, deferHud ? 'pixels-first' : 'layout-first');
    const postEnded = measuring ? performance.now() : 0;
    if (deferHud) { presentMenus();presentReports();presentAppearance(); }
    impactOverlay?.render(features?.effects === false ? undefined : evaluated.renderGraph.impactFrame, impactTextures);
    fighterBars?.render({ snapshot: gameSnapshot, frame: evaluated, matrix, geometry, hidden: features?.hud === false || controls.paused || !!photoCapturePresentation?.removeFighters,
      fighterNames: appearance?.fighterNames(!!replay?.active), emblem: uploads.emblem,
      ...(network?.active ? { localFighterId: combat?.fighters[networkSeat]?.entityId, spectator: spectating, phase: network.state.roomType === 'tod-training' ? 'practice' : network.session?.confirmedMatch?.phase ?? network.terminalPresentation?.match.phase ?? 'countdown' } : replay?.active ? { localFighterId: combat?.fighters[replay.state.controlledSeat ?? 0]?.entityId } : {}) });
    practiceUi?.render({ snapshot: gameSnapshot, matrix, paused: controls.paused, routine: opponentRoutine?.state.running, coaching: !opponentRoutine?.state.running && !!tutorial?.state.kind, suspended: tutorial?.watching, interactionTargets: gameplay.presentation?.interactionTargets, hidden: features?.hud === false || network?.active || replay?.active || localReview?.state.active, interactionHidden: controls.paused || onlineMenu || replay?.active || localReview?.state.active || spectating, localFighterId: network?.active ? combat?.fighters[networkSeat]?.entityId : player?.entityId, controller: inputDevice.controller });
    guideSpotlight?.render({ prompt: guide?.prompt(), hidden: controls.paused || !!network?.active || !!replay?.active || !!localReview?.state.active || presented?.layout !== 'fight', snapshot: gameSnapshot, matrix, width, height, interactionTargets: gameplay.presentation?.interactionTargets });
    tutorial?.render({ snapshot: gameSnapshot, now, controller: inputDevice.controller, reducedMotion, hidden: presented?.layout !== 'fight' || !!opponentRoutine?.state.running || controls.paused || !!network?.active || !!replay?.active || !!localReview?.state.active });
    hook.frameCount += 1;
    if (measuring) {
      const stats = hook.rendererStats, physics = runtime.physics.diagnostics;
      const overflows = physics.candidateOverflows + physics.contactOverflows + physics.ccdTestOverflows + physics.queryTruncations;
      gamePerformance.record({ time: now, intervalMs: tutorialDeltaMs, cpuMs: performance.now() - frameStarted,
        simulationMs: presentationStarted - simulationStarted, presentationMs: renderStarted - presentationStarted,
        renderSubmitMs: renderEnded - renderStarted, postProcessMs: postEnded - postStarted, steps: simulationSteps, droppedMs, tick: snapshot.tick,
        hudWork: gamePerformance.recording ? { layout: hudLayout, geometryReads: hudGeometryReads + (hudWriteWork?.geometryReads ?? 0) + (reticleWork?.geometryReads ?? 0),
          rendererGeometryReads: geometry ? 0 : 2, postGeometryReads: postProcess.geometryReads,
          deferredFrames: Number(deferHud), layoutFallbacks: Number(hudLayout === 'post-first' && !deferHud),
          textWrites: hudWriteWork?.textWrites ?? 0, attributeWrites: hudWriteWork?.attributeWrites ?? 0, styleWrites: hudWriteWork?.styleWrites ?? 0, skippedWrites: hudWriteWork?.skippedWrites ?? 0,
          projections: hudWriteWork?.projectionCalls ?? 0, entityVisits: hudWriteWork?.entityVisits ?? 0, reticleReads: reticleWork?.geometryReads ?? 0, reticleWrites: reticleWork?.positionWrites ?? 0 } : undefined,
        phase: controls.paused ? 'paused' : gameSnapshot.combat?.match?.phase ?? 'gameplay', vsync: gamePerformance.vsync,
        draws: stats.drawCalls + stats.shadowDrawCalls, shadowDraws: stats.shadowDrawCalls, outlineDraws: stats.outlineDrawCalls, triangles: stats.triangles, instances: stats.instances,
        physicsOverflows: Math.max(0, overflows - previousPhysicsOverflows), combatFrame: gameSnapshot.combat?.state.frame, hitstopFrames: gameSnapshot.combat?.hitstop.remaining,
        fighters: gamePerformance.recording ? gameSnapshot.combat?.state.fighters.map(fighter => ({ id: fighter.id, ...fighter.position, health: fighter.health, moveId: fighter.moveId })) : undefined }, () => ({ physics: { ...physics },
          fighters: gameSnapshot.combat?.state.fighters.map(fighter => ({ id: fighter.id, position: { ...fighter.position }, health: fighter.health, moveId: fighter.moveId })),
          actions: [...actions].slice(0, 32) }));
      previousPhysicsOverflows = overflows;
    }
    if (!photoCapturePresentation?.manual) frameScheduler.schedule();
  };
  hook.ready = true;
  document.body.dataset.hyperfocusReady = "true";
  canvas.focus({ preventScroll: true });
  frameScheduler.schedule();
  const resetFrameTiming = () => { previous = performance.now();accumulator = 0;gamePerformance.resetWindow(); };
  document.addEventListener('visibilitychange', resetFrameTiming);
  window.addEventListener('pagehide', () => { workerRuntime?.dispose();frameScheduler.dispose();inputDevice.dispose();inputSettings.dispose();gamePerformance.dispose();document.removeEventListener('visibilitychange', resetFrameTiming); }, { once: true });
  window.addEventListener("pagehide", () => { audioStage.dispose();practiceLibrary?.dispose();developerTools?.dispose();uiFeedback?.dispose();document.removeEventListener('visibilitychange', refreshPolicy);void liveLearning?.dispose().catch(() => undefined);policyActivation?.dispose();lessonActivation?.dispose();sharedPolicy?.dispose();bulkTraining?.dispose();policyStore?.dispose();aiReport?.dispose();tutorial?.dispose();guideSpotlight?.dispose();rewards?.dispose();uploads.dispose();appearance?.dispose();replay?.leave();replayPanel?.dispose();network?.dispose();networkPanel?.dispose();gameplayUi?.dispose(); fighterBars?.dispose(); postProcess.dispose(); impactOverlay?.dispose(); renderer.dispose(); void storage.close(); void audio.dispose(); }, { once: true });
}

function message(value: unknown) { return value instanceof Error ? value.message : String(value); }
