import { createRequestId,type BulkOperationTarget } from "@hyperfocus/ai-core/protocol";
import * as stylex from "@stylexjs/stylex";
import {
type DragEventHandler
} from "@thisbeyond/solid-dnd";
import { createEffect,createMemo,createSignal,getOwner,onCleanup,onMount,runWithOwner,type Accessor,type Setter } from "solid-js";
import { usePaneNavigation } from "../../app/pane-navigation";
import {
getActiveProject,
harnessStore,
type ProjectSidebarGrouping,
type ProjectSidebarProjectSort,
type ProjectSidebarThreadSort
} from "../../harness-store";
import { registerCurrentTabItemSelector } from "../../lib/current-tab-item-hotkeys";
import { openIdeWindow } from "../../lib/ide-window";
import { buildProjectChatSearchResults,type ProjectChatSearchResult } from "../../lib/project-chat-search";
import { activateProjectThread } from "../../project-thread-navigation";
import { useHarnessStore } from "../../store-providers";
import type { ContextMenuAction } from "../primitives/context-menu";
import { type VirtualListHandle } from "../primitives/virtual-list";
import { projectNavigationStyles as styles } from "../project-navigation.styles";
import type { ProjectCard,ProjectSidebarRow,ProjectThreadCard } from "./project-sidebar-model";
import { compareProjects,flattenProjectSidebarRows,getEarliestIso,getLatestIso,groupProjectCards,maxIso,mergeProjectRangeSelection,moveId,sortThreads,toggleSelectionId } from "./project-sidebar-model";
import { ProjectSidebarView } from "./project-sidebar-view";
import { ProjectSidebarProvider } from "./state/panel-context";

type ProjectSidebarProps = {
  compact?: boolean;
};

type ProjectSidebarStore = ReturnType<typeof useHarnessStore>;
type ProjectSidebarOrganizationOptions = {
  store: ProjectSidebarStore;
  state: ProjectSidebarStore["state"];
  sendCommand: ProjectSidebarStore["actions"]["sendCommand"];
  visibleProjectIds: Accessor<string[]>;
  manualSortActive: () => boolean;
  editingThreadId: Accessor<string | undefined>;
  setEditingThreadId: Setter<string | undefined>;
  threadTitleDraft: Accessor<string>;
  setThreadTitleDraft: Setter<string>;
};
type ProjectSidebarSelectionOptions = {
  sendCommand: ProjectSidebarStore["actions"]["sendCommand"];
  sidebarRows: Accessor<ProjectSidebarRow[]>;
  visibleProjectIds: Accessor<string[]>;
  selectedProjectIds: Accessor<string[]>;
  setSelectedProjectIds: Setter<string[]>;
  projectSelectionAnchorId: Accessor<string | undefined>;
  setProjectSelectionAnchorId: Setter<string | undefined>;
  selectedProjectIdSet: Accessor<Set<string>>;
  selectedProjects: Accessor<ProjectCard[]>;
  handleActivateProject: (projectId: string) => void;
};
type ProjectSidebarContextActionOptions = {
  projectCards: Accessor<ProjectCard[]>;
  visibleProjectIds: Accessor<string[]>;
  manualSortActive: () => boolean;
  showContextMenu: (menu: { x: number; y: number; ariaLabel: string; actions: ContextMenuAction[] }) => void;
  handleCreateThread: (projectId: string) => void;
  handleOpenProjectInIde: (projectId: string, threadId?: string) => void;
  handleRemoveProject: (projectId: string) => void;
  handlePinThread: (projectId: string, threadId: string, pinned: boolean) => void;
  handleForkThread: (projectId: string, sourceThreadId: string) => void;
  handleArchiveThread: (projectId: string, threadId: string) => void;
  organization: ProjectSidebarOrganizationActions;
  selection: ProjectSidebarSelectionActions;
};

function projectRemoveDisabledReason(project: ProjectCard) {
    return project.hasWorkingThread ? "Project is streaming" : project.hasCliSession ? "Live CLI session attached" : undefined;
  }

