import { overlayOwnsEscape } from "@hyperfocus/ui/overlay-stack";
import { dispatchInspectorChange } from "./components/inspector-change";
import { trapFocus, fileInput, download, appendConsole, showError, announce, required, setText, slug, formatBytes } from './app/shell-browser-helpers';
import { writeDirectoryFile, type DirectoryHandle } from './app/shell-directory-files';
import {
  createDefaultProject,
  migrateProject,
  uniqueId,
  type EditorAsset,
  type EditorComponent,
  type EditorProject,
} from "@hyperfocus/engine/project";
import { createEditorCommandSession } from "./editor-command-session.ts";
import { createEditorPortableFiles, openEditorPortableFiles, type EditorPortableAsset } from "./portable-project.ts";
import { collectPlayableBuildAssets } from "./playable-build-assets.ts";
import { createStandalonePlayableHtml } from "@hyperfocus/engine/project";
import {
  createEditorNeutralExport,
  createNeutralExportArchive,
  neutralExportBaseName,
  writeNeutralExportDirectory,
} from "./neutral-export.ts";
import { HYPERFOCUS_ASSETS_FILENAME, HYPERFOCUS_DIRECTORY, HYPERFOCUS_PROJECT_FILENAME, hashHyperfocusAsset } from "@hyperfocus/engine/project";
import { BUILTIN_PLAYABLE_BEHAVIOR_DEFINITIONS_2D, createPlayableBehaviorComponentValues2D, playableBehaviorDefinition2D, validatePlayablePlatformers2D, type PlayableBehaviorDefinition2D } from "@hyperfocus/engine/project/runtime-2d";
import { readHyperfocus3DDeclaration } from "@hyperfocus/engine/project/runtime-3d";
import { auditNavigationProject2D } from "@hyperfocus/engine/project/runtime-navigation-2d";
import { validatePlayableSaveProject2D } from "@hyperfocus/engine/project/runtime-save-2d";
import { validatePlayableStoryProject2D } from "@hyperfocus/engine/project/runtime-story-2d";
import { auditPlayableTimeline2D } from "@hyperfocus/engine/project/runtime-timeline-2d";
import { EDITOR_STARTER_IDS, type EditorStarterId } from "./starter-projects.ts";
import { mountEditorShellView, type EditorCenterTab, type EditorMode, type EditorResourceMenuItem } from "./editor-shell-view.tsx";
import { mountEditorSourceSurface } from "./editor-source-surface.tsx";
import { compileStandaloneProjectSource, hasCustomProjectBehaviors } from "./live-source.ts";
import { toggleWorkbenchPanel } from "@hyperfocus/ui/workbench";
import { applyEditorUiPreferences, readEditorUiPreferences, writeEditorUiPreferences } from "./app/editor-preferences.ts";
import type { EditorCenterContentState } from "./components/editor-center-content.tsx";
import { mountEditorWorkspaceLayouts } from "./editor-workspace-layouts.ts";
import { findEditorAssetUsages, removeEditorAssetMetadata, renameEditorAsset, replaceEditorAssetMetadata } from "./editor-asset-model.ts";
import { createEditor3DEntity, createEditor3DLight, createEditor3DMaterial, duplicateEditor3DEntity, placeImportedGltf, readEditor3DDeclaration, removeEditor3DEntity } from "./editor-3d-authoring.ts";
import { attachEditorScriptBehavior, createEditorScript, findEditorScriptReferences, readEditorBehaviorDefinitions, removeEditorScript, renameEditorScript, upsertEditorBehaviorDefinition } from "./editor-script-model.ts";
import { EDITOR_CENTER_TAB_IDS, EDITOR_MODE_IDS, createEditorSessionController, type EditorWorkspaceId } from "./app/editor-session.ts";
import { EDITOR_COMPONENT_TYPES, eventElementTarget, isAbortError, isOneOf, optionalOneOf } from "./app/client-runtime-guards.ts";
import type { EditorPaletteCommand } from "./components/editor-command-palette.tsx";

const RECOVERY_KEY = "catalog-engine.editor.recovery.v1";
const LAST_BUILD_KEY = "catalog-engine.editor.last-build.v1";
const ASSET_DB = "catalog-engine-editor-assets";
const MAX_PROJECT_FILE_BYTES = 10485760;
const MAX_ASSET_FILE_BYTES = 268435456;
const MAX_ASSET_CATALOG_BYTES = 1073741824;
const FIRST_RUN_KEY = "catalog-engine.editor.first-run-complete.v1";
const TUTORIAL_PROGRESS_KEY = "hyperfocus.editor.tutorial.v1";

export type { EditorMode } from "./editor-shell-view.tsx";

export type EditorShellBridge = {
  captureProject(base: EditorProject): EditorProject;
  applyProject(project: EditorProject): void;
  showWorkspace(id: "stage" | "scene3d" | "tilemap" | "atlas" | "script" | "post" | "motion" | "diagnostics"): void;
  activeWorkspace(): string;
  selectedEntityId(): string | null;
  selectEntity(id: string): void;
  viewportPoint(clientX: number, clientY: number): { x: number; y: number };
  previewAsset(id: string, blob: Blob): void;
  play(project: EditorProject, options?: { sourcePermission?: boolean }): Promise<string | void> | string | void;
  compileSource(project: EditorProject): Promise<{ blocker?: string; definitions?: PlayableBehaviorDefinition2D[] }>;
  clearSource(): void;
  pause(): void;
  togglePlayback(): void;
  captureProfile(): Record<string, unknown>;
  commandPaletteCommands(): readonly EditorPaletteCommand[];
  log(message: string): void;
};

type EditorScriptFile = { path: string; language: "typescript"; source: string };
type EditorScripts = { activePath: string; files: EditorScriptFile[] };
type BuildSourcePreflight = { revision: string; status: "pending" | "ready" | "error"; detail: string };
type AudioAudition = { assetId: string; element: HTMLAudioElement; objectUrl: string; cancelLoad?: () => void };
declare global { var showDirectoryPicker: ((options: unknown) => Promise<DirectoryHandle>) | undefined; }

/** Returns hierarchy depths aligned with the authored entity order. */
export function editorEntityTreeDepths(entities: readonly { id: string; parentId?: string }[]): number[] {
  const parentById = new Map(entities.map((entity) => [entity.id, entity.parentId]));
  const depthById = new Map<string, number>();

  for (const entity of entities) {
    if (depthById.has(entity.id)) continue;
    const unresolved: string[] = [];
    const visited = new Set<string>();
    let cursor = entity.id;
    let depth = -1;

    while (true) {
      const resolved = depthById.get(cursor);
      if (resolved !== undefined) {
        depth = resolved;
        break;
      }
      if (visited.has(cursor)) break;
      visited.add(cursor);
      unresolved.push(cursor);
      const parentId = parentById.get(cursor);
      if (!parentId || !parentById.has(parentId)) break;
      cursor = parentId;
    }

    while (unresolved.length) {
      depth += 1;
      depthById.set(unresolved.pop()!, Math.max(0, depth));
    }
  }

  return entities.map((entity) => depthById.get(entity.id) ?? 0);
}

