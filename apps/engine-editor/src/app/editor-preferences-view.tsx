import { For } from "solid-js";
import { createContext, useContext } from "solid-js";
const InputMapEditorControls = createContext<{
  project: EditorProject;
  mappings: () => EditorProject["settings"]["input"];
  onChange: (mappings: EditorProject["settings"]["input"]) => void;
}>();
import { PreferencesSurface, normalizePreferenceValues, type PreferenceDefinition, type PreferenceSectionDefinition, type PreferenceValues } from "@hyperfocus/ui/preferences";
import { createSignal, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import { applyEditorUiPreferences, defaultEditorUiPreferences, normalizeEditorUiPreferences, type EditorUiPreferences, type WorkspacePanelLayout } from "./editor-preferences";
import type { EditorProject } from "@hyperfocus/engine/project";
import { addEditorInputAction, addEditorInputBinding, editorInputConflicts, gamepadBinding, keyboardEventBinding, removeEditorInputAction, removeEditorInputBinding, renameEditorInputAction } from "../editor-input-model";

export type EditorProjectPreferenceDraft = {
  name: string;
  targetProfile: EditorProject["settings"]["targetProfile"];
  locale: string;
  reducedMotion: boolean;
  masterVolume: number;
  input: EditorProject["settings"]["input"];
};

const sections: readonly PreferenceSectionDefinition[] = [
  { id: "hyperfocus", title: "Hyperfocus", description: "Appearance and accessibility shared by first-party apps." },
  { id: "editor", title: "Editor", description: "Workspace behavior stored for this editor." },
  { id: "project", title: "Project & device", description: "Portable settings that travel with the game." },
];

export type EditorPreferencesViewProps = {
  project: EditorProject;
  uiPreferences: EditorUiPreferences;
  onSave: (project: EditorProjectPreferenceDraft, ui: EditorUiPreferences) => void;
};

export function mountEditorPreferencesView(options: EditorPreferencesViewProps & { host: HTMLElement }) {
  return render(() => <EditorPreferencesView {...options} />, options.host);
}

const EditorPreferenceControls = createContext<EditorPreferencesViewProps>();
export function EditorPreferencesView(options: EditorPreferencesViewProps) { return <EditorPreferenceControls.Provider value={options}><EditorPreferencesContent /></EditorPreferenceControls.Provider>; }
function EditorPreferencesContent() {
  const controls = useContext(EditorPreferenceControls); if (!controls) throw new Error("Missing editor preferences");
  const definitions = createDefinitions(controls.project);
  const initial = createValues(controls.project, controls.uiPreferences);
  let persistedUi = controls.uiPreferences;
  const [values, setValues] = createSignal<PreferenceValues>(normalizePreferenceValues(definitions, initial));
  const [input, setInput] = createSignal(structuredClone(controls.project.settings.input));
  const previewUi = () => applyEditorUiPreferences(createUiPreferences(values(), controls.uiPreferences));
  onCleanup(() => applyEditorUiPreferences(persistedUi));

  return (
    <div class="editor-preferences-composite">
      <InputMapEditor project={controls.project} mappings={input} onChange={setInput} />
      <PreferencesSurface
        title="Settings"
        sections={sections}
        definitions={definitions}
        values={values()}
        onChange={(id, value) => {
          setValues((current) => ({ ...current, [id]: value }));
          if (id.startsWith("shared.") || id.startsWith("editor.")) queueMicrotask(previewUi);
        }}
        onReset={() => {
          setValues((current) => ({
            ...current,
            "shared.theme": defaultEditorUiPreferences.shared.theme,
            "shared.density": defaultEditorUiPreferences.shared.density,
            "shared.uiScale": defaultEditorUiPreferences.shared.uiScale,
            "shared.reducedMotion": defaultEditorUiPreferences.shared.reducedMotion,
            "shared.numericAlignment": defaultEditorUiPreferences.shared.numericAlignment,
            "editor.sidebarSize": defaultEditorUiPreferences.app.workbench.sidebarSize,
            "editor.inspectorSize": defaultEditorUiPreferences.app.workbench.inspectorSize,
            "editor.projectBrowserVisible": !defaultEditorUiPreferences.app.workbench.sidebarCollapsed,
            "editor.inspectorVisible": !defaultEditorUiPreferences.app.workbench.inspectorCollapsed,
            "editor.defaultWorkspace": defaultEditorUiPreferences.app.defaultWorkspace,
            "editor.narrowPane": defaultEditorUiPreferences.app.narrowPane,
            "editor.stageHierarchyVisible": false,
            "editor.stageToolsVisible": false,
            "editor.aiHarnessEndpoint": defaultEditorUiPreferences.app.aiHarnessEndpoint,
            "editor.aiAgent": defaultEditorUiPreferences.app.aiAgent,
          }));
          setInput(structuredClone(controls.project.settings.input));
          queueMicrotask(previewUi);
        }}
        onSave={() => {
          const ui = createUiPreferences(values(), controls.uiPreferences);
          persistedUi = ui;
          applyEditorUiPreferences(ui);
          controls.onSave(createProjectPreferences(values(), controls.project, input()), ui);
        }}
        saveLabel="Save settings"
      />
    </div>
  );
}
function InputMapEditor(props: {
  project: EditorProject;
  mappings: () => EditorProject["settings"]["input"];
  onChange: (mappings: EditorProject["settings"]["input"]) => void;
}) { return <InputMapEditorControls.Provider value={props}><InputMapEditorContent /></InputMapEditorControls.Provider>; }
function InputMapEditorContent() { const controls = useContext(InputMapEditorControls); if (!controls) throw new Error("Missing InputMapEditor controls");

  const [newAction, setNewAction] = createSignal("");
  const [capturing, setCapturing] = createSignal<string>();
  const [error, setError] = createSignal("");
  const conflicts = () => {
    const draft = inputDraft(controls.project, controls.mappings());
    return editorInputConflicts(draft);
  };
  const update = (mutate: (draft: EditorProject) => void) => {
    try {
      const draft = inputDraft(controls.project, controls.mappings());
      mutate(draft);
      controls.onChange(structuredClone(draft.settings.input));
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const onCapture = (event: KeyboardEvent) => {
    const action = capturing();
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") { setCapturing(undefined); return; }
    try {
      const binding = keyboardEventBinding(event);
      update((draft) => { addEditorInputBinding(draft, action, binding); });
      setCapturing(undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  window.addEventListener("keydown", onCapture, true);
  onCleanup(() => window.removeEventListener("keydown", onCapture, true));

  return <section class="input-map-editor" aria-labelledby="input-map-title">
    <header><div><span>PROJECT INPUT</span><h2 id="input-map-title">Input map</h2><p>Actions and bindings travel with the game. Changes join project undo history only after Save settings.</p></div><small>{controls.mappings().length} action{controls.mappings().length === 1 ? "" : "s"}</small></header>
    <div class="input-action-list">{<For each={controls.mappings()}>{(mapping) => {
      const actionConflicts = () => conflicts().filter((conflict) => conflict.actions.includes(mapping.action));
      return <article class="input-action-card">
        <header><strong>{mapping.action}</strong><div><button type="button" onClick={() => {
          const name = globalThis.prompt?.("Rename input action", mapping.action)?.trim();
          if (name && name !== mapping.action) update((draft) => { renameEditorInputAction(draft, mapping.action, name); });
        }}>Rename</button><button type="button" class="is-danger" onClick={() => update((draft) => removeEditorInputAction(draft, mapping.action))}>Remove</button></div></header>
        <div class="input-binding-chips">{<For each={mapping.bindings}>{(binding) => <span classList={{ "has-conflict": actionConflicts().some((conflict) => conflict.binding === binding) }}><code>{binding}</code><button type="button" aria-label={`Remove ${binding} from ${mapping.action}`} onClick={() => update((draft) => removeEditorInputBinding(draft, mapping.action, binding))}>×</button></span>}</For>}</div>
        <div class="input-binding-tools">
          <button type="button" aria-pressed={capturing() === mapping.action} onClick={() => setCapturing(capturing() === mapping.action ? undefined : mapping.action)}>{capturing() === mapping.action ? "Press a key · Esc cancels" : "Capture keyboard key"}</button>
          <label><span>Binding name</span><input data-binding-name placeholder="KeyW or Gamepad0.Button0" /></label><button type="button" onClick={(event) => {
            const input = event.currentTarget.closest(".input-binding-tools")?.querySelector<HTMLInputElement>("[data-binding-name]");
            if (input?.value.trim()) { update((draft) => addEditorInputBinding(draft, mapping.action, input.value)); input.value = ""; }
          }}>Add binding</button>
          <div class="gamepad-binding"><label>Gamepad <input type="number" min="0" max="15" value="0" data-gamepad-index /></label><label>Button <input type="number" min="0" max="255" value="0" data-gamepad-button /></label><button type="button" onClick={(event) => {
            const row = event.currentTarget.closest(".gamepad-binding");
            const gamepad = Number(row?.querySelector<HTMLInputElement>("[data-gamepad-index]")?.value ?? 0);
            const button = Number(row?.querySelector<HTMLInputElement>("[data-gamepad-button]")?.value ?? 0);
            try { const binding = gamepadBinding(gamepad, button); update((draft) => addEditorInputBinding(draft, mapping.action, binding)); }
            catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
          }}>Add gamepad</button></div>
        </div>
        {actionConflicts().length > 0 && <p class="input-conflict" role="status">Shared binding: {actionConflicts().map((conflict) => `${conflict.binding} → ${conflict.actions.join(", ")}`).join("; ")}</p>}
      </article>;
    }}</For>}</div>
    <form class="input-add-action" onSubmit={(event) => { event.preventDefault(); const action = newAction(); if (!action.trim()) return; update((draft) => addEditorInputAction(draft, action)); setNewAction(""); }}><label><span>New action</span><input value={newAction()} placeholder="dash" onInput={(event) => setNewAction(event.currentTarget.value)} /></label><button type="submit">Add action</button></form>
    <p class="input-map-error" role="alert" aria-live="assertive" hidden={!error()}>{error()}</p>
  </section>;

}

function inputDraft(project: EditorProject, mappings: EditorProject["settings"]["input"]): EditorProject {
  const draft = structuredClone(project);
  draft.settings.input = structuredClone(mappings);
  return draft;
}

function createDefinitions(project: EditorProject): PreferenceDefinition[] {
  return [
    { id: "shared.theme", sectionId: "hyperfocus", scope: "shared-user", title: "Theme", description: "Use the same light, dark, or system appearance across Hyperfocus apps.", keywords: ["appearance", "color"], control: { kind: "segmented", options: [{ value: "system", label: "System" }, { value: "dark", label: "Dark" }, { value: "light", label: "Light" }] }, defaultValue: "dark" },
    { id: "shared.density", sectionId: "hyperfocus", scope: "shared-user", title: "Interface density", description: "Comfortable spacing favors clarity; compact spacing fits more editor data.", keywords: ["spacing", "compact"], control: { kind: "segmented", options: [{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }] }, defaultValue: "comfortable" },
    { id: "shared.uiScale", sectionId: "hyperfocus", scope: "shared-user", title: "UI scale", description: "Scale labels and dense application controls without changing game rendering.", keywords: ["zoom", "text", "accessibility"], control: { kind: "range", minimum: 0.9, maximum: 1.5, step: 0.05, unit: "×" }, defaultValue: 1 },
    { id: "shared.reducedMotion", sectionId: "hyperfocus", scope: "shared-user", title: "Reduce application motion", description: "Minimize decorative application transitions and animation.", keywords: ["accessibility", "animation"], control: { kind: "toggle" }, defaultValue: false },
    { id: "shared.numericAlignment", sectionId: "hyperfocus", scope: "shared-user", title: "Align numeric data", description: "Use tabular numerals so changing measurements and counts remain easy to scan.", keywords: ["numbers", "tabular"], control: { kind: "segmented", options: [{ value: "tabular", label: "Aligned" }, { value: "natural", label: "Natural" }] }, defaultValue: "tabular" },
    { id: "editor.sidebarSize", sectionId: "editor", scope: "app-user", title: "Project browser width", description: "Default width of the resizable project browser. Dragging its separator updates this value.", keywords: ["layout", "sidebar", "panel"], control: { kind: "range", minimum: 180, maximum: 640, step: 10, unit: "px" }, defaultValue: 280 },
    { id: "editor.inspectorSize", sectionId: "editor", scope: "app-user", title: "Inspector width", description: "Width of the contextual inspector. It remains app chrome and never enters project history.", keywords: ["layout", "inspector", "panel"], control: { kind: "range", minimum: 220, maximum: 720, step: 10, unit: "px" }, defaultValue: 320 },
    { id: "editor.projectBrowserVisible", sectionId: "editor", scope: "app-user", title: "Show project browser", description: "Restore the project browser when the editor opens on a wide screen.", keywords: ["layout", "sidebar", "visibility"], control: { kind: "toggle" }, defaultValue: true },
    { id: "editor.inspectorVisible", sectionId: "editor", scope: "app-user", title: "Show contextual inspector", description: "Keep the selected entity and its public properties visible beside the active workspace.", keywords: ["layout", "selection", "visibility"], control: { kind: "toggle" }, defaultValue: true },
    { id: "editor.defaultWorkspace", sectionId: "editor", scope: "app-user", title: "Default workspace", description: "Workspace shown when the editor starts. This preference does not modify the game project.", keywords: ["startup", "workspace"], control: { kind: "select", options: [{ value: "stage", label: "Stage" }, { value: "scene3d", label: "3D" }, { value: "script", label: "Code" }, { value: "tilemap", label: "Tilemap" }, { value: "atlas", label: "Atlas" }, { value: "post", label: "Polish" }, { value: "motion", label: "Sequence" }, { value: "diagnostics", label: "Debug" }] }, defaultValue: "stage" },
    { id: "editor.narrowPane", sectionId: "editor", scope: "app-user", title: "Narrow-screen start pane", description: "Choose the single usable pane shown first on phones and narrow windows.", keywords: ["mobile", "responsive", "drawer"], control: { kind: "segmented", options: [{ value: "project", label: "Project" }, { value: "main", label: "Canvas" }, { value: "inspector", label: "Inspector" }] }, defaultValue: "main" },
    { id: "editor.stageHierarchyVisible", sectionId: "editor", scope: "app-user", title: "Show legacy Stage hierarchy", description: "The project browser is authoritative by default. Enable the Stage-local hierarchy only when its drag-to-parent workflow is useful.", keywords: ["stage", "hierarchy", "panel"], control: { kind: "toggle" }, defaultValue: false, advanced: true },
    { id: "editor.stageToolsVisible", sectionId: "editor", scope: "app-user", title: "Make legacy Stage tools available", description: "The contextual inspector replaces the old Tile Painter panel. Enable this only when you still need its legacy Stage-local workflow.", keywords: ["stage", "tile", "panel"], control: { kind: "toggle" }, defaultValue: false, advanced: true },
    { id: "editor.aiHarnessEndpoint", sectionId: "editor", scope: "app-user", title: "AI harness endpoint", description: "Local harness address used by the optional project assistant. Stored as editor app-user state.", keywords: ["AI", "assistant", "endpoint"], control: { kind: "text", placeholder: "http://127.0.0.1:8787" }, defaultValue: defaultEditorUiPreferences.app.aiHarnessEndpoint, advanced: true },
    { id: "editor.aiAgent", sectionId: "editor", scope: "app-user", title: "Preferred AI agent", description: "Agent selected when the optional project assistant opens. Connection and panel state remain session-only.", keywords: ["AI", "assistant", "agent"], control: { kind: "select", options: [{ value: "pi", label: "Pi" }, { value: "copilot-cli", label: "Copilot CLI" }, { value: "codex-cli", label: "Codex CLI" }] }, defaultValue: defaultEditorUiPreferences.app.aiAgent, advanced: true },
    { id: "project.name", sectionId: "project", scope: "project", title: "Project name", description: "Portable display name used by builds and project tooling.", control: { kind: "text", placeholder: "Untitled Game" }, defaultValue: project.name },
    { id: "project.targetProfile", sectionId: "project", scope: "project", title: "Target profile", description: "Runtime constraints and build guidance for the intended device class.", keywords: ["device", "build"], control: { kind: "select", options: [{ value: "desktop", label: "Desktop browser" }, { value: "mobile", label: "Mobile browser" }, { value: "low-power", label: "Low-power device" }] }, defaultValue: project.settings.targetProfile },
    { id: "project.locale", sectionId: "project", scope: "project", title: "Default locale", description: "Locale used by the game for formatting and localized content.", control: { kind: "text", placeholder: "en-US" }, defaultValue: project.settings.locale },
    { id: "project.reducedMotion", sectionId: "project", scope: "project", title: "Reduce game motion", description: "Portable gameplay accessibility setting used by camera shake and motion effects.", keywords: ["camera", "accessibility"], control: { kind: "toggle" }, defaultValue: project.settings.reducedMotion },
    { id: "project.masterVolume", sectionId: "project", scope: "project", title: "Game master volume", description: "Portable game audio level, independent of application sounds.", keywords: ["audio", "sound"], control: { kind: "range", minimum: 0, maximum: 1, step: 0.05 }, defaultValue: project.settings.masterVolume },
  ];
}

function createValues(project: EditorProject, ui: EditorUiPreferences): PreferenceValues {
  return {
    "shared.theme": ui.shared.theme,
    "shared.density": ui.shared.density,
    "shared.uiScale": ui.shared.uiScale,
    "shared.reducedMotion": ui.shared.reducedMotion,
    "shared.numericAlignment": ui.shared.numericAlignment,
    "editor.sidebarSize": ui.app.workbench.sidebarSize,
    "editor.inspectorSize": ui.app.workbench.inspectorSize,
    "editor.projectBrowserVisible": !ui.app.workbench.sidebarCollapsed,
    "editor.inspectorVisible": !ui.app.workbench.inspectorCollapsed,
    "editor.defaultWorkspace": ui.app.defaultWorkspace,
    "editor.narrowPane": ui.app.narrowPane,
    "editor.stageHierarchyVisible": ui.app.workspaces.stage?.visible[0] ?? false,
    "editor.stageToolsVisible": ui.app.workspaces.stage?.visible[2] ?? false,
    "editor.aiHarnessEndpoint": ui.app.aiHarnessEndpoint,
    "editor.aiAgent": ui.app.aiAgent,
    "project.name": project.name,
    "project.targetProfile": project.settings.targetProfile,
    "project.locale": project.settings.locale,
    "project.reducedMotion": project.settings.reducedMotion,
    "project.masterVolume": project.settings.masterVolume,
    ...Object.fromEntries(project.settings.input.map((mapping) => [`input.${mapping.action}`, mapping.bindings.join(", ")])),
  };
}

function createUiPreferences(values: PreferenceValues, current: EditorUiPreferences): EditorUiPreferences {
  const stage = workspaceLayout(current.app.workspaces.stage, [252, 0, 280], [true, false, true], [false, true, false], 1);
  return normalizeEditorUiPreferences({
    ...current,
    shared: {
      theme: values["shared.theme"],
      density: values["shared.density"],
      uiScale: values["shared.uiScale"],
      reducedMotion: values["shared.reducedMotion"],
      numericAlignment: values["shared.numericAlignment"],
    },
    app: {
      ...current.app,
      defaultWorkspace: values["editor.defaultWorkspace"],
      narrowPane: values["editor.narrowPane"],
      aiHarnessEndpoint: values["editor.aiHarnessEndpoint"],
      aiAgent: values["editor.aiAgent"],
      workbench: {
        ...current.app.workbench,
        sidebarSize: values["editor.sidebarSize"],
        inspectorSize: values["editor.inspectorSize"],
        sidebarCollapsed: !values["editor.projectBrowserVisible"],
        inspectorCollapsed: !values["editor.inspectorVisible"],
      },
      workspaces: {
        ...current.app.workspaces,
        stage: {
          ...stage,
          visible: [Boolean(values["editor.stageHierarchyVisible"]), true, Boolean(values["editor.stageToolsVisible"])],
        },
      },
    },
  });
}

function workspaceLayout(current: WorkspacePanelLayout | undefined, sizes: number[], collapsed: boolean[], visible: boolean[], narrowPanel: number): WorkspacePanelLayout {
  return {
    sizes: sizes.map((value, index) => current?.sizes[index] ?? value),
    collapsed: collapsed.map((value, index) => current?.collapsed[index] ?? value),
    visible: visible.map((value, index) => current?.visible[index] ?? value),
    narrowPanel: current?.narrowPanel ?? narrowPanel,
  };
}

function createProjectPreferences(values: PreferenceValues, project: EditorProject, input: EditorProject["settings"]["input"]): EditorProjectPreferenceDraft {
  const targetProfile = values["project.targetProfile"];
  return {
    name: String(values["project.name"]).trim() || project.name,
    targetProfile: targetProfile === "mobile" || targetProfile === "low-power" ? targetProfile : "desktop",
    locale: String(values["project.locale"]).trim() || "en-US",
    reducedMotion: Boolean(values["project.reducedMotion"]),
    masterVolume: Number(values["project.masterVolume"]),
    input: structuredClone(input),
  };
}
