import { openHyperfocusProjectFiles } from "../../../engine/src/project/index.ts";
import { createPlayableWorld, type PlayableBehaviorRegistry2D, type PlayableProject2D, type PlayableWorldSnapshot } from "../../../engine/src/project/runtime-2d.ts";
import { createNavigationBehaviorRegistry2D } from "../../../engine/src/project/runtime-navigation-2d.ts";
import { createPlayableSaveController2D, readPlayableSaveDeclaration2D, type PlayableSaveDeclaration2D } from "../../../engine/src/project/runtime-save-2d.ts";
import { IndexedDbSaveStorage } from "../../../engine/src/save/browser.ts";
import type { SaveMigrationRegistry } from "../../../engine/src/save/index.ts";
import { createPlayableStoryController2D, readPlayableStoryDeclaration2D, type PlayableStorySnapshot2D, type PlayableStoryStepResult2D } from "../../../engine/src/project/runtime-story-2d.ts";
import type { LocalizedDialogueView, StoryCommand } from "../../../engine/src/content/story.ts";
import { createStandaloneAudioController } from "./standalone-audio.ts";
import { bootStandalone3D, type Standalone3DHook } from "./standalone-3d.ts";
import { hasHyperfocus3DProject } from "../../../engine/src/project/runtime-3d.ts";
import type { Hyperfocus3DSnapshot } from "../../../engine/src/project/runtime-3d.ts";
import type { WebGl2FrameStats3D } from "../../../engine/src/render/3d-webgl2.ts";

declare const __HYPERFOCUS_STANDALONE_AUTO_BOOT__: boolean;