function createProjectSidebarOrganizationActions(options: ProjectSidebarOrganizationOptions) {
  const {
    store, state, sendCommand, visibleProjectIds, manualSortActive, setEditingThreadId,
    threadTitleDraft, setThreadTitleDraft,
  } = options;
function setProjectSort(projectSort: ProjectSidebarProjectSort) {
    store.setProjectSidebarPreferences({ projectSort });
  }
function setThreadSort(threadSort: ProjectSidebarThreadSort) {
    store.setProjectSidebarPreferences({ threadSort });
  }
function setGrouping(grouping: ProjectSidebarGrouping) {
    store.setProjectSidebarPreferences({ grouping });
  }
function persistManualOrder(nextVisibleOrder: string[]) {
    const visible = new Set(nextVisibleOrder);
    store.setProjectSidebarPreferences({
      manualProjectOrder: [
        ...nextVisibleOrder,
        ...state.projectSidebarPreferences.manualProjectOrder.filter((projectId) => !visible.has(projectId))
      ]
    });
  }
function setProjectCollapsed(projectId: string, collapsed: boolean) {
    const nextCollapsedProjectIds = collapsed
      ? [...state.projectSidebarPreferences.collapsedProjectIds.filter((id) => id !== projectId), projectId]
      : state.projectSidebarPreferences.collapsedProjectIds.filter((id) => id !== projectId);
    store.setProjectSidebarPreferences({ collapsedProjectIds: nextCollapsedProjectIds });
  }
const handleProjectDragEnd: DragEventHandler = ({ draggable, droppable }) => {
    if (!manualSortActive() || !droppable || draggable.id === droppable.id) {
      return;
    }

    const ids = visibleProjectIds();
    const fromIndex = ids.indexOf(String(draggable.id));
    const toIndex = ids.indexOf(String(droppable.id));
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    persistManualOrder(moveId(ids, fromIndex, toIndex));
  };
function moveProject(projectId: string, direction: -1 | 1) {
    const ids = visibleProjectIds();
    const fromIndex = ids.indexOf(projectId);
    const toIndex = fromIndex + direction;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= ids.length) {
      return;
    }

    persistManualOrder(moveId(ids, fromIndex, toIndex));
  }
function startRename(threadId: string, title: string) {
    setEditingThreadId(threadId);
    setThreadTitleDraft(title);
  }
function commitRename(projectId: string, threadId: string) {
    const title = threadTitleDraft().trim();
    if (!title) {
      setEditingThreadId(undefined);
      return;
    }

    sendCommand({
      type: "thread.rename",
      requestId: createRequestId(),
      payload: { projectId, threadId, title }
    });
    setEditingThreadId(undefined);
  }
  return { setProjectSort, setThreadSort, setGrouping, persistManualOrder, setProjectCollapsed, handleProjectDragEnd, moveProject, startRename, commitRename };
}
type ProjectSidebarOrganizationActions = ReturnType<typeof createProjectSidebarOrganizationActions>;

function createProjectSidebarSelectionActions(options: ProjectSidebarSelectionOptions) {
  const { sendCommand, sidebarRows, visibleProjectIds, setSelectedProjectIds, projectSelectionAnchorId, setProjectSelectionAnchorId, selectedProjectIdSet, selectedProjects, handleActivateProject } = options;
  let pendingProjectSelectionTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingProjectSelectionId: string | undefined;
  let consumedProjectDelayedSelection = false;
function activeSidebarRowKey() {
    const row = sidebarRows().find((candidate) => candidate.kind === "project" && candidate.project.isActive);
    if (!row) {
      return undefined;
    }
    return row.key;
  }
function clearProjectSelectionTimer() {
    if (pendingProjectSelectionTimer) {
      clearTimeout(pendingProjectSelectionTimer);
      pendingProjectSelectionTimer = undefined;
    }
    if (!consumedProjectDelayedSelection) {
      pendingProjectSelectionId = undefined;
    }
  }
function scheduleProjectDelayedSelection(projectId: string, event: PointerEvent) {
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || isInteractiveProjectSelectionTarget(event.target)) {
      return;
    }
    clearProjectSelectionTimer();
    pendingProjectSelectionId = projectId;
    pendingProjectSelectionTimer = setTimeout(() => {
      pendingProjectSelectionTimer = undefined;
      consumedProjectDelayedSelection = true;
      setSelectedProjectIds((ids) => (ids.includes(projectId) ? ids : [...ids, projectId]));
      setProjectSelectionAnchorId(projectId);
    }, 250);
  }
