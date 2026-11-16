import * as stylex from "@stylexjs/stylex";
import { Index, Show, type Accessor } from "solid-js";
import { FormField, FormGrid } from "../form/form";
import { Input } from "../form/input";
import { Button } from "../primitives/button";
import { Disclosure } from "../primitives/disclosure/disclosure";
import { SelectControl } from "../primitives/selection/select-control";
import { tokens } from "../theme/tokens.stylex";

export type TaskRequestField = {
  id: string;
  label: string;
  value: string;
  kind: "text" | "multiline" | "number" | "choice";
  description?: string;
  options?: readonly { value: string; label: string; description?: string; disabled?: boolean }[];
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  required?: boolean;
  advanced?: boolean;
};

const styles = stylex.create({
  form: { gap: tokens.space3, display: "grid", minWidth: 0, },
  textarea: { padding: tokens.space2, borderColor: tokens.border, borderRadius: tokens.radiusSmall, borderStyle: "solid", borderWidth: tokens.borderWidth, outline: { default: "none", ":focus-visible": `2px solid ${tokens.focus}` }, backgroundColor: tokens.panelRaised, boxSizing: "border-box", color: tokens.foreground, fontFamily: tokens.fontUi, fontSize: tokens.fontBody, outlineOffset: 2, resize: "vertical", minHeight: "6rem", minWidth: 0, width: "100%", },
});

/** A bounded task form. Hosts supply field meanings, defaults, validation, and submission. */
export function TaskRequestForm(props: {
  fields: readonly TaskRequestField[];
  onChange: (id: string, value: string) => void;
  onSubmit: () => void;
  actionLabel: string;
  disabled?: boolean;
  submitDisabled?: boolean;
  disabledReason?: string;
}) {
  const field = (entry: Accessor<TaskRequestField>) => <FormField label={entry().label} description={entry().description}>
    <Show when={entry().kind === "multiline"} fallback={<Show when={entry().kind === "choice"} fallback={
      <Input aria-label={entry().label} type={entry().kind === "number" ? "number" : "text"} value={entry().value} min={entry().min} max={entry().max} step={entry().step} maxLength={entry().maxLength} required={entry().required} disabled={props.disabled} onInput={event => props.onChange(entry().id, event.currentTarget.value)} />
    }><SelectControl ariaLabel={entry().label} value={entry().value} options={entry().options ?? []} onChange={value => props.onChange(entry().id, value)} disabled={props.disabled} /></Show>}>
      <textarea {...stylex.attrs(styles.textarea)} aria-label={entry().label} value={entry().value} maxLength={entry().maxLength} required={entry().required} disabled={props.disabled} onInput={event => props.onChange(entry().id, event.currentTarget.value)} />
    </Show>
  </FormField>;
  return <form {...stylex.attrs(styles.form)} data-test-task-request-form="" onSubmit={event => { event.preventDefault(); props.onSubmit(); }}>
    <Index each={props.fields.filter(entry => !entry.advanced)}>{field}</Index>
    <Show when={props.fields.some(entry => entry.advanced)}><Disclosure title="Limits and execution settings"><FormGrid><Index each={props.fields.filter(entry => entry.advanced)}>{field}</Index></FormGrid></Disclosure></Show>
    <Button type="submit" variant={props.disabled || props.submitDisabled ? "secondary" : "primary"} tooltip={props.disabledReason ?? props.actionLabel} disabled={props.disabled || props.submitDisabled}>{props.actionLabel}</Button>
  </form>;
}