export function createEditorShell(bridge: EditorShellBridge) {
  const recovered = readRecovery();
  const history = createEditorCommandSession(recovered ?? createDefaultProject(), {
    async putAsset(asset) {
      const blob = new Blob([new Uint8Array(asset.bytes)], { type: asset.mimeType });
      await storeAssetRecords([{ id: asset.id, blob }]);
      bridge.previewAsset(asset.id, blob);
    },
    async removeAsset(assetId) { await removeAssetRecord(assetId); },
  });
  const transactSections = (label: string, dirtySections: readonly (keyof EditorProject & string)[], update: (project: EditorProject) => void) => history.transactSections({ label, dirtySections, update });
  let mode: EditorMode = "edit";
  let selectedCenterTab: EditorCenterTab = "project";
  let activeScriptPath = "";
  let active3DEntityId = "";
  let active3DMaterialId = "";
  let active3DLightId = "";
  let active3DResourceKind: "object" | "material" | "light" = "object";
  let selectedAssetId = "";
  let remoteSocket: WebSocket | undefined;
  let releaseFocusTrap: (() => void) | undefined;
  let sourcePermission = false;
  let sourceCompileRequest = 0;
  let modeRequest = 0;
  let uiPreferences = readEditorUiPreferences();
  const session = createEditorSessionController({
    commands: history,
    initial: { workspace: uiPreferences.app.defaultWorkspace },
  });
  let uiPreferencesWriteTimer: number | undefined;
  let pendingReplacementAssetId = "";
  const assetBinaryRecovery = new Map<string, Map<string, string>>();
  const activeAssetBinaryFingerprint = new Map<string, string>();
  let assetBinarySyncRequest = 0;
  let assetBinarySyncPromise: Promise<void> = Promise.resolve();
  let recoveryWriteRequest = 0;
  let buildSourcePreflight: BuildSourcePreflight = { revision: "", status: "pending", detail: "Source compile pending" };
  let audioAudition: AudioAudition | undefined;
  let audioAuditionRequest = 0;
  let audioAuditionStatus: { assetId: string; phase: "idle" | "loading" | "playing" | "complete" | "error"; message: string } = { assetId: "", phase: "idle", message: "Ready to decode" };

  const app = required<HTMLElement>(".app-shell");
  const workspaceHost = required<HTMLElement>(".workspace-host");
  const resourceNav = required<HTMLElement>(".workspace-tabs");
  applyEditorUiPreferences(uiPreferences);
  const shellView = mountEditorShellView({
    app,
    workspaceHost,
    resourceNav,
    layout: uiPreferences.app.workbench,
    narrowPane: uiPreferences.app.narrowPane,
    onWorkbenchLayoutChange(layout, reason) {
      uiPreferences = { ...uiPreferences, app: { ...uiPreferences.app, workbench: layout } };
      applyEditorUiPreferences(uiPreferences);
      if (reason === "resize") scheduleUiPreferencesWrite();
      else persistUiPreferences();
    },
    onNarrowPaneChange(narrowPane) {
      uiPreferences = { ...uiPreferences, app: { ...uiPreferences.app, narrowPane } };
      applyEditorUiPreferences(uiPreferences);
      persistUiPreferences();
    },
    onModeChange(nextMode) {
      void setMode(nextMode);
    },
    onCenterTabChange(tab) {
      selectedCenterTab = tab;
      renderCenter();
    },
    onTutorialStepChange(step) {
      writeTutorialProgress({ step, completed: false });
    },
    onTutorialClose(reason) {
      shellView.update({ tourOpen: false });
      const completed = reason === "complete";
      writeTutorialProgress({ step: completed ? 3 : readTutorialProgress().step, completed });
      announce(completed ? "Editor essentials tour complete." : "Editor essentials tour closed. You can resume it from Learn.");
    },
    commandPaletteCommands: bridge.commandPaletteCommands,
    onCommandPaletteOpenChange(open) {
      if (globalThis.__engineEditor) globalThis.__engineEditor.commandPaletteOpen = open;
      void session.dispatch(open
        ? { type: "overlay.set", overlay: { kind: "command-palette", query: "" } }
        : { type: "overlay.close" });
    },
    onCommandRun(command) {
      bridge.log(`command → ${command.id}`);
    },
  });
  let disposeWorkspaceLayouts = mountWorkspaceLayouts();
  function mountWorkspaceLayouts() {
    return mountEditorWorkspaceLayouts({
      root: workspaceHost,
      layouts: uiPreferences.app.workspaces,
      onCommit(id, layout) {
        uiPreferences = writeEditorUiPreferences({
          ...uiPreferences,
          app: { ...uiPreferences.app, workspaces: { ...uiPreferences.app.workspaces, [id]: layout } },
        });
      },
    });
  }
  let viewportFullscreen = false;
  const center = shellView.center;
  const onConsoleOpen = () => setConsoleOpen(true);
  document.addEventListener("hyperfocus:console-open", onConsoleOpen);

  const openInput = fileInput(".json,.hfp,application/json,application/octet-stream", true);
  const assetInput = fileInput("image/*,audio/*,.json,.csv,.txt,.glb,.gltf,.fbx,.ttf,.otf", true);
  const replacementAssetInput = fileInput("image/*,audio/*,.json,.csv,.txt,.glb,.gltf,.fbx,.ttf,.otf", false);
  app.append(openInput, assetInput, replacementAssetInput);
  const scriptTextarea = required<HTMLTextAreaElement>("#script-editor");
  const sourceSurface = mountEditorSourceSurface({
    textarea: scriptTextarea,
    status: required("#script-editor-status"),
    lineCount: required("#script-line-count"),
    save: (path, source) => persistScript(path, source),
  });

  const unsubscribe = history.subscribe(() => {
    const recoveryRequest = ++recoveryWriteRequest;
    const recoverySnapshot = history.serialize();
    try { bridge.applyProject(history.project); } catch (cause) { throw new Error(`Apply project to runtime failed: ${cause instanceof Error ? cause.message : String(cause)}`, { cause }); }
    try { render(); } catch (cause) { throw new Error(`Render editor project failed: ${cause instanceof Error ? cause.message : String(cause)}`, { cause }); }
    assetBinarySyncPromise = synchronizeRecoveredAssetBinaries();
    void assetBinarySyncPromise.then(() => {
      if (recoveryRequest === recoveryWriteRequest) localStorage.setItem(RECOVERY_KEY, recoverySnapshot);
    }).catch((cause) => showError(cause));
  });

  bridge.applyProject(history.project);
  showWorkspace(uiPreferences.app.defaultWorkspace);
  bindActions();
  render();
  void hydrateAssetPreviews(history.project, bridge.previewAsset);
  if (!localStorage.getItem(FIRST_RUN_KEY)) queueMicrotask(() => openCenter("project"));

  function onSidebarDragOver(event: DragEvent) {
    const sidebar = eventElementTarget(event)?.closest<HTMLElement>(".project-sidebar");
    if (!sidebar) return;
    event.preventDefault(); sidebar.classList.add("is-drop-target");
  }

  function onSidebarDragLeave(event: DragEvent) {
    eventElementTarget(event)?.closest<HTMLElement>(".project-sidebar")?.classList.remove("is-drop-target");
  }

  function onSidebarDrop(event: DragEvent) {
    const sidebar = eventElementTarget(event)?.closest<HTMLElement>(".project-sidebar");
    if (!sidebar) return;
    event.preventDefault();
    sidebar.classList.remove("is-drop-target");
    void importAssets([...(event.dataTransfer?.files ?? [])]);
  }

  function bindActions() {
    document.addEventListener("click", onClick);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("change", onChange);
    document.addEventListener("keydown", onKeyDown, true);
    openInput.addEventListener("change", () => { void openProjectFiles([...(openInput.files ?? [])]); });
    assetInput.addEventListener("change", () => { void importAssets([...(assetInput.files ?? [])]); });
    replacementAssetInput.addEventListener("change", () => { void replaceAssetBinary(pendingReplacementAssetId, replacementAssetInput.files?.[0]); });
    document.addEventListener("dragover", onSidebarDragOver);
    document.addEventListener("dragleave", onSidebarDragLeave);
    document.addEventListener("drop", onSidebarDrop);
    const stageDrop = required<HTMLElement>("#stage-canvas-wrap");
    stageDrop.addEventListener("dragover", (event) => {
      if (!event.dataTransfer?.types.includes("application/x-engine-asset")) return;
      event.preventDefault();
      stageDrop.classList.add("is-asset-drop-target");
    });
    stageDrop.addEventListener("dragleave", () => stageDrop.classList.remove("is-asset-drop-target"));
    stageDrop.addEventListener("drop", (event) => {
      stageDrop.classList.remove("is-asset-drop-target");
      const assetId = event.dataTransfer?.getData("application/x-engine-asset");
      if (!assetId) return;
      event.preventDefault();
      createEntityFromAsset(assetId, bridge.viewportPoint(event.clientX, event.clientY));
    });
  }

  function onClick(event: MouseEvent) {
    const eventTarget = eventElementTarget(event);
    closeResourceMenus(eventTarget?.closest<HTMLDetailsElement>(".resource-overflow") ?? undefined);
    const target = resolveEditorInteractionTarget(eventTarget);
    if (!target) return;
    if (target.dataset.editorMode && target.dataset.tabValue === undefined) {
      if (isOneOf(target.dataset.editorMode, EDITOR_MODE_IDS)) return setMode(target.dataset.editorMode);
      return;
    }
    if (target.dataset.centerTab) {
      if (!isOneOf(target.dataset.centerTab, EDITOR_CENTER_TAB_IDS)) return;
      selectedCenterTab = target.dataset.centerTab;
      renderCenter();
      return;
    }
    if (target.dataset.projectEntity) {
      selectedAssetId = "";
      showWorkspace("stage");
      selectEntity(target.dataset.projectEntity);
      refreshSelection();
      return;
    }
    if (target.dataset.projectScene) {
      transactSections("Switch active scene", ["activeSceneId"], (project) => { project.activeSceneId = target.dataset.projectScene!; });
      return;
    }
    if (target.dataset.scriptPath) {
      void session.dispatch({ type: "selection.set", selection: { kind: "script", path: target.dataset.scriptPath } });
      return void switchScript(target.dataset.scriptPath);
    }
    if (target.dataset["3dEntity"]) {
      active3DEntityId = target.dataset["3dEntity"];
      active3DResourceKind = "object";
      void session.dispatch({ type: "selection.set", selection: { kind: "scene3d-object", sceneId: history.project.activeSceneId, objectId: active3DEntityId } });
      render3DWorkspace();
      return;
    }
    if (target.dataset["3dMaterial"]) {
      active3DMaterialId = target.dataset["3dMaterial"];
      active3DResourceKind = "material";
      void session.dispatch({ type: "selection.set", selection: { kind: "scene3d-material", materialId: active3DMaterialId } });
      render3DWorkspace();
      return;
    }
    if (target.dataset["3dLight"]) {
      active3DLightId = target.dataset["3dLight"];
      active3DResourceKind = "light";
      void session.dispatch({ type: "selection.set", selection: { kind: "scene3d-light", sceneId: history.project.activeSceneId, lightId: active3DLightId } });
      render3DWorkspace();
      return;
    }
    const action = target.dataset.editorAction;
    if (!action) return;
    if (action === "new") return openCenter("project");
    if (action === "learn") return openCenter("learn");
    if (action === "start-guided-tour") {
      const progress = readTutorialProgress();
      closeCenter();
      shellView.update({ tourOpen: true, tourStep: progress.completed ? 0 : progress.step });
      return;
    }
    if (action === "learn-stage") { closeCenter(); showWorkspace("stage"); return; }
    if (action === "learn-polish") { closeCenter(); showWorkspace("post"); return; }
    if (action === "learn-code") { closeCenter(); showWorkspace("script"); return; }
    if (action === "learn-3d") { closeCenter(); showWorkspace("scene3d"); return; }
    if (action === "open") return void openProject();
    if (action === "save") return void saveProject();
    if (action === "import-assets") return assetInput.click();
    if (action === "undo") return undo();
    if (action === "redo") return redo();
    if (action === "settings") return openCenter("settings");
    if (action === "build") return void openBuildCenter();
    if (action === "profile") return openCenter("profile");
    if (action === "history") return openCenter("history");
    if (action === "close-center") return closeCenter();
    if (action === "close-console") return setConsoleOpen(false);
    if (action === "toggle-sidebar") return toggleSidebar();
    if (action === "toggle-inspector") return toggleInspector();
    if (action === "fullscreen") return toggleFullscreen();
    if (action === "create-project") return void createProjectFromForm();
    if (action === "create-template") return void createProjectFromTemplate(optionalOneOf(target.dataset.template, EDITOR_STARTER_IDS));
    if (action === "create-scene") return createScene();
    if (action === "rename-scene") return renameScene(target.dataset.sceneId);
    if (action === "duplicate-scene") return duplicateScene(target.dataset.sceneId);
    if (action === "delete-scene") return deleteScene(target.dataset.sceneId);
    if (action === "activate-scene") return activateScene(target.dataset.sceneId);
    if (action === "create-entity") return createEntity();
    if (action === "rename-entity") return renameEntity(target.dataset.entityId);
    if (action === "duplicate-entity") return duplicateEntity(target.dataset.entityId);
    if (action === "create-child-entity") return createChildEntity(target.dataset.entityId);
    if (action === "unparent-entity") return unparentEntity(target.dataset.entityId);
    if (action === "delete-entity-by-id") return deleteEntity(target.dataset.entityId);
    if (action === "delete-entity") return deleteSelectedEntity();
    if (action === "add-component") return addComponent(optionalOneOf(target.dataset.componentType, EDITOR_COMPONENT_TYPES));
    if (action === "add-selected-component") return addSelectedComponent(target);
    if (action === "toggle-component") return toggleComponent(target.dataset.componentId);
    if (action === "duplicate-component") return duplicateComponent(target.dataset.componentId);
    if (action === "reset-component") return resetComponent(target.dataset.componentId);
    if (action === "remove-component") return removeComponent(target.dataset.componentId);
    if (action === "add-behavior-variable") return addBehaviorVariable(target);
    if (action === "remove-behavior-variable") return removeBehaviorVariable(target.dataset.componentId, target.dataset.componentKey);
    if (action === "open-script") return void openSelectedScript(target.dataset.componentId);
    if (action === "create-behavior-extension") return void createBehaviorExtension(target.dataset.componentId);
    if (action === "select-asset") return selectAsset(target.dataset.assetId);
    if (action === "create-entity-from-asset") return createEntityFromAssetId(target.dataset.assetId);
    if (action === "rename-asset") return renameAsset(target.dataset.assetId);
    if (action === "replace-asset") return chooseAssetReplacement(target.dataset.assetId);
    if (action === "duplicate-asset") return void duplicateAsset(target.dataset.assetId);
    if (action === "find-asset-usages") return showAssetUsages(target.dataset.assetId);
    if (action === "audition-audio-asset") return void auditionAudioAsset(target.dataset.assetId);
    if (action === "stop-audio-audition") return stopAudioAudition();
    if (action === "delete-asset") return void deleteAsset(target.dataset.assetId);
    if (action === "create-3d-object") return create3DObject();
    if (action === "duplicate-3d-object") return duplicate3DObject(target.dataset.entityId ?? active3DEntityId);
    if (action === "delete-3d-object") return delete3DObject(target.dataset.entityId ?? active3DEntityId);
    if (action === "create-3d-material") return create3DMaterial();
    if (action === "create-3d-light") return create3DLight();
    if (action === "rename-3d-material") return rename3DMaterial(target.dataset.materialId);
    if (action === "duplicate-3d-material") return duplicate3DMaterial(target.dataset.materialId);
    if (action === "delete-3d-material") return delete3DMaterial(target.dataset.materialId);
    if (action === "rename-3d-light") return rename3DLight(target.dataset.lightId);
    if (action === "duplicate-3d-light") return duplicate3DLight(target.dataset.lightId);
    if (action === "delete-3d-light") return delete3DLight(target.dataset.lightId);
    if (action === "place-3d-asset") return void place3DAsset(target.dataset.assetId);
    if (action === "create-script") return void createScript();
    if (action === "rename-script") return void renameScript(target.dataset.path);
    if (action === "delete-script") return void deleteScript(target.dataset.path);
    if (action === "find-script-references") return findScriptReferences(target.dataset.path);
    if (action === "attach-script") return attachScript(target.dataset.path ?? activeScriptPath);
    if (action === "save-script") return saveScript();
    if (action === "toggle-live-source") return void setLiveSourcePermission(!sourcePermission);
    if (action === "download-script") return downloadScript();
    if (action === "download-project") return void downloadProject();
    if (action === "export-neutral") return void exportNeutralProject();
    if (action === "download-build") return void downloadBuild();
    if (action === "download-ci") return downloadCiReport();
    if (action === "capture-profile") return downloadProfile();
    if (action === "connect-remote") return connectRemote();
    if (action === "restore-recovery") return void restoreRecovery();
    if (action === "clear-recovery") return clearRecovery();
  }

  function onContextMenu(event: MouseEvent) {
    const resource = eventElementTarget(event)?.closest<HTMLElement>("[data-context-resource]");
    const menu = resource?.querySelector<HTMLDetailsElement>(".resource-overflow");
    if (!menu) return;
    event.preventDefault();
    closeResourceMenus(menu);
    menu.open = true;
    queueMicrotask(() => menu.querySelector<HTMLElement>("[role='menuitem']")?.focus());
  }

  function onChange(event: Event) { dispatchInspectorChange(event, { editEntityProperty, editComponentValue, edit3DField }); }

  function onKeyDown(event: KeyboardEvent) {
    if (overlayOwnsEscape(event) || (event.target instanceof HTMLElement && event.target.closest('[aria-haspopup="listbox"], [role="listbox"]'))) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const openMenu = document.querySelector<HTMLDetailsElement>(".resource-overflow[open]");
    if (event.key === "Escape" && openMenu) {
      openMenu.open = false;
      openMenu.querySelector<HTMLElement>("summary")?.focus();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (target?.getAttribute("role") === "menuitem" && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End")) {
      const items = [...target.closest<HTMLElement>("[role='menu']")?.querySelectorAll<HTMLElement>("[role='menuitem']:not([disabled])") ?? []];
      if (items.length) {
        const current = items.indexOf(target);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
        event.preventDefault();
        return;
      }
    }
    if (target?.getAttribute("role") === "treeitem") {
      const tree = target.closest<HTMLElement>("[role='tree']");
      const items = [...tree?.querySelectorAll<HTMLElement>("[role='treeitem']") ?? []];
      if (items.length && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End")) {
        const current = items.indexOf(target);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : Math.min(items.length - 1, Math.max(0, current + (event.key === "ArrowDown" ? 1 : -1)));
        items.forEach((item, index) => { item.tabIndex = index === next ? 0 : -1; });
        items[next]?.focus();
        event.preventDefault();
        return;
      }
      if (event.key === "ArrowLeft" && target.dataset.parentId) {
        const parent = items.find((item) => item.dataset.projectEntity === target.dataset.parentId);
        if (parent) { parent.tabIndex = 0; target.tabIndex = -1; parent.focus(); event.preventDefault(); return; }
      }
      if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") { target.click(); event.preventDefault(); return; }
    }
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
    if (event.key === "Escape" && !center.hidden) { closeCenter(); event.preventDefault(); return; }
    if (typing) return;
    if (event.code === "Space" && bridge.activeWorkspace() === "motion") { event.preventDefault(); event.stopPropagation(); required<HTMLButtonElement>("#sequence-play").click(); return; }
    if (event.code === "Space") { event.preventDefault(); event.stopPropagation(); bridge.togglePlayback(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveProject(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
    if (event.key === "F1") { event.preventDefault(); void setMode("edit"); }
    if (event.key === "F6") { event.preventDefault(); void setMode("play"); }
    if (event.key === "F7") { event.preventDefault(); void setMode("profile"); }
    if (event.key === "F8") { event.preventDefault(); void setMode("build"); }
  }

  async function setMode(next: EditorMode) {
    const request = ++modeRequest;
    if (next === "play") {
      if (hasCustomProjectBehaviors(history.project) && !sourcePermission) {
        mode = "edit";
        bridge.pause();
        showError(new Error("This project uses custom source. Open Code and enable Live preview before Play so the editor has explicit permission to compile and run it."));
        announce("Play mode needs live source permission for this project.");
        renderMode();
        return;
      }
      const is3D = has3DProject(history.project);
      if (is3D) {
        try { await hydrateAssetPreviews(history.project, bridge.previewAsset); }
        catch (cause) {
          if (request !== modeRequest) return;
          mode = "edit";
          bridge.pause();
          showError(new Error(`3D Play could not restore imported assets from the local cache: ${cause instanceof Error ? cause.message : String(cause)}`));
          announce("3D Play needs its imported assets restored before it can start.");
          renderMode();
          return;
        }
        if (request !== modeRequest) return;
      }
      showWorkspace(is3D ? "scene3d" : "stage");
      const blocker = await bridge.play(history.project, { sourcePermission });
      if (request !== modeRequest) return;
      if (blocker) {
        mode = "edit";
        showError(new Error(blocker));
        announce("Play mode could not start. Resolve the reported runtime blockers.");
      } else {
        mode = "play";
        announce("Play mode. The active scene is running.");
      }
      if (mode === "play") closeCenter();
    } else if (next === "profile") {
      mode = next;
      bridge.pause();
      showWorkspace("diagnostics");
      openCenter("profile");
    } else if (next === "build") {
      if (!await flushSourceSurface()) return;
      mode = next;
      bridge.pause();
      openCenter("build");
    } else {
      mode = next;
      bridge.pause();
      closeCenter();
      announce("Edit mode.");
    }
    void session.dispatch({ type: "mode.set", mode });
    renderMode();
  }

  function render() {
    const project = history.project;
    shellView.update({ projectBrowser: { projectName: project.name, dirty: history.dirty, canUndo: history.canUndo, canRedo: history.canRedo } });
    renderProjectTree();
    renderAssets();
    renderInspector();
    renderScriptWorkspace();
    render3DWorkspace();
    try { renderMode(); } catch (cause) { throw new Error(`Render editor mode failed: ${cause instanceof Error ? cause.message : String(cause)}`, { cause }); }
    try { shellView.update({
      mode,
      centerTab: selectedCenterTab,
      sidebarCollapsed: viewportFullscreen || uiPreferences.app.workbench.sidebarCollapsed,
      sidebarSize: uiPreferences.app.workbench.sidebarSize,
      inspectorCollapsed: viewportFullscreen || uiPreferences.app.workbench.inspectorCollapsed,
      inspectorSize: uiPreferences.app.workbench.inspectorSize,
      narrowPane: uiPreferences.app.narrowPane,
    }); } catch (cause) { throw new Error(`Render editor shell state failed: ${cause instanceof Error ? cause.message : String(cause)}`, { cause }); }
    if (!center.hidden) {
      try { renderCenter(); } catch (cause) { throw new Error(`Render editor center failed: ${cause instanceof Error ? cause.message : String(cause)}`, { cause }); }
    }
  }

  function renderProjectTree() {
    const project = history.project;
    const scene = activeScene(project);
    const selectedId = bridge.selectedEntityId();
    const entityDepths = editorEntityTreeDepths(scene.entities);
    shellView.update({ projectBrowser: {
      scenes: project.scenes.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        entityCount: candidate.entities.length,
        active: candidate.id === project.activeSceneId,
        menu: [
          { label: "Rename", action: "rename-scene", data: { sceneId: candidate.id } },
          { label: "Duplicate", action: "duplicate-scene", data: { sceneId: candidate.id } },
          { label: "Set active", action: "activate-scene", data: { sceneId: candidate.id }, disabled: candidate.id === project.activeSceneId },
          { label: "Delete", action: "delete-scene", data: { sceneId: candidate.id }, danger: true, disabled: project.scenes.length === 1 },
        ],
      })),
      entities: scene.entities.map((entity, index) => ({
        id: entity.id,
        label: entity.label,
        kind: entity.kind,
        layer: entity.layer,
        depth: entityDepths[index] ?? 0,
        parentId: entity.parentId,
        selected: entity.id === selectedId,
        menu: [
          { label: "Rename", action: "rename-entity", data: { entityId: entity.id } },
          { label: "Duplicate", action: "duplicate-entity", data: { entityId: entity.id } },
          { label: "Add child", action: "create-child-entity", data: { entityId: entity.id } },
          ...(entity.parentId ? [{ label: "Remove parent", action: "unparent-entity", data: { entityId: entity.id } }] : []),
          { label: "Delete", action: "delete-entity-by-id", data: { entityId: entity.id }, danger: true },
        ],
      })),
    } });
  }

  function renderAssets() {
    if (!history.project.assets.some((asset) => asset.id === selectedAssetId)) selectedAssetId = "";
    shellView.update({ projectBrowser: { assets: history.project.assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      detail: `${asset.kind} · ${formatBytes(asset.size)}`,
      icon: asset.kind === "image" ? "▧" : asset.kind === "audio" ? "♪" : asset.mimeType.includes("gltf") ? "◇" : "{}",
      title: assetAffordance(asset),
      selected: asset.id === selectedAssetId,
      draggable: asset.kind === "image",
      menu: [
        assetPrimaryMenuItem(asset),
        { label: "Rename", action: "rename-asset", data: { assetId: asset.id } },
        { label: "Replace / reimport…", action: "replace-asset", data: { assetId: asset.id }, disabled: asset.source !== "imported" },
        { label: "Duplicate", action: "duplicate-asset", data: { assetId: asset.id }, disabled: asset.source !== "imported" },
        { label: "Find usages", action: "find-asset-usages", data: { assetId: asset.id } },
        { label: "Delete", action: "delete-asset", data: { assetId: asset.id }, danger: true, disabled: asset.source !== "imported" },
      ],
    })) } });
  }

  function renderInspector() {
    const selectedId = bridge.selectedEntityId();
    const entity = activeScene(history.project).entities.find((candidate) => candidate.id === selectedId);
    const asset = history.project.assets.find((candidate) => candidate.id === selectedAssetId);
    shellView.update({
      selectionInspector: {
        project: history.project,
        selection: asset
          ? {
              kind: "asset",
              asset,
              audition: audioAuditionStatus.assetId === asset.id ? audioAuditionStatus : undefined,
            }
          : entity
            ? { kind: "entity", entity }
            : { kind: "none" },
      },
    });
  }
  function renderScriptWorkspace() {
    const scripts = readProjectScripts(history.project);
    if (!activeScriptPath || !scripts.files.some((file) => file.path === activeScriptPath)) activeScriptPath = scripts.activePath || scripts.files[0]?.path || "";
    const file = scripts.files.find((candidate) => candidate.path === activeScriptPath);
    const selectedEntityId = bridge.selectedEntityId();
    shellView.update({ scriptBrowser: {
      activePath: activeScriptPath,
      selectedEntityId: selectedEntityId ?? undefined,
      files: scripts.files.map((candidate) => ({
        path: candidate.path,
        active: candidate.path === activeScriptPath,
        menu: [
          { label: "Attach to selected", action: "attach-script", data: { path: candidate.path }, disabled: !selectedEntityId },
          { label: "Rename", action: "rename-script", data: { path: candidate.path } },
          { label: "Find references", action: "find-script-references", data: { path: candidate.path } },
          { label: "Delete", action: "delete-script", data: { path: candidate.path }, danger: true },
        ],
      })),
    } });
    if (!sourceSurface.load(file ? { path: file.path, source: file.source } : undefined)) { activeScriptPath = sourceSurface.path(); return; }
    setText("#script-editor-path", file?.path ?? "No script selected");
    const permissionButton = required<HTMLButtonElement>("[data-editor-action='toggle-live-source']");
    permissionButton.setAttribute("aria-pressed", String(sourcePermission));
    permissionButton.textContent = sourcePermission ? "Disable live preview" : "Enable live preview";
    const permissionStatus = required<HTMLElement>("#script-live-status");
    if (!sourcePermission) {
      permissionStatus.textContent = "OFF · SOURCE STAYS IN THIS TAB";
      permissionStatus.classList.remove("is-error", "is-ready", "is-compiling");
      permissionStatus.title = "The editor will not send or execute project source until you enable live preview for this tab.";
    }
  }

  function render3DWorkspace() {
    const declaration = readEditor3DDeclaration(history.project);
    required<HTMLElement>("#scene3d-empty").hidden = Boolean(declaration);
    if (!declaration) {
      active3DEntityId = "";
      active3DMaterialId = "";
      active3DLightId = "";
      active3DResourceKind = "object";
      shellView.update({ scene3dPanels: {
        declaration: undefined,
        activeKind: active3DResourceKind,
        activeEntityId: active3DEntityId,
        activeMaterialId: active3DMaterialId,
        activeLightId: active3DLightId,
      } });
      return;
    }

    const scene = declaration.scenes.find((candidate) => candidate.id === declaration.activeSceneId) ?? declaration.scenes[0];
    if (!active3DEntityId || !scene.entities.some((entity) => entity.id === active3DEntityId)) active3DEntityId = scene.entities[0]?.id ?? "";
    if (!active3DMaterialId || !declaration.materials.some((material) => material.id === active3DMaterialId)) active3DMaterialId = declaration.materials[0]?.id ?? "";
    if (!active3DLightId || !scene.lights.some((light) => light.id === active3DLightId)) active3DLightId = scene.lights[0]?.id ?? "";
    if (active3DResourceKind === "material" && !active3DMaterialId) active3DResourceKind = active3DEntityId ? "object" : "light";
    if (active3DResourceKind === "light" && !active3DLightId) active3DResourceKind = active3DEntityId ? "object" : "material";

    shellView.update({ scene3dPanels: {
      declaration,
      activeKind: active3DResourceKind,
      activeEntityId: active3DEntityId,
      activeMaterialId: active3DMaterialId,
      activeLightId: active3DLightId,
    } });
  }
  function renderMode() {
    document.documentElement.dataset.editorMode = mode;
    shellView.update({ mode });
  }

  function renderCenter() {
    let centerContent: EditorCenterContentState;
    if (selectedCenterTab === "project") {
      centerContent = { kind: "project", project: history.project, hasRecovery: Boolean(localStorage.getItem(RECOVERY_KEY)) };
    } else if (selectedCenterTab === "learn") {
      centerContent = { kind: "learn", project: history.project };
    } else if (selectedCenterTab === "settings") {
      centerContent = {
        kind: "settings",
        project: history.project,
        uiPreferences,
        onSave(projectPreferences, nextUiPreferences) {
          uiPreferences = writeEditorUiPreferences(nextUiPreferences);
          applyEditorUiPreferences(uiPreferences);
          shellView.update({
            sidebarCollapsed: viewportFullscreen || uiPreferences.app.workbench.sidebarCollapsed,
            sidebarSize: uiPreferences.app.workbench.sidebarSize,
            inspectorCollapsed: viewportFullscreen || uiPreferences.app.workbench.inspectorCollapsed,
            inspectorSize: uiPreferences.app.workbench.inspectorSize,
            narrowPane: uiPreferences.app.narrowPane,
          });
          disposeWorkspaceLayouts();
          disposeWorkspaceLayouts = mountWorkspaceLayouts();
          transactSections("Update project settings", ["settings"], (project) => {
            project.name = projectPreferences.name;
            project.settings.targetProfile = projectPreferences.targetProfile;
            project.settings.locale = projectPreferences.locale;
            project.settings.reducedMotion = projectPreferences.reducedMotion;
            project.settings.masterVolume = projectPreferences.masterVolume;
            project.settings.input = projectPreferences.input;
          });
          announce("Settings saved to their user, app, and project scopes.");
        },
      };
    } else if (selectedCenterTab === "build") {
      requestBuildSourcePreflight(history.project);
      centerContent = {
        kind: "build",
        project: history.project,
        sourcePreflight: buildSourcePreflight,
        validation: validateForBuild(history.project),
      };
    } else if (selectedCenterTab === "profile") {
      centerContent = { kind: "profile", profile: bridge.captureProfile() };
    } else {
      centerContent = { kind: "history", changes: history.changes };
    }
    shellView.update({ centerTab: selectedCenterTab, centerContent });
  }
  function openCenter(tab: EditorCenterTab = "project") {
    selectedCenterTab = tab;
    renderCenter();
    shellView.update({ centerOpen: true });
    void session.dispatch({ type: "overlay.set", overlay: { kind: "project-center", tab } });
    releaseFocusTrap?.();
    releaseFocusTrap = trapFocus(center, () => closeCenter());
    required<HTMLElement>("[role='tab'][aria-selected='true']", center).focus();
  }

  function requestBuildSourcePreflight(project: EditorProject) {
    const revision = `${project.id}:${project.updatedAt}`;
    if (buildSourcePreflight.revision === revision) return;
    buildSourcePreflight = { revision, status: "pending", detail: "Compiling project-owned behavior source…" };
    void compileStandaloneProjectSource(project).then(() => {
      if (buildSourcePreflight.revision !== revision) return;
      buildSourcePreflight = { revision, status: "ready", detail: hasCustomProjectBehaviors(project) ? "Project-owned behavior source compiled successfully" : "No custom behavior source is required" };
      if (selectedCenterTab === "build") renderCenter();
    }).catch((cause) => {
      if (buildSourcePreflight.revision !== revision) return;
      buildSourcePreflight = { revision, status: "error", detail: cause instanceof Error ? cause.message : String(cause) };
      if (selectedCenterTab === "build") renderCenter();
    });
  }

  function closeCenter() {
    shellView.update({ centerOpen: false });
    void session.dispatch({ type: "overlay.close" });
    localStorage.setItem(FIRST_RUN_KEY, "1");
    releaseFocusTrap?.();
    releaseFocusTrap = undefined;
    required<HTMLElement>("[data-editor-mode].is-active").focus();
  }

  function setConsoleOpen(open: boolean) {
    shellView.update({ consoleOpen: open });
    void session.dispatch({ type: "console.set-open", open });
  }

  function showWorkspace(workspace: EditorWorkspaceId) {
    bridge.showWorkspace(workspace);
    void session.dispatch({ type: "workspace.open", workspace });
  }

  function commitRuntime(label: string) {
    history.transact(label, (draft) => Object.assign(draft, bridge.captureProject(draft)));
  }

  function refreshSelection() {
    renderProjectTree();
    renderInspector();
  }
  function undo() { if (sourceSurface.dirty()) { announce("Save the current script before undoing project history."); return; } if (history.undo()) announce("Undid the last editor change."); }
  function redo() { if (sourceSurface.dirty()) { announce("Save the current script before redoing project history."); return; } if (history.redo()) announce("Redid the last editor change."); }

  async function createProjectFromForm() {
    if (!await flushSourceSurface()) return;
    const name = required<HTMLInputElement>("#new-project-name", center).value.trim() || "Untitled Game";
    const handoff = await history.execute({ requestId: uniqueId("ui"), intent: `Create showcase project ${name}`, commands: [{ type: "project.create-starter", starter: "showcase", name }] });
    if (!handoff.ok) return showError(new Error(handoff.error ?? "Project creation failed."));
    history.markSaved();
    closeCenter();
    announce(`Created project ${name}.`);
  }

  async function createProjectFromTemplate(template?: EditorStarterId) {
    if (!template) return;
    if (!await flushSourceSurface()) return;
    const input = center.querySelector<HTMLInputElement>("#new-project-name");
    const defaults: Record<EditorStarterId, string> = { pong: "Neon Pong", platformer: "Glassline Ascent", "blank-2d": "Untitled 2D Game", "3d-action": "Starter 3D World", showcase: "Dungeon Run" };
    try {
      const name = input?.value.trim() || defaults[template];
      const handoff = await history.execute({ requestId: uniqueId("ui"), intent: `Create ${template} starter ${name}`, commands: [{ type: "project.create-starter", starter: template, name }] });
      if (!handoff.ok) throw new Error(handoff.error ?? "Starter creation failed.");
      history.markSaved();
      active3DEntityId = template === "3d-action" ? "actor" : "";
      active3DResourceKind = "object";
      activeScriptPath = readProjectScripts(history.project).activePath;
      closeCenter();
      showWorkspace(template === "3d-action" ? "scene3d" : "stage");
      if (template === "pong") selectEntity("player-paddle");
      announce(`Created ${history.project.name}. Press Play whenever you are ready.`);
    } catch (error) {
      showError(error);
    }
  }

  function createScene() {
    transactSections("Create scene", ["scenes", "activeSceneId"], (project) => {
      const id = uniqueId("scene");
      project.scenes.push({ id, name: `Scene ${project.scenes.length + 1}`, entities: [] });
      project.activeSceneId = id;
    });
  }

  function renameScene(sceneId?: string) {
    const scene = history.project.scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) return;
    const name = requestText("Scene name", scene.name);
    if (!name || name === scene.name) return;
    transactSections("Rename scene", ["scenes"], (project) => {
      const target = project.scenes.find((candidate) => candidate.id === scene.id);
      if (target) target.name = name;
    });
  }

  function duplicateScene(sceneId?: string) {
    const source = history.project.scenes.find((candidate) => candidate.id === sceneId);
    if (!source) return;
    transactSections("Duplicate scene", ["scenes", "activeSceneId"], (project) => {
      const original = project.scenes.find((candidate) => candidate.id === source.id);
      if (!original) return;
      const copy = structuredClone(original);
      copy.id = uniqueId("scene");
      copy.name = `${original.name} Copy`;
      const entityIds = new Map(copy.entities.map((entity) => [entity.id, uniqueId("entity")]));
      for (const entity of copy.entities) {
        entity.id = entityIds.get(entity.id)!;
        if (entity.parentId) entity.parentId = entityIds.get(entity.parentId);
        for (const component of entity.components) component.id = uniqueId(component.type);
      }
      project.scenes.push(copy);
      project.activeSceneId = copy.id;
    });
  }

  function activateScene(sceneId?: string) {
    if (!sceneId || sceneId === history.project.activeSceneId) return;
    transactSections("Switch active scene", ["activeSceneId"], (project) => {
      if (project.scenes.some((scene) => scene.id === sceneId)) project.activeSceneId = sceneId;
    });
  }

  function deleteScene(sceneId?: string) {
    if (!sceneId || history.project.scenes.length <= 1) return;
    transactSections("Delete scene", ["scenes", "activeSceneId"], (project) => {
      project.scenes = project.scenes.filter((scene) => scene.id !== sceneId);
      if (project.activeSceneId === sceneId) project.activeSceneId = project.scenes[0].id;
    });
  }

  function selectedEntity(project: EditorProject) {
    const id = bridge.selectedEntityId();
    return id ? activeScene(project).entities.find((entity) => entity.id === id) : undefined;
  }

  function createEntity() {
    const id = uniqueId("entity");
    transactSections("Create entity", ["scenes"], (project) => {
      activeScene(project).entities.push({
        id,
        label: `Entity ${activeScene(project).entities.length + 1}`,
        x: 380,
        y: 240,
        width: 36,
        height: 36,
        scale: 1,
        layer: 1,
        color: "#41d7d0",
        accent: "#b9fff5",
        kind: "prop",
        components: [
          { id: `${id}-transform`, type: "transform", enabled: true, values: { x: 380, y: 240, scale: 1 } },
          { id: `${id}-sprite`, type: "sprite", enabled: true, values: { asset: "generated", tint: "#41d7d0" } },
        ],
      });
    });
    selectEntity(id);
    showWorkspace("stage");
  }

  function renameEntity(entityId?: string) {
    const entity = activeScene(history.project).entities.find((candidate) => candidate.id === entityId);
    if (!entity) return;
    const label = requestText("Entity name", entity.label);
    if (!label || label === entity.label) return;
    transactSections("Rename entity", ["scenes"], (project) => {
      const target = activeScene(project).entities.find((candidate) => candidate.id === entity.id);
      if (target) target.label = label;
    });
  }

  function duplicateEntity(entityId?: string) {
    const source = activeScene(history.project).entities.find((candidate) => candidate.id === entityId);
    if (!source) return;
    const id = uniqueId("entity");
    transactSections("Duplicate entity", ["scenes"], (project) => {
      const original = activeScene(project).entities.find((candidate) => candidate.id === source.id);
      if (!original) return;
      const copy = structuredClone(original);
      copy.id = id;
      copy.label = `${original.label} Copy`;
      copy.x += 24;
      copy.y += 24;
      for (const component of copy.components) {
        component.id = uniqueId(component.type);
        if (component.type === "transform") { component.values.x = copy.x; component.values.y = copy.y; }
      }
      activeScene(project).entities.push(copy);
    });
    selectEntity(id);
  }

  function createChildEntity(parentId?: string) {
    const parent = activeScene(history.project).entities.find((candidate) => candidate.id === parentId);
    if (!parent) return;
    const id = uniqueId("entity");
    transactSections("Create child entity", ["scenes"], (project) => {
      const source = activeScene(project).entities.find((candidate) => candidate.id === parent.id);
      if (!source) return;
      activeScene(project).entities.push({
        id, parentId: source.id, label: `${source.label} Child`, x: source.x + 24, y: source.y + 24, width: 36, height: 36, scale: 1, layer: source.layer + 1,
        color: "#41d7d0", accent: "#b9fff5", kind: "prop",
        components: [
          { id: `${id}-transform`, type: "transform", enabled: true, values: { x: source.x + 24, y: source.y + 24, scale: 1 } },
          { id: `${id}-sprite`, type: "sprite", enabled: true, values: { asset: "generated", tint: "#41d7d0" } },
        ],
      });
    });
    selectEntity(id);
  }

  function unparentEntity(entityId?: string) {
    if (!entityId) return;
    transactSections("Remove entity parent", ["scenes"], (project) => {
      const entity = activeScene(project).entities.find((candidate) => candidate.id === entityId);
      if (entity) delete entity.parentId;
    });
  }

  function deleteEntity(entityId?: string) {
    if (!entityId) return;
    transactSections("Delete entity", ["scenes"], (project) => {
      const scene = activeScene(project);
      scene.entities = scene.entities.filter((entity) => entity.id !== entityId);
      for (const entity of scene.entities) if (entity.parentId === entityId) delete entity.parentId;
    });
  }

  function deleteSelectedEntity() {
    const id = bridge.selectedEntityId();
    deleteEntity(id ?? undefined);
  }

  function addComponent(type?: EditorComponent["type"], behaviorModule?: string) {
    const id = bridge.selectedEntityId();
    if (!id || !type) return;
    transactSections(`Add ${type} component`, type === "behavior" ? ["scenes", "extensions"] : ["scenes"], (project) => {
      const entity = activeScene(project).entities.find((candidate) => candidate.id === id);
      const singleton = type === "transform" || type === "sprite" || type === "input" || type === "camera" || type === "ui";
      if (!entity || singleton && entity.components.some((candidate) => candidate.type === type)) return;
      const definition = type === "behavior" && behaviorModule ? BUILTIN_PLAYABLE_BEHAVIOR_DEFINITIONS_2D.find((candidate) => candidate.module === behaviorModule) : undefined;
      let defaults = definition ? createPlayableBehaviorComponentValues2D(definition) : defaultComponentValues(type);
      if (type === "behavior" && !definition) {
        if (!readProjectScripts(project).files.some((file) => file.path === "src/behavior.ts")) createEditorScript(project, "src/behavior.ts");
        const projectDefinition = readEditorBehaviorDefinitions(project).find((candidate) => candidate.module === "./src/behavior.ts" && candidate.exportName === "update");
        if (projectDefinition) defaults = createPlayableBehaviorComponentValues2D(projectDefinition);
      }
      entity.components.push({ id: uniqueId(type), type, enabled: true, values: defaults });
    });
  }

  function addSelectedComponent(target: HTMLElement) {
    const select = target.closest<HTMLElement>(".component-add-form")?.querySelector<HTMLButtonElement>("[data-add-component-type]");
    const value = select?.dataset.selectValue;
    if (value?.startsWith("behavior:")) addComponent("behavior", value.slice("behavior:".length));
    else addComponent(optionalOneOf(value, EDITOR_COMPONENT_TYPES));
  }

  function toggleComponent(componentId?: string) {
    if (!componentId) return;
    transactSections("Toggle component", ["scenes"], (project) => {
      const component = selectedEntity(project)?.components.find((candidate) => candidate.id === componentId);
      if (component) component.enabled = !component.enabled;
    });
  }

  function duplicateComponent(componentId?: string) {
    if (!componentId) return;
    transactSections("Duplicate component", ["scenes"], (project) => {
      const entity = selectedEntity(project);
      const component = entity?.components.find((candidate) => candidate.id === componentId);
      if (!entity || !component || component.type === "transform" || component.type === "sprite" || component.type === "camera") return;
      entity.components.push({ ...structuredClone(component), id: uniqueId(component.type) });
    });
  }

  function resetComponent(componentId?: string) {
    if (!componentId) return;
    transactSections("Reset component values", ["scenes"], (project) => {
      const entity = selectedEntity(project);
      const component = entity?.components.find((candidate) => candidate.id === componentId);
      if (!component || !entity) return;
      const definition = component.type === "behavior" ? resolveProjectBehaviorDefinition(component, project) : undefined;
      component.values = definition ? createPlayableBehaviorComponentValues2D(definition) : defaultComponentValues(component.type);
      if (component.type === "transform") {
        entity.x = Number(component.values.x ?? 0);
        entity.y = Number(component.values.y ?? 0);
        entity.scale = Number(component.values.scale ?? 1);
        entity.rotation = Number(component.values.rotation ?? 0);
        entity.opacity = Math.min(1, Math.max(0, Number(component.values.opacity ?? 1)));
      }
    });
  }

  function removeComponent(componentId?: string) {
    if (!componentId) return;
    transactSections("Remove component", ["scenes"], (project) => {
      const entity = selectedEntity(project);
      if (entity) entity.components = entity.components.filter((candidate) => candidate.id !== componentId);
    });
  }

  async function createBehaviorExtension(componentId?: string) {
    if (!componentId) return;
    if (!await flushSourceSurface()) return;
    const component = selectedEntity(history.project)?.components.find((candidate) => candidate.id === componentId && candidate.type === "behavior");
    const definition = component && resolveProjectBehaviorDefinition(component, history.project);
    if (!component || !definition?.builtIn) return;
    try {
      let path = "";
      transactSections(`Create additive ${definition.label} extension`, ["scenes", "extensions"], (project) => {
        const entity = selectedEntity(project);
        const draftComponent = entity?.components.find((candidate) => candidate.id === componentId && candidate.type === "behavior");
        if (!entity || !draftComponent) throw new Error("The behavior being extended no longer exists.");
        const scripts = readProjectScripts(project);
        const base = `src/${slug(definition.id)}-override`;
        let suffix = 0;
        path = `${base}.ts`;
        while (scripts.files.some((file) => file.path === path)) path = `${base}-${++suffix}.ts`;
        const extensionDefinition = { ...definition, id: `${definition.id}-extension`, label: `${definition.label} extension`, description: `Project-owned additive behavior that runs beside ${definition.label}. It starts as a no-op.`, module: `./${path}`, exportName: "update", builtIn: false };
        createEditorScript(project, path, additiveBehaviorExtensionSource(extensionDefinition));
        storeProjectBehaviorDefinition(project, extensionDefinition);
        entity.components.push({ ...structuredClone(draftComponent), id: uniqueId("behavior"), values: { ...draftComponent.values, module: `./${path}`, export: "update" } });
      });
      activeScriptPath = path;
      showWorkspace("script");
      renderScriptWorkspace();
      announce(`Created ${path} as a no-op additive behavior. The built-in stays attached and unchanged; edit the new component when you want extra logic.`);
    } catch (error) { showError(error); }
  }

  function addBehaviorVariable(target: HTMLElement) {
    const form = target.closest<HTMLElement>(".behavior-public-property-form");
    const name = form?.querySelector<HTMLInputElement>("[data-behavior-variable-name]")?.value.trim();
    const type = form?.querySelector<HTMLButtonElement>("[data-behavior-variable-type]")?.dataset.selectValue;
    const componentId = target.dataset.componentId;
    if (!componentId || !name || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name) || name === "module" || name === "export") {
      showError(new Error("Public property names must start with a letter or underscore and contain only letters, numbers, or underscores."));
      return;
    }
    transactSections(`Add public property ${name}`, ["scenes"], (project) => {
      const component = selectedEntity(project)?.components.find((candidate) => candidate.id === componentId && candidate.type === "behavior");
      if (!component || Object.hasOwn(component.values, name)) return;
      component.values[name] = type === "boolean" ? false : type === "text" ? "" : 0;
    });
  }

  function removeBehaviorVariable(componentId?: string, key?: string) {
    if (!componentId || !key || key === "module" || key === "export") return;
    transactSections(`Remove public property ${key}`, ["scenes"], (project) => {
      const component = selectedEntity(project)?.components.find((candidate) => candidate.id === componentId && candidate.type === "behavior");
      if (component) delete component.values[key];
    });
  }

  function editEntityProperty(property: string, rawValue: string) {
    transactSections(`Edit entity ${property}`, ["scenes"], (project) => {
      const entity = selectedEntity(project);
      if (!entity) return;
      if (property === "label") entity.label = rawValue.trim() || entity.label;
      else if (["x", "y", "width", "height", "scale", "rotation", "opacity"].includes(property)) {
        const value = Number(rawValue);
        if (!Number.isFinite(value)) return;
        if (property === "x" || property === "y") entity[property] = value;
        if (property === "width" || property === "height") entity[property] = Math.max(1, value);
        if (property === "scale") entity.scale = Math.max(0.000_001, value);
        if (property === "rotation") entity.rotation = value;
        if (property === "opacity") entity.opacity = Math.min(1, Math.max(0, value));
        const transform = entity.components.find((component) => component.type === "transform");
        if (transform && (property === "x" || property === "y" || property === "scale" || property === "rotation" || property === "opacity")) {
          transform.values[property] = property === "x" ? entity.x : property === "y" ? entity.y : property === "scale" ? entity.scale : property === "rotation" ? entity.rotation ?? 0 : entity.opacity ?? 1;
        }
      }
    });
  }

  function editComponentValue(input: HTMLInputElement | HTMLSelectElement | HTMLButtonElement) {
    const componentId = input.dataset.componentId;
    const key = input.dataset.componentKey;
    if (!componentId || !key) return;
    transactSections(`Edit ${key}`, ["scenes"], (project) => {
      const entity = selectedEntity(project);
      const component = entity?.components.find((candidate) => candidate.id === componentId);
      if (!component || !entity) return;
      const previous = component.values[key];
      const valueKind = input.dataset.valueKind;
      const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : valueKind === "number" || typeof previous === "number" ? Number(input.value) : input instanceof HTMLButtonElement ? input.dataset.selectValue ?? "" : input.value;
      if (typeof value === "number" && !Number.isFinite(value)) return;
      component.values[key] = value;
      if (component.type === "transform" && typeof value === "number") {
        if (key === "x") entity.x = value;
        if (key === "y") entity.y = value;
        if (key === "scale") entity.scale = Math.max(0.000_001, value);
        if (key === "rotation") entity.rotation = value;
        if (key === "opacity") entity.opacity = Math.min(1, Math.max(0, value));
        if (key === "scale") component.values.scale = entity.scale;
        if (key === "opacity") component.values.opacity = entity.opacity ?? 1;
      }
    });
  }

  function createEntityFromAsset(assetId: string, point: { x: number; y: number }) {
    const asset = history.project.assets.find((candidate) => candidate.id === assetId);
    if (!asset) return;
    const id = uniqueId("entity");
    transactSections(`Create entity from ${asset.name}`, ["scenes"], (project) => {
      activeScene(project).entities.push({
        id,
        label: asset.name.replace(/\.[^.]+$/, "") || "Imported asset",
        x: Math.round(point.x), y: Math.round(point.y), width: 64, height: 64, scale: 1, layer: 1,
        color: "#41d7d0", accent: "#b9fff5", kind: "prop",
        components: [
          { id: `${id}-transform`, type: "transform", enabled: true, values: { x: Math.round(point.x), y: Math.round(point.y), scale: 1 } },
          { id: `${id}-sprite`, type: "sprite", enabled: true, values: { asset: assetId, tint: "#ffffff" } },
        ],
      });
    });
    selectEntity(id);
    showWorkspace("stage");
    announce(`Created an entity from ${asset.name}.`);
  }

  function selectAsset(assetId?: string) {
    if (!assetId) return;
    if (audioAuditionStatus.assetId && audioAuditionStatus.assetId !== assetId) stopAudioAudition(false);
    selectedAssetId = assetId;
    void session.dispatch({ type: "selection.set", selection: { kind: "asset", assetId } });
    renderAssets();
    renderInspector();
    const asset = history.project.assets.find((candidate) => candidate.id === assetId);
    if (asset) announce(`${asset.name} selected. Drag it to Stage or open its actions menu.`);
  }

  function selectEntity(entityId: string) {
    bridge.selectEntity(entityId);
    void session.dispatch({ type: "selection.set", selection: { kind: "entity", sceneId: history.project.activeSceneId, primaryEntityId: entityId, entityIds: [entityId] } });
  }

  async function auditionAudioAsset(assetId?: string) {
    const asset = history.project.assets.find((candidate) => candidate.id === assetId && candidate.kind === "audio" && candidate.source === "imported");
    if (!asset) return;
    stopAudioAudition(false);
    const request = ++audioAuditionRequest;
    setAudioAuditionStatus(asset.id, "Loading local audio data…", "loading");
    try {
      const blob = (await readAssetBlobs([asset.id])).get(asset.id);
      if (!blob) throw new Error(`Stored data for ${asset.name} is unavailable.`);
      if (request !== audioAuditionRequest) return;
      const objectUrl = URL.createObjectURL(blob);
      const element = document.createElement("audio");
      element.preload = "auto";
      element.src = objectUrl;
      const audition: AudioAudition = { assetId: asset.id, element, objectUrl };
      audioAudition = audition;
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const decoded = () => { if (!settled) { settled = true; cleanup(); resolve(); } };
        const failed = () => { if (!settled) { settled = true; cleanup(); reject(new Error(`${asset.name} could not be decoded as audio.`)); } };
        const cancel = () => { if (!settled) { settled = true; cleanup(); reject(new DOMException("Audio preview cancelled.", "AbortError")); } };
        const cleanup = () => {
          element.removeEventListener("canplay", decoded);
          element.removeEventListener("error", failed);
          if (audioAudition?.element === element) audioAudition.cancelLoad = undefined;
        };
        audition.cancelLoad = cancel;
        element.addEventListener("canplay", decoded, { once: true });
        element.addEventListener("error", failed, { once: true });
        element.load();
      });
      if (request !== audioAuditionRequest || audioAudition?.element !== element) return;
      element.addEventListener("ended", () => {
        if (audioAudition?.element !== element) return;
        releaseAudioAudition();
        setAudioAuditionStatus(asset.id, "Decoded · playback complete", "complete");
      }, { once: true });
      await element.play();
      setAudioAuditionStatus(asset.id, "Decoded · playing", "playing");
    } catch (error) {
      if (request !== audioAuditionRequest) return;
      stopAudioAudition(false);
      setAudioAuditionStatus(asset.id, error instanceof Error ? error.message : String(error), "error");
    }
  }

  function stopAudioAudition(announceStatus = true) {
    audioAuditionRequest += 1;
    const assetId = audioAudition?.assetId ?? audioAuditionStatus.assetId;
    releaseAudioAudition();
    if (announceStatus) setAudioAuditionStatus(assetId, "Stopped · ready to decode", "idle");
    else audioAuditionStatus = { assetId: "", phase: "idle", message: "Ready to decode" };
  }

  function releaseAudioAudition() {
    if (audioAudition) {
      audioAudition.cancelLoad?.();
      audioAudition.element.pause();
      audioAudition.element.removeAttribute("src");
      audioAudition.element.load();
      URL.revokeObjectURL(audioAudition.objectUrl);
      audioAudition = undefined;
    }
  }

  function setAudioAuditionStatus(assetId: string, message: string, phase: "idle" | "loading" | "playing" | "complete" | "error") {
    audioAuditionStatus = { assetId, message, phase };
    const output = document.querySelector<HTMLOutputElement>("#asset-audio-audition-status");
    if (!output || output.dataset.audioStatusAsset !== assetId) return;
    output.textContent = message;
    output.classList.toggle("is-error", phase === "error");
    const controls = output.closest(".asset-audition");
    const play = controls?.querySelector<HTMLButtonElement>("[data-editor-action='audition-audio-asset']");
    const stop = controls?.querySelector<HTMLButtonElement>("[data-editor-action='stop-audio-audition']");
    const active = phase === "loading" || phase === "playing";
    if (play) play.disabled = active;
    if (stop) stop.disabled = !active;
  }

  function createEntityFromAssetId(assetId?: string) {
    if (!assetId) return;
    createEntityFromAsset(assetId, { x: 380, y: 240 });
  }

  function renameAsset(assetId?: string) {
    const asset = history.project.assets.find((candidate) => candidate.id === assetId);
    if (!asset) return;
    const name = requestText("Asset name", asset.name);
    if (!name || name === asset.name) return;
    try { transactSections("Rename asset", ["assets"], (project) => renameEditorAsset(project, asset.id, name)); }
    catch (error) { showError(error); }
  }

  function chooseAssetReplacement(assetId?: string) {
    const asset = history.project.assets.find((candidate) => candidate.id === assetId && candidate.source === "imported");
    if (!asset) return;
    pendingReplacementAssetId = asset.id;
    replacementAssetInput.value = "";
    replacementAssetInput.click();
  }

  async function replaceAssetBinary(assetId: string, file?: File) {
    if (!assetId || !file) { pendingReplacementAssetId = ""; return; }
    if (audioAuditionStatus.assetId === assetId) stopAudioAudition(false);
    let oldBlob: Blob | undefined;
    let replacedMainRecord = false;
    try {
      const asset = history.project.assets.find((candidate) => candidate.id === assetId && candidate.source === "imported");
      if (!asset) throw new Error("The asset being replaced no longer exists.");
      if (file.size > MAX_ASSET_FILE_BYTES) throw new Error(`${file.name} exceeds the ${formatBytes(MAX_ASSET_FILE_BYTES)} per-file limit.`);
      const nextCatalogSize = history.project.assets.reduce((total, candidate) => total + candidate.size, 0) - asset.size + file.size;
      if (nextCatalogSize > MAX_ASSET_CATALOG_BYTES) throw new Error(`The local asset catalog may not exceed ${formatBytes(MAX_ASSET_CATALOG_BYTES)}.`);
      const kind = assetKind(file);
      if (asset.kind !== "unknown" && kind !== asset.kind) throw new Error(`Choose another ${asset.kind} asset. Replacing it with ${kind} data could break its existing references.`);

      oldBlob = (await readAssetBlobs([asset.id])).get(asset.id);
      if (!oldBlob) throw new Error(`Stored data for ${asset.name} is unavailable, so it cannot be safely replaced.`);
      if (oldBlob.size !== asset.size) throw new Error(`Stored data for ${asset.name} does not match its catalog size. Export or reimport the project before replacing it.`);
      const oldHash = await hashHyperfocusAsset(new Uint8Array(await oldBlob.arrayBuffer()));
      if (asset.sha256 && asset.sha256 !== oldHash) throw new Error(`Stored data for ${asset.name} failed its SHA-256 integrity check.`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sha256 = await hashHyperfocusAsset(bytes);
      const mimeType = assetMimeType(file);
      const replacementBlob = normalizedAssetBlob(file, mimeType);
      const oldFingerprint = assetMetadataFingerprint(asset);
      const newFingerprint = `sha256:${sha256}`;
      const oldRecoveryId = `${asset.id}:replacement-recovery:${oldHash}`;
      const newRecoveryId = `${asset.id}:replacement-recovery:${sha256}`;

      // Preserve both sides before switching the stable asset record. This
      // makes project undo/redo restore the matching local binary this session.
      await storeAssetRecords([{ id: oldRecoveryId, blob: oldBlob }, { id: newRecoveryId, blob: replacementBlob }]);
      await storeAssetBlob(asset.id, replacementBlob);
      replacedMainRecord = true;
      const recovery = assetBinaryRecovery.get(asset.id) ?? new Map<string, string>();
      recovery.set(oldFingerprint, oldRecoveryId);
      recovery.set(newFingerprint, newRecoveryId);
      assetBinaryRecovery.set(asset.id, recovery);
      activeAssetBinaryFingerprint.set(asset.id, newFingerprint);
      bridge.previewAsset(asset.id, replacementBlob);
      transactSections("Replace asset data", ["assets"], (project) => replaceEditorAssetMetadata(project, asset.id, {
        name: file.name,
        kind,
        mimeType,
        size: file.size,
        lastModified: file.lastModified,
        sha256,
      }));
      announce(`Replaced ${asset.name} without changing its id or references. SHA-256 ${sha256.slice(0, 12)}… verified; undo restores the previous local data during this editor session.`);
    } catch (error) {
      if (replacedMainRecord && oldBlob) {
        await storeAssetBlob(assetId, oldBlob).catch(() => undefined);
        bridge.previewAsset(assetId, oldBlob);
      }
      showError(error);
    } finally {
      pendingReplacementAssetId = "";
      replacementAssetInput.value = "";
    }
  }

  async function synchronizeRecoveredAssetBinaries() {
    const request = ++assetBinarySyncRequest;
    for (const asset of history.project.assets) {
      const recovery = assetBinaryRecovery.get(asset.id);
      if (!recovery) continue;
      const fingerprint = assetMetadataFingerprint(asset);
      if (activeAssetBinaryFingerprint.get(asset.id) === fingerprint) continue;
      const recoveryId = recovery.get(fingerprint);
      if (!recoveryId) continue;
      const blob = (await readAssetBlobs([recoveryId])).get(recoveryId);
      if (!blob || request !== assetBinarySyncRequest) return;
      await storeAssetBlob(asset.id, blob);
      if (request !== assetBinarySyncRequest) return;
      activeAssetBinaryFingerprint.set(asset.id, fingerprint);
      bridge.previewAsset(asset.id, blob);
    }
  }

  async function duplicateAsset(assetId?: string) {
    const asset = history.project.assets.find((candidate) => candidate.id === assetId && candidate.source === "imported");
    if (!asset) return;
    try {
      const blob = (await readAssetBlobs([asset.id])).get(asset.id);
      if (!blob) throw new Error(`Stored data for ${asset.name} is unavailable.`);
      const id = uniqueId("asset");
      await storeAssetBlob(id, blob);
      bridge.previewAsset(id, blob);
      transactSections("Duplicate asset", ["assets"], (project) => {
        const source = project.assets.find((candidate) => candidate.id === asset.id);
        if (!source) return;
        const copy = { ...source, id, name: copyName(source.name), lastModified: Date.now() };
        delete copy.objectUrl;
        project.assets.push(copy);
      });
      selectedAssetId = id;
    } catch (error) { showError(error); }
  }

  function showAssetUsages(assetId?: string) {
    if (!assetId) return;
    const asset = history.project.assets.find((candidate) => candidate.id === assetId);
    if (!asset) return;
    const usages = findEditorAssetUsages(history.project, assetId);
    setConsoleOpen(true);
    appendConsole(usages.length ? `${asset.name} is used in ${usages.length} place${usages.length === 1 ? "" : "s"}:` : `${asset.name} has no project references.`);
    for (const usage of usages) appendConsole(`  ${usage.kind} · ${usage.label} · ${usage.pointer}`);
    announce(usages.length ? `Found ${usages.length} usage${usages.length === 1 ? "" : "s"} for ${asset.name}.` : `${asset.name} is unused.`);
  }

  async function deleteAsset(assetId?: string) {
    const asset = history.project.assets.find((candidate) => candidate.id === assetId && candidate.source === "imported");
    if (!asset) return;
    if (audioAuditionStatus.assetId === asset.id) stopAudioAudition(false);
    const usages = findEditorAssetUsages(history.project, asset.id);
    const force = usages.length > 0 && globalThis.confirm?.(`${asset.name} is used in ${usages.length} place${usages.length === 1 ? "" : "s"}. Delete it and detach those references?`) === true;
    if (usages.length && !force) { showAssetUsages(asset.id); return; }
    try {
      transactSections("Delete asset", ["assets", "scenes", "tilemap", "atlas", "timeline", "extensions"], (project) => { removeEditorAssetMetadata(project, asset.id, { force }); });
      if (selectedAssetId === asset.id) selectedAssetId = "";
      announce(`Deleted ${asset.name}. Undo restores it; the local binary remains recoverable until project storage cleanup.`);
    } catch (error) { showError(error); }
  }

  function create3DObject() {
    try {
      let id = "";
      transactSections("Create 3D object", ["extensions"], (project) => { id = createEditor3DEntity(project); });
      active3DEntityId = id;
      active3DResourceKind = "object";
      showWorkspace("scene3d");
      render3DWorkspace();
    } catch (error) { showError(error); }
  }

  function duplicate3DObject(entityId?: string) {
    if (!entityId) return;
    try {
      let id = "";
      transactSections("Duplicate 3D object", ["extensions"], (project) => { id = duplicateEditor3DEntity(project, entityId); });
      active3DEntityId = id;
      active3DResourceKind = "object";
      render3DWorkspace();
    } catch (error) { showError(error); }
  }

  function delete3DObject(entityId?: string) {
    if (!entityId) return;
    try {
      transactSections("Delete 3D object", ["extensions"], (project) => removeEditor3DEntity(project, entityId));
      active3DEntityId = "";
      render3DWorkspace();
    } catch (error) { showError(error); }
  }

  function create3DMaterial() {
    try {
      let id = "";
      transactSections("Create 3D material", ["extensions"], (project) => { id = createEditor3DMaterial(project); });
      active3DMaterialId = id;
      active3DResourceKind = "material";
      render3DWorkspace();
      announce(`Created 3D material ${id}.`);
    } catch (error) { showError(error); }
  }

  function create3DLight() {
    try {
      let id = "";
      transactSections("Create 3D light", ["extensions"], (project) => { id = createEditor3DLight(project); });
      active3DLightId = id;
      active3DResourceKind = "light";
      render3DWorkspace();
      announce(`Created 3D light ${id}.`);
    } catch (error) { showError(error); }
  }

  function rename3DMaterial(materialId?: string) {
    const declaration = readEditor3DDeclaration(history.project);
    const material = declaration?.materials.find((candidate) => candidate.id === materialId);
    if (!declaration || !material) return;
    const id = request3DResourceId("Rename 3D material", material.id, declaration.materials.map((candidate) => candidate.id));
    if (!id || id === material.id) return;
    transactSections("Rename 3D material", ["extensions"], (project) => {
      const draft = readEditor3DDeclaration(project);
      const target = draft?.materials.find((candidate) => candidate.id === material.id);
      if (!draft || !target) return;
      target.id = id;
      for (const scene of draft.scenes) for (const entity of scene.entities) if (entity.materialId === material.id) entity.materialId = id;
    });
    active3DMaterialId = id;
    active3DResourceKind = "material";
    render3DWorkspace();
  }

  function duplicate3DMaterial(materialId?: string) {
    const declaration = readEditor3DDeclaration(history.project);
    const material = declaration?.materials.find((candidate) => candidate.id === materialId);
    if (!declaration || !material) return;
    const id = next3DResourceId(`${material.id}-copy`, declaration.materials.map((candidate) => candidate.id));
    transactSections("Duplicate 3D material", ["extensions"], (project) => {
      const draft = readEditor3DDeclaration(project);
      const source = draft?.materials.find((candidate) => candidate.id === material.id);
      if (draft && source) draft.materials.push({ ...structuredClone(source), id });
    });
    active3DMaterialId = id;
    active3DResourceKind = "material";
    render3DWorkspace();
  }

  function delete3DMaterial(materialId?: string) {
    const declaration = readEditor3DDeclaration(history.project);
    if (!declaration || !materialId || declaration.materials.length <= 1) return;
    if (declaration.scenes.some((scene) => scene.entities.some((entity) => entity.materialId === materialId))) {
      showError(new Error("Assign another material to every object before deleting this material."));
      return;
    }
    transactSections("Delete 3D material", ["extensions"], (project) => {
      const draft = readEditor3DDeclaration(project);
      if (draft) draft.materials = draft.materials.filter((candidate) => candidate.id !== materialId);
    });
    active3DMaterialId = "";
    render3DWorkspace();
  }

  function rename3DLight(lightId?: string) {
    const declaration = readEditor3DDeclaration(history.project);
    const scene = declaration?.scenes.find((candidate) => candidate.id === declaration.activeSceneId);
    const light = scene?.lights.find((candidate) => candidate.id === lightId);
    if (!light || !scene) return;
    const id = request3DResourceId("Rename 3D light", light.id, scene.lights.map((candidate) => candidate.id));
    if (!id || id === light.id) return;
    transactSections("Rename 3D light", ["extensions"], (project) => {
      const draft = readEditor3DDeclaration(project);
      const active = draft?.scenes.find((candidate) => candidate.id === draft.activeSceneId);
      const target = active?.lights.find((candidate) => candidate.id === light.id);
      if (target) target.id = id;
    });
    active3DLightId = id;
    active3DResourceKind = "light";
    render3DWorkspace();
  }

  function duplicate3DLight(lightId?: string) {
    const declaration = readEditor3DDeclaration(history.project);
    const scene = declaration?.scenes.find((candidate) => candidate.id === declaration.activeSceneId);
    const light = scene?.lights.find((candidate) => candidate.id === lightId);
    if (!scene || !light) return;
    const id = next3DResourceId(`${light.id}-copy`, scene.lights.map((candidate) => candidate.id));
    transactSections("Duplicate 3D light", ["extensions"], (project) => {
      const draft = readEditor3DDeclaration(project);
      const active = draft?.scenes.find((candidate) => candidate.id === draft.activeSceneId);
      const source = active?.lights.find((candidate) => candidate.id === light.id);
      if (active && source) active.lights.push({ ...structuredClone(source), id });
    });
    active3DLightId = id;
    active3DResourceKind = "light";
    render3DWorkspace();
  }

  function delete3DLight(lightId?: string) {
    if (!lightId) return;
    transactSections("Delete 3D light", ["extensions"], (project) => {
      const declaration = readEditor3DDeclaration(project);
      const scene = declaration?.scenes.find((candidate) => candidate.id === declaration.activeSceneId);
      if (scene) scene.lights = scene.lights.filter((candidate) => candidate.id !== lightId);
    });
    active3DLightId = "";
    render3DWorkspace();
  }

  async function place3DAsset(assetId?: string) {
    if (!assetId) return;
    try {
      const asset = history.project.assets.find((candidate) => candidate.id === assetId);
      if (!asset || !isPortableGltfAsset(asset) || /\.glb$/i.test(asset.name)) throw new Error("3D placement requires portable .gltf JSON; GLB is not supported.");
      const blob = (await readAssetBlobs([assetId])).get(assetId);
      if (!blob) throw new Error(`Stored data for ${asset.name} is unavailable.`);
      const document: unknown = JSON.parse(await blob.text());
      const buffers = isObject(document) && Array.isArray(document.buffers) ? document.buffers : [];
      const external = buffers.find((buffer) => !isObject(buffer) || typeof buffer.uri !== "string" || !buffer.uri.startsWith("data:"));
      if (external) throw new Error("This glTF uses external or missing buffer URIs. Re-export it with buffers embedded as data: URIs, then replace/reimport the asset.");
      let id = "";
      transactSections("Place imported glTF", ["extensions"], (project) => { id = placeImportedGltf(project, assetId); });
      active3DEntityId = id;
      active3DResourceKind = "object";
      showWorkspace("scene3d");
      render3DWorkspace();
    } catch (error) { showError(error); }
  }

  async function createScript() {
    if (!await flushSourceSurface()) return;
    const scripts = readProjectScripts(history.project);
    let index = scripts.files.length + 1;
    let suggested = `src/behavior-${index}.ts`;
    while (scripts.files.some((file) => file.path === suggested)) suggested = `src/behavior-${++index}.ts`;
    const requested = requestText("New project script path", suggested);
    if (!requested) return;
    try {
      transactSections("Create project script", ["extensions"], (project) => { activeScriptPath = createEditorScript(project, requested); });
      showWorkspace("script");
    } catch (error) { showError(error); }
  }

  async function switchScript(path: string) {
    if (path === activeScriptPath) return;
    if (!await flushSourceSurface()) return;
    activeScriptPath = path;
    showWorkspace("script");
    renderScriptWorkspace();
  }

  async function openBuildCenter() {
    if (!await flushSourceSurface()) return;
    openCenter("build");
  }

  async function flushSourceSurface() {
    try { await sourceSurface.save(); return true; }
    catch (error) {
      showError(error);
      announce("Save the current script before leaving Code or building.");
      return false;
    }
  }

  async function renameScript(path?: string) {
    if (!path) return;
    if (path === activeScriptPath && !await flushSourceSurface()) return;
    const requested = requestText("Rename project script", path);
    if (!requested || requested === path) return;
    try {
      transactSections("Rename project script", ["extensions", "scenes"], (project) => { activeScriptPath = renameEditorScript(project, path, requested); });
    } catch (error) { showError(error); }
  }

  async function deleteScript(path?: string) {
    if (!path) return;
    if (path === activeScriptPath && !await flushSourceSurface()) return;
    const references = findEditorScriptReferences(history.project, path);
    const detach = references.length > 0 && globalThis.confirm?.(`${path} is attached to ${references.length} behavior${references.length === 1 ? "" : "s"}. Delete the script and detach them?`) === true;
    if (references.length && !detach) { findScriptReferences(path); return; }
    try {
      transactSections("Delete project script", ["extensions", "scenes"], (project) => removeEditorScript(project, path, { detachBehaviors: detach }));
      activeScriptPath = readProjectScripts(history.project).activePath;
    } catch (error) { showError(error); }
  }

  function findScriptReferences(path?: string) {
    if (!path) return;
    const references = findEditorScriptReferences(history.project, path);
    setConsoleOpen(true);
    appendConsole(references.length ? `${path} is attached to ${references.length} behavior${references.length === 1 ? "" : "s"}:` : `${path} has no behavior references.`);
    for (const reference of references) appendConsole(`  ${reference.entityLabel} · ${reference.exportName} · ${reference.sceneId}/${reference.entityId}/${reference.componentId}`);
  }

  function attachScript(path?: string) {
    const entityId = bridge.selectedEntityId();
    if (!path || !entityId) { announce("Select an entity before attaching a project behavior."); return; }
    try {
      transactSections("Attach project behavior", ["scenes"], (project) => { attachEditorScriptBehavior(project, entityId, path); });
      announce(`Attached ${path} to the selected entity.`);
    } catch (error) { showError(error); }
  }

  function saveScript() {
    if (!activeScriptPath) return;
    void sourceSurface.save();
  }

  function persistScript(path: string, source: string) {
    if (path !== activeScriptPath) throw new Error(`Cannot save inactive script ${path}.`);
    transactSections(`Save ${activeScriptPath}`, ["extensions"], (project) => {
      const scripts = ensureProjectScripts(project);
      const file = scripts.files.find((candidate) => candidate.path === activeScriptPath);
      if (!file) throw new Error(`Script no longer exists: ${activeScriptPath}`);
      file.source = source;
      scripts.activePath = activeScriptPath;
    });
    setText("#script-editor-status", "Saved to project");
    announce(`Saved ${activeScriptPath}.`);
    if (sourcePermission) void compileLiveSource("save");
  }

  async function setLiveSourcePermission(enabled: boolean) {
    sourcePermission = enabled;
    if (!enabled) {
      sourceCompileRequest += 1;
      bridge.clearSource();
      if (mode === "play") {
        modeRequest += 1;
        mode = "edit";
        bridge.pause();
        renderMode();
      }
      renderScriptWorkspace();
      announce("Live source preview disabled. Project source stays in this browser tab.");
      return;
    }
    renderScriptWorkspace();
    announce("Live source preview enabled for this tab. Project scripts may now be compiled by the local editor server and executed in Play mode.");
    await compileLiveSource("permission");
  }

  async function compileLiveSource(reason: "permission" | "save") {
    const request = ++sourceCompileRequest;
    const status = required<HTMLElement>("#script-live-status");
    status.textContent = "COMPILING…";
    status.classList.remove("is-error", "is-ready");
    status.classList.add("is-compiling");
    status.title = "Compiling explicitly permitted project source on the loopback editor server.";
    const compiled = await bridge.compileSource(history.project);
    const blocker = compiled.blocker;
    if (request !== sourceCompileRequest || !sourcePermission) return blocker;
    status.classList.remove("is-compiling");
    if (blocker) {
      status.textContent = "COMPILE ERROR";
      status.classList.add("is-error");
      status.title = blocker;
      setConsoleOpen(true);
      appendConsole(`! Live source: ${blocker}`);
      announce("Live source compile failed. Open the editor console for details.");
      return blocker;
    }
    if (compiled.definitions?.length) {
      transactSections("Synchronize compiled behavior metadata", ["extensions", "scenes"], (project) => {
        for (const definition of compiled.definitions ?? []) {
          upsertEditorBehaviorDefinition(project, definition);
          for (const scene of project.scenes) for (const entity of scene.entities) for (const component of entity.components) {
            if (component.type !== "behavior" || component.values.module !== definition.module || component.values.export !== definition.exportName) continue;
            const defaults = createPlayableBehaviorComponentValues2D(definition);
            for (const [key, value] of Object.entries(defaults)) if (!Object.hasOwn(component.values, key)) component.values[key] = value;
          }
        }
      });
    }
    status.textContent = hasCustomProjectBehaviors(history.project) ? "READY · PLAY USES THIS SOURCE" : "READY · NO CUSTOM BEHAVIORS";
    status.classList.add("is-ready");
    status.title = "The current saved project source compiled successfully.";
    if (reason === "save") announce(`Compiled ${activeScriptPath} for the next Play run.`);
    return undefined;
  }

  function downloadScript() {
    if (!activeScriptPath) return;
    const source = sourceSurface.text();
    download(activeScriptPath.split("/").at(-1) ?? "game.ts", source, "text/typescript;charset=utf-8");
  }

  async function openSelectedScript(componentId?: string) {
    if (!await flushSourceSurface()) return;
    const component = selectedEntity(history.project)?.components.find((candidate) => candidate.id === componentId);
    const moduleName = typeof component?.values.module === "string" ? component.values.module : "";
    const path = moduleName.startsWith("./") ? moduleName.slice(2) : moduleName.endsWith(".ts") ? moduleName : "src/gameplay.ts";
    const scripts = readProjectScripts(history.project);
    if (!scripts.files.some((file) => file.path === path)) {
      transactSections(`Create ${path}`, ["extensions"], (project) => { createEditorScript(project, path); });
    }
    activeScriptPath = path;
    showWorkspace("script");
    renderScriptWorkspace();
  }

  function edit3DField(field: string, rawValue: string) {
    transactSections(`Edit 3D ${field}`, ["extensions"], (project) => {
      const declaration = readEditor3DDeclaration(project);
      const scene = declaration?.scenes.find((candidate) => candidate.id === declaration.activeSceneId);
      if (!declaration || !scene) return;
      const selectedMaterial = declaration.materials.find((candidate) => candidate.id === active3DMaterialId);
      if (field === "selectedMaterial.shading" && selectedMaterial && (rawValue === "lit" || rawValue === "unlit")) { selectedMaterial.shading = rawValue; return; }
      if (field === "selectedMaterial.doubleSided" && selectedMaterial) { selectedMaterial.doubleSided = rawValue === "true"; return; }
      if ((field === "selectedMaterial.metallic" || field === "selectedMaterial.roughness") && selectedMaterial) {
        const value = Number(rawValue);
        if (Number.isFinite(value)) selectedMaterial[field.endsWith("metallic") ? "metallic" : "roughness"] = Math.min(1, Math.max(0, value));
        return;
      }
      const selectedLight = scene.lights.find((candidate) => candidate.id === active3DLightId);
      if (field === "selectedLight.kind" && selectedLight && (rawValue === "ambient" || rawValue === "directional" || rawValue === "point" || rawValue === "spot")) {
        selectedLight.kind = rawValue;
        if (rawValue === "ambient") { delete selectedLight.position; delete selectedLight.direction; delete selectedLight.range; }
        if (rawValue === "directional") { delete selectedLight.position; delete selectedLight.range; selectedLight.direction ??= [0, -1, 0]; }
        if (rawValue === "point") { delete selectedLight.direction; selectedLight.position ??= [0, 3, 0]; selectedLight.range ??= 12; }
        if (rawValue === "spot") { selectedLight.position ??= [0, 3, 0]; selectedLight.direction ??= [0, -1, 0]; selectedLight.range ??= 12; }
        return;
      }
      if ((field === "selectedLight.intensity" || field === "selectedLight.range") && selectedLight) {
        const value = Number(rawValue);
        if (Number.isFinite(value)) {
          if (field.endsWith("intensity")) selectedLight.intensity = Math.max(0, value);
          else selectedLight.range = Math.max(0.01, value);
        }
        return;
      }
      const selectedLightVector = /^selectedLight\.(position|direction)\.(\d)$/.exec(field);
      if (selectedLightVector && selectedLight) {
        const vector = selectedLightVector[1] === "position" ? selectedLight.position : selectedLight.direction;
        const index = Number(selectedLightVector[2]);
        const value = Number(rawValue);
        if (vector && Number.isFinite(value) && index >= 0 && index < 3) vector[index] = value;
        return;
      }
      const entity = scene.entities.find((candidate) => candidate.id === active3DEntityId);
      if (!entity) return;
      if (field === "meshId" && declaration.meshes.some((mesh) => mesh.id === rawValue)) { entity.meshId = rawValue; return; }
      if (field === "materialId" && declaration.materials.some((material) => material.id === rawValue)) { entity.materialId = rawValue; return; }
      if (field === "physics.type") {
        if (rawValue === "none") delete entity.physics;
        else if (rawValue === "static" || rawValue === "dynamic") entity.physics = { type: rawValue, shape: entity.physics?.shape ?? "box", gravityScale: entity.physics?.gravityScale ?? 1, continuous: entity.physics?.continuous ?? false };
        return;
      }
      if (field === "physics.shape" && entity.physics && (rawValue === "box" || rawValue === "sphere")) { entity.physics.shape = rawValue; return; }
      const material = declaration.materials.find((candidate) => candidate.id === entity.materialId);
      if (field === "material.shading" && material && (rawValue === "lit" || rawValue === "unlit")) { material.shading = rawValue; return; }
      const value = Number(rawValue);
      if (!Number.isFinite(value)) return;
      if (field === "rotationY") { entity.rotationY = value; return; }
      if (field === "physics.gravityScale" && entity.physics) { entity.physics.gravityScale = Math.max(0, value); return; }
      if (field === "material.metallic" && material) { material.metallic = Math.min(1, Math.max(0, value)); return; }
      if (field === "material.roughness" && material) { material.roughness = Math.min(1, Math.max(0, value)); return; }
      if (field === "camera.fovYRadians") { scene.camera.fovYRadians = Math.min(Math.PI - 0.01, Math.max(0.01, value)); return; }
      if (field === "camera.near") { scene.camera.near = Math.max(0.0001, Math.min(value, scene.camera.far - 0.0001)); return; }
      if (field === "camera.far") { scene.camera.far = Math.max(scene.camera.near + 0.0001, value); return; }
      const lightMatch = /^light\.(.+)\.intensity$/.exec(field);
      if (lightMatch) { const light = scene.lights.find((candidate) => candidate.id === lightMatch[1]); if (light) light.intensity = Math.max(0, value); return; }
      const [group, indexText] = field.split(".");
      const index = Number(indexText);
      if ((group === "position" || group === "scale") && Number.isInteger(index) && index >= 0 && index < 3) entity[group][index] = group === "scale" ? Math.max(0.01, value) : value;
    });
  }

  async function openProject() {
    if (!await flushSourceSurface()) return;
    const picker = globalThis.showDirectoryPicker;
    if (!picker) { openInput.click(); return; }
    try {
      const root = await picker({ id: "hyperfocus-open-project", mode: "read" });
      const directory = root.name === HYPERFOCUS_DIRECTORY ? root : await root.getDirectoryHandle(HYPERFOCUS_DIRECTORY);
      const projectFile = await (await directory.getFileHandle(HYPERFOCUS_PROJECT_FILENAME)).getFile();
      const assetsFile = await (await directory.getFileHandle(HYPERFOCUS_ASSETS_FILENAME)).getFile();
      await openProjectFiles([projectFile, assetsFile]);
    } catch (error) {
      if (!isAbortError(error)) showError(error);
    }
  }

  async function openProjectFiles(files: File[]) {
    if (!files.length) return;
    try {
      const projectFile = files.find((file) => file.name.toLowerCase() === HYPERFOCUS_PROJECT_FILENAME);
      const assetsFile = files.find((file) => file.name.toLowerCase() === HYPERFOCUS_ASSETS_FILENAME);
      if (projectFile || assetsFile) {
        if (!projectFile || !assetsFile) throw new Error(`Select both ${HYPERFOCUS_PROJECT_FILENAME} and ${HYPERFOCUS_ASSETS_FILENAME}.`);
        if (projectFile.size > MAX_PROJECT_FILE_BYTES) throw new Error(`${HYPERFOCUS_PROJECT_FILENAME} may not exceed ${formatBytes(MAX_PROJECT_FILE_BYTES)}.`);
        if (assetsFile.size > MAX_ASSET_CATALOG_BYTES) throw new Error(`${HYPERFOCUS_ASSETS_FILENAME} may not exceed ${formatBytes(MAX_ASSET_CATALOG_BYTES)}.`);
        const opened = await openEditorPortableFiles(
          new Uint8Array(await projectFile.arrayBuffer()),
          new Uint8Array(await assetsFile.arrayBuffer()),
        );
        await storeAssetBlobs(opened.assets);
        for (const asset of opened.assets) bridge.previewAsset(asset.id, new Blob([new Uint8Array(asset.bytes)], { type: asset.mimeType }));
        history.replace(opened.project, `Open ${HYPERFOCUS_DIRECTORY}`);
        history.markSaved();
        announce(`Opened ${opened.project.name} with ${opened.assets.length} packed asset${opened.assets.length === 1 ? "" : "s"}.`);
        return;
      }

      // Keep the old JSON-only format readable so existing projects are never trapped.
      if (files.length !== 1) throw new Error(`Select a ${HYPERFOCUS_DIRECTORY} project pair or one legacy JSON project.`);
      const [legacyFile] = files;
      if (legacyFile.size > MAX_PROJECT_FILE_BYTES) throw new Error(`Project files may not exceed ${formatBytes(MAX_PROJECT_FILE_BYTES)}.`);
      const project = migrateProject(JSON.parse(await legacyFile.text()));
      history.replace(project, `Open ${legacyFile.name}`);
      await hydrateAssetPreviews(project, bridge.previewAsset);
      history.markSaved();
      announce(`Opened ${project.name}.`);
    } catch (error) {
      showError(error);
    } finally {
      openInput.value = "";
    }
  }

  async function saveProject() {
    await assetBinarySyncPromise;
    if (!await flushSourceSurface()) return;
    commitRuntime("Synchronize runtime before save");
    const picker = globalThis.showDirectoryPicker;
    if (picker) {
      try {
        const root = await picker({ id: "hyperfocus-save-project", mode: "readwrite", startIn: "documents" });
        const files = await capturePortableFiles(history.project);
        const directory = root.name === HYPERFOCUS_DIRECTORY ? root : await root.getDirectoryHandle(HYPERFOCUS_DIRECTORY, { create: true });
        await writeDirectoryFile(directory, HYPERFOCUS_PROJECT_FILENAME, files.projectJson);
        await writeDirectoryFile(directory, HYPERFOCUS_ASSETS_FILENAME, files.assetsArchive);
        const scripts = root.name === HYPERFOCUS_DIRECTORY ? 0 : await writeProjectScripts(root, history.project);
        history.markSaved();
        announce(`Saved ${HYPERFOCUS_DIRECTORY}/${HYPERFOCUS_PROJECT_FILENAME}, ${HYPERFOCUS_ASSETS_FILENAME}${scripts ? `, and ${scripts} TypeScript source file${scripts === 1 ? "" : "s"}` : ""}.`);
        return;
      } catch (error) {
        if (isAbortError(error)) return;
        showError(error);
        return;
      }
    }
    await downloadProject();
  }

  async function downloadProject() {
    await assetBinarySyncPromise;
    if (!await flushSourceSurface()) return;
    try {
      commitRuntime("Synchronize runtime before export");
      const files = await capturePortableFiles(history.project);
      download(HYPERFOCUS_PROJECT_FILENAME, files.projectJson, "application/json");
      download(HYPERFOCUS_ASSETS_FILENAME, files.assetsArchive, "application/vnd.hyperfocus.assets");
      history.markSaved();
      announce(`Exported the two ${HYPERFOCUS_DIRECTORY} project files.`);
    } catch (error) { showError(error); }
  }

  async function exportNeutralProject() {
    await assetBinarySyncPromise;
    if (!await flushSourceSurface()) return;
    try {
      commitRuntime("Synchronize runtime before neutral export");
      const portable = await capturePortableFiles(history.project);
      const opened = await openEditorPortableFiles(portable.projectJson, portable.assetsArchive);
      const bundle = await createEditorNeutralExport(opened.project, opened.assets);
      setConsoleOpen(true);
      for (const diagnostic of bundle.manifest.diagnostics) {
        appendConsole(`! [${diagnostic.code}] ${diagnostic.pointer} ${diagnostic.message}`);
      }
      const baseName = neutralExportBaseName(history.project.name);
      const picker = globalThis.showDirectoryPicker;
      if (picker) {
        const root = await picker({ id: "hyperfocus-neutral-export", mode: "readwrite", startIn: "documents" });
        const evidence = await writeNeutralExportDirectory(root, baseName, bundle);
        appendConsole(`✓ Neutral export wrote ${evidence.fileCount} ordinary files (${formatBytes(evidence.bytesWritten)}) to ${evidence.directoryName}/; project SHA-256 ${bundle.manifest.project.sha256}; ${bundle.manifest.diagnostics.length} warning(s).`);
        announce(`Neutral export complete: ${evidence.fileCount} files in ${evidence.directoryName}.`);
        return;
      }
      const archive = await createNeutralExportArchive(bundle);
      const archiveName = `${baseName}.zip`;
      download(archiveName, archive, "application/zip");
      appendConsole(`✓ Neutral export downloaded ${archiveName} (${formatBytes(archive.byteLength)} archive; ${bundle.fileCount} ordinary files, ${formatBytes(bundle.bytesWritten)} unpacked); project SHA-256 ${bundle.manifest.project.sha256}; ${bundle.manifest.diagnostics.length} warning(s).`);
      announce(`Neutral export complete: downloaded ${archiveName}.`);
    } catch (error) {
      if (isAbortError(error)) return;
      showError(error);
    }
  }

  async function importAssets(files: File[]) {
    if (!files.length) return;
    try {
      if (files.length > 512) throw new Error("Import at most 512 assets at a time.");
      const oversized = files.find((file) => file.size > MAX_ASSET_FILE_BYTES);
      if (oversized) throw new Error(`${oversized.name} exceeds the ${formatBytes(MAX_ASSET_FILE_BYTES)} per-file limit.`);
      const existingBytes = history.project.assets.reduce((total, asset) => total + asset.size, 0);
      const incomingBytes = files.reduce((total, file) => total + file.size, 0);
      if (existingBytes + incomingBytes > MAX_ASSET_CATALOG_BYTES) throw new Error(`The local asset catalog may not exceed ${formatBytes(MAX_ASSET_CATALOG_BYTES)}.`);
      const imported: EditorAsset[] = [];
      for (const file of files) {
        const id = uniqueId("asset");
        const kind = assetKind(file);
        const mimeType = assetMimeType(file);
        const blob = normalizedAssetBlob(file, mimeType);
        await storeAssetBlob(id, blob);
        bridge.previewAsset(id, blob);
        imported.push({ id, name: file.name, kind, mimeType, size: file.size, lastModified: file.lastModified, source: "imported" });
      }
      transactSections(`Import ${files.length} asset${files.length === 1 ? "" : "s"}`, ["assets"], (project) => { project.assets.push(...imported); });
      announce(`Imported ${files.length} asset${files.length === 1 ? "" : "s"}.`);
    } catch (error) {
      showError(error);
    } finally {
      assetInput.value = "";
    }
  }

  async function downloadBuild() {
    await assetBinarySyncPromise;
    if (!await flushSourceSurface()) return;
    commitRuntime("Synchronize runtime before build");
    try {
      const project = history.project;
      const importedIds = project.assets.filter((asset) => asset.source === "imported").map((asset) => asset.id);
      const blobs = await readAssetBlobs(importedIds);
      const preflight = await collectPlayableBuildAssets(project, async (id) => blobs.get(id), { allowEmbeddedProjectSource: true });
      if (!preflight.ok) {
        const blockers = preflight.diagnostics.filter((item) => item.severity === "error").map((item) => `• ${item.message}`);
        throw new Error(`Standalone build blocked:\n${blockers.join("\n")}`);
      }
      const projectBehaviorSource = await compileStandaloneProjectSource(project);
      const files = await createEditorPortableFiles(project, async (id) => blobs.get(id));
      const html = createStandalonePlayableHtml({ project, ...files, projectBehaviorSource });
      download(`${slug(project.name)}.html`, html, "text/html");
      localStorage.setItem(LAST_BUILD_KEY, new Date().toISOString());
      appendConsole(`✓ Built offline runtime-backed HTML (${formatBytes(new Blob([html]).size)}) for ${project.settings.targetProfile}.`);
      for (const warning of preflight.diagnostics.filter((item) => item.severity === "warning")) appendConsole(`! ${warning.message}`);
      setConsoleOpen(true);
    } catch (error) {
      showError(error);
      appendConsole(`✕ ${error instanceof Error ? error.message : String(error)}`);
      setConsoleOpen(true);
    }
  }

  function downloadCiReport() {
    const profile = bridge.captureProfile();
    const report = {
      schema: "catalog-engine-editor-ci-v1",
      generatedAt: new Date().toISOString(),
      project: { id: history.project.id, name: history.project.name, version: history.project.version },
      target: history.project.settings.targetProfile,
      validation: validateForBuild(history.project),
      profile,
    };
    download(`${slug(history.project.name)}.build-report.json`, `${JSON.stringify(report, null, 2)}\n`, "application/json");
  }

  function downloadProfile() {
    const capture = { schema: "catalog-engine-profile-v1", capturedAt: new Date().toISOString(), projectId: history.project.id, target: history.project.settings.targetProfile, metrics: bridge.captureProfile() };
    download(`${slug(history.project.name)}.profile.json`, `${JSON.stringify(capture, null, 2)}\n`, "application/json");
  }

  function connectRemote() {
    const input = required<HTMLInputElement>("#remote-runtime-url", center);
    const output = required("#remote-runtime-state", center);
    remoteSocket?.close();
    try {
      remoteSocket = new WebSocket(input.value);
      output.textContent = "Connecting…";
      remoteSocket.addEventListener("open", () => { output.textContent = "Connected"; bridge.log(`remote runtime → ${input.value}`); });
      remoteSocket.addEventListener("message", (event) => { bridge.log(`remote → ${String(event.data).slice(0, 180)}`); });
      remoteSocket.addEventListener("close", () => { output.textContent = "Disconnected"; });
      remoteSocket.addEventListener("error", () => { output.textContent = "Connection failed"; });
    } catch (error) { showError(error); }
  }

  function toggleSidebar() {
    const workbench = toggleWorkbenchPanel(uiPreferences.app.workbench, "sidebar");
    uiPreferences = writeEditorUiPreferences({ ...uiPreferences, app: { ...uiPreferences.app, workbench } });
    applyEditorUiPreferences(uiPreferences);
    shellView.update({ sidebarCollapsed: viewportFullscreen || workbench.sidebarCollapsed, sidebarSize: workbench.sidebarSize });
    announce(workbench.sidebarCollapsed ? "Project browser hidden." : "Project browser shown.");
  }

  function toggleInspector() {
    const workbench = toggleWorkbenchPanel(uiPreferences.app.workbench, "inspector");
    uiPreferences = writeEditorUiPreferences({ ...uiPreferences, app: { ...uiPreferences.app, workbench } });
    applyEditorUiPreferences(uiPreferences);
    shellView.update({ inspectorCollapsed: viewportFullscreen || workbench.inspectorCollapsed, inspectorSize: workbench.inspectorSize });
    announce(workbench.inspectorCollapsed ? "Contextual inspector hidden." : "Contextual inspector shown.");
  }

  function scheduleUiPreferencesWrite() {
    if (uiPreferencesWriteTimer !== undefined) clearTimeout(uiPreferencesWriteTimer);
    uiPreferencesWriteTimer = window.setTimeout(() => {
      uiPreferencesWriteTimer = undefined;
      uiPreferences = writeEditorUiPreferences(uiPreferences);
    }, 180);
  }

  function persistUiPreferences() {
    if (uiPreferencesWriteTimer !== undefined) clearTimeout(uiPreferencesWriteTimer);
    uiPreferencesWriteTimer = undefined;
    uiPreferences = writeEditorUiPreferences(uiPreferences);
  }

  function toggleFullscreen() {
    viewportFullscreen = !viewportFullscreen;
    shellView.update({ sidebarCollapsed: viewportFullscreen || uiPreferences.app.workbench.sidebarCollapsed, inspectorCollapsed: viewportFullscreen || uiPreferences.app.workbench.inspectorCollapsed });
    announce(viewportFullscreen ? "Viewport fullscreen enabled." : "Viewport fullscreen disabled.");
  }

  async function restoreRecovery() {
    if (!await flushSourceSurface()) return;
    const project = readRecovery();
    if (project) history.replace(project, "Restore recovery snapshot");
    closeCenter();
  }

  function clearRecovery() {
    localStorage.removeItem(RECOVERY_KEY);
    announce("Recovery snapshot cleared.");
    renderCenter();
  }

  function destroy() {
    if (uiPreferencesWriteTimer !== undefined) { clearTimeout(uiPreferencesWriteTimer); persistUiPreferences(); }
    const recoveryIds = [...assetBinaryRecovery.values()].flatMap((entries) => [...entries.values()]);
    for (const id of new Set(recoveryIds)) void removeAssetRecord(id).catch(() => undefined);
    stopAudioAudition(false);
    unsubscribe();
    releaseFocusTrap?.();
    remoteSocket?.close();
    document.removeEventListener("click", onClick);
    document.removeEventListener("contextmenu", onContextMenu);
    document.removeEventListener("change", onChange);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("dragover", onSidebarDragOver);
    document.removeEventListener("dragleave", onSidebarDragLeave);
    document.removeEventListener("drop", onSidebarDrop);
    document.removeEventListener("hyperfocus:console-open", onConsoleOpen);
    sourceSurface.dispose();
    disposeWorkspaceLayouts();
    session.destroy();
    shellView.dispose();
  }

  return {
    get project() { return history.project; },
    commands: history,
    session,
    commitRuntime,
    refreshSelection,
    undo,
    redo,
    openCenter,
    openCommandPalette: shellView.openCommandPalette,
    closeCommandPalette: shellView.closeCommandPalette,
    refreshCommandPalette: shellView.refreshCommandPalette,
    commandPaletteOpen: shellView.commandPaletteOpen,
    destroy,
  };
}

