import * as stylex from "@stylexjs/stylex";
import { createEffect, createSignal, onCleanup, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { tokens } from "../theme/tokens.stylex";

const TOOLTIP_WIDTH = 288;
const TOOLTIP_GAP = 8;

const styles = stylex.create({
  trigger: { display: "inline-flex" },
  content: {
    borderColor: tokens.border,
    borderRadius: "6px",
    borderStyle: "solid",
    borderWidth: "1px",
    paddingBlock: "0.4rem",
    paddingInline: "0.55rem",
    backgroundColor: tokens.overlay,
    boxShadow: tokens.shadow,
    color: tokens.foreground,
    fontSize: "0.72rem",
    pointerEvents: "none",
    position: "fixed",
    transform: "translateX(-50%)",
    zIndex: 1000,
    maxWidth: `${TOOLTIP_WIDTH}px`,
  }
});

export function Tooltip(props: { id?: string; content: string; children: JSX.Element; delay?: number }) {
  const [open, setOpen] = createSignal(false);
  const [position, setPosition] = createSignal({ left: 0, top: 0 });
  let target: HTMLElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const updatePosition = () => {
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const left = Math.min(window.innerWidth - TOOLTIP_WIDTH / 2 - TOOLTIP_GAP, Math.max(TOOLTIP_WIDTH / 2 + TOOLTIP_GAP, rect.left + rect.width / 2));
    const estimatedHeight = 56;
    const top = rect.bottom + TOOLTIP_GAP + estimatedHeight > window.innerHeight
      ? Math.max(TOOLTIP_GAP, rect.top - TOOLTIP_GAP - estimatedHeight)
      : rect.bottom + TOOLTIP_GAP;
    setPosition({ left, top });
  };
  const show = (currentTarget: EventTarget | null, immediate = false) => {
    if (!(currentTarget instanceof HTMLElement)) return;
    target = currentTarget;
    clearTimeout(timer);
    const reveal = () => { updatePosition(); setOpen(true); };
    if (immediate || (props.delay ?? 350) === 0) reveal();
    else timer = setTimeout(reveal, props.delay ?? 350);
  };
  const hide = () => { clearTimeout(timer); setOpen(false); };

  createEffect(() => {
    if (!open()) return;
    const onViewportChange = () => updatePosition();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      document.removeEventListener("keydown", onKeyDown);
    });
  });
  onCleanup(() => clearTimeout(timer));

  return (
    <span
      {...stylex.attrs(styles.trigger)}
      onPointerEnter={(event) => show(event.currentTarget)}
      onPointerLeave={hide}
      onFocusIn={(event) => show(event.currentTarget, true)}
      onFocusOut={hide}
    >
      {props.children}
      <Show when={open()}>
        <Portal>
          <span
            id={props.id}
            role="tooltip"
            {...stylex.attrs(styles.content)}
            style={{ left: `${position().left}px`, top: `${position().top}px` }}
            data-test-tooltip=""
          >
            {props.content}
          </span>
        </Portal>
      </Show>
    </span>
  );
}
