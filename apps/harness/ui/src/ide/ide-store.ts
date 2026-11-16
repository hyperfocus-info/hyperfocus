import { createRequestId,type ClientCommand,type IdeFileRead,type IdeFileTreeEntry,type IdeGitChange,type IdeSearchResult,type ServerEvent } from "@hyperfocus/ai-core/protocol";
import { isObject as isRecord } from "@hyperfocus/utilities/records";
import { createStore,reconcile,type SetStoreFunction } from "solid-js/store";
import { harnessStore } from "../harness-store";
import { pushToast } from "../toast-store";

export type IdeActivityView = "explorer" | "search" | "source-control";
export type IdeAutoSaveMode = "off" | "afterDelay" | "onFocusChange";
export type IdeWordWrapMode = "off" | "on";
export type IdeIndentStyle = "spaces" | "tabs";
export type IdeTabSize = 2 | 4;

export type IdeEditorSettings = {
  autoSave: IdeAutoSaveMode;
  wordWrap: IdeWordWrapMode;
  insertSpaces: IdeIndentStyle;
  tabSize: IdeTabSize;
  formatOnSave: boolean;
  breadcrumbsEnabled: boolean;
  bracketPairColorization: boolean;
};

export type IdeEditorFile = IdeFileRead & {
  contentLines: string[];
  cursorLine?: number;
  cursorColumn?: number;
};

type PendingFileRequest = {
  requestId: string;
  revision: number;
};

export type IdeUiState = {
  projectId?: string;
  activityView: IdeActivityView;
  sidebarOpen: boolean;
  sidebarWidth: number;
  primaryEditorWidth: number;
  commandPaletteOpen: boolean;
  commandQuery: string;
  documentFindOpen: boolean;
  documentFindQuery: string;
  treeLoading: boolean;
  treeError?: string;
  treeRootPath?: string;
  treeEntries: IdeFileTreeEntry[];
  treeTruncated: boolean;
  expandedFolderPaths: string[];
  loadingFolderPaths: string[];
  treePendingRequestIds: Record<string, string>;
  openPaths: string[];
  activePath?: string;
  filesByPath: Record<string, IdeEditorFile>;
  dirtyPaths: string[];
  savingPaths: string[];
  pendingReadPath?: string;
  pendingReadRequests: Record<string, PendingFileRequest>;
  pendingWriteRequests: Record<string, PendingFileRequest>;
  fileRevisionsByPath: Record<string, number>;
  searchQuery: string;
  replaceQuery: string;
  regexSearch: boolean;
  caseSensitiveSearch: boolean;
  wholeWordSearch: boolean;
  searchLoading: boolean;
  searchPendingRequestId?: string;
  searchResults: IdeSearchResult[];
  searchTruncated: boolean;
  gitLoading: boolean;
  gitPendingRequestId?: string;
  gitBranch?: string;
  gitIsRepository: boolean;
  gitChanges: IdeGitChange[];
  editorSettings: IdeEditorSettings;
};

const IDE_STATE_STORAGE_KEY = "pi-harness:ide-ui-state:v1";
export const DEFAULT_IDE_EDITOR_SETTINGS: IdeEditorSettings = {
  autoSave: "off",
  wordWrap: "off",
  insertSpaces: "spaces",
  tabSize: 2,
  formatOnSave: true,
  breadcrumbsEnabled: true,
  bracketPairColorization: true
};

const initialState: IdeUiState = {
  activityView: "explorer",
  sidebarOpen: true,
  sidebarWidth: 280,
  primaryEditorWidth: 58,
  commandPaletteOpen: false,
  commandQuery: "",
  documentFindOpen: false,
  documentFindQuery: "",
  treeLoading: false,
  treeEntries: [],
  treeTruncated: false,
  expandedFolderPaths: [],
  loadingFolderPaths: [],
  treePendingRequestIds: {},
  openPaths: [],
  filesByPath: {},
  dirtyPaths: [],
  savingPaths: [],
  pendingReadRequests: {},
  pendingWriteRequests: {},
  fileRevisionsByPath: {},
  searchQuery: "",
  replaceQuery: "",
  regexSearch: false,
  caseSensitiveSearch: false,
  wholeWordSearch: false,
  searchLoading: false,
  searchResults: [],
  searchTruncated: false,
  gitLoading: false,
  gitIsRepository: false,
  gitChanges: [],
  editorSettings: { ...DEFAULT_IDE_EDITOR_SETTINGS }
};