export type EditorShell = ReturnType<typeof createEditorShell>;

export function resolveEditorInteractionTarget(target: Element | null) {
  return target?.closest<HTMLElement>("[data-editor-action],button[data-editor-mode],[data-center-tab],[data-project-entity],[data-project-scene],[data-script-path],[data-3d-entity],[data-3d-material],[data-3d-light]") ?? null;
}

function activeScene(project: EditorProject) {
  return project.scenes.find((scene) => scene.id === project.activeSceneId) ?? project.scenes[0];
}

function defaultComponentValues(type: EditorComponent["type"]): EditorComponent["values"] {
  if (type === "transform") return { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
  if (type === "sprite") return { asset: "generated", tint: "#ffffff" };
  if (type === "collider") return { shape: "box", solid: true };
  if (type === "input") return { action: "move-right" };
  if (type === "behavior") return { module: "./src/behavior.ts", export: "update", speed: 180 };
  if (type === "camera") return { active: true, zoom: 1 };
  if (type === "audio") return { asset: "", volume: 1, trigger: "start" };
  return { text: "Label", visible: true };
}

function requestText(label: string, current: string) {
  const value = globalThis.prompt?.(label, current);
  return typeof value === "string" ? value.trim() : undefined;
}

function request3DResourceId(label: string, current: string, existing: readonly string[]) {
  const requested = requestText(label, current);
  if (!requested || requested === current) return requested;
  if (requested.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(requested)) {
    globalThis.alert?.("3D resource IDs must start with a letter or number and use only letters, numbers, periods, underscores, or hyphens.");
    return undefined;
  }
  if (existing.includes(requested)) {
    globalThis.alert?.(`A 3D resource named ${requested} already exists.`);
    return undefined;
  }
  return requested;
}

function next3DResourceId(base: string, existing: readonly string[]) {
  const used = new Set(existing);
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 100_000; suffix += 1) if (!used.has(`${base}-${suffix}`)) return `${base}-${suffix}`;
  throw new Error(`Could not create a unique 3D resource id for ${base}.`);
}

