import * as stylex from "@stylexjs/stylex";
import { tokens } from "@hyperfocus/ui/tokens.stylex";

export const styles = stylex.create({
  root: { gap: tokens.space2, overflow: "hidden", boxSizing: "border-box", display: "flex", flexDirection: "column", height: "100%", maxHeight: "100%", minHeight: 0, minWidth: 0, },
  header: { flexShrink: 0, minWidth: 0 },
  body: { overflow: "hidden",
 flexBasis: '0',
 flexGrow: '1',
 flexShrink: '1',
 minHeight: 0,
 minWidth: 0, },
  scroll: { scrollbarGutter: "stable", overscrollBehavior: "contain", overflowY: "auto", },
  footer: { flexShrink: 0, minWidth: 0 },
});
