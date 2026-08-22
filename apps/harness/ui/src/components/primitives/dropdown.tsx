import { Check, ChevronDown } from "lucide-solid";
import { For, Show, createMemo, createSignal, type JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { cn } from "../../lib/utils";
import { Popover } from "./popover";
import { Tooltip } from "./tooltip";

type DropdownOption = {
  value: string;
  label: string;
  description?: string;
  icon?: JSX.Element;
  disabled?: boolean;
};

type DropdownBaseProps = {
  icon: JSX.Element;
  ariaLabel: string;
  class?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  dataAttributes?: Record<string, string>;
};

type DropdownSelectProps = DropdownBaseProps & {
  kind: "select";
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  hideWhenSingleOption?: boolean;
  popoverSide?: "top" | "right" | "bottom" | "left";
  popoverAlign?: "start" | "center" | "end";
  contentClass?: string;
};

type DropdownTriggerProps = DropdownBaseProps & {
  kind: "trigger";
  label: string;
  onClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  type?: "button" | "submit" | "reset";
};

export function DropdownControl(props: DropdownSelectProps | DropdownTriggerProps) {
  const size = () => props.size ?? "sm";

  if (props.kind === "select") {
    const [open, setOpen] = createSignal(false);
    const selectedOption = createMemo(
      () => props.options.find((option) => option.value === props.value) ?? props.options[0]
    );

    if (props.hideWhenSingleOption && props.options.length <= 1) {
      return null;
    }

    return (
      <Tooltip content={selectedOption()?.description} disabled={open()} side="top">
        <Popover
          open={open()}
          onClose={() => setOpen(false)}
          class={cn(stylex.attrs(styles.popoverRoot).class, props.class)}
          align={props.popoverAlign ?? "start"}
          side={props.popoverSide ?? "top"}
          contentClass={cn(stylex.attrs(styles.popoverContent).class, props.contentClass)}
          content={
            <div {...stylex.attrs(styles.options)}>
              <For each={props.options}>
                {(option) => {
                  const selected = () => selectedOption()?.value === option.value;
                  return (
                    <button
                      type="button"
                      class={cn(
                        stylex.attrs(styles.option, size() === "sm" ? styles.optionSmall : styles.optionMedium).class
                      )}
                      disabled={option.disabled}
                      onClick={() => {
                        if (option.disabled || option.value === props.value) {
                          setOpen(false);
                          return;
                        }
                        props.onChange(option.value);
                        setOpen(false);
                      }}
                    >
                      <span {...stylex.attrs(styles.optionIcon)}>
                        <Show when={option.icon}>{option.icon}</Show>
                      </span>
                      <span {...stylex.attrs(styles.optionCopy)}>
                        <span {...stylex.attrs(styles.optionLabel)}>{option.label}</span>
                        <Show when={option.description}>
                          <span {...stylex.attrs(styles.optionDescription)}>{option.description}</span>
                        </Show>
                      </span>
                      <Show when={selected()}>
                        <Check {...stylex.attrs(styles.check)} />
                      </Show>
                    </button>
                  );
                }}
              </For>
            </div>
          }
        >
          <button
            aria-label={props.ariaLabel}
            aria-expanded={open()}
            data-test-dropdown-control=""
            {...props.dataAttributes}
            class={cn(
              stylex.attrs(styles.shell, styles.fullTrigger, size() === "sm" ? styles.small : styles.medium).class,
              props.class
            )}
            disabled={props.disabled || props.options.length === 0}
            onClick={() => setOpen((current) => !current)}
            type="button"
          >
            <span {...stylex.attrs(styles.muted)}>{selectedOption()?.icon ?? props.icon}</span>
            <span {...stylex.attrs(styles.triggerLabel)}>{selectedOption()?.label ?? props.value}</span>
            <ChevronDown {...stylex.attrs(styles.chevron)} />
          </button>
        </Popover>
      </Tooltip>
    );
  }

  return (
    <button
      aria-label={props.ariaLabel}
      data-test-dropdown-control=""
      {...props.dataAttributes}
      class={cn(
        stylex.attrs(styles.shell, styles.trigger, size() === "sm" ? styles.small : styles.medium).class,
        props.class
      )}
      disabled={props.disabled}
      onClick={props.onClick}
      type={props.type ?? "button"}
    >
      <span {...stylex.attrs(styles.muted)}>{props.icon}</span>
      <span {...stylex.attrs(styles.triggerLabel)}>{props.label}</span>
      <ChevronDown {...stylex.attrs(styles.chevron)} />
    </button>
  );
}

export type { DropdownOption };

const styles = stylex.create({
  popoverRoot: { minWidth: 0 },
  popoverContent: { maxWidth: "20rem", minWidth: "var(--popover-trigger-width)", padding: "0.375rem" },
  options: { display: "flex", flexDirection: "column", gap: "0.125rem", minWidth: "var(--popover-trigger-width)" },
  option: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": "rgb(0 0 0 / 0.05)", ":focus-visible": "rgb(0 0 0 / 0.05)" },
    borderWidth: 0,
    borderRadius: "0.5rem",
    color: "var(--foreground)",
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    display: "flex",
    fontWeight: 500,
    gap: "0.375rem",
    minWidth: 0,
    opacity: { default: 1, ":disabled": 0.5 },
    outline: { default: null, ":focus-visible": "none" },
    padding: "0.25rem 0.375rem",
    textAlign: "left",
    transitionProperty: "background-color, color",
    transitionDuration: "150ms",
    width: "100%"
  },
  optionSmall: { fontSize: "0.525rem" },
  optionMedium: { fontSize: "0.575rem" },
  optionIcon: { alignItems: "center", color: "var(--muted)", display: "flex", flexShrink: 0, height: "0.875rem", justifyContent: "center", width: "0.875rem" },
  optionCopy: { flex: "1", minWidth: 0 },
  optionLabel: { display: "block", whiteSpace: "nowrap" },
  optionDescription: { color: "var(--muted)", display: "block", fontSize: "0.55rem", fontWeight: 400, lineHeight: "1rem", marginTop: "0.125rem" },
  check: { color: "var(--foreground)", flexShrink: 0, height: "0.75rem", width: "0.75rem" },
  shell: {
    alignItems: "center",
    backgroundColor: { default: "rgb(255 255 255 / 0.7)", ":hover": "rgb(255 255 255 / 0.85)" },
    borderColor: "var(--border)",
    borderRadius: "0.5rem",
    borderStyle: "solid",
    borderWidth: "1px",
    boxShadow: { default: "0 1px 2px rgb(0 0 0 / 0.05)", ":focus-visible": "0 0 0 2px var(--ring)", ":focus-within": "0 0 0 2px var(--ring)" },
    color: "var(--foreground)",
    display: "inline-flex",
    fontWeight: 500,
    gap: "0.375rem",
    justifyContent: "flex-start",
    minWidth: 0,
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    opacity: { default: 1, ":disabled": 0.6 },
    outline: "none",
    paddingInline: "0.375rem",
    transitionProperty: "background-color, border-color, box-shadow",
    transitionDuration: "150ms"
  },
  trigger: {},
  fullTrigger: { width: "100%" },
  small: { height: "1.75rem" },
  medium: { height: "2rem" },
  muted: { color: "var(--muted)" },
  triggerLabel: { flex: "1", fontSize: "0.625rem", minWidth: 0, overflow: "hidden", textAlign: "left", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  chevron: { color: "var(--muted)", height: "0.875rem", width: "0.875rem" }
});
