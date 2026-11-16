import * as stylex from "@stylexjs/stylex";
import type { CreateHotkeyDefinition } from "@tanstack/solid-hotkeys";
import {
createHotkeys,
createHotkeySequences,
formatForDisplay,
} from "@tanstack/solid-hotkeys";
import {
CheckCircle2,
ChevronDown,
ChevronRight,
Code2,
ExternalLink,
FileCode2,
Files,
Folder,
FolderOpen,
GitBranch,
GitCommit,
GitPullRequest,
PanelLeftClose,
PanelLeftOpen,
Save,
Search,
Settings,
X,
} from "lucide-solid";
import {
createContext,
createEffect,
createMemo,
createSignal,
For,
Match,
onCleanup,
onMount,
Show,
Switch,
untrack,
useContext,
} from "solid-js";
import { ActionButton } from "../components/action-button";
import {
ContextMenu,
type ContextMenuAction,
} from "../components/primitives/context-menu";
import { Tooltip } from "../components/primitives/tooltip";
import { harnessStore } from "../harness-store";
import {
isValidAppHotkey,normalizeAppHotkeyPreferences,
type AppHotkeyId,
} from "../lib/app-hotkeys";
import { escapeRegExp } from "@hyperfocus/utilities/text";
import { cn } from "../lib/utils";
import { terminalStore } from "../terminal/terminal-store";
import { pushToast } from "../toast-store";
import { applyCompletionAt,countDocumentMatches,getCompletionPrefix,getTextPosition,getWordAtPosition,inferLanguage,isIdeProjectSwitcherModKHotkey,normalizeGitStatusPath,normalizeHotkeyKey } from "./editor/text-operations";
import { GlobalSearchView } from "./global-search-view";
import {
ideStore,
type IdeActivityView,
type IdeEditorFile,
} from "./ide-store";
import { ideStyles,ideUtilityStyles } from "./ide-workbench.styles";

type IdeFile = Pick<
  IdeEditorFile,
  | "path"
  | "name"
  | "language"
  | "encoding"
  | "content"
  | "contentLines"
  | "cursorLine"
  | "cursorColumn"
  | "isBinary"
  | "tooLarge"
> & {
  path: string;
  name: string;
  language: string;
  encoding: string;
  symbols: string[];
};

type IdeToast = {
  id: string;
  title: string;
  detail: string;
  tone: "info" | "warning" | "error";
};

type IdeContextMenu = {
  kind: "tab" | "editor" | "tree";
  x: number;
  y: number;
  filePath?: string;
};

type IdeCommand = {
  id: string;
  label: string;
  detail: string;
  run: () => void;
};

type CompletionState = {
  x: number;
  y: number;
  path: string;
  position: number;
  prefix: string;
  items: string[];
};

type SymbolHoverState = {
  x: number;
  y: number;
  symbol: string;
  detail: string;
};

type EditorDraft = {
  path?: string;
  text: string;
  sourceText: string;
};

export type IdeWorkbenchProps = {
  onRequestClose?: () => void;
  onToggleWindowMode?: () => void;
  windowMode?: "docked" | "popped-out";
};

function createIdeWorkbenchState(resolvedProps: IdeWorkbenchProps) {
  const [handledOpenRequestId, setHandledOpenRequestId] = createSignal("");
  const [restoredActiveFileKey, setRestoredActiveFileKey] = createSignal("");
  const [cursorLine, setCursorLine] = createSignal(5);
  const [cursorColumn, setCursorColumn] = createSignal(12);
  const [contextMenu, setContextMenu] = createSignal<IdeContextMenu>();
  const [completionState, setCompletionState] = createSignal<CompletionState>();
  const [toasts, setToasts] = createSignal<IdeToast[]>([]);
  const [sidebarOpen, setSidebarOpenSignal] = createSignal(ideStore.state.sidebarOpen);
  const [activityView, setActivityViewSignal] = createSignal<IdeActivityView>(ideStore.state.activityView);
  const refs: {
    workbench?: HTMLElement;
    documentFindInput?: HTMLInputElement;
    globalSearchInput?: HTMLInputElement;
  } = {};
  const activeProject = createMemo(() => {
    const project = harnessStore.state.workspace.projects.find(
      (candidate) => candidate.id === harnessStore.state.workspace.activeProjectId,
    );
    return project ?? harnessStore.state.workspace.projects[0];
  });
  const fileForPath = (filePath: string): IdeFile => {
    const file = ideStore.state.filesByPath[filePath];
    if (file) return { ...file, symbols: [] };
    const name = filePath.split("/").at(-1) ?? filePath;
    return {
      path: filePath,
      name,
      language: inferLanguage(name),
      encoding: "UTF-8",
      symbols: [],
      isBinary: false,
      tooLarge: false,
      content: undefined,
      contentLines: [
        ideStore.state.pendingReadPath === filePath ? "Loading file..." : "Read-only preview unavailable.",
      ],
    };
  };
  const activeFile = createMemo(() => ideStore.state.activePath ? fileForPath(ideStore.state.activePath) : undefined);
  const openFiles = createMemo(() => ideStore.state.openPaths.map(fileForPath));
  const dirtyPaths = () => ideStore.state.dirtyPaths ?? [];
  const dirtyCount = createMemo(() => dirtyPaths().length);
  const hotkeyPreferences = () => normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences);
  const hotkeyHint = (id: AppHotkeyId) => formatHotkeyDisplay(hotkeyPreferences()[id][0]);
  return {
    resolvedProps,
    handledOpenRequestId, setHandledOpenRequestId, restoredActiveFileKey, setRestoredActiveFileKey,
    cursorLine, setCursorLine, cursorColumn, setCursorColumn, contextMenu, setContextMenu,
    completionState, setCompletionState, toasts, setToasts, sidebarOpen, setSidebarOpenSignal,
    activityView, setActivityViewSignal, refs, activeProject, activeFile, openFiles, dirtyPaths,
    dirtyCount, hotkeyPreferences, hotkeyHint,
  };
}

