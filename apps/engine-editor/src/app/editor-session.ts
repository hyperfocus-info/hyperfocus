import {
  type EditorCommandSession,
  type EditorCommandHandoff,
  type EditorCommandPlan,
  type EditorCommandSnapshot,
} from "../editor-command-session.ts";

export const EDITOR_MODE_IDS = ["edit", "play", "profile", "build"] as const;
export type EditorModeId = (typeof EDITOR_MODE_IDS)[number];

export const EDITOR_WORKSPACE_IDS = [
  "stage",
  "scene3d",
  "tilemap",
  "atlas",
  "script",
  "post",
  "motion",
  "diagnostics",
] as const;
export type EditorWorkspaceId = (typeof EDITOR_WORKSPACE_IDS)[number];

export const EDITOR_CENTER_TAB_IDS = ["project", "learn", "settings", "build", "profile", "history"] as const;
export type EditorCenterTabId = (typeof EDITOR_CENTER_TAB_IDS)[number];

export const EDITOR_PRODUCTION_TAB_IDS = ["export", "reactive", "logic", "rig", "review"] as const;
export type EditorProductionTabId = (typeof EDITOR_PRODUCTION_TAB_IDS)[number];

/** A selected authored resource. Tool hover, drag, and canvas handles remain workspace-local state. */
export type EditorSelection =
  | { readonly kind: "none" }
  | {
      readonly kind: "entity";
      readonly sceneId: string;
      readonly primaryEntityId: string;
      readonly entityIds: readonly string[];
    }
  | { readonly kind: "asset"; readonly assetId: string }
  | { readonly kind: "script"; readonly path: string }
  | { readonly kind: "scene3d-object"; readonly sceneId: string; readonly objectId: string }
  | { readonly kind: "scene3d-material"; readonly materialId: string }
  | { readonly kind: "scene3d-light"; readonly sceneId: string; readonly lightId: string };

export type EditorOverlay =
  | { readonly kind: "none" }
  | { readonly kind: "project-center"; readonly tab: EditorCenterTabId }
  | { readonly kind: "command-palette"; readonly query: string }
  | { readonly kind: "production-lab"; readonly tab: EditorProductionTabId };

/** Session-only application state. None of these fields belong in project undo history. */
export type EditorUiSessionState = Readonly<{
  mode: EditorModeId;
  workspace: EditorWorkspaceId;
  selection: EditorSelection;
  overlay: EditorOverlay;
  consoleOpen: boolean;
}>;

export type EditorSessionSnapshot = Readonly<{
  session: EditorUiSessionState;
  project: EditorCommandSnapshot;
}>;

export type EditorSessionAction =
  | { readonly type: "mode.set"; readonly mode: EditorModeId }
  | { readonly type: "workspace.open"; readonly workspace: EditorWorkspaceId }
  | { readonly type: "selection.set"; readonly selection: EditorSelection }
  | { readonly type: "selection.clear" }
  | { readonly type: "overlay.set"; readonly overlay: EditorOverlay }
  | { readonly type: "overlay.close" }
  | { readonly type: "console.set-open"; readonly open: boolean }
  | { readonly type: "console.toggle" };

export type EditorProjectAction =
  | { readonly type: "history.undo" }
  | { readonly type: "history.redo" }
  | { readonly type: "project.mark-saved" }
  | { readonly type: "project.execute"; readonly plan: EditorCommandPlan };

export type EditorAction = EditorSessionAction | EditorProjectAction;

export type EditorActionResult =
  | { readonly kind: "session"; readonly changed: boolean }
  | { readonly kind: "history"; readonly changed: boolean }
  | { readonly kind: "project-saved"; readonly changed: boolean }
  | { readonly kind: "project-executed"; readonly handoff: EditorCommandHandoff };

export type CreateEditorSessionControllerOptions = {
  commands: EditorCommandSession;
  initial?: Partial<EditorUiSessionState>;
};

const DEFAULT_SELECTION: EditorSelection = Object.freeze({ kind: "none" });
const DEFAULT_OVERLAY: EditorOverlay = Object.freeze({ kind: "none" });

/**
 * Creates the framework- and DOM-free state boundary consumed by the future
 * Solid editor tree. Authored state is observed from, and delegated to, the
 * supplied editor command session; application session state is kept separately.
 */