function createEmptyProjectState(projectId?: string): Partial<IdeUiState> {
  return {
    projectId,
    treeLoading: false,
    treeError: undefined,
    treeRootPath: undefined,
    treeEntries: [],
    treeTruncated: false,
    expandedFolderPaths: [],
    loadingFolderPaths: [],
    treePendingRequestIds: {},
    openPaths: [],
    activePath: undefined,
    filesByPath: {},
    dirtyPaths: [],
    savingPaths: [],
    pendingReadPath: undefined,
    pendingReadRequests: {},
    pendingWriteRequests: {},
    fileRevisionsByPath: {},
    searchLoading: false,
    searchPendingRequestId: undefined,
    searchResults: [],
    searchTruncated: false,
    gitLoading: false,
    gitPendingRequestId: undefined,
    gitBranch: undefined,
    gitIsRepository: false,
    gitChanges: []
  };
}

function withoutRecordKey<T>(record: Record<string, T>, key: string) {
  return Object.fromEntries(Object.entries(record).filter(([candidate]) => candidate !== key));
}

function applyIdeServerEvent(options: {
  state: IdeUiState;
  setState: SetStoreFunction<IdeUiState>;
  event: ServerEvent;
  onRootTreeLoaded: (projectId: string) => void;
}) {
  const { state, setState, event } = options;
  switch (event.type) {
    case "ide.fileTree.listed": {
      const requestedPath = event.payload.requestedPath ?? "";
      if (event.payload.projectId !== state.projectId || state.treePendingRequestIds[requestedPath] !== event.requestId) {
        return;
      }
      const treePendingRequestIds = withoutRecordKey(state.treePendingRequestIds, requestedPath);
      if (event.payload.requestedPath) {
        const requestedFolderPath = event.payload.requestedPath;
        setState({
          treeEntries: [
            ...state.treeEntries.filter((entry) => entry.parentPath !== requestedFolderPath),
            ...event.payload.entries
          ],
          loadingFolderPaths: state.loadingFolderPaths.filter((path) => path !== requestedFolderPath),
          treePendingRequestIds,
          treeTruncated: state.treeTruncated || event.payload.truncated,
          treeError: undefined
        });
        return;
      }
      setState({
        treeLoading: false,
        treeRootPath: event.payload.rootPath,
        treeEntries: [...state.treeEntries.filter((entry) => entry.parentPath), ...event.payload.entries],
        treePendingRequestIds,
        treeTruncated: event.payload.truncated,
        treeError: undefined
      });
      options.onRootTreeLoaded(event.payload.projectId);
      return;
    }
    case "ide.file.read": {
      const pendingRead = state.pendingReadRequests[event.payload.path];
      if (event.payload.projectId !== state.projectId || pendingRead?.requestId !== event.requestId) return;
      const pendingReadRequests = withoutRecordKey(state.pendingReadRequests, event.payload.path);
      if ((state.fileRevisionsByPath[event.payload.path] ?? 0) !== pendingRead.revision) {
        setState({
          pendingReadRequests,
          pendingReadPath: state.pendingReadPath === event.payload.path ? undefined : state.pendingReadPath
        });
        return;
      }
      const file = {
        ...event.payload,
        contentLines: event.payload.content?.split(/\r\n|\r|\n/) ?? [
          event.payload.isBinary ? "Binary file preview is unavailable." : "File is too large for read-only preview."
        ]
      };
      setState("filesByPath", event.payload.path, file);
      setState({
        pendingReadRequests,
        pendingReadPath: state.pendingReadPath === event.payload.path ? undefined : state.pendingReadPath
      });
      persistIdeStateSoon(state);
      return;
    }
    case "ide.file.written": {
      const pendingWrite = state.pendingWriteRequests[event.payload.path];
      if (event.payload.projectId !== state.projectId || pendingWrite?.requestId !== event.requestId) return;
      const pendingWriteRequests = withoutRecordKey(state.pendingWriteRequests, event.payload.path);
      const savingPaths = state.savingPaths.filter((path) => path !== event.payload.path);
      if ((state.fileRevisionsByPath[event.payload.path] ?? 0) !== pendingWrite.revision) {
        setState({ pendingWriteRequests, savingPaths });
        return;
      }
      const file = {
        ...event.payload,
        contentLines: event.payload.content?.split(/\r\n|\r|\n/) ?? [
          event.payload.isBinary ? "Binary file preview is unavailable." : "File is too large for editable preview."
        ]
      };
      setState("filesByPath", event.payload.path, file);
      setState({
        pendingWriteRequests,
        dirtyPaths: state.dirtyPaths.filter((path) => path !== event.payload.path),
        savingPaths
      });
      pushToast("File saved", event.payload.path);
      return;
    }
    case "ide.search.results":
      if (event.payload.projectId !== state.projectId || event.requestId !== state.searchPendingRequestId) return;
      setState({
        searchLoading: false,
        searchPendingRequestId: undefined,
        searchResults: event.payload.results,
        searchTruncated: event.payload.truncated
      });
      return;
    case "ide.search.cancelled":
      if (event.payload.projectId === state.projectId && state.searchPendingRequestId === event.payload.searchRequestId) {
        setState({ searchLoading: false, searchPendingRequestId: undefined });
      }
      return;
    case "ide.git.status":
      if (event.payload.projectId !== state.projectId || event.requestId !== state.gitPendingRequestId) return;
      setState({
        gitLoading: false,
        gitPendingRequestId: undefined,
        gitBranch: event.payload.branch,
        gitIsRepository: event.payload.isRepository,
        gitChanges: event.payload.changes
      });
      return;
    case "command.rejected":
      if (!event.payload.message.startsWith("IDE ") || !event.requestId) return;
      applyIdeCommandRejection(state, setState, event.requestId);
      return;
  }
}

