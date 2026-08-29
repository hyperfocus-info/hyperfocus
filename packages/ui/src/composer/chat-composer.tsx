import * as stylex from "@stylexjs/stylex";
import { For, type JSX } from "solid-js";
import { tokens } from "../theme/tokens.stylex";
import { Button } from "../primitives/button";

export type ComposerOption = { id: string; label: string; disabled?: boolean };

export type ChatComposerProps = {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  options?: {
    agents?: readonly ComposerOption[];
    modes?: readonly ComposerOption[];
    models?: readonly ComposerOption[];
  };
  selected?: { agent?: string; mode?: string; model?: string };
  onInput: (value: string) => void;
  onSubmit: () => void;
  onSelect?: (kind: "agent" | "mode" | "model", id: string) => void;
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
    padding: "0.8rem",
    borderWidth: 0,
    outline: "none",
    backgroundColor: "transparent",
    color: tokens.foreground,
    fontFamily: "inherit",
    fontSize: "0.84rem",
    lineHeight: 1.55,
    resize: "vertical",
    minHeight: "5.5rem",
  },
  footer: {
    padding: "0.45rem",
    borderColor: tokens.border,
    borderStyle: "solid",
    gap: "0.5rem",
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
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
  selectLabel: {
    gap: "0.3rem",
    alignItems: "center",
    color: tokens.muted,
    display: "flex",
    fontSize: "0.65rem",
  },
  select: {
    padding: "0.3rem",
    borderColor: tokens.border,
    borderRadius: "6px",
    borderStyle: "solid",
    borderWidth: "1px",
    backgroundColor: tokens.panelRaised,
    color: tokens.foreground,
    fontSize: "0.7rem",
    maxWidth: "9rem",
  },
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
            label="Mode"
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
        <Button
          tooltip={
            props.disabled
              ? "Connect a harness to send"
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
  if (!props.options?.length) return null;
  return (
    <label {...stylex.attrs(styles.selectLabel)}>
      <span>{props.label}</span>
      <select
        {...stylex.attrs(styles.select)}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      >
        <For each={props.options}>
          {(option) => (
            <option value={option.id} disabled={option.disabled}>
              {option.label}
            </option>
          )}
        </For>
      </select>
    </label>
  );
}