function consumeProjectDelayedSelection(projectId: string) {
    if (!consumedProjectDelayedSelection || pendingProjectSelectionId !== projectId) {
      return false;
    }
    consumedProjectDelayedSelection = false;
    pendingProjectSelectionId = undefined;
    return true;
  }
function isInteractiveProjectSelectionTarget(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest("button,a,input,textarea,select,[role='menuitem']"));
  }
function selectProjectWithMouse(project: ProjectCard, event: MouseEvent) {
    if (event.shiftKey) {
      const anchorId = projectSelectionAnchorId() ?? project.id;
      setSelectedProjectIds((ids) => mergeProjectRangeSelection(ids, visibleProjectIds(), anchorId, project.id));
      setProjectSelectionAnchorId(anchorId);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      setSelectedProjectIds((ids) => toggleSelectionId(ids, project.id));
      setProjectSelectionAnchorId(project.id);
      return;
    }
    setSelectedProjectIds([project.id]);
    setProjectSelectionAnchorId(project.id);
  }
function handleProjectCardClick(project: ProjectCard, event: MouseEvent) {
    if (isInteractiveProjectSelectionTarget(event.target)) {
      return;
    }
    if (consumeProjectDelayedSelection(project.id)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      event.preventDefault();
      event.stopPropagation();
      selectProjectWithMouse(project, event);
      return;
    }
    handleActivateProject(project.id);
  }
function bulkProjectTargets(projects: ProjectCard[]): BulkOperationTarget[] {
    return projects.map((project) => ({
      kind: "project",
      projectId: project.id
    }));
  }
function sendBulkProjectDelete(projects: ProjectCard[]) {
    if (projects.length === 0) {
      return;
    }
    sendCommand({
      type: "bulk-operation.apply",
      requestId: createRequestId(),
      payload: {
        operationId: createRequestId(),
        action: "delete",
        targets: bulkProjectTargets(projects)
      }
    });
  }
function selectedOrSingleProject(project: ProjectCard) {
    return selectedProjectIdSet().has(project.id) ? selectedProjects() : [project];
  }
  return { activeSidebarRowKey, clearProjectSelectionTimer, scheduleProjectDelayedSelection, consumeProjectDelayedSelection, isInteractiveProjectSelectionTarget, selectProjectWithMouse, handleProjectCardClick, bulkProjectTargets, sendBulkProjectDelete, selectedOrSingleProject };
}
type ProjectSidebarSelectionActions = ReturnType<typeof createProjectSidebarSelectionActions>;

