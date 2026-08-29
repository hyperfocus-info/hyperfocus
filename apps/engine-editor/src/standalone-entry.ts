import { migrateProject, openHyperfocusProjectFiles } from "@hyperfocus/engine/project";
import { createPlayableWorld, type PlayableBehaviorRegistry2D, type PlayableProject2D, type PlayableWorldSnapshot } from "@hyperfocus/engine/project/runtime-2d";
import { createNavigationBehaviorRegistry2D } from "@hyperfocus/engine/project/runtime-navigation-2d";
import {
  applyTimelineOverrides2D,
  createPlayableTimeline2D,
  sampleTimelineEffects2D,
  timelineEffectNoise2D,
  type PlayableTimelineProject2D,
  type SampledTimelineEffect2D,
  type TimelineClipOverride2D,
  type TimelineEventOccurrence2D,
  type TimelinePlaybackSnapshot2D,
  type TimelineWorldSnapshot2D,
} from "@hyperfocus/engine/project/runtime-timeline-2d";
import { createPlayableSaveController2D, readPlayableSaveDeclaration2D, type PlayableSaveDeclaration2D } from "@hyperfocus/engine/project/runtime-save-2d";
import { createIndexedDbSaveStorage } from "@hyperfocus/engine/save/browser";
import type { SaveMigrationRegistry } from "@hyperfocus/engine/save";
import { createPlayableStoryController2D, readPlayableStoryDeclaration2D, type PlayableStorySnapshot2D, type PlayableStoryStepResult2D } from "@hyperfocus/engine/project/runtime-story-2d";
import type { LocalizedDialogueView, StoryCommand } from "@hyperfocus/engine/content";
import { createStandaloneAudioController } from "./standalone-audio.ts";
import { bootStandalone3D } from "./standalone-3d.ts";
import { hasHyperfocus3DProject } from "@hyperfocus/engine/project/runtime-3d";
import type { Hyperfocus3DSnapshot } from "@hyperfocus/engine/project/runtime-3d";
import type { WebGl2FrameStats3D } from "@hyperfocus/engine/render/3d-webgl2";
import { sampleAtlasClipFrame } from "./editor-atlas-model.ts";

declare const __HYPERFOCUS_STANDALONE_AUTO_BOOT__: boolean;

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

type StandaloneHook = {
  ready: boolean;
  error?: string;
  frameCount: number;
  assetCount: number;
  diagnostics: readonly unknown[];
  savePolicy?: Readonly<PlayableSaveDeclaration2D>;
  snapshot?: () => PlayableWorldSnapshot | Hyperfocus3DSnapshot;
  switchScene?: (sceneId: string) => PlayableWorldSnapshot;
  save?: (slotName?: string) => Promise<void>;
  load?: (slotName?: string) => Promise<boolean>;
  reset?: () => PlayableWorldSnapshot | Hyperfocus3DSnapshot;
  deleteSaveSlot?: (slotName?: string) => Promise<void>;
  deleteSaveProfile?: () => Promise<void>;
  exportSaveProfile?: () => Promise<string>;
  importSaveProfile?: (source: string, overwrite?: boolean) => Promise<void>;
  storyView?: () => LocalizedDialogueView;
  storySnapshot?: () => PlayableStorySnapshot2D;
  storyStep?: (actions?: Iterable<string>) => PlayableStoryStepResult2D;
  drainStoryCommands?: () => StoryCommand[];
  renderMode?: "webgl2-3d";
  rendererStats?: WebGl2FrameStats3D;
  audioUnlocked?: () => boolean;
  timelineSnapshot?: () => TimelinePlaybackSnapshot2D;
  drainTimelineEvents?: () => TimelineEventOccurrence2D[];
};

declare global {
  var __hyperfocusPlayable: StandaloneHook | undefined;
  var __hyperfocusProjectBehaviors: PlayableBehaviorRegistry2D | undefined;
}

const hook: StandaloneHook = { ready: false, frameCount: 0, assetCount: 0, diagnostics: [] };
globalThis.__hyperfocusPlayable = hook;