function syncIdeActivityBarChrome(open: boolean, view: IdeActivityView) {
  const activityBar = document.querySelector<HTMLElement>("[data-test-ide-activity-bar]");
  if (!activityBar) return;
  activityBar.dataset.sidebarOpen = open ? "true" : "false";
  activityBar.querySelectorAll<HTMLButtonElement>("[data-activity-view]").forEach((button) => {
    const active = open && button.dataset.activityView === view;
    button.className = cn(
      stylex.attrs(ideStyles.activityButton).class,
      active ? stylex.attrs(ideStyles.activityButtonActive).class : undefined,
    );
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function startIdeHorizontalResize(kind: "sidebar" | "editor", event: PointerEvent) {
  event.preventDefault();
  const startX = event.clientX;
  const startSidebarWidth = ideStore.state.sidebarWidth;
  const startEditorWidth = ideStore.state.primaryEditorWidth;
  const onPointerMove = (moveEvent: PointerEvent) => {
    const delta = moveEvent.clientX - startX;
    if (kind === "sidebar") {
      ideStore.setSidebarWidth(Math.max(220, Math.min(420, startSidebarWidth + delta)));
      return;
    }
    ideStore.setPrimaryEditorWidth(Math.max(42, Math.min(72, startEditorWidth + delta / 12)));
  };
  const onPointerUp = () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp, { once: true });
}

function createIdeWorkbenchNavigation(state: ReturnType<typeof createIdeWorkbenchState>) {
  const notify = (title: string, detail: string, tone: IdeToast["tone"] = "info") => {
    const id = `ide-toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    state.setToasts((current) => [...current.slice(-2), { id, title, detail, tone }]);
    if (tone === "error") pushToast(title, detail, "error");
    window.setTimeout(() => {
      state.setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
  };
  const setSidebarOpen = (open: boolean) => {
    state.setSidebarOpenSignal(open);
    ideStore.setSidebarOpen(open);
    syncIdeActivityBarChrome(open, state.activityView());
  };
  const openActivityView = (view: IdeActivityView) => {
    setSidebarOpen(true);
    state.setActivityViewSignal(view);
    ideStore.setActivityView(view);
    syncIdeActivityBarChrome(true, view);
  };
  const toggleActivityView = (view: IdeActivityView) => {
    if (state.sidebarOpen() && state.activityView() === view) {
      setSidebarOpen(false);
      return;
    }
    openActivityView(view);
  };
  const openFileByPath = (path: string, line?: number, column?: number) => {
    ideStore.openFile(path.replace(/\\/g, "/"), line, column);
    if (window.matchMedia?.("(max-width: 639px)").matches) setSidebarOpen(false);
    if (line) state.setCursorLine(line);
    if (column) state.setCursorColumn(column);
  };
  const closeIdeWindowIfEmpty = (paths: string[]) => {
    if (paths.length === 0) queueMicrotask(() => state.resolvedProps.onRequestClose?.());
  };
  const closeTab = (path: string) => closeIdeWindowIfEmpty(ideStore.closeTab(path));
  const closeCurrentTab = () => {
    const currentPath = ideStore.state.activePath;
    if (currentPath) closeTab(currentPath);
  };
  const closeAllTabs = () => {
    ideStore.closeAllTabs();
    closeIdeWindowIfEmpty([]);
  };
  const closeOtherTabs = (path: string) => ideStore.closeOtherTabs(path);
  const openDocumentFind = () => {
    ideStore.setDocumentFindOpen(true);
    queueMicrotask(() => {
      state.refs.documentFindInput?.focus();
      state.refs.documentFindInput?.select();
    });
  };
  const openGlobalSearch = () => {
    openActivityView("search");
    queueMicrotask(() => {
      state.refs.globalSearchInput?.focus();
      state.refs.globalSearchInput?.select();
    });
  };
  const openContextMenu = (kind: IdeContextMenu["kind"], event: MouseEvent, filePath?: string) => {
    event.preventDefault();
    state.setContextMenu({ kind, x: event.clientX, y: event.clientY, filePath });
  };
  const goToDefinition = (file: IdeFile, line: number, column: number) => {
    const symbol = getWordAtPosition(file.contentLines[line - 1] ?? "", column);
    const targetLine = findDefinitionLine(file.contentLines, symbol);
    if (!symbol || !targetLine) {
      notify("Definition not found", "No matching symbol definition in the active file.", "warning");
      return;
    }
    state.setCursorLine(targetLine);
    state.setCursorColumn(1);
    ideStore.setCursor(targetLine, 1);
    document.querySelector(`[data-test-ide-code-line="${targetLine}"]`)?.scrollIntoView({ block: "center" });
  };
  return {
    notify, setSidebarOpen, toggleSidebar: () => setSidebarOpen(!state.sidebarOpen()),
    openActivityView, toggleActivityView, openFileByPath, closeTab, closeCurrentTab,
    closeAllTabs, closeOtherTabs, openDocumentFind, openGlobalSearch,
    startHorizontalResize: startIdeHorizontalResize, openContextMenu, goToDefinition,
  };
}

type IdeWorkbenchNavigation = ReturnType<typeof createIdeWorkbenchNavigation>;

function createIdeWorkbenchCommandPalette(
  state: ReturnType<typeof createIdeWorkbenchState>,
  actions: IdeWorkbenchNavigation,
) {
  return createMemo<IdeCommand[]>(() => {
    const commands: IdeCommand[] = [
      { id: "save", label: "File: Save", detail: state.hotkeyHint("ideSave"), run: () => ideStore.saveFile() },
      { id: "close-all", label: "View: Close All Editors", detail: "Close all open editor tabs", run: actions.closeAllTabs },
      { id: "toggle-sidebar", label: "View: Toggle Sidebar", detail: "Collapse or restore file explorer", run: actions.toggleSidebar },
      { id: "find", label: "Search: Find in File", detail: state.hotkeyHint("ideFindInFile"), run: actions.openDocumentFind },
      { id: "search", label: "Search: Find in Files", detail: state.hotkeyHint("ideFindInFiles"), run: actions.openGlobalSearch },
      {
        id: "window-mode",
        label: state.resolvedProps.windowMode === "popped-out" ? "Window: Pop In" : "Window: Pop Out",
        detail: "Move IDE between main workspace and a separate window",
        run: () => state.resolvedProps.onToggleWindowMode?.(),
      },
    ];
    const query = ideStore.state.commandQuery.trim().toLowerCase();
    return query
      ? commands.filter((command) => `${command.label} ${command.detail}`.toLowerCase().includes(query))
      : commands;
  });
}

function createIdeWorkbenchContextMenu(
  state: ReturnType<typeof createIdeWorkbenchState>,
  actions: IdeWorkbenchNavigation,
) {
  return createMemo<ContextMenuAction[]>(() => {
    const menu = state.contextMenu();
    if (!menu) return [];
    if (menu.kind === "tab") {
      const filePath = menu.filePath ?? ideStore.state.activePath ?? "";
      return [
        { id: "close-tab", label: "Close", shortcut: formatForDisplay("Mod+W"), onSelect: () => actions.closeTab(filePath) },
        { id: "close-others", label: "Close Others", onSelect: () => actions.closeOtherTabs(filePath) },
        { id: "close-all", label: "Close All", onSelect: actions.closeAllTabs },
      ];
    }
    if (menu.kind === "tree") {
      return [
        { id: "open", label: "Open", onSelect: () => menu.filePath && actions.openFileByPath(menu.filePath) },
        { id: "copy-path", label: "Copy Path", onSelect: () => actions.notify("Path copied", menu.filePath ?? "Project path copied.") },
        { id: "refresh", label: "Refresh Explorer", onSelect: () => {
          const projectId = state.activeProject()?.id;
          if (projectId) ideStore.loadProject(projectId);
        } },
        { id: "reveal", label: "Reveal in Explorer", onSelect: () => actions.openActivityView("explorer") },
      ];
    }
    return [
      { id: "format", label: "Format Document", shortcut: formatForDisplay("Shift+Alt+F"), onSelect: () => actions.notify("Formatted", "Document formatting queued.") },
      { id: "symbol", label: "Go to Symbol", shortcut: formatForDisplay("Mod+Shift+O"), onSelect: () => ideStore.setCommandPalette(true) },
      { id: "definition", label: "Go to Definition", shortcut: "F12", onSelect: () => {
        const file = state.activeFile();
        if (file) actions.goToDefinition(file, file.cursorLine ?? state.cursorLine(), file.cursorColumn ?? state.cursorColumn());
      } },
      { id: "run-selection", label: "Send Selection to Agent", onSelect: () => actions.notify("Selection attached", "Selection ready for active harness thread.") },
    ];
  });
}

function registerIdeWorkbenchHotkeys(options: {
  hotkeyPreferences: ReturnType<typeof createIdeWorkbenchState>["hotkeyPreferences"];
  openDocumentFind: () => void;
  openGlobalSearch: () => void;
  toggleActivityView: (view: IdeActivityView) => void;
  closeCurrentTab: () => void;
  closeAllTabs: () => void;
  toggleSidebar: () => void;
}) {
  const groups: Array<{
    id: AppHotkeyId;
    name: string;
    description: string;
    callback: () => void;
  }> = [
    { id: "ideCommandPalette", name: "Command palette", description: "Open editor commands", callback: () => ideStore.setCommandPalette(true) },
    { id: "ideQuickOpen", name: "Quick open", description: "Open quick commands", callback: () => ideStore.setCommandPalette(true) },
    { id: "ideFindInFile", name: "Find in file", description: "Search current document", callback: options.openDocumentFind },
    { id: "ideFindInFiles", name: "Find in files", description: "Open global search panel", callback: options.openGlobalSearch },
    { id: "ideToggleTerminal", name: "Integrated terminal", description: "Toggle the bottom terminal drawer", callback: () => terminalStore.toggleOpen() },
    { id: "ideExplorer", name: "Explorer", description: "Open file explorer", callback: () => options.toggleActivityView("explorer") },
    { id: "ideSourceControl", name: "Source control", description: "Open source control", callback: () => options.toggleActivityView("source-control") },
    { id: "ideSave", name: "Save", description: "Save current editor", callback: () => ideStore.saveFile() },
    { id: "ideCloseEditor", name: "Close tab", description: "Close current editor", callback: options.closeCurrentTab },
    { id: "ideToggleSidebar", name: "Toggle sidebar", description: "Collapse or restore the IDE sidebar", callback: options.toggleSidebar },
    {
      id: "ideToggleWordWrap",
      name: "Word wrap",
      description: "Toggle editor word wrap",
      callback: () => ideStore.setEditorSetting(
        "wordWrap",
        ideStore.state.editorSettings.wordWrap === "on" ? "off" : "on",
      ),
    },
  ];
  const ideHotkeys = createMemo<CreateHotkeyDefinition[]>(() => groups.flatMap((group) =>
    options.hotkeyPreferences()[group.id].map((hotkey) => ({
      hotkey,
      callback: group.callback,
      options: {
        meta: { name: group.name, description: group.description },
        // IDE and workspace shortcuts are mutually exclusive by active surface.
        conflictBehavior: "allow" as const,
      },
    })),
  ));
  createHotkeys(ideHotkeys, () => ({
    enabled: harnessStore.state.activeSurface === "ide",
    ignoreInputs: false,
    preventDefault: true,
    stopPropagation: true,
  }));
  createHotkeySequences(
    () => options.hotkeyPreferences().ideCloseAllEditors.map((hotkey) => ({
      sequence: closeAllEditorSequence(hotkey),
      callback: options.closeAllTabs,
    })),
    () => ({
      enabled: harnessStore.state.activeSurface === "ide",
      ignoreInputs: false,
      preventDefault: true,
      stopPropagation: true,
    }),
  );
}

function registerIdeWorkbenchDataEffects(
  state: ReturnType<typeof createIdeWorkbenchState>,
  openFileByPath: (path: string, line?: number, column?: number) => void,
) {
  createEffect(() => {
    const request = harnessStore.state.ideFileOpenRequest;
    if (!request || request.id === state.handledOpenRequestId()) return;
    state.setHandledOpenRequestId(request.id);
    openFileByPath(request.path, request.line, request.column);
  });
  createEffect(() => {
    const projectId = state.activeProject()?.id;
    if (projectId) untrack(() => ideStore.loadProject(projectId));
  });
  createEffect(() => {
    const projectId = state.activeProject()?.id;
    const activePath = ideStore.state.activePath;
    const restoreKey = projectId && activePath ? `${projectId}:${activePath}` : "";
    if (
      projectId && activePath && restoreKey !== state.restoredActiveFileKey()
      && !ideStore.state.filesByPath[activePath] && ideStore.state.pendingReadPath !== activePath
    ) {
      state.setRestoredActiveFileKey(restoreKey);
      ideStore.openFile(activePath);
    }
  });
  createEffect(() => {
    const query = ideStore.state.searchQuery;
    const regex = ideStore.state.regexSearch;
    const caseSensitive = ideStore.state.caseSensitiveSearch;
    const wholeWord = ideStore.state.wholeWordSearch;
    const timeout = window.setTimeout(() => {
      void query;
      void regex;
      void caseSensitive;
      void wholeWord;
      ideStore.runSearch();
    }, 220);
    onCleanup(() => window.clearTimeout(timeout));
  });
}

function consumeIdeShortcut(event: KeyboardEvent, action: () => void) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  action();
}

function registerIdeWorkbenchShortcutInterception(options: {
  state: ReturnType<typeof createIdeWorkbenchState>;
  closeCurrentTab: () => void;
  closeAllTabs: () => void;
  toggleSidebar: () => void;
  openGlobalSearch: () => void;
  openDocumentFind: () => void;
  toggleActivityView: (view: IdeActivityView) => void;
}) {
  onMount(() => {
    let closeAllChordUntil = 0;
    let closeAllChordTails: string[][] = [];
    const interceptBrowserShortcuts = (event: KeyboardEvent) => {
      const targetNode = event.target instanceof Node ? event.target : undefined;
      const eventInsideWorkbench = Boolean(targetNode && options.state.refs.workbench?.contains(targetNode));
      if (
        harnessStore.state.activeSurface !== "ide"
        && options.state.resolvedProps.windowMode !== "popped-out"
        && !eventInsideWorkbench
      ) return;
      const hotkeys = options.state.hotkeyPreferences();
      const shortcuts: Array<[string[], () => void]> = [
        [hotkeys.ideCloseEditor, options.closeCurrentTab],
        [hotkeys.ideToggleSidebar, options.toggleSidebar],
        [hotkeys.ideFindInFiles, options.openGlobalSearch],
        [hotkeys.ideFindInFile, options.openDocumentFind],
        [hotkeys.ideExplorer, () => options.toggleActivityView("explorer")],
        [hotkeys.ideSourceControl, () => options.toggleActivityView("source-control")],
        [hotkeys.ideToggleTerminal, () => terminalStore.toggleOpen()],
        [hotkeys.ideSave, () => ideStore.saveFile()],
        [[...hotkeys.ideCommandPalette, ...hotkeys.ideQuickOpen], () => ideStore.setCommandPalette(true)],
        [hotkeys.ideToggleWordWrap, () => ideStore.setEditorSetting(
          "wordWrap",
          ideStore.state.editorSettings.wordWrap === "on" ? "off" : "on",
        )],
      ];
      const shortcut = shortcuts.find(([bindings]) => eventMatchesHotkeys(event, bindings));
      if (shortcut) {
        consumeIdeShortcut(event, shortcut[1]);
        return;
      }
      const closeAllSequences = hotkeys.ideCloseAllEditors.map(closeAllEditorSequence);
      const singleSequence = closeAllSequences.some(
        (sequence) => sequence.length === 1 && eventMatchesHotkeys(event, sequence),
      );
      if (singleSequence) {
        consumeIdeShortcut(event, options.closeAllTabs);
        return;
      }
      const prefixes = closeAllSequences.filter(
        (sequence) => sequence.length > 1 && eventMatchesHotkeys(event, sequence.slice(0, 1)),
      );
      if (prefixes.length > 0) {
        consumeIdeShortcut(event, () => {
          if (
            prefixes.some((sequence) => isIdeProjectSwitcherModKHotkey(sequence[0] ?? ""))
            && hotkeys.openProjectSwitcher.some(isIdeProjectSwitcherModKHotkey)
          ) {
            harnessStore.openProjectSwitcher();
            return;
          }
          closeAllChordUntil = Date.now() + 1200;
          closeAllChordTails = prefixes.map((sequence) => sequence.slice(1));
        });
        return;
      }
      if (
        closeAllChordUntil > Date.now()
        && closeAllChordTails.some((sequence) => eventMatchesHotkeys(event, sequence))
      ) {
        consumeIdeShortcut(event, options.closeAllTabs);
      }
      closeAllChordUntil = 0;
      closeAllChordTails = [];
    };
    window.addEventListener("keydown", interceptBrowserShortcuts, { capture: true });
    document.addEventListener("keydown", interceptBrowserShortcuts, { capture: true });
    onCleanup(() => {
      window.removeEventListener("keydown", interceptBrowserShortcuts, { capture: true });
      document.removeEventListener("keydown", interceptBrowserShortcuts, { capture: true });
    });
  });
}

type IdeWorkbenchViewActions = {
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  toggleActivityView: (view: IdeActivityView) => void;
  openFileByPath: (path: string, line?: number, column?: number) => void;
  openContextMenu: (kind: IdeContextMenu["kind"], event: MouseEvent, filePath?: string) => void;
  startHorizontalResize: (kind: "sidebar" | "editor", event: PointerEvent) => void;
  closeTab: (path: string) => void;
  closeCurrentTab: () => void;
  goToDefinition: (file: IdeFile, line: number, column: number) => void;
};

type IdeWorkbenchViewProps = {
  state: ReturnType<typeof createIdeWorkbenchState>;
  actions: IdeWorkbenchViewActions;
  commandPaletteCommands: () => IdeCommand[];
  contextMenuActions: () => ContextMenuAction[];
};

const IdeWorkbenchContext = createContext<IdeWorkbenchViewProps>();
function useIdeWorkbench() {
  const workbench = useContext(IdeWorkbenchContext);
  if (!workbench) throw new Error("IDE workbench requires its provider.");
  return workbench;
}

function IdeWorkbenchSidebar() {
  const { state, actions } = useIdeWorkbench();
  return (
    <>
      <Show
        when={state.sidebarOpen()}
        fallback={<ActivityBar active={undefined} sidebarOpen={false} onSelect={actions.toggleActivityView} />}
      >
        <ActivityBar active={state.activityView()} sidebarOpen={true} onSelect={actions.toggleActivityView} />
      </Show>
      <Show when={state.sidebarOpen()}>
        <aside
          class={stylex.attrs(
            ideStyles.sidebar,
            ideUtilityStyles.flex,
            ideUtilityStyles.minH0,
            ideUtilityStyles.shrink0,
            ideUtilityStyles.flexCol,
          ).class}
          style={{ width: `${ideStore.state.sidebarWidth}px` }}
        >
          <SidebarHeader
            active={state.activityView()}
            projectName={state.activeProject()?.name ?? "Workspace"}
            onCollapse={() => actions.setSidebarOpen(false)}
            onCollapseAll={ideStore.collapseAllFolders}
          />
          <Show when={!ideStore.state.treeLoading || ideStore.state.treeEntries.length > 0} fallback={<SidebarSkeleton />}>
            <SwitchSidebar />
          </Show>
        </aside>
        <Sash
          label="Resize IDE sidebar"
          orientation="vertical"
          onPointerDown={(event) => actions.startHorizontalResize("sidebar", event)}
        />
      </Show>
    </>
  );
}

function IdeWorkbenchToolbar() {
  const { state, actions } = useIdeWorkbench();
  const iconClass = stylex.attrs(ideUtilityStyles.h4, ideUtilityStyles.w4).class;
  const buttonClass = stylex.attrs(
    ideUtilityStyles.h8,
    ideUtilityStyles.w8,
    ideUtilityStyles.roundedLg,
  ).class;
  const poppedOut = () => state.resolvedProps.windowMode === "popped-out";
  return (
    <div class={stylex.attrs(
      ideStyles.chrome,
      ideUtilityStyles.flex,
      ideUtilityStyles.h10,
      ideUtilityStyles.shrink0,
      ideUtilityStyles.itemsCenter,
      ideUtilityStyles.justifyBetween,
      ideUtilityStyles.gap2,
      ideUtilityStyles.px2,
    ).class}>
      <div class={stylex.attrs(
        ideUtilityStyles.flex,
        ideUtilityStyles.minW0,
        ideUtilityStyles.itemsCenter,
        ideUtilityStyles.gap15,
      ).class}>
        <ActionButton
          tooltip={`Save active file (${state.hotkeyHint("ideSave")})`}
          ariaLabel="Save active file"
          icon={<Save class={iconClass} />}
          variant={state.dirtyPaths().includes(ideStore.state.activePath ?? "") ? "secondary" : "ghost"}
          size="icon"
          class={buttonClass}
          onClick={() => ideStore.saveFile()}
        />
        <ActionButton
          tooltip={`${state.sidebarOpen() ? "Hide" : "Show"} IDE sidebar (${state.hotkeyHint("ideToggleSidebar")})`}
          ariaLabel={state.sidebarOpen() ? "Hide IDE sidebar" : "Show IDE sidebar"}
          icon={state.sidebarOpen() ? <PanelLeftClose class={iconClass} /> : <PanelLeftOpen class={iconClass} />}
          variant="ghost"
          size="icon"
          class={buttonClass}
          onClick={actions.toggleSidebar}
        />
        <ActionButton
          tooltip={`Open command palette (${state.hotkeyHint("ideCommandPalette")})`}
          ariaLabel="Open command palette"
          icon={<Code2 class={iconClass} />}
          variant="ghost"
          size="icon"
          class={buttonClass}
          onClick={() => ideStore.setCommandPalette(true)}
        />
        <ActionButton
          tooltip={poppedOut() ? "Pop IDE into main window" : "Pop IDE out to new window"}
          ariaLabel={poppedOut() ? "Pop IDE into main window" : "Pop IDE out to new window"}
          icon={<ExternalLink class={iconClass} />}
          variant="ghost"
          size="icon"
          class={buttonClass}
          onClick={state.resolvedProps.onToggleWindowMode}
        />
        <Show when={ideStore.state.editorSettings.breadcrumbsEnabled}>
          <Breadcrumbs file={state.activeFile()} />
        </Show>
      </div>
    </div>
  );
}

function IdeWorkbenchTabs() {
  const { state, actions } = useIdeWorkbench();
  return (
    <div
      class={stylex.attrs(
        ideStyles.chrome,
        ideStyles.editorTabs,
        ideUtilityStyles.flex,
        ideUtilityStyles.h10,
        ideUtilityStyles.shrink0,
        ideUtilityStyles.itemsEnd,
        ideUtilityStyles.overflowXAuto,
        ideUtilityStyles.overflowYHidden,
      ).class}
      data-test-ide-editor-tabs=""
      data-open-count={state.openFiles().length}
    >
      <Show
        when={state.openFiles().length > 0}
        fallback={<div class={stylex.attrs(
          ideUtilityStyles.px3,
          ideUtilityStyles.pb2,
          ideUtilityStyles.textXs,
          ideUtilityStyles.textMuted,
        ).class}>No editors open</div>}
      >
        <For each={state.openFiles()}>
          {(file) => (
            <button
              type="button"
              data-test-ide-editor-tab=""
              class={cn(
                stylex.attrs(ideStyles.editorTab).class,
                ideStore.state.activePath === file.path ? stylex.attrs(ideStyles.editorTabActive).class : undefined,
              )}
              aria-label={`Open ${file.name}`}
              onClick={() => ideStore.state.filesByPath[file.path]
                ? ideStore.setActivePath(file.path)
                : ideStore.openFile(file.path)}
              onContextMenu={(event) => actions.openContextMenu("tab", event, file.path)}
            >
              <FileCode2 class={stylex.attrs(ideUtilityStyles.h35, ideUtilityStyles.w35).class} />
              <span class={stylex.attrs(ideUtilityStyles.truncate).class}>
                {state.dirtyPaths().includes(file.path) ? `${file.name} *` : file.name}
              </span>
              <X
                class={stylex.attrs(
                  ideUtilityStyles.h35,
                  ideUtilityStyles.w35,
                  ideUtilityStyles.transition,
                  ideStyles.tabClose,
                ).class}
                onClick={(event) => {
                  event.stopPropagation();
                  actions.closeTab(file.path);
                }}
              />
            </button>
          )}
        </For>
      </Show>
    </div>
  );
}

function IdeWorkbenchEditorArea() {
  const { state, actions } = useIdeWorkbench();
  return (
    <Show when={!ideStore.state.treeLoading || Boolean(ideStore.state.filesByPath[ideStore.state.activePath ?? ""])} fallback={<EditorSkeleton />}>
      <div class={stylex.attrs(
        ideUtilityStyles.flex,
        ideUtilityStyles.minH0,
        ideUtilityStyles.flex1,
        ideUtilityStyles.flexCol,
      ).class}>
        <div class={stylex.attrs(ideUtilityStyles.flex, ideUtilityStyles.minH0, ideUtilityStyles.flex1).class}>
          <EditorSurface
            file={state.activeFile()}
            widthPercent={ideStore.state.primaryEditorWidth}
            documentFindOpen={ideStore.state.documentFindOpen}
            documentFindQuery={ideStore.state.documentFindQuery}
            findInputRef={(element) => { state.refs.documentFindInput = element; }}
            onDocumentFindQuery={ideStore.setDocumentFindQuery}
            onDocumentFindClose={() => ideStore.setDocumentFindOpen(false)}
            wordWrap={ideStore.state.editorSettings.wordWrap}
            tabSize={ideStore.state.editorSettings.tabSize}
            bracketPairColorization={ideStore.state.editorSettings.bracketPairColorization}
            dirty={state.dirtyPaths().includes(state.activeFile()?.path ?? "")}
            completionState={state.completionState()}
            onCompletionClose={() => state.setCompletionState(undefined)}
            onCompletionSelect={(value) => {
              const completion = state.completionState();
              const file = state.activeFile();
              if (!file || !completion) return;
              ideStore.updateFileContent(
                file.path,
                applyCompletionAt(
                  file.content ?? file.contentLines.join("\n"),
                  completion.position,
                  completion.prefix,
                  value,
                ),
              );
              state.setCompletionState(undefined);
            }}
            onContentChange={(path, content) => ideStore.updateFileContent(path, content)}
            onSave={() => ideStore.saveFile()}
            onCloseTab={actions.closeCurrentTab}
            onGoToDefinition={actions.goToDefinition}
            onCompletionRequest={(x, y, path, position, prefix, items) =>
              state.setCompletionState({ x, y, path, position, prefix, items })}
            onCursor={(line, column) => {
              state.setCursorLine(line);
              state.setCursorColumn(column);
              ideStore.setCursor(line, column);
            }}
            onContextMenu={(event) => actions.openContextMenu("editor", event)}
          />
        </div>
      </div>
    </Show>
  );
}

function IdeWorkbenchView() {
  const { state } = useIdeWorkbench();
  return (
    <section
      ref={(element) => { state.refs.workbench = element; }}
      data-test-ide-workbench=""
      class={stylex.attrs(
        ideStyles.shell,
        ideUtilityStyles.flex,
        ideUtilityStyles.hFull,
        ideUtilityStyles.minH0,
        ideUtilityStyles.flexCol,
        ideUtilityStyles.overflowHidden,
        ideUtilityStyles.roundedNone,
        ideUtilityStyles.border0,
      ).class}
    >
      <div class={stylex.attrs(ideUtilityStyles.flex, ideUtilityStyles.minH0, ideUtilityStyles.flex1).class}>
        <IdeWorkbenchSidebar />
        <div class={stylex.attrs(
          ideStyles.surface,
          ideUtilityStyles.flex,
          ideUtilityStyles.minW0,
          ideUtilityStyles.flex1,
          ideUtilityStyles.flexCol,
        ).class}>
          <IdeWorkbenchToolbar />
          <IdeWorkbenchTabs />
          <IdeWorkbenchEditorArea />
          <StatusBar
            branch={ideStore.state.gitBranch ?? (ideStore.state.gitIsRepository ? "detached" : "no git")}
            dirtyCount={state.dirtyCount()}
            line={state.cursorLine()}
            column={state.cursorColumn()}
            encoding={state.activeFile()?.encoding ?? "UTF-8"}
            language={state.activeFile()?.language ?? "Plain Text"}
          />
        </div>
      </div>
      <CommandPalette
        open={ideStore.state.commandPaletteOpen}
        query={ideStore.state.commandQuery}
        commands={useIdeWorkbench().commandPaletteCommands()}
        onQuery={ideStore.setCommandQuery}
        onClose={() => ideStore.setCommandPalette(false, "")}
      />
      <ContextMenu
        open={Boolean(state.contextMenu())}
        x={state.contextMenu()?.x ?? 0}
        y={state.contextMenu()?.y ?? 0}
        ariaLabel="IDE context menu"
        actions={useIdeWorkbench().contextMenuActions()}
        onClose={() => state.setContextMenu(undefined)}
      />
      <IdeToasts
        toasts={state.toasts()}
        onDismiss={(id) => state.setToasts((current) => current.filter((toast) => toast.id !== id))}
      />
    </section>
  );
}

export function IdeWorkbench(props?: IdeWorkbenchProps) {
  const state = createIdeWorkbenchState(props ?? {});
  const actions = createIdeWorkbenchNavigation(state);
  const commandPaletteCommands = createIdeWorkbenchCommandPalette(state, actions);
  const contextMenuActions = createIdeWorkbenchContextMenu(state, actions);
  registerIdeWorkbenchHotkeys({
    hotkeyPreferences: state.hotkeyPreferences,
    openDocumentFind: actions.openDocumentFind,
    openGlobalSearch: actions.openGlobalSearch,
    toggleActivityView: actions.toggleActivityView,
    closeCurrentTab: actions.closeCurrentTab,
    closeAllTabs: actions.closeAllTabs,
    toggleSidebar: actions.toggleSidebar,
  });
  registerIdeWorkbenchDataEffects(state, actions.openFileByPath);
  registerIdeWorkbenchShortcutInterception({
    state,
    closeCurrentTab: actions.closeCurrentTab,
    closeAllTabs: actions.closeAllTabs,
    toggleSidebar: actions.toggleSidebar,
    openGlobalSearch: actions.openGlobalSearch,
    openDocumentFind: actions.openDocumentFind,
    toggleActivityView: actions.toggleActivityView,
  });
  return (
    <IdeWorkbenchContext.Provider value={{ state, actions, commandPaletteCommands, contextMenuActions }}><IdeWorkbenchView /></IdeWorkbenchContext.Provider>
  );
}
function ActivityBar(props: {
  active: IdeActivityView | undefined;
  sidebarOpen: boolean;
  onSelect: (view: IdeActivityView) => void;
}) {
  const views = [
    {
      id: "explorer" as const,
      label: "Explorer",
      hotkeyId: "ideExplorer" as const,
      icon: Files,
    },
    {
      id: "search" as const,
      label: "Search",
      hotkeyId: "ideFindInFiles" as const,
      icon: Search,
    },
    {
      id: "source-control" as const,
      label: "Source Control",
      hotkeyId: "ideSourceControl" as const,
      icon: GitBranch,
    },
  ];
  const hotkeys = () =>
    normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences);
  const tooltip = (label: string, hotkeyId: AppHotkeyId) => {
    const hotkey = hotkeys()[hotkeyId][0];
    return hotkey ? `${label} (${formatHotkeyDisplay(hotkey)})` : label;
  };

  return (
    <nav
      class={
        stylex.attrs(
          ideStyles.activityBar,
          ideUtilityStyles.flex,
          ideUtilityStyles.w12,
          ideUtilityStyles.shrink0,
          ideUtilityStyles.flexCol,
          ideUtilityStyles.itemsCenter,
          ideUtilityStyles.gap1,
          ideUtilityStyles.py2,
        ).class
      }
      aria-label="IDE activity bar"
      data-test-ide-activity-bar=""
      data-sidebar-open={props.sidebarOpen ? "true" : "false"}
    >
      <For each={views}>
        {(view) => {
          const Icon = view.icon;
          const active = () => props.sidebarOpen && props.active === view.id;
          return (
            <Tooltip content={tooltip(view.label, view.hotkeyId)} side="right">
              <button
                type="button"
                class={cn(
                  stylex.attrs(ideStyles.activityButton).class,
                  active()
                    ? stylex.attrs(ideStyles.activityButtonActive).class
                    : undefined,
                )}
                aria-label={view.label}
                aria-pressed={active()}
                data-activity-view={view.id}
                onClick={() => props.onSelect(view.id)}
              >
                <Icon
                  class={
                    stylex.attrs(ideUtilityStyles.h5, ideUtilityStyles.w5).class
                  }
                />
              </button>
            </Tooltip>
          );
        }}
      </For>
      <div
        class={
          stylex.attrs(ideUtilityStyles.minH0, ideUtilityStyles.flex1).class
        }
      />
      <Tooltip content="Manage IDE settings" side="right">
        <button
          type="button"
          class={stylex.attrs(ideStyles.activityButton).class}
          aria-label="Manage IDE settings"
          onClick={() => {
            harnessStore.openPreferencesModal();
            harnessStore.setPreferencesActiveSectionId("ide-settings");
          }}
        >
          <Settings
            class={stylex.attrs(ideUtilityStyles.h5, ideUtilityStyles.w5).class}
          />
        </button>
      </Tooltip>
    </nav>
  );
}

function SidebarHeader(props: {
  active: IdeActivityView;
  projectName: string;
  onCollapse: () => void;
  onCollapseAll: () => void;
}) {
  const title = () =>
    props.active === "source-control"
      ? "Source Control"
      : props.active === "search"
        ? "Search"
        : "Explorer";
  return (
    <div
      class={
        stylex.attrs(
          ideStyles.chrome,
          ideUtilityStyles.flex,
          ideUtilityStyles.h12,
          ideUtilityStyles.shrink0,
          ideUtilityStyles.itemsCenter,
          ideUtilityStyles.justifyBetween,
          ideUtilityStyles.gap2,
          ideUtilityStyles.px3,
        ).class
      }
    >
      <div class={stylex.attrs(ideUtilityStyles.minW0).class}>
        <div
          class={
            stylex.attrs(
              ideUtilityStyles.text062,
              ideUtilityStyles.fontSemibold,
              ideUtilityStyles.uppercase,
              ideUtilityStyles.textIdeMuted,
            ).class
          }
        >
          {title()}
        </div>
        <button
          type="button"
          class={stylex.attrs(ideStyles.projectSelect).class}
          aria-label="Select project"
          onClick={() => harnessStore.openProjectSwitcher()}
        >
          <span class={stylex.attrs(ideUtilityStyles.truncate).class}>
            {props.projectName}
          </span>
          <ChevronDown
            class={
              stylex.attrs(
                ideUtilityStyles.h35,
                ideUtilityStyles.w35,
                ideUtilityStyles.shrink0,
              ).class
            }
          />
        </button>
      </div>
      <div
        class={
          stylex.attrs(
            ideUtilityStyles.flex,
            ideUtilityStyles.itemsCenter,
            ideUtilityStyles.gap1,
          ).class
        }
      >
        <ActionButton
          tooltip="Collapse all folders"
          ariaLabel="Collapse all folders"
          icon={
            <Files
              class={
                stylex.attrs(ideUtilityStyles.h4, ideUtilityStyles.w4).class
              }
            />
          }
          variant="ghost"
          size="icon"
          class={
            stylex.attrs(
              ideUtilityStyles.h8,
              ideUtilityStyles.w8,
              ideUtilityStyles.roundedLg,
            ).class
          }
          onClick={props.onCollapseAll}
        />
        <ActionButton
          tooltip={`Collapse IDE sidebar (${formatHotkeyDisplay(normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences).ideToggleSidebar[0])})`}
          ariaLabel="Collapse IDE sidebar"
          icon={
            <PanelLeftClose
              class={
                stylex.attrs(ideUtilityStyles.h4, ideUtilityStyles.w4).class
              }
            />
          }
          variant="ghost"
          size="icon"
          class={
            stylex.attrs(
              ideUtilityStyles.h8,
              ideUtilityStyles.w8,
              ideUtilityStyles.roundedLg,
            ).class
          }
          onClick={props.onCollapse}
        />
      </div>
    </div>
  );
}

function SwitchSidebar() {
  const { state, actions } = useIdeWorkbench();
  return (
    <Switch fallback={<ExplorerView entries={ideStore.state.treeEntries}
      error={ideStore.state.treeError} truncated={ideStore.state.treeTruncated}
      gitChanges={ideStore.state.gitChanges} onOpenPath={actions.openFileByPath}
      onContextMenu={actions.openContextMenu} />}>
      <Match when={state.activityView() === "search"}>
        <GlobalSearchView searchQuery={ideStore.state.searchQuery} replaceQuery={ideStore.state.replaceQuery}
          regexSearch={ideStore.state.regexSearch} caseSensitiveSearch={ideStore.state.caseSensitiveSearch}
          wholeWordSearch={ideStore.state.wholeWordSearch} searchLoading={ideStore.state.searchLoading}
          searchResults={ideStore.state.searchResults} searchTruncated={ideStore.state.searchTruncated}
          searchInputRef={element => { state.refs.globalSearchInput = element; }}
          onSearchQuery={ideStore.setSearchQuery} onReplaceQuery={ideStore.setReplaceQuery}
          onRegexSearch={ideStore.setRegexSearch} onCaseSensitiveSearch={ideStore.setCaseSensitiveSearch}
          onWholeWordSearch={ideStore.setWholeWordSearch} onOpenPath={actions.openFileByPath} />
      </Match>
      <Match when={state.activityView() === "source-control"}>
        <SourceControlView branch={ideStore.state.gitBranch} isRepository={ideStore.state.gitIsRepository}
          changes={ideStore.state.gitChanges} loading={ideStore.state.gitLoading} onOpenPath={actions.openFileByPath} />
      </Match>
    </Switch>
  );
}

function ExplorerView(props: {
  entries: import("@hyperfocus/ai-core/protocol").IdeFileTreeEntry[];
  error?: string;
  truncated: boolean;
  gitChanges: import("@hyperfocus/ai-core/protocol").IdeGitChange[];
  onOpenPath: (path: string) => void;
  onContextMenu: (
    kind: IdeContextMenu["kind"],
    event: MouseEvent,
    filePath?: string,
  ) => void;
}) {
  const visibleEntries = createMemo(() =>
    flattenVisibleTree(props.entries, ideStore.state.expandedFolderPaths),
  );
  const expanded = createMemo(
    () => new Set(ideStore.state.expandedFolderPaths),
  );
  const loading = createMemo(() => new Set(ideStore.state.loadingFolderPaths));
  const gitStatusByPath = createMemo(() =>
    createGitStatusByPath(props.gitChanges),
  );
  return (
    <div
      class={
        stylex.attrs(
          ideUtilityStyles.minH0,
          ideUtilityStyles.flex1,
          ideUtilityStyles.overflowAuto,
          ideUtilityStyles.px2,
          ideUtilityStyles.py2,
          ideUtilityStyles.textXs,
        ).class
      }
    >
      <Show
        when={!props.error}
        fallback={
          <div
            class={
              stylex.attrs(
                ideUtilityStyles.roundedLg,
                ideUtilityStyles.border,
                ideUtilityStyles.borderDashed,
                ideUtilityStyles.borderIde,
                ideUtilityStyles.p3,
                ideUtilityStyles.textXs,
                ideUtilityStyles.textIdeMuted,
              ).class
            }
          >
            {props.error}
          </div>
        }
      >
        <Show
          when={props.entries.length > 0}
          fallback={
            <div
              class={
                stylex.attrs(
                  ideUtilityStyles.roundedLg,
                  ideUtilityStyles.border,
                  ideUtilityStyles.borderDashed,
                  ideUtilityStyles.borderIde,
                  ideUtilityStyles.p3,
                  ideUtilityStyles.textXs,
                  ideUtilityStyles.textIdeMuted,
                ).class
              }
            >
              No files found.
            </div>
          }
        >
          <For each={visibleEntries()}>
            {(entry) => (
              <FileRow
                entry={entry}
                expanded={expanded().has(entry.path)}
                loading={loading().has(entry.path)}
                gitStatus={findGitStatusForTreeEntry(gitStatusByPath(), entry)}
                onOpen={() =>
                  entry.kind === "file"
                    ? props.onOpenPath(entry.path)
                    : ideStore.toggleFolder(entry.path)
                }
                onContextMenu={(event) =>
                  props.onContextMenu("tree", event, entry.path)
                }
              />
            )}
          </For>
          <Show when={props.truncated}>
            <div
              class={
                stylex.attrs(
                  ideUtilityStyles.px2,
                  ideUtilityStyles.py2,
                  ideUtilityStyles.text068,
                  ideUtilityStyles.textIdeMuted,
                ).class
              }
            >
              File tree truncated.
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  );
}

function FileRow(props: {
  entry: import("@hyperfocus/ai-core/protocol").IdeFileTreeEntry;
  expanded: boolean;
  loading: boolean;
  gitStatus?: GitStatusBadge;
  onOpen: () => void;
  onContextMenu: (event: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      class={cn(
        stylex.attrs(ideStyles.treeRow).class,
        props.gitStatus ? stylex.attrs(ideStyles.treeRowGit).class : undefined,
        props.gitStatus?.tone === "modified"
          ? stylex.attrs(ideStyles.treeModified).class
          : props.gitStatus?.tone === "added"
            ? stylex.attrs(ideStyles.treeAdded).class
            : undefined,
      )}
      style={{ "padding-left": `${0.5 + props.entry.depth * 0.85}rem` }}
      aria-label={
        props.entry.kind === "file"
          ? `Open ${props.entry.name}`
          : `${props.expanded ? "Collapse" : "Expand"} ${props.entry.name}`
      }
      aria-expanded={
        props.entry.kind === "directory" ? props.expanded : undefined
      }
      data-git-tone={props.gitStatus?.tone}
      onClick={props.onOpen}
      onContextMenu={props.onContextMenu}
    >
      <Show
        when={props.entry.kind === "directory"}
        fallback={
          <FileCode2
            class={
              stylex.attrs(ideUtilityStyles.h35, ideUtilityStyles.w35).class
            }
          />
        }
      >
        <Show
          when={props.entry.hasChildren !== false}
          fallback={
            <Folder
              class={
                stylex.attrs(ideUtilityStyles.h35, ideUtilityStyles.w35).class
              }
            />
          }
        >
          <span
            class={
              stylex.attrs(
                ideUtilityStyles.inlineFlex,
                ideUtilityStyles.itemsCenter,
                ideUtilityStyles.gap05,
              ).class
            }
          >
            {props.expanded ? (
              <ChevronDown
                class={
                  stylex.attrs(ideUtilityStyles.h35, ideUtilityStyles.w35).class
                }
              />
            ) : (
              <ChevronRight
                class={
                  stylex.attrs(ideUtilityStyles.h35, ideUtilityStyles.w35).class
                }
              />
            )}
            {props.expanded ? (
              <FolderOpen
                class={
                  stylex.attrs(ideUtilityStyles.h35, ideUtilityStyles.w35).class
                }
              />
            ) : (
              <Folder
                class={
                  stylex.attrs(ideUtilityStyles.h35, ideUtilityStyles.w35).class
                }
              />
            )}
          </span>
        </Show>
      </Show>
      <span class={stylex.attrs(ideUtilityStyles.truncate).class}>
        {props.entry.name}
        {props.loading ? "..." : ""}
      </span>
      <Show when={props.gitStatus}>
        {(status) => (
          <span
            class={cn(
              stylex.attrs(ideStyles.gitBadge).class,
              status().tone === "modified"
                ? stylex.attrs(ideStyles.gitModified).class
                : stylex.attrs(ideStyles.gitAdded).class,
            )}
          >
            {status().label}
          </span>
        )}
      </Show>
    </button>
  );
}

type GitStatusBadge = {
  label: string;
  tone: "modified" | "added";
  source: "file" | "folder";
};

function createGitStatusByPath(
  changes: import("@hyperfocus/ai-core/protocol").IdeGitChange[],
) {
  const statuses = new Map<string, GitStatusBadge>();
  for (const change of changes) {
    const fileStatus = toGitStatusBadge(change);
    if (!fileStatus) {
      continue;
    }
    const normalizedPath = normalizeGitStatusPath(change.path);
    statuses.set(normalizedPath, fileStatus);
    const parts = normalizedPath.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      const directoryPath = parts.slice(0, index).join("/");
      const current = statuses.get(directoryPath);
      if (
        !current ||
        (current.source === "folder" &&
          current.tone !== "modified" &&
          fileStatus.tone === "modified")
      ) {
        statuses.set(directoryPath, createFolderGitStatus(fileStatus.tone));
      }
    }
  }
  return statuses;
}

function findGitStatusForTreeEntry(
  statuses: Map<string, GitStatusBadge>,
  entry: import("@hyperfocus/ai-core/protocol").IdeFileTreeEntry,
) {
  const exact = statuses.get(normalizeGitStatusPath(entry.path));
  if (!exact) {
    return undefined;
  }
  if (entry.kind === "file" && exact.source === "file") {
    return exact;
  }
  if (entry.kind === "directory") {
    return exact.source === "file" ? createFolderGitStatus(exact.tone) : exact;
  }
  return undefined;
}

function createFolderGitStatus(tone: GitStatusBadge["tone"]): GitStatusBadge {
  return { label: "*", tone, source: "folder" };
}


function toGitStatusBadge(
  change: import("@hyperfocus/ai-core/protocol").IdeGitChange,
): GitStatusBadge | undefined {
  if (change.status === "untracked" || change.status === "added") {
    return { label: change.shortStatus, tone: "added", source: "file" };
  }
  if (change.status === "modified") {
    return { label: change.shortStatus, tone: "modified", source: "file" };
  }
  return undefined;
}

function flattenVisibleTree(
  entries: import("@hyperfocus/ai-core/protocol").IdeFileTreeEntry[],
  expandedFolderPaths: string[],
) {
  const expanded = new Set(expandedFolderPaths);
  const byParent = new Map<
    string,
    import("@hyperfocus/ai-core/protocol").IdeFileTreeEntry[]
  >();
  for (const entry of entries) {
    const parent = entry.parentPath ?? "";
    byParent.set(parent, [...(byParent.get(parent) ?? []), entry]);
  }
  const sortEntries = (
    items: import("@hyperfocus/ai-core/protocol").IdeFileTreeEntry[],
  ) =>
    [...items].sort(
      (left, right) =>
        Number(right.kind === "directory") -
          Number(left.kind === "directory") ||
        left.name.localeCompare(right.name),
    );
  const output: import("@hyperfocus/ai-core/protocol").IdeFileTreeEntry[] = [];
  const visit = (parentPath: string, depth: number) => {
    for (const entry of sortEntries(byParent.get(parentPath) ?? [])) {
      output.push({ ...entry, depth });
      if (entry.kind === "directory" && expanded.has(entry.path)) {
        visit(entry.path, depth + 1);
      }
    }
  };
  visit("", 0);
  return output;
}

function SourceControlView(props: {
  branch?: string;
  isRepository: boolean;
  changes: import("@hyperfocus/ai-core/protocol").IdeGitChange[];
  loading: boolean;
  onOpenPath: (path: string) => void;
}) {
  return (
    <div
      class={
        stylex.attrs(
          ideUtilityStyles.flex,
          ideUtilityStyles.minH0,
          ideUtilityStyles.flex1,
          ideUtilityStyles.flexCol,
          ideUtilityStyles.gap3,
          ideUtilityStyles.overflowAuto,
          ideUtilityStyles.p3,
          ideUtilityStyles.textXs,
        ).class
      }
    >
      <div
        class={
          stylex.attrs(
            ideUtilityStyles.roundedLg,
            ideUtilityStyles.border,
            ideUtilityStyles.borderIde,
            ideUtilityStyles.bgIdeRow,
            ideUtilityStyles.p2,
          ).class
        }
      >
        <div
          class={
            stylex.attrs(
              ideUtilityStyles.flex,
              ideUtilityStyles.itemsCenter,
              ideUtilityStyles.gap2,
              ideUtilityStyles.fontSemibold,
              ideUtilityStyles.textIdeText,
            ).class
          }
        >
          <GitBranch
            class={
              stylex.attrs(ideUtilityStyles.h35, ideUtilityStyles.w35).class
            }
          />
          {props.branch ??
            (props.isRepository ? "detached" : "No git repository")}
        </div>
        <div
          class={
            stylex.attrs(ideUtilityStyles.mt1, ideUtilityStyles.textIdeMuted)
              .class
          }
        >
          {props.loading
            ? "Loading..."
            : `${props.changes.length} pending changes`}
        </div>
      </div>
      <For each={props.changes}>
        {(item) => (
          <button
            type="button"
            class={stylex.attrs(ideStyles.scmRow).class}
            onClick={() => props.onOpenPath(item.path)}
          >
            <span class={stylex.attrs(ideStyles.scmBadge).class}>
              {item.shortStatus}
            </span>
            <span class={stylex.attrs(ideUtilityStyles.truncate).class}>
              {item.path}
            </span>
          </button>
        )}
      </For>
    </div>
  );
}

function Breadcrumbs(props: { file?: IdeFile }) {
  const parts = createMemo(() =>
    props.file
      ? [...props.file.path.split("/"), ...props.file.symbols.slice(0, 1)]
      : ["No editor"],
  );
  return (
    <nav
      class={
        stylex.attrs(
          ideUtilityStyles.flex,
          ideUtilityStyles.minW0,
          ideUtilityStyles.itemsCenter,
          ideUtilityStyles.gap1,
          ideUtilityStyles.textXs,
          ideUtilityStyles.textIdeMuted,
        ).class
      }
      aria-label="Editor breadcrumbs"
    >
      <For each={parts()}>
        {(part, index) => (
          <>
            <span
              class={cn(
                stylex.attrs(ideUtilityStyles.truncate).class,
                index() === parts().length - 1
                  ? stylex.attrs(
                      ideUtilityStyles.fontSemibold,
                      ideUtilityStyles.textIdeText,
                    ).class
                  : undefined,
              )}
            >
              {part}
            </span>
            <Show when={index() < parts().length - 1}>
              <ChevronRight
                class={
                  stylex.attrs(
                    ideUtilityStyles.h3,
                    ideUtilityStyles.w3,
                    ideUtilityStyles.shrink0,
                  ).class
                }
              />
            </Show>
          </>
        )}
      </For>
    </nav>
  );
}

type EditorSurfaceProps = {
  file?: IdeFile;
  widthPercent: number;
  documentFindOpen: boolean;
  documentFindQuery: string;
  wordWrap: "off" | "on";
  tabSize: 2 | 4;
  bracketPairColorization: boolean;
  dirty: boolean;
  completionState?: CompletionState;
  findInputRef: (element: HTMLInputElement | undefined) => void;
  onDocumentFindQuery: (query: string) => void;
  onDocumentFindClose: () => void;
  onContentChange: (path: string, content: string) => void;
  onSave: () => void;
  onCloseTab: () => void;
  onGoToDefinition: (file: IdeFile, line: number, column: number) => void;
  onCompletionRequest: (
    x: number,
    y: number,
    path: string,
    position: number,
    prefix: string,
    items: string[],
  ) => void;
  onCompletionSelect: (value: string) => void;
  onCompletionClose: () => void;
  onCursor: (line: number, column: number) => void;
  onContextMenu: (event: MouseEvent) => void;
};

function createEditorSurfaceModel(props: EditorSurfaceProps) {
  const [scrollPosition, setScrollPosition] = createSignal({ left: 0, top: 0 });
  const [symbolHover, setSymbolHover] = createSignal<SymbolHoverState>();
  const [draft, setDraft] = createSignal<EditorDraft>({
    text: "",
    sourceText: "",
  });
  let textareaRef: HTMLTextAreaElement | undefined;
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  const editorText = createMemo(() => {
    const file = props.file;
    if (!file) {
      return "";
    }
    const currentFile = ideStore.state.filesByPath[file.path];
    return (
      currentFile?.content ??
      currentFile?.contentLines.join("\n") ??
      file.content ??
      file.contentLines.join("\n") ??
      ""
    );
  });
  const displayedText = () =>
    props.file?.path === draft().path ? draft().text : editorText();
  const displayedLines = () => displayedText().split(/\r\n|\r|\n/);
  const matchCount = createMemo(() =>
    countDocumentMatches(displayedLines(), props.documentFindQuery),
  );

  createEffect(() => {
    const file = props.file;
    const sourceText = editorText();
    const current = untrack(draft);
    setDraft(() => {
      if (current.path !== file?.path || current.sourceText !== sourceText) {
        if (
          current.path === file?.path &&
          current.text !== current.sourceText &&
          sourceText === current.sourceText
        ) {
          return current;
        }
        if (current.path === file?.path && current.text === sourceText) {
          return { ...current, sourceText };
        }
        return { path: file?.path, text: sourceText, sourceText };
      }
      return current;
    });
  });

  onCleanup(() => {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
    }
  });

  function updateCursor() {
    const textarea = textareaRef;
    if (!textarea) {
      return;
    }
    updateCursorFromTextarea(textarea);
  }

  function updateCursorFromTextarea(textarea: HTMLTextAreaElement) {
    if (!props.file) {
      return;
    }
    const before = textarea.value.slice(0, textarea.selectionStart).split("\n");
    props.onCursor(before.length, (before.at(-1)?.length ?? 0) + 1);
  }

  function handleInput(textarea: HTMLTextAreaElement) {
    const file = props.file;
    if (!file) {
      return;
    }
    const currentDraft = draft();
    setDraft({
      path: file.path,
      text: textarea.value,
      sourceText:
        currentDraft.path === file.path
          ? currentDraft.sourceText
          : editorText(),
    });
    setScrollPosition({ left: textarea.scrollLeft, top: textarea.scrollTop });
    props.onContentChange(file.path, textarea.value);
    updateCursorFromTextarea(textarea);
  }

  function handleDefinition(event: MouseEvent | KeyboardEvent) {
    const file = props.file;
    if (!file) {
      return;
    }
    if (event instanceof MouseEvent && !(event.metaKey || event.ctrlKey)) {
      return;
    }
    event.preventDefault();
    const position = getTextPosition(
      textareaRef?.value ?? "",
      textareaRef?.selectionStart ?? 0,
    );
    props.onCursor(position.line, position.column);
    props.onGoToDefinition(file, position.line, position.column);
  }

  function showCompletions() {
    const file = props.file;
    const textarea = textareaRef;
    if (!file || !textarea) {
      return;
    }
    const prefix = getCompletionPrefix(textarea.value, textarea.selectionStart);
    const items = buildCompletionItems(file, prefix);
    if (items.length > 0) {
      props.onCompletionRequest(
        64,
        44,
        file.path,
        textarea.selectionStart,
        prefix,
        items,
      );
    }
  }

  function clearSymbolHover() {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = undefined;
    }
    setSymbolHover(undefined);
  }

  function scheduleSymbolHover(event: MouseEvent) {
    const file = props.file;
    const textarea = textareaRef;
    if (!file || !textarea) {
      clearSymbolHover();
      return;
    }

    const hoverTarget = getHoverTextPosition(textarea, event);
    const lineText = displayedLines()[hoverTarget.line - 1] ?? "";
    const symbol = getWordAtPosition(lineText, hoverTarget.column);
    if (!symbol) {
      clearSymbolHover();
      return;
    }

    if (hoverTimer) {
      clearTimeout(hoverTimer);
    }
    const x = event.clientX;
    const y = event.clientY;
    hoverTimer = setTimeout(() => {
      const detail = describeSymbolHover(file, symbol);
      if (detail) {
        setSymbolHover({ x, y, symbol, detail });
      }
    }, 200);
  }

  return {
    scrollPosition,
    setScrollPosition,
    symbolHover,
    displayedText,
    displayedLines,
    matchCount,
    setTextareaRef: (element: HTMLTextAreaElement) => {
      textareaRef = element;
    },
    updateCursor,
    handleInput,
    handleDefinition,
    showCompletions,
    clearSymbolHover,
    scheduleSymbolHover,
  };
}

type EditorSurfaceModel = ReturnType<typeof createEditorSurfaceModel>;
const EditorSurfaceContext = createContext<{ editor: EditorSurfaceProps; model: EditorSurfaceModel }>();
function useEditorSurface() {
  const surface = useContext(EditorSurfaceContext);
  if (!surface) throw new Error("Editor controls require their surface provider.");
  return surface;
}


function EditorFindControl() {
  const { editor, model } = useEditorSurface();
  return (
    <Show when={editor.documentFindOpen}>
      <div class={stylex.attrs(
        ideStyles.commandSurface,
        ideUtilityStyles.absolute,
        ideUtilityStyles.right3,
        ideUtilityStyles.top3,
        ideUtilityStyles.z10,
        ideUtilityStyles.flex,
        ideUtilityStyles.itemsCenter,
        ideUtilityStyles.gap1,
        ideUtilityStyles.roundedLg,
        ideUtilityStyles.border,
        ideUtilityStyles.borderIde,
        ideUtilityStyles.bgIdeSurface,
        ideUtilityStyles.p1,
        ideUtilityStyles.shadowXl,
      ).class}>
        <Search class={stylex.attrs(
          ideUtilityStyles.h35,
          ideUtilityStyles.w35,
          ideUtilityStyles.textIdeMuted,
        ).class} />
        <input
          ref={editor.findInputRef}
          class={stylex.attrs(
            ideUtilityStyles.h7,
            ideUtilityStyles.w44,
            ideUtilityStyles.bgTransparent,
            ideUtilityStyles.px1,
            ideUtilityStyles.textXs,
            ideUtilityStyles.textIdeText,
            ideUtilityStyles.outlineNone,
          ).class}
          aria-label="Find in current document"
          value={editor.documentFindQuery}
          placeholder="Find"
          onInput={(event) => editor.onDocumentFindQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") editor.onDocumentFindClose();
          }}
        />
        <span class={stylex.attrs(
          ideUtilityStyles.minW10,
          ideUtilityStyles.textRight,
          ideUtilityStyles.text065,
          ideUtilityStyles.textIdeMuted,
        ).class}>
          {model.matchCount()}
        </span>
        <ActionButton
          tooltip="Close document search"
          ariaLabel="Close document search"
          icon={<X class={stylex.attrs(ideUtilityStyles.h35, ideUtilityStyles.w35).class} />}
          variant="ghost"
          size="icon"
          class={stylex.attrs(
            ideUtilityStyles.h7,
            ideUtilityStyles.w7,
            ideUtilityStyles.roundedMd,
          ).class}
          onClick={editor.onDocumentFindClose}
        />
      </div>
    </Show>
  );
}

function EditorCodeLayer(props: {
  file: IdeFile;
}) {
  const { editor, model } = useEditorSurface();
  return (
    <div
      class={stylex.attrs(
        ideUtilityStyles.pointerEventsNone,
        ideUtilityStyles.absolute,
        ideUtilityStyles.inset0,
        ideUtilityStyles.minHFull,
        ideUtilityStyles.p3,
        ideUtilityStyles.pr6,
      ).class}
      style={{
        transform: `translate(${-model.scrollPosition().left}px, ${-model.scrollPosition().top}px)`,
      }}
    >
      <For each={model.displayedLines()}>
        {(line, index) => (
          <div
            data-test-ide-code-line={String(index() + 1)}
            data-word-wrap={editor.wordWrap}
            class={cn(
              stylex.attrs(ideStyles.codeLine, ideUtilityStyles.grid, ideUtilityStyles.gridCode).class,
              editor.wordWrap === "on" ? stylex.attrs(ideStyles.codeLineWrap).class : undefined,
            )}
          >
            <span class={stylex.attrs(
              ideUtilityStyles.selectNone,
              ideUtilityStyles.pr3,
              ideUtilityStyles.textRight,
              ideUtilityStyles.textIdeMuted,
            ).class}>
              {index() + 1}
            </span>
            <span
              data-test-ide-code-text={String(index() + 1)}
              class={cn(
                stylex.attrs(ideStyles.codeCell, ideUtilityStyles.whitespacePre).class,
                editor.wordWrap === "on" ? stylex.attrs(ideStyles.codeCellWrap).class : undefined,
                editor.bracketPairColorization ? stylex.attrs(ideStyles.codeColorized).class : undefined,
              )}
            >
              <For each={syntaxHighlightLine(line, props.file.language)}>
                {(token) => <span class={tokenClass(token.kind)}>{token.text}</span>}
              </For>
            </span>
          </div>
        )}
      </For>
    </div>
  );
}

function EditorTextarea(props: {
  file: IdeFile;
}) {
  const { editor, model } = useEditorSurface();
  const handleKeyDown = (event: KeyboardEvent) => {
    model.clearSymbolHover();
    if (eventMatchesHotkeys(
      event,
      normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences).ideCloseEditor,
    )) {
      event.preventDefault();
      event.stopPropagation();
      editor.onCloseTab();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      editor.onSave();
      return;
    }
    if (event.key === "F12") {
      model.handleDefinition(event);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === " ") {
      event.preventDefault();
      model.showCompletions();
      return;
    }
    editor.onCompletionClose();
  };
  return (
    <textarea
      ref={model.setTextareaRef}
      aria-label={`Edit ${props.file.name}`}
      data-word-wrap={editor.wordWrap}
      spellcheck={false}
      class={cn(
        stylex.attrs(
          ideStyles.codeInput,
          ideUtilityStyles.absolute,
          ideUtilityStyles.inset0,
          ideUtilityStyles.hFull,
          ideUtilityStyles.wFull,
          ideUtilityStyles.resizeNone,
          ideUtilityStyles.p3,
          ideUtilityStyles.pr6,
          ideUtilityStyles.fontMono,
          ideUtilityStyles.text078,
          ideUtilityStyles.leading6,
          ideUtilityStyles.outlineNone,
        ).class,
        editor.wordWrap === "on" ? stylex.attrs(ideStyles.codeInputWrap).class : undefined,
      )}
      value={model.displayedText()}
      onInput={(event) => model.handleInput(event.currentTarget)}
      onScroll={(event) => {
        model.setScrollPosition({
          left: event.currentTarget.scrollLeft,
          top: event.currentTarget.scrollTop,
        });
        model.clearSymbolHover();
      }}
      onMouseMove={model.scheduleSymbolHover}
      onMouseLeave={model.clearSymbolHover}
      onClick={(event) => {
        model.clearSymbolHover();
        model.updateCursor();
        model.handleDefinition(event);
      }}
      onKeyUp={model.updateCursor}
      onSelect={model.updateCursor}
      onKeyDown={handleKeyDown}
    />
  );
}

function EditorOverlays() {
  const { editor, model } = useEditorSurface();
  return (
    <>
      <Show when={editor.completionState}>
        {(completion) => (
          <div
            class={stylex.attrs(
              ideStyles.completion,
              ideUtilityStyles.absolute,
              ideUtilityStyles.z20,
              ideUtilityStyles.w56,
              ideUtilityStyles.overflowHidden,
              ideUtilityStyles.roundedLg,
              ideUtilityStyles.border,
              ideUtilityStyles.borderIde,
              ideUtilityStyles.bgIdeSurface,
              ideUtilityStyles.shadowXl,
            ).class}
            style={{ left: `${completion().x}px`, top: `${completion().y}px` }}
          >
            <For each={completion().items}>
              {(item) => (
                <button
                  type="button"
                  class={stylex.attrs(ideStyles.completionRow).class}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => editor.onCompletionSelect(item)}
                >
                  {item}
                </button>
              )}
            </For>
          </div>
        )}
      </Show>
      <Show when={model.symbolHover()}>
        {(hover) => (
          <div
            data-test-ide-symbol-tooltip=""
            class={stylex.attrs(
              ideStyles.tooltip,
              ideUtilityStyles.fixed,
              ideUtilityStyles.z30,
              ideUtilityStyles.maxWSm,
              ideUtilityStyles.overflowHidden,
              ideUtilityStyles.roundedLg,
              ideUtilityStyles.border,
              ideUtilityStyles.borderIde,
              ideUtilityStyles.bgIdeSurface,
              ideUtilityStyles.p3,
              ideUtilityStyles.textXs,
              ideUtilityStyles.shadowXl,
            ).class}
            style={{ left: `${hover().x - 48}px`, top: `${hover().y - 88}px` }}
          >
            <div class={stylex.attrs(
              ideUtilityStyles.fontMono,
              ideUtilityStyles.text072,
              ideUtilityStyles.fontSemibold,
              ideUtilityStyles.textIdeText,
            ).class}>
              {hover().symbol}
            </div>
            <div class={stylex.attrs(
              ideUtilityStyles.mt1,
              ideUtilityStyles.whitespacePreWrap,
              ideUtilityStyles.text068,
              ideUtilityStyles.leading5,
              ideUtilityStyles.textIdeMuted,
            ).class}>
              {hover().detail}
            </div>
          </div>
        )}
      </Show>
    </>
  );
}

function EditorDocument() {
  const { editor } = useEditorSurface();
  return (
    <Show
      when={editor.file}
      fallback={<div class={stylex.attrs(
        ideUtilityStyles.flex,
        ideUtilityStyles.hFull,
        ideUtilityStyles.itemsCenter,
        ideUtilityStyles.justifyCenter,
        ideUtilityStyles.textXs,
        ideUtilityStyles.textIdeMuted,
      ).class}>Open a file from Explorer.</div>}
    >
      {(file) => (
        <div
          class={stylex.attrs(
            ideUtilityStyles.relative,
            ideUtilityStyles.hFull,
            ideUtilityStyles.minW0,
            ideUtilityStyles.overflowHidden,
            ideUtilityStyles.fontMono,
            ideUtilityStyles.text078,
            ideUtilityStyles.leading6,
          ).class}
          style={{ "tab-size": String(editor.tabSize) }}
        >
          <Show
            when={!file().isBinary && !file().tooLarge}
            fallback={<div class={stylex.attrs(
              ideUtilityStyles.p3,
              ideUtilityStyles.textXs,
              ideUtilityStyles.textIdeMuted,
            ).class}>Binary or oversized file preview is unavailable.</div>}
          >
            <EditorCodeLayer file={file()} />
            <EditorTextarea file={file()} />
            <EditorOverlays />
          </Show>
          <Show when={editor.dirty}>
            <div class={stylex.attrs(
              ideUtilityStyles.absolute,
              ideUtilityStyles.bottom3,
              ideUtilityStyles.right3,
              ideUtilityStyles.roundedMd,
              ideUtilityStyles.border,
              ideUtilityStyles.borderIde,
              ideUtilityStyles.bgIdeSurface,
              ideUtilityStyles.px2,
              ideUtilityStyles.py1,
              ideUtilityStyles.text065,
              ideUtilityStyles.fontSemibold,
              ideUtilityStyles.textIdeMuted,
            ).class}>Unsaved</div>
          </Show>
        </div>
      )}
    </Show>
  );
}

function EditorSurface(props: EditorSurfaceProps) {
  const model = createEditorSurfaceModel(props);

  return (
    <EditorSurfaceContext.Provider value={{ editor: props, model }}><div
      class={
        stylex.attrs(
          ideStyles.editorSurface,
          ideUtilityStyles.relative,
          ideUtilityStyles.minW0,
          ideUtilityStyles.flex1,
          ideUtilityStyles.overflowHidden,
        ).class
      }
      style={{ width: `${props.widthPercent}%` }}
      onContextMenu={props.onContextMenu}
    >
      <EditorFindControl />
      <EditorDocument />
    </div></EditorSurfaceContext.Provider>
  );
}


type SyntaxToken = {
  text: string;
  kind:
    | "plain"
    | "keyword"
    | "string"
    | "number"
    | "comment"
    | "property"
    | "punctuation";
};

function tokenClass(kind: SyntaxToken["kind"]) {
  switch (kind) {
    case "keyword":
      return stylex.attrs(ideStyles.tokenKeyword).class;
    case "string":
      return stylex.attrs(ideStyles.tokenString).class;
    case "number":
      return stylex.attrs(ideStyles.tokenNumber).class;
    case "comment":
      return stylex.attrs(ideStyles.tokenComment).class;
    case "property":
      return stylex.attrs(ideStyles.tokenProperty).class;
    case "punctuation":
      return stylex.attrs(ideStyles.tokenPunctuation).class;
    case "plain":
      return undefined;
  }
}

const languageKeywords = new Map<string, Set<string>>([
  [
    "TypeScript",
    new Set([
      "async",
      "await",
      "break",
      "case",
      "catch",
      "class",
      "const",
      "continue",
      "default",
      "else",
      "export",
      "extends",
      "false",
      "for",
      "from",
      "function",
      "if",
      "import",
      "interface",
      "let",
      "new",
      "null",
      "return",
      "true",
      "try",
      "type",
      "undefined",
      "while",
    ]),
  ],
  [
    "JavaScript",
    new Set([
      "async",
      "await",
      "break",
      "case",
      "catch",
      "class",
      "const",
      "continue",
      "default",
      "else",
      "export",
      "extends",
      "false",
      "for",
      "from",
      "function",
      "if",
      "import",
      "let",
      "new",
      "null",
      "return",
      "true",
      "try",
      "undefined",
      "while",
    ]),
  ],
  [
    "Python",
    new Set([
      "and",
      "as",
      "async",
      "await",
      "class",
      "def",
      "elif",
      "else",
      "except",
      "False",
      "for",
      "from",
      "if",
      "import",
      "in",
      "is",
      "None",
      "not",
      "or",
      "pass",
      "return",
      "True",
      "try",
      "while",
      "with",
    ]),
  ],
  [
    "Rust",
    new Set([
      "async",
      "await",
      "const",
      "crate",
      "else",
      "enum",
      "false",
      "fn",
      "for",
      "if",
      "impl",
      "let",
      "match",
      "mod",
      "mut",
      "pub",
      "return",
      "self",
      "struct",
      "true",
      "use",
      "where",
      "while",
    ]),
  ],
  [
    "CSS",
    new Set([
      "display",
      "flex",
      "grid",
      "color",
      "background",
      "border",
      "padding",
      "margin",
      "width",
      "height",
      "position",
    ]),
  ],
  [
    "HTML",
    new Set([
      "html",
      "head",
      "body",
      "script",
      "style",
      "div",
      "span",
      "button",
      "input",
      "section",
      "main",
    ]),
  ],
  ["Markdown", new Set(["TODO", "NOTE", "FIXME"])],
  ["JSON", new Set(["true", "false", "null"])],
]);

function syntaxHighlightLine(line: string, language: string): SyntaxToken[] {
  const commentIndex =
    language === "Python" ? line.indexOf("#") : line.indexOf("//");
  const code = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
  const comment = commentIndex >= 0 ? line.slice(commentIndex) : "";
  const keywords = languageKeywords.get(language) ?? new Set<string>();
  const tokens: SyntaxToken[] = [];
  const pattern =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$-]*\b|[{}()[\].,:;=+\-*/<>!&|?]+)/g;
  let cursor = 0;
  for (const match of code.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      tokens.push({ text: code.slice(cursor, index), kind: "plain" });
    }
    const text = match[0];
    const next = code.slice(index + text.length).trimStart();
    tokens.push({
      text,
      kind: /^["'`]/.test(text)
        ? "string"
        : /^\d/.test(text)
          ? "number"
          : keywords.has(text)
            ? "keyword"
            : next.startsWith(":")
              ? "property"
              : /^[{}()[\].,:;=+\-*/<>!&|?]+$/.test(text)
                ? "punctuation"
                : "plain",
    });
    cursor = index + text.length;
  }
  if (cursor < code.length) {
    tokens.push({ text: code.slice(cursor), kind: "plain" });
  }
  if (comment) {
    tokens.push({ text: comment, kind: "comment" });
  }
  return tokens.length > 0 ? tokens : [{ text: "", kind: "plain" }];
}