function createProjectSidebarContextActions(options: ProjectSidebarContextActionOptions) {
  const { projectCards, visibleProjectIds, manualSortActive, showContextMenu, handleCreateThread, handleOpenProjectInIde, handleRemoveProject, handlePinThread, handleForkThread, handleArchiveThread } = options;
  const { moveProject, startRename } = options.organization;
  const { selectedOrSingleProject, sendBulkProjectDelete } = options.selection;
function projectBulkContextActions(projects: ProjectCard[]): ContextMenuAction[] {
    const removeDisabledReason = projects.map(projectRemoveDisabledReason).find(Boolean);
    return [
      {
        id: "remove-selected",
        label: `Remove selected (${projects.length})`,
        disabled: Boolean(removeDisabledReason),
        disabledReason: removeDisabledReason,
        onSelect: () => sendBulkProjectDelete(projects)
      },
      {
        id: "open-selected-ide",
        label: `Open in IDE (${projects.length})`,
        onSelect: () => projects.forEach((project) => handleOpenProjectInIde(project.id))
      }
    ];
  }
function projectContextActions(project: ProjectCard): ContextMenuAction[] {
    const selected = selectedOrSingleProject(project);
    if (selected.length > 1) {
      return projectBulkContextActions(selected);
    }
    const removeDisabledReason = projectRemoveDisabledReason(project);
    const projectIndex = visibleProjectIds().indexOf(project.id);
    return [
      {
        id: "new-thread",
        label: "New thread",
        onSelect: () => handleCreateThread(project.id)
      },
      {
        id: "remove",
        label: "Remove",
        disabled: Boolean(removeDisabledReason),
        disabledReason: removeDisabledReason,
        onSelect: () => handleRemoveProject(project.id)
      },
      ...(manualSortActive()
        ? [
            {
              id: "move-up",
              label: "Move up",
              disabled: projectIndex === 0,
              disabledReason: "Already first project",
              onSelect: () => moveProject(project.id, -1)
            },
            {
              id: "move-down",
              label: "Move down",
              disabled: projectIndex === visibleProjectIds().length - 1,
              disabledReason: "Already last project",
              onSelect: () => moveProject(project.id, 1)
            }
          ]
        : []),
      {
        id: "open-ide",
        label: "Open in IDE",
        onSelect: () => handleOpenProjectInIde(project.id)
      }
    ];
  }
function threadContextActions(project: ProjectCard, thread: ProjectThreadCard): ContextMenuAction[] {
    return [
      {
        id: "pin",
        label: thread.pinned ? "Unpin" : "Pin",
        onSelect: () => handlePinThread(project.id, thread.id, !thread.pinned)
      },
      {
        id: "fork",
        label: "Fork",
        onSelect: () => handleForkThread(project.id, thread.id)
      },
      {
        id: "rename",
        label: "Rename",
        onSelect: () => startRename(thread.id, thread.title)
      },
      {
        id: "delete",
        label: "Delete",
        disabled: thread.pinned,
        disabledReason: "Pinned threads cannot be archived.",
        onSelect: () => handleArchiveThread(project.id, thread.id)
      },
      {
        id: "open-ide",
        label: "Open in IDE",
        onSelect: () => handleOpenProjectInIde(project.id, thread.id)
      }
    ];
  }
function openNodeContextMenu(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const threadCard = target.closest<HTMLElement>("[data-test-project-thread-card]");
    if (threadCard?.dataset.projectId && threadCard.dataset.threadId) {
      const project = projectCards().find((candidate) => candidate.id === threadCard.dataset.projectId);
      const thread = project?.threads.find((candidate) => candidate.id === threadCard.dataset.threadId);
      if (project && thread) {
        event.preventDefault();
        showContextMenu({
          x: event.clientX,
          y: event.clientY,
          ariaLabel: `${thread.title} actions`,
          actions: threadContextActions(project, thread)
        });
      }
      return;
    }

    const projectCard = target.closest<HTMLElement>("[data-test-project-card]");
    if (projectCard?.dataset.projectId) {
      const project = projectCards().find((candidate) => candidate.id === projectCard.dataset.projectId);
      if (project) {
        event.preventDefault();
        showContextMenu({
          x: event.clientX,
          y: event.clientY,
          ariaLabel: `${project.name} actions`,
          actions: projectContextActions(project)
        });
      }
    }
  }
  return { projectBulkContextActions, projectContextActions, threadContextActions, openNodeContextMenu };
}

function createProjectSidebarCards(state: ProjectSidebarStore["state"]) {
  return createMemo(() => {
    const preferences = state.projectSidebarPreferences;
    const manualOrder = new Map(preferences.manualProjectOrder.map((projectId, index) => [projectId, index]));
    const collapsedProjectIds = new Set(preferences.collapsedProjectIds);
    const cards = state.workspace.projects.map((project, workspaceIndex) => {
      const userThreads = project.threads.filter((thread) => thread.kind === "user" && thread.status === "active");
      const isCollapsed = collapsedProjectIds.has(project.id);
      const sortedThreads = sortThreads(
        userThreads.map((thread) => ({
          id: thread.id,
          title: thread.title,
          lastMessagePreview: thread.lastMessagePreview,
          badgeState: thread.badgeState,
          messageCount: thread.messageCount,
          createdAt: thread.createdAt ?? thread.updatedAt,
          updatedAt: thread.updatedAt,
          lastUserMessageAt: thread.lastUserMessageAt,
          pinned: Boolean(thread.pinned)
        })),
        preferences.threadSort
      );
      return {
        id: project.id,
        name: project.name,
        rootPath: project.rootPath,
        workspaceIndex,
        isStreaming: project.session.isStreaming,
        hasWorkingThread: project.threads.some(
          (thread) => thread.badgeState === "planning" || thread.badgeState === "executing"
        ),
        hasCliSession: Boolean(project.activeCliSession),
        isActive: project.id === state.workspace.activeProjectId,
        isCollapsed,
        activeThreadId: project.activeThreadId,
        threadCount: userThreads.length,
        updatedAt: project.threads.reduce(
          (latest, thread) => maxIso(latest, thread.updatedAt),
          project.session.messages.at(-1)?.createdAt
        ),
        createdAt: getEarliestIso(project.threads.map((thread) => thread.createdAt ?? thread.updatedAt)),
        lastUserMessageAt: getLatestIso(project.threads.map((thread) => thread.lastUserMessageAt)),
        threads: isCollapsed ? [] : sortedThreads
      };
    });
    return [...cards].sort((left, right) =>
      compareProjects(left, right, preferences.projectSort, manualOrder)
    );
  });
}

