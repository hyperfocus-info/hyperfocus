import {
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
} from "solid-js";
import * as stylex from "@stylexjs/stylex";
import {
  createHotkeys,
  createHotkeySequences,
  formatForDisplay,
} from "@tanstack/solid-hotkeys";
import type { CreateHotkeyDefinition } from "@tanstack/solid-hotkeys";
import {
  Braces,
  CaseSensitive,
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
  Regex,
  Replace,
  Save,
  Search,
  Settings,
  X,
} from "lucide-solid";
import { ActionButton } from "../components/action-button";
import {
  ContextMenu,
  type ContextMenuAction,
} from "../components/primitives/context-menu";
import { Input } from "../components/primitives/input";
import { Tooltip } from "../components/primitives/tooltip";
import { harnessStore } from "../harness-store";
import {
  normalizeAppHotkeyPreferences,
  type AppHotkeyId,
} from "../lib/app-hotkeys";
import { cn } from "../lib/utils";
import { terminalStore } from "../terminal/terminal-store";
import { pushToast } from "../toast-store";
import {
  ideStore,
  type IdeActivityView,
  type IdeEditorFile,
} from "./ide-store";
import { ideStyles, ideUtilityStyles } from "./ide-workbench.styles";

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

export function IdeWorkbench(props?: IdeWorkbenchProps) {
  const resolvedProps: IdeWorkbenchProps = props ?? {};
  const [handledOpenRequestId, setHandledOpenRequestId] = createSignal("");
  const [restoredActiveFileKey, setRestoredActiveFileKey] = createSignal("");
  const [cursorLine, setCursorLine] = createSignal(5);
  const [cursorColumn, setCursorColumn] = createSignal(12);
  const [contextMenu, setContextMenu] = createSignal<IdeContextMenu>();
  const [completionState, setCompletionState] = createSignal<CompletionState>();
  const [toasts, setToasts] = createSignal<IdeToast[]>([]);
  const [sidebarOpen, setSidebarOpenSignal] = createSignal(
    ideStore.state.sidebarOpen,
  );
  const [activityView, setActivityViewSignal] = createSignal<IdeActivityView>(
    ideStore.state.activityView,
  );
  let workbenchRef: HTMLElement | undefined;
  let documentFindInputRef: HTMLInputElement | undefined;
  let globalSearchInputRef: HTMLInputElement | undefined;

  const activeProject = createMemo(() => {
    const project = harnessStore.state.workspace.projects.find(
      (candidate) =>
        candidate.id === harnessStore.state.workspace.activeProjectId,
    );
    return project ?? harnessStore.state.workspace.projects[0];
  });
  const fileForPath = (filePath: string): IdeFile => {
    const file = ideStore.state.filesByPath[filePath];
    if (file) {
      return { ...file, symbols: [] };
    }
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
        ideStore.state.pendingReadPath === filePath
          ? "Loading file..."
          : "Read-only preview unavailable.",
      ],
    };
  };
  const activeFile = createMemo(() =>
    ideStore.state.activePath
      ? fileForPath(ideStore.state.activePath)
      : undefined,
  );
  const openFiles = createMemo(() => ideStore.state.openPaths.map(fileForPath));
  const dirtyPaths = () => ideStore.state.dirtyPaths ?? [];
  const dirtyCount = createMemo(() => dirtyPaths().length);
  const hotkeyPreferences = () =>
    normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences);
  const primaryHotkey = (id: AppHotkeyId) => hotkeyPreferences()[id][0];
  const hotkeyHint = (id: AppHotkeyId) =>
    formatHotkeyDisplay(primaryHotkey(id));
  const commandPaletteCommands = createMemo(() => {
    const commands = [
      {
        id: "save",
        label: "File: Save",
        detail: hotkeyHint("ideSave"),
        run: () => ideStore.saveFile(),
      },
      {
        id: "close-all",
        label: "View: Close All Editors",
        detail: "Close all open editor tabs",
        run: () => closeAllTabs(),
      },
      {
        id: "toggle-sidebar",
        label: "View: Toggle Sidebar",
        detail: "Collapse or restore file explorer",
        run: () => toggleSidebar(),
      },
      {
        id: "find",
        label: "Search: Find in File",
        detail: hotkeyHint("ideFindInFile"),
        run: () => openDocumentFind(),
      },
      {
        id: "search",
        label: "Search: Find in Files",
        detail: hotkeyHint("ideFindInFiles"),
        run: () => openGlobalSearch(),
      },
      {
        id: "window-mode",
        label:
          resolvedProps.windowMode === "popped-out"
            ? "Window: Pop In"
            : "Window: Pop Out",
        detail: "Move IDE between main workspace and a separate window",
        run: () => resolvedProps.onToggleWindowMode?.(),
      },
    ];
    const query = ideStore.state.commandQuery.trim().toLowerCase();
    return query
      ? commands.filter((command) =>
          `${command.label} ${command.detail}`.toLowerCase().includes(query),
        )
      : commands;
  });

  const ideHotkeys = createMemo<CreateHotkeyDefinition[]>(() =>
    [
      ...hotkeyPreferences().ideCommandPalette.map((hotkey) => ({
        hotkey: hotkey as never,
        callback: () => ideStore.setCommandPalette(true),
        options: {
          meta: {
            name: "Command palette",
            description: "Open editor commands",
          },
        },
      })),
      ...hotkeyPreferences().ideQuickOpen.map((hotkey) => ({
        hotkey: hotkey as never,
        callback: () => ideStore.setCommandPalette(true),
        options: {
          meta: {
            name: "Quick open",
            description: "Open quick commands",
          },
        },
      })),
      ...hotkeyPreferences().ideFindInFile.map((hotkey) => ({
        hotkey: hotkey as never,
        callback: () => openDocumentFind(),
        options: {
          meta: {
            name: "Find in file",
            description: "Search current document",
          },
        },
      })),
      ...hotkeyPreferences().ideFindInFiles.map((hotkey) => ({
        hotkey: hotkey as never,
        callback: () => openGlobalSearch(),
        options: {
          meta: {
            name: "Find in files",
            description: "Open global search panel",
          },
        },
      })),
      ...hotkeyPreferences().ideToggleTerminal.map((hotkey) => ({
        hotkey: hotkey as never,
        callback: () => terminalStore.toggleOpen(),
        options: {
          meta: {
            name: "Integrated terminal",
            description: "Toggle the bottom terminal drawer",
          },
        },
      })),
      ...hotkeyPreferences().ideExplorer.map((hotkey) => ({
        hotkey: hotkey as never,
        callback: () => {
          toggleActivityView("explorer");
        },
        options: {
          meta: {
            name: "Explorer",
            description: "Open file explorer",
          },
        },
      })),
      ...hotkeyPreferences().ideSourceControl.map((hotkey) => ({
        hotkey: hotkey as never,
        callback: () => {
          toggleActivityView("source-control");
        },
        options: {
          meta: {
            name: "Source control",
            description: "Open source control",
          },
        },
      })),
      ...hotkeyPreferences().ideSave.map((hotkey) => ({
        hotkey: hotkey as never,
        callback: () => ideStore.saveFile(),
        options: {
          meta: {
            name: "Save",
            description: "Save current editor",
          },
        },
      })),
      ...hotkeyPreferences().ideCloseEditor.map((hotkey) => ({
        hotkey: hotkey as never,
        callback: () => closeCurrentTab(),
        options: {
          meta: {
            name: "Close tab",
            description: "Close current tab",
          },
        },
      })),
      ...hotkeyPreferences().ideToggleSidebar.map((hotkey) => ({
        hotkey: hotkey as never,
        callback: () => toggleSidebar(),
        options: {
          meta: {
            name: "Toggle sidebar",
            description: "Collapse or restore the IDE sidebar",
          },
        },
      })),
      ...hotkeyPreferences().ideToggleWordWrap.map((hotkey) => ({
        hotkey: hotkey as never,
        callback: () =>
          ideStore.setEditorSetting(
            "wordWrap",
            ideStore.state.editorSettings.wordWrap === "on" ? "off" : "on",
          ),
        options: {
          meta: {
            name: "Word wrap",
            description: "Toggle editor word wrap",
          },
        },
      })),
    ].map((definition) => ({
      ...definition,
      options: {
        ...definition.options,
        // IDE and workspace shortcuts are mutually exclusive by active surface.
        conflictBehavior: "allow" as const,
      },
    })),
  );
  createHotkeys(ideHotkeys, () => ({
    enabled: harnessStore.state.activeSurface === "ide",
    ignoreInputs: false,
    preventDefault: true,
    stopPropagation: true,
  }));
  createHotkeySequences(
    () =>
      hotkeyPreferences().ideCloseAllEditors.map((hotkey) => ({
        sequence: closeAllEditorSequence(hotkey) as never,
        callback: () => closeAllTabs(),
      })),
    () => ({
      enabled: harnessStore.state.activeSurface === "ide",
      ignoreInputs: false,
      preventDefault: true,
      stopPropagation: true,
    }),
  );

  createEffect(() => {
    const request = harnessStore.state.ideFileOpenRequest;
    if (!request || request.id === handledOpenRequestId()) {
      return;
    }
    setHandledOpenRequestId(request.id);
    openFileByPath(request.path, request.line, request.column);
  });

  createEffect(() => {
    const projectId = activeProject()?.id;
    if (projectId) {
      ideStore.loadProject(projectId);
    }
  });

  createEffect(() => {
    const projectId = activeProject()?.id;
    const activePath = ideStore.state.activePath;
    const restoreKey =
      projectId && activePath ? `${projectId}:${activePath}` : "";
    if (
      projectId &&
      activePath &&
      restoreKey !== restoredActiveFileKey() &&
      !ideStore.state.filesByPath[activePath] &&
      ideStore.state.pendingReadPath !== activePath
    ) {
      setRestoredActiveFileKey(restoreKey);
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

  onMount(() => {
    let closeAllChordUntil = 0;
    let closeAllChordTails: string[][] = [];
    const interceptBrowserShortcuts = (event: KeyboardEvent) => {
      const targetNode =
        event.target instanceof Node ? event.target : undefined;
      const eventInsideWorkbench = Boolean(
        targetNode && workbenchRef?.contains(targetNode),
      );
      if (
        harnessStore.state.activeSurface !== "ide" &&
        resolvedProps.windowMode !== "popped-out" &&
        !eventInsideWorkbench
      ) {
        return;
      }
      const closeEditorHotkeys = hotkeyPreferences().ideCloseEditor;
      if (eventMatchesHotkeys(event, closeEditorHotkeys)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        closeCurrentTab();
        return;
      }
      if (eventMatchesHotkeys(event, hotkeyPreferences().ideToggleSidebar)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        toggleSidebar();
        return;
      }
      if (eventMatchesHotkeys(event, hotkeyPreferences().ideFindInFiles)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openGlobalSearch();
        return;
      }
      if (eventMatchesHotkeys(event, hotkeyPreferences().ideFindInFile)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openDocumentFind();
        return;
      }
      if (eventMatchesHotkeys(event, hotkeyPreferences().ideExplorer)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        toggleActivityView("explorer");
        return;
      }
      if (eventMatchesHotkeys(event, hotkeyPreferences().ideSourceControl)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        toggleActivityView("source-control");
        return;
      }
      if (eventMatchesHotkeys(event, hotkeyPreferences().ideToggleTerminal)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        terminalStore.toggleOpen();
        return;
      }
      if (eventMatchesHotkeys(event, hotkeyPreferences().ideSave)) {
        ideStore.saveFile();
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      if (
        eventMatchesHotkeys(event, hotkeyPreferences().ideCommandPalette) ||
        eventMatchesHotkeys(event, hotkeyPreferences().ideQuickOpen)
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        ideStore.setCommandPalette(true);
        return;
      }
      if (eventMatchesHotkeys(event, hotkeyPreferences().ideToggleWordWrap)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        ideStore.setEditorSetting(
          "wordWrap",
          ideStore.state.editorSettings.wordWrap === "on" ? "off" : "on",
        );
        return;
      }
      const closeAllSequences = hotkeyPreferences().ideCloseAllEditors.map(
        closeAllEditorSequence,
      );
      if (
        closeAllSequences.some(
          (sequence) =>
            sequence.length === 1 && eventMatchesHotkeys(event, sequence),
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        closeAllTabs();
        return;
      }
      const matchedCloseAllPrefixes = closeAllSequences.filter(
        (sequence) =>
          sequence.length > 1 &&
          eventMatchesHotkeys(event, sequence.slice(0, 1)),
      );
      if (matchedCloseAllPrefixes.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (
          matchedCloseAllPrefixes.some((sequence) =>
            isIdeProjectSwitcherModKHotkey(sequence[0] ?? ""),
          ) &&
          hotkeyPreferences().openProjectSwitcher.some(
            isIdeProjectSwitcherModKHotkey,
          )
        ) {
          harnessStore.openProjectSwitcher();
          return;
        }
        closeAllChordUntil = Date.now() + 1200;
        closeAllChordTails = matchedCloseAllPrefixes.map((sequence) =>
          sequence.slice(1),
        );
        return;
      }
      if (
        closeAllChordUntil > Date.now() &&
        closeAllChordTails.some((sequence) =>
          eventMatchesHotkeys(event, sequence),
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        closeAllTabs();
        closeAllChordUntil = 0;
        closeAllChordTails = [];
        return;
      }
      closeAllChordUntil = 0;
      closeAllChordTails = [];
    };
    window.addEventListener("keydown", interceptBrowserShortcuts, {
      capture: true,
    });
    document.addEventListener("keydown", interceptBrowserShortcuts, {
      capture: true,
    });
    onCleanup(() => {
      window.removeEventListener("keydown", interceptBrowserShortcuts, {
        capture: true,
      });
      document.removeEventListener("keydown", interceptBrowserShortcuts, {
        capture: true,
      });
    });
  });

  function notify(title: string, detail: string, tone?: IdeToast["tone"]) {
    const id = `ide-toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const resolvedTone = tone ?? "info";
    setToasts((current) => [
      ...current.slice(-2),
      { id, title, detail, tone: resolvedTone },
    ]);
    if (resolvedTone === "error") {
      pushToast(title, detail, "error");
    }
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
  }

  function openFileByPath(path: string, line?: number, column?: number) {
    const normalizedPath = path.replace(/\\/g, "/");
    ideStore.openFile(normalizedPath, line, column);
    if (window.matchMedia?.("(max-width: 639px)").matches) {
      setSidebarOpen(false);
    }
    if (line) {
      setCursorLine(line);
    }
    if (column) {
      setCursorColumn(column);
    }
  }

  function closeTab(path: string) {
    const next = ideStore.closeTab(path);
    closeIdeWindowIfEmpty(next);
  }

  function closeCurrentTab() {
    const currentPath = ideStore.state.activePath;
    if (currentPath) {
      closeTab(currentPath);
    }
  }

  function closeAllTabs() {
    ideStore.closeAllTabs();
    closeIdeWindowIfEmpty([]);
  }

  function closeOtherTabs(path: string) {
    ideStore.closeOtherTabs(path);
  }

  function openDocumentFind() {
    ideStore.setDocumentFindOpen(true);
    queueMicrotask(() => {
      documentFindInputRef?.focus();
      documentFindInputRef?.select();
    });
  }

  function openGlobalSearch() {
    openActivityView("search");
    queueMicrotask(() => {
      globalSearchInputRef?.focus();
      globalSearchInputRef?.select();
    });
  }

  function openActivityView(view: IdeActivityView) {
    setSidebarOpen(true);
    setActivityViewSignal(view);
    ideStore.setActivityView(view);
    syncActivityBarChrome(true, view);
  }

  function toggleActivityView(view: IdeActivityView) {
    if (sidebarOpen() && activityView() === view) {
      setSidebarOpen(false);
      return;
    }
    openActivityView(view);
  }

  function setSidebarOpen(open: boolean) {
    setSidebarOpenSignal(open);
    ideStore.setSidebarOpen(open);
    syncActivityBarChrome(open, activityView());
  }

  function toggleSidebar() {
    setSidebarOpen(!sidebarOpen());
  }

  function syncActivityBarChrome(open: boolean, view: IdeActivityView) {
    const activityBar = document.querySelector<HTMLElement>(
      "[data-test-ide-activity-bar]",
    );
    if (!activityBar) {
      return;
    }
    activityBar.dataset.sidebarOpen = open ? "true" : "false";
    activityBar
      .querySelectorAll<HTMLButtonElement>("[data-activity-view]")
      .forEach((button) => {
        const active = open && button.dataset.activityView === view;
        button.className = cn(
          stylex.attrs(ideStyles.activityButton).class,
          active
            ? stylex.attrs(ideStyles.activityButtonActive).class
            : undefined,
        );
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
  }

  function startHorizontalResize(
    kind: "sidebar" | "editor",
    event: PointerEvent,
  ) {
    event.preventDefault();
    const startX = event.clientX;
    const startSidebarWidth = ideStore.state.sidebarWidth;
    const startEditorWidth = ideStore.state.primaryEditorWidth;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      if (kind === "sidebar") {
        ideStore.setSidebarWidth(
          Math.max(220, Math.min(420, startSidebarWidth + delta)),
        );
        return;
      }
      ideStore.setPrimaryEditorWidth(
        Math.max(42, Math.min(72, startEditorWidth + delta / 12)),
      );
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  }

  function openContextMenu(
    kind: IdeContextMenu["kind"],
    event: MouseEvent,
    filePath?: string,
  ) {
    event.preventDefault();
    setContextMenu({ kind, x: event.clientX, y: event.clientY, filePath });
  }

  function closeIdeWindowIfEmpty(paths: string[]) {
    if (paths.length > 0) {
      return;
    }
    queueMicrotask(() => resolvedProps.onRequestClose?.());
  }

  const contextMenuActions = createMemo<ContextMenuAction[]>(() => {
    const menu = contextMenu();
    if (!menu) {
      return [];
    }
    if (menu.kind === "tab") {
      const filePath = menu.filePath ?? ideStore.state.activePath ?? "";
      return [
        {
          id: "close-tab",
          label: "Close",
          shortcut: formatForDisplay("Mod+W"),
          onSelect: () => closeTab(filePath),
        },
        {
          id: "close-others",
          label: "Close Others",
          onSelect: () => closeOtherTabs(filePath),
        },
        { id: "close-all", label: "Close All", onSelect: closeAllTabs },
      ];
    }
    if (menu.kind === "tree") {
      return [
        {
          id: "open",
          label: "Open",
          onSelect: () => menu.filePath && openFileByPath(menu.filePath),
        },
        {
          id: "copy-path",
          label: "Copy Path",
          onSelect: () =>
            notify("Path copied", menu.filePath ?? "Project path copied."),
        },
        {
          id: "refresh",
          label: "Refresh Explorer",
          onSelect: () =>
            activeProject()?.id && ideStore.loadProject(activeProject()?.id),
        },
        {
          id: "reveal",
          label: "Reveal in Explorer",
          onSelect: () => openActivityView("explorer"),
        },
      ];
    }
    return [
      {
        id: "format",
        label: "Format Document",
        shortcut: formatForDisplay("Shift+Alt+F"),
        onSelect: () => notify("Formatted", "Document formatting queued."),
      },
      {
        id: "symbol",
        label: "Go to Symbol",
        shortcut: formatForDisplay("Mod+Shift+O"),
        onSelect: () => ideStore.setCommandPalette(true),
      },
      {
        id: "definition",
        label: "Go to Definition",
        shortcut: "F12",
        onSelect: () =>
          activeFile() &&
          goToDefinition(
            activeFile()!,
            activeFile()!.cursorLine ?? cursorLine(),
            activeFile()!.cursorColumn ?? cursorColumn(),
          ),
      },
      {
        id: "run-selection",
        label: "Send Selection to Agent",
        onSelect: () =>
          notify(
            "Selection attached",
            "Selection ready for active harness thread.",
          ),
      },
    ];
  });

  function goToDefinition(file: IdeFile, line: number, column: number) {
    const symbol = getWordAtPosition(file.contentLines[line - 1] ?? "", column);
    const targetLine = findDefinitionLine(file.contentLines, symbol);
    if (!symbol || !targetLine) {
      notify(
        "Definition not found",
        "No matching symbol definition in the active file.",
        "warning",
      );
      return;
    }
    setCursorLine(targetLine);
    setCursorColumn(1);
    ideStore.setCursor(targetLine, 1);
    document
      .querySelector(`[data-test-ide-code-line="${targetLine}"]`)
      ?.scrollIntoView({ block: "center" });
  }

  return (
    <section
      ref={workbenchRef}
      data-test-ide-workbench=""
      class={
        stylex.attrs(
          ideStyles.shell,
          ideUtilityStyles.flex,
          ideUtilityStyles.hFull,
          ideUtilityStyles.minH0,
          ideUtilityStyles.flexCol,
          ideUtilityStyles.overflowHidden,
          ideUtilityStyles.roundedNone,
          ideUtilityStyles.border0,
        ).class
      }
    >
      <div
        class={
          stylex.attrs(
            ideUtilityStyles.flex,
            ideUtilityStyles.minH0,
            ideUtilityStyles.flex1,
          ).class
        }
      >
        <Show
          when={sidebarOpen()}
          fallback={
            <ActivityBar
              active={undefined}
              sidebarOpen={false}
              onSelect={toggleActivityView}
            />
          }
        >
          <ActivityBar
            active={activityView()}
            sidebarOpen={true}
            onSelect={toggleActivityView}
          />
        </Show>

        <Show when={sidebarOpen()}>
          <aside
            class={
              stylex.attrs(
                ideStyles.sidebar,
                ideUtilityStyles.flex,
                ideUtilityStyles.minH0,
                ideUtilityStyles.shrink0,
                ideUtilityStyles.flexCol,
              ).class
            }
            style={{ width: `${ideStore.state.sidebarWidth}px` }}
          >
            <SidebarHeader
              active={activityView()}
              projectName={activeProject()?.name ?? "Workspace"}
              onCollapse={() => setSidebarOpen(false)}
              onCollapseAll={ideStore.collapseAllFolders}
            />
            <Show
              when={!ideStore.state.treeLoading}
              fallback={<SidebarSkeleton />}
            >
              <SwitchSidebar
                active={activityView()}
                searchQuery={ideStore.state.searchQuery}
                replaceQuery={ideStore.state.replaceQuery}
                regexSearch={ideStore.state.regexSearch}
                caseSensitiveSearch={ideStore.state.caseSensitiveSearch}
                wholeWordSearch={ideStore.state.wholeWordSearch}
                searchLoading={ideStore.state.searchLoading}
                searchResults={ideStore.state.searchResults}
                searchTruncated={ideStore.state.searchTruncated}
                searchInputRef={(element) => {
                  globalSearchInputRef = element;
                }}
                treeEntries={ideStore.state.treeEntries}
                treeError={ideStore.state.treeError}
                treeTruncated={ideStore.state.treeTruncated}
                gitBranch={ideStore.state.gitBranch}
                gitIsRepository={ideStore.state.gitIsRepository}
                gitChanges={ideStore.state.gitChanges}
                gitLoading={ideStore.state.gitLoading}
                onSearchQuery={ideStore.setSearchQuery}
                onReplaceQuery={ideStore.setReplaceQuery}
                onRegexSearch={ideStore.setRegexSearch}
                onCaseSensitiveSearch={ideStore.setCaseSensitiveSearch}
                onWholeWordSearch={ideStore.setWholeWordSearch}
                onOpenPath={openFileByPath}
                onContextMenu={openContextMenu}
              />
            </Show>
          </aside>
          <Sash
            label="Resize IDE sidebar"
            orientation="vertical"
            onPointerDown={(event) => startHorizontalResize("sidebar", event)}
          />
        </Show>

        <div
          class={
            stylex.attrs(
              ideStyles.surface,
              ideUtilityStyles.flex,
              ideUtilityStyles.minW0,
              ideUtilityStyles.flex1,
              ideUtilityStyles.flexCol,
            ).class
          }
        >
          <div
            class={
              stylex.attrs(
                ideStyles.chrome,
                ideUtilityStyles.flex,
                ideUtilityStyles.h10,
                ideUtilityStyles.shrink0,
                ideUtilityStyles.itemsCenter,
                ideUtilityStyles.justifyBetween,
                ideUtilityStyles.gap2,
                ideUtilityStyles.px2,
              ).class
            }
          >
            <div
              class={
                stylex.attrs(
                  ideUtilityStyles.flex,
                  ideUtilityStyles.minW0,
                  ideUtilityStyles.itemsCenter,
                  ideUtilityStyles.gap15,
                ).class
              }
            >
              <ActionButton
                tooltip={`Save active file (${hotkeyHint("ideSave")})`}
                ariaLabel="Save active file"
                icon={
                  <Save
                    class={
                      stylex.attrs(ideUtilityStyles.h4, ideUtilityStyles.w4)
                        .class
                    }
                  />
                }
                variant={
                  dirtyPaths().includes(ideStore.state.activePath ?? "")
                    ? "secondary"
                    : "ghost"
                }
                size="icon"
                class={
                  stylex.attrs(
                    ideUtilityStyles.h8,
                    ideUtilityStyles.w8,
                    ideUtilityStyles.roundedLg,
                  ).class
                }
                onClick={() => ideStore.saveFile()}
              />
              <ActionButton
                tooltip={`${sidebarOpen() ? "Hide" : "Show"} IDE sidebar (${hotkeyHint("ideToggleSidebar")})`}
                ariaLabel={
                  sidebarOpen() ? "Hide IDE sidebar" : "Show IDE sidebar"
                }
                icon={
                  sidebarOpen() ? (
                    <PanelLeftClose
                      class={
                        stylex.attrs(ideUtilityStyles.h4, ideUtilityStyles.w4)
                          .class
                      }
                    />
                  ) : (
                    <PanelLeftOpen
                      class={
                        stylex.attrs(ideUtilityStyles.h4, ideUtilityStyles.w4)
                          .class
                      }
                    />
                  )
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
                onClick={() => toggleSidebar()}
              />
              <ActionButton
                tooltip={`Open command palette (${hotkeyHint("ideCommandPalette")})`}
                ariaLabel="Open command palette"
                icon={
                  <Code2
                    class={
                      stylex.attrs(ideUtilityStyles.h4, ideUtilityStyles.w4)
                        .class
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
                onClick={() => ideStore.setCommandPalette(true)}
              />
              <ActionButton
                tooltip={
                  resolvedProps.windowMode === "popped-out"
                    ? "Pop IDE into main window"
                    : "Pop IDE out to new window"
                }
                ariaLabel={
                  resolvedProps.windowMode === "popped-out"
                    ? "Pop IDE into main window"
                    : "Pop IDE out to new window"
                }
                icon={
                  <ExternalLink
                    class={
                      stylex.attrs(ideUtilityStyles.h4, ideUtilityStyles.w4)
                        .class
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
                onClick={resolvedProps.onToggleWindowMode}
              />
              <Show when={ideStore.state.editorSettings.breadcrumbsEnabled}>
                <Breadcrumbs file={activeFile()} />
              </Show>
            </div>
          </div>

          <div
            class={
              stylex.attrs(
                ideStyles.chrome,
                ideStyles.editorTabs,
                ideUtilityStyles.flex,
                ideUtilityStyles.h10,
                ideUtilityStyles.shrink0,
                ideUtilityStyles.itemsEnd,
                ideUtilityStyles.overflowXAuto,
                ideUtilityStyles.overflowYHidden,
              ).class
            }
            data-test-ide-editor-tabs=""
            data-open-count={openFiles().length}
          >
            <Show
              when={openFiles().length > 0}
              fallback={
                <div
                  class={
                    stylex.attrs(
                      ideUtilityStyles.px3,
                      ideUtilityStyles.pb2,
                      ideUtilityStyles.textXs,
                      ideUtilityStyles.textMuted,
                    ).class
                  }
                >
                  No editors open
                </div>
              }
            >
              <For each={openFiles()}>
                {(file) => (
                  <button
                    type="button"
                    data-test-ide-editor-tab=""
                    class={cn(
                      stylex.attrs(ideStyles.editorTab).class,
                      ideStore.state.activePath === file.path
                        ? stylex.attrs(ideStyles.editorTabActive).class
                        : undefined,
                    )}
                    aria-label={`Open ${file.name}`}
                    onClick={() =>
                      ideStore.state.filesByPath[file.path]
                        ? ideStore.setActivePath(file.path)
                        : ideStore.openFile(file.path)
                    }
                    onContextMenu={(event) =>
                      openContextMenu("tab", event, file.path)
                    }
                  >
                    <FileCode2
                      class={
                        stylex.attrs(ideUtilityStyles.h35, ideUtilityStyles.w35)
                          .class
                      }
                    />
                    <span class={stylex.attrs(ideUtilityStyles.truncate).class}>
                      {dirtyPaths().includes(file.path)
                        ? `${file.name} *`
                        : file.name}
                    </span>
                    <X
                      class={
                        stylex.attrs(
                          ideUtilityStyles.h35,
                          ideUtilityStyles.w35,
                          ideUtilityStyles.transition,
                          ideStyles.tabClose,
                        ).class
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        closeTab(file.path);
                      }}
                    />
                  </button>
                )}
              </For>
            </Show>
          </div>

          <Show
            when={!ideStore.state.treeLoading}
            fallback={<EditorSkeleton />}
          >
            <div
              class={
                stylex.attrs(
                  ideUtilityStyles.flex,
                  ideUtilityStyles.minH0,
                  ideUtilityStyles.flex1,
                  ideUtilityStyles.flexCol,
                ).class
              }
            >
              <div
                class={
                  stylex.attrs(
                    ideUtilityStyles.flex,
                    ideUtilityStyles.minH0,
                    ideUtilityStyles.flex1,
                  ).class
                }
              >
                <EditorSurface
                  file={activeFile()}
                  widthPercent={ideStore.state.primaryEditorWidth}
                  documentFindOpen={ideStore.state.documentFindOpen}
                  documentFindQuery={ideStore.state.documentFindQuery}
                  findInputRef={(element) => {
                    documentFindInputRef = element;
                  }}
                  onDocumentFindQuery={ideStore.setDocumentFindQuery}
                  onDocumentFindClose={() =>
                    ideStore.setDocumentFindOpen(false)
                  }
                  wordWrap={ideStore.state.editorSettings.wordWrap}
                  tabSize={ideStore.state.editorSettings.tabSize}
                  bracketPairColorization={
                    ideStore.state.editorSettings.bracketPairColorization
                  }
                  dirty={dirtyPaths().includes(activeFile()?.path ?? "")}
                  completionState={completionState()}
                  onCompletionClose={() => setCompletionState(undefined)}
                  onCompletionSelect={(value) => {
                    const completion = completionState();
                    const file = activeFile();
                    if (!file || !completion) {
                      return;
                    }
                    ideStore.updateFileContent(
                      file.path,
                      applyCompletionAt(
                        file.content ?? file.contentLines.join("\n"),
                        completion.position,
                        completion.prefix,
                        value,
                      ),
                    );
                    setCompletionState(undefined);
                  }}
                  onContentChange={(path, content) =>
                    ideStore.updateFileContent(path, content)
                  }
                  onSave={() => ideStore.saveFile()}
                  onCloseTab={closeCurrentTab}
                  onGoToDefinition={goToDefinition}
                  onCompletionRequest={(x, y, path, position, prefix, items) =>
                    setCompletionState({ x, y, path, position, prefix, items })
                  }
                  onCursor={(line, column) => {
                    setCursorLine(line);
                    setCursorColumn(column);
                    ideStore.setCursor(line, column);
                  }}
                  onContextMenu={(event) => openContextMenu("editor", event)}
                />
              </div>
            </div>
          </Show>

          <StatusBar
            branch={
              ideStore.state.gitBranch ??
              (ideStore.state.gitIsRepository ? "detached" : "no git")
            }
            dirtyCount={dirtyCount()}
            line={cursorLine()}
            column={cursorColumn()}
            encoding={activeFile()?.encoding ?? "UTF-8"}
            language={activeFile()?.language ?? "Plain Text"}
          />
        </div>
      </div>

      <CommandPalette
        open={ideStore.state.commandPaletteOpen}
        query={ideStore.state.commandQuery}
        commands={commandPaletteCommands()}
        onQuery={ideStore.setCommandQuery}
        onClose={() => {
          ideStore.setCommandPalette(false, "");
        }}
      />
      <ContextMenu
        open={Boolean(contextMenu())}
        x={contextMenu()?.x ?? 0}
        y={contextMenu()?.y ?? 0}
        ariaLabel="IDE context menu"
        actions={contextMenuActions()}
        onClose={() => setContextMenu(undefined)}
      />
      <IdeToasts
        toasts={toasts()}
        onDismiss={(id) =>
          setToasts((current) => current.filter((toast) => toast.id !== id))
        }
      />
    </section>
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

function SwitchSidebar(props: {
  active: IdeActivityView;
  searchQuery: string;
  replaceQuery: string;
  regexSearch: boolean;
  caseSensitiveSearch: boolean;
  wholeWordSearch: boolean;
  searchLoading: boolean;
  searchResults: import("../../../shared/protocol").IdeSearchResult[];
  searchTruncated: boolean;
  searchInputRef: (element: HTMLInputElement | undefined) => void;
  treeEntries: import("../../../shared/protocol").IdeFileTreeEntry[];
  treeError?: string;
  treeTruncated: boolean;
  gitBranch?: string;
  gitIsRepository: boolean;
  gitChanges: import("../../../shared/protocol").IdeGitChange[];
  gitLoading: boolean;
  onSearchQuery: (value: string) => void;
  onReplaceQuery: (value: string) => void;
  onRegexSearch: (value: boolean) => void;
  onCaseSensitiveSearch: (value: boolean) => void;
  onWholeWordSearch: (value: boolean) => void;
  onOpenPath: (path: string, line?: number, column?: number) => void;
  onContextMenu: (
    kind: IdeContextMenu["kind"],
    event: MouseEvent,
    filePath?: string,
  ) => void;
}) {
  const active = createMemo(() => props.active);
  return (
    <Switch
      fallback={
        <ExplorerView
          entries={props.treeEntries}
          error={props.treeError}
          truncated={props.treeTruncated}
          gitChanges={props.gitChanges}
          onOpenPath={props.onOpenPath}
          onContextMenu={props.onContextMenu}
        />
      }
    >
      <Match when={active() === "search"}>
        <GlobalSearchView {...props} />
      </Match>
      <Match when={active() === "source-control"}>
        <SourceControlView
          branch={props.gitBranch}
          isRepository={props.gitIsRepository}
          changes={props.gitChanges}
          loading={props.gitLoading}
          onOpenPath={props.onOpenPath}
        />
      </Match>
    </Switch>
  );
}

function ExplorerView(props: {
  entries: import("../../../shared/protocol").IdeFileTreeEntry[];
  error?: string;
  truncated: boolean;
  gitChanges: import("../../../shared/protocol").IdeGitChange[];
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
  entry: import("../../../shared/protocol").IdeFileTreeEntry;
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
  changes: import("../../../shared/protocol").IdeGitChange[],
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
  entry: import("../../../shared/protocol").IdeFileTreeEntry,
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

function normalizeGitStatusPath(path: string) {
  return path
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

function toGitStatusBadge(
  change: import("../../../shared/protocol").IdeGitChange,
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
  entries: import("../../../shared/protocol").IdeFileTreeEntry[],
  expandedFolderPaths: string[],
) {
  const expanded = new Set(expandedFolderPaths);
  const byParent = new Map<
    string,
    import("../../../shared/protocol").IdeFileTreeEntry[]
  >();
  for (const entry of entries) {
    const parent = entry.parentPath ?? "";
    byParent.set(parent, [...(byParent.get(parent) ?? []), entry]);
  }
  const sortEntries = (
    items: import("../../../shared/protocol").IdeFileTreeEntry[],
  ) =>
    [...items].sort(
      (left, right) =>
        Number(right.kind === "directory") -
          Number(left.kind === "directory") ||
        left.name.localeCompare(right.name),
    );
  const output: import("../../../shared/protocol").IdeFileTreeEntry[] = [];
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

function GlobalSearchView(props: {
  searchQuery: string;
  replaceQuery: string;
  regexSearch: boolean;
  caseSensitiveSearch: boolean;
  wholeWordSearch: boolean;
  searchLoading: boolean;
  searchResults: import("../../../shared/protocol").IdeSearchResult[];
  searchTruncated: boolean;
  searchInputRef: (element: HTMLInputElement | undefined) => void;
  onOpenPath: (path: string, line?: number, column?: number) => void;
  onSearchQuery: (value: string) => void;
  onReplaceQuery: (value: string) => void;
  onRegexSearch: (value: boolean) => void;
  onCaseSensitiveSearch: (value: boolean) => void;
  onWholeWordSearch: (value: boolean) => void;
}) {
  const resultCount = createMemo(() =>
    props.searchResults.reduce((sum, result) => sum + result.matches.length, 0),
  );
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
        ).class
      }
    >
      <div
        class={
          stylex.attrs(
            ideUtilityStyles.flex,
            ideUtilityStyles.flexCol,
            ideUtilityStyles.gap2,
          ).class
        }
      >
        <Input
          ref={props.searchInputRef}
          aria-label="Find in files"
          placeholder="Find"
          value={props.searchQuery}
          onInput={(event) => props.onSearchQuery(event.currentTarget.value)}
          class={stylex.attrs(ideStyles.input).class}
        />
        <Input
          aria-label="Replace in files"
          placeholder="Replace"
          value={props.replaceQuery}
          onInput={(event) => props.onReplaceQuery(event.currentTarget.value)}
          class={stylex.attrs(ideStyles.input).class}
        />
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
            tooltip="Use regular expression search"
            ariaLabel="Use regular expression search"
            icon={
              <Regex
                class={
                  stylex.attrs(ideUtilityStyles.h35, ideUtilityStyles.w35).class
                }
              />
            }
            variant={props.regexSearch ? "secondary" : "ghost"}
            size="icon"
            class={
              stylex.attrs(
                ideUtilityStyles.h8,
                ideUtilityStyles.w8,
                ideUtilityStyles.roundedLg,
              ).class
            }
            onClick={() => props.onRegexSearch(!props.regexSearch)}
          />
          <ActionButton
            tooltip="Match case"
            ariaLabel="Match case"
            icon={
              <CaseSensitive
                class={
                  stylex.attrs(ideUtilityStyles.h35, ideUtilityStyles.w35).class
                }
              />
            }
            variant={props.caseSensitiveSearch ? "secondary" : "ghost"}
            size="icon"
            class={
              stylex.attrs(
                ideUtilityStyles.h8,
                ideUtilityStyles.w8,
                ideUtilityStyles.roundedLg,
              ).class
            }
            onClick={() =>
              props.onCaseSensitiveSearch(!props.caseSensitiveSearch)
            }
          />
          <ActionButton
            tooltip="Match whole word"
            ariaLabel="Match whole word"
            icon={
              <Braces
                class={
                  stylex.attrs(ideUtilityStyles.h35, ideUtilityStyles.w35).class
                }
              />
            }
            variant={props.wholeWordSearch ? "secondary" : "ghost"}
            size="icon"
            class={
              stylex.attrs(
                ideUtilityStyles.h8,
                ideUtilityStyles.w8,
                ideUtilityStyles.roundedLg,
              ).class
            }
            onClick={() => props.onWholeWordSearch(!props.wholeWordSearch)}
          />
          <ActionButton
            tooltip="Replace is planned for the editing pass"
            icon={
              <Replace
                class={
                  stylex.attrs(ideUtilityStyles.h35, ideUtilityStyles.w35).class
                }
              />
            }
            variant="secondary"
            size="sm"
          >
            Replace
          </ActionButton>
        </div>
      </div>
      <div
        class={
          stylex.attrs(
            ideUtilityStyles.text065,
            ideUtilityStyles.fontSemibold,
            ideUtilityStyles.uppercase,
            ideUtilityStyles.textIdeMuted,
          ).class
        }
      >
        {props.searchLoading
          ? "Searching..."
          : `${resultCount()} results${props.searchTruncated ? " (truncated)" : ""}`}
      </div>
      <Show
        when={resultCount() > 0}
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
            Type to search files.
          </div>
        }
      >
        <For each={props.searchResults}>
          {(result) => (
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
              <button
                type="button"
                class={
                  stylex.attrs(
                    ideUtilityStyles.block,
                    ideUtilityStyles.wFull,
                    ideUtilityStyles.truncate,
                    ideUtilityStyles.textLeft,
                    ideUtilityStyles.textXs,
                    ideUtilityStyles.fontSemibold,
                    ideUtilityStyles.textIdeText,
                  ).class
                }
                onClick={() => props.onOpenPath(result.path)}
              >
                {result.path}
              </button>
              <For each={result.matches}>
                {(match) => (
                  <button
                    type="button"
                    class={
                      stylex.attrs(
                        ideUtilityStyles.mt1,
                        ideUtilityStyles.block,
                        ideUtilityStyles.wFull,
                        ideUtilityStyles.truncate,
                        ideUtilityStyles.textLeft,
                        ideUtilityStyles.fontMono,
                        ideUtilityStyles.text07,
                        ideUtilityStyles.textIdeMuted,
                      ).class
                    }
                    onClick={() =>
                      props.onOpenPath(result.path, match.line, match.column)
                    }
                  >
                    {match.line}:{match.column} {match.preview}
                  </button>
                )}
              </For>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}

function SourceControlView(props: {
  branch?: string;
  isRepository: boolean;
  changes: import("../../../shared/protocol").IdeGitChange[];
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

function EditorSurface(props: {
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
}) {
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

  return (
    <div
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
      <Show when={props.documentFindOpen}>
        <div
          class={
            stylex.attrs(
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
            ).class
          }
        >
          <Search
            class={
              stylex.attrs(
                ideUtilityStyles.h35,
                ideUtilityStyles.w35,
                ideUtilityStyles.textIdeMuted,
              ).class
            }
          />
          <input
            ref={props.findInputRef}
            class={
              stylex.attrs(
                ideUtilityStyles.h7,
                ideUtilityStyles.w44,
                ideUtilityStyles.bgTransparent,
                ideUtilityStyles.px1,
                ideUtilityStyles.textXs,
                ideUtilityStyles.textIdeText,
                ideUtilityStyles.outlineNone,
              ).class
            }
            aria-label="Find in current document"
            value={props.documentFindQuery}
            placeholder="Find"
            onInput={(event) =>
              props.onDocumentFindQuery(event.currentTarget.value)
            }
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                props.onDocumentFindClose();
              }
            }}
          />
          <span
            class={
              stylex.attrs(
                ideUtilityStyles.minW10,
                ideUtilityStyles.textRight,
                ideUtilityStyles.text065,
                ideUtilityStyles.textIdeMuted,
              ).class
            }
          >
            {matchCount()}
          </span>
          <ActionButton
            tooltip="Close document search"
            ariaLabel="Close document search"
            icon={
              <X
                class={
                  stylex.attrs(ideUtilityStyles.h35, ideUtilityStyles.w35).class
                }
              />
            }
            variant="ghost"
            size="icon"
            class={
              stylex.attrs(
                ideUtilityStyles.h7,
                ideUtilityStyles.w7,
                ideUtilityStyles.roundedMd,
              ).class
            }
            onClick={props.onDocumentFindClose}
          />
        </div>
      </Show>
      <Show
        when={props.file}
        fallback={
          <div
            class={
              stylex.attrs(
                ideUtilityStyles.flex,
                ideUtilityStyles.hFull,
                ideUtilityStyles.itemsCenter,
                ideUtilityStyles.justifyCenter,
                ideUtilityStyles.textXs,
                ideUtilityStyles.textIdeMuted,
              ).class
            }
          >
            Open a file from Explorer.
          </div>
        }
      >
        {(file) => (
          <div
            class={
              stylex.attrs(
                ideUtilityStyles.relative,
                ideUtilityStyles.hFull,
                ideUtilityStyles.minW0,
                ideUtilityStyles.overflowHidden,
                ideUtilityStyles.fontMono,
                ideUtilityStyles.text078,
                ideUtilityStyles.leading6,
              ).class
            }
            style={{ "tab-size": String(props.tabSize) }}
          >
            <Show
              when={!file().isBinary && !file().tooLarge}
              fallback={
                <div
                  class={
                    stylex.attrs(
                      ideUtilityStyles.p3,
                      ideUtilityStyles.textXs,
                      ideUtilityStyles.textIdeMuted,
                    ).class
                  }
                >
                  Binary or oversized file preview is unavailable.
                </div>
              }
            >
              <div
                class={
                  stylex.attrs(
                    ideUtilityStyles.pointerEventsNone,
                    ideUtilityStyles.absolute,
                    ideUtilityStyles.inset0,
                    ideUtilityStyles.minHFull,
                    ideUtilityStyles.p3,
                    ideUtilityStyles.pr6,
                  ).class
                }
                style={{
                  transform: `translate(${-scrollPosition().left}px, ${-scrollPosition().top}px)`,
                }}
              >
                <For each={displayedLines()}>
                  {(line, index) => (
                    <div
                      data-test-ide-code-line={String(index() + 1)}
                      data-word-wrap={props.wordWrap}
                      class={cn(
                        stylex.attrs(
                          ideStyles.codeLine,
                          ideUtilityStyles.grid,
                          ideUtilityStyles.gridCode,
                        ).class,
                        props.wordWrap === "on"
                          ? stylex.attrs(ideStyles.codeLineWrap).class
                          : undefined,
                      )}
                    >
                      <span
                        class={
                          stylex.attrs(
                            ideUtilityStyles.selectNone,
                            ideUtilityStyles.pr3,
                            ideUtilityStyles.textRight,
                            ideUtilityStyles.textIdeMuted,
                          ).class
                        }
                      >
                        {index() + 1}
                      </span>
                      <span
                        data-test-ide-code-text={String(index() + 1)}
                        class={cn(
                          stylex.attrs(
                            ideStyles.codeCell,
                            ideUtilityStyles.whitespacePre,
                          ).class,
                          props.wordWrap === "on"
                            ? stylex.attrs(ideStyles.codeCellWrap).class
                            : undefined,
                          props.bracketPairColorization
                            ? stylex.attrs(ideStyles.codeColorized).class
                            : undefined,
                        )}
                      >
                        <For each={syntaxHighlightLine(line, file().language)}>
                          {(token) => (
                            <span class={tokenClass(token.kind)}>
                              {token.text}
                            </span>
                          )}
                        </For>
                      </span>
                    </div>
                  )}
                </For>
              </div>
              <textarea
                ref={textareaRef}
                aria-label={`Edit ${file().name}`}
                data-word-wrap={props.wordWrap}
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
                  props.wordWrap === "on"
                    ? stylex.attrs(ideStyles.codeInputWrap).class
                    : undefined,
                )}
                value={displayedText()}
                onInput={(event) => handleInput(event.currentTarget)}
                onScroll={(event) => {
                  setScrollPosition({
                    left: event.currentTarget.scrollLeft,
                    top: event.currentTarget.scrollTop,
                  });
                  clearSymbolHover();
                }}
                onMouseMove={scheduleSymbolHover}
                onMouseLeave={clearSymbolHover}
                onClick={(event) => {
                  clearSymbolHover();
                  updateCursor();
                  handleDefinition(event);
                }}
                onKeyUp={updateCursor}
                onSelect={updateCursor}
                onKeyDown={(event) => {
                  clearSymbolHover();
                  if (
                    eventMatchesHotkeys(
                      event,
                      normalizeAppHotkeyPreferences(
                        harnessStore.state.appHotkeyPreferences,
                      ).ideCloseEditor,
                    )
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    props.onCloseTab();
                    return;
                  }
                  if (
                    (event.ctrlKey || event.metaKey) &&
                    event.key.toLowerCase() === "s"
                  ) {
                    event.preventDefault();
                    props.onSave();
                    return;
                  }
                  if (event.key === "F12") {
                    handleDefinition(event);
                    return;
                  }
                  if ((event.ctrlKey || event.metaKey) && event.key === " ") {
                    event.preventDefault();
                    showCompletions();
                    return;
                  }
                  props.onCompletionClose();
                }}
              />
              <Show when={props.completionState}>
                {(completion) => (
                  <div
                    class={
                      stylex.attrs(
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
                      ).class
                    }
                    style={{
                      left: `${completion().x}px`,
                      top: `${completion().y}px`,
                    }}
                  >
                    <For each={completion().items}>
                      {(item) => (
                        <button
                          type="button"
                          class={stylex.attrs(ideStyles.completionRow).class}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => props.onCompletionSelect(item)}
                        >
                          {item}
                        </button>
                      )}
                    </For>
                  </div>
                )}
              </Show>
              <Show when={symbolHover()}>
                {(hover) => (
                  <div
                    data-test-ide-symbol-tooltip=""
                    class={
                      stylex.attrs(
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
                      ).class
                    }
                    style={{
                      left: `${hover().x - 48}px`,
                      top: `${hover().y - 88}px`,
                    }}
                  >
                    <div
                      class={
                        stylex.attrs(
                          ideUtilityStyles.fontMono,
                          ideUtilityStyles.text072,
                          ideUtilityStyles.fontSemibold,
                          ideUtilityStyles.textIdeText,
                        ).class
                      }
                    >
                      {hover().symbol}
                    </div>
                    <div
                      class={
                        stylex.attrs(
                          ideUtilityStyles.mt1,
                          ideUtilityStyles.whitespacePreWrap,
                          ideUtilityStyles.text068,
                          ideUtilityStyles.leading5,
                          ideUtilityStyles.textIdeMuted,
                        ).class
                      }
                    >
                      {hover().detail}
                    </div>
                  </div>
                )}
              </Show>
            </Show>
            <Show when={props.dirty}>
              <div
                class={
                  stylex.attrs(
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
                  ).class
                }
              >
                Unsaved
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}

function countDocumentMatches(lines: string[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return "0/0";
  }
  const count = lines.reduce((sum, line) => {
    const value = line.toLowerCase();
    let index = value.indexOf(needle);
    let matches = 0;
    while (index >= 0) {
      matches += 1;
      index = value.indexOf(needle, index + Math.max(needle.length, 1));
    }
    return sum + matches;
  }, 0);
  return count ? `1/${count}` : "0/0";
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

function getWordAtPosition(line: string, column: number) {
  const position = Math.max(0, column - 1);
  const left = line.slice(0, position).match(/[A-Za-z_$][\w$]*$/)?.[0] ?? "";
  const right = line.slice(position).match(/^[A-Za-z_$][\w$]*/)?.[0] ?? "";
  return `${left}${right}`;
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

function getCompletionPrefix(text: string, position: number) {
  return text.slice(0, position).match(/[A-Za-z_$][\w$]*$/)?.[0] ?? "";
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

function getTextPosition(text: string, position: number) {
  const before = text.slice(0, position).split("\n");
  return { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
}

function applyCompletionAt(
  text: string,
  position: number,
  prefix: string,
  completion: string,
) {
  return `${text.slice(0, Math.max(0, position - prefix.length))}${completion}${text.slice(position)}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferLanguage(name: string) {
  const extension = name.split(".").at(-1)?.toLowerCase();
  if (extension === "tsx" || extension === "ts") {
    return "TypeScript";
  }
  if (extension === "jsx" || extension === "js") {
    return "JavaScript";
  }
  if (extension === "md") {
    return "Markdown";
  }
  if (extension === "json") {
    return "JSON";
  }
  return "Plain Text";
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

export function isIdeProjectSwitcherModKHotkey(hotkey: string) {
  return hotkey.toLowerCase().replace(/\s+/g, "") === "mod+k";
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
    return [`${parts.slice(0, -1).join("+")}`, parts.at(-1) ?? "W"];
  }
  return [normalized];
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

function normalizeHotkeyKey(key: string) {
  return key.length === 1
    ? key.toLowerCase()
    : key.toLowerCase().replace(/^arrow/, "");
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
