import * as stylex from "@stylexjs/stylex";
import { controlStyles as styles } from "./controls.stylex";

/**
 * Select option descriptor for Dropdown.
 */
export type DropdownOption = { value: string; label: string };

/**
 * Props for Dropdown.
 */
export type DropdownProps = {
  /** Currently selected option value */
  value: string;
  /** Optional text label shown above the select */
  label?: string;
  /** Available selectable options */
  options: DropdownOption[];
  /** Callback fired when selection changes */
  onChange: (value: string) => void;
};

/**
 * Dropdown renders a labeled select control.
 */
export function Dropdown(props: DropdownProps) {
  return (
    <label {...stylex.attrs(styles.label)}>
      <span>{props.label ?? ""}</span>
      <select
        {...stylex.attrs(styles.select)}
        value={props.value}
        onInput={(event) => props.onChange(event.currentTarget.value)}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      >
        {props.options.map((option) => (
          <option value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