function findDefinitionLine(lines: string[], symbol: string) {
  if (!symbol) {
    return undefined;
  }
  const escaped = escapeRegExp(symbol);
  const patterns = [
    new RegExp(
      `\\b(function|class|interface|type|const|let|var)\\s+${escaped}\\b`,
    ),
    new RegExp(
      `\\b${escaped}\\s*[:=]\\s*(async\\s*)?(function|\\([^)]*\\)\\s*=>|[A-Za-z_$][\\w$]*\\s*=>)`,
    ),
    new RegExp(`\\bdef\\s+${escaped}\\b`),
    new RegExp(`\\bfn\\s+${escaped}\\b`),
  ];
  const index = lines.findIndex((line) =>
    patterns.some((pattern) => pattern.test(line)),
  );
  return index >= 0 ? index + 1 : undefined;
}


function buildCompletionItems(file: IdeFile, prefix: string) {
  const words = new Set<string>(languageKeywords.get(file.language) ?? []);
  for (const match of (file.content ?? file.contentLines.join("\n")).matchAll(
    /\b[A-Za-z_$][\w$]{2,}\b/g,
  )) {
    words.add(match[0]);
  }
  return [...words]
    .filter(
      (word) =>
        word !== prefix &&
        (!prefix || word.toLowerCase().startsWith(prefix.toLowerCase())),
    )
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 8);
}

