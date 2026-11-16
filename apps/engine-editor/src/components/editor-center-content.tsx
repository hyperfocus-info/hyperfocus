import { SelectControl } from "@hyperfocus/ui";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import type { EditorUiPreferences } from "../app/editor-preferences.ts";
import { EditorPreferencesView, type EditorProjectPreferenceDraft } from "../app/editor-preferences-view.tsx";
import type { EditorProject } from "@hyperfocus/engine/project";

export type EditorBuildCheck = Readonly<{ ok: boolean; blocking: boolean; label: string; detail: string }>;
export type EditorBuildPreflight = Readonly<{ status: "pending" | "ready" | "error"; detail: string }>;

export type EditorCenterContentState =
  | { kind: "project"; project: EditorProject; hasRecovery: boolean }
  | { kind: "learn"; project: EditorProject }
  | {
      kind: "settings";
      project: EditorProject;
      uiPreferences: EditorUiPreferences;
      onSave: (project: EditorProjectPreferenceDraft, ui: EditorUiPreferences) => void;
    }
  | { kind: "build"; project: EditorProject; sourcePreflight: EditorBuildPreflight; validation: readonly EditorBuildCheck[] }
  | { kind: "profile"; profile: Readonly<Record<string, unknown>> }
  | { kind: "history"; changes: readonly { label: string; at: string }[] };

/** Component-owned Project Center content; no HTML-template injection boundary. */
export function EditorCenterContent(props: { state?: EditorCenterContentState }) {
  return (
    <Switch fallback={<div class="empty-copy">Choose a Project Center tab.</div>}>
      <Match when={props.state?.kind === "project" ? props.state : undefined}>{(state) => <ProjectHome state={state()} />}</Match>
      <Match when={props.state?.kind === "learn" ? props.state : undefined}>{(state) => <LearnCenter project={state().project} />}</Match>
      <Match when={props.state?.kind === "settings" ? props.state : undefined}>{(state) => {
        const settings = state();
        return <EditorPreferencesView project={settings.project} uiPreferences={settings.uiPreferences} onSave={settings.onSave} />;
      }}</Match>
      <Match when={props.state?.kind === "build" ? props.state : undefined}>{(state) => <BuildCenter state={state()} />}</Match>
      <Match when={props.state?.kind === "profile" ? props.state : undefined}>{(state) => <ProfileCenter profile={state().profile} />}</Match>
      <Match when={props.state?.kind === "history" ? props.state : undefined}>{(state) => <HistoryCenter changes={state().changes} />}</Match>
    </Switch>
  );
}

const starters = [
  { template: "pong", color: "#43d8d1", icon: "◫", title: "Pong in five minutes", description: "A complete two-player-style arcade loop with paddle controls, CPU opponent, collision, polish, and one-click browser build.", points: ["Playable immediately", "W/S or arrow controls", "Guided polish checklist"], action: "Create playable Pong" },
  { template: "platformer", color: "#6be1aa", icon: "↥", title: "Precision platformer", description: "A deterministic side-view starter with run and jump controls, solid platforms, camera follow, and a moving hazard.", points: ["A/D or arrow controls", "Buffered jump and coyote time", "Playable offline build"], action: "Create platformer" },
  { template: "3d-action", color: "#7f9dff", icon: "◇", title: "3D action starter", description: "A standalone WebGL2 scene declaration with glTF geometry, materials, camera follow, controls, physics, budgets, and saves.", points: ["Experimental editor proxy", "Editable declarations", "Verified offline 3D build"], action: "Create 3D world" },
  { template: "blank-2d", color: "#b99aff", icon: "+", title: "Blank 2D", description: "A clean scene for experienced designers who want the editor structure without demo content.", points: ["Empty stage", "Tilemap and code ready", "No sample clutter"], action: "Create blank project" },
  { template: "showcase", color: "#f2ad4d", icon: "✦", title: "Production showcase", description: "The complete sample with animation, atlas, FX, audio, logic, rigging, review, and diagnostics.", points: ["Advanced tools populated", "Performance telemetry", "Production Lab"], action: "Open advanced sample" },
] as const;

