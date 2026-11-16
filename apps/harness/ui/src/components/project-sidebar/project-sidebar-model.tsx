import {     type JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import {


  createSortable,
  transformStyle
} from "@thisbeyond/solid-dnd";
import {


  type ProjectSidebarGrouping,
  type ProjectSidebarProjectSort,
  type ProjectSidebarThreadSort
} from "../../harness-store";
import {  type StatusChipTone } from "../primitives/status-chip";
import { projectNavigationStyles as styles } from "../project-navigation.styles";

export function toggleSelectionId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];
}

export function mergeProjectRangeSelection(ids: string[], visibleIds: string[], anchorId: string, targetId: string) {
  const anchorIndex = visibleIds.indexOf(anchorId);
  const targetIndex = visibleIds.indexOf(targetId);
  if (anchorIndex === -1 || targetIndex === -1) {
    return ids.includes(targetId) ? ids : [...ids, targetId];
  }
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return [...new Set([...ids, ...visibleIds.slice(start, end + 1)])];
}

export function applyDeleteButtonTone(button: HTMLButtonElement, armed: boolean) {
  const normalClasses = (stylex.attrs(styles.normalAction).class ?? "").split(/\s+/).filter(Boolean);
  const dangerClasses = (stylex.attrs(styles.dangerAction).class ?? "").split(/\s+/).filter(Boolean);
  const toneClasses = new Set([...normalClasses, ...dangerClasses]);
  const baseClasses = button.className.split(/\s+/).filter((className) => className && !toneClasses.has(className));
  button.className = [...baseClasses, ...(armed ? dangerClasses : normalClasses)].join(" ");
}

export type ProjectCard = {
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

export type ProjectThreadCard = {
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

export type ProjectGroup = {
  key: string;
  label?: string;
  projects: ProjectCard[];
};

export type ProjectSidebarRow =
  | { kind: "group"; key: string; label: string }
  | { kind: "project"; key: string; project: ProjectCard };

export function projectActionAriaLabel(projectName: string, key: string) {
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

export function formatProjectSortLabel(sort: ProjectSidebarProjectSort) {
  return sort === "created-at" ? "Created" : sort === "manual" ? "Manual" : "Last message";
}

export function formatThreadSortLabel(sort: ProjectSidebarThreadSort) {
  return sort === "created-at" ? "Created" : "Last message";
}

export function formatProjectGroupingLabel(grouping: ProjectSidebarGrouping) {
  return grouping === "repository-path" ? "Path" : grouping === "separate" ? "Separate" : "Repository";
}

export type ProjectCardSortableState = {
  ref?: (element: HTMLElement | null) => void;
  style: JSX.CSSProperties;
  dragActivators: ReturnType<typeof createSortable>["dragActivators"];
  isDragging: boolean;
};

export function SortableProjectCard(props: { projectId: string; children: (sortable: ProjectCardSortableState) => JSX.Element }) {
  const sortable = createSortable(props.projectId);
  return props.children({
    ref: sortable.ref,
    style: transformStyle(sortable.transform),
    dragActivators: sortable.dragActivators,
    isDragging: sortable.isActiveDraggable
  });
}

export function createStaticProjectCardSortableState(): ProjectCardSortableState {
  return {
    style: {},
    dragActivators: {},
    isDragging: false
  };
}

export function sortThreads<T extends { title: string; pinned?: boolean; createdAt?: string; updatedAt?: string; lastUserMessageAt?: string }>(
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

export function compareProjects(
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

export function groupProjectCards(projects: ProjectCard[], grouping: ProjectSidebarGrouping): ProjectGroup[] {
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

export function flattenProjectSidebarRows(groups: ProjectGroup[]) {
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

export function estimateProjectSidebarRowSize(row: ProjectSidebarRow) {
  if (row.kind === "group") {
    return 24;
  }
  return 112 + (row.project.isCollapsed ? 0 : row.project.threads.length * 82);
}

export function getLatestIso(values: Array<string | undefined>) {
  return values.reduce<string | undefined>((latest, value) => maxIso(latest, value), undefined);
}

export function getEarliestIso(values: Array<string | undefined>) {
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

export function maxIso(left?: string, right?: string) {
  if (!right) {
    return left;
  }
  if (!left) {
    return right;
  }
  return right.localeCompare(left) > 0 ? right : left;
}

export function compareIsoAsc(left?: string, right?: string) {
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

export function compareIsoDesc(left?: string, right?: string) {
  return compareIsoAsc(right, left);
}

export function getPathBasename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

export function getParentPath(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 1) {
    return path;
  }

  const prefix = /^[A-Za-z]:/.test(parts[0] ?? "") ? `${parts[0]}\\` : path.startsWith("\\\\") ? "\\\\" : "";
  const parentParts = /^[A-Za-z]:/.test(parts[0] ?? "") ? parts.slice(1, -1) : parts.slice(0, -1);
  return parentParts.length > 0 ? `${prefix}${parentParts.join("\\")}` : prefix || parts[0] || path;
}

export function moveId(ids: string[], fromIndex: number, toIndex: number) {
  const nextIds = [...ids];
  const [moved] = nextIds.splice(fromIndex, 1);
  if (!moved) {
    return ids;
  }
  nextIds.splice(toIndex, 0, moved);
  return nextIds;
}

export function badgeLabel(value: string) {
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

export function threadBadgeTone(value: string): StatusChipTone {
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
