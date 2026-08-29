import * as stylex from "@stylexjs/stylex";

export const isPlaceholderMarker = stylex.defineMarker();
export const copyMarker = stylex.defineMarker();

const definitions = stylex.create({
  "cardStyle": {
    "backgroundColor": "transparent",
    "backgroundImage": "linear-gradient(\n    180deg,\n    rgba(17, 28, 43, 0.96),\n    rgba(9, 16, 28, 0.96)\n  )",
    "columnGap": "12px",
    "display": "flex",
    "flexDirection": "column",
    "position": "relative",
    "rowGap": "12px",
    "borderBottomColor": "rgba(87, 131, 169, 0.28)",
    "borderBottomLeftRadius": "14px",
    "borderBottomRightRadius": "14px",
    "borderBottomStyle": "solid",
    "borderBottomWidth": "1px",
    "borderLeftColor": "rgba(87, 131, 169, 0.28)",
    "borderLeftStyle": "solid",
    "borderLeftWidth": "1px",
    "borderRightColor": "rgba(87, 131, 169, 0.28)",
    "borderRightStyle": "solid",
    "borderRightWidth": "1px",
    "borderTopColor": "rgba(87, 131, 169, 0.28)",
    "borderTopLeftRadius": "14px",
    "borderTopRightRadius": "14px",
    "borderTopStyle": "solid",
    "borderTopWidth": "1px",
    "paddingBottom": { default: null, ":is([data-variant=\"chain\"])": "14px", ":is([data-variant=\"default\"])": "12px", ":is([data-variant=\"node\"])": "12px", },
    "paddingLeft": { default: null, ":is([data-variant=\"chain\"])": "14px", ":is([data-variant=\"default\"])": "12px", ":is([data-variant=\"node\"])": "12px", },
    "paddingRight": { default: null, ":is([data-variant=\"chain\"])": "14px", ":is([data-variant=\"default\"])": "12px", ":is([data-variant=\"node\"])": "12px", },
    "paddingTop": { default: null, ":is([data-variant=\"chain\"])": "14px", ":is([data-variant=\"default\"])": "12px", ":is([data-variant=\"node\"])": "12px", },
  },
  "isDraggingStyle": {
    "cursor": "grabbing",
    "zIndex": 12
  },
  "isPlaceholderStyle": {
    "backgroundColor": "rgba(255, 255, 255, 0.03)",
    "backgroundImage": "none",
    "boxShadow": "inset 0 0 0 1px rgba(255, 255, 255, 0.08)",
    "content": { default: null, "::after": "\"\"" },
    "opacity": "1",
    "pointerEvents": { default: null, "::after": "none" },
    "position": { default: null, "::after": "absolute" },
    "borderBottomColor": { default: "rgba(255, 255, 255, 0.72)", "::after": "rgba(255, 255, 255, 0.82)" },
    "borderBottomLeftRadius": { default: null, "::after": "14px" },
    "borderBottomRightRadius": { default: null, "::after": "14px" },
    "borderBottomStyle": { default: "dashed", "::after": "dashed" },
    "borderBottomWidth": { default: null, "::after": "2px" },
    "borderLeftColor": { default: "rgba(255, 255, 255, 0.72)", "::after": "rgba(255, 255, 255, 0.82)" },
    "borderLeftStyle": { default: "dashed", "::after": "dashed" },
    "borderLeftWidth": { default: null, "::after": "2px" },
    "borderRightColor": { default: "rgba(255, 255, 255, 0.72)", "::after": "rgba(255, 255, 255, 0.82)" },
    "borderRightStyle": { default: "dashed", "::after": "dashed" },
    "borderRightWidth": { default: null, "::after": "2px" },
    "borderTopColor": { default: "rgba(255, 255, 255, 0.72)", "::after": "rgba(255, 255, 255, 0.82)" },
    "borderTopLeftRadius": { default: null, "::after": "14px" },
    "borderTopRightRadius": { default: null, "::after": "14px" },
    "borderTopStyle": { default: "dashed", "::after": "dashed" },
    "borderTopWidth": { default: null, "::after": "2px" },
    "bottom": { default: null, "::after": "8px" },
    "left": { default: null, "::after": "8px" },
    "right": { default: null, "::after": "8px" },
    "top": { default: null, "::after": "8px" },
  },
  "isPlaceholderChildStyle": {
    "opacity": { default: null, [stylex.when.ancestor(":is(*)", isPlaceholderMarker)]: "0" },
    "pointerEvents": { default: null, [stylex.when.ancestor(":is(*)", isPlaceholderMarker)]: "none" }
  },
  "isPreviewStyle": {
    "boxShadow": "0 24px 48px rgba(0, 0, 0, 0.4)",
    "pointerEvents": "none",
    "width": "min(100%, 360px)",
  },
  "headerStyle": {
    "alignItems": "flex-start",
    "columnGap": "10px",
    "display": "flex",
    "justifyContent": "space-between",
    "rowGap": "10px",
  },
  "titleRowStyle": {
    "alignItems": "center",
    "columnGap": "10px",
    "display": "flex",
    "rowGap": "10px",
    "minWidth": "0",
  },
  "copyStyle": {
    "columnGap": "2px",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "2px",
    "minWidth": "0",
  },
  "copySmallStyle": {
    "color": { default: null, [stylex.when.ancestor(":is(*)", copyMarker)]: "rgba(196, 223, 242, 0.74)" }
  },
  "handleStyle": {
    "alignItems": "center",
    "color": "#cbe9ff",
    "cursor": "grab",
    "display": "inline-flex",
    "justifyContent": "center",
    "touchAction": "none",
  },
  "cardContentStyle": {
    "columnGap": "12px",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "12px",
    "minWidth": "0",
  },
});

const styles = {
  "card": [stylex.attrs(definitions["cardStyle"]).class].join(" "),
  "card-content": [stylex.attrs(definitions["cardContentStyle"]).class, stylex.attrs(definitions["isPlaceholderChildStyle"]).class].join(" "),
  "copy": [stylex.attrs(copyMarker).class, stylex.attrs(definitions["copyStyle"]).class].join(" "),
  "copy-small": [stylex.attrs(definitions["copySmallStyle"]).class].join(" "),
  "handle": [stylex.attrs(definitions["handleStyle"]).class].join(" "),
  "header": [stylex.attrs(definitions["headerStyle"]).class].join(" "),
  "is-dragging": [stylex.attrs(definitions["isDraggingStyle"]).class].join(" "),
  "is-placeholder": [stylex.attrs(isPlaceholderMarker).class, stylex.attrs(definitions["isPlaceholderStyle"]).class].join(" "),
  "is-placeholder-child": [stylex.attrs(definitions["isPlaceholderChildStyle"]).class].join(" "),
  "is-preview": [stylex.attrs(definitions["isPreviewStyle"]).class].join(" "),
  "title-row": [stylex.attrs(definitions["titleRowStyle"]).class].join(" "),
} as const;

export default styles;