function createProjectSidebarNavigationActions(options: {
  state: ProjectSidebarStore["state"];
  sendCommand: ProjectSidebarStore["actions"]["sendCommand"];
  onNavigate?: () => void;
  setProjectCollapsed: (projectId: string, collapsed: boolean) => void;
  setProjectChatSearch: Setter<string>;
  setProjectChatSearchIndex: Setter<number>;
}) {
  const { state, sendCommand } = options;
  function handleActivateProject(projectId: string) {
    if (projectId === state.workspace.activeProjectId) return;
    sendCommand({ type: "project.activate", requestId: createRequestId(), payload: { projectId } });
    options.onNavigate?.();
  }
  function handleActivateThread(projectId: string, threadId: string) {
    activateProjectThread(state, projectId, threadId, sendCommand);
    options.onNavigate?.();
  }
  function openProjectChatSearchResult(result: ProjectChatSearchResult) {
    if (result.threadId) {
      activateProjectThread(state, result.projectId, result.threadId, sendCommand);
    } else if (state.workspace.activeProjectId !== result.projectId) {
      sendCommand({
        type: "project.activate",
        requestId: createRequestId(),
        payload: { projectId: result.projectId }
      });
    }
    harnessStore.setChatPaneTab("chat");
    options.setProjectChatSearch("");
    options.setProjectChatSearchIndex(0);
    options.onNavigate?.();
  }
  function handleCreateThread(projectId: string) {
    options.setProjectCollapsed(projectId, false);
    sendCommand({ type: "thread.create", requestId: createRequestId(), payload: { projectId } });
  }
  function handleOpenProjectInIde(projectId: string, threadId?: string) {
    if (threadId) {
      activateProjectThread(state, projectId, threadId, sendCommand);
    } else if (state.workspace.activeProjectId !== projectId) {
      sendCommand({ type: "project.activate", requestId: createRequestId(), payload: { projectId } });
    }
    openIdeWindow({ projectId, threadId });
  }
  function handleForkThread(projectId: string, sourceThreadId: string) {
    sendCommand({ type: "thread.fork", requestId: createRequestId(), payload: { projectId, sourceThreadId } });
  }
  function handlePinThread(projectId: string, threadId: string, pinned: boolean) {
    sendCommand({ type: "thread.pin", requestId: createRequestId(), payload: { projectId, threadId, pinned } });
  }
  function handleRemoveProject(projectId: string) {
    sendCommand({ type: "project.remove", requestId: createRequestId(), payload: { projectId } });
  }
  function handleArchiveThread(projectId: string, threadId: string) {
    sendCommand({ type: "thread.archive", requestId: createRequestId(), payload: { projectId, threadId } });
  }
  return {
    handleActivateProject,
    handleActivateThread,
    openProjectChatSearchResult,
    handleCreateThread,
    handleOpenProjectInIde,
    handleForkThread,
    handlePinThread,
    handleRemoveProject,
    handleArchiveThread
  };
}

