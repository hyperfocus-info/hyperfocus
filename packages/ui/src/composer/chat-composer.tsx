import * as stylex from "@stylexjs/stylex";
import { Show, type JSX } from "solid-js";
import { tokens } from "../theme/tokens.stylex";
import { Button } from "../primitives/button";
import { SelectControl } from "../primitives/selection/select-control";

export type ComposerOption = {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  keywords?: readonly string[];
  tags?: readonly string[];
};

export type ChatComposerProps = {
  value: string;
  ariaLabel?: string;
  placeholder?: string;
  modeLabel?: string;
  disabled?: boolean;
  options?: {
    agents?: readonly ComposerOption[];
    providers?: readonly ComposerOption[];
    modes?: readonly ComposerOption[];
    models?: readonly ComposerOption[];
  };
  selected?: { agent?: string; provider?: string; mode?: string; model?: string };
  onInput: (value: string) => void;
  onSubmit: () => void;
  onSelect?: (kind: "agent" | "provider" | "mode" | "model", id: string) => void;
  leftControls?: JSX.Element;
};

const styles = stylex.create({
  root: {
    borderColor: tokens.border,
    borderRadius: tokens.radius,
    borderStyle: "solid",
    borderWidth: "1px",
    overflow: "hidden",
    backgroundColor: tokens.panel,
    display: "flex",
    flexDirection: "column",
  },
  input: {
    padding: tokens.space3,
    borderWidth: 0,
    outline: "none",
    backgroundColor: "transparent",
    boxSizing: "border-box",
    color: tokens.foreground,
    fontFamily: "inherit",
    fontSize: tokens.fontBody,
    lineHeight: 1.55,
    resize: "vertical",
    height: { default: "min(5.5rem, 18dvh)", "@media (max-width: 900px), (max-height: 640px)": "min(4rem, 12dvh)" },
    maxHeight: "30dvh",
    minHeight: "min(3rem, 12dvh)",
  },
  footer: {
    padding: "0.45rem",
    borderColor: tokens.border,
    borderStyle: "solid",
    gap: "0.5rem",
    alignItems: "center",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    borderBottomWidth: "0",
    borderLeftWidth: "0",
    borderRightWidth: "0",
    borderTopWidth: "1px",
  },
  selects: {
    gap: "0.4rem",
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    minWidth: 0,
  },
  selectGroup: {
    gap: "0.3rem",
    alignItems: "center",
    color: tokens.muted,
    display: "flex",
    fontSize: tokens.fontCaption,
  },
  select: { maxWidth: "10rem" },
});

export function ChatComposer(props: ChatComposerProps) {
  const submit = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!props.disabled && props.value.trim()) props.onSubmit();
  };
  return (
    <section {...stylex.attrs(styles.root)} data-test-chat-composer="">
      <textarea
        aria-label={props.ariaLabel ?? "Message"}
        {...stylex.attrs(styles.input)}
        value={props.value}
        placeholder={props.placeholder ?? "Ask about this workspace…"}
        disabled={props.disabled}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        onKeyDown={submit}
        rows={3}
      />
      <footer {...stylex.attrs(styles.footer)}>
        <div {...stylex.attrs(styles.selects)}>
          {props.leftControls}
          <ComposerSelect
            label="Agent"
            value={props.selected?.agent}
            options={props.options?.agents}
            onChange={(id) => props.onSelect?.("agent", id)}
          />
          <ComposerSelect
            label="Provider"
            value={props.selected?.provider}
            options={props.options?.providers}
            onChange={(id) => props.onSelect?.("provider", id)}
          />
          <ComposerSelect
            label={props.modeLabel ?? "Mode"}
            value={props.selected?.mode}
            options={props.options?.modes}
            onChange={(id) => props.onSelect?.("mode", id)}
          />
          <ComposerSelect
            label="Model"
            value={props.selected?.model}
            options={props.options?.models}
            onChange={(id) => props.onSelect?.("model", id)}
          />
        </div>
        <Button variant="primary"
          tooltip={
            props.disabled
              ? "AI is unavailable"
              : "Send message (Enter)"
          }
          disabled={props.disabled || !props.value.trim()}
          onClick={props.onSubmit}
        >
          Send
        </Button>
      </footer>
    </section>
  );
}

function ComposerSelect(props: {
  label: string;
  value?: string;
  options?: readonly ComposerOption[];
  onChange: (id: string) => void;
}) {
  return (
    <Show when={props.options?.length ? props.options : undefined}>{(options) =>
    <div {...stylex.attrs(styles.selectGroup)}>
      <span>{props.label}</span>
      <SelectControl
        ariaLabel={`Select ${props.label.toLocaleLowerCase()}`}
        class={stylex.attrs(styles.select).class}
        value={props.value ?? options()[0]!.id}
        options={options().map((option) => ({
          value: option.id,
          label: option.label,
          description: option.description,
          disabled: option.disabled,
          keywords: option.keywords,
          tags: option.tags,
        }))}
        onChange={props.onChange}
      />
    </div>
    }</Show>
  );
}
