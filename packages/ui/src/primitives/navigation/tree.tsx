import * as stylex from "@stylexjs/stylex";
import { onMount, Show, splitProps, type JSX } from "solid-js";
import { tokens } from "../../theme/tokens.stylex";
import { sharedStyles } from "../../theme/styles";
import { Tooltip } from "../tooltip";

type TreeRootAccessibleName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-label"?: never; "aria-labelledby": string };

export type TreeRootProps = Omit<
  JSX.HTMLAttributes<HTMLUListElement>,
  "aria-label" | "aria-labelledby" | "onKeyDown" | "role"
> & TreeRootAccessibleName;

export type TreeItemProps = Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  "aria-expanded" | "aria-selected" | "children" | "onClick" | "onFocus" | "onKeyDown" | "role" | "tabIndex"
> & {
  itemId: string;
  label: JSX.Element;
  children?: JSX.Element;
  expanded?: boolean;
  hasChildren?: boolean;
  selected?: boolean;
  disabled?: boolean;
  leading?: JSX.Element;
  trailing?: JSX.Element;
  onExpandedChange?: (expanded: boolean) => void;
  onSelect?: () => void;
};

const styles = stylex.create({
  root: {
    margin: 0,
    padding: 0,
    gap: "1px",
    listStyle: "none",
    display: "grid",
    minWidth: 0,
  },
  node: { listStyle: "none", minWidth: 0 },
  item: {
    borderRadius: tokens.radiusSmall,
    gap: tokens.space1,
    paddingBlock: tokens.space1,
    paddingInline: tokens.space2,
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": tokens.panelRaised },
    color: tokens.foreground,
    cursor: "default",
    display: "grid",
    fontFamily: tokens.fontUi,
    fontSize: tokens.fontControl,
    gridTemplateColumns: "1.75rem auto minmax(0, 1fr) auto",
    opacity: { "[aria-disabled='true']": 0.48, default: 1, },
    userSelect: "none",
    minHeight: "1.9rem",
  },
  selected: { backgroundColor: tokens.selection, color: tokens.foreground },
  expander: {
    alignItems: "center",
    cursor: "pointer",
    display: "inline-flex",
    justifyContent: "center",
    height: "1.75rem",
    width: "1.75rem",
  },
  expanderSpacer: { display: "inline-block", width: "1.75rem" },
  leading: { alignItems: "center", color: tokens.muted, display: "inline-flex" },
  label: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, },
  trailing: { color: tokens.muted, fontFamily: tokens.fontMono, fontSize: tokens.fontCaption },
  group: {
    margin: 0,
    gap: "1px",
    listStyle: "none",
    paddingBlock: 0,
    display: "grid",
    paddingInlineEnd: 0,
    paddingInlineStart: tokens.space3,
  },
});

function visibleTreeItems(root: HTMLUListElement) {
  return [...root.querySelectorAll<HTMLElement>('[role="treeitem"]')].filter((item) => {
    if (item.getAttribute("aria-disabled") === "true") return false;
    const hiddenGroup = item.closest<HTMLElement>('[role="group"][hidden]');
    return !hiddenGroup;
  });
}

function setTreeTabStop(item: HTMLElement) {
  const root = item.closest<HTMLUListElement>('[role="tree"]');
  if (!root) return;
  for (const candidate of visibleTreeItems(root)) candidate.tabIndex = candidate === item ? 0 : -1;
}

function focusTreeItem(item: HTMLElement | undefined) {
  if (!item) return;
  setTreeTabStop(item);
  item.focus();
}

export function TreeRoot(props: TreeRootProps) {
  let root: HTMLUListElement | undefined;
  const [local, rest] = splitProps(props, ["children", "class"]);

  onMount(() => {
    if (!root) return;
    const items = visibleTreeItems(root);
    const selected = items.find((item) => item.getAttribute("aria-selected") === "true");
    const initial = selected ?? items[0];
    if (initial) setTreeTabStop(initial);
  });

  const onKeyDown: JSX.EventHandler<HTMLUListElement, KeyboardEvent> = (event) => {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest<HTMLElement>('[role="treeitem"]');
    if (!target || target.closest('[role="tree"]') !== event.currentTarget) return;
    const items = visibleTreeItems(event.currentTarget);
    const currentIndex = items.indexOf(target);
    if (currentIndex < 0) return;

    let next: HTMLElement | undefined;
    if (event.key === "ArrowDown") next = items[Math.min(items.length - 1, currentIndex + 1)];
    if (event.key === "ArrowUp") next = items[Math.max(0, currentIndex - 1)];
    if (event.key === "Home") next = items[0];
    if (event.key === "End") next = items.at(-1);
    if (!next) return;

    event.preventDefault();
    focusTreeItem(next);
  };

  return (
    <ul
      ref={root}
      {...rest}
      {...stylex.attrs(styles.root)}
      classList={{ [local.class ?? ""]: Boolean(local.class) }}
      role="tree"
      onKeyDown={onKeyDown}
    >
      {local.children}
    </ul>
  );
}

