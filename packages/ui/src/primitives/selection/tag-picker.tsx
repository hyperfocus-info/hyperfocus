import * as stylex from "@stylexjs/stylex";
import { For, Show, createMemo, createSignal } from "solid-js";
import { CheckboxField } from "../../form/form";
import { Input } from "../../form/input";
import { tokens } from "../../theme/tokens.stylex";
import { Button } from "../button";
import { Popover } from "../popover";

export type TagPickerProps = {
  ariaLabel: string;
  options: readonly { value: string; label: string; disabled?: boolean }[];
  value: readonly string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
};

const styles = stylex.create({
  root: { gap: tokens.space1, alignItems: "center", display: "flex", flexWrap: "wrap", minWidth: 0, },
  content: { gap: tokens.space2, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "min(28rem, calc(100dvh - 24px))", width: "min(22rem, calc(100vw - 24px))", },
  list: { gap: tokens.space1, display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto", },
  row: { flexShrink: 0, overflowWrap: "anywhere", minHeight: tokens.controlTouch, },
});

/** Controlled multiple-choice filter; selection and persistence stay with the host. */
export function TagPicker(props: TagPickerProps) {
  const [query, setQuery] = createSignal("");
  const [open, setOpen] = createSignal(false);
  let dismiss: () => void = () => { setOpen(false); };
  let trigger: HTMLButtonElement | undefined;
  const options = createMemo(() => props.options.filter(option => option.label.toLocaleLowerCase().includes(query().trim().toLocaleLowerCase())));
  const remove = (value: string) => props.onChange(props.value.filter(item => item !== value));
  const toggle = (value: string) => props.value.includes(value) ? remove(value) : props.onChange([...props.value, value]);
  const removeChip = (value: string) => {
    remove(value);
    queueMicrotask(() => { if (document.activeElement === document.body) trigger?.focus(); });
  };
  const navigate = (event: KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type === "search" && event.key !== "ArrowDown") return;
    const content = target.closest('[role="dialog"]');
    const rows = Array.from(content?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:not(:disabled)') ?? []);
    if (!rows.length) return;
    const index = rows.indexOf(target);
    const next = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : event.key === "ArrowUp" ? Math.max(0, index - 1) : Math.min(rows.length - 1, index + 1);
    event.preventDefault();
    rows[next]?.focus();
  };
  return <div {...stylex.attrs(styles.root)}>
    <Popover ariaLabel={props.ariaLabel} autoFocus open={open()} onOpenChange={value => { setOpen(value); if (!value) setQuery(""); }} align="start" contentClass={stylex.attrs(styles.content).class} onContentKeyDown={navigate}
      trigger={(toggleOpen, state) => { dismiss = () => state.close(); return <Button ref={trigger} variant="secondary" disabled={props.disabled} aria-label={props.ariaLabel} justificationForNoTooltip="The visible label names the tag collection" onClick={toggleOpen}>{props.ariaLabel}{props.value.length ? ` (${props.value.length})` : ""}</Button>; }}>
      <Show when={props.options.length > 8}>
        <Input type="search" aria-label={`Search ${props.ariaLabel.toLocaleLowerCase()}`} placeholder="Search tags" value={query()} onInput={event => setQuery(event.currentTarget.value)} />
      </Show>
      <div {...stylex.attrs(styles.list)} role="group" aria-label={`${props.ariaLabel} choices`}>
        <For each={options()} fallback={<p role="status">No matching tags.</p>}>{option =>
          <CheckboxField label={option.label} class={stylex.attrs(styles.row).class}>
            <input type="checkbox" checked={props.value.includes(option.value)} disabled={props.disabled || option.disabled} onChange={event => { toggle(option.value); event.currentTarget.checked = props.value.includes(option.value); }} />
          </CheckboxField>
        }</For>
      </div>
      <Button variant="primary" justificationForNoTooltip="Visible dismissal action" onClick={() => dismiss()}>Done</Button>
    </Popover>
    <For each={props.value}>{value => <Button variant="secondary" size="small" disabled={props.disabled || props.options.find(option => option.value === value)?.disabled} aria-label={`Remove ${props.options.find(option => option.value === value)?.label ?? value}`} tooltip={`Remove ${props.options.find(option => option.value === value)?.label ?? value}`} onClick={() => removeChip(value)}>{props.options.find(option => option.value === value)?.label ?? value} ×</Button>}</For>
  </div>;
}
