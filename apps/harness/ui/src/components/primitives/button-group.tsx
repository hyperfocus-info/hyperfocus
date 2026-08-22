import { For, createEffect, createSignal, onCleanup, type JSX } from "solid-js";
import { Menu } from "lucide-solid";
import * as stylex from "@stylexjs/stylex";
import { cn } from "../../lib/utils";
import { ActionButton } from "../action-button";
import { Button } from "./button";
import { Popover } from "./popover";
import { Tooltip } from "./tooltip";

export type ButtonGroupItem = {
  key: string;
  label: string;
  tooltip: string;
  disabledReason?: string;
  icon: JSX.Element;
  class?: string;
  classList?: Record<string, boolean | undefined>;
  disabled?: boolean;
  onClick?: (event: MouseEvent & { currentTarget: HTMLButtonElement }) => void;
};

type ButtonGroupProps = {
  items: ButtonGroupItem[] | (() => ButtonGroupItem[]);
  menuLabel: string;
  class?: string;
  collapseBelowWidth?: number | string;
};

export function ButtonGroup(props: ButtonGroupProps) {
  const [collapsed, setCollapsed] = createSignal(false);
  const [open, setOpen] = createSignal(false);
  let rootElement: HTMLDivElement | undefined;
  let resizeObserver: ResizeObserver | undefined;

  const updateCollapsed = () => {
    const target = rootElement?.parentElement ?? rootElement;
    if (!target) {
      return;
    }
    setCollapsed(target.getBoundingClientRect().width < resolveCollapseWidth(props.collapseBelowWidth));
  };

  createEffect(() => {
    updateCollapsed();
    const target = rootElement?.parentElement ?? rootElement;
    if (!target || typeof ResizeObserver === "undefined") {
      return;
    }
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(updateCollapsed);
    resizeObserver.observe(target);
  });

  onCleanup(() => resizeObserver?.disconnect());

  const items = () => (typeof props.items === "function" ? props.items() : props.items);

  const runItem = (item: ButtonGroupItem, event: MouseEvent & { currentTarget: HTMLButtonElement }) => {
    if (item.disabled) {
      return;
    }
    item.onClick?.(event);
    setOpen(false);
  };

  return (
    <div ref={rootElement} data-test-button-group="" class={cn(stylex.attrs(styles.root).class, props.class)}>
      {collapsed() ? (
        <Popover
          open={open()}
          onClose={() => setOpen(false)}
          align="end"
          side="bottom"
          contentClass={stylex.attrs(styles.popoverContent).class}
          content={
            <div {...stylex.attrs(styles.menu)}>
              <For each={items()}>
                {(item) => (
                  <Tooltip content={item.disabled && item.disabledReason ? item.disabledReason : item.tooltip} triggerClass={stylex.attrs(styles.tooltipTrigger).class}>
                    <button
                      type="button"
                      {...stylex.attrs(styles.menuItem)}
                      disabled={item.disabled}
                      aria-label={item.label}
                      aria-description={item.disabled && item.disabledReason ? item.disabledReason : undefined}
                      onClick={(event) => runItem(item, event)}
                    >
                      <span {...stylex.attrs(styles.itemIcon)}>{item.icon}</span>
                      <span {...stylex.attrs(styles.itemLabel)}>{item.label}</span>
                    </button>
                  </Tooltip>
                )}
              </For>
            </div>
          }
        >
          <Button
            tooltip={props.menuLabel}
            aria-label={props.menuLabel}
            variant="ghost"
            size="icon"
            class={stylex.attrs(styles.compactButton).class}
            onClick={() => setOpen((current) => !current)}
          >
            <Menu {...stylex.attrs(styles.menuIcon)} />
          </Button>
        </Popover>
      ) : (
        <For each={items()}>
          {(item) => (
            <ActionButton
              tooltip={item.tooltip}
              disabledReason={item.disabledReason}
              disabled={item.disabled}
              icon={item.icon}
              variant="ghost"
              size="icon"
              class={cn(stylex.attrs(styles.compactButton).class, item.class)}
              classList={item.classList}
              ariaLabel={item.label}
              onClick={item.onClick}
            />
          )}
        </For>
      )}
    </div>
  );
}

const styles = stylex.create({
  root: { display: "flex", flexShrink: 0, gap: "0.125rem" },
  popoverContent: { padding: "0.375rem", width: "11rem" },
  menu: { display: "flex", flexDirection: "column", fontSize: "0.675rem", gap: "0.25rem" },
  menuItem: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": "rgb(0 0 0 / 0.05)" },
    borderWidth: 0,
    borderRadius: "0.5rem",
    color: "var(--foreground)",
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    display: "flex",
    fontWeight: 600,
    gap: "0.5rem",
    minHeight: "2rem",
    paddingInline: "0.5rem",
    textAlign: "left",
    transitionProperty: "background-color, color",
    opacity: { default: 1, ":disabled": 0.45 },
    transitionDuration: "150ms",
    width: "100%"
  },
  itemIcon: { alignItems: "center", display: "flex", height: "1rem", justifyContent: "center", width: "1rem" },
  itemLabel: { flex: "1", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  compactButton: { borderRadius: "0.5rem", height: "1.5rem", width: "1.5rem" },
  menuIcon: { height: "0.75rem", width: "0.75rem" },
  tooltipTrigger: { display: "block" }
});

function resolveCollapseWidth(width: number | string | undefined) {
  if (typeof width === "number") {
    return width;
  }
  if (typeof width !== "string") {
    return 22 * 16;
  }

  const trimmed = width.trim();
  if (trimmed.endsWith("rem")) {
    const rem = Number(trimmed.slice(0, -3));
    return Number.isFinite(rem) ? rem * 16 : 22 * 16;
  }
  if (trimmed.endsWith("px")) {
    const px = Number(trimmed.slice(0, -2));
    return Number.isFinite(px) ? px : 22 * 16;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 22 * 16;
}
