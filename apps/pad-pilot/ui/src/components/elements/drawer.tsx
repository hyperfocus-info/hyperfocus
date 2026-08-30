import { Show, createEffect, onCleanup, splitProps, type Accessor, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { XIcon } from "lucide-solid";
import { isTopOverlay, registerOverlay } from "@hyperfocus/ui/primitives";
import { Button } from "./button";
import { joinElementClasses as joinClasses } from "./element-helpers";
import { ensureOverlayRoot } from "./overlay-root";
import styles from "./styles/drawer.stylex";

let drawerSequence = 0;

export type DrawerClassNames = {
  body?: string;
  closeButton?: string;
  footer?: string;
  header?: string;
  panel?: string;
  root?: string;
  scrim?: string;
};

/**
 * Props for Drawer.
 */
export type DrawerProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "children" | "title" | "onChange"> & {
  /** Controlled open state. */
  open: boolean;
  /** Edge the drawer anchors to. */
  edge?: "left" | "right" | "top" | "bottom";
  /** Called when the drawer requests an open-state change. */
  onOpenChange?: (open: boolean) => void;
  /** Optional heading text rendered in the drawer header. */
  title?: string;
  /** Optional secondary copy rendered below the heading. */
  description?: string;
  /** Optional footer content rendered after the body. */
  footer?: JSX.Element;
  /** Drawer body content. */
  children: JSX.Element;
  /** Optional element ref getter to focus when the drawer opens. */
  initialFocusRef?: Accessor<HTMLElement | undefined>;
  /** Whether to render a close button. Defaults to `true`. */
  closeable?: boolean;
  /** Whether a dismiss scrim should be shown behind the panel. */
  showScrim?: boolean;
  /** If a scrim is shown, whether clicking it closes the drawer. Defaults to `true`. */
  closeOnScrim?: boolean;
  /** Keeps the drawer mounted while closed so CSS animations can run. Defaults to `true`. */
  keepMounted?: boolean;
  /** Width/height preset for the drawer panel. */
  size?: "sm" | "md" | "lg";
  /** Accessible label for the close button. */
  closeLabel?: string;
  /** Optional slot-level classes for internal parts. */
  classNames?: DrawerClassNames;
};

/** Drawer renders an edge-anchored controlled panel without forcing modal semantics. */
export function Drawer(props: DrawerProps) {
  const [local, others] = splitProps(props, [
    "children",
    "class",
    "classNames",
    "closeable",
    "closeLabel",
    "closeOnScrim",
    "description",
    "edge",
    "footer",
    "initialFocusRef",
    "keepMounted",
    "onOpenChange",
    "open",
    "showScrim",
    "size",
    "title",
  ]);

  const overlayId = `padpilot-drawer-${++drawerSequence}`;
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
        if (local.closeable !== false) {
          local.onOpenChange?.(false);
        }
      },
    });
    queueMicrotask(() => {
      if (active && local.open) {
        const initialFocus = local.initialFocusRef?.();
        const firstFocusable = panelRef?.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        (initialFocus ?? firstFocusable ?? panelRef)?.focus();
      }
    });
    onCleanup(() => {
      active = false;
      unregister();
      queueMicrotask(() => {
        if (previousFocus?.isConnected) {
          previousFocus.focus();
        }
      });
    });
  });

  const shouldRender = () => local.keepMounted !== false || local.open;

  return (
    <Show when={shouldRender()}>
      <Portal mount={ensureOverlayRoot()}>
        <div
          class={joinClasses(styles.root, local.class, local.classNames?.root)}
          data-open={local.open ? "true" : "false"}
        >
          <Show when={local.showScrim}>
            <button
              type="button"
              class={joinClasses(styles.scrim, local.classNames?.scrim)}
              aria-hidden="true"
              tabIndex={-1}
              onClick={() => {
                if (local.closeOnScrim === false || !isTopOverlay(overlayId)) {
                  return;
                }
                local.onOpenChange?.(false);
              }}
            />
          </Show>
          <div
            {...others}
            ref={panelRef}
            role="complementary"
            aria-hidden={local.open ? "false" : "true"}
            class={joinClasses(styles.panel, local.classNames?.panel)}
            data-edge={local.edge ?? "right"}
            data-size={local.size ?? "md"}
            tabIndex={-1}
          >
            <Show when={local.title || local.description || local.closeable !== false}>
              <header class={joinClasses(styles.header, local.classNames?.header)}>
                <div class={styles["header-copy"]}>
                  <Show when={local.title}>
                    <h3 class={styles["header-copy-h3"]}>{local.title}</h3>
                  </Show>
                  <Show when={local.description}>
                    <p class={styles["header-copy-p"]}>{local.description}</p>
                  </Show>
                </div>
                <Show when={local.closeable !== false}>
                  <Button
                    class={joinClasses(styles["close-button"], local.classNames?.closeButton)}
                    icon={XIcon}
                    onClick={() => local.onOpenChange?.(false)}
                    tooltip={local.closeLabel ?? "Close drawer"}
                    variant="ghost"
                  />
                </Show>
              </header>
            </Show>
            <div class={joinClasses(styles.body, local.classNames?.body)}>{local.children}</div>
            <Show when={local.footer}>
              <footer class={joinClasses(styles.footer, local.classNames?.footer)}>{local.footer}</footer>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
