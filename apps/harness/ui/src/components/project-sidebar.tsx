import { For, Show, createEffect, createMemo, createSignal, getOwner, onCleanup, onMount, runWithOwner, type JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import {
  DragDropProvider,
  DragDropSensors,
  SortableProvider,
  createSortable,
  transformStyle,
  type DragEventHandler
} from "@thisbeyond/solid-dnd";
import { createRequestId, type BulkOperationTarget } from "../../../shared/protocol";
import {
  getActiveProject,
  harnessStore,
  type ProjectSidebarGrouping,
  type ProjectSidebarProjectSort,
  type ProjectSidebarThreadSort
} from "../harness-store";
import { truncateMiddle } from "../lib/utils";
import { normalizeAppHotkeyPreferences } from "../lib/app-hotkeys";
import { tooltipWithPrimaryHotkey } from "../lib/hotkey-hints";
import { registerCurrentTabItemSelector } from "../lib/current-tab-item-hotkeys";
import { buildProjectChatSearchResults, type ProjectChatSearchResult } from "../lib/project-chat-search";
import { openIdeWindow } from "../lib/ide-window";
import { activateProjectThread } from "../project-thread-navigation";
import { useHarnessStore } from "../store-providers";
import { ActionButton } from "./action-button";
import { Input } from "./primitives/input";
import { Button } from "./primitives/button";
import { ButtonGroup, type ButtonGroupItem } from "./primitives/button-group";
import type { ContextMenuAction } from "./primitives/context-menu";
import { LeftPaneEmptyState, LeftPaneFilterBlock, LeftPaneHeader, LeftPaneSearchInput, LeftPaneSearchMenu, LeftPaneShell } from "./primitives/left-pane";
import { StatusChip, type StatusChipTone } from "./primitives/status-chip";
import { Tooltip } from "./primitives/tooltip";
import { projectNavigationStyles as styles } from "./project-navigation.styles";
import { ThreadCleanupDialog } from "./thread-cleanup-dialog";
import { VirtualList, type VirtualListHandle } from "./primitives/virtual-list";
import { rightAlignedNumbersEnabled } from "../lib/visual-flags";
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  ChevronDown,
  ChevronRight,
  CheckSquare2,
  Clock3,
  Code2,
  Edit3,
  Folder,
  GripVertical,
  GitFork,
  Plus,
  Pin,
  Square,
  Trash2,
  FolderOpenDot,
  Layers,
  Shredder
} from "lucide-solid";

type ProjectSidebarProps = {
  compact?: boolean;
  onNavigate?: () => void;
};

function toggleSelectionId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];
}

function mergeProjectRangeSelection(ids: string[], visibleIds: string[], anchorId: string, targetId: string) {
  const anchorIndex = visibleIds.indexOf(anchorId);
  const targetIndex = visibleIds.indexOf(targetId);
  if (anchorIndex === -1 || targetIndex === -1) {
    return ids.includes(targetId) ? ids : [...ids, targetId];
  }
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return [...new Set([...ids, ...visibleIds.slice(start, end + 1)])];
}

