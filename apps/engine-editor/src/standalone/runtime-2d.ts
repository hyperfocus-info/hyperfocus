import { clamp } from '@hyperfocus/utilities/math';
import { createPlayableWorld, hitTestPlayableAction2D, type PlayableProject2D } from "@hyperfocus/engine/project/runtime-2d";
import { createNavigationBehaviorRegistry2D } from "@hyperfocus/engine/project/runtime-navigation-2d";
import { createPlayableSaveController2D, readPlayableSaveDeclaration2D } from "@hyperfocus/engine/project/runtime-save-2d";
import { createPlayableStoryController2D, readPlayableStoryDeclaration2D } from "@hyperfocus/engine/project/runtime-story-2d";
import {
  applyTimelineOverrides2D,
  createPlayableTimeline2D,
  sampleTimelineCamera2D,
  sampleTimelineEffects2D,
  timelineEffectNoise2D,
  type PlayableTimelineProject2D,
  type TimelineClipOverride2D,
  type TimelineEventOccurrence2D,
  type TimelineWorldSnapshot2D,
} from "@hyperfocus/engine/project/runtime-timeline-2d";
import { createIndexedDbSaveStorage } from "@hyperfocus/engine/save/browser";
import { resolvePlayableViewport } from "../components/playable-viewport.ts";
import { createStandaloneControls } from "../components/standalone-controls.ts";
import { createStandaloneSaveControls } from "../components/standalone-save-controls.ts";
import { standaloneScenePresentation } from "../components/standalone-scene-content.ts";
import { drawUiText } from "../components/ui-text-layout.ts";
import { resolveUiTextStyle } from "../components/ui-text-style.ts";
import { sampleAtlasClipFrame } from "../editor-atlas-model.ts";
import { resolveExportFrameRect } from "../export/frame-fit.ts";
import { drawTimelineEffects2D } from "../motion/timeline-preview.ts";
import { mediaRenderCall } from "../motion/media/render.ts";
import { drawEditor2DGeneratedShape } from "../scene2d/shape-characters.ts";
import { createStandaloneAudioController } from "../standalone-audio.ts";
import { planProjectDelivery } from '@hyperfocus/engine/project/delivery';


import type { StandaloneBootContext } from "./entry-shared.ts";

type RuntimeProject = PlayableProject2D & PlayableTimelineProject2D & {
  id: string;
  name?: string;
  assets?: Array<{ id: string; kind?: string; mimeType?: string }>;
  atlas?: {
    sourceAssetId?: string;
    playbackSpeed?: number;
    frames?: Array<{ id: string; x: number; y: number; width: number; height: number }>;
    sequence?: string[];
    clips?: Array<{ id: string; sequence: string[]; fps: number; loop: boolean }>;
    defaultClipId?: string;
  };
  postProcessing?: { effects?: Array<{ id: string; enabled: boolean; value: number }> };
  settings: PlayableProject2D["settings"] & { masterVolume?: number; reducedMotion?: boolean };
  extensions?: { hyperfocusSave?: unknown; [key: string]: unknown };
};

