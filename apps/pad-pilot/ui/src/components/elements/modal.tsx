import * as stylex from "@stylexjs/stylex";
import { Show, createEffect, onCleanup, splitProps, type Accessor, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { XIcon } from "lucide-solid";
import { isTopOverlay, registerOverlay } from "@hyperfocus/ui/primitives";
import { Button } from "./button";
import { ensureOverlayRoot } from "./overlay-root";

let modalSequence = 0;

const styles = stylex.create({
  backdrop: {
    inset: 0,
    padding: "24px",
    alignItems: "center",
    backgroundColor: "rgba(2, 6, 12, 0.72)",
    display: "flex",
    justifyContent: "center",
    position: "fixed",
    zIndex: 30,
  },
  panel: {
    padding: "16px",
    borderColor: "rgba(93, 141, 184, 0.32)",
    borderRadius: "18px",
    borderStyle: "solid",
    borderWidth: "1px",
    gap: "16px",
    overflow: "auto",
    backgroundColor: "rgba(8, 15, 26, 0.98)",
    backgroundImage: "linear-gradient(180deg, rgba(16, 26, 40, 0.96), rgba(8, 15, 26, 0.98))",
    boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.03), 0 24px 48px rgba(0, 0, 0, 0.36)",
    display: "flex",
    flexDirection: "column",
    maxHeight: "calc(100vh - 48px)",
  },
  sizeSm: { width: "min(420px, 100%)" },
  sizeMd: { width: "min(640px, 100%)" },
  sizeLg: { width: "min(880px, 100%)" },
  header: { gap: "12px", alignItems: "flex-start", display: "flex", justifyContent: "space-between", },
  headerCopy: { gap: "4px", display: "flex", flexDirection: "column", },
  heading: { margin: 0, color: "#eefaff", fontSize: "1rem" },
  description: { margin: 0, color: "rgba(196, 223, 242, 0.74)", fontSize: "0.92rem" },
  closeButton: {
    borderColor: "rgba(104, 156, 194, 0.28)",
    borderRadius: "12px",
    backgroundColor: "rgba(10, 19, 31, 0.88)",
    color: "#eefaff",
    minHeight: "34px",
    minWidth: "34px",
  },
  body: { gap: "12px", display: "flex", flexDirection: "column", minWidth: 0, },
  footer: { gap: "12px", display: "flex", justifyContent: "flex-end", },
});

/**
 * Props for Modal.
 */
export type ModalProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "children" | "title"> & {
  /** Controlled open state. */
  open: boolean;
  /** Called when the modal requests to close. */
  onClose: () => void;
  /** Optional heading text rendered in the modal header. */
  title?: string;
  /** Optional secondary copy rendered below the heading. */
  description?: string;
  /** Optional footer content rendered below the body. */
  footer?: JSX.Element;
  /** Modal body content. */
  children: JSX.Element;
  /** Width preset for the panel. */
  size?: "sm" | "md" | "lg";
  /** Closes the modal when the backdrop is clicked. Defaults to `true`. */
  closeOnBackdrop?: boolean;
  /** Closes the modal when Escape is pressed. Defaults to `true`. */
  closeOnEscape?: boolean;
  /** Optional element ref getter to focus when the modal opens. */
  initialFocusRef?: Accessor<HTMLElement | undefined>;
};

/**
 * Returns focusable descendants inside a modal panel.
 */
export function getModalFocusableElements(root: HTMLElement) {
  const candidates = root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );

  return [...candidates].filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
}

/**
 * Resolves the next focus target while trapping tab navigation inside the modal.
 */
export function resolveModalTabTarget(focusable: HTMLElement[], activeElement: HTMLElement | null, shiftKey: boolean) {
  if (focusable.length === 0) {
    return null;
  }

  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (shiftKey && activeElement === first) {
    return last;
  }
  if (!shiftKey && activeElement === last) {
    return first;
  }

  return null;
}

/** Modal renders a shared PadPilot dialog shell with focus trapping and standard close behavior. */
export function Modal(props: ModalProps) {
  const [local, others] = splitProps(props, [
    "children",
    "class",
    "closeOnBackdrop",
    "closeOnEscape",
    "description",
    "footer",
    "initialFocusRef",
    "onClose",
    "open",
    "size",
    "title",
  ]);
  const overlayId = `padpilot-modal-${++modalSequence}`;
  let panelRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (!local.open) {
      return;
    }

    let active = true;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unregister = registerOverlay({
      id: overlayId,
      close: () => {
        if (local.closeOnEscape !== false) {
          local.onClose();
        }
      },
    });
    queueMicrotask(() => {
      if (!active || !local.open) {
        return;
      }
      const initialFocus = local.initialFocusRef?.();
      if (initialFocus) {
        initialFocus.focus();
        return;
      }

      const panel = panelRef;
      if (!panel) {
        return;
      }

      (getModalFocusableElements(panel)[0] ?? panel).focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !panelRef || !isTopOverlay(overlayId)) {
        return;
      }

      const focusable = getModalFocusableElements(panelRef);
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const target = resolveModalTabTarget(focusable, activeElement, event.shiftKey);
      if (focusable.length === 0 || target) {
        event.preventDefault();
        target?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      active = false;
      unregister();
      window.removeEventListener("keydown", onKeyDown);
      queueMicrotask(() => {
        if (previousFocus?.isConnected) {
          previousFocus.focus();
        }
      });
    });
  });

  return (
    <Show when={local.open}>
      <Portal mount={ensureOverlayRoot()}>
        <div
          {...stylex.attrs(styles.backdrop)}
          onClick={(event) => {
            if (
              local.closeOnBackdrop === false ||
              event.target !== event.currentTarget ||
              !isTopOverlay(overlayId)
            ) {
              return;
            }
            local.onClose();
          }}
        >
          <div
            {...others}
            ref={panelRef}
            class={`${stylex.attrs(
              styles.panel,
              styles[local.size === "sm" ? "sizeSm" : local.size === "lg" ? "sizeLg" : "sizeMd"],
            ).class} ${local.class ?? ""}`.trim()}
            role="dialog"
            aria-modal="true"
            aria-label={local.title ?? (others["aria-label"])}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <header {...stylex.attrs(styles.header)}>
              <div {...stylex.attrs(styles.headerCopy)}>
                <Show when={local.title}>
                  <h3 {...stylex.attrs(styles.heading)}>{local.title}</h3>
                </Show>
                <Show when={local.description}>
                  <p {...stylex.attrs(styles.description)}>{local.description}</p>
                </Show>
              </div>
              <Button class={stylex.props(styles.closeButton).className} onClick={local.onClose} icon={XIcon} tooltip="Close modal" variant="ghost" />
            </header>
            <div {...stylex.attrs(styles.body)}>{local.children}</div>
            <Show when={local.footer}>
              <footer {...stylex.attrs(styles.footer)}>{local.footer}</footer>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