export function ProjectSidebar(props: ProjectSidebarProps) {
  const store = useHarnessStore();
  const state = store.state;
  const sendCommand = store.actions.sendCommand;
  const activeProject = () => getActiveProject(state);
  const projectCards = createMemo(() => {
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
        hasWorkingThread: project.threads.some((thread) => thread.badgeState === "planning" || thread.badgeState === "executing"),
        hasCliSession: Boolean(project.activeCliSession),
        isActive: project.id === state.workspace.activeProjectId,
        isCollapsed,
        activeThreadId: project.activeThreadId,
        threadCount: userThreads.length,
        updatedAt: project.threads.reduce((latest, thread) => maxIso(latest, thread.updatedAt), project.session.messages.at(-1)?.createdAt),
        createdAt: getEarliestIso(project.threads.map((thread) => thread.createdAt ?? thread.updatedAt)),
        lastUserMessageAt: getLatestIso(project.threads.map((thread) => thread.lastUserMessageAt)),
        threads: isCollapsed ? [] : sortedThreads
      };
    });
    return [...cards].sort((left, right) => compareProjects(left, right, preferences.projectSort, manualOrder));
  });
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
  let pendingProjectSelectionTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingProjectSelectionId: string | undefined;
  let consumedProjectDelayedSelection = false;
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

  function handleActivateProject(projectId: string) {
    if (projectId === state.workspace.activeProjectId) {
      return;
    }

    sendCommand({
      type: "project.activate",
      requestId: createRequestId(),
      payload: { projectId }
    });
    props.onNavigate?.();
  }

  function handleActivateThread(projectId: string, threadId: string) {
    activateProjectThread(state, projectId, threadId, sendCommand);
    props.onNavigate?.();
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
    setProjectChatSearch("");
    setProjectChatSearchIndex(0);
    props.onNavigate?.();
  }

  function handleCreateThread(projectId: string) {
    setProjectCollapsed(projectId, false);
    sendCommand({
      type: "thread.create",
      requestId: createRequestId(),
      payload: { projectId }
    });
  }

  function handleOpenProjectInIde(projectId: string, threadId?: string) {
    if (threadId) {
      activateProjectThread(state, projectId, threadId, sendCommand);
    } else if (state.workspace.activeProjectId !== projectId) {
      sendCommand({
        type: "project.activate",
        requestId: createRequestId(),
        payload: { projectId }
      });
    }
    openIdeWindow({ projectId, threadId });
  }

  function handleForkThread(projectId: string, sourceThreadId: string) {
    sendCommand({
      type: "thread.fork",
      requestId: createRequestId(),
      payload: { projectId, sourceThreadId }
    });
  }

  function handlePinThread(projectId: string, threadId: string, pinned: boolean) {
    sendCommand({
      type: "thread.pin",
      requestId: createRequestId(),
      payload: { projectId, threadId, pinned }
    });
  }

  function handleRemoveProject(projectId: string) {
    sendCommand({
      type: "project.remove",
      requestId: createRequestId(),
      payload: { projectId }
    });
  }

  function handleArchiveThread(projectId: string, threadId: string) {
    sendCommand({
      type: "thread.archive",
      requestId: createRequestId(),
      payload: { projectId, threadId }
    });
  }

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

  function activeSidebarRowKey() {
    const row = sidebarRows().find((candidate) => candidate.kind === "project" && candidate.project.isActive);
    if (!row) {
      return undefined;
    }
    return row.key;
  }

  function projectRemoveDisabledReason(project: ProjectCard) {
    return project.hasWorkingThread ? "Project is streaming" : project.hasCliSession ? "Live CLI session attached" : undefined;
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
    const target = event.target as HTMLElement | null;
    const threadCard = target?.closest<HTMLElement>("[data-test-project-thread-card]");
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

    const projectCard = target?.closest<HTMLElement>("[data-test-project-card]");
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

  createEffect(() => {
    const key = activeSidebarRowKey();
    sidebarRows().length;
    if (!key || lastScrolledActiveKey() === key) {
      return;
    }
    setLastScrolledActiveKey(key);
    queueMicrotask(() => sidebarList?.scrollToKey(key, "center"));
  });

  createEffect(() => {
    const visibleIds = new Set(visibleProjectIds());
    setSelectedProjectIds((ids) => ids.filter((id) => visibleIds.has(id)));
    const anchorId = projectSelectionAnchorId();
    if (anchorId && !visibleIds.has(anchorId)) {
      setProjectSelectionAnchorId(undefined);
    }
  });

  onCleanup(() => clearProjectSelectionTimer());

  onMount(() => {
    const unregisterItemSelector = registerCurrentTabItemSelector("projects", (index) => {
      const result = projectChatSearch() ? projectChatSearchResults()[index] : undefined;
      if (result) {
        openProjectChatSearchResult(result);
        return true;
      }
      const thread = selectableProjectThreads()[index];
      if (!thread) {
        return false;
      }
      handleActivateThread(thread.projectId, thread.threadId);
      return true;
    });
    const handleSearchShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        projectSearchInput?.focus();
        return;
      }
      if (!isTyping && event.key === "/") {
        event.preventDefault();
        projectSearchInput?.focus();
      }
    };
    const handleNodeContextMenu = (event: MouseEvent) => openNodeContextMenu(event);
    const handleNodeMouseDown = (event: MouseEvent) => {
      if (event.button === 2) {
        openNodeContextMenu(event);
      }
    };
    const handleContextPointerDown = (event: PointerEvent) => {
      if (!contextMenu() || contextMenuSurfaceElement?.contains(event.target as Node)) {
        return;
      }
      hideContextMenu();
    };
    const handleContextEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hideContextMenu();
      }
    };
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

  function ProjectRow(rowProps: { project: ProjectCard }) {
    const project = rowProps.project;
    const isActiveProject = () => project.isActive;
    const [isCollapsed, setCollapsed] = createSignal(project.isCollapsed);
    let collapseButtonElement: HTMLButtonElement | undefined;
    let threadListElement: HTMLDivElement | undefined;
    const removeDisabledReason = () => projectRemoveDisabledReason(project);
    const collapseLabel = (isCollapsed: boolean) => `${isCollapsed ? "Expand" : "Collapse"} threads in ${project.name}`;
    const applyCollapsedState = (nextCollapsed: boolean) => {
      setCollapsed(nextCollapsed);
      collapseButtonElement?.setAttribute("aria-label", collapseLabel(nextCollapsed));
      collapseButtonElement?.setAttribute("aria-expanded", String(!nextCollapsed));
      if (threadListElement) {
        threadListElement.hidden = nextCollapsed;
      }
    };
    const actionItems = (): ButtonGroupItem[] => [
      {
        key: "new-thread",
        label: "New thread",
        tooltip: tooltipWithPrimaryHotkey(
          "Create a new thread in this project",
          normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences).createProjectChat[0]
        ),
        icon: <Plus class={stylex.attrs(styles.iconXs).class} />,
        onClick: () => handleCreateThread(project.id)
      },
      {
        key: "remove",
        label: "Remove",
        tooltip: `Remove ${project.name}`,
        disabledReason: removeDisabledReason(),
        disabled: Boolean(removeDisabledReason()),
        icon: <Trash2 class={stylex.attrs(styles.iconXs).class} />,
        onClick: () => handleRemoveProject(project.id)
      },
      ...(manualSortActive()
        ? [
            {
              key: "move-up",
              label: "Move up",
              tooltip: `Move ${project.name} up`,
              disabledReason: "Already first project",
              disabled: visibleProjectIds().indexOf(project.id) === 0,
              icon: <ArrowUp class={stylex.attrs(styles.iconXs).class} />,
              onClick: () => moveProject(project.id, -1)
            },
            {
              key: "move-down",
              label: "Move down",
              tooltip: `Move ${project.name} down`,
              disabledReason: "Already last project",
              disabled: visibleProjectIds().indexOf(project.id) === visibleProjectIds().length - 1,
              icon: <ArrowDown class={stylex.attrs(styles.iconXs).class} />,
              onClick: () => moveProject(project.id, 1)
            }
          ]
        : []),
      {
        key: "open-ide",
        label: "Open in IDE",
        tooltip: `Open ${project.name} in IDE`,
        icon: <Code2 class={stylex.attrs(styles.iconXs).class} />,
        onClick: () => handleOpenProjectInIde(project.id)
      }
    ];
    const renderCard = (sortable: ProjectCardSortableState) => (
      <section
        data-test-project-card=""
        data-project-id={project.id}
        class={[
          stylex.attrs(styles.denseCard, styles.projectCard).class,
          sortable.isDragging ? stylex.attrs(styles.draggingCard).class : "",
          isActiveProject() || selectedProjectIdSet().has(project.id)
            ? stylex.attrs(styles.selectedCard).class
            : stylex.attrs(styles.idleCard).class
        ].filter(Boolean).join(" ")}
        ref={sortable.ref}
        style={sortable.style}
        onPointerDown={(event) => scheduleProjectDelayedSelection(project.id, event)}
        onPointerUp={clearProjectSelectionTimer}
        onPointerCancel={clearProjectSelectionTimer}
        onPointerLeave={clearProjectSelectionTimer}
        onClick={(event) => handleProjectCardClick(project, event)}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!selectedProjectIdSet().has(project.id)) {
            setSelectedProjectIds([project.id]);
            setProjectSelectionAnchorId(project.id);
          }
          showContextMenu({
            x: event.clientX,
            y: event.clientY,
            ariaLabel: selectedProjectIdSet().has(project.id) && selectedProjects().length > 1 ? "Bulk project actions" : `${project.name} actions`,
            actions: projectContextActions(project)
          });
        }}
      >
        <Show when={isActiveProject()}>
          <div class={stylex.attrs(styles.activeRail).class} />
        </Show>
        <div class={stylex.attrs(styles.projectMainRow).class}>
          <Show when={manualSortActive()}>
            <button
              type="button"
              class={stylex.attrs(styles.dragHandle).class}
              aria-label={`Drag ${project.name}`}
              {...sortable.dragActivators}
            >
              <GripVertical class={stylex.attrs(styles.iconSm).class} />
            </button>
          </Show>
          <Show when={project.threadCount > 0}>
            <Button
              tooltip={isCollapsed() ? "Expand thread list" : "Collapse thread list"}
              variant="ghost"
              size="icon"
              class={stylex.attrs(styles.collapseButton).class}
              ref={collapseButtonElement}
              aria-label={collapseLabel(isCollapsed())}
              aria-expanded={!isCollapsed()}
              onClick={() => {
                const nextCollapsed = !isCollapsed();
                applyCollapsedState(nextCollapsed);
                setProjectCollapsed(project.id, nextCollapsed);
              }}
            >
              <Show when={isCollapsed()} fallback={<ChevronDown class={stylex.attrs(styles.iconSm).class} />}>
                <ChevronRight class={stylex.attrs(styles.iconSm).class} />
              </Show>
            </Button>
          </Show>
          <ActionButton
            tooltip={isActiveProject() ? `${project.name} is active` : `Switch to ${project.name}`}
            icon={<Folder class={stylex.attrs(styles.folderIcon).class} />}
            variant="ghost"
            class={stylex.attrs(styles.projectButton).class}
            wrapperClass={stylex.attrs(styles.projectButtonWrapper).class}
            onClick={() => handleActivateProject(project.id)}
          >
            <div class={stylex.attrs(styles.projectText).class}>
              <div class={stylex.attrs(styles.projectName).class}>{project.name}</div>
              <div class={stylex.attrs(styles.projectPath).class}>
                {truncateMiddle(project.rootPath, props.compact ? 24 : 30)}
              </div>
              <div class={stylex.attrs(styles.projectMeta).class}>
                <span class={rightAlignedNumbersEnabled() ? stylex.attrs(styles.numeric).class : undefined}>{project.threadCount} threads</span>
                {project.isStreaming ? <StatusChip tone="info" dot>streaming</StatusChip> : null}
                {isActiveProject() ? (
                  <StatusChip tone="accent">Active</StatusChip>
                ) : null}
              </div>
            </div>
          </ActionButton>

          <div class={stylex.attrs(styles.secondaryActions).class}>
            <ActionButton
              tooltip={selectedProjectIdSet().has(project.id) ? "Remove from bulk selection" : "Add to bulk selection"}
              icon={selectedProjectIdSet().has(project.id) ? <CheckSquare2 class={stylex.attrs(styles.iconXs).class} /> : <Square class={stylex.attrs(styles.iconXs).class} />}
              variant="ghost"
              size="icon"
              ariaLabel={selectedProjectIdSet().has(project.id) ? `Remove ${project.name} from bulk selection` : `Add ${project.name} to bulk selection`}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedProjectIds((ids) => toggleSelectionId(ids, project.id));
                setProjectSelectionAnchorId(project.id);
              }}
            />
            <For each={actionItems().filter((item) => item.key !== "open-ide")}>
              {(item) => (
                <ActionButton
                  tooltip={item.tooltip}
                  disabledReason={item.disabledReason}
                  disabled={item.disabled}
                  icon={item.icon}
                  variant="ghost"
                  size="icon"
                  class={stylex.attrs(styles.compactAction).class}
                  ariaLabel={projectActionAriaLabel(project.name, item.key)}
                  onClick={item.onClick}
                />
              )}
            </For>
          </div>
        </div>
        {project.threads.length > 0 ? (
          <div ref={threadListElement} class={stylex.attrs(styles.threadList).class} hidden={isCollapsed()}>
            {project.threads.map((thread) => (
              <ProjectThreadRow project={project} thread={thread} />
            ))}
          </div>
        ) : null}
      </section>
    );

    return (
      <Show when={manualSortActive()} fallback={renderCard(createStaticProjectCardSortableState())}>
        <SortableProjectCard projectId={project.id}>{renderCard}</SortableProjectCard>
      </Show>
    );
  }

  function ProjectThreadRow(props: { project: ProjectCard; thread: ProjectThreadCard }) {
    const project = props.project;
    const thread = props.thread;
    const isActiveThread = () => project.isActive && project.activeThreadId === thread.id;
    const isEditing = () => editingThreadId() === thread.id;
    const [deleteArmed, setDeleteArmed] = createSignal(false);
    let deleteButton: HTMLButtonElement | undefined;
    let deleteArmedTimeout: ReturnType<typeof setTimeout> | undefined;

    function clearDeleteArmed() {
      setDeleteArmed(false);
      if (deleteButton) {
        applyDeleteButtonTone(deleteButton, false);
      }
      if (deleteArmedTimeout) {
        clearTimeout(deleteArmedTimeout);
        deleteArmedTimeout = undefined;
      }
    }

    function handleDeleteClick(event?: MouseEvent & { currentTarget: HTMLButtonElement }) {
      deleteButton = event?.currentTarget;
      if (thread.pinned) {
        return;
      }
      if (deleteArmed()) {
        clearDeleteArmed();
        handleArchiveThread(project.id, thread.id);
        return;
      }

      setDeleteArmed(true);
      if (deleteButton) {
        applyDeleteButtonTone(deleteButton, true);
      }
      deleteArmedTimeout = setTimeout(clearDeleteArmed, 2000);
    }

    onCleanup(clearDeleteArmed);

    const actionItems = (): ButtonGroupItem[] => [
      {
        key: "pin",
        label: thread.pinned ? "Unpin" : "Pin",
        tooltip: thread.pinned ? "Unpins thread so it can be archived." : "Pins thread, making it immune to archiving.",
        icon: <Pin class={stylex.attrs(styles.iconXs).class} fill={thread.pinned ? "currentColor" : "none"} />,
        class: thread.pinned ? stylex.attrs(styles.pinnedAction).class : undefined,
        onClick: () => handlePinThread(project.id, thread.id, !thread.pinned)
      },
      {
        key: "fork",
        label: "Fork",
        tooltip: "Forks this thread into a new thread.",
        icon: <GitFork class={stylex.attrs(styles.iconXs).class} />,
        onClick: () => handleForkThread(project.id, thread.id)
      },
      {
        key: "rename",
        label: "Rename",
        tooltip: "Renames this thread.",
        icon: <Edit3 class={stylex.attrs(styles.iconXs).class} />,
        onClick: () => startRename(thread.id, thread.title)
      },
      {
        key: "delete",
        label: "Delete",
        tooltip: thread.pinned ? "Pinned threads cannot be archived." : "Archives this thread.",
        disabledReason: "Pinned threads cannot be archived.",
        disabled: thread.pinned,
        icon: <Trash2 class={stylex.attrs(styles.iconXs).class} />,
        class: deleteArmed()
          ? stylex.attrs(styles.dangerAction).class
          : stylex.attrs(styles.normalAction).class,
        onClick: handleDeleteClick
      },
      {
        key: "open-ide",
        label: "Open in IDE",
        tooltip: `Open ${thread.title} in IDE`,
        icon: <Code2 class={stylex.attrs(styles.iconXs).class} />,
        onClick: () => handleOpenProjectInIde(project.id, thread.id)
      }
    ];
    return (
      <div
        data-test-project-thread-card=""
        data-project-id={project.id}
        data-thread-id={thread.id}
        class={[
          stylex.attrs(styles.denseCard, styles.threadCard).class,
          isActiveThread()
            ? stylex.attrs(styles.selectedCard).class
            : stylex.attrs(styles.idleCard).class
        ].join(" ")}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          showContextMenu({
            x: event.clientX,
            y: event.clientY,
            ariaLabel: `${thread.title} actions`,
            actions: threadContextActions(project, thread)
          });
        }}
      >
        <Show when={isActiveThread()}>
          <div class={stylex.attrs(styles.activeRail).class} />
        </Show>
        <div class={stylex.attrs(styles.threadHeader).class}>
          <button
            class={stylex.attrs(styles.threadButton).class}
            disabled={isActiveThread()}
            onClick={() => handleActivateThread(project.id, thread.id)}
          >
            <Show
              when={isEditing()}
              fallback={
                <Tooltip content={thread.title} triggerClass={stylex.attrs(styles.tooltipBlock).class}>
                  <div class={stylex.attrs(styles.threadName).class}>{thread.title}</div>
                </Tooltip>
              }
            >
              <Input
                value={threadTitleDraft()}
                onInput={(event: InputEvent & { currentTarget: HTMLInputElement; target: Element }) =>
                  setThreadTitleDraft(event.currentTarget.value)
                }
                onBlur={() => commitRename(project.id, thread.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitRename(project.id, thread.id);
                  }
                  if (event.key === "Escape") {
                    setEditingThreadId(undefined);
                  }
                }}
              />
            </Show>
            <div class={stylex.attrs(styles.threadMeta).class}>
              <Show when={thread.lastMessagePreview}>
                <Tooltip content={thread.lastMessagePreview} triggerClass={stylex.attrs(styles.previewTooltip).class}>
                  <span class={stylex.attrs(styles.threadPreview).class}>
                    {thread.lastMessagePreview}
                  </span>
                </Tooltip>
              </Show>
              <div class={stylex.attrs(styles.threadStatus).class}>
                <Show when={thread.badgeState !== "idle"}>
                  <StatusChip tone={threadBadgeTone(thread.badgeState)}>{badgeLabel(thread.badgeState)}</StatusChip>
                </Show>
                <span class={rightAlignedNumbersEnabled() ? stylex.attrs(styles.numeric).class : undefined}>{thread.messageCount} msgs</span>
              </div>
            </div>
          </button>

          <ButtonGroup
            items={() => actionItems().filter((item) => item.key !== "open-ide")}
            menuLabel="Thread actions"
            class={stylex.attrs(styles.secondaryActions).class}
            collapseBelowWidth="22rem"
          />
        </div>
      </div>
    );
  }

  function renderSidebarRow(row: ProjectSidebarRow) {
    if (row.kind === "group") {
      return <div class={stylex.attrs(styles.groupLabel).class}>{row.label}</div>;
    }
    if (row.kind === "project") {
      return <ProjectRow project={row.project} />;
    }
  }

  return (
    <div class={stylex.attrs(styles.contents).class}>
      <LeftPaneShell
        kind="projects"
        class={stylex.attrs(styles.sidebarShell).class}
        data-test-project-sidebar=""
        ref={sidebarShellElement}
        onContextMenu={(event) => openNodeContextMenu(event)}
        onMouseDown={(event) => {
          if (event.button === 2) {
            openNodeContextMenu(event);
          }
        }}
      >
      <LeftPaneHeader
        title="Projects"
        help="Each project root keeps its own selectable threads, local chat history, and project-scoped execution context."
        actions={
          <>
            <Button
              tooltip="Clean up old threads"
              aria-label="Clean up old threads"
              variant="ghost"
              size="icon"
              onMouseDown={() => setCleanupDialogOpen(true)}
              onClick={() => setCleanupDialogOpen(true)}
            >
              <Shredder class={stylex.attrs(styles.iconSm).class} />
            </Button>
            <ActionButton
              tooltip={tooltipWithPrimaryHotkey(
                "Open project switcher",
                normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences).openProjectSwitcher[0]
              )}
              icon={<FolderOpenDot class={stylex.attrs(styles.iconSm).class} />}
              variant="ghost"
              size="icon"
              ariaLabel="Open project switcher"
              onClick={() => harnessStore.openProjectSwitcher()}
            />
          </>
        }
      />

      <LeftPaneFilterBlock>
        <LeftPaneSearchInput
          ref={(element) => {
            projectSearchInput = element;
          }}
          value={projectChatSearch()}
          aria-label="Search projects"
          placeholder="Search projects..."
          menu={
            <LeftPaneSearchMenu
              ariaLabel="Sort and group projects"
              tooltip="Sort and group projects"
              items={[
                {
                  kind: "submenu",
                  label: "Sort projects",
                  value: formatProjectSortLabel(state.projectSidebarPreferences.projectSort),
                  icon: <Clock3 class={stylex.attrs(styles.iconSm).class} />,
                  items: [
                    {
                      kind: "option",
                      label: "Last user message",
                      icon: <Clock3 class={stylex.attrs(styles.iconSm).class} />,
                      selected: state.projectSidebarPreferences.projectSort === "last-user-message",
                      onSelect: () => setProjectSort("last-user-message")
                    },
                    {
                      kind: "option",
                      label: "Created at",
                      icon: <Calendar class={stylex.attrs(styles.iconSm).class} />,
                      selected: state.projectSidebarPreferences.projectSort === "created-at",
                      onSelect: () => setProjectSort("created-at")
                    },
                    {
                      kind: "option",
                      label: "Manual",
                      icon: <GripVertical class={stylex.attrs(styles.iconSm).class} />,
                      selected: state.projectSidebarPreferences.projectSort === "manual",
                      onSelect: () => setProjectSort("manual")
                    }
                  ]
                },
                {
                  kind: "submenu",
                  label: "Sort threads",
                  value: formatThreadSortLabel(state.projectSidebarPreferences.threadSort),
                  icon: <Clock3 class={stylex.attrs(styles.iconSm).class} />,
                  items: [
                    {
                      kind: "option",
                      label: "Last user message",
                      icon: <Clock3 class={stylex.attrs(styles.iconSm).class} />,
                      selected: state.projectSidebarPreferences.threadSort === "last-user-message",
                      onSelect: () => setThreadSort("last-user-message")
                    },
                    {
                      kind: "option",
                      label: "Created at",
                      icon: <Calendar class={stylex.attrs(styles.iconSm).class} />,
                      selected: state.projectSidebarPreferences.threadSort === "created-at",
                      onSelect: () => setThreadSort("created-at")
                    }
                  ]
                },
                {
                  kind: "submenu",
                  label: "Group projects",
                  value: formatProjectGroupingLabel(state.projectSidebarPreferences.grouping),
                  icon: <Folder class={stylex.attrs(styles.iconSm).class} />,
                  items: [
                    {
                      kind: "option",
                      label: "Group by repository",
                      icon: <Folder class={stylex.attrs(styles.iconSm).class} />,
                      selected: state.projectSidebarPreferences.grouping === "repository",
                      onSelect: () => setGrouping("repository")
                    },
                    {
                      kind: "option",
                      label: "Group by repository path",
                      icon: <FolderOpenDot class={stylex.attrs(styles.iconSm).class} />,
                      selected: state.projectSidebarPreferences.grouping === "repository-path",
                      onSelect: () => setGrouping("repository-path")
                    },
                    {
                      kind: "option",
                      label: "Keep separate",
                      icon: <Layers class={stylex.attrs(styles.iconSm).class} />,
                      selected: state.projectSidebarPreferences.grouping === "separate",
                      onSelect: () => setGrouping("separate")
                    }
                  ]
                }
              ]}
            />
          }
          onInput={(event) => {
            setProjectChatSearch((event.target as HTMLInputElement).value);
            setProjectChatSearchIndex(0);
          }}
          onKeyDown={(event) => {
            if (!projectChatSearch()) {
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setProjectChatSearch("");
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setProjectChatSearchIndex((index) => Math.min(index + 1, Math.max(0, projectChatSearchResults().length - 1)));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setProjectChatSearchIndex((index) => Math.max(0, index - 1));
            }
            if (event.key === "Enter") {
              const result = projectChatSearchResults()[projectChatSearchIndex()];
              if (result) {
                event.preventDefault();
                openProjectChatSearchResult(result);
              }
            }
          }}
        />
        <Show when={projectChatSearch()}>
          <div class={stylex.attrs(styles.searchResults).class}>
            <Show
              when={projectChatSearchResults().length > 0}
              fallback={<div class={stylex.attrs(styles.searchEmpty).class}>No project or active-thread hits.</div>}
            >
              <For each={projectChatSearchResults()}>
                {(result, index) => (
                  <button
                    type="button"
                    class={[
                      stylex.attrs(styles.searchResult).class,
                      projectChatSearchIndex() === index()
                        ? stylex.attrs(styles.searchResultSelected).class
                        : stylex.attrs(styles.searchResultIdle).class
                    ].join(" ")}
                    onMouseEnter={() => setProjectChatSearchIndex(index())}
                    onClick={() => openProjectChatSearchResult(result)}
                  >
                    <span class={stylex.attrs(styles.searchResultTitle).class}>{result.title}</span>
                    <span class={stylex.attrs(styles.truncate).class}>{result.preview}</span>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </Show>
      </LeftPaneFilterBlock>

      <Show when={selectedProjects().length > 0}>
        <div class={stylex.attrs(styles.selectionToolbar).class}>
          <span class={stylex.attrs(styles.selectionCount).class}>{selectedProjects().length} selected</span>
          <ActionButton
            tooltip="Remove selected projects from this workspace"
            disabled={Boolean(selectedProjectRemoveDisabledReason())}
            disabledReason={selectedProjectRemoveDisabledReason()}
            size="sm"
            icon={<Trash2 class={stylex.attrs(styles.iconSm).class} />}
            onClick={() => sendBulkProjectDelete(selectedProjects())}
          >
            Remove
          </ActionButton>
          <ActionButton
            tooltip="Open selected projects in IDE"
            size="sm"
            variant="secondary"
            icon={<Code2 class={stylex.attrs(styles.iconSm).class} />}
            onClick={() => selectedProjects().forEach((project) => handleOpenProjectInIde(project.id))}
          >
            Open IDE
          </ActionButton>
          <ActionButton
            tooltip="Clear selection"
            size="sm"
            variant="ghost"
            icon={<Square class={stylex.attrs(styles.iconSm).class} />}
            onClick={() => setSelectedProjectIds([])}
          >
            Clear
          </ActionButton>
        </div>
      </Show>

      <Show
        when={state.workspace.projects.length > 0}
        fallback={
          <LeftPaneEmptyState>
            No workspace roots yet. Open project switcher or browse folder to start isolated project threads.
          </LeftPaneEmptyState>
        }
      >
        <Show
          when={manualSortActive()}
          fallback={
            <VirtualList
              class={stylex.attrs(styles.virtualViewport).class}
              contentClass={stylex.attrs(styles.virtualContent).class}
              itemClass={stylex.attrs(styles.virtualItem).class}
              items={sidebarRows()}
              getKey={(row) => row.key}
              estimateSize={estimateProjectSidebarRowSize}
              pagination={{ kind: "forward", initialCount: 80, batchSize: 80 }}
              handleRef={(handle) => {
                sidebarList = handle;
              }}
            >
              {(row) => renderSidebarRow(row)}
            </VirtualList>
          }
        >
          <DragDropProvider onDragEnd={handleProjectDragEnd}>
            <DragDropSensors />
            <SortableProvider ids={visibleProjectIds()}>
              <VirtualList
                class={stylex.attrs(styles.virtualViewport).class}
                contentClass={stylex.attrs(styles.virtualContent).class}
                itemClass={stylex.attrs(styles.virtualItem).class}
                items={sidebarRows()}
                getKey={(row) => row.key}
                estimateSize={estimateProjectSidebarRowSize}
                pagination={{ kind: "forward", initialCount: 80, batchSize: 80 }}
                handleRef={(handle) => {
                  sidebarList = handle;
                }}
              >
                {(row) => renderSidebarRow(row)}
              </VirtualList>
            </SortableProvider>
          </DragDropProvider>
        </Show>
      </Show>

      <Show when={activeProject()}>
        {(project) => (
          <div class={stylex.attrs(styles.activeRoot).class}>
            Active root
            <Tooltip content={project().rootPath} triggerClass={stylex.attrs(styles.activeRootTooltip).class}>
              <div class={stylex.attrs(styles.activeRootPath).class}>
                {project().rootPath}
              </div>
            </Tooltip>
          </div>
        )}
      </Show>
      <Show when={cleanupDialogOpen()}>
        <ThreadCleanupDialog
          open
          projects={state.workspace.projects}
          activeProjectId={state.workspace.activeProjectId}
          onClose={() => setCleanupDialogOpen(false)}
          onSubmit={(input) =>
            sendCommand({
              type: "thread.cleanupArchive",
              requestId: createRequestId(),
              payload: {
                projectIds: input.projectIds,
                olderThanMs: input.olderThanMs,
                ageBasis: "last-user-message"
              }
            })
          }
        />
      </Show>
      </LeftPaneShell>
      <div
        ref={contextMenuSurfaceElement}
        data-test-context-menu=""
        role="menu"
        aria-label="Project actions"
        hidden
        class={stylex.attrs(styles.contextMenu).class}
        style={{ left: "8px", top: "8px" }}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  );
}

