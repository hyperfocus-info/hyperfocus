import * as stylex from "@stylexjs/stylex";
import { createSignal, onCleanup, onMount, Show, splitProps, type JSX } from "solid-js";
import { tokens } from "../theme/tokens.stylex";
import { sharedStyles } from "../theme/styles";
import { typography } from "../theme/typography";

export type InputProps = JSX.InputHTMLAttributes<HTMLInputElement> & { size?: "small" | "medium" };
export type FileInputProps = Omit<InputProps, "type"> & { type?: "file"; buttonLabel?: string };

const styles = stylex.create({
  input: {
    borderColor: { default: tokens.border, ':is([aria-invalid="true"])': tokens.danger, ":user-invalid": tokens.danger, ":hover": tokens.borderStrong },
    borderRadius: tokens.radiusSmall,
    borderStyle: "solid",
    borderWidth: tokens.borderWidth,
    paddingInline: tokens.space2,
    transition: { default: `background-color ${tokens.motionFast} ease, border-color ${tokens.motionFast} ease`, "@media (prefers-reduced-motion: reduce)": "none" },
    backgroundColor: tokens.panelRaised,
    boxSizing: "border-box",
    color: tokens.foreground,
    cursor: { default: "text", ':is([type="color"],[type="button"],[type="submit"])': "pointer" },
    fontVariantNumeric: tokens.numericVariant,
    fontWeight: 400,
    opacity: { default: 1, ":disabled": 0.5 },
    minWidth: 0,
    width: "100%",
    "::placeholder": { color: tokens.muted, opacity: 1 },
  },
  small: { minHeight: { default: tokens.controlCompact, "@media (pointer: coarse)": tokens.controlTouch } },
  medium: { minHeight: { default: tokens.controlStandard, "@media (pointer: coarse)": tokens.controlTouch } },
  file: {
    borderColor: { ':has(input:user-invalid)': tokens.danger, ':has(input[aria-invalid="true"])': tokens.danger, },
    gap: tokens.space2,
    outline: { default: "none", ":focus-within": `2px solid ${tokens.focus}` },
    paddingBlock: tokens.space1,
    alignItems: "center",
    cursor: "pointer",
    display: "flex",
    opacity: { default: 1, ":has(input:disabled)": 0.5 },
    outlineOffset: "2px",
    position: "relative",
  },
  nativeFile: { inset: 0, margin: 0, cursor: "pointer", opacity: 0, position: "absolute", zIndex: 1, height: "100%", width: "100%", },
  fileButton: {
    borderColor: tokens.border,
    borderRadius: tokens.radiusSmall,
    borderStyle: "solid",
    borderWidth: tokens.borderWidth,
    paddingBlock: "0.125rem",
    paddingInline: tokens.space2,
    backgroundColor: tokens.panel,
    flexShrink: 0,
    overflowWrap: "anywhere",
    pointerEvents: "none",
    maxWidth: "65%",
  },
  fileName: { overflow: "hidden", pointerEvents: "none", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, },
});

/** Shared appearance for text inputs in Solid and legacy DOM hosts. */
export function inputAppearance(size: "small" | "medium" = "medium") {
  return stylex.attrs(typography.body, styles.input, sharedStyles.focusRing, size === "small" ? styles.small : styles.medium);
}

export function Input(props: InputProps) {
  const [local, rest] = splitProps(props, ["size", "class"]);
  // Keep the native input/ref/event contract for existing file consumers.
  return <Show when={props.type === "file"} fallback={
    <input {...rest} {...inputAppearance(local.size)} classList={{ [local.class ?? ""]: Boolean(local.class) }} data-test-input="" />
  }><FileInput {...rest} type="file" size={local.size} class={local.class} /></Show>;
}

export function FileInput(props: FileInputProps) {
  const [local, rest] = splitProps(props, ["size", "class", "buttonLabel", "type"]);
  const [names, setNames] = createSignal("");
  let wrapper!: HTMLSpanElement;
  onMount(() => {
    const input = wrapper.querySelector("input");
    if (!input) return;
    const update = () => setNames(Array.from(input.files ?? [], file => file.name).join(", "));
    const reset = () => queueMicrotask(() => { if (input.isConnected) update(); });
    const change = () => { update(); reset(); };
    const form = input.form;
    update();
    input.addEventListener("change", change, true);
    input.addEventListener("input", change, true);
    form?.addEventListener("reset", reset);
    onCleanup(() => { input.removeEventListener("change", change, true); input.removeEventListener("input", change, true); form?.removeEventListener("reset", reset); });
  });
  return (
    <span ref={wrapper} {...stylex.attrs(typography.body, styles.input, styles.file, local.size === "small" ? styles.small : styles.medium)}
      classList={{ [local.class ?? ""]: Boolean(local.class) }} data-ui-file-input="">
      <input {...rest} type="file" {...stylex.attrs(styles.nativeFile)} data-test-input="" />
      <span {...stylex.attrs(styles.fileButton)} aria-hidden="true" data-ui-file-button="">{local.buttonLabel ?? (props.multiple ? "Choose files" : "Choose file")}</span>
      <span {...stylex.attrs(styles.fileName)} aria-hidden="true" data-ui-file-name="">{names() || "No file chosen"}</span>
    </span>
  );
}
