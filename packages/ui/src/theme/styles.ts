import * as stylex from "@stylexjs/stylex";
import { tokens } from "./tokens.stylex";

export const sharedStyles = stylex.create({
  focusRing: {
    outline: {
      default: "none",
      ":focus-visible": `2px solid ${tokens.accent}`
    },
    outlineOffset: "2px"
  },
  surface: {
    borderColor: tokens.border,
    borderRadius: tokens.radius,
    borderStyle: "solid",
    borderWidth: "1px",
    backgroundColor: tokens.panel,
    color: tokens.foreground,
  }
});