/** Replaces only the compiled confirmation-tone atoms while preserving primitive button classes. */
function applyDeleteButtonTone(button: HTMLButtonElement, armed: boolean) {
  const normalClasses = (stylex.attrs(styles.normalAction).class ?? "").split(/\s+/).filter(Boolean);
  const dangerClasses = (stylex.attrs(styles.dangerAction).class ?? "").split(/\s+/).filter(Boolean);
  const toneClasses = new Set([...normalClasses, ...dangerClasses]);
  const baseClasses = button.className.split(/\s+/).filter((className) => className && !toneClasses.has(className));
  button.className = [...baseClasses, ...(armed ? dangerClasses : normalClasses)].join(" ");
}

type ProjectCard = {
  id: string;
  name: string;
  rootPath: string;
  workspaceIndex: number;
  isStreaming: boolean;
  hasWorkingThread: boolean;
  hasCliSession: boolean;
  isActive: boolean;
  isCollapsed: boolean;
  activeThreadId: string;
  threadCount: number;
  updatedAt?: string;
  createdAt?: string;
  lastUserMessageAt?: string;
  threads: ProjectThreadCard[];
};

type ProjectThreadCard = {
  id: string;
  title: string;
  lastMessagePreview?: string;
  badgeState: string;
  messageCount: number;
  createdAt?: string;
  updatedAt?: string;
  lastUserMessageAt?: string;
  pinned: boolean;
};

