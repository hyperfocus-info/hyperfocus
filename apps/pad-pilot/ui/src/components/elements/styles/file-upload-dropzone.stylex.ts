import * as stylex from "@stylexjs/stylex";

const definitions = stylex.create({
  "dropzoneStyle": {
    "backgroundColor": "transparent",
    "backgroundImage": "linear-gradient(180deg, #121923 0%, #0d141d 100%)",
    "color": "var(--pp-text-color, #dfe9fb)",
    "cursor": "pointer",
    "position": "relative",
    "borderBottomColor": "color-mix(in srgb, var(--pp-accent-color, #66dfff), #ffffff 72%)",
    "borderBottomLeftRadius": "10px",
    "borderBottomRightRadius": "10px",
    "borderBottomStyle": "dashed",
    "borderBottomWidth": "1px",
    "borderLeftColor": "color-mix(in srgb, var(--pp-accent-color, #66dfff), #ffffff 72%)",
    "borderLeftStyle": "dashed",
    "borderLeftWidth": "1px",
    "borderRightColor": "color-mix(in srgb, var(--pp-accent-color, #66dfff), #ffffff 72%)",
    "borderRightStyle": "dashed",
    "borderRightWidth": "1px",
    "borderTopColor": "color-mix(in srgb, var(--pp-accent-color, #66dfff), #ffffff 72%)",
    "borderTopLeftRadius": "10px",
    "borderTopRightRadius": "10px",
    "borderTopStyle": "dashed",
    "borderTopWidth": "1px",
    "minHeight": "140px",
    "overflowX": "hidden",
    "overflowY": "hidden",
    "width": "100%",
  },
  "isDraggingStyle": {
    "boxShadow": "0 0 18px color-mix(in srgb, var(--pp-accent-color, #66dfff), transparent 74%)",
    "borderBottomColor": "color-mix(in srgb, var(--pp-accent-color, #66dfff), #ffffff 40%)",
    "borderLeftColor": "color-mix(in srgb, var(--pp-accent-color, #66dfff), #ffffff 40%)",
    "borderRightColor": "color-mix(in srgb, var(--pp-accent-color, #66dfff), #ffffff 40%)",
    "borderTopColor": "color-mix(in srgb, var(--pp-accent-color, #66dfff), #ffffff 40%)",
  },
  "disabledStyle": {
    "cursor": "not-allowed",
    "opacity": "0.62"
  },
  "inputStyle": {
    "display": "none"
  },
  "overlayStyle": {
    "alignItems": "flex-end",
    "backgroundColor": "transparent",
    "backgroundImage": "linear-gradient(180deg, transparent 0%, #07101a9a 72%, #06101aee 100%)",
    "display": "flex",
    "pointerEvents": "none",
    "position": "absolute",
    "bottom": "0",
    "left": "0",
    "paddingBottom": "10px",
    "paddingLeft": "10px",
    "paddingRight": "10px",
    "paddingTop": "10px",
    "right": "0",
    "top": "0",
  },
  "hintStyle": {
    "color": "color-mix(in srgb, var(--pp-text-color, #dfe9fb), #ffffff 30%)",
    "fontSize": "12px",
    "letterSpacing": "0.06em",
  },
});

const styles = {
  "disabled": [stylex.attrs(definitions["disabledStyle"]).class].join(" "),
  "dropzone": [stylex.attrs(definitions["dropzoneStyle"]).class].join(" "),
  "hint": [stylex.attrs(definitions["hintStyle"]).class].join(" "),
  "input": [stylex.attrs(definitions["inputStyle"]).class].join(" "),
  "is-dragging": [stylex.attrs(definitions["isDraggingStyle"]).class].join(" "),
  "overlay": [stylex.attrs(definitions["overlayStyle"]).class].join(" "),
} as const;

export default styles;
