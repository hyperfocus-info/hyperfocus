import * as stylex from "@stylexjs/stylex";
import { Show, createSignal, createUniqueId, type JSX } from "solid-js";
import type { TooltipPlacement } from "./element-skin";
import { FloatingLayer } from "./floating-layer";

const styles = stylex.create({
  anchor: { display: "inline-flex" },
  bubble: {
    borderColor: "rgba(140, 196, 227, 0.24)",
    borderRadius: "8px",
    borderStyle: "solid",
    borderWidth: "1px",
    paddingBlock: "6px",
    paddingInline: "8px",
    backgroundColor: "rgba(7, 12, 21, 0.96)",
    boxShadow: "0 12px 26px rgba(0, 0, 0, 0.28)",
    color: "#edf6ff",
    fontSize: "11px",
    letterSpacing: "0.02em",
    lineHeight: 1.25,
    pointerEvents: "none",
    whiteSpace: "normal",
    maxWidth: "220px",
    minWidth: "max-content",
  },
});


export type TooltipProps = {
  /** The element to wrap with the tooltip trigger. */
  children?: JSX.Element;
  /** Tooltip content to show when hovered/focused. If undefined, no tooltip bubble is rendered. */
  content?: string;
  /** Tooltip positioning (e.g., "top", "bottom", etc.). Default: "top". */
  placement?: TooltipPlacement;
  /** Optional extra class names to add to anchor wrapper. */
  class?: string;
  /** Render the trigger directly when a layout wrapper would change its geometry. */
  renderTrigger?: (bindings: TooltipTriggerBindings) => JSX.Element;
};

export type TooltipTriggerBindings = {
  "aria-describedby": string;
  ref: (element: HTMLElement) => void;
  onFocusIn: () => void;
  onFocusOut: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

/** Tooltip wraps an element with a lightweight hover/focus bubble. */
export function Tooltip(props: TooltipProps) {
  const [isVisible, setIsVisible] = createSignal(false);
  const tooltipId = `padpilot-tooltip-${createUniqueId()}`;
  let anchorRef: HTMLElement | undefined;
  const bubbleClass = stylex.props(styles.bubble).className;

  const triggerBindings: TooltipTriggerBindings = {
    "aria-describedby": tooltipId,
    ref: (element) => {
      anchorRef = element;
    },
    onFocusIn: () => setIsVisible(true),
    onFocusOut: () => setIsVisible(false),
    onMouseEnter: () => setIsVisible(true),
    onMouseLeave: () => setIsVisible(false),
  };

  if (props.renderTrigger) {
    return (
      <>
        {props.renderTrigger(triggerBindings)}
        <Show when={props.content && isVisible()}>
          <FloatingLayer anchorRef={() => anchorRef} class={bubbleClass} id={tooltipId} open placement={props.placement} role="tooltip">
            {props.content}
          </FloatingLayer>
        </Show>
      </>
    );
  }

  return (
    <Show when={props.content} fallback={props.children}>
      <span
        aria-describedby={tooltipId}
        ref={anchorRef}
        class={`${stylex.attrs(styles.anchor).class} ${props.class ?? ""}`.trim()}
        data-placement={props.placement ?? "top"}
        data-testid="tooltip-container"
        onMouseEnter={triggerBindings.onMouseEnter}
        onMouseLeave={triggerBindings.onMouseLeave}
        onFocusIn={triggerBindings.onFocusIn}
        onFocusOut={triggerBindings.onFocusOut}
      >
        {props.children}
        <FloatingLayer anchorRef={() => anchorRef} class={bubbleClass} id={tooltipId} open={isVisible()} placement={props.placement} role="tooltip">
          {props.content}
        </FloatingLayer>
      </span>
    </Show>
  );
}
