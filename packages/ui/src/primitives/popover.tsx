import * as stylex from "@stylexjs/stylex";
import { createEffect, createMemo, createSignal, onCleanup, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { tokens } from "../theme/tokens.stylex";
import { isTopOverlay, registerOverlay } from "./overlay-stack";
import { bindContextMenu } from './context-menu';

let popoverSequence = 0;

export type PopoverState = {
  open: () => boolean;
  contentId: string;
  close: (options?: { restoreFocus?: boolean }) => void;
};

const focusableSelector = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

const styles = stylex.create({
  root: { display: "inline-flex" },
  content: { padding: tokens.space2, borderColor: tokens.border, borderRadius: tokens.radius, borderStyle: "solid", borderWidth: "1px", overflow: 'auto', backgroundColor: tokens.overlay, boxShadow: tokens.shadow, boxSizing: 'border-box', color: tokens.foreground, position: "fixed", zIndex: 920, maxHeight: 'calc(100dvh - 12px)', maxWidth: 'calc(100vw - 12px)', minWidth: "min(14rem, calc(100vw - 12px))", },
});

export function Popover(props: {
  trigger: (toggle: () => void, state: PopoverState) => JSX.Element;
  children: JSX.Element;
  ariaLabel?: string;
  autoFocus?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  portal?: boolean;
  contentRole?: "dialog" | "listbox" | "menu";
  triggerHasPopup?: "dialog" | "listbox" | "menu";
  class?: string;
  placement?: "top" | "bottom";
  align?: "start" | "center" | "end";
  contentClass?: string;
  onContentKeyDown?: JSX.EventHandler<HTMLDivElement, KeyboardEvent>;
  onOpenChange?: (open: boolean) => void;
  contextMenu?: boolean;
  contextTarget?: (trigger: HTMLElement) => HTMLElement | null | undefined;
}) {
  const [internalOpen, setInternalOpen] = createSignal(props.defaultOpen ?? false);
  const open = createMemo(() => props.open === undefined ? internalOpen() : props.open);
  const id = `hf-popover-${++popoverSequence}`;
  let triggerRoot: HTMLDivElement | undefined;
  let content: HTMLDivElement | undefined;
  let unregister: (() => void) | undefined;
  const [contextPoint, setContextPoint] = createSignal<{x:number;y:number} | undefined>();

  const setOpenState = (next: boolean) => {
    if (props.open === undefined) setInternalOpen(next);
    props.onOpenChange?.(next);
  };
  const close = (restoreFocus = false) => {
    setOpenState(false);
    if (restoreFocus) queueMicrotask(() => {
      const active = document.activeElement;
      // A host action can move focus into a new dialog before this return runs.
      if (active && active !== document.body && active !== document.documentElement && !triggerRoot?.contains(active) && !content?.contains(active)) return;
      triggerRoot?.querySelector<HTMLElement>(focusableSelector)?.focus();
    });
  };
  const toggle = () => { setContextPoint(undefined);setOpenState(!open()); };
  createEffect(() => {
    if (!props.contextMenu || !triggerRoot) return;
    const target = props.contextTarget?.(triggerRoot) ?? triggerRoot;
    onCleanup(bindContextMenu(target, request => {setContextPoint(request.point);setOpenState(true);}));
  });
  const updatePosition = () => {
    if (!triggerRoot || !content) return;
    const triggerRect = triggerRoot.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const gap = 6;
    const point = contextPoint();
    const rawLeft = point ? point.x : props.align === "start"
      ? triggerRect.left
      : props.align === "center"
        ? triggerRect.left + (triggerRect.width - contentRect.width) / 2
        : triggerRect.right - contentRect.width;
    const left = Math.max(gap, Math.min(window.innerWidth - contentRect.width - gap, rawLeft));
    const below = triggerRect.bottom + gap;
    const above = triggerRect.top - contentRect.height - gap;
    const spaceBelow = window.innerHeight - triggerRect.bottom - gap;
    const spaceAbove = triggerRect.top - gap;
    const preferTop = props.placement === "top";
    const useTop = preferTop
      ? contentRect.height <= spaceAbove || spaceAbove >= spaceBelow
      : contentRect.height > spaceBelow && spaceAbove > spaceBelow;
    const top = Math.max(gap, Math.min(window.innerHeight - contentRect.height - gap, point ? point.y : useTop ? above : below));
    content.style.left = `${left}px`;
    content.style.top = `${top}px`;
  };

  createEffect(() => {
    contextPoint();
    const trigger = triggerRoot?.querySelector<HTMLElement>('button, input, textarea, select, a[href], [tabindex]');
    trigger?.setAttribute("aria-controls", id);
    trigger?.setAttribute("aria-expanded", String(open()));
    trigger?.setAttribute("aria-haspopup", props.triggerHasPopup ?? props.contentRole ?? "dialog");
    if (!open()) {
      unregister?.();
      unregister = undefined;
      return;
    }
    unregister = registerOverlay({ id, close: () => close(true), element: () => content });
    const nativeModal = triggerRoot?.closest("dialog");
    const onModalClose = () => { if (!nativeModal?.open) close(); };
    nativeModal?.addEventListener("close", onModalClose);
    // Portaled child overlays own outside interactions until they close, like Escape.
    const onPointerDown = (event: PointerEvent) => {
      if (!isTopOverlay(id)) return;
      if (event.target instanceof Node && !content?.contains(event.target) && !triggerRoot?.contains(event.target)) close();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!isTopOverlay(id)) return;
      if (event.target instanceof Node && !content?.contains(event.target) && !triggerRoot?.contains(event.target)) close();
    };
    const onViewportChange = () => updatePosition();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(updatePosition);
    let disposed = false;
    queueMicrotask(() => {
      if (disposed) return;
      updatePosition();
      if (content) observer?.observe(content);
      if (triggerRoot) observer?.observe(triggerRoot);
      if (props.autoFocus) content?.querySelector<HTMLElement>(focusableSelector)?.focus();
    });
    onCleanup(() => {
      disposed = true;
      nativeModal?.removeEventListener("close", onModalClose);
      observer?.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
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
        class={`${stylex.attrs(styles.content).class} ${props.contentClass ?? ""}`.trim()}
        onKeyDown={(event) => {
          props.onContentKeyDown?.(event);
        }}
      >{props.children}</div>
    </Show>
  );

  return (
    <div
      ref={triggerRoot}
      {...stylex.attrs(styles.root)}
      class={`${stylex.attrs(styles.root).class ?? ""} ${props.class ?? ""}`.trim()}
      data-test-popover=""
    >
      {props.trigger(toggle, {
        open,
        contentId: id,
        close: (options) => close(options?.restoreFocus ?? true),
      })}
      {props.portal === false ? popoverContent() : <Show when={open()}><Portal mount={triggerRoot?.closest<HTMLDialogElement>("dialog[open]") ?? undefined}>{popoverContent()}</Portal></Show>}
    </div>
  );
}
