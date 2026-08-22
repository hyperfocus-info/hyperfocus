import { createEffect, onCleanup, Show, type JSX } from "solid-js";
import { X } from "lucide-solid";
import * as stylex from "@stylexjs/stylex";
import { cn } from "../../lib/utils";
import { isTopOverlay, registerFocusReturn, registerOverlay, restoreOverlayFocus, trapFocusInOverlay } from "./overlay-stack";
import { PrimitivePortal } from "./primitive-portal";

export function SheetRoot(props: { open: boolean; onOpenChange: (open: boolean) => void; children: JSX.Element }) {
  return <div data-test-sheet-root="">{props.children}</div>;
}

export function SheetTrigger(props: JSX.IntrinsicElements["button"]) {
  return (
    <button
      {...props}
      data-test-sheet-trigger=""
      class={cn(stylex.attrs(styles.trigger).class, props.class)}
      type={props.type ?? "button"}
    >
      {props.children}
    </button>
  );
}

export function SheetContent(props: {
  open?: boolean;
  onClose?: () => void;
  title: string;
  class?: string;
  children: JSX.Element;
}) {
  let surfaceRef: HTMLElement | undefined;
  const overlayId = `sheet-${Math.random().toString(36).slice(2)}`;

  createEffect(() => {
    if (!props.open) {
      return;
    }
    const unregister = registerOverlay(overlayId, { onEscape: () => props.onClose?.() });
    const unregisterFocusReturn = registerFocusReturn(overlayId, document.activeElement instanceof HTMLElement ? document.activeElement : null);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTopOverlay(overlayId)) {
        trapFocusInOverlay(event, surfaceRef);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keydown", handleKeyDown);
    queueMicrotask(() => {
      surfaceRef?.focus();
    });
    onCleanup(() => {
      unregister();
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keydown", handleKeyDown);
      restoreOverlayFocus(overlayId);
      unregisterFocusReturn();
    });
  });

  return (
    <PrimitivePortal active={props.open} layer="sheet">
      <Show when={props.open}>
        <div data-test-sheet-backdrop="" {...stylex.attrs(styles.backdrop)} onClick={() => props.onClose?.()} />
        <aside
          class={cn(
            stylex.attrs(styles.surface).class,
            props.class
          )}
          data-test-sheet=""
          tabindex="-1"
          ref={surfaceRef}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (isTopOverlay(overlayId)) {
                event.preventDefault();
                event.stopPropagation();
                props.onClose?.();
              }
              return;
            }
            trapFocusInOverlay(event, surfaceRef);
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div {...stylex.attrs(styles.header)}>
            <div {...stylex.attrs(styles.title)}>{props.title}</div>
            <button
              {...stylex.attrs(styles.close)}
              type="button"
              aria-label="Close sheet"
              onClick={() => props.onClose?.()}
            >
              <X {...stylex.attrs(styles.icon)} />
            </button>
          </div>
          <div data-test-sheet-body="" {...stylex.attrs(styles.body)}>
            {props.children}
          </div>
        </aside>
      </Show>
    </PrimitivePortal>
  );
}

const styles = stylex.create({
  trigger: { cursor: { default: "pointer", ":disabled": "not-allowed" } },
  backdrop: {
    backdropFilter: "blur(4px)",
    backgroundColor: "rgb(0 0 0 / 0.45)",
    inset: 0,
    position: "fixed",
    zIndex: 70
  },
  surface: {
    backgroundColor: "var(--panel)",
    borderColor: "var(--border)",
    borderStyle: "solid",
    borderWidth: "0 1px 0 0",
    boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
    insetBlock: 0,
    left: 0,
    maxWidth: "24rem",
    overflow: "hidden",
    padding: "0.75rem",
    position: "fixed",
    width: "88vw",
    zIndex: 71
  },
  header: { alignItems: "center", display: "flex", flexShrink: 0, gap: "0.75rem", justifyContent: "space-between", marginBottom: "0.75rem" },
  title: { color: "var(--muted)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase" },
  close: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": "var(--panel-strong)" },
    borderWidth: 0,
    borderRadius: "0.5rem",
    color: "var(--foreground)",
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    display: "inline-flex",
    height: "2.25rem",
    justifyContent: "center",
    transitionProperty: "background-color, color",
    transitionDuration: "150ms",
    width: "2.25rem"
  },
  icon: { height: "1rem", width: "1rem" },
  body: { display: "flex", flex: "1", flexDirection: "column", minHeight: 0, overflow: "hidden" }
});
