import * as stylex from "@stylexjs/stylex";
import { Show, splitProps, useContext, type JSX } from "solid-js";
import { tokens } from "../theme/tokens.stylex";
import { sharedStyles } from "../theme/styles";
import { typography } from "../theme/typography";

import { FormActionsContext } from "./form-actions";

export type FormFieldProps = Omit<JSX.LabelHTMLAttributes<HTMLLabelElement>, "title"> & {
  label: JSX.Element;
  description?: JSX.Element;
  error?: JSX.Element;
};

export type FormGridProps = JSX.HTMLAttributes<HTMLDivElement>;

export type CheckboxFieldProps = JSX.LabelHTMLAttributes<HTMLLabelElement> & {
  label: JSX.Element;
  description?: JSX.Element;
};

const styles = stylex.create({
  grid: {
    gap: tokens.space3,
    containerType: "inline-size",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 14rem), 1fr))",
    minWidth: 0,
  },
  field: {
    gap: tokens.space1,
    alignContent: "start",
    display: "grid",
    overflowWrap: "anywhere",
    minWidth: 0,
  },
  actionField: { gridRow: "span 3", alignItems: "center", gridTemplateRows: "subgrid", },
  fieldControl: { display: "grid", minWidth: 0, },
  fieldHelp: { gap: tokens.space1, display: "grid", minWidth: 0, },
  fieldLabel: {
    color: tokens.foreground,
  },
  description: {
    color: tokens.muted,
  },
  error: {
    color: tokens.danger,
  },
  checkbox: {
    padding: tokens.space1,
    borderColor: "transparent",
    borderRadius: tokens.radiusSmall,
    borderStyle: "solid",
    borderWidth: tokens.borderWidth,
    gap: tokens.space2,
    alignItems: "start",
    boxSizing: "border-box",
    cursor: "pointer",
    display: "grid",
    gridTemplateColumns: "1rem minmax(0, 1fr)",
    overflowWrap: "anywhere",
    minHeight: { default: tokens.controlCompact, "@media (pointer: coarse)": tokens.controlTouch },
    minWidth: 0,
  },
  checkboxControl: {
    accentColor: tokens.accent,
    height: "1rem",
    marginBottom: '0',
    marginLeft: '0',
    marginRight: '0',
    marginTop: '0.1rem',
    width: "1rem",
  },
  checkboxCopy: {
    gap: tokens.space1,
    display: "grid",
    minWidth: 0,
  },
  checkboxLabel: {
    color: tokens.foreground,
  },
});

export function FormGrid(props: FormGridProps) {
  const [local, rest] = splitProps(props, ["children", "class"]);
  return (
    <div
      {...rest}
      {...stylex.attrs(styles.grid)}
      classList={{ [local.class ?? ""]: Boolean(local.class) }}
      data-test-form-grid=""
    >
      {local.children}
    </div>
  );
}

export function FormField(props: FormFieldProps) {
  const inActions = useContext(FormActionsContext);
  const [local, rest] = splitProps(props, ["label", "description", "error", "children", "class"]);
  return (
    <label
      {...rest}
      {...stylex.attrs(styles.field, inActions && styles.actionField)}
      classList={{ [local.class ?? ""]: Boolean(local.class) }}
      data-test-form-field=""
      data-ui-field=""
    >
      <span {...stylex.attrs(typography.control, styles.fieldLabel)}>{local.label}</span>
      <span {...stylex.attrs(styles.fieldControl)} data-ui-field-control="">{local.children}</span>
      <Show when={inActions || local.description || local.error}><span {...stylex.attrs(styles.fieldHelp)}>
        <Show when={local.description}><small {...stylex.attrs(typography.caption, styles.description)}>{local.description}</small></Show>
        <Show when={local.error}><small {...stylex.attrs(typography.caption, styles.error)} role="alert">{local.error}</small></Show>
      </span></Show>
    </label>
  );
}

export function CheckboxField(props: CheckboxFieldProps) {
  const [local, rest] = splitProps(props, ["label", "description", "children", "class"]);
  return (
    <label
      {...rest}
      {...stylex.attrs(styles.checkbox, sharedStyles.focusRing)}
      classList={{ [local.class ?? ""]: Boolean(local.class) }}
      data-test-checkbox-field=""
      data-hf-checkbox-field=""
    >
      <span {...stylex.attrs(styles.checkboxControl)}>{local.children}</span>
      <span {...stylex.attrs(styles.checkboxCopy)}>
        <span {...stylex.attrs(typography.control, styles.checkboxLabel)}>{local.label}</span>
        <Show when={local.description}><small {...stylex.attrs(typography.caption, styles.description)}>{local.description}</small></Show>
      </span>
    </label>
  );
}