function copyName(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)} copy${name.slice(dot)}` : `${name} copy`;
}

function assetAffordance(asset: EditorAsset) {
  if (isPortableGltfAsset(asset)) return "Open actions to place this portable glTF JSON model in the 3D scene";
  if (/\.glb$/i.test(asset.name) || asset.mimeType === "model/gltf-binary") return "GLB is stored as an asset but cannot be placed; import portable .gltf JSON instead";
  if (asset.kind === "image") return "Drag into Stage to create a sprite entity";
  if (asset.kind === "audio") return "Select for metadata, replacement, or use from an Audio component";
  if (asset.kind === "data") return "Select to inspect metadata, usages, or replace this data source";
  if (asset.kind === "font") return "Select to inspect metadata, usages, or replace this font";
  return "Select to inspect metadata and available actions";
}

function assetPrimaryMenuItem(asset: EditorAsset): EditorResourceMenuItem {
  if (isPortableGltfAsset(asset)) return { label: "Place glTF JSON in 3D scene", action: "place-3d-asset", data: { assetId: asset.id } };
  if (/\.glb$/i.test(asset.name) || asset.mimeType === "model/gltf-binary") return { label: "GLB placement unsupported · use .gltf", action: "select-asset", data: { assetId: asset.id } };
  if (asset.kind === "image") return { label: "Create Stage sprite", action: "create-entity-from-asset", data: { assetId: asset.id } };
  if (asset.kind === "audio") return { label: "Select for Audio components", action: "select-asset", data: { assetId: asset.id } };
  return { label: "Inspect metadata", action: "select-asset", data: { assetId: asset.id } };
}

function isPortableGltfAsset(asset: EditorAsset) {
  return asset.mimeType === "model/gltf+json" || /\.gltf$/i.test(asset.name);
}

function closeResourceMenus(except?: HTMLDetailsElement) {
  for (const menu of document.querySelectorAll<HTMLDetailsElement>(".resource-overflow[open]")) if (menu !== except) menu.open = false;
}

function storeProjectBehaviorDefinition(project: EditorProject, definition: PlayableBehaviorDefinition2D) {
  upsertEditorBehaviorDefinition(project, definition);
}

function resolveProjectBehaviorDefinition(component: EditorComponent, project: EditorProject): Readonly<PlayableBehaviorDefinition2D> | undefined {
  const builtIn = playableBehaviorDefinition2D(component);
  if (builtIn) return builtIn;
  const module = component.values.module;
  const exportName = component.values.export;
  if (typeof module !== "string" || typeof exportName !== "string") return undefined;
  return readEditorBehaviorDefinitions(project).find((candidate) => candidate.module === module && candidate.exportName === exportName);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readTutorialProgress(): { step: number; completed: boolean } {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TUTORIAL_PROGRESS_KEY) ?? "null");
    if (!isObject(parsed)) return { step: 0, completed: false };
    return {
      step: typeof parsed.step === "number" && Number.isFinite(parsed.step) ? Math.max(0, Math.min(3, Math.trunc(parsed.step))) : 0,
      completed: parsed.completed === true,
    };
  } catch {
    return { step: 0, completed: false };
  }
}

function writeTutorialProgress(progress: { step: number; completed: boolean }) {
  localStorage.setItem(TUTORIAL_PROGRESS_KEY, JSON.stringify(progress));
}

function readProjectScripts(project: EditorProject): EditorScripts {
  const candidate = project.extensions?.hyperfocusScripts;
  if (!isObject(candidate) || !Array.isArray(candidate.files)) return { activePath: "", files: [] };
  const files = candidate.files.filter(isObject).flatMap((file) => typeof file.path === "string" && typeof file.source === "string"
    ? [{ path: file.path, language: "typescript" as const, source: file.source }]
    : []);
  return { activePath: typeof candidate.activePath === "string" ? candidate.activePath : files[0]?.path ?? "", files };
}

function ensureProjectScripts(project: EditorProject): EditorScripts {
  project.extensions ??= {};
  const current = readProjectScripts(project);
  const scripts: EditorScripts = { activePath: current.activePath, files: current.files.map((file) => ({ ...file })) };
  project.extensions.hyperfocusScripts = scripts;
  return scripts;
}

function additiveBehaviorExtensionSource(definition: PlayableBehaviorDefinition2D) {
  const metadata = JSON.stringify(definition, null, 2);
  return `import type { PlayableBehavior2D, PlayableBehaviorDefinition2D } from "@hyperfocus/engine/project/runtime-2d";\n\nexport const updateDefinition = ${metadata} satisfies PlayableBehaviorDefinition2D;\n\n// This extension runs beside the built-in and intentionally starts as a no-op.\n// Add commands or velocity only when you want behavior in addition to the built-in.\nexport const update: PlayableBehavior2D = ({ actions, component }) => {\n  void actions;\n  void component;\n};\n\nObject.defineProperty(update, "definition", { value: Object.freeze(updateDefinition) });\n`;
}

