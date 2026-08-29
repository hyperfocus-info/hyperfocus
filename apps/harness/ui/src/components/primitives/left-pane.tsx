import { Check, ChevronRight, CircleHelp, Search, SlidersHorizontal } from "lucide-solid";
import { For, Show, createSignal, splitProps, type JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { cn } from "../../lib/utils";
import { Input } from "./input";
import { Popover } from "./popover";
import { Tooltip } from "./tooltip";

type LeftPaneShellProps = {
  children: JSX.Element;
  class?: string;
  padding?: "compact" | "comfortable";
  kind?: string;
} & JSX.HTMLAttributes<HTMLElement>;

const styles = stylex.create({
  shell: { borderColor: "var(--border)", borderRadius: "1rem", borderStyle: "solid", borderWidth: "1px", gap: "1rem", backgroundColor: "var(--panel)", containerType: "inline-size", display: "flex", flexDirection: "column", height: "100%", minHeight: 0, minWidth: 0, width: "100%", },
  compact: { padding: "0.8rem" },
  comfortable: { padding: "1rem" },
  header: { padding: "0.25rem" },
  headerRow: { gap: "0.75rem", alignItems: "center", display: "flex", justifyContent: "space-between", },
  headerTitle: { gap: "0.5rem", alignItems: "center", color: "var(--muted)", display: "flex", fontSize: "0.585rem", fontWeight: 600, letterSpacing: "0.2em", minWidth: 0, },
  truncate: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  help: { display: "inline-flex", flexShrink: 0 },
  smallIcon: { color: "var(--muted)", height: "0.875rem", width: "0.875rem" },
  headerActions: { gap: "0.5rem", alignItems: "center", display: "flex", flexShrink: 0, },
  filterBlock: { gap: "0.5rem", display: "grid", },
  search: { display: "block", position: "relative" },
  searchIcon: { color: "var(--muted)", pointerEvents: "none", position: "absolute", transform: "translateY(-50%)", height: "1rem", left: "0.75rem", top: "50%", width: "1rem", },
  searchInput: { height: "2.5rem", paddingLeft: "2.25rem" },
  searchInputWithMenu: { paddingRight: "3rem" },
  searchMenu: { position: "absolute", transform: "translateY(-50%)", right: "0.375rem", top: "50%", },
  menuItem: { borderRadius: "0.5rem", borderWidth: 0, gap: "0.5rem", paddingInline: "0.5rem", alignItems: "center", backgroundColor: { default: "transparent", ":hover": "rgb(0 0 0 / 0.05)" }, color: "var(--foreground)", cursor: { default: "pointer", ":disabled": "not-allowed" }, display: "flex", opacity: { default: 1, ":disabled": 0.5 }, textAlign: "left", transitionDuration: "150ms", transitionProperty: "background-color, color", minHeight: "2rem", width: "100%", },
  activeText: { color: "var(--accent-strong)" },
  menuItemIcon: { alignItems: "center", color: "var(--muted)", display: "flex", flexShrink: 0, justifyContent: "center", height: "1rem", width: "1rem", },
  activeIcon: { color: "var(--accent)" },
  menuItemLabel: { flex: "1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, },
  check: { color: "var(--foreground)", flexShrink: 0, height: "0.875rem", width: "0.875rem" },
  menuContent: { gap: "0.25rem", display: "flex", flexDirection: "column", fontSize: "0.675rem", },
  popoverContent: { padding: "0.5rem", width: "15rem" },
  separator: { borderColor: "var(--border)",
 borderStyle: "solid",
 marginBlock: "0.25rem",
 borderBottomWidth: '0',
 borderLeftWidth: '0',
 borderRightWidth: '0',
 borderTopWidth: '1px', },
  menuSection: { paddingBlock: '0.25rem',
 paddingInline: '0.5rem', color: "var(--muted)", fontSize: "0.625rem", },
  submenuRoot: { position: "relative" },
  submenuValue: { overflow: "hidden", color: "var(--muted)", fontSize: "0.625rem", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "5rem", },
  chevron: { color: "var(--muted)", flexShrink: 0, height: "0.875rem", width: "0.875rem" },
  submenu: { padding: "0.5rem", borderColor: "var(--border)", borderRadius: "1rem", borderStyle: "solid", borderWidth: "1px", gap: "0.25rem", backgroundColor: "var(--panel)", boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)", display: "flex", flexDirection: "column", position: "absolute", zIndex: 131, left: "100%", marginLeft: "0.5rem", top: 0, width: "13rem", },
  filterButton: { borderRadius: "0.5rem", borderWidth: 0, outline: { default: null, ":focus-visible": "none" }, alignItems: "center", backgroundColor: { default: "transparent", ":hover": "rgb(0 0 0 / 0.05)" }, boxShadow: { default: null, ":focus-visible": "0 0 0 2px var(--ring)" }, color: { default: "var(--muted)", ":hover": "var(--foreground)" }, cursor: "pointer", display: "inline-flex", justifyContent: "center", position: "relative", transitionDuration: "150ms", transitionProperty: "background-color, color", height: "1.75rem", width: "1.75rem", },
  badge: { borderRadius: "9999px", paddingInline: "0.25rem", alignItems: "center", backgroundColor: "var(--accent)", color: "white", display: "flex", fontSize: "0.55rem", fontWeight: 600, justifyContent: "center", lineHeight: 1, position: "absolute", height: "1rem", minWidth: "1rem", right: "-0.25rem", top: "-0.25rem", },
  listSection: { padding: { default: "1rem", "@container (max-width: 17rem)": "0.7rem" }, borderColor: "var(--border)", borderRadius: "1.35rem", borderStyle: "solid", borderWidth: "1px", flex: "1", backgroundColor: "var(--panel-strong)", display: "flex", flexDirection: "column", minHeight: 0, },
  listHeader: { gap: "0.75rem", alignItems: "center", display: "flex", justifyContent: "space-between", marginBottom: "0.75rem", },
  listTitle: { color: "var(--muted)", fontSize: "0.585rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase" },
  count: { color: "var(--muted)", fontSize: "0.625rem" },
  empty: { padding: "1rem", borderColor: "var(--border)", borderRadius: "1.2rem", borderStyle: "dashed", borderWidth: "1px", backgroundColor: "rgb(255 255 255 / 0.45)", color: "var(--muted)", fontSize: "0.675rem", lineHeight: "1.25rem", },
  detailEmpty: { padding: "1.5rem", borderColor: "var(--border)", borderRadius: "1.2rem", borderStyle: "dashed", borderWidth: "1px", alignItems: "center", backgroundColor: "rgb(255 255 255 / 0.45)", color: "var(--muted)", display: "flex", fontSize: "0.675rem", justifyContent: "center", textAlign: "center", height: "100%", minHeight: "20rem", }
});

export function LeftPaneShell(props: LeftPaneShellProps) {
  const [local, rest] = splitProps(props, ["children", "class", "padding", "kind"]);
  return (
    <section
      {...rest}
      data-test-left-pane-shell=""
      data-left-pane-kind={local.kind}
      class={cn(stylex.attrs(styles.shell, local.padding === "comfortable" ? styles.comfortable : styles.compact).class, local.class)}
    >
      {local.children}
    </section>
  );
}

type LeftPaneHeaderProps = {
  title: string;
  help: string;
  actions?: JSX.Element;
  class?: string;
};

export function LeftPaneHeader(props: LeftPaneHeaderProps) {
  return (
    <div class={cn(stylex.attrs(styles.header).class, props.class)}>
      <div {...stylex.attrs(styles.headerRow)}>
        <div {...stylex.attrs(styles.headerTitle)}>
          <span {...stylex.attrs(styles.truncate)}>{props.title}</span>
          <Tooltip content={props.help}>
            <span {...stylex.attrs(styles.help)}>
              <CircleHelp {...stylex.attrs(styles.smallIcon)} aria-label={`${props.title} help`} />
            </span>
          </Tooltip>
        </div>
        <div {...stylex.attrs(styles.headerActions)}>{props.actions}</div>
      </div>
    </div>
  );
}

export function LeftPaneFilterBlock(props: { children: JSX.Element; class?: string }) {
  return <div class={cn(stylex.attrs(styles.filterBlock).class, props.class)}>{props.children}</div>;
}

type LeftPaneSearchInputProps = JSX.IntrinsicElements["input"] & {
  wrapperClass?: string;
  menu?: JSX.Element;
};

export function LeftPaneSearchInput(props: LeftPaneSearchInputProps) {
  const [local, rest] = splitProps(props, ["class", "wrapperClass", "menu"]);

  return (
    <div class={cn(stylex.attrs(styles.search).class, local.wrapperClass)}>
      <Search {...stylex.attrs(styles.searchIcon)} />
      <Input {...rest} type="search" class={cn(stylex.attrs(styles.searchInput, Boolean(local.menu) && styles.searchInputWithMenu).class, local.class)} />
      <Show when={local.menu}>
        <div {...stylex.attrs(styles.searchMenu)}>{local.menu}</div>
      </Show>
    </div>
  );
}

export type LeftPaneSearchMenuItem =
  | { kind: "section"; label: string }
  | { kind: "separator" }
  | {
      kind: "option";
      label: string;
      icon: JSX.Element;
      selected?: boolean;
      active?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | {
      kind: "submenu";
      label: string;
      value?: string;
      icon: JSX.Element;
      active?: boolean;
      items: Array<Extract<LeftPaneSearchMenuItem, { kind: "option" }>>;
    };

export function LeftPaneSearchMenu(props: {
  ariaLabel: string;
  tooltip: string;
  items: LeftPaneSearchMenuItem[];
  activeFilterCount?: number;
}) {
  const [open, setOpen] = createSignal(false);
  const [openSubmenuIndex, setOpenSubmenuIndex] = createSignal<number>();
  const renderOption = (item: Extract<LeftPaneSearchMenuItem, { kind: "option" }>) => (
    <button
      type="button"
      {...stylex.attrs(styles.menuItem, item.active && styles.activeText)}
      disabled={item.disabled}
      onClick={() => {
        if (item.disabled) {
          return;
        }
        item.onSelect();
        setOpen(false);
      }}
    >
      <span {...stylex.attrs(styles.menuItemIcon, item.active && styles.activeIcon)}>
        {item.icon}
      </span>
      <span {...stylex.attrs(styles.menuItemLabel)}>{item.label}</span>
      <Show when={item.selected}>
        <Check {...stylex.attrs(styles.check, item.active && styles.activeIcon)} />
      </Show>
    </button>
  );

  return (
    <Tooltip content={props.tooltip} disabled={open()}>
      <Popover
        open={open()}
        onClose={() => setOpen(false)}
        align="end"
        side="bottom"
        contentClass={stylex.attrs(styles.popoverContent).class}
        content={
          <div {...stylex.attrs(styles.menuContent)}>
            <For each={props.items}>
              {(item, index) => {
                if (item.kind === "separator") {
                  return <div {...stylex.attrs(styles.separator)} />;
                }
                if (item.kind === "section") {
                  return <div {...stylex.attrs(styles.menuSection)}>{item.label}</div>;
                }
                if (item.kind === "submenu") {
                  const active = () => openSubmenuIndex() === index();
                  const hasActiveFilter = () => item.active ?? item.items.some((subitem) => subitem.active);
                  return (
                    <div {...stylex.attrs(styles.submenuRoot)} onMouseEnter={() => setOpenSubmenuIndex(index())} onFocusIn={() => setOpenSubmenuIndex(index())}>
                      <button
                        type="button"
                        {...stylex.attrs(styles.menuItem, hasActiveFilter() && styles.activeText)}
                      >
                        <span {...stylex.attrs(styles.menuItemIcon, hasActiveFilter() && styles.activeIcon)}>
                          {item.icon}
                        </span>
                        <span {...stylex.attrs(styles.menuItemLabel)}>{item.label}</span>
                        <Show when={item.value}>
                          <span {...stylex.attrs(styles.submenuValue, hasActiveFilter() && styles.activeText)}>
                            {item.value}
                          </span>
                        </Show>
                        <ChevronRight {...stylex.attrs(styles.chevron)} />
                      </button>
                      <Show when={active()}>
                        <div {...stylex.attrs(styles.submenu)}>
                          <For each={item.items}>{(subitem) => renderOption(subitem)}</For>
                        </div>
                      </Show>
                    </div>
                  );
                }
                return renderOption(item);
              }}
            </For>
          </div>
        }
      >
        <button
          type="button"
          {...stylex.attrs(styles.filterButton)}
          aria-label={props.ariaLabel}
          aria-expanded={open()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((current) => !current)}
        >
          <SlidersHorizontal {...stylex.attrs(styles.smallIcon)} />
          <Show when={(props.activeFilterCount ?? 0) > 0}>
            <span {...stylex.attrs(styles.badge)}>
              {props.activeFilterCount}
            </span>
          </Show>
        </button>
      </Popover>
    </Tooltip>
  );
}

export function LeftPaneListSection(props: { title: string; count?: string | number; children: JSX.Element; class?: string }) {
  return (
    <section class={cn(stylex.attrs(styles.listSection).class, props.class)}>
      <div {...stylex.attrs(styles.listHeader)}>
        <div {...stylex.attrs(styles.listTitle)}>{props.title}</div>
        <span {...stylex.attrs(styles.count)}>{props.count}</span>
      </div>
      {props.children}
    </section>
  );
}

export function LeftPaneEmptyState(props: { children: JSX.Element; class?: string }) {
  return (
    <div
      data-test-left-pane-empty-state=""
      class={cn(stylex.attrs(styles.empty).class, props.class)}
    >
      {props.children}
    </div>
  );
}

export function DetailEmptyState(props: { children: JSX.Element; class?: string }) {
  return (
    <div
      data-test-detail-empty-state=""
      class={cn(stylex.attrs(styles.detailEmpty).class, props.class)}
    >
      {props.children}
    </div>
  );
}