function ProjectHome(props: { state: Extract<EditorCenterContentState, { kind: "project" }> }) {
  const entityCount = () => props.state.project.scenes.reduce((sum, scene) => sum + scene.entities.length, 0);
  type StarterTemplate = (typeof starters)[number]["template"];
  const [selectedTemplate, setSelectedTemplate] = createSignal<StarterTemplate>("pong");
  const selectedStarter = () => starters.find((starter) => starter.template === selectedTemplate()) ?? starters[0];
  return <div class="starter-home">
    <div class="starter-hero"><div><span class="center-eyebrow">START WITH A WORKING GAME</span><h2>What do you want to make?</h2><p>Every starter opens playable, editable, and buildable. Start simple, then move into code, animation, audio, FX, profiling, and production tools only when you need them.</p></div><div class="starter-name"><label>Project name<input id="new-project-name" value="My Game" autocomplete="off" /></label></div></div>
    <div class="starter-picker">
      <label class="starter-select">Starter template<SelectControl ariaLabel="Starter template" value={selectedTemplate()} options={starters.map(starter => ({ value: starter.template, label: starter.title }))} onChange={setSelectedTemplate} /><small>Choose a working baseline. You can replace every part after creation.</small></label>
      <article class="starter-preview" style={{ "--starter-color": selectedStarter().color }}><span class="starter-icon">{selectedStarter().icon}</span><div><h3>{selectedStarter().title}</h3><p>{selectedStarter().description}</p><ul><For each={selectedStarter().points}>{(point) => <li>{point}</li>}</For></ul></div><button type="button" data-editor-action="create-template" data-template={selectedStarter().template}>{selectedStarter().action}</button></article>
    </div>
    <div class="starter-footer"><p><strong>{props.state.project.name}</strong> is currently open · {entityCount()} entities · {props.state.project.assets.length} assets{props.state.hasRecovery ? " · local recovery available" : ""}</p><div class="button-row"><button type="button" data-editor-action="open">Open existing project</button><button type="button" data-editor-action="download-project">Save portable files</button><button type="button" data-editor-action="export-neutral">Export ordinary files</button><button type="button" data-editor-action="close-center">Continue editing</button></div></div>
  </div>;
}

const learningSteps = [
  { title: "Play the game", detail: "Verify the core loop before changing it. Pong: W/S or arrow keys.", mode: "play", action: "", button: "Play now" },
  { title: "Edit the feel", detail: "Select a paddle or ball, then tune speed and dimensions in Components.", mode: "", action: "learn-stage", button: "Open Stage" },
  { title: "Bring in your art and sound", detail: "Drop files onto Assets, then drag images into the Stage.", mode: "", action: "import-assets", button: "Import assets" },
  { title: "Add juice", detail: "Use Post FX, Sequence, audio, camera shake, and animation without touching the game loop.", mode: "", action: "learn-polish", button: "Open Polish" },
  { title: "Build and share", detail: "Run pre-flight, then download one offline HTML file.", mode: "", action: "build", button: "Build game" },
] as const;

function LearnCenter(props: { project: EditorProject }) {
  const pong = () => {
    const starter = props.project.extensions?.hyperfocusStarter;
    return starter !== null && typeof starter === "object" && Reflect.get(starter, "template") === "pong";
  };
  return <div class="learn-layout"><section class="learning-path"><header><span class="center-eyebrow">{pong() ? "YOUR PONG HAPPY PATH" : "FIRST GAME HAPPY PATH"}</span><h2>From starter to a game you can share</h2><p>Follow these in order. Each step takes you directly to the editor that does the work.</p><button class="primary-button" type="button" data-editor-action="start-guided-tour">Start contextual editor tour</button></header><div class="learning-steps">
    <For each={learningSteps}>{(step, index) => <div class="learning-step"><span>{index() + 1}</span><div><strong>{step.title}</strong><small>{step.detail}</small></div><button type="button" data-editor-mode={step.mode || undefined} data-editor-action={step.action || undefined}>{step.button}</button></div>}</For>
  </div></section><aside class="learning-sidebar"><section><h3>Need to edit code?</h3><p>Open Code for project TypeScript. Grant session-only live preview permission for editor Play; Build compiles project-owned behavior source into the offline game.</p><button type="button" data-editor-action="learn-code">Open Code workspace</button></section><section><h3>Making a 3D game?</h3><p>The 3D workspace uses lightweight proxies while editing scene, camera, material, light, physics, and controller declarations. Play and offline Build use the real portable runtime and first-party WebGL2 renderer.</p><button type="button" data-editor-action="learn-3d">Open 3D workspace</button></section><section><h3>Advanced production</h3><p>Sequence, audio-reactive bindings, MIDI, logic graphs, sprite rigs, profiling, review pins, and export remain available after the core game works.</p></section></aside></div>;
}

