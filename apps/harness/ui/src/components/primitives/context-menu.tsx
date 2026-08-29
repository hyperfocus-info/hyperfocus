import { createEffect, For, onCleanup, Show } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { PrimitivePortal } from "./primitive-portal";

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
    width: "13rem",
  },
  action: { paddingInline: "0.5rem", justifyContent: "space-between", textAlign: "left", height: "2rem", width: "100%", },
  disabled: { opacity: 0.5 },
  shortcut: { color: "var(--muted)", fontSize: "0.62rem" }
});

export function ContextMenu(props: ContextMenuProps) {
  let surfaceRef: HTMLDivElement | undefined;

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
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        props.onClose();
      }
    };
    window.addEventListener("pointerdown", closeOnPointer);
    window.addEventListener("keydown", closeOnEscape);
    onCleanup(() => {
      window.removeEventListener("pointerdown", closeOnPointer);
      window.removeEventListener("keydown", closeOnEscape);
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
        >
          <For each={props.actions}>
            {(action) => (
              <Button
                tooltip={action.disabled && action.disabledReason ? action.disabledReason : action.label}
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
