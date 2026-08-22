import {
  createDefaultProject,
  migrateProject,
  stableProjectJson,
  uniqueId,
  type EditorAsset,
  type EditorComponent,
  type EditorProject,
} from "./project.ts";
import { EditorCommandSession } from "./editor-command-session.ts";
import { createEditorPortableFiles, openEditorPortableFiles, type EditorPortableAsset } from "./portable-project.ts";
import { collectPlayableBuildAssets } from "./playable-build-assets.ts";
import { createStandalonePlayableHtml } from "./playable-build.ts";
import {
  createEditorNeutralExport,
  createNeutralExportArchive,
  neutralExportBaseName,
  writeNeutralExportDirectory,
  type NeutralDirectoryHandle,
} from "./neutral-export.ts";
import { HYPERFOCUS_ASSETS_FILENAME, HYPERFOCUS_DIRECTORY, HYPERFOCUS_PROJECT_FILENAME } from "../../../engine/src/project/index.ts";
import { validatePlayablePlatformers2D } from "../../../engine/src/project/runtime-2d.ts";
import { auditNavigationProject2D } from "../../../engine/src/project/runtime-navigation-2d.ts";
import { validatePlayableSaveProject2D } from "../../../engine/src/project/runtime-save-2d.ts";
import { validatePlayableStoryProject2D } from "../../../engine/src/project/runtime-story-2d.ts";
import type { EditorStarterId } from "./starter-projects.ts";
import { mountEditorShellView, type EditorCenterTab, type EditorMode } from "./editor-shell-view.tsx";
import { mountEditorSourceSurface } from "./editor-source-surface.tsx";

const RECOVERY_KEY = "catalog-engine.editor.recovery.v1";
const LAST_BUILD_KEY = "catalog-engine.editor.last-build.v1";
const ASSET_DB = "catalog-engine-editor-assets";
const MAX_PROJECT_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ASSET_FILE_BYTES = 256 * 1024 * 1024;
const MAX_ASSET_CATALOG_BYTES = 1024 * 1024 * 1024;
const FIRST_RUN_KEY = "catalog-engine.editor.first-run-complete.v1";

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
  play(project: EditorProject): string | void;
  pause(): void;
  togglePlayback(): void;
  captureProfile(): Record<string, unknown>;
  log(message: string): void;
};

export type EditorShell = {
  readonly project: EditorProject;
  readonly commands: EditorCommandSession;
  commitRuntime(label: string): void;
  refreshSelection(): void;
  undo(): void;
  redo(): void;
  openCenter(tab?: EditorCenterTab): void;
  destroy(): void;
};

type EditorScriptFile = { path: string; language: "typescript"; source: string };
type EditorScripts = { activePath: string; files: EditorScriptFile[] };
type Editor3DEntity = {
  id: string;
  meshId: string;
  materialId: string;
  position: [number, number, number];
  scale: [number, number, number];
  rotationY: number;
  controller?: { speed: number };
  physics?: { type: string; shape: string };
};
type Editor3DDeclaration = { activeSceneId: string; scenes: Array<{ id: string; entities: Editor3DEntity[] }> };

