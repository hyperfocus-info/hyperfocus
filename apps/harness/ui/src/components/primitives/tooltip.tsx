import { createEffect, createSignal, onCleanup, Show, type JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { cn } from "../../lib/utils";
import { PrimitivePortal } from "./primitive-portal";

type TooltipProps = {
  content?: string;
  triggerClass?: string;
  children: JSX.Element;
  side?: "top" | "right" | "bottom" | "left";
  disabled?: boolean;
};

const styles = stylex.create({
  trigger: { display: "inline-flex" },
  content: {
    borderColor: "var(--border)",
    borderRadius: "0.5rem",
    borderStyle: "solid",
    borderWidth: "1px",
    paddingBlock: '0.375rem',
    paddingInline: '0.75rem',
    backgroundColor: "var(--foreground)",
    boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
    color: "var(--surface-foreground)",
    fontSize: "0.75rem",
    pointerEvents: "none",
    position: "fixed",
    textAlign: "center",
    whiteSpace: "pre-line",
    zIndex: 160,
    maxWidth: "20rem",
  }
});

export function Tooltip(props: TooltipProps) {
  let triggerRef: HTMLSpanElement | undefined;
  let tooltipRef: HTMLSpanElement | undefined;
  const [open, setOpen] = createSignal(false);
  const [position, setPosition] = createSignal({ top: 0, left: 0 });

  const updatePosition = () => {
    if (!triggerRef || !tooltipRef || !props.content) {
      return;
    }

    const triggerRect = triggerRef.getBoundingClientRect();
    const tooltipRect = tooltipRef.getBoundingClientRect();
    const viewportPadding = 12;
    const sideOffset = 10;
    const centeredLeft = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
    const centeredTop = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
    const fitsRight = triggerRect.right + sideOffset + tooltipRect.width <= window.innerWidth - viewportPadding;
    const fitsLeft = triggerRect.left - sideOffset - tooltipRect.width >= viewportPadding;
    const fitsBottom = triggerRect.bottom + sideOffset + tooltipRect.height <= window.innerHeight - viewportPadding;
    const preferredSide = props.side ?? "top";
    const resolvedSide =
      preferredSide === "right"
        ? fitsRight || !fitsLeft
          ? "right"
          : "left"
        : preferredSide === "left"
          ? fitsLeft || !fitsRight
            ? "left"
            : "right"
          : preferredSide === "bottom"
            ? fitsBottom
              ? "bottom"
              : "top"
            : "top";
    const nextTop =
      resolvedSide === "right" || resolvedSide === "left"
        ? Math.min(
            window.innerHeight - tooltipRect.height - viewportPadding,
            Math.max(viewportPadding, centeredTop)
          )
        : resolvedSide === "bottom"
          ? Math.min(
              window.innerHeight - tooltipRect.height - viewportPadding,
              Math.max(viewportPadding, triggerRect.bottom + sideOffset)
            )
          : Math.max(viewportPadding, triggerRect.top - tooltipRect.height - sideOffset);
    const nextLeft =
      resolvedSide === "right"
        ? Math.min(
            window.innerWidth - tooltipRect.width - viewportPadding,
            Math.max(viewportPadding, triggerRect.right + sideOffset)
          )
        : resolvedSide === "left"
          ? Math.min(
              window.innerWidth - tooltipRect.width - viewportPadding,
              Math.max(viewportPadding, triggerRect.left - tooltipRect.width - sideOffset)
            )
          : Math.min(
              window.innerWidth - tooltipRect.width - viewportPadding,
              Math.max(viewportPadding, centeredLeft)
            );

    setPosition({
      top: nextTop,
      left: nextLeft
    });
  };

  createEffect(() => {
    if (!open()) {
      return;
    }

    queueMicrotask(updatePosition);
  });

  createEffect(() => {
    if (props.disabled && open()) {
      setOpen(false);
    }
  });

  const handleShow = () => {
    if (props.content && !props.disabled) {
      setOpen(true);
    }
  };

  const handleHide = () => {
    setOpen(false);
  };

  const onViewportChange = () => {
    if (open()) {
      updatePosition();
    }
  };

  window.addEventListener("scroll", onViewportChange, true);
  window.addEventListener("resize", onViewportChange);
  onCleanup(() => {
    window.removeEventListener("scroll", onViewportChange, true);
    window.removeEventListener("resize", onViewportChange);
  });

  const content = () => (
    <Show when={props.content && open()}>
      <span
        ref={tooltipRef}
        data-test-tooltip-content=""
        {...stylex.attrs(styles.content)}
        style={{
          top: `${position().top}px`,
          left: `${position().left}px`
        }}
      >
        {props.content}
      </span>
    </Show>
  );

  return (
    <span
      ref={triggerRef}
      data-test-tooltip=""
      class={cn(stylex.attrs(styles.trigger).class, props.triggerClass)}
      onMouseEnter={handleShow}
      onMouseLeave={handleHide}
      onFocusIn={handleShow}
      onFocusOut={handleHide}
      onClick={handleHide}
    >
      {props.children}
      <PrimitivePortal active={Boolean(props.content && open())} layer="tooltip">
        {content()}
      </PrimitivePortal>
    </span>
  );
}
