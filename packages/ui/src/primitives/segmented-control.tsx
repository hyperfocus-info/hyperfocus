import * as stylex from "@stylexjs/stylex";
import { For, type JSX } from "solid-js";
import { tokens } from "../theme/tokens.stylex";
import { sharedStyles } from "../theme/styles";
import { typography } from "../theme/typography";

export type SegmentedControlOption<Value extends string = string> = {
  value: Value;
  label: JSX.Element;
  disabled?: boolean;
};

export type SegmentedControlProps<Value extends string = string> = {
  value: Value;
  options: readonly SegmentedControlOption<Value>[];
  onValueChange: (value: Value) => void;
  ariaLabel: string;
  describedBy?: string;
  orientation?: "horizontal" | "vertical";
  disabled?: boolean;
  class?: string;
};

const styles = stylex.create({
  root: {
    padding: "2px",
    borderColor: tokens.border,
    borderRadius: tokens.radius,
    borderStyle: "solid",
    borderWidth: "1px",
    gap: "2px",
    backgroundColor: tokens.panel,
    display: "inline-flex",
    maxWidth: "100%",
    minWidth: 0,
  },
  horizontal: { flexDirection: "row", flexWrap: "wrap" },
  vertical: { flexDirection: "column" },
  segment: {
    borderColor: "transparent",
    borderRadius: tokens.radiusSmall,
    borderStyle: "solid",
    borderWidth: "1px",
    paddingBlock: tokens.space1,
    paddingInline: tokens.space2,
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": tokens.panelRaised },
    color: { default: tokens.muted, ":hover": tokens.foreground },
    cursor: "pointer",
    display: "inline-flex",
    flexBasis: 'auto',
    flexGrow: '1',
    flexShrink: '1',
    justifyContent: "center",
    opacity: { default: 1, ":disabled": 0.48 },
    overflowWrap: "anywhere",
    minHeight: { default: tokens.controlCompact, "@media (pointer: coarse)": tokens.controlTouch },
    minWidth: 0,
  },
  selected: {
    borderColor: tokens.accent,
    backgroundColor: tokens.selection,
    color: tokens.foreground,
  },
});

function enabledSegments(group: HTMLDivElement) {
  return [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]')].filter((item) => !item.disabled);
}

export function SegmentedControl<Value extends string = string>(props: SegmentedControlProps<Value>) {
  const orientation = () => props.orientation ?? "horizontal";

  const onKeyDown: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
    if (!(event.target instanceof HTMLButtonElement) || event.target.getAttribute("role") !== "radio") return;
    const segments = enabledSegments(event.currentTarget);
    const currentIndex = segments.indexOf(event.target);
    if (currentIndex < 0 || segments.length === 0) return;

    let nextIndex: number | undefined;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = segments.length - 1;
    if (orientation() === "horizontal") {
      if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % segments.length;
      if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + segments.length) % segments.length;
    } else {
      if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % segments.length;
      if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + segments.length) % segments.length;
    }
    if (nextIndex === undefined) return;

    event.preventDefault();
    const next = segments[nextIndex];
    const nextValue = props.options.find((option) => option.value === next.dataset.segmentValue)?.value;
    if (!nextValue) return;
    for (const segment of segments) segment.tabIndex = segment === next ? 0 : -1;
    next.focus();
    props.onValueChange(nextValue);
  };

  return (
    <div
      {...stylex.attrs(styles.root, orientation() === "vertical" ? styles.vertical : styles.horizontal)}
      classList={{ [props.class ?? ""]: Boolean(props.class) }}
      role="radiogroup"
      aria-label={props.ariaLabel}
      aria-describedby={props.describedBy}
      aria-orientation={orientation()}
      aria-disabled={props.disabled || undefined}
      onKeyDown={onKeyDown}
    >
      <For each={props.options}>{(option) => {
        const selected = () => option.value === props.value;
        const disabled = () => Boolean(props.disabled || option.disabled);
        return (
          <button
            {...stylex.attrs(typography.control, styles.segment, sharedStyles.focusRing, selected() ? styles.selected : undefined)}
            type="button"
            role="radio"
            aria-checked={selected()}
            data-segment-value={option.value}
            disabled={disabled()}
            tabIndex={selected() && !disabled() ? 0 : -1}
            onClick={() => {
              if (!disabled()) props.onValueChange(option.value);
            }}
          >
            {option.label}
          </button>
        );
      }}</For>
    </div>
  );
}