function registerProjectSidebarLifecycle(options: {
  sidebarRows: Accessor<ProjectSidebarRow[]>;
  activeSidebarRowKey: Accessor<string | undefined>;
  lastScrolledActiveKey: Accessor<string | undefined>;
  setLastScrolledActiveKey: Setter<string | undefined>;
  scrollSidebarToKey: (key: string) => void;
  visibleProjectIds: Accessor<string[]>;
  setSelectedProjectIds: Setter<string[]>;
  projectSelectionAnchorId: Accessor<string | undefined>;
  setProjectSelectionAnchorId: Setter<string | undefined>;
  clearProjectSelectionTimer: () => void;
  projectChatSearch: Accessor<string>;
  projectChatSearchResults: Accessor<ProjectChatSearchResult[]>;
  selectableProjectThreads: Accessor<Array<{ projectId: string; threadId: string }>>;
  openProjectChatSearchResult: (result: ProjectChatSearchResult) => void;
  handleActivateThread: (projectId: string, threadId: string) => void;
  focusProjectSearch: () => void;
  openNodeContextMenu: (event: MouseEvent) => void;
  isContextMenuOpen: () => boolean;
  contextMenuSurfaceContains: (target: Node) => boolean;
  hideContextMenu: () => void;
  getSidebarShellElement: () => HTMLElement | undefined;
}) {
  createEffect(() => {
    const key = options.activeSidebarRowKey();
    options.sidebarRows().length;
    if (!key || options.lastScrolledActiveKey() === key) return;
    options.setLastScrolledActiveKey(key);
    queueMicrotask(() => options.scrollSidebarToKey(key));
  });
  createEffect(() => {
    const visibleIds = new Set(options.visibleProjectIds());
    options.setSelectedProjectIds((ids) => ids.filter((id) => visibleIds.has(id)));
    const anchorId = options.projectSelectionAnchorId();
    if (anchorId && !visibleIds.has(anchorId)) options.setProjectSelectionAnchorId(undefined);
  });
  onCleanup(options.clearProjectSelectionTimer);
  onMount(() => {
    const unregisterItemSelector = registerCurrentTabItemSelector("projects", (index) => {
      const result = options.projectChatSearch() ? options.projectChatSearchResults()[index] : undefined;
      if (result) {
        options.openProjectChatSearchResult(result);
        return true;
      }
      const thread = options.selectableProjectThreads()[index];
      if (!thread) return false;
      options.handleActivateThread(thread.projectId, thread.threadId);
      return true;
    });
    const handleSearchShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        options.focusProjectSearch();
        return;
      }
      if (!isTyping && event.key === "/") {
        event.preventDefault();
        options.focusProjectSearch();
      }
    };
    const handleNodeContextMenu = (event: MouseEvent) => options.openNodeContextMenu(event);
    const handleNodeMouseDown = (event: MouseEvent) => {
      if (event.button === 2) options.openNodeContextMenu(event);
    };
    const handleContextPointerDown = (event: PointerEvent) => {
      if (options.isContextMenuOpen() && !(event.target instanceof Node && options.contextMenuSurfaceContains(event.target))) {
        options.hideContextMenu();
      }
    };
    const handleContextEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") options.hideContextMenu();
    };
    const sidebarShellElement = options.getSidebarShellElement();
    window.addEventListener("keydown", handleSearchShortcut);
    window.addEventListener("pointerdown", handleContextPointerDown);
    window.addEventListener("keydown", handleContextEscape);
    document.addEventListener("contextmenu", handleNodeContextMenu);
    document.addEventListener("mousedown", handleNodeMouseDown);
    sidebarShellElement?.addEventListener("contextmenu", handleNodeContextMenu);
    sidebarShellElement?.addEventListener("mousedown", handleNodeMouseDown);
    onCleanup(() => {
      unregisterItemSelector();
      window.removeEventListener("keydown", handleSearchShortcut);
      window.removeEventListener("pointerdown", handleContextPointerDown);
      window.removeEventListener("keydown", handleContextEscape);
      document.removeEventListener("contextmenu", handleNodeContextMenu);
      document.removeEventListener("mousedown", handleNodeMouseDown);
      sidebarShellElement?.removeEventListener("contextmenu", handleNodeContextMenu);
      sidebarShellElement?.removeEventListener("mousedown", handleNodeMouseDown);
    });
  });
}

export function createProjectSidebarController(props: ProjectSidebarProps) {
const store = useHarnessStore();
const state = store.state;
const sendCommand = store.actions.sendCommand;
const activeProject = () => getActiveProject(state);
const projectCards = createProjectSidebarCards(state);
const projectGroups = createMemo(() => groupProjectCards(projectCards(), state.projectSidebarPreferences.grouping));
const sidebarRows = createMemo<ProjectSidebarRow[]>(() => flattenProjectSidebarRows(projectGroups()));
const visibleProjectIds = createMemo(() => projectCards().map((project) => project.id));
const manualSortActive = () => state.projectSidebarPreferences.projectSort === "manual";
const [editingThreadId, setEditingThreadId] = createSignal<string>();
const [threadTitleDraft, setThreadTitleDraft] = createSignal("");
const [lastScrolledActiveKey, setLastScrolledActiveKey] = createSignal<string>();
const [cleanupDialogOpen, setCleanupDialogOpen] = createSignal(false);
const [projectChatSearch, setProjectChatSearch] = createSignal("");
const [projectChatSearchIndex, setProjectChatSearchIndex] = createSignal(0);
const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
    ariaLabel: string;
    actions: ContextMenuAction[];
  }>();