export async function bootStandalone2D({ opened, canvas, hook, options }: StandaloneBootContext) {
  const project = opened.project;
  const navigationBehaviors = createNavigationBehaviorRegistry2D(project);
  const world = createPlayableWorld(project, { behaviors: { ...(options.behaviors ?? {}), ...navigationBehaviors } });
  const timeline = createPlayableTimeline2D(project);
  let visibleSnapshot = applyTimelineOverrides2D(world.snapshot(), timeline.snapshot().overrides);
  const readsPixelsEachFrame = project.postProcessing?.effects?.some((effect) => effect.enabled && effect.id === "threshold") === true;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: readsPixelsEachFrame });
  if (!context) throw new Error("Canvas 2D is unavailable.");
  const viewport = resolvePlayableViewport({ tilemap: project.tilemap });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.tabIndex = 0;

  const assetUrls = new Map<string, string>();
  const images = new Map<string, HTMLImageElement>();
  const loadedAssets = new Map(opened.assets.map(asset => [asset.id, asset]));
  const deliveryPlan = planProjectDelivery({ project });
  const preparedScenes = new Set<string>();
  // Retain the reset scene plus the active scene; the resolver owns its bounded byte cache.
  function releaseOtherScenes(sceneId: string) {
    const keepScenes = new Set([project.activeSceneId, sceneId]);
    const keepAssets = new Set([...keepScenes].flatMap(id => deliveryPlan.groups[`scene:${id}`] ?? []));
    for (const id of preparedScenes) if (!keepScenes.has(id)) preparedScenes.delete(id);
    for (const [id, url] of assetUrls) if (!keepAssets.has(id)) { URL.revokeObjectURL(url);assetUrls.delete(id);images.delete(id); }
    for (const id of loadedAssets.keys()) if (!keepAssets.has(id)) loadedAssets.delete(id);
  }
  async function prepareScene(sceneId: string) {
    if (preparedScenes.has(sceneId)) return;
    const ids = deliveryPlan.groups[`scene:${sceneId}`];if (!ids) throw Error(`Unknown scene: ${sceneId}`);
    const missing = ids.filter(id => !loadedAssets.has(id));
    if (missing.length) {
      if (!opened.delivery) throw Error(`Offline scene is missing assets: ${sceneId}`);
      for (const asset of await opened.delivery.acquire(missing)) loadedAssets.set(asset.id, asset);
    }
    for (const id of ids) {
    const asset = loadedAssets.get(id);if (!asset || images.has(id)) continue;
    if (!asset.mimeType.startsWith("image/")) continue;
    const url = URL.createObjectURL(new Blob([new Uint8Array(asset.bytes)], { type: asset.mimeType }));
    assetUrls.set(asset.id, url);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
      images.set(asset.id, image);
    } catch (cause) {
      URL.revokeObjectURL(url);
      assetUrls.delete(asset.id);
      throw Error(`Cannot decode scene image: ${asset.name}`, { cause });
    }
    }
    preparedScenes.add(sceneId);
  }
  await prepareScene(project.activeSceneId);

  const runtimeDiagnostics: unknown[] = [...world.diagnostics, ...timeline.diagnostics];
  const story = readPlayableStoryDeclaration2D(project) ? createPlayableStoryController2D(project) : undefined;
  if (story) {
    hook.storyView = () => story.view();
    hook.storySnapshot = () => story.snapshot();
    hook.storyStep = (actions = []) => story.step(actions);
    hook.drainStoryCommands = () => story.drainCommands();
  }
  const saveDeclaration = readPlayableSaveDeclaration2D(project);
  const saveStorage = saveDeclaration ? createIndexedDbSaveStorage({ maxBytes: saveDeclaration.maxBytes }) : undefined;
  const saves = saveStorage ? createPlayableSaveController2D(project, world, saveStorage, {
    migrations: options.saveMigrations,
    stateProviders: story ? [story.saveStateProvider()] : [],
    prepareRestore: snapshot => prepareScene(snapshot.sceneId),
  }) : undefined;
  if (saves) {
    hook.savePolicy = saves.declaration;
    hook.save = async (slotName) => { await saves.save(slotName); };
    hook.load = async (slotName) => {
      const loaded = await saves.restore(slotName);
      if (loaded) {
        const playback = timeline.reset();
        visibleSnapshot = applyTimelineOverrides2D(world.snapshot(), playback.overrides);
        releaseOtherScenes(visibleSnapshot.sceneId);
      }
      return loaded;
    };
    hook.reset = () => {
      const snapshot = saves.reset();
      const playback = timeline.reset();
      visibleSnapshot = applyTimelineOverrides2D(snapshot, playback.overrides);
      releaseOtherScenes(visibleSnapshot.sceneId);
      return visibleSnapshot;
    };
    hook.deleteSaveSlot = async (slotName) => { await saves.deleteSlot(slotName); };
    hook.deleteSaveProfile = () => saves.deleteProfile();
    hook.exportSaveProfile = async () => new TextDecoder().decode(await saves.exportProfile());
    hook.importSaveProfile = async (source, overwrite = false) => { await saves.importProfile(source, overwrite); };
    try {
      await saves.restoreOnBoot();
      visibleSnapshot = applyTimelineOverrides2D(world.snapshot(), timeline.reset().overrides);
      releaseOtherScenes(visibleSnapshot.sceneId);
    }
    catch (cause) {
      runtimeDiagnostics.push({ severity: "warning", code: "save-runtime", message: cause instanceof Error ? cause.message : String(cause) });
    }
  }
  const audio = createStandaloneAudioController(opened.assets, {
    streamedMusic: opened.streamedAudio, loadAsset: opened.delivery?.bytes,
    masterVolume: project.settings.masterVolume,
    onError: (error) => {
      runtimeDiagnostics.push({ severity: "warning", code: "audio-runtime", message: error.message });
      console.warn("Hyperfocus standalone audio", error);
    },
  });
  audio.enqueue(world.drainAudioCommands());
  const unlockAudio = () => { void audio.unlockAndFlush().catch((error) => console.warn("Hyperfocus standalone audio unlock", error)); };

  const heldBindings = new Set<string>();
  const bindingTaps = new Set<string>();
  const touchActions = new Set<string>();
  const pointerActions = new Set<string>();
  const pointerView = { x: 0, y: 0, zoom: 1 };
  const preventBindings = new Set(project.settings.input.flatMap((mapping) => mapping.bindings).filter((binding) => !binding.startsWith("Gamepad")));
  const clearInput = () => { heldBindings.clear(); bindingTaps.clear(); touchActions.clear(); pointerActions.clear(); };
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLElement && event.target.closest("input, textarea, button, summary, [contenteditable=true]")) return;
    heldBindings.add(event.code);
    bindingTaps.add(event.code);
    if (preventBindings.has(event.code)) event.preventDefault();
    unlockAudio();
  });
  window.addEventListener("keyup", (event) => {
    heldBindings.delete(event.code);
    if (preventBindings.has(event.code) && !(event.target instanceof HTMLElement && event.target.closest("input, textarea, button, summary, [contenteditable=true]"))) event.preventDefault();
  });
  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearInput(); });
  const pointerAction = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const point = { x: (event.clientX - rect.left) * canvas.width / Math.max(1, rect.width), y: (event.clientY - rect.top) * canvas.height / Math.max(1, rect.height) };
    return hitTestPlayableAction2D({ entities: visibleSnapshot.entities, screenPoint: point, worldPoint: { x: point.x / pointerView.zoom + pointerView.x, y: point.y / pointerView.zoom + pointerView.y } });
  };
  bindTouch(canvas, touchActions, unlockAudio, (event) => {
    const action = pointerAction(event);
    if (!action) return false;
    if (!controls.paused) pointerActions.add(action.action);
    canvas.focus({ preventScroll: true }); event.preventDefault();
    return true;
  });
  canvas.addEventListener("pointermove", (event) => { canvas.style.cursor = pointerAction(event) ? "pointer" : "default"; });
  const controls = createStandaloneControls({
    canvas, mappings: project.settings.input, onInteract: unlockAudio,
    contextualActions: [...standaloneScenePresentation({ entities: project.scenes.flatMap(scene => scene.entities) }).ownedActions],
    onPaused: (paused) => { clearInput(); void audio.setPaused(paused).catch((error) => console.warn("Hyperfocus audio pause", error)); },
    preferences: {
      volume: project.settings.masterVolume ?? 1,
      reducedMotion: project.settings.reducedMotion ?? false,
      onVolume: (value) => audio.setMasterVolume(value),
      onReducedMotion: (value) => { project.settings.reducedMotion = value; },
    },
  });

  if (saveDeclaration && hook.save && hook.load && hook.exportSaveProfile && hook.importSaveProfile) {
    createStandaloneSaveControls({
      canvas, ...saveDeclaration,
      save: hook.save, restore: hook.load,
      exportProfile: hook.exportSaveProfile, importProfile: hook.importSaveProfile,
    });
  }

  hook.assetCount = opened.assets.length;
  hook.diagnostics = runtimeDiagnostics;
  const pendingTimelineEvents: TimelineEventOccurrence2D[] = [];
  let reportedTimelineEventOverflow = false;
  hook.timelineSnapshot = () => timeline.snapshot();
  hook.drainTimelineEvents = () => pendingTimelineEvents.splice(0);
  hook.snapshot = () => visibleSnapshot;
  hook.switchScene = (sceneId) => {
    if (!preparedScenes.has(sceneId)) throw Error('Load this scene with switchSceneAsync before synchronous activation.');
    const snapshot = world.switchScene(sceneId);
    audio.enqueue(world.drainAudioCommands());
    visibleSnapshot = applyTimelineOverrides2D(snapshot, timeline.snapshot().overrides);
    releaseOtherScenes(sceneId);
    return visibleSnapshot;
  };
  let sceneChange = Promise.resolve(visibleSnapshot);
  hook.switchSceneAsync = sceneId => {
    sceneChange = sceneChange.catch(() => visibleSnapshot).then(async () => { await prepareScene(sceneId);return hook.switchScene!(sceneId); });
    return sceneChange;
  };

  let previous = performance.now();
  const renderFrame = (now: number) => {
    const elapsed = controls.paused ? 0 : Math.min(0.25, Math.max(0, (now - previous) / 1_000));
    previous = now;
    const input = collectInput(heldBindings, touchActions);
    for (const binding of bindingTaps) input.bindings.add(binding);
    for (const action of controls.readActions()) input.actions.add(action);
    for (const action of pointerActions) input.actions.add(action);
    if (!controls.paused) story?.step(resolveActions(project, input));
    const advancement = world.advance(elapsed, input);
    if (advancement.steps > 0) { controls.acknowledgeActions(); pointerActions.clear(); bindingTaps.clear(); }
    const playback = timeline.advance(elapsed);
    for (const event of playback.events) {
      if (pendingTimelineEvents.length < 4_096) pendingTimelineEvents.push(event);
      else if (!reportedTimelineEventOverflow) {
        reportedTimelineEventOverflow = true;
        runtimeDiagnostics.push({ severity: "warning", code: "timeline-event-queue-overflow", message: "Standalone timeline event queue reached 4096 pending occurrences; drainTimelineEvents() must be called to observe later events." });
      }
    }
    if (playback.droppedEventOccurrences > 0 && !reportedTimelineEventOverflow) {
      reportedTimelineEventOverflow = true;
      runtimeDiagnostics.push({ severity: "warning", code: "timeline-event-queue-overflow", message: `Standalone timeline dropped ${playback.droppedEventOccurrences} event occurrences during one bounded advancement.` });
    }
    audio.enqueue(world.drainAudioCommands());
    visibleSnapshot = applyTimelineOverrides2D(world.snapshot(), playback.overrides);
    const presentation = standaloneScenePresentation({ entities: visibleSnapshot.entities });
    controls.setActionAvailability(presentation);
    controls.setActionLabels(presentation.actionLabels);
    controls.setSceneContent(presentation.content);
    render(context, canvas, project, visibleSnapshot, images, playback.frame, playback.clipOverrides, pointerView);
    hook.frameCount += 1;
    requestAnimationFrame(renderFrame);
  };
  hook.ready = true;
  document.body.dataset.hyperfocusReady = "true";
  canvas.focus({ preventScroll: true });
  requestAnimationFrame(renderFrame);

  window.addEventListener("pagehide", () => {
    for (const url of assetUrls.values()) URL.revokeObjectURL(url);
    void audio.dispose();
    void saveStorage?.close();
  }, { once: true });
}

