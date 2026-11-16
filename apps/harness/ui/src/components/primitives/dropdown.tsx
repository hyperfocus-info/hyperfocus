import { Button, SelectControl, type SelectOption } from "@hyperfocus/ui";
import type { JSX } from "solid-js";

type DropdownOption<TValue extends string = string> = SelectOption<TValue>;

type DropdownSelectProps<TValue extends string = string> = {
  kind: "select";
  icon: JSX.Element;
  ariaLabel: string;
  class?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  dataAttributes?: Record<string, string>;
  value: TValue;
  options: DropdownOption<TValue>[];
  onChange: (value: TValue) => void;
  hideWhenSingleOption?: boolean;
  popoverSide?: "top" | "right" | "bottom" | "left";
  popoverAlign?: "start" | "center" | "end";
  contentClass?: string;
};

type DropdownTriggerProps = {
  kind: "trigger";
  icon: JSX.Element;
  ariaLabel: string;
  label: string;
  class?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  dataAttributes?: Record<string, string>;
  onClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  type?: "button" | "submit" | "reset";
};

/** Harness compatibility wrapper for the shared descriptive selection control. */
export function DropdownControl<TValue extends string = string>(props: DropdownSelectProps<TValue> | DropdownTriggerProps) {
  if (props.kind === "trigger") {
    return (
      <Button
        {...props.dataAttributes}
        class={props.class}
        variant="secondary"
        size={props.size === "md" ? "medium" : "small"}
        tooltip={props.ariaLabel}
        aria-label={props.ariaLabel}
        disabled={props.disabled}
        onClick={props.onClick}
        type={props.type ?? "button"}
      >
        <span aria-hidden="true">{props.icon}</span>
        <span>{props.label}</span>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" /></svg>
      </Button>
    );
  }
  return (
    <SelectControl
      ariaLabel={props.ariaLabel}
      icon={props.icon}
      class={props.class}
      contentClass={props.contentClass}
      size={props.size}
      disabled={props.disabled}
      dataAttributes={props.dataAttributes}
      invalid={props.invalid}
      describedBy={props.describedBy}
      value={props.value}
      options={props.options}
      onChange={props.onChange}
      hideWhenSingleOption={props.hideWhenSingleOption}
      placement={props.popoverSide === "top" ? "top" : "bottom"}
      align={props.popoverAlign}
    />
  );
}

export type { DropdownOption };
