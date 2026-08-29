import { runtimeCallback } from "./runtime-ports.ts";
const setupPlayer = runtimeCallback("actorAnimation", "setupPlayer");
const loadOptionalModels = runtimeCallback("modelAssets", "loadOptionalModels");
const tick = runtimeCallback("frameLoop", "tick");
const setupArena = runtimeCallback("terrain", "setupArena");
const setupActorAssets = runtimeCallback("actorAssets", "setupActorAssets");
const setupTextures = runtimeCallback("actorAssets", "setupTextures");
const setupInput = runtimeCallback("inputAndMenu", "setupInput");
const setupMenu = runtimeCallback("inputAndMenu", "setupMenu");
const setupMinimap = runtimeCallback("inputAndMenu", "setupMinimap");
const loadNetworkModule = runtimeCallback("lobbyAndSettings", "loadNetworkModule");
const setupScene = runtimeCallback("sceneSetup", "setupScene");
import { bootState } from "./boot-and-dom.ts";
import { arenaFrameDriver } from "./frame-loop.ts";
import type { AssetLoadTaskContext } from "@hyperfocus/engine/assets/loader";
import { bootContext, bootLoader, bootLoop, bootSmoother, bootSnapshot, bootUi } from "./boot-context.ts";
import { renderer } from "./runtime-context.ts";

export async function init(): Promise<void> {
  bootLoader.add({
    id: "scene",
    label: "Lighting graveyard",
    weight: 0.55,
    load: (context) => withBootTaskContext(context, async () => {
      setupScene();
      reportBootProgress(1, "Scene ready");
    })
  });
  bootLoader.add({
    id: "textures",
    label: "Loading character textures",
    weight: 2,
    load: (context) => withBootTaskContext(context, setupTextures)
  });
  bootLoader.add({
    id: "actors",
    label: "Loading actor animation",
    weight: 1.6,
    load: (context) => withBootTaskContext(context, setupActorAssets)
  });
  bootLoader.add({
    id: "arena",
    label: "Building arena",
    weight: 1,
    load: (context) => withBootTaskContext(context, async () => {
      reportBootProgress(0.12, "Spawning hunter");
      setupPlayer();
      reportBootProgress(0.34, "Building arena");
      setupArena();
      reportBootProgress(0.62, "Binding controls");
      setupInput();
      setupMenu();
      setupMinimap();
      reportBootProgress(1, "Arena ready");
    })
  });
  await bootLoader.load(["scene", "textures", "actors", "arena"]);
  loadOptionalModels();
  loadNetworkModule();
  arenaFrameDriver.reset(performance.now());
  renderer.setAnimationLoop(tick);
  bootContext.snapshot = {
    ...bootSnapshot,
    status: "loaded",
    label: "Arena ready",
    activeLabel: "Arena ready",
    actualProgress: 1,
    visibleProgress: 1,
    updatedAt: performance.now()
  };
  bootSmoother.set(1);
  bootUi.render(bootSnapshot);
  bootLoop.stop();
  bootUi.hide();
}

export async function withBootTaskContext<T>(
  context: AssetLoadTaskContext,
  work: (context: AssetLoadTaskContext) => T | Promise<T>
): Promise<T> {
  const previous = bootState.taskContext;
  bootState.taskContext = context;
  try {
    return await work(context);
  } finally {
    bootState.taskContext = previous;
  }
}

export function reportBootProgress(progress: number, label?: string): void {
  bootState.taskContext?.reportProgress(progress, label);
}

export function bootErrorLabel(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Asset setup failed";
}