if (typeof __HYPERFOCUS_STANDALONE_AUTO_BOOT__ === "undefined" || __HYPERFOCUS_STANDALONE_AUTO_BOOT__) {
  startStandalonePlayable({ behaviors: globalThis.__hyperfocusProjectBehaviors });
}

export function startStandalonePlayable(options: { behaviors?: PlayableBehaviorRegistry2D; saveMigrations?: SaveMigrationRegistry } = {}) {
  void bootStandalonePlayable(options).catch(reportBootFailure);
}

function reportBootFailure(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  hook.error = message;
  document.body.dataset.hyperfocusReady = "error";
  const output = document.querySelector<HTMLElement>("#playable-error");
  if (output) {
    output.style.display = "block";
    output.textContent = `Playable build failed to start:\n${message}`;
  }
  console.error("Hyperfocus standalone startup failed", cause);
}

export async function bootStandalonePlayable(options: { behaviors?: PlayableBehaviorRegistry2D; saveMigrations?: SaveMigrationRegistry } = {}) {
  const payloadNode = required<HTMLScriptElement>("#hyperfocus-project-pair");
  const parsed: unknown = JSON.parse(payloadNode.textContent ?? "");
  const payload = parsed !== null && typeof parsed === "object" ? parsed : undefined;
  const version = payload ? Reflect.get(payload, "version") : undefined;
  const projectJson = payload ? Reflect.get(payload, "projectJson") : undefined;
  const assetsArchive = payload ? Reflect.get(payload, "assetsArchive") : undefined;
  if (version !== 1 || typeof projectJson !== "string" || typeof assetsArchive !== "string") {
    throw new Error("The embedded portable project pair is invalid.");
  }
  const opened = await openHyperfocusProjectFiles(decodeBase64(projectJson), decodeBase64(assetsArchive), {
    maxArchiveBytes: 512 * 1024 * 1024,
    maxAssets: 5_000,
    maxUnpackedBytes: 512 * 1024 * 1024,
    parseProject: migrateProject,
  });
  const project = opened.project;
  const canvas = required<HTMLCanvasElement>("canvas");
  if (hasHyperfocus3DProject(project)) {
    await bootStandalone3D(project, opened.assets, canvas, hook);
    return;
  }
  const navigationBehaviors = createNavigationBehaviorRegistry2D(project);
  const world = createPlayableWorld(project, { behaviors: { ...(options.behaviors ?? {}), ...navigationBehaviors } });
  const timeline = createPlayableTimeline2D(project);
  let visibleSnapshot = applyTimelineOverrides2D(world.snapshot(), timeline.snapshot().overrides);
  const readsPixelsEachFrame = project.postProcessing?.effects?.some((effect) => effect.enabled && effect.id === "threshold") === true;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: readsPixelsEachFrame });
  if (!context) throw new Error("Canvas 2D is unavailable.");
  const mapWidth = project.tilemap.columns * project.tilemap.tileSize;
  const mapHeight = project.tilemap.rows * project.tilemap.tileSize;
  canvas.width = clamp(Math.ceil(mapWidth), 320, 1_920);
  canvas.height = clamp(Math.ceil(mapHeight), 240, 1_080);
  canvas.tabIndex = 0;

  const assetUrls = new Map<string, string>();
  const images = new Map<string, HTMLImageElement>();
  for (const asset of opened.assets) {
    if (!asset.mimeType.startsWith("image/")) continue;
    const url = URL.createObjectURL(new Blob([new Uint8Array(asset.bytes)], { type: asset.mimeType }));
    assetUrls.set(asset.id, url);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
      images.set(asset.id, image);
    } catch {
      URL.revokeObjectURL(url);
      assetUrls.delete(asset.id);
    }
  }

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
  }) : undefined;
  if (saves) {
    hook.savePolicy = saves.declaration;
    hook.save = async (slotName) => { await saves.save(slotName); };
    hook.load = async (slotName) => {
      const loaded = await saves.restore(slotName);
      if (loaded) {
        const playback = timeline.reset();
        visibleSnapshot = applyTimelineOverrides2D(world.snapshot(), playback.overrides);
      }
      return loaded;
    };
    hook.reset = () => {
      const snapshot = saves.reset();
      const playback = timeline.reset();
      visibleSnapshot = applyTimelineOverrides2D(snapshot, playback.overrides);
      return visibleSnapshot;
    };
    hook.deleteSaveSlot = async (slotName) => { await saves.deleteSlot(slotName); };
    hook.deleteSaveProfile = () => saves.deleteProfile();
    hook.exportSaveProfile = async () => new TextDecoder().decode(await saves.exportProfile());
    hook.importSaveProfile = async (source, overwrite = false) => { await saves.importProfile(source, overwrite); };
    try {
      await saves.restoreOnBoot();
      visibleSnapshot = applyTimelineOverrides2D(world.snapshot(), timeline.reset().overrides);
    }
    catch (cause) {
      runtimeDiagnostics.push({ severity: "warning", code: "save-runtime", message: cause instanceof Error ? cause.message : String(cause) });
    }
  }
  const audio = createStandaloneAudioController(opened.assets, {
    masterVolume: project.settings.masterVolume,
    onError: (error) => {
      runtimeDiagnostics.push({ severity: "warning", code: "audio-runtime", message: error.message });
      console.warn("Hyperfocus standalone audio", error);
    },
  });
  audio.enqueue(world.drainAudioCommands());
  const unlockAudio = () => { void audio.unlockAndFlush().catch((error) => console.warn("Hyperfocus standalone audio unlock", error)); };

  const heldBindings = new Set<string>();
  const touchActions = new Set<string>();
  const preventBindings = new Set(project.settings.input.flatMap((mapping) => mapping.bindings).filter((binding) => !binding.startsWith("Gamepad")));
  const clearInput = () => { heldBindings.clear(); touchActions.clear(); };
  window.addEventListener("keydown", (event) => {
    heldBindings.add(event.code);
    if (preventBindings.has(event.code)) event.preventDefault();
    unlockAudio();
  });
  window.addEventListener("keyup", (event) => {
    heldBindings.delete(event.code);
    if (preventBindings.has(event.code)) event.preventDefault();
  });
  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearInput(); });
  bindTouch(canvas, touchActions, unlockAudio);

  hook.assetCount = opened.assets.length;
  hook.diagnostics = runtimeDiagnostics;
  const pendingTimelineEvents: TimelineEventOccurrence2D[] = [];
  let reportedTimelineEventOverflow = false;
  hook.timelineSnapshot = () => timeline.snapshot();
  hook.drainTimelineEvents = () => pendingTimelineEvents.splice(0);
  hook.snapshot = () => visibleSnapshot;
  hook.switchScene = (sceneId) => {
    const snapshot = world.switchScene(sceneId);
    audio.enqueue(world.drainAudioCommands());
    visibleSnapshot = applyTimelineOverrides2D(snapshot, timeline.snapshot().overrides);
    return visibleSnapshot;
  };

  let previous = performance.now();
  const renderFrame = (now: number) => {
    const elapsed = Math.min(0.25, Math.max(0, (now - previous) / 1_000));
    previous = now;
    const input = collectInput(heldBindings, touchActions);
    story?.step(resolveActions(project, input));
    world.advance(elapsed, input);
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
    render(context, canvas, project, visibleSnapshot, images, playback.frame, playback.clipOverrides);
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

function bindTouch(canvas: HTMLCanvasElement, actions: Set<string>, unlock: () => void) {
  const update = (event: PointerEvent) => {
    actions.clear();
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / Math.max(1, bounds.width) - 0.5;
    const y = (event.clientY - bounds.top) / Math.max(1, bounds.height) - 0.5;
    if (Math.abs(x) > 0.08) actions.add(x < 0 ? "move-left" : "move-right");
    if (Math.abs(y) > 0.08) actions.add(y < 0 ? "move-up" : "move-down");
  };
  canvas.addEventListener("pointerdown", (event) => { canvas.setPointerCapture(event.pointerId); unlock(); update(event); });
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
) {
  const authoredScene = project.scenes.find((scene) => scene.id === snapshot.sceneId) ?? project.scenes[0];
  const authoredById = new Map(authoredScene.entities.map((entity) => [entity.id, entity]));
  const followed = snapshot.entities.find((entity) => authoredById.get(entity.id)?.components.some((component) => component.enabled && component.type === "camera"))
    ?? snapshot.entities.find((entity) => authoredById.get(entity.id)?.components.some((component) => component.enabled && component.type === "input"));
  const mapWidth = project.tilemap.columns * project.tilemap.tileSize;
  const mapHeight = project.tilemap.rows * project.tilemap.tileSize;
  let cameraX = clamp((followed?.x ?? canvas.width / 2) - canvas.width / 2, 0, Math.max(0, mapWidth - canvas.width));
  let cameraY = clamp((followed?.y ?? canvas.height / 2) - canvas.height / 2, 0, Math.max(0, mapHeight - canvas.height));
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
  context.fillStyle = "#09131b";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const orderedEntities = [...snapshot.entities].sort((a, b) => a.layer - b.layer);
  context.save();
  context.translate(-Math.round(cameraX), -Math.round(cameraY));
  renderTiles(context, project, cameraX, cameraY, canvas.width, canvas.height);
  for (const entity of orderedEntities) {
    if (isScreenSpaceUiEntity(entity, authoredById.get(entity.id))) continue;
    renderEntity(context, entity, authoredById.get(entity.id), project, images, timelineFrame, clipOverrides);
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
    context.fillStyle = `rgba(0,0,0,${clamp(crt.value, 0, 1) * 0.18})`;
    for (let y = 0; y < canvas.height; y += 3) context.fillRect(0, y, canvas.width, 1);
  }
  const grayscale = enabledEffect(project, "grayscale")?.value ?? 0;
  const sepia = enabledEffect(project, "sepia")?.value ?? 0;
  canvas.style.filter = `grayscale(${clamp(grayscale, 0, 1)}) sepia(${clamp(sepia, 0, 1)})`;
}

function renderTimelineEffects(context: CanvasRenderingContext2D, snapshot: TimelineWorldSnapshot2D, project: RuntimeProject, frame: number) {
  for (const effect of sampleTimelineEffects2D(project.timeline, frame)) {
    if (effect.kind === "camera-shake") continue;
    const target = snapshot.entities.find((entity) => entity.id === effect.targetId);
    if (!target) continue;
    if (effect.kind === "hit-flash") renderHitFlash(context, target, effect);
    else renderParticleBurst(context, target, effect);
  }
}

function renderHitFlash(context: CanvasRenderingContext2D, target: TimelineWorldSnapshot2D["entities"][number], effect: SampledTimelineEffect2D) {
  const radius = Math.max(target.width, target.height) * target.scale * (0.55 + effect.progress * 0.7);
  context.save();
  context.globalCompositeOperation = "screen";
  context.globalAlpha = effect.envelope * Math.min(1, effect.intensity);
  const color = effect.color ?? "#ffffff";
  const gradient = context.createRadialGradient(target.x, target.y, 0, target.x, target.y, radius);
  gradient.addColorStop(0, color); gradient.addColorStop(0.34, `${color}aa`); gradient.addColorStop(1, `${color}00`);
  context.fillStyle = gradient;
  context.beginPath(); context.arc(target.x, target.y, radius, 0, Math.PI * 2); context.fill();
  context.strokeStyle = color;
  context.lineWidth = Math.max(1, 4 * (1 - effect.progress));
  context.beginPath(); context.arc(target.x, target.y, radius * 0.82, 0, Math.PI * 2); context.stroke();
  context.restore();
}

function renderParticleBurst(context: CanvasRenderingContext2D, target: TimelineWorldSnapshot2D["entities"][number], effect: SampledTimelineEffect2D) {
  const count = Math.max(1, Math.min(128, effect.particleCount ?? 18));
  context.save();
  context.fillStyle = effect.color ?? target.accent;
  context.strokeStyle = effect.color ?? target.accent;
  context.globalAlpha = Math.max(0, effect.envelope);
  context.lineCap = "round";
  for (let index = 0; index < count; index += 1) {
    const angle = index / count * Math.PI * 2 + timelineEffectNoise2D(effect.id, index) * 0.7;
    const speed = (18 + Math.abs(timelineEffectNoise2D(effect.id, index + 311)) * 68) * effect.intensity;
    const distance = speed * (1 - Math.pow(1 - effect.progress, 2));
    const gravity = effect.progress * effect.progress * 38 * effect.intensity;
    const x = target.x + Math.cos(angle) * distance;
    const y = target.y + Math.sin(angle) * distance + gravity;
    const radius = Math.max(1.2, (4.5 - effect.progress * 2.8) * (0.65 + Math.abs(timelineEffectNoise2D(effect.id, index + 619)) * 0.7));
    context.lineWidth = radius;
    context.beginPath(); context.moveTo(x - Math.cos(angle) * radius * 2.8, y - Math.sin(angle) * radius * 2.8); context.lineTo(x, y); context.stroke();
    if (effect.progress > 0.52 && index % 3 === 0) {
      context.beginPath(); context.ellipse(x, y + radius, radius * 1.8, radius * 0.65, angle, 0, Math.PI * 2); context.fill();
    }
  }
  context.restore();
}

function applyThreshold(context: CanvasRenderingContext2D, width: number, height: number, requestedLevel: number) {
  const level = clamp(requestedLevel, 0, 255);
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
  const firstColumn = clamp(Math.floor(cameraX / tileSize), 0, columns - 1);
  const lastColumn = clamp(Math.ceil((cameraX + width) / tileSize), 0, columns - 1);
  const firstRow = clamp(Math.floor(cameraY / tileSize), 0, rows - 1);
  const lastRow = clamp(Math.ceil((cameraY + height) / tileSize), 0, rows - 1);
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
  const width = entity.width * entity.scale;
  const height = entity.height * entity.scale;
  const opacity = clamp(entity.opacity ?? 1, 0, 1);
  if (opacity <= 0) return;
  context.save();
  context.globalAlpha *= opacity;
  context.translate(entity.x, entity.y);
  context.rotate(entity.rotation ?? 0);
  const ui = entity.components?.find((component) => component.enabled && component.type === "ui")
    ?? authored?.components.find((component) => component.enabled && component.type === "ui");
  if (ui) {
    const requestedSize = Number(ui.values.fontSize ?? 24);
    const fontSize = clamp(Number.isFinite(requestedSize) ? requestedSize : 24, 8, 256);
    const requestedAlign = ui.values.align;
    context.fillStyle = entity.accent || entity.color;
    context.font = `700 ${fontSize}px system-ui, sans-serif`;
    context.textAlign = requestedAlign === "left" || requestedAlign === "right" ? requestedAlign : "center";
    context.textBaseline = "middle";
    context.fillText(String(ui.values.text ?? ""), 0, 0, Math.max(width, fontSize * 4));
    context.restore();
    return;
  }
  const sprite = entity.components?.find((component) => component.enabled && component.type === "sprite")
    ?? authored?.components.find((component) => component.enabled && component.type === "sprite");
  const assetId = stringValue(sprite?.values.assetId) ?? stringValue(sprite?.values.asset);
  const image = assetId ? images.get(assetId) : undefined;
  const requestedClipId = clipOverrides.find((override) => override.targetId === entity.id)?.clipId ?? stringValue(sprite?.values.animationClip);
  const frame = image && project.atlas?.sourceAssetId === assetId ? currentAtlasFrame(project, timelineFrame / Math.max(1, project.timeline?.fps ?? 60), requestedClipId) : undefined;
  if (image) {
    if (frame) context.drawImage(image, frame.x, frame.y, frame.width, frame.height, -width / 2, -height / 2, width, height);
    else context.drawImage(image, -width / 2, -height / 2, width, height);
  } else {
    context.fillStyle = entity.color;
    context.strokeStyle = entity.accent;
    context.lineWidth = 2;
    context.fillRect(-width / 2, -height / 2, width, height);
    context.strokeRect(-width / 2, -height / 2, width, height);
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

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Standalone playable is missing ${selector}.`);
  return element;
}