function getHoverTextPosition(
  textarea: HTMLTextAreaElement,
  event: MouseEvent,
) {
  const rect = textarea.getBoundingClientRect();
  const computed = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(computed.lineHeight) || 24;
  const paddingLeft = Number.parseFloat(computed.paddingLeft) || 0;
  const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
  const charWidth = getMonospaceCharacterWidth(textarea);
  const x = Math.max(
    0,
    event.clientX - rect.left + textarea.scrollLeft - paddingLeft,
  );
  const y = Math.max(
    0,
    event.clientY - rect.top + textarea.scrollTop - paddingTop,
  );
  return {
    line: Math.floor(y / lineHeight) + 1,
    column: Math.floor(x / charWidth) + 1,
  };
}

function getMonospaceCharacterWidth(element: HTMLElement) {
  const computed = window.getComputedStyle(element);
  const probe = document.createElement("span");
  probe.textContent = "0000000000";
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.fontFamily = computed.fontFamily;
  probe.style.fontSize = computed.fontSize;
  probe.style.fontWeight = computed.fontWeight;
  probe.style.letterSpacing = computed.letterSpacing;
  document.body.append(probe);
  const width = probe.getBoundingClientRect().width / 10;
  probe.remove();
  return width || 8;
}

function describeSymbolHover(file: IdeFile, symbol: string) {
  const definitionLine = findDefinitionLine(file.contentLines, symbol);
  const declaration = definitionLine
    ? file.contentLines[definitionLine - 1]?.trim()
    : undefined;
  const keyword = languageKeywords.get(file.language)?.has(symbol)
    ? `${symbol}: ${file.language} keyword`
    : undefined;
  if (declaration) {
    return `${declaration}\n\nDefined in ${file.name}:${definitionLine}`;
  }
  return keyword ?? `${symbol}: symbol\n\nNo local definition found.`;
}