function applyIdeCommandRejection(state: IdeUiState, setState: SetStoreFunction<IdeUiState>, requestId: string) {
  const treeEntry = Object.entries(state.treePendingRequestIds).find(([, pendingId]) => pendingId === requestId);
  if (treeEntry) {
    const requestedPath = treeEntry[0];
    setState({
      treeLoading: requestedPath ? state.treeLoading : false,
      loadingFolderPaths: state.loadingFolderPaths.filter((path) => path !== requestedPath),
      treePendingRequestIds: withoutRecordKey(state.treePendingRequestIds, requestedPath)
    });
  }
  const readEntry = Object.entries(state.pendingReadRequests).find(([, pending]) => pending.requestId === requestId);
  if (readEntry) {
    setState({
      pendingReadPath: state.pendingReadPath === readEntry[0] ? undefined : state.pendingReadPath,
      pendingReadRequests: withoutRecordKey(state.pendingReadRequests, readEntry[0])
    });
  }
  const writeEntry = Object.entries(state.pendingWriteRequests).find(([, pending]) => pending.requestId === requestId);
  if (writeEntry) {
    setState({
      savingPaths: state.savingPaths.filter((path) => path !== writeEntry[0]),
      pendingWriteRequests: withoutRecordKey(state.pendingWriteRequests, writeEntry[0])
    });
  }
  if (state.searchPendingRequestId === requestId) setState({ searchLoading: false, searchPendingRequestId: undefined });
  if (state.gitPendingRequestId === requestId) setState({ gitLoading: false, gitPendingRequestId: undefined });
}

