import * as stylex from "@stylexjs/stylex";
import { createUniqueId, splitProps, type JSX } from "solid-js";
import { tokens } from "../theme/tokens.stylex";
import { sharedStyles } from "../theme/styles";
import { Popover, type PopoverState } from "./popover";
import { Tooltip } from "./tooltip";
import { moveContextMenuFocus } from './context-menu';

export type ActionMenuTriggerState = {
  toggle: () => void;
  open: () => boolean;
  menuId: string;
};

export type ActionMenuProps = {
  ariaLabel: string;
  trigger: (state: ActionMenuTriggerState) => JSX.Element;
  children: JSX.Element;
  open?: boolean;
  defaultOpen?: boolean;
  portal?: boolean;
  /** Navigation menus align to the trigger's start edge; trailing toolbars may opt into end. */
  align?: "start" | "center" | "end";
  onOpenChange?: (open: boolean) => void;
  /** Bind the owning row/card as well as the visible trigger. Defaults to the trigger. */
  contextTarget?: (trigger: HTMLElement) => HTMLElement | null | undefined;
};

export type MenuItemProps = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "onPointerMove" | "role" | "tabIndex" | "type"
> & {
  onSelect: () => void;
  icon?: JSX.Element;
  shortcut?: string;
  tone?: "default" | "danger";
  /** Additional context for ambiguous actions; visible labels need no tooltip. */
  tooltip?: string;
};

const styles = stylex.create({
  items: {
    gap: tokens.space1,
    display: "grid",
    maxWidth: "100%",
    minWidth: 0,
    width: "12rem",
  },
  item: {
    borderColor: "transparent",
    borderRadius: tokens.radiusSmall,
    borderStyle: "solid",
    borderWidth: "1px",
    gap: tokens.space2,
    paddingBlock: tokens.space1,
    paddingInline: tokens.space2,
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":focus:not(:disabled):not([aria-disabled='true'])": tokens.selection,
      ":hover:not(:disabled):not([aria-disabled='true'])": `color-mix(in srgb, ${tokens.selection} 50%, ${tokens.panelRaised})`,
    },
    color: tokens.foreground,
    cursor: "pointer",
    display: "grid",
    fontFamily: tokens.fontUi,
    fontSize: tokens.fontControl,
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
    lineHeight: 1.35,
    opacity: { default: 1, ":is(:disabled, [aria-disabled='true'])": 0.48 },
    textAlign: "start",
    minHeight: { default: tokens.controlCompact, "@media (pointer: coarse)": tokens.controlTouch },
    width: "100%",
  },
  itemTooltip: { minWidth: 0, width: "100%", },
  danger: { color: tokens.danger },
  icon: { gridColumn: '1', gridRow: '1', alignItems: "center", display: "inline-flex", justifyContent: "center", width: "1rem" },
  label: { gridColumn: '2', gridRow: '1', overflowWrap: "anywhere", whiteSpace: "normal", minWidth: 0, },
  shortcut: {
    gridColumn: '3',
    gridRow: '1',
    color: tokens.muted,
    fontFamily: tokens.fontMono,
    fontSize: tokens.fontCaption,
    fontVariantNumeric: tokens.numericVariant,
  },
});

export function ActionMenu(props: ActionMenuProps) {
  let popoverState: PopoverState | undefined;
  return (
    <Popover
      ariaLabel={props.ariaLabel}
      autoFocus
      contentRole="menu"
      contextMenu
      contextTarget={props.contextTarget}
      open={props.open}
      defaultOpen={props.defaultOpen}
      portal={props.portal}
      align={props.align ?? "start"}
      onOpenChange={props.onOpenChange}
      trigger={(toggle, state) => {
        popoverState = state;
        return props.trigger({ toggle, open: state.open, menuId: state.contentId });
      }}
      onContentKeyDown={(event) => moveContextMenuFocus(event.currentTarget,event)}
    >
      <div
        {...stylex.attrs(styles.items)}
        role="presentation"
        onClick={(event) => {
          if (!(event.target instanceof Element)) return;
          const item = event.target.closest<HTMLButtonElement>('[role="menuitem"]');
          if (!item || item.disabled || item.getAttribute("aria-disabled") === "true") return;
          popoverState?.close({ restoreFocus: true });
        }}
      >
        {props.children}
      </div>
    </Popover>
  );
}

export function MenuItem(props: MenuItemProps) {
  const tooltipId = `hf-menu-tooltip-${createUniqueId()}`;
  const [local, rest] = splitProps(props, ["onSelect", "icon", "shortcut", "tone", "tooltip", "children", "class"]);
  const disabled = () => props.disabled || props["aria-disabled"] === true || props["aria-disabled"] === "true";
  const button = (
    <button
      {...rest}
      {...stylex.attrs(styles.item, sharedStyles.focusRing, local.tone === "danger" ? styles.danger : undefined)}
      classList={{ [local.class ?? ""]: Boolean(local.class) }}
      type="button"
      role="menuitem"
      aria-label={rest["aria-label"] ?? (typeof local.children === "string" ? local.children : undefined)}
      aria-describedby={local.tooltip ? [rest["aria-describedby"], tooltipId].filter(Boolean).join(" ") : rest["aria-describedby"]}
      tabIndex={-1}
      onClick={() => {
        if (!disabled()) local.onSelect();
      }}
      onPointerMove={(event) => {
        if (!disabled()) event.currentTarget.focus();
      }}
    >
      {local.icon && <span {...stylex.attrs(styles.icon)} aria-hidden="true">{local.icon}</span>}
      <span {...stylex.attrs(styles.label)}>{local.children}</span>
      {local.shortcut && <kbd {...stylex.attrs(styles.shortcut)} aria-hidden="true">{local.shortcut}</kbd>}
    </button>
  );
  return local.tooltip
    ? <Tooltip id={tooltipId} class={stylex.attrs(styles.itemTooltip).class} content={local.tooltip}>{button}</Tooltip>
    : button;
}
