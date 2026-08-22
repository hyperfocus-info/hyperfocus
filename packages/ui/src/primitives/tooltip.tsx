import * as stylex from "@stylexjs/stylex";
import { createSignal, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { tokens } from "../theme/tokens.stylex";

export function Tooltip(props: { content: string; children: JSX.Element }) {
  const [open, setOpen] = createSignal(false);
  const [position, setPosition] = createSignal({ left: 0, top: 0 });
  const show = (target: EventTarget | null) => {
    if (target instanceof HTMLElement) {
      const rect = target.getBoundingClientRect();
      setPosition({ left: rect.left + rect.width / 2, top: rect.bottom + 8 });
    }
    setOpen(true);
  };
  return (
    <span
      {...stylex.attrs(styles.trigger)}
      onPointerEnter={(event) => show(event.currentTarget)}
      onPointerLeave={() => setOpen(false)}
      onFocusIn={(event) => show(event.currentTarget)}
      onFocusOut={() => setOpen(false)}
    >
      {props.children}
      <Show when={open()}>
        <Portal>
          <span
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

const styles = stylex.create({
  trigger: { display: "inline-flex" },
  content: {
    borderColor: tokens.border,
    borderRadius: "6px",
    borderStyle: "solid",
    borderWidth: "1px",
    paddingBlock: "0.4rem",
    paddingInline: "0.55rem",
    backgroundColor: "#020708",
    boxShadow: tokens.shadow,
    color: tokens.foreground,
    fontSize: "0.72rem",
    pointerEvents: "none",
    position: "fixed",
    transform: "translateX(-50%)",
    zIndex: 1000,
    maxWidth: "18rem",
  }
});