function createIdeStateActions(options: {
  state: IdeUiState;
  setState: SetStoreFunction<IdeUiState>;
  activeProjectId: () => string | undefined;
  loadFolder: (path: string, projectId?: string) => void;
  setCursor: (line: number, column: number) => void;
}) {
  const { state, setState, activeProjectId, loadFolder, setCursor } = options;
  return {
    setActivityView(activityView: IdeActivityView) {
      setState({ activityView });
      persistIdeStateSoon(state);
    },
    setSidebarOpen(sidebarOpen: boolean) {
      setState({ sidebarOpen });
      persistIdeStateSoon(state);
    },
    setSidebarWidth(sidebarWidth: number) {
      setState({ sidebarWidth });
      persistIdeStateSoon(state);
    },
    setPrimaryEditorWidth(primaryEditorWidth: number) {
      setState({ primaryEditorWidth });
      persistIdeStateSoon(state);
    },
    setCommandPalette(open: boolean, query = state.commandQuery) {
      setState({ commandPaletteOpen: open, commandQuery: query });
    },
    setCommandQuery(commandQuery: string) {
      setState({ commandQuery });
    },
    setDocumentFindOpen(documentFindOpen: boolean) {
      setState({ documentFindOpen });
    },
    setDocumentFindQuery(documentFindQuery: string) {
      setState({ documentFindQuery });
    },
    setSearchQuery(searchQuery: string) {
      setState({ searchQuery });
    },
    setReplaceQuery(replaceQuery: string) {
      setState({ replaceQuery });
    },
    setRegexSearch(regexSearch: boolean) {
      setState({ regexSearch });
    },
    setCaseSensitiveSearch(caseSensitiveSearch: boolean) {
      setState({ caseSensitiveSearch });
    },
    setWholeWordSearch(wholeWordSearch: boolean) {
      setState({ wholeWordSearch });
    },
    updateFileContent(path: string, content: string) {
      const file = state.filesByPath[path];
      if (!file) return;
      const contentLines = content.split(/\r\n|\r|\n/);
      setState("filesByPath", path, { ...file, content, contentLines, lineCount: contentLines.length });
      setState({
        dirtyPaths: state.dirtyPaths.includes(path) ? state.dirtyPaths : [...state.dirtyPaths, path],
        fileRevisionsByPath: { ...state.fileRevisionsByPath, [path]: (state.fileRevisionsByPath[path] ?? 0) + 1 }
      });
    },
    setEditorSetting<K extends keyof IdeEditorSettings>(key: K, value: IdeEditorSettings[K]) {
      setState("editorSettings", key, value);
      persistIdeStateSoon(state);
    },
    resetEditorSettings() {
      setState({ editorSettings: { ...DEFAULT_IDE_EDITOR_SETTINGS } });
      persistIdeStateSoon(state);
    },
    setActivePath(activePath: string | undefined) {
      setState({ activePath });
      persistIdeStateSoon(state);
    },
    loadFolder,
    toggleFolder(path: string) {
      if (state.expandedFolderPaths.includes(path)) {
        const descendants = state.treeEntries.filter((entry) => entry.path.startsWith(`${path}/`)).map((entry) => entry.path);
        setState({
          expandedFolderPaths: state.expandedFolderPaths.filter(
            (entryPath) => entryPath !== path && !descendants.includes(entryPath)
          )
        });
        persistIdeStateSoon(state);
        return;
      }
      setState({ expandedFolderPaths: [...state.expandedFolderPaths, path] });
      persistIdeStateSoon(state);
      loadFolder(path);
    },
    collapseAllFolders() {
      setState({ expandedFolderPaths: [] });
      persistIdeStateSoon(state);
    },
    loadExpandedFolders(projectId = activeProjectId()) {
      if (!projectId || projectId !== state.projectId) return;
      for (const folderPath of state.expandedFolderPaths) {
        if (!state.treeEntries.some((entry) => entry.parentPath === folderPath)) {
          loadFolder(folderPath, projectId);
        }
      }
    },
    closeTab(path: string) {
      const next = state.openPaths.filter((candidate) => candidate !== path);
      setState({ openPaths: next, activePath: state.activePath === path ? next[0] : state.activePath });
      persistIdeStateSoon(state);
      return next;
    },
    closeAllTabs() {
      setState({ openPaths: [], activePath: undefined });
      persistIdeStateSoon(state);
      return [];
    },
    closeOtherTabs(path: string) {
      setState({ openPaths: [path], activePath: path });
      persistIdeStateSoon(state);
    },
    setCursor
  };
}

