import * as stylex from "@stylexjs/stylex";
import { tokens } from "@hyperfocus/ui/tokens.stylex";

/** Chat-owned reading layouts; action behavior stays in canonical controls. */
export const chatTaskStyles = stylex.create({
  question: { maxHeight: "min(32rem, 50vh)", minWidth: 0, overflowY: "auto", },
  readable: { overflowWrap: "anywhere", whiteSpace: "normal", minWidth: 0, },
  caption: { fontSize: tokens.fontCaption, letterSpacing: "normal", lineHeight: 1.5, textTransform: "none", },
  choices: { gap: tokens.space2, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))", },
  choiceHeading: { gap: tokens.space1, alignItems: "start", display: "flex", flexWrap: "wrap", },
  attachment: { padding: tokens.space2, borderColor: tokens.border, borderRadius: tokens.radiusSmall, borderStyle: "solid", borderWidth: "1px", gap: tokens.space2, alignItems: "center", backgroundColor: tokens.panel, color: tokens.foreground, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", maxWidth: "100%", minWidth: 0, },
  attachmentCopy: { gap: tokens.space1, display: "flex", flexDirection: "column", minWidth: 0, },
  muted: { color: tokens.muted },
  lookup: { padding: tokens.space1, borderColor: tokens.border, borderRadius: tokens.radiusSmall, borderStyle: "solid", borderWidth: "1px", overflow: "auto", backgroundColor: tokens.panel, position: "absolute", zIndex: 20, bottom: "7.75rem", left: tokens.space2, maxHeight: "min(24rem, 60vh)", right: tokens.space2, },
  experiment: { gap: tokens.space3, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 24rem), 1fr))", minWidth: 0, },
  file: { justifyContent: "start", textAlign: "left", height: "auto", width: "100%", },
  row: { gap: tokens.space2, alignItems: "center", display: "flex", flexWrap: "wrap", justifyContent: "space-between", minWidth: 0, },
  eventHeader: { gap: tokens.space1, color: tokens.muted, display: "flex", flexDirection: "column", fontSize: tokens.fontCaption, lineHeight: 1.5, overflowWrap: "anywhere", marginBottom: tokens.space2, minWidth: 0, },
});