export function createEditorSessionController(options: CreateEditorSessionControllerOptions) {
  let state = freezeSessionState({
    mode: options.initial?.mode ?? "edit",
    workspace: options.initial?.workspace ?? "stage",
    selection: options.initial?.selection ?? DEFAULT_SELECTION,
    overlay: options.initial?.overlay ?? DEFAULT_OVERLAY,
    consoleOpen: options.initial?.consoleOpen ?? false,
  });
  let project = options.commands.snapshot({ projectOwnership: "borrow" });
  let snapshot: EditorSessionSnapshot = Object.freeze({ session: state, project });
  let destroyed = false;
  const listeners = new Set<(snapshot: EditorSessionSnapshot) => void>();

  const emit = () => {
    snapshot = Object.freeze({ session: state, project });
    for (const listener of listeners) listener(snapshot);
  };

  const unsubscribeCommands = options.commands.subscribe(() => {
    const next = options.commands.snapshot({ projectOwnership: "borrow" });
    // Project history emits inside the command operation, just before the
    // command session advances its revision. Project the revision for
    // subscribers so the application snapshot is internally consistent in
    // the same turn; markSaved emits without adding a history entry.
    const entriesChanged = historyEntriesChanged(project, next);
    const revision = entriesChanged && next.revision <= project.revision
      ? project.revision + 1
      : next.revision;
    if (!entriesChanged
      && revision === project.revision
      && next.dirty === project.dirty
      && next.canUndo === project.canUndo
      && next.canRedo === project.canRedo) return;
    project = revision === next.revision ? next : { ...next, revision };
    emit();
  });

  const updateSession = (next: EditorUiSessionState) => {
    if (sameSessionState(state, next)) return false;
    state = next;
    emit();
    return true;
  };

  const dispose = () => {
    if (destroyed) return;
    destroyed = true;
    unsubscribeCommands();
    listeners.clear();
  };

  const controller = {
    commands: options.commands,
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener: (snapshot: EditorSessionSnapshot) => void) {
      assertActive(destroyed);
      listeners.add(listener);
      listener(snapshot);
      return () => { listeners.delete(listener); };
    },
    async dispatch(action: EditorAction) {
      assertActive(destroyed);

      if (action.type === "mode.set") {
        return sessionResult(updateSession(freezeSessionState({ ...state, mode: action.mode })));
      }
      if (action.type === "workspace.open") {
        return sessionResult(updateSession(freezeSessionState({ ...state, workspace: action.workspace })));
      }
      if (action.type === "selection.set") {
        return sessionResult(updateSession(freezeSessionState({ ...state, selection: action.selection })));
      }
      if (action.type === "selection.clear") {
        return sessionResult(updateSession(freezeSessionState({ ...state, selection: DEFAULT_SELECTION })));
      }
      if (action.type === "overlay.set") {
        return sessionResult(updateSession(freezeSessionState({ ...state, overlay: action.overlay })));
      }
      if (action.type === "overlay.close") {
        return sessionResult(updateSession(freezeSessionState({ ...state, overlay: DEFAULT_OVERLAY })));
      }
      if (action.type === "console.set-open") {
        return sessionResult(updateSession(freezeSessionState({ ...state, consoleOpen: action.open })));
      }
      if (action.type === "console.toggle") {
        return sessionResult(updateSession(freezeSessionState({ ...state, consoleOpen: !state.consoleOpen })));
      }
      if (action.type === "history.undo") {
        return { kind: "history", changed: options.commands.undo() };
      }
      if (action.type === "history.redo") {
        return { kind: "history", changed: options.commands.redo() };
      }
      if (action.type === "project.mark-saved") {
        const changed = options.commands.dirty;
        options.commands.markSaved();
        return { kind: "project-saved", changed };
      }
      if (action.type === "project.execute") {
        return { kind: "project-executed", handoff: await options.commands.execute(action.plan) };
      }

      return assertNever(action);
    },
    dispose,
    destroy: dispose,
  };

  return controller;
}

export type EditorSessionController = ReturnType<typeof createEditorSessionController>;

export function isEditorModeId(value: string): value is EditorModeId {
  return EDITOR_MODE_IDS.some((candidate) => candidate === value);
}

export function isEditorWorkspaceId(value: string): value is EditorWorkspaceId {
  return EDITOR_WORKSPACE_IDS.some((candidate) => candidate === value);
}

function freezeSessionState(state: EditorUiSessionState): EditorUiSessionState {
  return Object.freeze({
    ...state,
    selection: freezeSelection(state.selection),
    overlay: Object.freeze({ ...state.overlay }),
  });
}

function freezeSelection(selection: EditorSelection): EditorSelection {
  if (selection.kind !== "entity") return Object.freeze({ ...selection });
  return Object.freeze({ ...selection, entityIds: Object.freeze([...selection.entityIds]) });
}

function sameSessionState(left: EditorUiSessionState, right: EditorUiSessionState) {
  return left.mode === right.mode
    && left.workspace === right.workspace
    && left.consoleOpen === right.consoleOpen
    && sameSelection(left.selection, right.selection)
    && sameOverlay(left.overlay, right.overlay);
}

function sameSelection(left: EditorSelection, right: EditorSelection) {
  if (left.kind !== right.kind) return false;
  if (left.kind === "none" && right.kind === "none") return true;
  if (left.kind === "asset" && right.kind === "asset") return left.assetId === right.assetId;
  if (left.kind === "script" && right.kind === "script") return left.path === right.path;
  if (left.kind === "scene3d-material" && right.kind === "scene3d-material") return left.materialId === right.materialId;
  if (left.kind === "scene3d-object" && right.kind === "scene3d-object") return left.sceneId === right.sceneId && left.objectId === right.objectId;
  if (left.kind === "scene3d-light" && right.kind === "scene3d-light") return left.sceneId === right.sceneId && left.lightId === right.lightId;
  return left.kind === "entity"
    && right.kind === "entity"
    && left.sceneId === right.sceneId
    && left.primaryEntityId === right.primaryEntityId
    && sameStrings(left.entityIds, right.entityIds);
}

function sameOverlay(left: EditorOverlay, right: EditorOverlay) {
  if (left.kind !== right.kind) return false;
  if (left.kind === "none" && right.kind === "none") return true;
  if (left.kind === "project-center" && right.kind === "project-center") return left.tab === right.tab;
  if (left.kind === "command-palette" && right.kind === "command-palette") return left.query === right.query;
  return left.kind === "production-lab" && right.kind === "production-lab" && left.tab === right.tab;
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function historyEntriesChanged(left: EditorCommandSnapshot, right: EditorCommandSnapshot) {
  if (left.changes.length !== right.changes.length) return true;
  return left.changes.some((entry, index) => {
    const candidate = right.changes[index];
    return entry.label !== candidate?.label || entry.at !== candidate.at;
  });
}

function sessionResult(changed: boolean): EditorActionResult {
  return { kind: "session", changed };
}

function assertActive(destroyed: boolean) {
  if (destroyed) throw new Error("Editor session controller has been destroyed.");
}

function assertNever(value: never): never {
  throw new Error(`Unknown editor action: ${String(value)}`);
}
