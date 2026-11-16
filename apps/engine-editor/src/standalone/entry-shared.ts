import { migrateProject, openHyperfocusProjectFiles, readStandaloneStreamedAudio } from "@hyperfocus/engine/project";
import { hasHyperfocus3DProject } from "@hyperfocus/engine/project/metadata";
import type { LocalizedDialogueView, StoryCommand } from "@hyperfocus/engine/content";
import type { PlayableBehaviorRegistry2D, PlayableWorldSnapshot } from "@hyperfocus/engine/project/runtime-2d";
import type { GameplaySnapshot3D, Hyperfocus3DSnapshot } from "@hyperfocus/engine/project/runtime-3d";
import type { PlayableSaveDeclaration2D } from "@hyperfocus/engine/project/runtime-save-2d";
import type { PlayableStorySnapshot2D, PlayableStoryStepResult2D } from "@hyperfocus/engine/project/runtime-story-2d";
import type { TimelinePlaybackSnapshot2D, TimelineEventOccurrence2D } from "@hyperfocus/engine/project/runtime-timeline-2d";
import type { WebGl2FrameStats3D } from "@hyperfocus/engine/render/3d-webgl2";
import type { SaveMigrationRegistry } from "@hyperfocus/engine/save";
import { loadingProgress, offlineMusicSources, openWebDelivery, type StandaloneAssetDelivery } from './delivery.ts';
import type { Standalone3DHook } from '../standalone-3d.ts';

export type StandaloneHook = {
  ready: boolean;
  error?: string;
  frameCount: number;
  assetCount: number;
  diagnostics: readonly unknown[];
  savePolicy?: Readonly<PlayableSaveDeclaration2D>;
  snapshot?: () => PlayableWorldSnapshot | GameplaySnapshot3D;
  tutorial?: Standalone3DHook['tutorial'];
  guidedFight?: Standalone3DHook['guidedFight'];
  switchScene?: (sceneId: string) => PlayableWorldSnapshot;
  switchSceneAsync?: (sceneId: string) => Promise<PlayableWorldSnapshot>;
  assets?: StandaloneAssetDelivery;
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
  photoCapture?: Standalone3DHook['photoCapture'];
  audioUnlocked?: () => boolean;
  timelineSnapshot?: () => TimelinePlaybackSnapshot2D;
  drainTimelineEvents?: () => TimelineEventOccurrence2D[];
};

declare global {
  var __hyperfocusPlayable: StandaloneHook | undefined;
  var __hyperfocusProjectBehaviors: PlayableBehaviorRegistry2D | undefined;
}


export type StandaloneOptions = { behaviors?: PlayableBehaviorRegistry2D; saveMigrations?: SaveMigrationRegistry };
export type StandaloneOpened = Awaited<ReturnType<typeof openStandaloneProject>>;
export type StandaloneBootContext = { opened: StandaloneOpened; canvas: HTMLCanvasElement; hook: StandaloneHook; options: StandaloneOptions };

export function createStandaloneEntry({ dimension, boot }: { dimension?: '2d' | '3d'; boot: (context: StandaloneBootContext) => Promise<void> }) {
  const hook: StandaloneHook = { ready: false, frameCount: 0, assetCount: 0, diagnostics: [] };
  globalThis.__hyperfocusPlayable = hook;
  async function bootStandalonePlayable(options: StandaloneOptions = {}) {
    const opened = await openStandaloneProject();
    hook.assets = opened.delivery;
    assertStandaloneDimension({ project: opened.project, dimension });
    await boot({ opened, canvas: required<HTMLCanvasElement>('canvas'), hook, options });
    const loading = document.getElementById('playable-loading');if (loading) loading.hidden = true;
  }
  function startStandalonePlayable(options: StandaloneOptions = {}) {
    if (typeof document === 'undefined') return;
    void bootStandalonePlayable(options).catch((cause) => reportBootFailure({ hook, cause }));
  }
  return { startStandalonePlayable, bootStandalonePlayable };
}

export function assertStandaloneDimension({ project, dimension }: { project: Parameters<typeof hasHyperfocus3DProject>[0]; dimension?: '2d' | '3d' }) {
  if (dimension && hasHyperfocus3DProject(project) !== (dimension === '3d')) throw new Error(`This standalone runtime requires a ${dimension.toUpperCase()} project.`);
}

function reportBootFailure({ hook, cause }: { hook: StandaloneHook; cause: unknown }) {
  const message = cause instanceof Error ? cause.message : String(cause);
  hook.error = message;
  const loading = document.getElementById('playable-loading');if (loading) loading.hidden = true;
  const retry = document.getElementById('playable-retry');if (retry) retry.hidden = false;
  document.body.dataset.hyperfocusReady = "error";
  const output = document.querySelector<HTMLElement>("#playable-error");
  if (output) {
    output.style.display = "block";
    output.textContent = `Playable build failed to start:\n${message}`;
  }
  console.error("Hyperfocus standalone startup failed", cause);
}


export async function openStandaloneProject() {
  const payloadNode = required<HTMLScriptElement>("#hyperfocus-project-pair");
  const parsed: unknown = JSON.parse(payloadNode.textContent ?? "");
  const payload = parsed !== null && typeof parsed === "object" ? parsed : undefined;
  const version = payload ? Reflect.get(payload, "version") : undefined;
  if (version === 2 && payload && typeof Reflect.get(payload, 'manifestUrl') === 'string') return openWebDelivery(Reflect.get(payload, 'manifestUrl'));
  const projectJson = payload ? Reflect.get(payload, "projectJson") : undefined;
  const assetsArchive = payload ? Reflect.get(payload, "assetsArchive") : undefined;
  if (version !== 1 || typeof projectJson !== "string" || typeof assetsArchive !== "string") {
    throw new Error("The embedded portable project pair is invalid.");
  }
  loadingProgress('Opening offline assets…');
  const opened = await openHyperfocusProjectFiles(decodeBase64(projectJson), decodeBase64(assetsArchive), {
    maxArchiveBytes: 536870912,
    maxAssets: 5_000,
    maxUnpackedBytes: 536870912,
    parseProject: migrateProject,
  });

  const streamedAudio = offlineMusicSources({ ...opened, existing: readStandaloneStreamedAudio({ value: payload ? Reflect.get(payload, 'streamedAudio') : undefined, project: opened.project }) });
  const delivery: StandaloneAssetDelivery | undefined = undefined;
  return { ...opened, streamedAudio, delivery };
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}


function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Standalone playable is missing ${selector}.`);
  return element;
}