function has3DProject(project: EditorProject) {
  return Boolean(readHyperfocus3DDeclaration(project));
}



function readRecovery() {
  const value = localStorage.getItem(RECOVERY_KEY);
  if (!value) return undefined;
  try { return migrateProject(JSON.parse(value)); } catch { return undefined; }
}

function validateForBuild(project: EditorProject) {
  const entityCount = project.scenes.reduce((sum, scene) => sum + scene.entities.length, 0);
  const components = project.scenes.flatMap((scene) => scene.entities.flatMap((entity) => entity.components.filter((component) => component.enabled)));
  const behaviorCount = components.filter((component) => component.type === "behavior").length;
  const builtins = new Set(["builtin:player", "builtin:patrol", "builtin:navigate", "builtin:platformer", "builtin:pong-paddle", "builtin:pong-ai", "builtin:pong-ball"]);
  const scriptPaths = new Set(readProjectScripts(project).files.map((file) => file.path.replace(/^\.\//, "")));
  const unsupportedBehaviors = components.filter((component) => {
    if (component.type !== "behavior") return false;
    const module = component.values.module;
    if (typeof module !== "string") return true;
    if (module.startsWith("builtin:")) return !builtins.has(module);
    return !module.startsWith("./") || !scriptPaths.has(module.replace(/^\.\//, ""));
  });
  const unsupportedColliders = components.filter((component) => component.type === "collider" && component.values.shape !== undefined && component.values.shape !== "box" && component.values.shape !== "aabb");
  const unsupportedAudio = components.filter((component) => component.type === "audio" && component.values.autoplay !== true && component.values.trigger !== "start" && !(typeof component.values.trigger === "string" && /^action:[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(component.values.trigger)));
  const unsupportedEffects = project.postProcessing.effects.filter((effect) => effect.enabled && !["grayscale", "sepia", "crt", "shake", "threshold"].includes(effect.id));
  const importedAssets = project.assets.filter((asset) => asset.source === "imported");
  let navigationErrors: string[] = [];
  try { navigationErrors = auditNavigationProject2D(project).map((diagnostic) => diagnostic.message); }
  catch (cause) { navigationErrors = [cause instanceof Error ? cause.message : String(cause)]; }
  let platformerError = "";
  try { validatePlayablePlatformers2D(project); }
  catch (cause) { platformerError = cause instanceof Error ? cause.message : String(cause); }
  let saveError = "";
  try { validatePlayableSaveProject2D(project); }
  catch (cause) { saveError = cause instanceof Error ? cause.message : String(cause); }
  let storyError = "";
  try { validatePlayableStoryProject2D(project); }
  catch (cause) { storyError = cause instanceof Error ? cause.message : String(cause); }
  let timelineWarnings: string[] = [];
  try { timelineWarnings = auditPlayableTimeline2D(project).map((diagnostic) => diagnostic.message); }
  catch (cause) { timelineWarnings = [cause instanceof Error ? cause.message : String(cause)]; }
  return [
    { ok: project.scenes.length > 0, blocking: true, label: "Playable scene", detail: `${project.scenes.length} scene${project.scenes.length === 1 ? "" : "s"}` },
    { ok: entityCount > 0, blocking: false, label: "Scene entities", detail: entityCount ? `${entityCount} entity records` : "The build will contain an empty scene" },
    { ok: unsupportedBehaviors.length === 0, blocking: true, label: "Executable behaviors", detail: unsupportedBehaviors.length ? `${unsupportedBehaviors.length} behavior module${unsupportedBehaviors.length === 1 ? " is" : "s are"} missing, invalid, or unknown` : `${behaviorCount} behavior component${behaviorCount === 1 ? "" : "s"}; project source compiles into the editor build` },
    { ok: unsupportedColliders.length === 0, blocking: true, label: "Collider shapes", detail: unsupportedColliders.length ? `${unsupportedColliders.length} collider${unsupportedColliders.length === 1 ? "" : "s"} use unsupported shapes` : "AABB/box collision is runtime-backed" },
    { ok: !platformerError, blocking: true, label: "Platformer controllers", detail: platformerError || "Gravity, buffered/coyote jumps, and swept collision pass runtime preflight" },
    { ok: !saveError, blocking: true, label: "Save profile policy", detail: saveError || "Checksummed browser saves are bounded and kept outside the portable project pair" },
    { ok: !storyError, blocking: true, label: "Story graphs", detail: storyError || "Localization, dialogue choices, and quest references pass bounded runtime preflight" },
    { ok: navigationErrors.length === 0, blocking: true, label: "Navigation routes", detail: navigationErrors.length ? navigationErrors.join(" ") : "Built-in navigation routes pass bounded A* preflight" },
    { ok: timelineWarnings.length === 0, blocking: false, label: "Timeline playback", detail: timelineWarnings.length ? timelineWarnings.join(" ") : "Entity x/y, scale, rotation, and opacity tracks are supported; no inactive runtime-only tracks were found" },
    { ok: unsupportedAudio.length === 0, blocking: true, label: "Audio triggers", detail: unsupportedAudio.length ? `${unsupportedAudio.length} audio component${unsupportedAudio.length === 1 ? "" : "s"} need autoplay, trigger=start, or trigger=action:<name>` : "Start and rising-edge action audio use the first-party Web Audio runtime" },
    { ok: unsupportedEffects.length === 0, blocking: true, label: "Post effects", detail: unsupportedEffects.length ? `Unsupported enabled effects: ${unsupportedEffects.map((effect) => effect.id).join(", ")}` : "Enabled effects are supported by the standalone renderer" },
    { ok: project.tilemap.values.length === project.tilemap.columns * project.tilemap.rows, blocking: true, label: "Tilemap data", detail: `${project.tilemap.columns} × ${project.tilemap.rows} validated` },
    { ok: importedAssets.length > 0, blocking: false, label: "Owned assets", detail: importedAssets.length ? `${importedAssets.length} imported assets will be verified and embedded` : "Procedural color shapes are valid; no binary assets are required" },
  ];
}

function assetKind(file: File): EditorAsset["kind"] {
  if (file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(file.name)) return "image";
  if (file.type.startsWith("audio/") || /\.(wav|mp3|ogg|m4a|aac|flac)$/i.test(file.name)) return "audio";
  if (/\.(json|csv|txt|gltf)$/i.test(file.name) || file.type === "model/gltf+json") return "data";
  if (file.type.startsWith("font/") || /\.(ttf|otf|woff2?)$/i.test(file.name)) return "font";
  return "unknown";
}

function assetMimeType(file: File) {
  if (/\.gltf$/i.test(file.name) && (!file.type || file.type === "application/octet-stream" || file.type === "application/json")) return "model/gltf+json";
  return file.type || "application/octet-stream";
}

function normalizedAssetBlob(file: File, mimeType = assetMimeType(file)) {
  return file.type === mimeType ? file : new Blob([file], { type: mimeType });
}

function assetMetadataFingerprint(asset: EditorAsset) {
  return asset.sha256
    ? `sha256:${asset.sha256}`
    : `metadata:${asset.mimeType}:${asset.size}:${asset.lastModified}`;
}

async function storeAssetBlob(id: string, blob: Blob) {
  await storeAssetRecords([{ id, blob }]);
}

async function hydrateAssetPreviews(project: EditorProject, preview: EditorShellBridge["previewAsset"]) {
  // The bridge owns decoding/preview policy. 3D Play cooks its referenced glTF,
  // buffer, and texture data from these restored blobs without filesystem or
  // network access, so 3D projects hydrate imported data as well as media.
  const include3DData = has3DProject(project);
  const ids = project.assets.filter((asset) => asset.source === "imported" && (include3DData || asset.kind === "image" || asset.kind === "audio") && asset.size <= MAX_ASSET_FILE_BYTES).map((asset) => asset.id);
  const blobs = await readAssetBlobs(ids);
  for (const [id, blob] of blobs) preview(id, blob);
}

async function storeAssetBlobs(assets: readonly EditorPortableAsset[]) {
  await storeAssetRecords(assets.map((asset) => ({ id: asset.id, blob: new Blob([new Uint8Array(asset.bytes)], { type: asset.mimeType }) })));
}

async function storeAssetRecords(assets: readonly { id: string; blob: Blob }[]) {
  if (!assets.length) return;
  const database = await openAssetDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("assets", "readwrite");
    const store = transaction.objectStore("assets");
    for (const asset of assets) store.put(asset.blob, asset.id);
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("Asset cache transaction was aborted.")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });
  });
  database.close();
}

async function removeAssetRecord(assetId: string) {
  const database = await openAssetDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("assets", "readwrite");
    transaction.objectStore("assets").delete(assetId);
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("Asset cache deletion was aborted.")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });
  });
  database.close();
}