type ProjectGroup = {
  key: string;
  label?: string;
  projects: ProjectCard[];
};

type ProjectSidebarRow =
  | { kind: "group"; key: string; label: string }
  | { kind: "project"; key: string; project: ProjectCard };

function projectActionAriaLabel(projectName: string, key: string) {
  switch (key) {
    case "new-thread":
      return `Create a new thread in ${projectName}`;
    case "remove":
      return `Remove ${projectName}`;
    case "move-up":
      return `Move ${projectName} up`;
    case "move-down":
      return `Move ${projectName} down`;
    default:
      return `${projectName} action`;
  }
}

function formatProjectSortLabel(sort: ProjectSidebarProjectSort) {
  return sort === "created-at" ? "Created" : sort === "manual" ? "Manual" : "Last message";
}

function formatThreadSortLabel(sort: ProjectSidebarThreadSort) {
  return sort === "created-at" ? "Created" : "Last message";
}

function formatProjectGroupingLabel(grouping: ProjectSidebarGrouping) {
  return grouping === "repository-path" ? "Path" : grouping === "separate" ? "Separate" : "Repository";
}

type ProjectCardSortableState = {
  ref?: (element: HTMLElement | null) => void;
  style: JSX.CSSProperties;
  dragActivators: ReturnType<typeof createSortable>["dragActivators"];
  isDragging: boolean;
};