function createIdeStore() {
  const [state, setState] = createStore<IdeUiState>({ ...initialState, ...readPersistedIdeState() });

  const activeProjectId = () => harnessStore.state.workspace.activeProjectId ?? harnessStore.state.workspace.projects[0]?.id;

  function send(command: ClientCommand) {
    return harnessStore.actions.sendCommand(command);
  }

  function activateProjectState(projectId: string) {
    if (state.projectId === projectId) return;
    setState(createEmptyProjectState(projectId));
    persistIdeStateSoon(state);
  }

  function loadProject(projectId = activeProjectId()) {
    if (!projectId) {
      setState({
        ...createEmptyProjectState(),
        treeError: "Open a project to browse files.",
      });
      return;
    }
    activateProjectState(projectId);
    const treeRequestId = createRequestId();
    const gitRequestId = createRequestId();
    setState({
      treeLoading: true,
      treeError: undefined,
      treePendingRequestIds: { ...state.treePendingRequestIds, "": treeRequestId },
      gitLoading: true,
      gitPendingRequestId: gitRequestId
    });
    send({ type: "ide.fileTree.list", requestId: treeRequestId, payload: { projectId } });
    send({ type: "ide.git.status", requestId: gitRequestId, payload: { projectId } });
    const activePath = state.activePath;
    if (activePath && !state.filesByPath[activePath] && !state.pendingReadRequests[activePath]) {
      const requestId = createRequestId();
      setState({
        pendingReadPath: activePath,
        pendingReadRequests: {
          ...state.pendingReadRequests,
          [activePath]: { requestId, revision: state.fileRevisionsByPath[activePath] ?? 0 }
        }
      });
      send({ type: "ide.file.read", requestId, payload: { projectId, path: activePath } });
    }
  }

  function loadFolder(path: string, projectId = activeProjectId()) {
    if (!projectId || state.loadingFolderPaths.includes(path)) {
      return;
    }
    activateProjectState(projectId);
    const requestId = createRequestId();
    setState({
      loadingFolderPaths: [...state.loadingFolderPaths, path],
      treePendingRequestIds: { ...state.treePendingRequestIds, [path]: requestId }
    });
    send({ type: "ide.fileTree.list", requestId, payload: { projectId, rootPath: path } });
  }

  function openFile(path: string, line?: number, column?: number) {
    const projectId = activeProjectId();
    if (!projectId) {
      pushToast("No active project", "Open a project before opening files.", "error");
      return;
    }
    activateProjectState(projectId);
    const normalizedPath = path.replace(/\\/g, "/");
    const requestId = createRequestId();
    setState({
      pendingReadPath: normalizedPath,
      pendingReadRequests: {
        ...state.pendingReadRequests,
        [normalizedPath]: { requestId, revision: state.fileRevisionsByPath[normalizedPath] ?? 0 }
      },
      activePath: normalizedPath,
      openPaths: state.openPaths.includes(normalizedPath) ? state.openPaths : [...state.openPaths, normalizedPath]
    });
    if (line) {
      setCursor(line, column ?? 1);
    }
    persistIdeStateSoon(state);
    send({ type: "ide.file.read", requestId, payload: { projectId, path: normalizedPath } });
  }

  function runSearch() {
    const projectId = activeProjectId();
    const query = state.searchQuery.trim();
    if (!projectId || !query) {
      setState({ searchLoading: false, searchPendingRequestId: undefined, searchResults: [], searchTruncated: false });
      return;
    }
    activateProjectState(projectId);
    if (state.searchPendingRequestId) {
      send({
        type: "ide.search.cancel",
        requestId: createRequestId(),
        payload: { projectId, searchRequestId: state.searchPendingRequestId }
      });
    }
    const requestId = createRequestId();
    setState({ searchLoading: true, searchPendingRequestId: requestId });
    send({
      type: "ide.search.run",
      requestId,
      payload: {
        projectId,
        query,
        regex: state.regexSearch,
        caseSensitive: state.caseSensitiveSearch,
        wholeWord: state.wholeWordSearch
      }
    });
  }

  function saveFile(path = state.activePath) {
    const projectId = activeProjectId();
    if (!projectId || !path) {
      pushToast("No active file", "Open a file before saving.", "error");
      return;
    }
    const file = state.filesByPath[path];
    if (!file || file.isBinary || file.tooLarge || typeof file.content !== "string") {
      pushToast("File cannot be saved", "Binary and oversized files are not editable.", "error");
      return;
    }
    if (file.projectId !== projectId || state.projectId !== projectId) {
      pushToast("File project changed", "Reopen the file in the active project before saving.", "error");
      return;
    }
    const requestId = createRequestId();
    setState({
      savingPaths: state.savingPaths.includes(path) ? state.savingPaths : [...state.savingPaths, path],
      pendingWriteRequests: {
        ...state.pendingWriteRequests,
        [path]: { requestId, revision: state.fileRevisionsByPath[path] ?? 0 }
      }
    });
    send({ type: "ide.file.write", requestId, payload: { projectId, path, content: file.content } });
  }

  function setCursor(line: number, column: number) {
    if (!state.activePath) {
      return;
    }
    setState("filesByPath", state.activePath, (file) => file ? { ...file, cursorLine: line, cursorColumn: column } : file);
  }

  const stateActions = createIdeStateActions({ state, setState, activeProjectId, loadFolder, setCursor });

  return {
    state,
    loadProject,
    openFile,
    runSearch,
    saveFile,
    ...stateActions,
    applyServerEvent(event: ServerEvent) {
      applyIdeServerEvent({
        state,
        setState,
        event,
        onRootTreeLoaded: (projectId) => queueMicrotask(() => {
          if (ideStore.state.projectId === projectId) ideStore.loadExpandedFolders(projectId);
        })
      });
    },
    resetForTests(overrides: Partial<IdeUiState> = {}) {
      setState(reconcile({ ...initialState, ...overrides }));
    }
  };
}