async function capturePortableFiles(project: EditorProject) {
  const ids = project.assets.filter((asset) => asset.source === "imported").map((asset) => asset.id);
  const blobs = await readAssetBlobs(ids);
  return createEditorPortableFiles(project, async (id) => blobs.get(id));
}

async function readAssetBlobs(ids: readonly string[]) {
  const blobs = new Map<string, Blob>();
  if (!ids.length) return blobs;
  const database = await openAssetDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("assets", "readonly");
      const store = transaction.objectStore("assets");
      for (const id of ids) {
        const request = store.get(id);
        request.addEventListener("success", () => {
          if (request.result instanceof Blob) blobs.set(id, request.result);
        }, { once: true });
      }
      transaction.addEventListener("complete", () => resolve(), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("Asset cache read was aborted.")), { once: true });
      transaction.addEventListener("error", () => reject(transaction.error), { once: true });
    });
    return blobs;
  } finally {
    database.close();
  }
}

function openAssetDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(ASSET_DB, 1);
    request.addEventListener("upgradeneeded", () => request.result.createObjectStore("assets"), { once: true });
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

async function writeProjectScripts(root: DirectoryHandle, project: EditorProject) {
  const scripts = readProjectScripts(project);
  for (const file of scripts.files) {
    const segments = file.path.replace(/\\/g, "/").split("/").filter((segment) => segment && segment !== "." && segment !== "..");
    if (!segments.length || segments.some((segment) => !/^[A-Za-z0-9._-]+$/.test(segment))) throw new Error(`Script path is not portable: ${file.path}`);
    const name = segments.pop()!;
    let directory = root;
    for (const segment of segments) directory = await directory.getDirectoryHandle(segment, { create: true });
    await writeDirectoryFile(directory, name, new TextEncoder().encode(file.source));
  }
  return scripts.files.length;
}
