import * as stylex from "@stylexjs/stylex";
import { tokens } from "@hyperfocus/ui/tokens.stylex";

export const planReviewStyles = stylex.create({
  body: { fontSize: tokens.fontBody, lineHeight: 1.5, overflowWrap: "anywhere", minWidth: 0, },
  heading: { margin: 0, color: tokens.foreground, fontSize: tokens.fontSection, fontWeight: 650, lineHeight: 1.35 },
  disclosure: { borderTopColor: tokens.border, borderTopStyle: "solid", borderTopWidth: "1px", minWidth: 0, paddingTop: tokens.space3, },
  trigger: { paddingBlock: tokens.space2, cursor: "pointer", fontSize: tokens.fontControl, fontWeight: 600, outlineColor: { default: null, ':focus-visible': tokens.focus }, outlineOffset: { default: null, ':focus-visible': "2px" }, outlineStyle: { default: null, ':focus-visible': "solid" }, outlineWidth: { default: null, ':focus-visible': "2px" }, minHeight: { default: "36px", "@media (pointer: coarse)": "44px" }, },
  facts: { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))", marginTop: tokens.space3, minWidth: 0, },
  card: { overflowWrap: "anywhere", minWidth: 0, },
  title: { margin: 0, fontSize: tokens.fontBody, fontWeight: 650, lineHeight: 1.5 },
});