const [selectedProjectIds, setSelectedProjectIds] = createSignal<string[]>([]);
const [projectSelectionAnchorId, setProjectSelectionAnchorId] = createSignal<string>();
const selectedProjectIdSet = createMemo(() => new Set(selectedProjectIds()));
const selectedProjects = createMemo(() => projectCards().filter((project) => selectedProjectIdSet().has(project.id)));
const selectedProjectRemoveDisabledReason = createMemo(() => selectedProjects().map(projectRemoveDisabledReason).find(Boolean));
const owner = getOwner();
const projectChatSearchResults = createMemo(() => buildProjectChatSearchResults(state.workspace.projects, projectChatSearch()));
const selectableProjectThreads = createMemo(() =>
    projectCards().flatMap((project) => project.threads.map((thread) => ({ projectId: project.id, threadId: thread.id })))
  );
let sidebarList: VirtualListHandle | undefined;
let sidebarShellElement: HTMLElement | undefined;
let contextMenuSurfaceElement: HTMLDivElement | undefined;
let projectSearchInput: HTMLInputElement | undefined;
function showContextMenu(menu: { x: number; y: number; ariaLabel: string; actions: ContextMenuAction[] }) {
    if (owner) {
      runWithOwner(owner, () => setContextMenu(menu));
    } else {
      setContextMenu(menu);
    }
    renderContextMenuSurface(menu);
  }
function hideContextMenu() {
    setContextMenu(undefined);
    if (contextMenuSurfaceElement) {
      contextMenuSurfaceElement.hidden = true;
      contextMenuSurfaceElement.replaceChildren();
    }
  }
function renderContextMenuSurface(menu: { x: number; y: number; ariaLabel: string; actions: ContextMenuAction[] }) {
    if (!contextMenuSurfaceElement) {
      return;
    }
    contextMenuSurfaceElement.hidden = false;
    contextMenuSurfaceElement.setAttribute("aria-label", menu.ariaLabel);
    contextMenuSurfaceElement.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - 220))}px`;
    contextMenuSurfaceElement.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - 220))}px`;
    contextMenuSurfaceElement.replaceChildren(
      ...menu.actions.map((action) => {
        const button = document.createElement("button");
        button.type = "button";
        button.role = "menuitem";
        button.disabled = Boolean(action.disabled);
        button.textContent = action.label;
        button.className = stylex.attrs(styles.contextMenuButton).class ?? "";
        button.addEventListener("click", () => {
          if (action.disabled) {
            return;
          }
          action.onSelect();
          hideContextMenu();
        });
        return button;
      })
    );
  }
const organizationActions = createProjectSidebarOrganizationActions({ store, state, sendCommand, visibleProjectIds, manualSortActive, editingThreadId, setEditingThreadId, threadTitleDraft, setThreadTitleDraft });
const { setProjectSort, setThreadSort, setGrouping, persistManualOrder, setProjectCollapsed, handleProjectDragEnd, moveProject, startRename, commitRename } = organizationActions;
const navigationActions = createProjectSidebarNavigationActions({
    state,
    sendCommand,
    onNavigate: usePaneNavigation(),
    setProjectCollapsed,
    setProjectChatSearch,
    setProjectChatSearchIndex
  });