export const ideStore = createIdeStore();

function readPersistedIdeState(): Partial<IdeUiState> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(IDE_STATE_STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return {
      projectId: typeof parsed.projectId === "string" ? parsed.projectId : undefined,
      activityView: isIdeActivityView(parsed.activityView) ? parsed.activityView : initialState.activityView,
      sidebarOpen: typeof parsed.sidebarOpen === "boolean" ? parsed.sidebarOpen : initialState.sidebarOpen,
      sidebarWidth: clampNumber(parsed.sidebarWidth, 220, 420, initialState.sidebarWidth),
      primaryEditorWidth: clampNumber(parsed.primaryEditorWidth, 42, 72, initialState.primaryEditorWidth),
      expandedFolderPaths: stringArray(parsed.expandedFolderPaths),
      openPaths: stringArray(parsed.openPaths),
      activePath: typeof parsed.activePath === "string" ? parsed.activePath : undefined,
      editorSettings: parseIdeEditorSettings(parsed.editorSettings)
    };
  } catch {
    return {};
  }
}

function persistIdeStateSoon(state: IdeUiState) {
  if (typeof window === "undefined") {
    return;
  }
  queueMicrotask(() => {
    window.localStorage.setItem(IDE_STATE_STORAGE_KEY, JSON.stringify({
      projectId: state.projectId,
      activityView: state.activityView,
      sidebarOpen: state.sidebarOpen,
      sidebarWidth: state.sidebarWidth,
      primaryEditorWidth: state.primaryEditorWidth,
      expandedFolderPaths: state.expandedFolderPaths,
      openPaths: state.openPaths,
      activePath: state.activePath,
      editorSettings: state.editorSettings
    }));
  });
}

function parseIdeEditorSettings(value: unknown): IdeEditorSettings {
  const parsed = isRecord(value) ? value : {};
  return {
    autoSave: parsed.autoSave === "afterDelay" || parsed.autoSave === "onFocusChange" ? parsed.autoSave : "off",
    wordWrap: parsed.wordWrap === "on" ? "on" : "off",
    insertSpaces: parsed.insertSpaces === "tabs" ? "tabs" : "spaces",
    tabSize: parsed.tabSize === 4 ? 4 : 2,
    formatOnSave: typeof parsed.formatOnSave === "boolean" ? parsed.formatOnSave : true,
    breadcrumbsEnabled: typeof parsed.breadcrumbsEnabled === "boolean" ? parsed.breadcrumbsEnabled : true,
    bracketPairColorization: typeof parsed.bracketPairColorization === "boolean" ? parsed.bracketPairColorization : true
  };
}


function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function isIdeActivityView(value: unknown): value is IdeActivityView {
  return value === "explorer" || value === "search" || value === "source-control";
}
