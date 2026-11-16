import { tokens } from "@hyperfocus/ui/tokens.stylex";
import { splitProps, type JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { cn } from "../../lib/utils";

export type StatusChipTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

type StatusChipProps = {
  tone?: StatusChipTone;
  dot?: boolean;
  class?: string;
  children: JSX.Element;
} & JSX.HTMLAttributes<HTMLSpanElement>;

const styles = stylex.create({
  root: {
    borderColor: "var(--border)",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: "1px",
    gap: "0.375rem",
    paddingInline: "0.55rem",
    alignItems: "center",
    display: "inline-flex",
    fontSize: tokens.fontCaption,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: "nowrap",
    minHeight: "1.5rem",
  },
  neutral: { borderColor: "var(--border)", backgroundColor: "var(--panel-strong)", color: "var(--foreground)", },
  success: { borderColor: "color-mix(in srgb, var(--success) 62%, var(--border) 38%)", backgroundColor: "color-mix(in srgb, var(--success) 13%, var(--panel-strong) 87%)", color: "var(--success-strong)", },
  warning: { borderColor: "color-mix(in srgb, var(--warning) 62%, var(--border) 38%)", backgroundColor: "color-mix(in srgb, var(--warning) 14%, var(--panel-strong) 86%)", color: "var(--warning-strong)", },
  danger: { borderColor: "color-mix(in srgb, var(--danger) 58%, var(--border) 42%)", backgroundColor: "color-mix(in srgb, var(--danger) 12%, var(--panel-strong) 88%)", color: "var(--danger-strong)", },
  info: { borderColor: "color-mix(in srgb, var(--info) 58%, var(--border) 42%)", backgroundColor: "color-mix(in srgb, var(--info) 12%, var(--panel-strong) 88%)", color: "var(--info-strong)", },
  accent: { borderColor: "var(--accent)", backgroundColor: "color-mix(in srgb, var(--accent) 14%, var(--panel-strong) 86%)", color: "var(--accent-strong)", },
  dot: { borderRadius: "9999px", backgroundColor: "currentColor", height: "0.375rem", width: "0.375rem", }
});

export function StatusChip(props: StatusChipProps) {
  const [local, rest] = splitProps(props, ["tone", "dot", "class", "children"]);
  const tone = () => local.tone ?? "neutral";
  const toneStyle = () => {
    switch (tone()) {
      case "success":
        return styles.success;
      case "warning":
        return styles.warning;
      case "danger":
        return styles.danger;
      case "info":
        return styles.info;
      case "accent":
        return styles.accent;
      default:
        return styles.neutral;
    }
  };

  return (
    <span
      {...rest}
      data-test-status-chip=""
      class={cn(stylex.attrs(styles.root, toneStyle()).class, local.class)}
    >
      {local.dot ? <span {...stylex.attrs(styles.dot)} /> : null}
      {local.children}
    </span>
  );
}