function BuildCenter(props: { state: Extract<EditorCenterContentState, { kind: "build" }> }) {
  const sourceReady = () => props.state.sourcePreflight.status === "ready";
  const checks = (): readonly EditorBuildCheck[] => [{ ok: sourceReady(), blocking: true, label: "Source compilation", detail: props.state.sourcePreflight.detail }, ...props.state.validation];
  const blocked = () => !sourceReady() || props.state.validation.some((item) => item.blocking && !item.ok);
  const targetDetail = () => props.state.project.settings.targetProfile === "desktop" ? "60 Hz · keyboard/gamepad · 16.67 ms frame" : props.state.project.settings.targetProfile === "mobile" ? "touch/safe-area · 30/60 Hz · constrained FX" : "30 Hz · reduced motion · 8 MB asset guidance";
  return <div class="build-layout"><section><span class="center-eyebrow">WEB BUILD</span><h2>Build {props.state.project.name}</h2><p>Build emits one offline HTML file containing the verified portable project pair, first-party runtime, and compiled project-owned behavior source. Source compilation remains local to the editor server.</p><div class="build-target"><strong>{props.state.project.settings.targetProfile}</strong><span>{targetDetail()}</span></div><button class="primary-button" type="button" data-editor-action="download-build" disabled={blocked()}>{props.state.sourcePreflight.status === "pending" ? "Source compile pending" : blocked() ? "Resolve build blockers" : "Build offline HTML"}</button><button type="button" data-editor-action="download-ci">Export CI build report</button><button type="button" data-editor-action="export-neutral">Export ordinary files for another engine</button></section><section><span class="center-eyebrow">PRE-FLIGHT</span><div class="validation-list"><For each={checks()}>{(item) => <div classList={{ "is-pass": item.ok, "is-warning": !item.ok }}><span>{item.ok ? "✓" : item.blocking ? "×" : "!"}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div></div>}</For></div><pre>{`Editor build: verified assets + embedded source\nCLI build: bun run build:game -- --project <directory>\nVerification: bun run verify:system:editor`}</pre></section></div>;
}

function ProfileCenter(props: { profile: Readonly<Record<string, unknown>> }) {
  return <div class="profile-layout"><section><span class="center-eyebrow">LOCAL CAPTURE</span><h2>Reproducible runtime evidence</h2><p>Capture frame timing, render work, entity counts, backend selection, and current target profile as CI-readable JSON.</p><pre>{JSON.stringify(props.profile, null, 2)}</pre><button class="primary-button" type="button" data-editor-action="capture-profile">Download profile capture</button></section><section><span class="center-eyebrow">REMOTE RUNTIME</span><h2>Attach to a development endpoint</h2><p>Connect to a game or server WebSocket to route its diagnostic messages into the packet console.</p><label>WebSocket URL<input id="remote-runtime-url" value="ws://127.0.0.1:8797/diagnostics" /></label><div class="button-row"><button type="button" data-editor-action="connect-remote">Connect</button><output id="remote-runtime-state">Disconnected</output></div><p class="privacy-note">Connections are explicit and project-local. The editor does not transmit project data automatically.</p></section></div>;
}

function HistoryCenter(props: { changes: readonly { label: string; at: string }[] }) {
  return <div class="history-layout"><section><span class="center-eyebrow">CHANGE HISTORY</span><h2>Recoverable editor operations</h2><p>Undo and redo use complete versioned project snapshots. Portable exports contain canonical, diffable project JSON plus one compressed asset pack.</p><div class="button-row"><button type="button" data-editor-action="undo">Undo</button><button type="button" data-editor-action="redo">Redo</button><button type="button" data-editor-action="download-project">Export two files</button></div></section><section class="history-list"><Show when={props.changes.length} fallback={<p class="empty-copy">Changes will appear here.</p>}><For each={props.changes}>{(change) => <div><span>◇</span><strong>{change.label}</strong><time>{new Date(change.at).toLocaleTimeString()}</time></div>}</For></Show></section></div>;
}
