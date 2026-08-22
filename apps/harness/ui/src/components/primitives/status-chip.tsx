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

export function StatusChip(props: StatusChipProps) {
  const [local, rest] = splitProps(props, ["tone", "dot", "class", "children"]);
  const tone = () => local.tone ?? "neutral";

  return (
    <span
      {...rest}
      data-test-status-chip=""
      class={cn(stylex.attrs(styles.root, styles[tone()]).class, local.class)}
    >
      {local.dot ? <span {...stylex.attrs(styles.dot)} /> : null}
      {local.children}
    </span>
  );
}

const styles = stylex.create({
  root: {
    alignItems: "center",
    borderColor: "var(--border)",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: "1px",
    display: "inline-flex",
    fontSize: "0.625rem",
    fontWeight: 600,
    gap: "0.375rem",
    lineHeight: "1rem",
    padding: "0.125rem 0.5rem",
    whiteSpace: "nowrap"
  },
  neutral: { backgroundColor: "var(--panel-strong)", color: "var(--muted)" },
  success: { backgroundColor: "rgb(236 253 245 / 0.8)", borderColor: "rgb(110 231 183)", color: "rgb(6 95 70)" },
  warning: { backgroundColor: "rgb(255 251 235 / 0.8)", borderColor: "rgb(252 211 77)", color: "rgb(146 64 14)" },
  danger: { backgroundColor: "rgb(255 241 242 / 0.8)", borderColor: "rgb(253 164 175)", color: "rgb(159 18 57)" },
  info: { backgroundColor: "rgb(240 249 255 / 0.8)", borderColor: "rgb(125 211 252)", color: "rgb(3 105 161)" },
  accent: { backgroundColor: "color-mix(in srgb, var(--accent) 14%, transparent)", borderColor: "var(--accent)", color: "var(--accent-strong)" },
  dot: { backgroundColor: "currentColor", borderRadius: "9999px", height: "0.375rem", width: "0.375rem" }
});