function StatusBar(props: {
  branch: string;
  dirtyCount: number;
  line: number;
  column: number;
  encoding: string;
  language: string;
}) {
  return (
    <footer
      class={
        stylex.attrs(
          ideStyles.statusBar,
          ideUtilityStyles.flex,
          ideUtilityStyles.h7,
          ideUtilityStyles.shrink0,
          ideUtilityStyles.itemsCenter,
          ideUtilityStyles.justifyBetween,
          ideUtilityStyles.gap3,
          ideUtilityStyles.px3,
          ideUtilityStyles.text068,
          ideUtilityStyles.fontMedium,
        ).class
      }
    >
      <div
        class={
          stylex.attrs(
            ideUtilityStyles.flex,
            ideUtilityStyles.minW0,
            ideUtilityStyles.itemsCenter,
            ideUtilityStyles.gap3,
          ).class
        }
      >
        <span
          class={
            stylex.attrs(
              ideUtilityStyles.inlineFlex,
              ideUtilityStyles.itemsCenter,
              ideUtilityStyles.gap1,
            ).class
          }
        >
          <GitBranch
            class={
              stylex.attrs(ideUtilityStyles.h35, ideUtilityStyles.w35).class
            }
          />
          {props.branch}
        </span>
        <span
          class={
            stylex.attrs(
              ideUtilityStyles.inlineFlex,
              ideUtilityStyles.itemsCenter,
              ideUtilityStyles.gap1,
            ).class
          }
        >
          <GitCommit
            class={
              stylex.attrs(ideUtilityStyles.h35, ideUtilityStyles.w35).class
            }
          />
          {props.dirtyCount} dirty
        </span>
        <span
          class={
            stylex.attrs(
              ideUtilityStyles.inlineFlex,
              ideUtilityStyles.itemsCenter,
              ideUtilityStyles.gap1,
            ).class
          }
        >
          <GitPullRequest
            class={
              stylex.attrs(ideUtilityStyles.h35, ideUtilityStyles.w35).class
            }
          />
          0 PR
        </span>
      </div>
      <div
        class={
          stylex.attrs(
            ideUtilityStyles.flex,
            ideUtilityStyles.shrink0,
            ideUtilityStyles.itemsCenter,
            ideUtilityStyles.gap3,
          ).class
        }
      >
        <span>
          Ln {props.line}, Col {props.column}
        </span>
        <span>{props.encoding}</span>
        <span>{props.language}</span>
      </div>
    </footer>
  );
}

