import * as stylex from "@stylexjs/stylex";
import { tokens } from "@hyperfocus/ui/tokens.stylex";

export const providerStyles = stylex.create({
  page: { gap: tokens.space8, color: tokens.foreground, containerType: "inline-size", display: "grid", minWidth: 0, },
  copy: { gap: tokens.space2, display: "grid", overflowWrap: "anywhere", minWidth: 0, },
  muted: { color: tokens.muted },
  section: { gap: tokens.space4, display: "grid", minWidth: 0, },
  credentials: { display: "grid", minWidth: 0 },
  credential: { gap: tokens.space2, paddingBlock: tokens.space4, display: "grid", borderBottomColor: tokens.border, borderBottomStyle: "solid", borderBottomWidth: tokens.borderWidth, minWidth: 0, },
  heading: { gap: tokens.space2, alignItems: "baseline", display: "flex", flexWrap: "wrap", justifyContent: "space-between", minWidth: 0, },
  label: { overflowWrap: "anywhere", minWidth: 0, },
  controls: { gap: tokens.space2, alignItems: "start", display: "grid", gridTemplateColumns: { default: "minmax(0, 1fr) auto", "@container (max-width: 30rem)": "minmax(0, 1fr)" }, minWidth: 0, },
  inputGroup: { gap: tokens.space2, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", minWidth: 0, },
  actions: { gap: tokens.space2, alignItems: "start", display: "flex", flexWrap: "wrap", },
  status: { color: tokens.muted, overflowWrap: "anywhere" },
  pending: { color: tokens.warning },
  success: { color: tokens.success },
  error: { color: tokens.danger },
  defaults: { paddingBottom: tokens.space4 },
  defaultGrid: { gap: tokens.space4, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))", minWidth: 0, },
  checkbox: { margin: 0, accentColor: tokens.accent, height: tokens.iconSmall, width: tokens.iconSmall, },
});
