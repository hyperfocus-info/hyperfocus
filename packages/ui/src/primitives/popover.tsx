import * as stylex from "@stylexjs/stylex";
import { createSignal, Show, type JSX } from "solid-js";
import { tokens } from "../theme/tokens.stylex";

export function Popover(props: { trigger: (toggle: () => void) => JSX.Element; children: JSX.Element }) {
  const [open, setOpen] = createSignal(false);
  return (
    <div {...stylex.attrs(styles.root)} data-test-popover="">
      {props.trigger(() => setOpen((value) => !value))}
      <Show when={open()}><div {...stylex.attrs(styles.content)}>{props.children}</div></Show>
    </div>
  );
}

const styles = stylex.create({
  root: { display: "inline-flex", position: "relative" },
  content: { padding: "0.6rem", borderColor: tokens.border, borderRadius: tokens.radius, borderStyle: "solid", borderWidth: "1px", backgroundColor: tokens.panelRaised, boxShadow: tokens.shadow, insetInlineEnd: 0, position: "absolute", zIndex: 120, minWidth: "14rem", top: "calc(100% + 0.4rem)", }
});