type RuntimeProject = PlayableProject2D & {
  id: string;
  name?: string;
  assets?: Array<{ id: string; kind?: string; mimeType?: string }>;
  atlas?: {
    sourceAssetId?: string;
    playbackSpeed?: number;
    frames?: Array<{ id: string; x: number; y: number; width: number; height: number }>;
    sequence?: string[];
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
};

declare global {
  var __hyperfocusPlayable: StandaloneHook | undefined;
}

const hook: StandaloneHook = { ready: false, frameCount: 0, assetCount: 0, diagnostics: [] };
globalThis.__hyperfocusPlayable = hook;

if (typeof __HYPERFOCUS_STANDALONE_AUTO_BOOT__ === "undefined" || __HYPERFOCUS_STANDALONE_AUTO_BOOT__) startStandalonePlayable();

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
  const payload = JSON.parse(payloadNode.textContent ?? "") as { version?: number; projectJson?: string; assetsArchive?: string };
  if (payload.version !== 1 || typeof payload.projectJson !== "string" || typeof payload.assetsArchive !== "string") {
    throw new Error("The embedded portable project pair is invalid.");
  }
  const opened = await openHyperfocusProjectFiles<RuntimeProject>(decodeBase64(payload.projectJson), decodeBase64(payload.assetsArchive), {
    maxArchiveBytes: 512 * 1024 * 1024,
    maxAssets: 5_000,
    maxUnpackedBytes: 512 * 1024 * 1024,
  });
  const project = opened.project;
  const canvas = required<HTMLCanvasElement>("canvas");
  if (hasHyperfocus3DProject(project)) {
    await bootStandalone3D(project, opened.assets, canvas, hook as Standalone3DHook);
    return;
  }
  const navigationBehaviors = createNavigationBehaviorRegistry2D(project);
  const world = createPlayableWorld(project, { behaviors: { ...(options.behaviors ?? {}), ...navigationBehaviors } });
  const context = canvas.getContext("2d", { alpha: false });
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

  const runtimeDiagnostics: unknown[] = [...world.diagnostics];
  const story = readPlayableStoryDeclaration2D(project) ? createPlayableStoryController2D(project) : undefined;
  if (story) {
    hook.storyView = () => story.view();
    hook.storySnapshot = () => story.snapshot();
    hook.storyStep = (actions = []) => story.step(actions);
    hook.drainStoryCommands = () => story.drainCommands();
  }
  const saveDeclaration = readPlayableSaveDeclaration2D(project);
  const saveStorage = saveDeclaration ? new IndexedDbSaveStorage({ maxBytes: saveDeclaration.maxBytes }) : undefined;
  const saves = saveStorage ? createPlayableSaveController2D(project, world, saveStorage, {
    migrations: options.saveMigrations,
    stateProviders: story ? [story.saveStateProvider()] : [],
  }) : undefined;
  if (saves) {
    hook.savePolicy = saves.declaration;
    hook.save = async (slotName) => { await saves.save(slotName); };
    hook.load = (slotName) => saves.restore(slotName);
    hook.reset = () => saves.reset();
    hook.deleteSaveSlot = async (slotName) => { await saves.deleteSlot(slotName); };
    hook.deleteSaveProfile = () => saves.deleteProfile();
    hook.exportSaveProfile = async () => new TextDecoder().decode(await saves.exportProfile());
    hook.importSaveProfile = async (source, overwrite = false) => { await saves.importProfile(source, overwrite); };
    try { await saves.restoreOnBoot(); }
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
  hook.snapshot = () => world.snapshot();
  hook.switchScene = (sceneId) => {
    const snapshot = world.switchScene(sceneId);
    audio.enqueue(world.drainAudioCommands());
    return snapshot;
  };

  let previous = performance.now();
  const renderFrame = (now: number) => {
    const elapsed = Math.min(0.25, Math.max(0, (now - previous) / 1_000));
    previous = now;
    const input = collectInput(heldBindings, touchActions);
    story?.step(resolveActions(project, input));
    world.advance(elapsed, input);
    audio.enqueue(world.drainAudioCommands());
    render(context, canvas, project, world.snapshot(), images, now / 1_000);
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
  snapshot: PlayableWorldSnapshot,
  images: ReadonlyMap<string, HTMLImageElement>,
  time: number,
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
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = "#09131b";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(-Math.round(cameraX), -Math.round(cameraY));
  renderTiles(context, project, cameraX, cameraY, canvas.width, canvas.height);
  for (const entity of [...snapshot.entities].sort((a, b) => a.layer - b.layer)) {
    renderEntity(context, entity, authoredById.get(entity.id), project, images, time);
  }
  context.restore();
  const crt = enabledEffect(project, "crt");
  if (crt) {
    context.fillStyle = `rgba(0,0,0,${clamp(crt.value, 0, 1) * 0.18})`;
    for (let y = 0; y < canvas.height; y += 3) context.fillRect(0, y, canvas.width, 1);
  }
  const grayscale = enabledEffect(project, "grayscale")?.value ?? 0;
  const sepia = enabledEffect(project, "sepia")?.value ?? 0;
  canvas.style.filter = `grayscale(${clamp(grayscale, 0, 1)}) sepia(${clamp(sepia, 0, 1)})`;
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
  entity: PlayableWorldSnapshot["entities"][number],
  authored: PlayableProject2D["scenes"][number]["entities"][number] | undefined,
  project: RuntimeProject,
  images: ReadonlyMap<string, HTMLImageElement>,
  time: number,
) {
  const width = entity.width * entity.scale;
  const height = entity.height * entity.scale;
  const sprite = authored?.components.find((component) => component.enabled && component.type === "sprite");
  const assetId = stringValue(sprite?.values.assetId) ?? stringValue(sprite?.values.asset);
  const image = assetId ? images.get(assetId) : undefined;
  const frame = image && project.atlas?.sourceAssetId === assetId ? currentAtlasFrame(project, time) : undefined;
  if (image) {
    if (frame) context.drawImage(image, frame.x, frame.y, frame.width, frame.height, entity.x - width / 2, entity.y - height / 2, width, height);
    else context.drawImage(image, entity.x - width / 2, entity.y - height / 2, width, height);
  } else {
    context.fillStyle = entity.color;
    context.strokeStyle = entity.accent;
    context.lineWidth = 2;
    context.fillRect(entity.x - width / 2, entity.y - height / 2, width, height);
    context.strokeRect(entity.x - width / 2, entity.y - height / 2, width, height);
  }
}

function currentAtlasFrame(project: RuntimeProject, time: number) {
  const atlas = project.atlas;
  if (!atlas?.frames?.length || !atlas.sequence?.length) return undefined;
  const sequenceId = atlas.sequence[Math.floor(time * (atlas.playbackSpeed ?? 1) * 8) % atlas.sequence.length];
  return atlas.frames.find((frame) => frame.id === sequenceId);
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
