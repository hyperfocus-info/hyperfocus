import * as stylex from "@stylexjs/stylex";

const definitions = stylex.create({
  "rootStyle": {
    "backgroundColor": "transparent",
    "backgroundImage": "radial-gradient(circle at 50% 8%, #152232 0%, #0b1119 65%)",
    "position": "relative",
    "borderBottomColor": "color-mix(in srgb, var(--pp-accent-color, #66dfff), #ffffff 88%)",
    "borderBottomLeftRadius": "10px",
    "borderBottomRightRadius": "10px",
    "borderBottomStyle": "solid",
    "borderBottomWidth": "1px",
    "borderLeftColor": "color-mix(in srgb, var(--pp-accent-color, #66dfff), #ffffff 88%)",
    "borderLeftStyle": "solid",
    "borderLeftWidth": "1px",
    "borderRightColor": "color-mix(in srgb, var(--pp-accent-color, #66dfff), #ffffff 88%)",
    "borderRightStyle": "solid",
    "borderRightWidth": "1px",
    "borderTopColor": "color-mix(in srgb, var(--pp-accent-color, #66dfff), #ffffff 88%)",
    "borderTopLeftRadius": "10px",
    "borderTopRightRadius": "10px",
    "borderTopStyle": "solid",
    "borderTopWidth": "1px",
    "height": "100%",
    "minHeight": "140px",
    "overflowX": "hidden",
    "overflowY": "hidden",
    "width": "100%",
  },
  "svgStyle": {
    "display": "block",
    "height": "100%",
    "width": "100%",
  },
  "lineStyle": {
    "fill": "none",
    "stroke": "color-mix(in srgb, var(--pp-accent-color, #66dfff), #ffffff 24%)",
    "strokeWidth": "var(--waveform-line-thickness, 0.75)",
  },
  "centerLineStyle": {
    "stroke": "color-mix(in srgb, var(--pp-text-color, #dfe9fb), transparent 68%)",
    "strokeWidth": "1"
  },
  "emptyStyle": {
    "placeItems": "center",
    "color": "color-mix(in srgb, var(--pp-text-color, #dfe9fb), #ffffff 28%)",
    "display": "grid",
    "fontSize": "12px",
    "letterSpacing": "0.08em",
    "position": "absolute",
    "bottom": "0",
    "left": "0",
    "right": "0",
    "top": "0",
  },
});

const styles = {
  "center-line": [stylex.attrs(definitions["centerLineStyle"]).class].join(" "),
  "empty": [stylex.attrs(definitions["emptyStyle"]).class].join(" "),
  "line": [stylex.attrs(definitions["lineStyle"]).class].join(" "),
  "root": [stylex.attrs(definitions["rootStyle"]).class].join(" "),
  "svg": [stylex.attrs(definitions["svgStyle"]).class].join(" "),
} as const;

export default styles;
