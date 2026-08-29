import { createEffect, createMemo, onCleanup, Show, type JSX } from "solid-js";
import { X } from "lucide-solid";
import * as stylex from "@stylexjs/stylex";
import { cn } from "../../lib/utils";
import { PrimitivePortal } from "./primitive-portal";
import { isTopOverlay, registerFocusReturn, registerOverlay, restoreOverlayFocus, trapFocusInOverlay } from "./overlay-stack";

type DialogProps = {
  open?: boolean | (() => boolean);
  onClose?: () => void;
  title: string;
  eyebrow?: string;
  description?: string;
  class?: string;
  contentClass?: string;
  children: JSX.Element | (() => JSX.Element);
  footer?: JSX.Element;
};

const styles = stylex.create({
  backdrop: { inset: 0, backdropFilter: "blur(4px)", backgroundColor: "rgb(0 0 0 / 0.45)", position: "fixed", zIndex: 80, },
  positioner: {
    inset: 0,
    padding: { default: "0.75rem", "@media (min-width: 768px)": "1.25rem" },
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    position: "fixed",
    zIndex: 81,
  },
  surface: {
    padding: "1.25rem",
    borderColor: "var(--border)",
    borderRadius: "1.75rem",
    borderStyle: "solid",
    borderWidth: "1px",
    gap: "1rem",
    backgroundColor: "var(--panel)",
    boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
    display: "flex",
    flexDirection: "column",
    maxHeight: "90vh",
    maxWidth: "36rem",
    width: "100%",
  },
  header: { gap: "0.75rem", alignItems: "flex-start", display: "flex", justifyContent: "space-between", },
  heading: { gap: "0.25rem", display: "flex", flexDirection: "column", },
  eyebrow: { color: "var(--muted)", fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase" },
  title: { margin: 0, color: "var(--foreground)", fontSize: "1.25rem", fontWeight: 600, letterSpacing: "-0.04em", lineHeight: "1.75rem", },
  description: { margin: 0, color: "var(--muted)", fontSize: "0.75rem", lineHeight: "1.25rem", },
  close: {
    borderRadius: "0.5rem",
    borderWidth: 0,
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": "var(--panel-strong)" },
    color: { default: "var(--muted)", ":hover": "var(--foreground)" },
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    display: "inline-flex",
    justifyContent: "center",
    transitionDuration: "150ms",
    transitionProperty: "background-color, color",
    height: "2rem",
    width: "2rem",
  },
  icon: { height: "1rem", width: "1rem" },
  content: { gap: "1rem", overflow: "auto", display: "flex", flexDirection: "column", maxHeight: "70%", },
  footer: { gap: "0.5rem", display: "flex", flexWrap: "wrap", justifyContent: "flex-end", }
});

export function Dialog(props: DialogProps) {
  let surfaceRef: HTMLElement | undefined;
  const overlayId = `dialog-${Math.random().toString(36).slice(2)}`;
  const isOpen = createMemo(() => Boolean(typeof props.open === "function" ? props.open() : props.open));
  const renderChildren = () => (typeof props.children === "function" ? props.children() : props.children);

  createEffect(() => {
    if (!isOpen()) {
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
    <PrimitivePortal active={isOpen()} layer="dialog">
      <Show when={isOpen()}>
        <div data-test-dialog-backdrop="" {...stylex.attrs(styles.backdrop)} onClick={() => props.onClose?.()} />
        <div {...stylex.attrs(styles.positioner)}>
          <section
            class={cn(
              stylex.attrs(styles.surface).class,
              props.class
            )}
            data-test-dialog=""
            role="dialog"
            aria-modal="true"
            aria-label={props.title}
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
              <div {...stylex.attrs(styles.heading)}>
                <div {...stylex.attrs(styles.eyebrow)}>
                  {props.eyebrow ?? "Dialog"}
                </div>
                <h2 {...stylex.attrs(styles.title)}>{props.title}</h2>
                <Show when={props.description}>
                  <p {...stylex.attrs(styles.description)}>{props.description}</p>
                </Show>
              </div>
              <button
                {...stylex.attrs(styles.close)}
                type="button"
                aria-label="Close dialog"
                onClick={() => props.onClose?.()}
              >
                <X {...stylex.attrs(styles.icon)} />
              </button>
            </div>

            <div data-test-dialog-content="" class={cn(stylex.attrs(styles.content).class, props.contentClass)}>{renderChildren()}</div>

            <Show when={props.footer}>
              <div {...stylex.attrs(styles.footer)}>{props.footer}</div>
            </Show>
          </section>
        </div>
      </Show>
    </PrimitivePortal>
  );
}
