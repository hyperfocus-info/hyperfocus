import { createEffect, createMemo, onCleanup, Show, type JSX } from "solid-js";
import { X } from "lucide-solid";
import * as stylex from "@stylexjs/stylex";
import { tokens } from "@hyperfocus/ui/tokens.stylex";
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
    padding: tokens.space2,
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
    position: "fixed",
    zIndex: 81,
  },
  surface: {
    padding: { default: tokens.space4, "@media (max-width: 30rem)": tokens.space2 },
    borderColor: "var(--border)",
    borderRadius: tokens.radius,
    borderStyle: "solid",
    borderWidth: "1px",
    gap: "1rem",
    backgroundColor: "var(--panel)",
    boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
    display: "flex",
    flexDirection: "column",
    maxHeight: "90vh",
    maxWidth: "36rem",
    minHeight: 0,
    minWidth: 0,
    width: "100%",
  },
  header: { gap: tokens.space3, alignItems: "flex-start", display: "flex", flexShrink: 0, justifyContent: "space-between", minWidth: 0, },
  heading: { gap: tokens.space1, display: "flex", flexDirection: "column", overflowWrap: "anywhere", minWidth: 0, },
  eyebrow: { color: "var(--muted)", fontSize: tokens.fontCaption, fontWeight: 600, letterSpacing: "normal", textTransform: "none" },
  title: { margin: 0, color: "var(--foreground)", fontSize: tokens.fontSection, fontWeight: 600, lineHeight: 1.3, },
  description: { margin: 0, color: "var(--muted)", fontSize: tokens.fontCaption, lineHeight: "1.25rem", },
  close: {
    borderRadius: "0.5rem",
    borderWidth: 0,
    outline: { default: "none", ":focus-visible": `2px solid ${tokens.focus}` },
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": "var(--panel-strong)" },
    color: { default: "var(--muted)", ":hover": "var(--foreground)" },
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    justifyContent: "center",
    outlineOffset: "2px",
    transitionDuration: "150ms",
    transitionProperty: "background-color, color",
    height: { default: tokens.controlCompact, "@media (pointer: coarse)": tokens.controlTouch },
    width: { default: tokens.controlCompact, "@media (pointer: coarse)": tokens.controlTouch },
  },
  icon: { height: "1rem", width: "1rem" },
  content: { gap: tokens.space4, overflow: "auto", display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, },
  footer: { gap: tokens.space2, display: "flex", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end", }
});

export function Dialog(props: DialogProps) {
  let surfaceRef: HTMLElement | undefined;
  const overlayId = `dialog-${Math.random().toString(36).slice(2)}`;
  const isOpen = createMemo(() => Boolean(typeof props.open === "function" ? props.open() : props.open));
  const renderChildren = () => {
    // JSX children can be a getter that constructs nested portals; read it once.
    const children = props.children;
    return typeof children === "function" ? children() : children;
  };

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
              if (event.defaultPrevented) return;
              trapFocusInOverlay(event, surfaceRef);
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div {...stylex.attrs(styles.header)}>
              <div {...stylex.attrs(styles.heading)}>
                <Show when={props.eyebrow}>{(eyebrow) => <div {...stylex.attrs(styles.eyebrow)}>{eyebrow()}</div>}</Show>
                <h2 {...stylex.attrs(styles.title)}>{props.title}</h2>
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

            <div data-test-dialog-content="" data-ui-dialog-body="" class={cn(stylex.attrs(styles.content).class, props.contentClass)}><Show when={props.description}><p {...stylex.attrs(styles.description)}>{props.description}</p></Show>{renderChildren()}</div>

            <Show when={props.footer}>
              <div {...stylex.attrs(styles.footer)}>{props.footer}</div>
            </Show>
          </section>
        </div>
      </Show>
    </PrimitivePortal>
  );
}