function CommandPalette(props: {
  open: boolean;
  query: string;
  commands: Array<{
    id: string;
    label: string;
    detail: string;
    run: () => void;
  }>;
  onQuery: (query: string) => void;
  onClose: () => void;
}) {
  const isOpen = createMemo(() => props.open);
  let inputRef: HTMLInputElement | undefined;

  createEffect(() => {
    if (isOpen()) {
      queueMicrotask(() => inputRef?.focus());
    }
  });

  return (
    <Show when={isOpen()}>
      <div
        class={
          stylex.attrs(
            ideUtilityStyles.fixed,
            ideUtilityStyles.inset0,
            ideUtilityStyles.z90,
            ideUtilityStyles.bgBlack35,
            ideUtilityStyles.px3,
            ideUtilityStyles.ptViewport,
          ).class
        }
        onPointerDown={props.onClose}
      >
        <section
          class={
            stylex.attrs(
              ideStyles.commandSurface,
              ideUtilityStyles.mxAuto,
              ideUtilityStyles.flex,
              ideUtilityStyles.wFull,
              ideUtilityStyles.maxW2xl,
              ideUtilityStyles.flexCol,
              ideUtilityStyles.overflowHidden,
              ideUtilityStyles.rounded2xl,
              ideUtilityStyles.border,
              ideUtilityStyles.borderIde,
              ideUtilityStyles.bgIdeSurface,
              ideUtilityStyles.shadow2xl,
            ).class
          }
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div
            class={
              stylex.attrs(
                ideUtilityStyles.flex,
                ideUtilityStyles.itemsCenter,
                ideUtilityStyles.gap2,
                ideUtilityStyles.borderB,
                ideUtilityStyles.borderIde,
                ideUtilityStyles.px3,
                ideUtilityStyles.py2,
              ).class
            }
          >
            <Code2
              class={
                stylex.attrs(
                  ideUtilityStyles.h4,
                  ideUtilityStyles.w4,
                  ideUtilityStyles.textIdeMuted,
                ).class
              }
            />
            <input
              ref={inputRef}
              data-test-ide-command-input=""
              class={
                stylex.attrs(
                  ideUtilityStyles.h9,
                  ideUtilityStyles.minW0,
                  ideUtilityStyles.flex1,
                  ideUtilityStyles.bgTransparent,
                  ideUtilityStyles.textSm,
                  ideUtilityStyles.textIdeText,
                  ideUtilityStyles.outlineNone,
                ).class
              }
              aria-label="IDE command palette"
              value={props.query}
              placeholder="Type a command"
              onInput={(event) => props.onQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  props.onClose();
                }
                if (event.key === "Enter") {
                  props.commands[0]?.run();
                  props.onClose();
                }
              }}
            />
          </div>
          <div
            class={
              stylex.attrs(
                ideUtilityStyles.maxH80,
                ideUtilityStyles.overflowAuto,
                ideUtilityStyles.p15,
              ).class
            }
          >
            <For each={props.commands}>
              {(command) => (
                <button
                  type="button"
                  class={stylex.attrs(ideStyles.commandRow).class}
                  onClick={() => {
                    command.run();
                    props.onClose();
                  }}
                >
                  <span
                    class={
                      stylex.attrs(
                        ideUtilityStyles.fontSemibold,
                        ideUtilityStyles.textIdeText,
                      ).class
                    }
                  >
                    {command.label}
                  </span>
                  <span
                    class={
                      stylex.attrs(
                        ideUtilityStyles.truncate,
                        ideUtilityStyles.textIdeMuted,
                      ).class
                    }
                  >
                    {command.detail}
                  </span>
                </button>
              )}
            </For>
          </div>
        </section>
      </div>
    </Show>
  );
}


