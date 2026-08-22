import type { JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { cn } from "../../lib/utils";

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

  return (
    <div
      data-test-dialog-inline-note=""
      class={cn(
        stylex.attrs(styles.note, styles[tone()]).class,
        props.class
      )}
    >
      {props.children}
    </div>
  );
}

const styles = stylex.create({
  section: {
    borderColor: "var(--border)",
    borderStyle: "solid",
    borderWidth: "1px 0 0",
    borderTopWidth: { default: "1px", ":first-child": 0 },
    display: "grid",
    gap: "0.75rem",
    paddingTop: { default: "1rem", ":first-child": 0 }
  },
  sectionHeading: { display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 0 },
  sectionTitle: { color: "var(--foreground)", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.16em", margin: 0, textTransform: "uppercase" },
  sectionDescription: { color: "var(--muted)", fontSize: "0.7rem", lineHeight: "1.25rem", margin: 0 },
  field: { display: "grid", gap: "0.375rem", minWidth: 0 },
  fieldLabel: { color: "var(--muted)", fontSize: "0.585rem", fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase" },
  note: { borderStyle: "solid", borderWidth: "0 0 0 2px", fontSize: "0.675rem", lineHeight: "1.25rem", padding: "0.5rem 0.75rem" },
  neutral: { borderColor: "var(--border)", color: "var(--muted)" },
  danger: { backgroundColor: "rgb(255 241 242 / 0.8)", borderColor: "rgb(253 164 175)", color: "rgb(136 19 55)" },
  success: { backgroundColor: "rgb(236 253 245 / 0.8)", borderColor: "rgb(52 211 153)", color: "rgb(6 78 59)" }
});