const { handleActivateProject, handleActivateThread, openProjectChatSearchResult, handleCreateThread, handleOpenProjectInIde, handleForkThread, handlePinThread, handleRemoveProject, handleArchiveThread } = navigationActions;
const selectionActions = createProjectSidebarSelectionActions({ sendCommand, sidebarRows, visibleProjectIds, selectedProjectIds, setSelectedProjectIds, projectSelectionAnchorId, setProjectSelectionAnchorId, selectedProjectIdSet, selectedProjects, handleActivateProject });
const contextActions = createProjectSidebarContextActions({ projectCards, visibleProjectIds, manualSortActive, showContextMenu, handleCreateThread, handleOpenProjectInIde, handleRemoveProject, handlePinThread, handleForkThread, handleArchiveThread, organization: organizationActions, selection: selectionActions });
const { activeSidebarRowKey, clearProjectSelectionTimer, scheduleProjectDelayedSelection, consumeProjectDelayedSelection, isInteractiveProjectSelectionTarget, selectProjectWithMouse, handleProjectCardClick, bulkProjectTargets, sendBulkProjectDelete, selectedOrSingleProject } = selectionActions;
const { projectBulkContextActions, projectContextActions, threadContextActions, openNodeContextMenu } = contextActions;
registerProjectSidebarLifecycle({
    sidebarRows,
    activeSidebarRowKey,
    lastScrolledActiveKey,
    setLastScrolledActiveKey,
    scrollSidebarToKey: (key) => sidebarList?.scrollToKey(key, "center"),
    visibleProjectIds,
    setSelectedProjectIds,
    projectSelectionAnchorId,
    setProjectSelectionAnchorId,
    clearProjectSelectionTimer,
    projectChatSearch,
    projectChatSearchResults,
    selectableProjectThreads,
    openProjectChatSearchResult,
    handleActivateThread,
    focusProjectSearch: () => projectSearchInput?.focus(),
    openNodeContextMenu,
    isContextMenuOpen: () => Boolean(contextMenu()),
    contextMenuSurfaceContains: (target) => Boolean(contextMenuSurfaceElement?.contains(target)),
    hideContextMenu,
    getSidebarShellElement: () => sidebarShellElement
  });
return {
    props,
    store,
    state,
    sendCommand,
    activeProject,
    projectCards,
    projectGroups,
    sidebarRows,
    visibleProjectIds,
    manualSortActive,
    editingThreadId,
    setEditingThreadId,
    threadTitleDraft,
    setThreadTitleDraft,
    lastScrolledActiveKey,
    setLastScrolledActiveKey,
    cleanupDialogOpen,
    setCleanupDialogOpen,
    projectChatSearch,
    setProjectChatSearch,
    projectChatSearchIndex,
    setProjectChatSearchIndex,
    contextMenu,
    setContextMenu,
    selectedProjectIds,
    setSelectedProjectIds,
    projectSelectionAnchorId,
    setProjectSelectionAnchorId,
    selectedProjectIdSet,
    selectedProjects,
    selectedProjectRemoveDisabledReason,
    owner,
    projectChatSearchResults,
    selectableProjectThreads,
    showContextMenu,
    hideContextMenu,
    renderContextMenuSurface,
    handleActivateProject,
    handleActivateThread,
    openProjectChatSearchResult,
    handleCreateThread,
    handleOpenProjectInIde,
    handleForkThread,
    handlePinThread,
    handleRemoveProject,
    handleArchiveThread,
    setProjectSort,
    setThreadSort,
    setGrouping,
    persistManualOrder,
    setProjectCollapsed,
    handleProjectDragEnd,
    moveProject,
    startRename,
    commitRename,
    activeSidebarRowKey,
    projectRemoveDisabledReason,
    clearProjectSelectionTimer,
    scheduleProjectDelayedSelection,
    consumeProjectDelayedSelection,
    isInteractiveProjectSelectionTarget,
    selectProjectWithMouse,
    handleProjectCardClick,
    bulkProjectTargets,
    sendBulkProjectDelete,
    selectedOrSingleProject,
    projectBulkContextActions,
    projectContextActions,
    threadContextActions,
    openNodeContextMenu,
    setSidebarList: (value: VirtualListHandle | undefined) => { sidebarList = value; },
    setSidebarShellElement: (value: HTMLElement | undefined) => { sidebarShellElement = value; },
    setContextMenuSurfaceElement: (value: HTMLDivElement | undefined) => { contextMenuSurfaceElement = value; },
    setProjectSearchInput: (value: HTMLInputElement | undefined) => { projectSearchInput = value; },
  };
}

export type ProjectSidebarController = ReturnType<typeof createProjectSidebarController>;

export function ProjectSidebar(props: ProjectSidebarProps) {
  const controller = createProjectSidebarController(props);
  return <ProjectSidebarProvider value={controller}><ProjectSidebarView /></ProjectSidebarProvider>;
}
