import { tokens } from "@hyperfocus/ui/tokens.stylex";
import { createEffect, createUniqueId, For, onCleanup, Show } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { PrimitivePortal } from "./primitive-portal";
import { registerOverlay } from "./overlay-stack";

export type ContextMenuAction = {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  disabledReason?: string;
  onSelect: () => void;
};

type ContextMenuProps = {
  open: boolean;
  x: number;
  y: number;
  ariaLabel: string;
  actions: ContextMenuAction[];
  onClose: () => void;
};

const styles = stylex.create({
  surface: {
    padding: "0.375rem",
    borderColor: "var(--border)",
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: "1px",
    gap: "0.25rem",
    backgroundColor: "var(--panel-strong)",
    boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
    color: "var(--foreground)",
    display: "flex",
    flexDirection: "column",
    fontSize: "0.75rem",
    position: "fixed",
    zIndex: 150,
    maxHeight: "calc(100dvh - 16px)",
    maxWidth: "calc(100vw - 16px)",
    overflowY: "auto",
    width: "13rem",
  },
  action: { paddingInline: tokens.space2, justifyContent: "space-between", overflowWrap: "anywhere", textAlign: "left", whiteSpace: "normal", minHeight: { default: tokens.controlCompact, "@media (pointer: coarse)": tokens.controlTouch }, width: "100%", },
  disabled: { opacity: 0.5 },
  shortcut: { color: "var(--muted)", fontSize: tokens.fontCaption }
});

export function ContextMenu(props: ContextMenuProps) {
  let surfaceRef: HTMLDivElement | undefined;
  const overlayId = `popover-context-${createUniqueId()}`;

  createEffect(() => {
    if (!props.open) {
      return;
    }

    const closeOnPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && surfaceRef?.contains(event.target)) {
        return;
      }
      props.onClose();
    };
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const unregister = registerOverlay(overlayId, { onEscape: () => { props.onClose(); origin?.focus(); } });
    const place = () => {
      if (!surfaceRef) return;
      const bounds = surfaceRef.getBoundingClientRect();
      surfaceRef.style.left = `${Math.max(8, Math.min(props.x, innerWidth - bounds.width - 8))}px`;
      surfaceRef.style.top = `${Math.max(8, Math.min(props.y, innerHeight - bounds.height - 8))}px`;
    };
    queueMicrotask(() => { place(); surfaceRef?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus(); });
    window.addEventListener("pointerdown", closeOnPointer);
    window.addEventListener("resize", place);
    onCleanup(() => {
      unregister();
      window.removeEventListener("pointerdown", closeOnPointer);
      window.removeEventListener("resize", place);
      if (surfaceRef?.contains(document.activeElement)) origin?.focus();
    });
  });

  const position = () => ({
    left: `${Math.max(8, Math.min(props.x, window.innerWidth - 220))}px`,
    top: `${Math.max(8, Math.min(props.y, window.innerHeight - 220))}px`
  });

  return (
    <PrimitivePortal active={props.open} layer="popover">
      <Show when={props.open}>
        <div
          ref={surfaceRef}
          data-test-context-menu=""
          role="menu"
          aria-label={props.ariaLabel}
          {...stylex.attrs(styles.surface)}
          style={position()}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (event.key === "Tab") { props.onClose(); return; }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const items = [...(surfaceRef?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
            const index = items.findIndex(item => item === document.activeElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          }}
        >
          <For each={props.actions}>
            {(action) => (
              <Button
                {...(action.disabled && action.disabledReason
                  ? { tooltip: action.disabledReason }
                  : { justificationForNoTooltip: "The menu item has a visible action label." })}
                variant="ghost"
                size="sm"
                class={cn(stylex.attrs(styles.action, action.disabled && styles.disabled).class)}
                disabled={action.disabled}
                role="menuitem"
                onClick={() => {
                  if (action.disabled) {
                    return;
                  }
                  action.onSelect();
                  props.onClose();
                }}
              >
                <span>{action.label}</span>
                <Show when={action.shortcut}>
                  <span {...stylex.attrs(styles.shortcut)}>{action.shortcut}</span>
                </Show>
              </Button>
            )}
          </For>
        </div>
      </Show>
    </PrimitivePortal>
  );
}
