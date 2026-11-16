import * as stylex from "@stylexjs/stylex";
import { tokens } from "@hyperfocus/ui/tokens.stylex";

export const jobsRosterStyles = stylex.create({
  header: { gap: tokens.space2, alignItems: "center", display: "flex", flexWrap: "wrap", justifyContent: "space-between", minWidth: 0, },
  title: { margin: 0, color: tokens.foreground, overflowWrap: "anywhere" },
  actions: { gap: tokens.space2, alignItems: "center", display: "flex", flexWrap: "wrap", },
  section: { flex: "1", gap: tokens.space2, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, },
  copy: { margin: 0, color: tokens.muted, overflowWrap: "anywhere" },
  warning: { margin: 0, color: tokens.warning, overflowWrap: "anywhere" },
  viewport: { flex: "1", minHeight: 0, minWidth: 0, width: "100%", },
  empty: { padding: tokens.space3, gap: tokens.space3, display: "grid", minWidth: 0, },
  utilities: { alignSelf: "flex-start" },
  facts: { gap: tokens.space3, color: tokens.muted, display: "grid", fontSize: tokens.fontBody, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 14rem), 1fr))", lineHeight: 1.5, marginTop: tokens.space4, minWidth: 0, },
  detail: { gap: tokens.space4, display: "flex", flexDirection: "column", height: "100%", minHeight: 0, minWidth: 0, overflowY: "auto", },
  detailHeader: { flexShrink: 0, borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: tokens.borderWidth, paddingBottom: tokens.space4, },
  outcome: { gap: tokens.space2, display: "grid", flexShrink: 0, minWidth: 0, },
  log: { display: "flex", flexDirection: "column", flexShrink: 0, minHeight: "16rem", },
});