function resolveActions(project: RuntimeProject, input: ReturnType<typeof collectInput>) {
  const actions = new Set(input.actions);
  for (const mapping of project.settings.input) if (mapping.bindings.some((binding) => input.bindings.has(binding))) actions.add(mapping.action);
  return actions;
}

function collectInput(heldBindings: ReadonlySet<string>, touchActions: ReadonlySet<string>) {
  const bindings = new Set(heldBindings);
  const actions = new Set(touchActions);
  const gamepads = navigator.getGamepads?.() ?? [];
  for (let padIndex = 0; padIndex < gamepads.length; padIndex += 1) {
    const gamepad = gamepads[padIndex];
    if (!gamepad) continue;
    for (let button = 0; button < gamepad.buttons.length; button += 1) {
      if (gamepad.buttons[button]?.pressed) bindings.add(`Gamepad${padIndex}.Button${button}`);
    }
    const x = gamepad.axes[0] ?? 0;
    const y = gamepad.axes[1] ?? 0;
    if (x < -0.3) actions.add("move-left");
    if (x > 0.3) actions.add("move-right");
    if (y < -0.3) actions.add("move-up");
    if (y > 0.3) actions.add("move-down");
  }
  return { actions, bindings };
}

function bindTouch(canvas: HTMLCanvasElement, actions: Set<string>, unlock: () => void, activate: (event: PointerEvent) => boolean) {
  const update = (event: PointerEvent) => {
    actions.clear();
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / Math.max(1, bounds.width) - 0.5;
    const y = (event.clientY - bounds.top) / Math.max(1, bounds.height) - 0.5;
    if (Math.abs(x) > 0.08) actions.add(x < 0 ? "move-left" : "move-right");
    if (Math.abs(y) > 0.08) actions.add(y < 0 ? "move-up" : "move-down");
  };
  canvas.addEventListener("pointerdown", (event) => { unlock(); if (activate(event)) return; canvas.setPointerCapture(event.pointerId); update(event); });
  canvas.addEventListener("pointermove", (event) => { if (canvas.hasPointerCapture(event.pointerId)) update(event); });
  const clear = (event: PointerEvent) => {
    actions.clear();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  canvas.addEventListener("pointerup", clear);
  canvas.addEventListener("pointercancel", clear);
}

function render(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  project: RuntimeProject,
  snapshot: TimelineWorldSnapshot2D,
  images: ReadonlyMap<string, HTMLImageElement>,
  timelineFrame: number,
  clipOverrides: readonly TimelineClipOverride2D[],
  pointerView: { x: number; y: number; zoom: number },
) {
  const authoredScene = project.scenes.find((scene) => scene.id === snapshot.sceneId) ?? project.scenes[0];
  const authoredById = new Map(authoredScene.entities.map((entity) => [entity.id, entity]));
  const followed = snapshot.entities.find((entity) => authoredById.get(entity.id)?.components.some((component) => component.enabled && component.type === "camera"))
    ?? snapshot.entities.find((entity) => authoredById.get(entity.id)?.components.some((component) => component.enabled && component.type === "input"));
  const mapWidth = project.tilemap.columns * project.tilemap.tileSize;
  const mapHeight = project.tilemap.rows * project.tilemap.tileSize;
  let cameraX = clamp((followed?.x ?? canvas.width / 2) - canvas.width / 2, 0, Math.max(0, mapWidth - canvas.width), 'minimum');
  let cameraY = clamp((followed?.y ?? canvas.height / 2) - canvas.height / 2, 0, Math.max(0, mapHeight - canvas.height), 'minimum');
  const authoredCamera = sampleTimelineCamera2D({ timeline: project.timeline, frame: timelineFrame, viewport: canvas });
  const zoom = authoredCamera?.zoom ?? 1;
  if (authoredCamera) {
    cameraX = authoredCamera.x - canvas.width / (2 * zoom);
    cameraY = authoredCamera.y - canvas.height / (2 * zoom);
  }
  const shake = enabledEffect(project, "shake");
  if (shake && !project.settings.reducedMotion) {
    cameraX += Math.sin(snapshot.tick * 2.399) * shake.value;
    cameraY += Math.cos(snapshot.tick * 1.733) * shake.value;
  }
  if (!project.settings.reducedMotion) {
    for (const effect of sampleTimelineEffects2D(project.timeline, timelineFrame)) {
      if (effect.kind !== "camera-shake") continue;
      const sample = Math.round(timelineFrame * 3 + effect.progress * 17);
      cameraX += timelineEffectNoise2D(effect.id, sample) * effect.intensity * effect.envelope;
      cameraY += timelineEffectNoise2D(effect.id, sample + 977) * effect.intensity * effect.envelope;
    }
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  pointerView.x = authoredCamera ? cameraX : Math.round(cameraX);
  pointerView.y = authoredCamera ? cameraY : Math.round(cameraY);
  pointerView.zoom = zoom;
  context.fillStyle = "#09131b";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const orderedEntities = [...snapshot.entities].sort((a, b) => a.layer - b.layer);
  context.save();
  context.scale(zoom, zoom);
  context.translate(authoredCamera ? -cameraX : -Math.round(cameraX), authoredCamera ? -cameraY : -Math.round(cameraY));
  renderTiles(context, project, cameraX, cameraY, canvas.width / zoom, canvas.height / zoom);
  let lastBackground = -1;
  for (const [index, entity] of orderedEntities.entries()) {
    if (entity.layer < 0 || authoredById.get(entity.id)?.components.some((component) => component.enabled && component.type === "sprite" && component.values.role === "background")) lastBackground = index;
  }
  if (lastBackground < 0) renderTimelineEffects(context, snapshot, project, timelineFrame, "background");
  for (const [index, entity] of orderedEntities.entries()) {
    if (isScreenSpaceUiEntity(entity, authoredById.get(entity.id))) continue;
    renderEntity(context, entity, authoredById.get(entity.id), project, images, timelineFrame, clipOverrides);
    if (index === lastBackground) renderTimelineEffects(context, snapshot, project, timelineFrame, "background");
  }
  renderTimelineEffects(context, snapshot, project, timelineFrame);
  context.restore();
  for (const entity of orderedEntities) {
    if (!isScreenSpaceUiEntity(entity, authoredById.get(entity.id))) continue;
    renderEntity(context, entity, authoredById.get(entity.id), project, images, timelineFrame, clipOverrides);
  }
  const threshold = enabledEffect(project, "threshold");
  if (threshold) applyThreshold(context, canvas.width, canvas.height, threshold.value);
  const crt = enabledEffect(project, "crt");
  if (crt) {
    context.fillStyle = `rgba(0,0,0,${clamp(crt.value, 0, 1, 'minimum') * 0.18})`;
    for (let y = 0; y < canvas.height; y += 3) context.fillRect(0, y, canvas.width, 1);
  }
  const grayscale = enabledEffect(project, "grayscale")?.value ?? 0;
  const sepia = enabledEffect(project, "sepia")?.value ?? 0;
  canvas.style.filter = `grayscale(${clamp(grayscale, 0, 1, 'minimum')}) sepia(${clamp(sepia, 0, 1, 'minimum')})`;
}

function renderTimelineEffects(context: CanvasRenderingContext2D, snapshot: TimelineWorldSnapshot2D, project: RuntimeProject, frame: number, layer: "foreground" | "background" = "foreground") {
  drawTimelineEffects2D({ context, timeline: project.timeline, entities: snapshot.entities, frame, layer });
}

function applyThreshold(context: CanvasRenderingContext2D, width: number, height: number, requestedLevel: number) {
  const level = clamp(requestedLevel, 0, 255, 'minimum');
  const image = context.getImageData(0, 0, width, height);
  for (let index = 0; index < image.data.length; index += 4) {
    const luminance = image.data[index] * 0.2126 + image.data[index + 1] * 0.7152 + image.data[index + 2] * 0.0722;
    const value = luminance >= level ? 255 : 0;
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
  }
  context.putImageData(image, 0, 0);
}

function renderTiles(context: CanvasRenderingContext2D, project: RuntimeProject, cameraX: number, cameraY: number, width: number, height: number) {
  const { columns, rows, tileSize, values } = project.tilemap;
  const firstColumn = clamp(Math.floor(cameraX / tileSize), 0, columns - 1, 'minimum');
  const lastColumn = clamp(Math.ceil((cameraX + width) / tileSize), 0, columns - 1, 'minimum');
  const firstRow = clamp(Math.floor(cameraY / tileSize), 0, rows - 1, 'minimum');
  const lastRow = clamp(Math.ceil((cameraY + height) / tileSize), 0, rows - 1, 'minimum');
  const colors = ["#101d27", "#193644", "#24394e", "#354b55"];
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const value = values[row * columns + column] ?? 0;
      context.fillStyle = colors[value % colors.length] ?? colors[0];
      context.fillRect(column * tileSize, row * tileSize, tileSize, tileSize);
      context.strokeStyle = value ? "#41616c" : "#17303c";
      context.strokeRect(column * tileSize + 0.5, row * tileSize + 0.5, tileSize - 1, tileSize - 1);
    }
  }
}