export function createEditorShell(bridge: EditorShellBridge): EditorShell {
  const recovered = readRecovery();
  const history = new EditorCommandSession(recovered ?? createDefaultProject(), {
    async putAsset(asset) {
      const blob = new Blob([new Uint8Array(asset.bytes)], { type: asset.mimeType });
      await storeAssetRecords([{ id: asset.id, blob }]);
      bridge.previewAsset(asset.id, blob);
    },
    async removeAsset(assetId) { await removeAssetRecord(assetId); },
  });
  let mode: EditorMode = "edit";
  let selectedCenterTab: EditorCenterTab = "project";
  let activeScriptPath = "";
  let active3DEntityId = "";
  let remoteSocket: WebSocket | undefined;
  let releaseFocusTrap: (() => void) | undefined;

  const app = required<HTMLElement>(".app-shell");
  const workspaceHost = required<HTMLElement>(".workspace-host");
  const resourceNav = required<HTMLElement>(".workspace-tabs");
  const shellView = mountEditorShellView({ app, workspaceHost, resourceNav });
  let viewportFullscreen = false;

  const center = shellView.center;
  const onConsoleOpen = () => setConsoleOpen(true);
  document.addEventListener("hyperfocus:console-open", onConsoleOpen);

  const openInput = fileInput(".json,.hfp,application/json,application/octet-stream", true);
  const assetInput = fileInput("image/*,audio/*,.json,.csv,.txt,.glb,.gltf,.fbx,.ttf,.otf", true);
  app.append(openInput, assetInput);
  const scriptTextarea = required<HTMLTextAreaElement>("#script-editor");
  const sourceSurface = mountEditorSourceSurface({
    textarea: scriptTextarea,
    status: required("#script-editor-status"),
    lineCount: required("#script-line-count"),
    save: (path, source) => persistScript(path, source),
  });

  const unsubscribe = history.subscribe(() => {
    localStorage.setItem(RECOVERY_KEY, stableProjectJson(history.project));
    bridge.applyProject(history.project);
    applyProjectPreferences(history.project);
    render();
  });

  applyProjectPreferences(history.project);
  bridge.applyProject(history.project);
  bindActions();
  render();
  void hydrateAssetPreviews(history.project, bridge.previewAsset);
  if (!localStorage.getItem(FIRST_RUN_KEY)) queueMicrotask(() => openCenter("project"));

  function onSidebarDragOver(event: DragEvent) {
    const sidebar = (event.target as Element | null)?.closest<HTMLElement>(".project-sidebar");
    if (!sidebar) return;
    event.preventDefault(); sidebar.classList.add("is-drop-target");
  }

  function onSidebarDragLeave(event: DragEvent) {
    (event.target as Element | null)?.closest<HTMLElement>(".project-sidebar")?.classList.remove("is-drop-target");
  }

  function onSidebarDrop(event: DragEvent) {
    const sidebar = (event.target as Element | null)?.closest<HTMLElement>(".project-sidebar");
    if (!sidebar) return;
    event.preventDefault();
    sidebar.classList.remove("is-drop-target");
    void importAssets([...(event.dataTransfer?.files ?? [])]);
  }

  function bindActions() {
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    document.addEventListener("keydown", onKeyDown, true);
    openInput.addEventListener("change", () => { void openProjectFiles([...(openInput.files ?? [])]); });
    assetInput.addEventListener("change", () => { void importAssets([...(assetInput.files ?? [])]); });
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
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-editor-action],[data-editor-mode],[data-center-tab],[data-project-entity],[data-project-scene],[data-script-path],[data-3d-entity]");
    if (!target) return;
    if (target.dataset.editorMode) return setMode(target.dataset.editorMode as EditorMode);
    if (target.dataset.centerTab) {
      selectedCenterTab = target.dataset.centerTab as EditorCenterTab;
      renderCenter();
      return;
    }
    if (target.dataset.projectEntity) {
      bridge.showWorkspace("stage");
      bridge.selectEntity(target.dataset.projectEntity);
      refreshSelection();
      return;
    }
    if (target.dataset.projectScene) {
      history.transact("Switch active scene", (project) => { project.activeSceneId = target.dataset.projectScene!; });
      return;
    }
    if (target.dataset.scriptPath) {
      activeScriptPath = target.dataset.scriptPath;
      bridge.showWorkspace("script");
      renderScriptWorkspace();
      return;
    }
    if (target.dataset["3dEntity"]) {
      active3DEntityId = target.dataset["3dEntity"];
      render3DWorkspace();
      return;
    }
    const action = target.dataset.editorAction;
    if (!action) return;
    if (action === "new") return openCenter("project");
    if (action === "learn") return openCenter("learn");
    if (action === "learn-stage") { closeCenter(); bridge.showWorkspace("stage"); return; }
    if (action === "learn-polish") { closeCenter(); bridge.showWorkspace("post"); return; }
    if (action === "learn-code") { closeCenter(); bridge.showWorkspace("script"); return; }
    if (action === "learn-3d") { closeCenter(); bridge.showWorkspace("scene3d"); return; }
    if (action === "open") return void openProject();
    if (action === "save") return void saveProject();
    if (action === "import-assets") return assetInput.click();
    if (action === "undo") return undo();
    if (action === "redo") return redo();
    if (action === "settings") return openCenter("settings");
    if (action === "build") return openCenter("build");
    if (action === "profile") return openCenter("profile");
    if (action === "history") return openCenter("history");
    if (action === "close-center") return closeCenter();
    if (action === "close-console") return setConsoleOpen(false);
    if (action === "toggle-sidebar") return toggleSidebar();
    if (action === "fullscreen") return toggleFullscreen();
    if (action === "create-project") return void createProjectFromForm();
    if (action === "create-template") return void createProjectFromTemplate(target.dataset.template as EditorStarterId | undefined);
    if (action === "create-scene") return createScene();
    if (action === "create-entity") return createEntity();
    if (action === "delete-entity") return deleteSelectedEntity();
    if (action === "add-component") return addComponent(target.dataset.componentType as EditorComponent["type"] | undefined);
    if (action === "toggle-component") return toggleComponent(target.dataset.componentId);
    if (action === "remove-component") return removeComponent(target.dataset.componentId);
    if (action === "open-script") return openSelectedScript(target.dataset.componentId);
    if (action === "create-script") return createScript();
    if (action === "save-script") return saveScript();
    if (action === "download-script") return downloadScript();
    if (action === "save-settings") return saveSettings();
    if (action === "download-project") return void downloadProject();
    if (action === "export-neutral") return void exportNeutralProject();
    if (action === "download-build") return void downloadBuild();
    if (action === "download-ci") return downloadCiReport();
    if (action === "capture-profile") return downloadProfile();
    if (action === "connect-remote") return connectRemote();
    if (action === "restore-recovery") return restoreRecovery();
    if (action === "clear-recovery") return clearRecovery();
  }

  function onChange(event: Event) {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (target.dataset.entityProperty) return editEntityProperty(target.dataset.entityProperty, target.value);
    if (target.dataset.componentId && target.dataset.componentKey) return editComponentValue(target);
    if (target.dataset["3dField"]) return edit3DField(target.dataset["3dField"], target.value);
  }

  function onKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
    if (event.key === "Escape" && !center.hidden) { closeCenter(); event.preventDefault(); return; }
    if (typing) return;
    if (event.code === "Space") { event.preventDefault(); event.stopPropagation(); bridge.togglePlayback(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveProject(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
    if (event.key === "F1") { event.preventDefault(); setMode("edit"); }
    if (event.key === "F6") { event.preventDefault(); setMode("play"); }
    if (event.key === "F7") { event.preventDefault(); setMode("profile"); }
    if (event.key === "F8") { event.preventDefault(); setMode("build"); }
  }

  function setMode(next: EditorMode) {
    mode = next;
    if (mode === "play") {
      bridge.showWorkspace(has3DProject(history.project) ? "scene3d" : "stage");
      const blocker = bridge.play(history.project);
      if (blocker) {
        mode = "edit";
        showError(new Error(blocker));
        announce("Play mode could not start. Resolve the reported runtime blockers.");
      } else announce("Play mode. The active scene is running.");
      if (mode === "play") closeCenter();
    } else if (mode === "profile") {
      bridge.pause();
      bridge.showWorkspace("diagnostics");
      openCenter("profile");
    } else if (mode === "build") {
      bridge.pause();
      openCenter("build");
    } else {
      bridge.pause();
      closeCenter();
      announce("Edit mode.");
    }
    renderMode();
  }

  function render() {
    const project = history.project;
    setText("#editor-project-name", project.name);
    setText("#editor-project-state", history.dirty ? "Unsaved changes" : "Saved");
    required("#editor-project-state").classList.toggle("is-dirty", history.dirty);
    required<HTMLButtonElement>("[data-editor-action='undo']").disabled = !history.canUndo;
    required<HTMLButtonElement>("[data-editor-action='redo']").disabled = !history.canRedo;
    renderProjectTree();
    renderAssets();
    renderInspector();
    renderScriptWorkspace();
    render3DWorkspace();
    renderMode();
    shellView.update({
      mode,
      centerTab: selectedCenterTab,
      sidebarCollapsed: viewportFullscreen || history.project.layout.sidebarCollapsed,
      sidebarSize: history.project.layout.sidebarWidth,
    });
    if (!center.hidden) renderCenter();
  }

  function renderProjectTree() {
    const project = history.project;
    const host = required("#project-scenes");
    host.innerHTML = project.scenes.map((scene) => `<button type="button" class="project-tree-row ${scene.id === project.activeSceneId ? "is-active" : ""}" data-project-scene="${escapeHtml(scene.id)}"><span>◇</span><span>${escapeHtml(scene.name)}</span><small>${scene.entities.length}</small></button>`).join("");
    const scene = activeScene(project);
    required("#project-entities").innerHTML = scene.entities.map((entity) => `<button type="button" class="project-tree-row" data-project-entity="${escapeHtml(entity.id)}"><span>${entity.kind === "actor" ? "◆" : entity.kind === "hostile" ? "◈" : "✦"}</span><span>${escapeHtml(entity.label)}</span><small>L${entity.layer}</small></button>`).join("");
  }

  function renderAssets() {
    const host = required("#project-assets");
    host.innerHTML = history.project.assets.map((asset) => `<div class="asset-row" draggable="true" data-project-asset="${escapeHtml(asset.id)}" title="Drag into the Stage to create an entity"><span>${asset.kind === "image" ? "▧" : asset.kind === "audio" ? "♪" : asset.mimeType.includes("gltf") ? "◇" : "{}"}</span><div><strong>${escapeHtml(asset.name)}</strong><small>${escapeHtml(asset.kind)} · ${formatBytes(asset.size)} · drag to Stage</small></div></div>`).join("") || '<p class="empty-copy">Drop images, audio, data, fonts, or glTF models here.</p>';
    host.querySelectorAll<HTMLElement>("[data-project-asset]").forEach((row) => row.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("application/x-engine-asset", row.dataset.projectAsset ?? "");
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
    }));
  }

  function renderInspector() {
    const selectedId = bridge.selectedEntityId();
    const entity = activeScene(history.project).entities.find((candidate) => candidate.id === selectedId);
    const host = required("#project-selection-inspector");
    if (!entity) {
      host.innerHTML = '<p class="empty-copy">Select an entity to inspect its components.</p>';
      return;
    }
    host.innerHTML = `<header><div><strong>${escapeHtml(entity.label)}</strong><small>${escapeHtml(entity.id)}</small></div><button type="button" data-editor-action="delete-entity" aria-label="Delete selected entity">×</button></header>
      <div class="inspector-edit-grid"><label>Name<input data-entity-property="label" value="${escapeHtml(entity.label)}"></label><label>X<input type="number" step="1" data-entity-property="x" value="${entity.x}"></label><label>Y<input type="number" step="1" data-entity-property="y" value="${entity.y}"></label><label>Width<input type="number" min="1" data-entity-property="width" value="${entity.width}"></label><label>Height<input type="number" min="1" data-entity-property="height" value="${entity.height}"></label></div>
      <div class="component-list">${entity.components.map((item) => `<details ${item.type === "behavior" ? "open" : ""}><summary><span>${escapeHtml(item.type)}</span><small>${item.enabled ? "enabled" : "disabled"}</small></summary><div class="component-editor"><div class="component-value-grid">${Object.entries(item.values).map(([key, value]) => componentValueMarkup(item.id, key, value)).join("") || '<span class="empty-copy">No properties yet.</span>'}</div><div class="component-inline-actions"><button type="button" data-editor-action="toggle-component" data-component-id="${escapeHtml(item.id)}">${item.enabled ? "Disable" : "Enable"}</button>${item.type === "behavior" ? `<button type="button" data-editor-action="open-script" data-component-id="${escapeHtml(item.id)}">Edit script</button>` : ""}<button type="button" data-editor-action="remove-component" data-component-id="${escapeHtml(item.id)}">Remove</button></div></div></details>`).join("")}</div>
      <div class="component-actions"><button type="button" data-editor-action="add-component" data-component-type="behavior">+ Behavior</button><button type="button" data-editor-action="add-component" data-component-type="collider">+ Collider</button><button type="button" data-editor-action="add-component" data-component-type="audio">+ Audio</button></div><details class="generated-code"><summary>Generated TypeScript mapping</summary><pre>${escapeHtml(generatedEntityCode(entity.id, entity.components))}</pre></details>`;
  }

  function renderScriptWorkspace() {
    const scripts = readProjectScripts(history.project);
    if (!activeScriptPath || !scripts.files.some((file) => file.path === activeScriptPath)) activeScriptPath = scripts.activePath || scripts.files[0]?.path || "";
    const file = scripts.files.find((candidate) => candidate.path === activeScriptPath);
    required("#script-file-list").innerHTML = scripts.files.map((candidate) => `<button type="button" class="${candidate.path === activeScriptPath ? "is-active" : ""}" data-script-path="${escapeHtml(candidate.path)}">${escapeHtml(candidate.path)}</button>`).join("") || '<p class="empty-copy">No scripts yet. Create one when you need custom behavior.</p>';
    sourceSurface.load(file ? { path: file.path, source: file.source } : undefined);
    setText("#script-editor-path", file?.path ?? "No script selected");
  }

  function render3DWorkspace() {
    const declaration = hyperfocus3D(history.project);
    const empty = required<HTMLElement>("#scene3d-empty");
    if (!declaration) {
      empty.hidden = false;
      required("#scene3d-entities").innerHTML = '<p class="empty-copy">This project is 2D. Create a 3D starter or open a project with a hyperfocus3D scene.</p>';
      required("#scene3d-inspector").innerHTML = '<div class="panel-title"><span>Inspector</span><span class="panel-count">2D PROJECT</span></div><div class="friendly-hint"><strong>3D is a project capability</strong><span>The 3D starter includes a WebGL2 renderer, camera, lights, physics, glTF mesh, material, controls, and save data.</span></div>';
      return;
    }
    empty.hidden = true;
    const scene = declaration.scenes.find((candidate) => candidate.id === declaration.activeSceneId) ?? declaration.scenes[0];
    if (!active3DEntityId || !scene.entities.some((entity) => entity.id === active3DEntityId)) active3DEntityId = scene.entities[0]?.id ?? "";
    required("#scene3d-entities").innerHTML = scene.entities.map((entity) => `<button type="button" class="${entity.id === active3DEntityId ? "is-active" : ""}" data-3d-entity="${escapeHtml(entity.id)}"><span>◇</span><strong>${escapeHtml(entity.id)}</strong><small>${escapeHtml(entity.materialId)}</small></button>`).join("");
    const entity = scene.entities.find((candidate) => candidate.id === active3DEntityId);
    if (!entity) return;
    required("#scene3d-inspector").innerHTML = `<div class="panel-title"><span>Inspector</span><span class="panel-count">${escapeHtml(entity.id)}</span></div><div class="inspector-form"><label>Position<div class="vector-fields">${entity.position.map((value, index) => `<input type="number" step="0.1" aria-label="Position ${"XYZ"[index]}" data-3d-field="position.${index}" value="${value}">`).join("")}</div></label><label>Rotation Y<input type="number" step="0.1" data-3d-field="rotationY" value="${entity.rotationY}"></label><label>Scale<div class="vector-fields">${entity.scale.map((value, index) => `<input type="number" min="0.01" step="0.1" aria-label="Scale ${"XYZ"[index]}" data-3d-field="scale.${index}" value="${value}">`).join("")}</div></label><label>Mesh<input value="${escapeHtml(entity.meshId)}" disabled></label><label>Material<input value="${escapeHtml(entity.materialId)}" disabled></label><div class="friendly-hint"><strong>${entity.controller ? "Playable controller attached" : entity.physics ? `${entity.physics.type} ${entity.physics.shape} physics` : "Visual object"}</strong><span>Transform edits update the preview immediately and are written to portable project data.</span></div></div>`;
  }

  function renderMode() {
    document.documentElement.dataset.editorMode = mode;
    shellView.update({ mode });
  }

  function renderCenter() {
    let centerHtml = "";
    if (selectedCenterTab === "project") centerHtml = projectCenterMarkup(history.project, Boolean(localStorage.getItem(RECOVERY_KEY)));
    if (selectedCenterTab === "learn") centerHtml = learnMarkup(history.project);
    if (selectedCenterTab === "settings") centerHtml = settingsMarkup(history.project);
    if (selectedCenterTab === "build") centerHtml = buildMarkup(history.project);
    if (selectedCenterTab === "profile") centerHtml = profileMarkup(bridge.captureProfile());
    if (selectedCenterTab === "history") centerHtml = historyMarkup(history.changes);
    shellView.update({ centerTab: selectedCenterTab, centerHtml });
  }

  function openCenter(tab: EditorCenterTab = "project") {
    selectedCenterTab = tab;
    renderCenter();
    shellView.update({ centerOpen: true });
    releaseFocusTrap?.();
    releaseFocusTrap = trapFocus(center, () => closeCenter());
    required<HTMLElement>("[data-center-tab].is-active", center).focus();
  }

  function closeCenter() {
    shellView.update({ centerOpen: false });
    localStorage.setItem(FIRST_RUN_KEY, "1");
    releaseFocusTrap?.();
    releaseFocusTrap = undefined;
    required<HTMLElement>("[data-editor-mode].is-active").focus();
  }

  function setConsoleOpen(open: boolean) {
    shellView.update({ consoleOpen: open });
  }

  function commitRuntime(label: string) {
    history.transact(label, (draft) => Object.assign(draft, bridge.captureProject(draft)));
  }

  function refreshSelection() { renderInspector(); }
  function undo() { if (history.undo()) announce("Undid the last editor change."); }
  function redo() { if (history.redo()) announce("Redid the last editor change."); }

  async function createProjectFromForm() {
    const name = required<HTMLInputElement>("#new-project-name", center).value.trim() || "Untitled Game";
    const handoff = await history.execute({ requestId: uniqueId("ui"), intent: `Create showcase project ${name}`, commands: [{ type: "project.create-starter", starter: "showcase", name }] });
    if (!handoff.ok) return showError(new Error(handoff.error ?? "Project creation failed."));
    history.markSaved();
    closeCenter();
    announce(`Created project ${name}.`);
  }

  async function createProjectFromTemplate(template?: EditorStarterId) {
    if (!template) return;
    const input = center.querySelector<HTMLInputElement>("#new-project-name");
    const defaults: Record<EditorStarterId, string> = { pong: "Neon Pong", "blank-2d": "Untitled 2D Game", "3d-action": "Starter 3D World", showcase: "Dungeon Run" };
    try {
      const name = input?.value.trim() || defaults[template];
      const handoff = await history.execute({ requestId: uniqueId("ui"), intent: `Create ${template} starter ${name}`, commands: [{ type: "project.create-starter", starter: template, name }] });
      if (!handoff.ok) throw new Error(handoff.error ?? "Starter creation failed.");
      history.markSaved();
      active3DEntityId = template === "3d-action" ? "actor" : "";
      activeScriptPath = readProjectScripts(history.project).activePath;
      closeCenter();
      bridge.showWorkspace(template === "3d-action" ? "scene3d" : "stage");
      if (template === "pong") bridge.selectEntity("player-paddle");
      announce(`Created ${history.project.name}. Press Play whenever you are ready.`);
    } catch (error) {
      showError(error);
    }
  }

  function createScene() {
    history.transact("Create scene", (project) => {
      const id = uniqueId("scene");
      project.scenes.push({ id, name: `Scene ${project.scenes.length + 1}`, entities: [] });
      project.activeSceneId = id;
    });
  }

  function selectedEntity(project: EditorProject) {
    const id = bridge.selectedEntityId();
    return id ? activeScene(project).entities.find((entity) => entity.id === id) : undefined;
  }

  function createEntity() {
    const id = uniqueId("entity");
    history.transact("Create entity", (project) => {
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
    bridge.selectEntity(id);
    bridge.showWorkspace("stage");
  }

  function deleteSelectedEntity() {
    const id = bridge.selectedEntityId();
    if (!id) return;
    history.transact("Delete entity", (project) => {
      const scene = activeScene(project);
      scene.entities = scene.entities.filter((entity) => entity.id !== id);
      for (const entity of scene.entities) if (entity.parentId === id) delete entity.parentId;
    });
  }

  function addComponent(type?: EditorComponent["type"]) {
    const id = bridge.selectedEntityId();
    if (!id || !type) return;
    history.transact(`Add ${type} component`, (project) => {
      const entity = activeScene(project).entities.find((candidate) => candidate.id === id);
      if (!entity || entity.components.some((candidate) => candidate.type === type)) return;
      const defaults: EditorComponent["values"] = type === "behavior" ? { module: "./src/behavior.ts", export: "update" } : type === "collider" ? { shape: "box", solid: true } : type === "audio" ? { asset: "", volume: 1 } : {};
      entity.components.push({ id: uniqueId(type), type, enabled: true, values: defaults });
    });
  }

  function toggleComponent(componentId?: string) {
    if (!componentId) return;
    history.transact("Toggle component", (project) => {
      const component = selectedEntity(project)?.components.find((candidate) => candidate.id === componentId);
      if (component) component.enabled = !component.enabled;
    });
  }

  function removeComponent(componentId?: string) {
    if (!componentId) return;
    history.transact("Remove component", (project) => {
      const entity = selectedEntity(project);
      if (entity) entity.components = entity.components.filter((candidate) => candidate.id !== componentId);
    });
  }

  function editEntityProperty(property: string, rawValue: string) {
    history.transact(`Edit entity ${property}`, (project) => {
      const entity = selectedEntity(project);
      if (!entity) return;
      if (property === "label") entity.label = rawValue.trim() || entity.label;
      else if (["x", "y", "width", "height"].includes(property)) {
        const value = Number(rawValue);
        if (!Number.isFinite(value)) return;
        if (property === "x" || property === "y") entity[property] = value;
        if (property === "width" || property === "height") entity[property] = Math.max(1, value);
        const transform = entity.components.find((component) => component.type === "transform");
        if (transform && (property === "x" || property === "y")) transform.values[property] = value;
      }
    });
  }

  function editComponentValue(input: HTMLInputElement | HTMLSelectElement) {
    const componentId = input.dataset.componentId;
    const key = input.dataset.componentKey;
    if (!componentId || !key) return;
    history.transact(`Edit ${key}`, (project) => {
      const component = selectedEntity(project)?.components.find((candidate) => candidate.id === componentId);
      if (!component) return;
      const previous = component.values[key];
      const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : typeof previous === "number" ? Number(input.value) : input.value;
      if (typeof value === "number" && !Number.isFinite(value)) return;
      component.values[key] = value;
    });
  }

  function createEntityFromAsset(assetId: string, point: { x: number; y: number }) {
    const asset = history.project.assets.find((candidate) => candidate.id === assetId);
    if (!asset) return;
    const id = uniqueId("entity");
    history.transact(`Create entity from ${asset.name}`, (project) => {
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
    bridge.selectEntity(id);
    bridge.showWorkspace("stage");
    announce(`Created an entity from ${asset.name}.`);
  }

  function createScript() {
    history.transact("Create TypeScript file", (project) => {
      const scripts = ensureProjectScripts(project);
      let index = scripts.files.length + 1;
      let path = `src/behavior-${index}.ts`;
      while (scripts.files.some((file) => file.path === path)) path = `src/behavior-${++index}.ts`;
      scripts.files.push({ path, language: "typescript", source: defaultScriptSource(path) });
      scripts.activePath = path;
      activeScriptPath = path;
    });
    bridge.showWorkspace("script");
  }

  function saveScript() {
    if (!activeScriptPath) return;
    void sourceSurface.save();
  }

  function persistScript(path: string, source: string) {
    if (path !== activeScriptPath) return;
    history.transact(`Save ${activeScriptPath}`, (project) => {
      const scripts = ensureProjectScripts(project);
      const file = scripts.files.find((candidate) => candidate.path === activeScriptPath);
      if (file) file.source = source;
      scripts.activePath = activeScriptPath;
    });
    setText("#script-editor-status", "Saved to project");
    announce(`Saved ${activeScriptPath}.`);
  }

  function downloadScript() {
    if (!activeScriptPath) return;
    const source = sourceSurface.text();
    download(activeScriptPath.split("/").at(-1) ?? "game.ts", source, "text/typescript;charset=utf-8");
  }

  function openSelectedScript(componentId?: string) {
    const component = selectedEntity(history.project)?.components.find((candidate) => candidate.id === componentId);
    const moduleName = typeof component?.values.module === "string" ? component.values.module : "";
    const path = moduleName.startsWith("./") ? moduleName.slice(2) : moduleName.endsWith(".ts") ? moduleName : "src/gameplay.ts";
    const scripts = readProjectScripts(history.project);
    if (!scripts.files.some((file) => file.path === path)) {
      history.transact(`Create ${path}`, (project) => {
        const draftScripts = ensureProjectScripts(project);
        draftScripts.files.push({ path, language: "typescript", source: defaultScriptSource(path) });
        draftScripts.activePath = path;
      });
    }
    activeScriptPath = path;
    bridge.showWorkspace("script");
    renderScriptWorkspace();
  }

  function edit3DField(field: string, rawValue: string) {
    const value = Number(rawValue);
    if (!Number.isFinite(value) || !active3DEntityId) return;
    history.transact(`Edit 3D ${field}`, (project) => {
      const declaration = hyperfocus3D(project);
      const entity = declaration?.scenes.find((scene) => scene.id === declaration.activeSceneId)?.entities.find((candidate) => candidate.id === active3DEntityId);
      if (!entity) return;
      if (field === "rotationY") entity.rotationY = value;
      else {
        const [group, indexText] = field.split(".");
        const index = Number(indexText);
        if ((group === "position" || group === "scale") && Number.isInteger(index) && index >= 0 && index < 3) entity[group][index] = group === "scale" ? Math.max(0.01, value) : value;
      }
    });
  }

  function saveSettings() {
    history.transact("Update project settings", (project) => {
      project.name = required<HTMLInputElement>("#setting-project-name", center).value.trim() || project.name;
      project.settings.targetProfile = required<HTMLSelectElement>("#setting-target", center).value as EditorProject["settings"]["targetProfile"];
      project.settings.locale = required<HTMLInputElement>("#setting-locale", center).value.trim() || "en-US";
      project.settings.uiScale = Number(required<HTMLInputElement>("#setting-ui-scale", center).value);
      project.settings.reducedMotion = required<HTMLInputElement>("#setting-reduced-motion", center).checked;
      project.settings.masterVolume = Number(required<HTMLInputElement>("#setting-volume", center).value);
      project.layout.sidebarWidth = Number(required<HTMLInputElement>("#setting-sidebar-width", center).value);
      const actions = [...center.querySelectorAll<HTMLInputElement>("[data-input-action]")];
      project.settings.input = actions.map((input) => ({ action: input.dataset.inputAction!, bindings: input.value.split(",").map((value) => value.trim()).filter(Boolean) }));
    });
    announce("Project settings saved.");
  }

  async function openProject() {
    const picker = (globalThis as unknown as { showDirectoryPicker?: (options: unknown) => Promise<DirectoryHandle> }).showDirectoryPicker;
    if (!picker) { openInput.click(); return; }
    try {
      const root = await picker({ id: "hyperfocus-open-project", mode: "read" });
      const directory = root.name === HYPERFOCUS_DIRECTORY ? root : await root.getDirectoryHandle(HYPERFOCUS_DIRECTORY);
      const projectFile = await (await directory.getFileHandle(HYPERFOCUS_PROJECT_FILENAME)).getFile();
      const assetsFile = await (await directory.getFileHandle(HYPERFOCUS_ASSETS_FILENAME)).getFile();
      await openProjectFiles([projectFile, assetsFile]);
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") showError(error);
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
    commitRuntime("Synchronize runtime before save");
    const picker = (globalThis as unknown as { showDirectoryPicker?: (options: unknown) => Promise<DirectoryHandle> }).showDirectoryPicker;
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
        if ((error as DOMException).name === "AbortError") return;
        showError(error);
        return;
      }
    }
    await downloadProject();
  }

  async function downloadProject() {
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
      const picker = (globalThis as unknown as {
        showDirectoryPicker?: (options: unknown) => Promise<NeutralDirectoryHandle>;
      }).showDirectoryPicker;
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
      if ((error as DOMException).name === "AbortError") return;
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
        await storeAssetBlob(id, file);
        bridge.previewAsset(id, file);
        imported.push({ id, name: file.name, kind, mimeType: file.type || "application/octet-stream", size: file.size, lastModified: file.lastModified, source: "imported" });
      }
      history.transact(`Import ${files.length} asset${files.length === 1 ? "" : "s"}`, (project) => { project.assets.push(...imported); });
      announce(`Imported ${files.length} asset${files.length === 1 ? "" : "s"}.`);
    } catch (error) {
      showError(error);
    } finally {
      assetInput.value = "";
    }
  }

  async function downloadBuild() {
    commitRuntime("Synchronize runtime before build");
    try {
      const project = history.project;
      const importedIds = project.assets.filter((asset) => asset.source === "imported").map((asset) => asset.id);
      const blobs = await readAssetBlobs(importedIds);
      const preflight = await collectPlayableBuildAssets(project, async (id) => blobs.get(id));
      if (!preflight.ok) {
        const blockers = preflight.diagnostics.filter((item) => item.severity === "error").map((item) => `• ${item.message}`);
        throw new Error(`Standalone build blocked:\n${blockers.join("\n")}`);
      }
      const files = await createEditorPortableFiles(project, async (id) => blobs.get(id));
      const html = createStandalonePlayableHtml({ project, ...files });
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
    history.transact("Toggle project sidebar", (project) => { project.layout.sidebarCollapsed = !project.layout.sidebarCollapsed; });
  }

  function toggleFullscreen() {
    viewportFullscreen = !viewportFullscreen;
    shellView.update({ sidebarCollapsed: viewportFullscreen || history.project.layout.sidebarCollapsed });
    announce(viewportFullscreen ? "Viewport fullscreen enabled." : "Viewport fullscreen disabled.");
  }

  function restoreRecovery() {
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
    unsubscribe();
    releaseFocusTrap?.();
    remoteSocket?.close();
    document.removeEventListener("click", onClick);
    document.removeEventListener("change", onChange);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("dragover", onSidebarDragOver);
    document.removeEventListener("dragleave", onSidebarDragLeave);
    document.removeEventListener("drop", onSidebarDrop);
    document.removeEventListener("hyperfocus:console-open", onConsoleOpen);
    sourceSurface.dispose();
    shellView.dispose();
  }

  return {
    get project() { return history.project; },
    commands: history,
    commitRuntime,
    refreshSelection,
    undo,
    redo,
    openCenter,
    destroy,
  };
}

function projectCenterMarkup(project: EditorProject, hasRecovery: boolean) {
  return `<div class="starter-home"><div class="starter-hero"><div><span class="center-eyebrow">START WITH A WORKING GAME</span><h2>What do you want to make?</h2><p>Every starter opens playable, editable, and buildable. Start simple, then move into code, animation, audio, FX, profiling, and production tools only when you need them.</p></div><div class="starter-name"><label>Project name<input id="new-project-name" value="My Game" autocomplete="off"></label></div></div><div class="starter-grid">
    <article class="starter-card" style="--starter-color:#43d8d1"><span class="starter-icon">◫</span><h3>Pong in five minutes</h3><p>A complete two-player-style arcade loop with paddle controls, CPU opponent, collision, polish, and one-click browser build.</p><ul><li>Playable immediately</li><li>W/S or arrow controls</li><li>Guided polish checklist</li></ul><button type="button" data-editor-action="create-template" data-template="pong">Create playable Pong</button></article>
    <article class="starter-card" style="--starter-color:#7f9dff"><span class="starter-icon">◇</span><h3>3D action starter</h3><p>A lit WebGL2 scene with glTF geometry, materials, camera follow, WASD movement, physics, budgets, and saves.</p><ul><li>Real 3D viewport</li><li>Editable transforms</li><li>Offline playable build</li></ul><button type="button" data-editor-action="create-template" data-template="3d-action">Create 3D world</button></article>
    <article class="starter-card" style="--starter-color:#b99aff"><span class="starter-icon">＋</span><h3>Blank 2D</h3><p>A clean scene for experienced designers who want the editor structure without demo content.</p><ul><li>Empty stage</li><li>Tilemap and code ready</li><li>No sample clutter</li></ul><button type="button" data-editor-action="create-template" data-template="blank-2d">Create blank project</button></article>
    <article class="starter-card" style="--starter-color:#f2ad4d"><span class="starter-icon">✦</span><h3>Production showcase</h3><p>The complete sample with animation, atlas, FX, audio, logic, rigging, review, and diagnostics.</p><ul><li>Advanced tools populated</li><li>Performance telemetry</li><li>Production Lab</li></ul><button type="button" data-editor-action="create-template" data-template="showcase">Open advanced sample</button></article>
    </div><div class="starter-footer"><p><strong>${escapeHtml(project.name)}</strong> is currently open · ${project.scenes.reduce((sum, scene) => sum + scene.entities.length, 0)} entities · ${project.assets.length} assets${hasRecovery ? " · local recovery available" : ""}</p><div class="button-row"><button type="button" data-editor-action="open">Open existing project</button><button type="button" data-editor-action="download-project">Save portable files</button><button type="button" data-editor-action="export-neutral">Export ordinary files</button><button type="button" data-editor-action="close-center">Continue editing</button></div></div></div>`;
}

function learnMarkup(project: EditorProject) {
  const pong = starterTemplate(project) === "pong";
  return `<div class="learn-layout"><section class="learning-path"><header><span class="center-eyebrow">${pong ? "YOUR PONG HAPPY PATH" : "FIRST GAME HAPPY PATH"}</span><h2>From starter to a game you can share</h2><p>Follow these in order. Each step takes you directly to the editor that does the work.</p></header><div class="learning-steps">
    <div class="learning-step"><span>1</span><div><strong>Play the game</strong><small>Verify the core loop before changing it. Pong: W/S or arrow keys.</small></div><button type="button" data-editor-mode="play">Play now</button></div>
    <div class="learning-step"><span>2</span><div><strong>Edit the feel</strong><small>Select a paddle or ball, then tune speed and dimensions in Components.</small></div><button type="button" data-editor-action="learn-stage">Open Stage</button></div>
    <div class="learning-step"><span>3</span><div><strong>Bring in your art and sound</strong><small>Drop files onto Assets, then drag images into the Stage.</small></div><button type="button" data-editor-action="import-assets">Import assets</button></div>
    <div class="learning-step"><span>4</span><div><strong>Add juice</strong><small>Use Post FX, Sequence, audio, camera shake, and animation without touching the game loop.</small></div><button type="button" data-editor-action="learn-polish">Open Polish</button></div>
    <div class="learning-step"><span>5</span><div><strong>Build and share</strong><small>Run pre-flight, then download one offline HTML file.</small></div><button type="button" data-editor-action="build">Build game</button></div>
    </div></section><aside class="learning-sidebar"><section><h3>Need to edit code?</h3><p>Open Code for project TypeScript. Built-ins remain one-click buildable; custom modules use the CLI bundler.</p><button type="button" data-editor-action="learn-code">Open Code workspace</button></section><section><h3>Making a 3D game?</h3><p>The 3D workspace exposes scene objects, transforms, camera, materials, lights, physics, and a playable WebGL2 preview.</p><button type="button" data-editor-action="learn-3d">Open 3D workspace</button></section><section><h3>Advanced production</h3><p>Sequence, audio-reactive bindings, MIDI, logic graphs, sprite rigs, profiling, review pins, and export remain available after the core game works.</p></section></aside></div>`;
}

function settingsMarkup(project: EditorProject) {
  return `<div class="settings-grid"><section><span class="center-eyebrow">PROJECT &amp; DEVICE</span><label>Project name<input id="setting-project-name" value="${escapeHtml(project.name)}"></label><label>Target profile<select id="setting-target"><option value="desktop" ${project.settings.targetProfile === "desktop" ? "selected" : ""}>Desktop browser</option><option value="mobile" ${project.settings.targetProfile === "mobile" ? "selected" : ""}>Mobile browser</option><option value="low-power" ${project.settings.targetProfile === "low-power" ? "selected" : ""}>Low-power device</option></select></label><label>Default locale<input id="setting-locale" value="${escapeHtml(project.settings.locale)}"></label><label>Editor UI scale <output>${project.settings.uiScale.toFixed(2)}×</output><input id="setting-ui-scale" type="range" min="0.9" max="1.5" step="0.05" value="${project.settings.uiScale}"></label><label>Project browser width<input id="setting-sidebar-width" type="range" min="220" max="380" step="4" value="${project.layout.sidebarWidth}"></label><label class="check-label"><input id="setting-reduced-motion" type="checkbox" ${project.settings.reducedMotion ? "checked" : ""}> Reduce editor motion</label><label>Master audio volume <output>${Math.round(project.settings.masterVolume * 100)}%</output><input id="setting-volume" type="range" min="0" max="1" step="0.05" value="${project.settings.masterVolume}"></label></section><section><span class="center-eyebrow">INPUT MAP</span><p>Bindings remain explicit project data and can be diffed or generated into game code.</p>${project.settings.input.map((mapping) => `<label>${escapeHtml(mapping.action)}<input data-input-action="${escapeHtml(mapping.action)}" value="${escapeHtml(mapping.bindings.join(", "))}"></label>`).join("")}<button class="primary-button" type="button" data-editor-action="save-settings">Save settings</button></section></div>`;
}

function buildMarkup(project: EditorProject) {
  const validation = validateForBuild(project);
  const blocked = validation.some((item) => item.blocking && !item.ok);
  return `<div class="build-layout"><section><span class="center-eyebrow">WEB BUILD</span><h2>Build ${escapeHtml(project.name)}</h2><p>Build emits one offline HTML file containing the verified portable project pair and the first-party fixed-step 2D runtime. Custom TypeScript stays as ordinary source; bundle it with <code>bun run build:game -- --project &lt;directory&gt;</code>.</p><div class="build-target"><strong>${escapeHtml(project.settings.targetProfile)}</strong><span>${project.settings.targetProfile === "desktop" ? "60 Hz · keyboard/gamepad · 16.67 ms frame" : project.settings.targetProfile === "mobile" ? "touch/safe-area · 30/60 Hz · constrained FX" : "30 Hz · reduced motion · 8 MB asset guidance"}</span></div><button class="primary-button" type="button" data-editor-action="download-build" ${blocked ? "disabled" : ""}>${blocked ? "Use CLI for custom modules" : "Build offline HTML"}</button><button type="button" data-editor-action="download-ci">Export CI build report</button><button type="button" data-editor-action="export-neutral">Export ordinary files for another engine</button></section><section><span class="center-eyebrow">PRE-FLIGHT</span><div class="validation-list">${validation.map((item) => `<div class="${item.ok ? "is-pass" : "is-warning"}"><span>${item.ok ? "✓" : item.blocking ? "×" : "!"}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small></div></div>`).join("")}</div><pre>bun run build:game -- --project &lt;directory&gt;\nbun run verify:editor\nbun run verify:system:editor</pre></section></div>`;
}

function profileMarkup(profile: Record<string, unknown>) {
  return `<div class="profile-layout"><section><span class="center-eyebrow">LOCAL CAPTURE</span><h2>Reproducible runtime evidence</h2><p>Capture frame timing, render work, entity counts, backend selection, and current target profile as CI-readable JSON.</p><pre>${escapeHtml(JSON.stringify(profile, null, 2))}</pre><button class="primary-button" type="button" data-editor-action="capture-profile">Download profile capture</button></section><section><span class="center-eyebrow">REMOTE RUNTIME</span><h2>Attach to a development endpoint</h2><p>Connect to a game or server WebSocket to route its diagnostic messages into the packet console.</p><label>WebSocket URL<input id="remote-runtime-url" value="ws://127.0.0.1:8797/diagnostics"></label><div class="button-row"><button type="button" data-editor-action="connect-remote">Connect</button><output id="remote-runtime-state">Disconnected</output></div><p class="privacy-note">Connections are explicit and project-local. The editor does not transmit project data automatically.</p></section></div>`;
}

function historyMarkup(changes: Array<{ label: string; at: string }>) {
  return `<div class="history-layout"><section><span class="center-eyebrow">CHANGE HISTORY</span><h2>Recoverable editor operations</h2><p>Undo and redo use complete versioned project snapshots. Portable exports contain canonical, diffable project JSON plus one compressed asset pack.</p><div class="button-row"><button type="button" data-editor-action="undo">Undo</button><button type="button" data-editor-action="redo">Redo</button><button type="button" data-editor-action="download-project">Export two files</button></div></section><section class="history-list">${changes.map((change) => `<div><span>◇</span><strong>${escapeHtml(change.label)}</strong><time>${new Date(change.at).toLocaleTimeString()}</time></div>`).join("") || '<p class="empty-copy">Changes will appear here.</p>'}</section></div>`;
}

function activeScene(project: EditorProject) {
  return project.scenes.find((scene) => scene.id === project.activeSceneId) ?? project.scenes[0];
}

function componentValueMarkup(componentId: string, key: string, value: string | number | boolean) {
  if (typeof value === "boolean") return `<label><span>${escapeHtml(key)}</span><input type="checkbox" data-component-id="${escapeHtml(componentId)}" data-component-key="${escapeHtml(key)}" ${value ? "checked" : ""}></label>`;
  return `<label><span>${escapeHtml(key)}</span><input ${typeof value === "number" ? 'type="number" step="any"' : ""} data-component-id="${escapeHtml(componentId)}" data-component-key="${escapeHtml(key)}" value="${escapeHtml(String(value))}"></label>`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

function defaultScriptSource(path: string) {
  return `import type { PlayableBehavior2D } from "@hyperfocus/engine/project/runtime-2d";\n\n// ${path}\nexport const update: PlayableBehavior2D = ({ actions, component }) => ({\n  velocityX: actions.includes("move-right") ? Number(component.values.speed ?? 180) : 0,\n  velocityY: 0,\n});\n`;
}

function hyperfocus3D(project: EditorProject): Editor3DDeclaration | undefined {
  const value = project.extensions?.hyperfocus3D;
  if (!isObject(value) || typeof value.activeSceneId !== "string" || !Array.isArray(value.scenes)) return undefined;
  return value as unknown as Editor3DDeclaration;
}

function has3DProject(project: EditorProject) {
  return Boolean(hyperfocus3D(project));
}

function starterTemplate(project: EditorProject) {
  const value = project.extensions?.hyperfocusStarter;
  return isObject(value) && typeof value.template === "string" ? value.template : "";
}

function readRecovery() {
  const value = localStorage.getItem(RECOVERY_KEY);
  if (!value) return undefined;
  try { return migrateProject(JSON.parse(value)); } catch { return undefined; }
}

function applyProjectPreferences(project: EditorProject) {
  document.documentElement.style.setProperty("--editor-ui-scale", String(project.settings.uiScale));
  document.documentElement.style.setProperty("--project-sidebar-width", `${project.layout.sidebarWidth}px`);
  document.documentElement.classList.toggle("reduce-motion", project.settings.reducedMotion);
  document.documentElement.classList.toggle("sidebar-collapsed", project.layout.sidebarCollapsed);
}

function validateForBuild(project: EditorProject) {
  const entityCount = project.scenes.reduce((sum, scene) => sum + scene.entities.length, 0);
  const components = project.scenes.flatMap((scene) => scene.entities.flatMap((entity) => entity.components.filter((component) => component.enabled)));
  const behaviorCount = components.filter((component) => component.type === "behavior").length;
  const builtins = new Set(["builtin:player", "builtin:patrol", "builtin:navigate", "builtin:platformer", "builtin:pong-paddle", "builtin:pong-ai", "builtin:pong-ball"]);
  const unsupportedBehaviors = components.filter((component) => component.type === "behavior" && !builtins.has(String(component.values.module)));
  const unsupportedColliders = components.filter((component) => component.type === "collider" && component.values.shape !== undefined && component.values.shape !== "box" && component.values.shape !== "aabb");
  const unsupportedAudio = components.filter((component) => component.type === "audio" && component.values.autoplay !== true && component.values.trigger !== "start" && !(typeof component.values.trigger === "string" && /^action:[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(component.values.trigger)));
  const unsupportedEffects = project.postProcessing.effects.filter((effect) => effect.enabled && !["grayscale", "sepia", "crt", "shake"].includes(effect.id));
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
  return [
    { ok: project.scenes.length > 0, blocking: true, label: "Playable scene", detail: `${project.scenes.length} scene${project.scenes.length === 1 ? "" : "s"}` },
    { ok: entityCount > 0, blocking: false, label: "Scene entities", detail: entityCount ? `${entityCount} entity records` : "The build will contain an empty scene" },
    { ok: unsupportedBehaviors.length === 0, blocking: true, label: "Executable behaviors", detail: unsupportedBehaviors.length ? `${unsupportedBehaviors.length} custom or unknown module${unsupportedBehaviors.length === 1 ? "" : "s"} require the CLI bundling lane` : `${behaviorCount} built-in behavior component${behaviorCount === 1 ? "" : "s"}; input components run directly` },
    { ok: unsupportedColliders.length === 0, blocking: true, label: "Collider shapes", detail: unsupportedColliders.length ? `${unsupportedColliders.length} collider${unsupportedColliders.length === 1 ? "" : "s"} use unsupported shapes` : "AABB/box collision is runtime-backed" },
    { ok: !platformerError, blocking: true, label: "Platformer controllers", detail: platformerError || "Gravity, buffered/coyote jumps, and swept collision pass runtime preflight" },
    { ok: !saveError, blocking: true, label: "Save profile policy", detail: saveError || "Checksummed browser saves are bounded and kept outside the portable project pair" },
    { ok: !storyError, blocking: true, label: "Story graphs", detail: storyError || "Localization, dialogue choices, and quest references pass bounded runtime preflight" },
    { ok: navigationErrors.length === 0, blocking: true, label: "Navigation routes", detail: navigationErrors.length ? navigationErrors.join(" ") : "Built-in navigation routes pass bounded A* preflight" },
    { ok: unsupportedAudio.length === 0, blocking: true, label: "Audio triggers", detail: unsupportedAudio.length ? `${unsupportedAudio.length} audio component${unsupportedAudio.length === 1 ? "" : "s"} need autoplay, trigger=start, or trigger=action:<name>` : "Start and rising-edge action audio use the first-party Web Audio runtime" },
    { ok: unsupportedEffects.length === 0, blocking: true, label: "Post effects", detail: unsupportedEffects.length ? `Unsupported enabled effects: ${unsupportedEffects.map((effect) => effect.id).join(", ")}` : "Enabled effects are supported by the standalone renderer" },
    { ok: project.tilemap.values.length === project.tilemap.columns * project.tilemap.rows, blocking: true, label: "Tilemap data", detail: `${project.tilemap.columns} × ${project.tilemap.rows} validated` },
    { ok: importedAssets.length > 0, blocking: false, label: "Owned assets", detail: importedAssets.length ? `${importedAssets.length} imported assets will be verified and embedded` : "Procedural color shapes are valid; no binary assets are required" },
  ];
}

function generatedEntityCode(id: string, components: EditorComponent[]) {
  const behavior = components.find((component) => component.type === "behavior");
  const collider = components.find((component) => component.type === "collider");
  return [`const entity = scene.entity(${JSON.stringify(id)})`, behavior ? `entity.behavior(${JSON.stringify(behavior.values.module)}, ${JSON.stringify(behavior.values.export)})` : "// Add a behavior component", collider ? `entity.collider(${JSON.stringify(collider.values)})` : "// Collider is optional"].join("\n");
}

function assetKind(file: File): EditorAsset["kind"] {
  if (file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(file.name)) return "image";
  if (file.type.startsWith("audio/") || /\.(wav|mp3|ogg|m4a|aac|flac)$/i.test(file.name)) return "audio";
  if (/\.(json|csv|txt)$/i.test(file.name)) return "data";
  if (file.type.startsWith("font/") || /\.(ttf|otf|woff2?)$/i.test(file.name)) return "font";
  return "unknown";
}

async function storeAssetBlob(id: string, blob: Blob) {
  await storeAssetRecords([{ id, blob }]);
}

async function hydrateAssetPreviews(project: EditorProject, preview: EditorShellBridge["previewAsset"]) {
  const ids = project.assets.filter((asset) => asset.source === "imported" && asset.kind === "image").map((asset) => asset.id);
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

type WritableFile = {
  write(value: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
};

type FileHandle = {
  getFile(): Promise<File>;
  createWritable(): Promise<WritableFile>;
};

type DirectoryHandle = {
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
};

async function writeDirectoryFile(directory: DirectoryHandle, name: string, bytes: Uint8Array) {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(new Uint8Array(bytes));
    await writable.close();
  } catch (error) {
    await writable.abort?.();
    throw error;
  }
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

function trapFocus(root: HTMLElement, onEscape: () => void) {
  const handler = (event: KeyboardEvent) => {
    if (event.key === "Escape") { onEscape(); return; }
    if (event.key !== "Tab") return;
    const items = [...root.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { last.focus(); event.preventDefault(); }
    else if (!event.shiftKey && document.activeElement === last) { first.focus(); event.preventDefault(); }
  };
  root.addEventListener("keydown", handler);
  return () => root.removeEventListener("keydown", handler);
}

function fileInput(accept: string, multiple: boolean) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.multiple = multiple;
  input.hidden = true;
  return input;
}

function download(name: string, value: string | Uint8Array, type: string) {
  const contents = typeof value === "string" ? value : new Uint8Array(value);
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function appendConsole(message: string) {
  const output = required("#editor-console-output");
  const row = document.createElement("div");
  row.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  output.prepend(row);
}

function showError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  appendConsole(`✕ ${message}`);
  document.dispatchEvent(new CustomEvent("hyperfocus:console-open"));
  announce(message, "error");
}

function announce(message: string, tone: "status" | "error" = "status") {
  let live = document.querySelector<HTMLElement>("#editor-announcer");
  if (!live) {
    live = document.createElement("div");
    live.id = "editor-announcer";
    live.className = "sr-only";
    live.setAttribute("aria-live", "polite");
    document.body.append(live);
  }
  live.textContent = message;
  let toast = document.querySelector<HTMLElement>("#editor-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "editor-toast";
    toast.setAttribute("role", "status");
    document.body.append(toast);
  }
  toast.className = `editor-toast is-visible ${tone === "error" ? "is-error" : ""}`;
  toast.textContent = message;
  const state = announce as unknown as { timer?: number };
  if (state.timer !== undefined) clearTimeout(state.timer);
  state.timer = window.setTimeout(() => toast?.classList.remove("is-visible"), 3_200);
}

function required<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Editor shell is missing ${selector}`);
  return element;
}

function setText(selector: string, value: string) { required(selector).textContent = value; }
function slug(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "game"; }
function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 / 1024).toFixed(1)} MB`; }
function escapeHtml(value: unknown) { return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!); }