function formatHotkeyDisplay(hotkey: string | undefined) {
  if (!hotkey) {
    return "";
  }
  return formatForDisplay(hotkey)
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" + ");
}

function closeAllEditorSequence(hotkey: string | undefined) {
  const normalized = hotkey?.replace(/\s+/g, "") || "Mod+K+W";
  const parts = normalized.split("+").filter(Boolean);
  if (parts.length >= 3 && parts.at(-2)?.toLowerCase() === "k") {
    return [`${parts.slice(0, -1).join("+")}`, parts.at(-1) ?? "W"].filter(isValidAppHotkey);
  }
  return [normalized].filter(isValidAppHotkey);
}

function eventMatchesHotkeys(event: KeyboardEvent, hotkeys: string[]) {
  return hotkeys.some((hotkey) => eventMatchesHotkey(event, hotkey));
}

function eventMatchesHotkey(event: KeyboardEvent, hotkey: string | undefined) {
  if (!hotkey) {
    return false;
  }
  const actual = normalizeKeyboardEventChord(event);
  const expected = normalizeHotkeyChord(hotkey);
  return (
    actual.key === expected.key &&
    actual.modifiers.size === expected.modifiers.size &&
    [...actual.modifiers].every((modifier) => expected.modifiers.has(modifier))
  );
}

