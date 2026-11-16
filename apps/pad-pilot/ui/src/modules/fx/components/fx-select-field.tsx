import { createContext, useContext } from "solid-js";
import { createEffect, createMemo, createSignal } from "solid-js";
import { SearchableCombobox } from "../../../components/elements/searchable-combobox";
import { type DropdownOption } from "../../../components/elements/dropdown";
import styles from "./styles/fx-select-field.stylex";

export type FxSelectFieldProps = {
  label: string;
  options: DropdownOption[];
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
};

/** FxSelectField renders a compact searchable enum picker for FX controls. */
const ControlsContext = createContext<FxSelectFieldProps>();

export function FxSelectField(props: FxSelectFieldProps) {
  return <ControlsContext.Provider value={props}><FxSelectFieldContent /></ControlsContext.Provider>;
}

function FxSelectFieldContent() {
  const controls = useContext(ControlsContext);
  if (!controls) throw new Error("Missing FxSelectField controls");
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const items = createMemo(() => controls.options.map((option) => ({ id: option.value, label: option.label })));
  const selectedLabel = createMemo(() => items().find((item) => item.id === controls.value)?.label ?? "");

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
      <span>{controls.label}</span>
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
          controls.onChange(next);
          setQuery("");
          setOpen(false);
        }}
        open={open()}
        placeholder={selectedLabel() || controls.placeholder || "Select option"}
        query={query()}
        selectedId={controls.value}
        searchLabel={controls.label}
        toggleLabel={`Browse ${controls.label}`}
      />
    </label>
  );
}
