import { clamp } from "@hyperfocus/utilities/math";
import * as stylex from "@stylexjs/stylex";
import { createEffect, createSignal, createUniqueId, onCleanup, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { tokens } from "../theme/tokens.stylex";
import { typography } from "../theme/typography";
import { createTooltipInteraction } from "./tooltip/interaction";

const TOOLTIP_WIDTH = 288;
const TOOLTIP_GAP = 8;
const styles = stylex.create({
  trigger: { display: "inline-flex", maxWidth: "100%", minWidth: 0 },
  surface: {
    borderColor: tokens.border, borderRadius: tokens.radiusSmall, borderStyle: "solid", borderWidth: tokens.borderWidth,
    paddingBlock: tokens.space1, paddingInline: tokens.space2, backgroundColor: tokens.overlay, boxShadow: tokens.shadow, color: tokens.foreground,
  },
  content: {
    boxSizing: "border-box", overflowWrap: "anywhere", pointerEvents: "auto", position: "fixed", zIndex: 1000,
    maxWidth: `min(${TOOLTIP_WIDTH}px, calc(100vw - ${TOOLTIP_GAP * 2}px))`, width: "max-content",
  },
});

export type TooltipPlacement = "top" | "right" | "bottom" | "left";
export type TooltipTriggerBindings = {
  ref: (element: HTMLElement) => void;
  onFocusIn: () => void;
  onFocusOut: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
};
export type TooltipProps = {
  placement?: TooltipPlacement;
  id?: string;
  content?: string;
  children?: JSX.Element;
  delay?: number;
  class?: string;
  disabled?: boolean;
  /** Host skin only; positioning, hover, descriptions and dismissal remain shared. */
  contentClass?: string;
  mount?: () => HTMLElement;
  triggerTestId?: string;
  /** Spatial controls can keep their original DOM geometry. */
  renderTrigger?: (bindings: TooltipTriggerBindings) => JSX.Element;
};

export function Tooltip(props: TooltipProps) {
  const id = props.id ?? `hf-tooltip-${createUniqueId()}`;
  const [open, setOpen] = createSignal(false);
  const [position, setPosition] = createSignal({ left: 0, top: 0 });
  let target: HTMLElement | undefined;
  let anchor: HTMLElement | undefined;
  let content: HTMLSpanElement | undefined;
  const triggerFor = (element: HTMLElement) => element.matches('button,a,input,[role="button"],[tabindex]') ? element
    : element.querySelector<HTMLElement>('button,a,input,[role="button"],[tabindex]') ?? element;
  const updatePosition = () => {
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const width = content?.getBoundingClientRect().width || Math.min(TOOLTIP_WIDTH, window.innerWidth - TOOLTIP_GAP * 2);
    const height = content?.getBoundingClientRect().height ?? 56;
    const requested = props.placement ?? "bottom";
    const fits = { top: rect.top >= height + TOOLTIP_GAP, bottom: window.innerHeight - rect.bottom >= height + TOOLTIP_GAP,
      left: rect.left >= width + TOOLTIP_GAP, right: window.innerWidth - rect.right >= width + TOOLTIP_GAP };
    const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" } as const;
    const side = fits[requested] ? requested : opposite[requested];
    const left = clamp(side === "left" ? rect.left - width - TOOLTIP_GAP : side === "right" ? rect.right + TOOLTIP_GAP : rect.left + (rect.width - width) / 2, TOOLTIP_GAP, window.innerWidth - width - TOOLTIP_GAP);
    const top = clamp(side === "top" ? rect.top - height - TOOLTIP_GAP : side === "bottom" ? rect.bottom + TOOLTIP_GAP : rect.top + (rect.height - height) / 2, TOOLTIP_GAP, window.innerHeight - height - TOOLTIP_GAP);
    setPosition({ left, top });
  };
  const interaction = createTooltipInteraction({
    id, enabled: () => Boolean(props.content && !props.disabled), delay: () => props.delay ?? 350, content: () => content,
    show: element => { target = element; updatePosition(); setOpen(true); queueMicrotask(updatePosition); },
    hide: () => setOpen(false),
  });
  const bindings: TooltipTriggerBindings = {
    ref: element => { anchor = element; },
    onMouseEnter: () => { if (anchor) interaction.pointerEnter(triggerFor(anchor)); },
    onMouseLeave: interaction.pointerLeave,
    onFocusIn: () => { if (anchor) interaction.focusIn(triggerFor(anchor)); },
    onFocusOut: interaction.focusOut,
    onClick: interaction.dismiss,
  };
  createEffect(() => { if (!props.content || props.disabled) interaction.dismiss(); });
  createEffect(() => {
    if (!open()) return;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const observer = new ResizeObserver(updatePosition);
    if (content) observer.observe(content);
    onCleanup(() => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    });
  });
  onCleanup(interaction.dispose);
  const bubble = () => <Show when={open()}>
    <Portal mount={target?.closest<HTMLElement>('dialog[open]') ?? props.mount?.()}>
      <span ref={content} id={id} role="tooltip"
        class={`${stylex.attrs(typography.caption, styles.content, !props.contentClass && styles.surface).class ?? ""} ${props.contentClass ?? ""}`.trim()}
        style={{ left: `${position().left}px`, top: `${position().top}px` }} data-test-tooltip="" data-test-tooltip-content=""
        onMouseEnter={interaction.contentEnter} onMouseLeave={interaction.contentLeave}>
        {props.content}
      </span>
    </Portal>
  </Show>;
  if (props.renderTrigger) return <>{props.renderTrigger(bindings)}{bubble()}</>;
  return <span ref={bindings.ref} class={`${stylex.attrs(styles.trigger).class ?? ""} ${props.class ?? ""}`.trim()}
    data-testid={props.triggerTestId} onMouseEnter={bindings.onMouseEnter} onMouseLeave={bindings.onMouseLeave}
    onFocusIn={bindings.onFocusIn} onFocusOut={bindings.onFocusOut} onClick={bindings.onClick}>
    {props.children}{bubble()}
  </span>;
}