function normalizeKeyboardEventChord(event: KeyboardEvent) {
  const modifiers = new Set<string>();
  if (event.metaKey || event.ctrlKey) {
    modifiers.add("mod");
  }
  if (event.altKey) {
    modifiers.add("alt");
  }
  if (event.shiftKey) {
    modifiers.add("shift");
  }
  return {
    modifiers,
    key: normalizeHotkeyKey(event.key === " " ? "space" : event.key),
  };
}

function normalizeHotkeyChord(hotkey: string) {
  const parts = hotkey
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const modifiers = new Set<string>();
  for (const part of parts.slice(0, -1)) {
    const normalized = part.toLowerCase();
    if (
      ["mod", "meta", "cmd", "command", "ctrl", "control"].includes(normalized)
    ) {
      modifiers.add("mod");
    } else if (normalized === "alt" || normalized === "option") {
      modifiers.add("alt");
    } else if (normalized === "shift") {
      modifiers.add("shift");
    }
  }
  return {
    modifiers,
    key: normalizeHotkeyKey(parts.at(-1) ?? ""),
  };
}


function Sash(props: {
  label: string;
  orientation: "vertical" | "horizontal";
  onPointerDown: (event: PointerEvent) => void;
}) {
  return (
    <Tooltip content={props.label}>
      <button
        type="button"
        data-test-ide-sash=""
        class={cn(
          stylex.attrs(ideStyles.sash).class,
          props.orientation === "vertical"
            ? stylex.attrs(ideStyles.sashVertical).class
            : stylex.attrs(ideStyles.sashHorizontal).class,
        )}
        aria-label={props.label}
        onPointerDown={props.onPointerDown}
      />
    </Tooltip>
  );
}

function SidebarSkeleton() {
  return (
    <div
      data-test-ide-sidebar-skeleton=""
      class={
        stylex.attrs(
          ideUtilityStyles.flex,
          ideUtilityStyles.flexCol,
          ideUtilityStyles.gap2,
          ideUtilityStyles.p3,
        ).class
      }
    >
      <For each={[1, 2, 3, 4, 5, 6]}>
        {() => (
          <div
            class={
              stylex.attrs(
                ideStyles.skeleton,
                ideUtilityStyles.h7,
                ideUtilityStyles.roundedLg,
              ).class
            }
          />
        )}
      </For>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div
      data-test-ide-editor-skeleton=""
      class={
        stylex.attrs(
          ideUtilityStyles.flex,
          ideUtilityStyles.minH0,
          ideUtilityStyles.flex1,
          ideUtilityStyles.flexCol,
          ideUtilityStyles.gap2,
          ideUtilityStyles.p4,
        ).class
      }
    >
      <div
        class={
          stylex.attrs(
            ideStyles.skeleton,
            ideUtilityStyles.h7,
            ideUtilityStyles.wTwoFifths,
            ideUtilityStyles.roundedLg,
          ).class
        }
      />
      <For each={[1, 2, 3, 4, 5, 6, 7]}>
        {(index) => (
          <div
            class={
              stylex.attrs(
                ideStyles.skeleton,
                ideUtilityStyles.h5,
                ideUtilityStyles.roundedMd,
              ).class
            }
            style={{ width: `${80 - index * 6}%` }}
          />
        )}
      </For>
    </div>
  );
}

function IdeToasts(props: {
  toasts: IdeToast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      class={
        stylex.attrs(
          ideUtilityStyles.pointerEventsNone,
          ideUtilityStyles.absolute,
          ideUtilityStyles.bottom10,
          ideUtilityStyles.right4,
          ideUtilityStyles.z60,
          ideUtilityStyles.flex,
          ideUtilityStyles.toastWidth,
          ideUtilityStyles.flexCol,
          ideUtilityStyles.gap2,
        ).class
      }
    >
      <For each={props.toasts}>
        {(toast) => (
          <div
            class={cn(
              stylex.attrs(
                ideUtilityStyles.pointerEventsAuto,
                ideUtilityStyles.roundedXl,
                ideUtilityStyles.border,
                ideUtilityStyles.bgIdeSurface,
                ideUtilityStyles.p3,
                ideUtilityStyles.textXs,
                ideUtilityStyles.shadow2xl,
              ).class,
              toast.tone === "error"
                ? stylex.attrs(ideStyles.toastError).class
                : toast.tone === "warning"
                  ? stylex.attrs(ideStyles.toastWarning).class
                  : stylex.attrs(ideStyles.toastInfo).class,
            )}
          >
            <div
              class={
                stylex.attrs(
                  ideUtilityStyles.flex,
                  ideUtilityStyles.itemsStart,
                  ideUtilityStyles.gap2,
                ).class
              }
            >
              <CheckCircle2
                class={
                  stylex.attrs(
                    ideUtilityStyles.mt05,
                    ideUtilityStyles.h4,
                    ideUtilityStyles.w4,
                    ideUtilityStyles.shrink0,
                    ideUtilityStyles.textIdeAccent,
                  ).class
                }
              />
              <div
                class={
                  stylex.attrs(ideUtilityStyles.minW0, ideUtilityStyles.flex1)
                    .class
                }
              >
                <div
                  class={
                    stylex.attrs(
                      ideUtilityStyles.fontSemibold,
                      ideUtilityStyles.textIdeText,
                    ).class
                  }
                >
                  {toast.title}
                </div>
                <div
                  class={
                    stylex.attrs(
                      ideUtilityStyles.mt1,
                      ideUtilityStyles.textIdeMuted,
                    ).class
                  }
                >
                  {toast.detail}
                </div>
              </div>
              <button
                type="button"
                class={stylex.attrs(ideUtilityStyles.textIdeMuted).class}
                aria-label={`Dismiss ${toast.title}`}
                onClick={() => props.onDismiss(toast.id)}
              >
                <X
                  class={
                    stylex.attrs(ideUtilityStyles.h4, ideUtilityStyles.w4).class
                  }
                />
              </button>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

export { isIdeProjectSwitcherModKHotkey } from "./editor/text-operations";