function SortableProjectCard(props: { projectId: string; children: (sortable: ProjectCardSortableState) => JSX.Element }) {
  const sortable = createSortable(props.projectId);
  return props.children({
    ref: sortable.ref,
    style: transformStyle(sortable.transform),
    dragActivators: sortable.dragActivators,
    isDragging: sortable.isActiveDraggable
  });
}

function createStaticProjectCardSortableState(): ProjectCardSortableState {
  return {
    style: {},
    dragActivators: {},
    isDragging: false
  };
}

function sortThreads<T extends { title: string; pinned?: boolean; createdAt?: string; updatedAt?: string; lastUserMessageAt?: string }>(
  threads: T[],
  sort: ProjectSidebarThreadSort
) {
  return [...threads].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }
    if (sort === "created-at") {
      return compareIsoAsc(left.createdAt ?? left.updatedAt, right.createdAt ?? right.updatedAt) || left.title.localeCompare(right.title);
    }

    return (
      compareIsoDesc(left.lastUserMessageAt ?? left.updatedAt, right.lastUserMessageAt ?? right.updatedAt) ||
      left.title.localeCompare(right.title)
    );
  });
}

function compareProjects(
  left: ProjectCard,
  right: ProjectCard,
  sort: ProjectSidebarProjectSort,
  manualOrder: Map<string, number>
) {
  if (sort === "manual") {
    return (
      (manualOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (manualOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER) ||
      left.workspaceIndex - right.workspaceIndex
    );
  }

  if (sort === "created-at") {
    return (
      compareIsoAsc(left.createdAt ?? left.updatedAt, right.createdAt ?? right.updatedAt) ||
      left.name.localeCompare(right.name) ||
      left.rootPath.localeCompare(right.rootPath)
    );
  }

  return (
    compareIsoDesc(left.lastUserMessageAt ?? left.updatedAt, right.lastUserMessageAt ?? right.updatedAt) ||
    left.name.localeCompare(right.name) ||
    left.rootPath.localeCompare(right.rootPath)
  );
}

function groupProjectCards(projects: ProjectCard[], grouping: ProjectSidebarGrouping): ProjectGroup[] {
  if (grouping === "separate") {
    return [{ key: "all", label: undefined, projects }];
  }

  const groups: Array<{ key: string; label: string; projects: ProjectCard[] }> = [];
  for (const project of projects) {
    const key = grouping === "repository" ? getPathBasename(project.rootPath) : getParentPath(project.rootPath);
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.projects.push(project);
    } else {
      groups.push({
        key,
        label: key || "Workspace root",
        projects: [project]
      });
    }
  }

  return groups;
}

