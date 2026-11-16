import { createRequestId } from "@hyperfocus/ai-core/protocol";
import { Input } from "@hyperfocus/ui";
import * as stylex from "@stylexjs/stylex";
import {
DragDropProvider,
DragDropSensors,
SortableProvider
} from "@thisbeyond/solid-dnd";
import {
ArrowDown,
ArrowUp,
Calendar,
CheckSquare2,
ChevronDown,
ChevronRight,
Clock3,
Code2,
Edit3,
Folder,
FolderOpenDot,
GitFork,
GripVertical,
Layers,
Pin,
Plus,
Shredder,
Square,
Trash2
} from "lucide-solid";
import { For,Show,createSignal,onCleanup } from "solid-js";
import {
harnessStore
} from "../../harness-store";
import { normalizeAppHotkeyPreferences } from "../../lib/app-hotkeys";
import { tooltipWithPrimaryHotkey } from "../../lib/hotkey-hints";
import { truncateMiddle } from "../../lib/utils";
import { rightAlignedNumbersEnabled } from "../../lib/visual-flags";
import { ActionButton } from "../action-button";
import { Button } from "../primitives/button";
import { ButtonGroup,type ButtonGroupItem } from "../primitives/button-group";
import { LeftPaneBody,LeftPaneEmptyState,LeftPaneFilterBlock,LeftPaneHeader,LeftPaneSearchInput,LeftPaneSearchMenu,LeftPaneShell } from "../primitives/left-pane";
import { StatusChip } from "../primitives/status-chip";
import { Tooltip } from "../primitives/tooltip";
import { VirtualList } from "../primitives/virtual-list";
import { projectNavigationStyles as styles } from "../project-navigation.styles";
import { ThreadCleanupDialog } from "../thread-cleanup-dialog";
import type { ProjectSidebarController } from "./project-sidebar";
import type { ProjectCard,ProjectCardSortableState,ProjectSidebarRow,ProjectThreadCard } from "./project-sidebar-model";
import { SortableProjectCard,applyDeleteButtonTone,badgeLabel,createStaticProjectCardSortableState,estimateProjectSidebarRowSize,formatProjectGroupingLabel,formatProjectSortLabel,formatThreadSortLabel,projectActionAriaLabel,threadBadgeTone,toggleSelectionId } from "./project-sidebar-model";
import { useProjectSidebar } from "./state/panel-context";

function projectRowActionItems(
  project: ProjectCard,
  controller: ProjectSidebarController
): ButtonGroupItem[] {
  const removeDisabledReason = controller.projectRemoveDisabledReason(project);
  return [
    {
      key: "new-thread",
      label: "New thread",
      tooltip: tooltipWithPrimaryHotkey(
        "Create a new thread in this project",
        normalizeAppHotkeyPreferences(harnessStore.state.appHotkeyPreferences).createProjectChat[0]
      ),
      icon: <Plus class={stylex.attrs(styles.iconXs).class} />,
      onClick: () => controller.handleCreateThread(project.id)
    },
    {
      key: "remove",
      label: "Remove",
      tooltip: `Remove ${project.name}`,
      disabledReason: removeDisabledReason,
      disabled: Boolean(removeDisabledReason),
      icon: <Trash2 class={stylex.attrs(styles.iconXs).class} />,
      onClick: () => controller.handleRemoveProject(project.id)
    },
    ...(controller.manualSortActive()
      ? [
          {
            key: "move-up",
            label: "Move up",
            tooltip: `Move ${project.name} up`,
            disabledReason: "Already first project",
            disabled: controller.visibleProjectIds().indexOf(project.id) === 0,
            icon: <ArrowUp class={stylex.attrs(styles.iconXs).class} />,
            onClick: () => controller.moveProject(project.id, -1)
          },
          {
            key: "move-down",
            label: "Move down",
            tooltip: `Move ${project.name} down`,
            disabledReason: "Already last project",
            disabled: controller.visibleProjectIds().indexOf(project.id) === controller.visibleProjectIds().length - 1,
            icon: <ArrowDown class={stylex.attrs(styles.iconXs).class} />,
            onClick: () => controller.moveProject(project.id, 1)
          }
        ]
      : []),
    {
      key: "open-ide",
      label: "Open in IDE",
      tooltip: `Open ${project.name} in IDE`,
      icon: <Code2 class={stylex.attrs(styles.iconXs).class} />,
      onClick: () => controller.handleOpenProjectInIde(project.id)
    }
  ];
}