function renderEntity(
  context: CanvasRenderingContext2D,
  entity: TimelineWorldSnapshot2D["entities"][number],
  authored: PlayableProject2D["scenes"][number]["entities"][number] | undefined,
  project: RuntimeProject,
  images: ReadonlyMap<string, HTMLImageElement>,
  timelineFrame: number,
  clipOverrides: readonly TimelineClipOverride2D[],
) {
  const mediaCall = mediaRenderCall(project, images, entity, timelineFrame);
  if (mediaCall) { mediaCall(context); return; }
  const width = entity.width * entity.scale;
  const height = entity.height * entity.scale;
  const opacity = clamp(entity.opacity ?? 1, 0, 1, 'minimum');
  if (opacity <= 0) return;
  context.save();
  context.globalAlpha *= opacity;
  context.translate(entity.x, entity.y);
  context.rotate(entity.rotation ?? 0);
  const ui = entity.components?.find((component) => component.enabled && component.type === "ui")
    ?? authored?.components.find((component) => component.enabled && component.type === "ui");
  if (ui) {
    if (ui.values.visible === false) { context.restore(); return; }
    const textStyle = resolveUiTextStyle({ values: ui.values });
    context.scale(entity.scale, entity.scale);
    context.fillStyle = entity.accent || entity.color;
    context.font = textStyle.font;
    context.textAlign = textStyle.align;
    context.textBaseline = "middle";
    drawUiText({ context, text: String(ui.values.text ?? ""), width: entity.width, fontSize: textStyle.fontSize });
    context.restore();
    return;
  }
  const sprite = entity.components?.find((component) => component.enabled && component.type === "sprite")
    ?? authored?.components.find((component) => component.enabled && component.type === "sprite");
  if (sprite?.values.visible === false) {
    context.restore();
    return;
  }
  const assetId = stringValue(sprite?.values.assetId) ?? stringValue(sprite?.values.asset);
  const image = assetId ? images.get(assetId) : undefined;
  const clip = clipOverrides.find((override) => override.targetId === entity.id);
  const requestedClipId = clip?.clipId ?? stringValue(sprite?.values.animationClip);
  const frame = image && project.atlas?.sourceAssetId === assetId ? currentAtlasFrame(project, (timelineFrame - (clip?.startFrame ?? 0)) / Math.max(1, project.timeline?.fps ?? 60), requestedClipId) : undefined;
  if (image) {
    if (frame) context.drawImage(image, frame.x, frame.y, frame.width, frame.height, -width / 2, -height / 2, width, height);
    else { const fit = sprite?.values.fit; const rect = resolveExportFrameRect(image.naturalWidth || image.width, image.naturalHeight || image.height, width, height, fit === "contain" || fit === "cover" || fit === "stretch" ? fit : "stretch"); context.drawImage(image, -width / 2 + rect.x, -height / 2 + rect.y, rect.width, rect.height); }
  } else {
    drawEditor2DGeneratedShape(context, width, height, sprite, entity.color, entity.accent);
  }
  context.restore();
}

function isScreenSpaceUiEntity(
  entity: TimelineWorldSnapshot2D["entities"][number],
  authored: PlayableProject2D["scenes"][number]["entities"][number] | undefined,
) {
  const ui = entity.components?.find((component) => component.enabled && component.type === "ui")
    ?? authored?.components.find((component) => component.enabled && component.type === "ui");
  return ui?.values.screenSpace === true;
}

function currentAtlasFrame(project: RuntimeProject, time: number, requestedClipId?: string) {
  const atlas = project.atlas;
  if (!atlas?.frames?.length) return undefined;
  return sampleAtlasClipFrame({ frames: atlas.frames, sequence: atlas.sequence ?? [], clips: atlas.clips, defaultClipId: atlas.defaultClipId, requestedClipId, playbackSpeed: atlas.playbackSpeed, timeSeconds: time });
}

function enabledEffect(project: RuntimeProject, id: string) {
  return project.postProcessing?.effects?.find((effect) => effect.id === id && effect.enabled);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}
