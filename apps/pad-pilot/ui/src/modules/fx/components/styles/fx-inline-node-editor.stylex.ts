import * as stylex from "@stylexjs/stylex";

export const editorCopyMarker = stylex.defineMarker();

const definitions = stylex.create({
  "editorStyle": {
    "backgroundImage": "linear-gradient(180deg, rgba(17, 27, 34, 0.98), rgba(8, 14, 20, 0.98)),\n    radial-gradient(circle at top, rgba(77, 233, 255, 0.12), transparent 36%)",
    "columnGap": "8px",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "8px",
    "borderBottomColor": "rgba(77, 233, 255, 0.22)",
    "borderBottomLeftRadius": "14px",
    "borderBottomRightRadius": "14px",
    "borderBottomStyle": "solid",
    "borderBottomWidth": "1px",
    "borderLeftColor": "rgba(77, 233, 255, 0.22)",
    "borderLeftStyle": "solid",
    "borderLeftWidth": "1px",
    "borderRightColor": "rgba(77, 233, 255, 0.22)",
    "borderRightStyle": "solid",
    "borderRightWidth": "1px",
    "borderTopColor": "rgba(77, 233, 255, 0.22)",
    "borderTopLeftRadius": "14px",
    "borderTopRightRadius": "14px",
    "borderTopStyle": "solid",
    "borderTopWidth": "1px",
    "paddingBottom": "10px",
    "paddingLeft": "10px",
    "paddingRight": "10px",
    "paddingTop": "10px",
  },
  "editorCopyStyle": {
    "columnGap": "8px",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "8px",
  },
  "editorBodyStyle": {
    "columnGap": "8px",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "8px",
  },
  "editorHeaderStyle": {
    "alignItems": "center",
    "columnGap": "8px",
    "display": "flex",
    "justifyContent": "space-between",
    "rowGap": "8px",
  },
  "editorActionsStyle": {
    "alignItems": "center",
    "columnGap": "8px",
    "display": "flex",
    "justifyContent": "space-between",
    "rowGap": "8px",
  },
  "editorCopyStrongStyle": {
    "color": { default: null, [stylex.when.ancestor(":is(*)", editorCopyMarker)]: "#ecfcff" },
    "letterSpacing": { default: null, [stylex.when.ancestor(":is(*)", editorCopyMarker)]: "0.08em" }
  },
  "editorCopySmallStyle": {
    "color": { default: null, [stylex.when.ancestor(":is(*)", editorCopyMarker)]: "rgba(198, 226, 236, 0.68)" }
  },
});

const styles = {
  "editor": [stylex.attrs(definitions["editorStyle"]).class].join(" "),
  "editor-actions": [stylex.attrs(definitions["editorActionsStyle"]).class].join(" "),
  "editor-body": [stylex.attrs(definitions["editorBodyStyle"]).class].join(" "),
  "editor-copy": [stylex.attrs(editorCopyMarker).class, stylex.attrs(definitions["editorCopyStyle"]).class].join(" "),
  "editor-copy-small": [stylex.attrs(definitions["editorCopySmallStyle"]).class].join(" "),
  "editor-copy-strong": [stylex.attrs(definitions["editorCopyStrongStyle"]).class].join(" "),
  "editor-header": [stylex.attrs(definitions["editorHeaderStyle"]).class].join(" "),
} as const;

export default styles;
