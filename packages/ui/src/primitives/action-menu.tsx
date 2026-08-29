import * as stylex from "@stylexjs/stylex";
import { splitProps, type JSX } from "solid-js";
import { tokens } from "../theme/tokens.stylex";
import { sharedStyles } from "../theme/styles";
import { Popover, type PopoverState } from "./popover";

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
  onOpenChange?: (open: boolean) => void;
};

export type MenuItemProps = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "onPointerMove" | "role" | "tabIndex" | "type"
> & {
  onSelect: () => void;
  icon?: JSX.Element;
  shortcut?: string;
  tone?: "default" | "danger";
};

const styles = stylex.create({
  items: {
    gap: tokens.space1,
    display: "grid",
    minWidth: "12rem",
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
    backgroundColor: { default: "transparent", ":hover": tokens.panelRaised, ":focus": tokens.panelRaised },
    color: tokens.foreground,
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    display: "grid",
    fontFamily: tokens.fontUi,
    fontSize: "0.78rem",
    gridTemplateColumns: "auto minmax(0, 1fr) auto",
    opacity: { default: 1, ":disabled": 0.48 },
    textAlign: "start",
    minHeight: "2rem",
    width: "100%",
  },
  danger: { color: tokens.danger },
  icon: { alignItems: "center", display: "inline-flex", justifyContent: "center", width: "1rem" },
  label: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, },
  shortcut: {
    color: tokens.muted,
    fontFamily: tokens.fontMono,
    fontSize: "0.68rem",
    fontVariantNumeric: tokens.numericVariant,
  },
});

function menuItems(menu: HTMLDivElement) {
  return [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    .filter((item) => item.closest('[role="menu"]') === menu && !item.disabled && item.getAttribute("aria-disabled") !== "true");
}

function moveMenuFocus(event: KeyboardEvent & { currentTarget: HTMLDivElement; target: Element }) {
  const items = menuItems(event.currentTarget);
  if (items.length === 0) return;
  const current = event.target.closest<HTMLButtonElement>('[role="menuitem"]');
  const currentIndex = current ? items.indexOf(current) : -1;
  let nextIndex: number | undefined;

  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = items.length - 1;
  if (event.key === "ArrowDown") nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
  if (event.key === "ArrowUp") nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
  if (nextIndex === undefined) return;

  event.preventDefault();
  items[nextIndex].focus();
}

export function ActionMenu(props: ActionMenuProps) {
  let popoverState: PopoverState | undefined;
  return (
    <Popover
      ariaLabel={props.ariaLabel}
      autoFocus
      contentRole="menu"
      open={props.open}
      defaultOpen={props.defaultOpen}
      portal={props.portal}
      onOpenChange={props.onOpenChange}
      trigger={(toggle, state) => {
        popoverState = state;
        return props.trigger({ toggle, open: state.open, menuId: state.contentId });
      }}
      onContentKeyDown={(event) => moveMenuFocus(event)}
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
  const [local, rest] = splitProps(props, ["onSelect", "icon", "shortcut", "tone", "children", "class"]);
  return (
    <button
      {...rest}
      {...stylex.attrs(styles.item, sharedStyles.focusRing, local.tone === "danger" ? styles.danger : undefined)}
      classList={{ [local.class ?? ""]: Boolean(local.class) }}
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={() => {
        if (!props.disabled) local.onSelect();
      }}
      onPointerMove={(event) => {
        if (!props.disabled) event.currentTarget.focus();
      }}
    >
      {local.icon && <span {...stylex.attrs(styles.icon)} aria-hidden="true">{local.icon}</span>}
      <span {...stylex.attrs(styles.label)}>{local.children}</span>
      {local.shortcut && <kbd {...stylex.attrs(styles.shortcut)} aria-hidden="true">{local.shortcut}</kbd>}
    </button>
  );
}
