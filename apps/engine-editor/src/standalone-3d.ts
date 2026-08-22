import { createHyperfocus3DRuntime, type Hyperfocus3DSnapshot, type PortableAsset3D } from "../../../engine/src/project/runtime-3d.ts";
import { createWebGl2Renderer3D, type WebGl2FrameStats3D } from "../../../engine/src/render/3d-webgl2.ts";
import { SaveProfileStore, type SaveJsonValue } from "../../../engine/src/save/index.ts";
import { IndexedDbSaveStorage } from "../../../engine/src/save/browser.ts";
import { createStandaloneAudioController } from "./standalone-audio.ts";

type Project3D = { id: string; settings: { input: Array<{ action: string; bindings: string[] }> }; extensions?: { hyperfocus3D?: unknown; [key: string]: unknown } };
export type Standalone3DHook = {
  ready: boolean;
  frameCount: number;
  assetCount: number;
  diagnostics: readonly unknown[];
  renderMode?: "webgl2-3d";
  rendererStats?: WebGl2FrameStats3D;
  snapshot?: () => Hyperfocus3DSnapshot;
  save?: (slot?: string) => Promise<void>;
  load?: (slot?: string) => Promise<boolean>;
  reset?: () => Hyperfocus3DSnapshot;
  deleteSaveSlot?: (slot?: string) => Promise<void>;
  deleteSaveProfile?: () => Promise<void>;
  exportSaveProfile?: () => Promise<string>;
  importSaveProfile?: (source: string, overwrite?: boolean) => Promise<void>;
  audioUnlocked?: () => boolean;
};

/** Browser host for the DOM-free portable 3D runtime. No URL or module loading occurs. */
export async function bootStandalone3D(project: Project3D, assets: readonly PortableAsset3D[], canvas: HTMLCanvasElement, hook: Standalone3DHook): Promise<void> {
  const runtime = await createHyperfocus3DRuntime(project, assets);
  const diagnostics: unknown[] = [...runtime.diagnostics];
  const renderer = createWebGl2Renderer3D({
    canvas,
    scene: runtime.scene,
    maxInstances: runtime.declaration.budgets.entities,
    clearColor: [0.025, 0.045, 0.075, 1],
    maxDrawingBufferWidth: 3840,
    maxDrawingBufferHeight: 2160,
    maxDevicePixelRatio: 2,
    onDiagnostic: (item) => diagnostics.push(item),
  });
  canvas.tabIndex = 0;
  const savePolicy = runtime.declaration.save;
  const audio = createStandaloneAudioController(assets, {
    onError: (error) => diagnostics.push({ severity: "warning", code: "audio-runtime", message: error.message }),
  });
  let queuedAudio = false;
  const unlockAudio = () => {
    if (!queuedAudio && runtime.declaration.audio.cues[0]) {
      queuedAudio = true;
      audio.enqueue([{ type: "play", commandId: "3d-first-input", sceneId: runtime.declaration.activeSceneId, entityId: "runtime", componentId: "audio", assetId: runtime.declaration.audio.cues[0], bus: "sfx", gain: 0.22, pan: 0, loop: false, priority: 1 }]);
    }
    void audio.unlockAndFlush().catch((cause) => diagnostics.push({ severity: "warning", code: "audio-unlock", message: message(cause) }));
  };
  const storage = new IndexedDbSaveStorage({ maxBytes: savePolicy.maxBytes });
  const store = new SaveProfileStore(storage, project.id, { currentDataVersion: 0, limits: { maxBytes: savePolicy.maxBytes, maxSlots: 1 } });
  const initial = runtime.snapshot();
  const slot = (requested?: string) => {
    const value = requested ?? savePolicy.slot;
    if (value !== savePolicy.slot) throw new Error(`3D save slot ${value} is not declared; expected ${savePolicy.slot}.`);
    return value;
  };
  const load = async (requested?: string) => {
    const saved = await store.loadSlot("local", slot(requested));
    if (!saved) return false;
    const value = saved.data as unknown as { schema?: unknown; snapshot?: Hyperfocus3DSnapshot };
    if (value?.schema !== "hyperfocus-3d-snapshot-v1" || !value.snapshot) throw new Error("Saved slot is not a Hyperfocus 3D snapshot.");
    runtime.restore(value.snapshot);
    return true;
  };
  hook.renderMode = "webgl2-3d";
  hook.assetCount = assets.length;
  hook.diagnostics = diagnostics;
  hook.snapshot = () => runtime.snapshot();
  hook.save = async (requested) => { await store.saveSlot("local", slot(requested), { schema: "hyperfocus-3d-snapshot-v1", snapshot: runtime.snapshot() } as unknown as SaveJsonValue); };
  hook.load = load;
  hook.reset = () => runtime.restore(initial);
  hook.deleteSaveSlot = async (requested) => { await store.deleteSlot("local", slot(requested)); };
  hook.deleteSaveProfile = () => store.deleteProfile("local");
  hook.exportSaveProfile = async () => new TextDecoder().decode(await store.exportProfile("local"));
  hook.importSaveProfile = async (source, overwrite = false) => { await store.importProfile(source, overwrite); };
  hook.audioUnlocked = audio.isUnlocked;
  if (savePolicy.restoreOnBoot) {
    try { await load(); }
    catch (cause) { diagnostics.push({ severity: "warning", code: "save-runtime", message: message(cause) }); }
  }

  const held = new Set<string>();
  const prevented = new Set(project.settings.input.flatMap((mapping) => mapping.bindings));
  const clear = () => held.clear();
  window.addEventListener("keydown", (event) => { held.add(event.code); if (prevented.has(event.code)) event.preventDefault(); unlockAudio(); });
  window.addEventListener("keyup", (event) => { held.delete(event.code); if (prevented.has(event.code)) event.preventDefault(); });
  window.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", () => { if (document.hidden) clear(); });
  let previous = performance.now(), accumulator = 0;
  const frame = (now: number) => {
    accumulator = Math.min(0.25, accumulator + Math.max(0, (now - previous) / 1000)); previous = now;
    const actions = new Set<string>();
    for (const mapping of project.settings.input) if (mapping.bindings.some((binding) => held.has(binding))) actions.add(mapping.action);
    const gamepad = navigator.getGamepads?.()[0];
    if ((gamepad?.axes[0] ?? 0) < -0.3) actions.add("move-left");
    if ((gamepad?.axes[0] ?? 0) > 0.3) actions.add("move-right");
    if ((gamepad?.axes[1] ?? 0) < -0.3) actions.add("move-up");
    if ((gamepad?.axes[1] ?? 0) > 0.3) actions.add("move-down");
    while (accumulator >= 1 / 60) { runtime.step(actions); accumulator -= 1 / 60; }
    const width = Math.max(1, canvas.clientWidth || canvas.width), height = Math.max(1, canvas.clientHeight || canvas.height);
    hook.rendererStats = renderer.render(runtime.compile(), runtime.viewProjection(width / height), { cameraPosition: runtime.cameraPosition() });
    hook.frameCount += 1;
    requestAnimationFrame(frame);
  };
  hook.ready = true;
  document.body.dataset.hyperfocusReady = "true";
  canvas.focus({ preventScroll: true });
  requestAnimationFrame(frame);
  window.addEventListener("pagehide", () => { renderer.dispose(); void storage.close(); void audio.dispose(); }, { once: true });
}

function message(value: unknown) { return value instanceof Error ? value.message : String(value); }
