import { createEffect, createMemo, createSignal } from "solid-js";
import { SearchableCombobox } from "../../../components/elements/searchable-combobox";
import type { DropdownOption } from "../../../padpilot/types";
import styles from "./styles/fx-select-field.stylex";

export type FxSelectFieldProps = {
  label: string;
  options: DropdownOption[];
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
};

/** FxSelectField renders a compact searchable enum picker for FX controls. */
export function FxSelectField(props: FxSelectFieldProps) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const items = createMemo(() => props.options.map((option) => ({ id: option.value, label: option.label })));
  const selectedLabel = createMemo(() => items().find((item) => item.id === props.value)?.label ?? "");

  createEffect(() => {
    if (!open() && query() !== "") {
      setQuery("");
    }
  });

  return (
    <label
      class={styles.field}
      data-no-drag
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span>{props.label}</span>
      <SearchableCombobox
        class={styles.combobox}
        data-no-drag
        emptyText="No options match."
        items={items()}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) {
            setQuery("");
          }
        }}
        onQueryChange={setQuery}
        onSelect={(next) => {
          props.onChange(next);
          setQuery("");
          setOpen(false);
        }}
        open={open()}
        placeholder={selectedLabel() || props.placeholder || "Select option"}
        query={query()}
        selectedId={props.value}
        searchLabel={props.label}
        toggleLabel={`Browse ${props.label}`}
      />
    </label>
  );
}