function flattenProjectSidebarRows(groups: ProjectGroup[]) {
  const rows: ProjectSidebarRow[] = [];
  for (const group of groups) {
    if (group.label) {
      rows.push({ kind: "group", key: `group:${group.key}`, label: group.label });
    }
    for (const project of group.projects) {
      rows.push({ kind: "project", key: `project:${project.id}:${project.isCollapsed ? "collapsed" : "expanded"}`, project });
    }
  }
  return rows;
}

function estimateProjectSidebarRowSize(row: ProjectSidebarRow) {
  if (row.kind === "group") {
    return 24;
  }

  return 112 + (row.project.isCollapsed ? 0 : row.project.threads.length * 82);
}

function getLatestIso(values: Array<string | undefined>) {
  return values.reduce<string | undefined>((latest, value) => maxIso(latest, value), undefined);
}

function getEarliestIso(values: Array<string | undefined>) {
  return values.reduce<string | undefined>((earliest, value) => {
    if (!value) {
      return earliest;
    }
    if (!earliest) {
      return value;
    }
    return value.localeCompare(earliest) < 0 ? value : earliest;
  }, undefined);
}

function maxIso(left?: string, right?: string) {
  if (!right) {
    return left;
  }
  if (!left) {
    return right;
  }
  return right.localeCompare(left) > 0 ? right : left;
}

