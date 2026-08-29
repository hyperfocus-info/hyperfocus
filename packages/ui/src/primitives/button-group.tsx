import * as stylex from "@stylexjs/stylex";
import { createMemo, createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import { tokens } from "../theme/tokens.stylex";
import { Button } from "./button";
import { Popover } from "./popover";

export type ButtonGroupItem = {
  id: string;
  label: string;
  tooltip: string;
  icon?: JSX.Element;
  disabled?: boolean;
  disabledReason?: string;
  onSelect: () => void;
};

const styles = stylex.create({
  root: { gap: tokens.space1, overflow: "hidden", alignItems: "center", display: "flex", minWidth: 0, },
  menu: { gap: tokens.space1, display: "grid", minWidth: "12rem", },
});

export function ButtonGroup(props: { items: readonly ButtonGroupItem[]; primaryCount?: number; overflowLabel?: string }) {
  let root: HTMLDivElement | undefined;
  const minimumVisible = () => Math.min(props.items.length, Math.max(1, props.primaryCount ?? 1));
  const [visibleCount, setVisibleCount] = createSignal(minimumVisible());
  const visible = createMemo(() => props.items.slice(0, visibleCount()));
  const overflow = createMemo(() => props.items.slice(visibleCount()));

  const measure = () => {
    if (!root) return;
    const estimatedActionWidth = 78;
    const overflowWidth = 38;
    const capacity = Math.floor((root.clientWidth - overflowWidth) / estimatedActionWidth);
    setVisibleCount(Math.min(props.items.length, Math.max(minimumVisible(), capacity)));
  };
  onMount(() => {
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    if (root) observer.observe(root);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div ref={root} {...stylex.attrs(styles.root)} role="group" aria-label="Actions" data-test-button-group="">
      <For each={visible()}>{(item) => (
        <Button
          variant="ghost"
          size={item.icon ? "icon" : "small"}
          tooltip={item.disabled && item.disabledReason ? item.disabledReason : item.tooltip}
          aria-label={item.icon ? item.label : undefined}
          disabled={item.disabled}
          onClick={item.onSelect}
        >{item.icon ?? item.label}</Button>
      )}</For>
      <Show when={overflow().length > 0}>
        <Popover
          ariaLabel={props.overflowLabel ?? "More actions"}
          autoFocus
          trigger={(toggle) => <Button variant="ghost" size="icon" tooltip={props.overflowLabel ?? "More actions"} aria-label={props.overflowLabel ?? "More actions"} onClick={toggle}>•••</Button>}
        >
          <div {...stylex.attrs(styles.menu)} role="menu">
            <For each={overflow()}>{(item) => (
              <Button
                variant="ghost"
                size="small"
                tooltip={item.disabled && item.disabledReason ? item.disabledReason : item.tooltip}
                disabled={item.disabled}
                role="menuitem"
                onClick={item.onSelect}
              >{item.icon}<span>{item.label}</span></Button>
            )}</For>
          </div>
        </Popover>
      </Show>
    </div>
  );
}