function directChild(node: HTMLLIElement) {
  return node.querySelector<HTMLElement>(':scope > [role="group"] > [role="none"] > [role="treeitem"]') ?? undefined;
}

function parentItem(node: HTMLLIElement) {
  const parentNode = node.parentElement?.closest<HTMLLIElement>('[role="none"][data-tree-node]');
  return parentNode?.querySelector<HTMLElement>(':scope > [role="treeitem"]') ?? undefined;
}

export function TreeItem(props: TreeItemProps) {
  let node: HTMLLIElement | undefined;
  const [local, rest] = splitProps(props, [
    "itemId",
    "label",
    "children",
    "expanded",
    "hasChildren",
    "selected",
    "disabled",
    "leading",
    "trailing",
    "onExpandedChange",
    "onSelect",
    "class",
  ]);
  const expandable = () => local.hasChildren ?? (
    local.children !== undefined || local.expanded !== undefined || local.onExpandedChange !== undefined
  );
  const expanded = () => expandable() && Boolean(local.expanded);

  const toggle = () => {
    if (!local.disabled && expandable()) local.onExpandedChange?.(!expanded());
  };

  const onKeyDown: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
    if (local.disabled) return;
    if (event.key === "ArrowRight" && expandable()) {
      event.preventDefault();
      event.stopPropagation();
      if (!expanded()) local.onExpandedChange?.(true);
      else if (node) focusTreeItem(directChild(node));
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      if (expandable() && expanded()) local.onExpandedChange?.(false);
      else if (node) focusTreeItem(parentItem(node));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      local.onSelect?.();
    }
  };

  return (
    <li ref={node} role="none" data-tree-node={local.itemId} {...stylex.attrs(styles.node)}>
      <div
        {...rest}
        {...stylex.attrs(styles.item, sharedStyles.focusRing, local.selected ? styles.selected : undefined)}
        classList={{ [local.class ?? ""]: Boolean(local.class) }}
        role="treeitem"
        aria-label={typeof local.label === "string" ? local.label : rest["aria-label"]}
        aria-expanded={expandable() ? expanded() : undefined}
        aria-selected={local.selected}
        aria-disabled={local.disabled || undefined}
        data-tree-item={local.itemId}
        tabIndex={local.selected && !local.disabled ? 0 : -1}
        onFocus={(event) => setTreeTabStop(event.currentTarget)}
        onKeyDown={onKeyDown}
        onClick={(event) => {
          if (local.disabled) return;
          if (event.target instanceof Element && event.target.closest("[data-tree-expander]")) toggle();
          else local.onSelect?.();
        }}
      >
        <Show when={expandable()} fallback={<span {...stylex.attrs(styles.expanderSpacer)} aria-hidden="true" />}>
          <span
            {...stylex.attrs(styles.expander)}
            data-tree-expander=""
            aria-hidden="true"
          >{expanded() ? "▾" : "▸"}</span>
        </Show>
        <Show when={local.leading}><span {...stylex.attrs(styles.leading)} aria-hidden="true">{local.leading}</span></Show>
        <Show when={typeof local.label === "string"} fallback={<span {...stylex.attrs(styles.label)}>{local.label}</span>}>
          <Tooltip class={stylex.attrs(styles.label).class} content={String(local.label)}><span>{local.label}</span></Tooltip>
        </Show>
        <Show when={local.trailing}><span {...stylex.attrs(styles.trailing)}>{local.trailing}</span></Show>
      </div>
      <Show when={expandable()}>
        <ul role="group" hidden={!expanded()} {...stylex.attrs(styles.group)}>{local.children}</ul>
      </Show>
    </li>
  );
}