function ProjectRow(rowProps: { project: ProjectCard }) {
  const controller = useProjectSidebar();
  const {
    props, manualSortActive, setSelectedProjectIds, setProjectSelectionAnchorId,
    selectedProjectIdSet, selectedProjects, showContextMenu, handleActivateProject,
    setProjectCollapsed, clearProjectSelectionTimer, scheduleProjectDelayedSelection,
    handleProjectCardClick, projectContextActions,
  } = controller;

    const project = rowProps.project;
    const isActiveProject = () => project.isActive;
    const [isCollapsed, setCollapsed] = createSignal(project.isCollapsed);
    let collapseButtonElement: HTMLButtonElement | undefined;
    let threadListElement: HTMLDivElement | undefined;
    const collapseLabel = (isCollapsed: boolean) => `${isCollapsed ? "Expand" : "Collapse"} threads in ${project.name}`;
    const applyCollapsedState = (nextCollapsed: boolean) => {
      setCollapsed(nextCollapsed);
      collapseButtonElement?.setAttribute("aria-label", collapseLabel(nextCollapsed));
      collapseButtonElement?.setAttribute("aria-expanded", String(!nextCollapsed));
      if (threadListElement) {
        threadListElement.hidden = nextCollapsed;
      }
    };
    const actionItems = () => projectRowActionItems(project, controller);
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

          <ButtonGroup
            menuLabel={`${project.name} actions`}
            collapseBelowWidth={480}
            items={() => [
              {
                key: "bulk-select",
                label: selectedProjectIdSet().has(project.id) ? `Remove ${project.name} from bulk selection` : `Add ${project.name} to bulk selection`,
                tooltip: "Toggle bulk selection",
                icon: selectedProjectIdSet().has(project.id) ? <CheckSquare2 class={stylex.attrs(styles.iconXs).class} /> : <Square class={stylex.attrs(styles.iconXs).class} />,
                onClick: (event) => {
                  event.stopPropagation();
                  setSelectedProjectIds((ids) => toggleSelectionId(ids, project.id));
                  setProjectSelectionAnchorId(project.id);
                },
              },
              ...actionItems().filter((item) => item.key !== "open-ide").map((item) => ({ ...item, label: projectActionAriaLabel(project.name, item.key) })),
            ]}
          />
        </div>
        {project.threads.length > 0 ? (
          <div ref={threadListElement} class={stylex.attrs(styles.threadList).class} hidden={isCollapsed()}>
            <For each={project.threads}>{(thread) => (
              <ProjectThreadRow project={project} thread={thread} />
            )}</For>
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
  const controller = useProjectSidebar();
  const {
    editingThreadId, setEditingThreadId, threadTitleDraft, setThreadTitleDraft, showContextMenu,
    handleActivateThread, handleOpenProjectInIde, handleForkThread, handlePinThread,
    handleArchiveThread, startRename, commitRename, threadContextActions,
  } = controller;

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

function ProjectSidebarFilter() {
  const {
    state,
    projectChatSearch,
    setProjectChatSearch,
    projectChatSearchIndex,
    setProjectChatSearchIndex,
    projectChatSearchResults,
    openProjectChatSearchResult,
    setProjectSort,
    setThreadSort,
    setGrouping,
    setProjectSearchInput
  } = useProjectSidebar();
  return (
    <LeftPaneFilterBlock>
      <LeftPaneSearchInput
        ref={setProjectSearchInput}
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
          setProjectChatSearch(event.currentTarget.value);
          setProjectChatSearchIndex(0);
        }}
        onKeyDown={(event) => {
          if (!projectChatSearch()) return;
          if (event.key === "Escape") {
            event.preventDefault();
            setProjectChatSearch("");
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setProjectChatSearchIndex((index) =>
              Math.min(index + 1, Math.max(0, projectChatSearchResults().length - 1))
            );
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
  );
}

export function ProjectSidebarView() {
  const controller = useProjectSidebar();
  const {
    state, sendCommand, activeProject, sidebarRows, visibleProjectIds, manualSortActive,
    cleanupDialogOpen, setCleanupDialogOpen, setSelectedProjectIds, selectedProjects,
    selectedProjectRemoveDisabledReason, handleOpenProjectInIde, handleProjectDragEnd,
    sendBulkProjectDelete, openNodeContextMenu, setSidebarList, setSidebarShellElement,
    setContextMenuSurfaceElement,
  } = controller;
  return (
    <div class={stylex.attrs(styles.contents).class}>
      <LeftPaneShell
        kind="projects"
        class={stylex.attrs(styles.sidebarShell).class}
        data-test-project-sidebar=""
        ref={setSidebarShellElement}
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
              size="sm"
              class={stylex.attrs(styles.projectSwitcherAction).class}
              ariaLabel="Open project switcher"
              onClick={() => harnessStore.openProjectSwitcher()}
            >
              <span class={stylex.attrs(styles.projectSwitcherLabel).class}>Open project</span>
            </ActionButton>
          </>
        }
      />

      <ProjectSidebarFilter />

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

      <LeftPaneBody><Show
        when={state.workspace.projects.length > 0}
        fallback={
          <LeftPaneEmptyState>
            No workspace roots yet.
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
                setSidebarList(handle);
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
                  setSidebarList(handle);
                }}
              >
                {(row) => renderSidebarRow(row)}
              </VirtualList>
            </SortableProvider>
          </DragDropProvider>
        </Show>
      </Show>

      </LeftPaneBody><Show when={activeProject()}>
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
        ref={setContextMenuSurfaceElement}
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