function compareIsoAsc(left?: string, right?: string) {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  return left.localeCompare(right);
}

function compareIsoDesc(left?: string, right?: string) {
  return compareIsoAsc(right, left);
}

function getPathBasename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function getParentPath(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 1) {
    return path;
  }

  const prefix = /^[A-Za-z]:/.test(parts[0] ?? "") ? `${parts[0]}\\` : path.startsWith("\\\\") ? "\\\\" : "";
  const parentParts = /^[A-Za-z]:/.test(parts[0] ?? "") ? parts.slice(1, -1) : parts.slice(0, -1);
  return parentParts.length > 0 ? `${prefix}${parentParts.join("\\")}` : prefix || parts[0] || path;
}

function moveId(ids: string[], fromIndex: number, toIndex: number) {
  const nextIds = [...ids];
  const [moved] = nextIds.splice(fromIndex, 1);
  if (!moved) {
    return ids;
  }
  nextIds.splice(toIndex, 0, moved);
  return nextIds;
}

function badgeLabel(value: string) {
  switch (value) {
    case "needs-input":
      return "User input";
    case "planning":
      return "Planning";
    case "executing":
      return "Executing";
    case "error":
      return "Error";
    case "done":
      return "Done";
    default:
      return "Idle";
  }
}

function threadBadgeTone(value: string): StatusChipTone {
  switch (value) {
    case "needs-input":
      return "warning";
    case "planning":
      return "warning";
    case "executing":
      return "info";
    case "error":
      return "danger";
    case "done":
      return "success";
    default:
      return "neutral";
  }
}
