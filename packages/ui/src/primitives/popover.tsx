import * as stylex from "@stylexjs/stylex";
import { createEffect, createSignal, onCleanup, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { tokens } from "../theme/tokens.stylex";
import { isTopOverlay, registerOverlay } from "./overlay-stack";

let popoverSequence = 0;

export type PopoverState = {
  open: () => boolean;
  contentId: string;
  close: (options?: { restoreFocus?: boolean }) => void;
};

const focusableSelector = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

const styles = stylex.create({
  root: { display: "inline-flex" },
  content: { padding: tokens.space2, borderColor: tokens.border, borderRadius: tokens.radius, borderStyle: "solid", borderWidth: "1px", backgroundColor: tokens.overlay, boxShadow: tokens.shadow, color: tokens.foreground, position: "fixed", zIndex: 920, minWidth: "14rem", },
});

export function Popover(props: {
  trigger: (toggle: () => void, state: PopoverState) => JSX.Element;
  children: JSX.Element;
  ariaLabel?: string;
  autoFocus?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  portal?: boolean;
  contentRole?: "dialog" | "menu";
  onContentKeyDown?: JSX.EventHandler<HTMLDivElement, KeyboardEvent>;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = createSignal(props.defaultOpen ?? false);
  const open = () => props.open ?? internalOpen();
  const id = `hf-popover-${++popoverSequence}`;
  let triggerRoot: HTMLDivElement | undefined;
  let content: HTMLDivElement | undefined;
  let unregister: (() => void) | undefined;

  const setOpenState = (next: boolean) => {
    if (props.open === undefined) setInternalOpen(next);
    props.onOpenChange?.(next);
  };
  const close = (restoreFocus = false) => {
    setOpenState(false);
    if (restoreFocus) queueMicrotask(() => triggerRoot?.querySelector<HTMLElement>(focusableSelector)?.focus());
  };
  const toggle = () => setOpenState(!open());
  const updatePosition = () => {
    if (!triggerRoot || !content) return;
    const triggerRect = triggerRoot.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const gap = 6;
    const left = Math.max(gap, Math.min(window.innerWidth - contentRect.width - gap, triggerRect.right - contentRect.width));
    const below = triggerRect.bottom + gap;
    const top = below + contentRect.height <= window.innerHeight - gap ? below : Math.max(gap, triggerRect.top - contentRect.height - gap);
    content.style.left = `${left}px`;
    content.style.top = `${top}px`;
  };

  createEffect(() => {
    const trigger = triggerRoot?.querySelector<HTMLElement>(focusableSelector);
    trigger?.setAttribute("aria-controls", id);
    trigger?.setAttribute("aria-expanded", String(open()));
    trigger?.setAttribute("aria-haspopup", props.contentRole ?? "dialog");
    if (!open()) {
      unregister?.();
      unregister = undefined;
      return;
    }
    unregister = registerOverlay({ id, close: () => close(true) });
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !content?.contains(event.target) && !triggerRoot?.contains(event.target)) close();
    };
    const onViewportChange = () => updatePosition();
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    queueMicrotask(() => {
      updatePosition();
      if (props.autoFocus) content?.querySelector<HTMLElement>(focusableSelector)?.focus();
    });
    onCleanup(() => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      unregister?.();
      unregister = undefined;
    });
  });

  const popoverContent = () => (
    <Show when={open()}>
      <div
        ref={content}
        id={id}
        role={props.contentRole ?? "dialog"}
        aria-label={props.ariaLabel ?? "More actions"}
        {...stylex.attrs(styles.content)}
        onKeyDown={(event) => {
          props.onContentKeyDown?.(event);
          if (event.key === "Escape" && isTopOverlay(id)) close(true);
        }}
      >{props.children}</div>
    </Show>
  );

  return (
    <div ref={triggerRoot} {...stylex.attrs(styles.root)} data-test-popover="">
      {props.trigger(toggle, {
        open,
        contentId: id,
        close: (options) => close(options?.restoreFocus ?? true),
      })}
      {props.portal === false ? popoverContent() : <Portal>{popoverContent()}</Portal>}
    </div>
  );
}
