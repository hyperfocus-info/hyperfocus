import type { JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { tokens } from "@hyperfocus/ui/tokens.stylex";
import { cn } from "../../lib/utils";

const styles = stylex.create({
  section: {
    borderColor: "var(--border)",
    borderStyle: "solid",
    gap: "0.75rem",
    display: "grid",
    borderBottomWidth: '0',
    borderLeftWidth: '0',
    borderRightWidth: '0',
    borderTopWidth: { default: "1px", ":first-child": 0 },
    paddingTop: { default: "1rem", ":first-child": 0 },
  },
  sectionHeading: { gap: "0.25rem", display: "flex", flexDirection: "column", minWidth: 0, },
  sectionTitle: { margin: 0, color: tokens.foreground, fontSize: tokens.fontSection, fontWeight: 600, lineHeight: 1.35, overflowWrap: "anywhere" },
  sectionDescription: { margin: 0, color: tokens.muted, fontSize: tokens.fontBody, lineHeight: 1.5, overflowWrap: "anywhere" },
  field: { gap: "0.375rem", display: "grid", minWidth: 0, },
  fieldLabel: { color: tokens.foreground, fontSize: tokens.fontControl, fontWeight: 600, lineHeight: 1.4, overflowWrap: "anywhere", },
  note: { borderStyle: "solid",
 paddingBlock: '0.5rem',
 paddingInline: '0.75rem',
 fontSize: tokens.fontCaption,
 lineHeight: "1.25rem",
 borderBottomWidth: '0',
 borderLeftWidth: '2px',
 borderRightWidth: '0',
 borderTopWidth: '0', },
  neutral: { borderColor: "var(--border)", color: "var(--muted)" },
  danger: { borderColor: tokens.danger, color: tokens.danger },
  success: { borderColor: tokens.success, color: tokens.success }
});

export function DialogFormSection(props: {
  title: string;
  description?: string;
  class?: string;
  children: JSX.Element;
}) {
  return (
    <section
      data-test-dialog-form-section=""
      class={cn(stylex.attrs(styles.section).class, props.class)}
    >
      <div {...stylex.attrs(styles.sectionHeading)}>
        <h3 {...stylex.attrs(styles.sectionTitle)}>{props.title}</h3>
        {props.description ? <p {...stylex.attrs(styles.sectionDescription)}>{props.description}</p> : null}
      </div>
      {props.children}
    </section>
  );
}

export function DialogField(props: {
  label: string;
  class?: string;
  children: JSX.Element;
}) {
  return (
    <label data-test-dialog-field="" class={cn(stylex.attrs(styles.field).class, props.class)}>
      <span {...stylex.attrs(styles.fieldLabel)}>{props.label}</span>
      {props.children}
    </label>
  );
}

export function DialogInlineNote(props: {
  tone?: "neutral" | "danger" | "success";
  class?: string;
  children: JSX.Element;
}) {
  const tone = () => props.tone ?? "neutral";
  const toneStyle = () => tone() === "danger" ? styles.danger : tone() === "success" ? styles.success : styles.neutral;

  return (
    <div
      data-test-dialog-inline-note=""
      class={cn(
        stylex.attrs(styles.note, toneStyle()).class,
        props.class
      )}
    >
      {props.children}
    </div>
  );
}
