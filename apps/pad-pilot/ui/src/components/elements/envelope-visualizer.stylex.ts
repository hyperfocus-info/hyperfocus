import * as stylex from "@stylexjs/stylex";

const definitions = stylex.create({
  "rootStyle": {
    "backgroundColor": "color-mix(in srgb, var(--pp-base-bg, #1a2438), #000000 14%)",
    "backgroundImage": "none",
    "borderBottomColor": "color-mix(in srgb, var(--pp-accent-color, #66dfff), #ffffff 20%)",
    "borderBottomLeftRadius": "10px",
    "borderBottomRightRadius": "10px",
    "borderBottomStyle": "solid",
    "borderBottomWidth": "1px",
    "borderLeftColor": "color-mix(in srgb, var(--pp-accent-color, #66dfff), #ffffff 20%)",
    "borderLeftStyle": "solid",
    "borderLeftWidth": "1px",
    "borderRightColor": "color-mix(in srgb, var(--pp-accent-color, #66dfff), #ffffff 20%)",
    "borderRightStyle": "solid",
    "borderRightWidth": "1px",
    "borderTopColor": "color-mix(in srgb, var(--pp-accent-color, #66dfff), #ffffff 20%)",
    "borderTopLeftRadius": "10px",
    "borderTopRightRadius": "10px",
    "borderTopStyle": "solid",
    "borderTopWidth": "1px",
    "paddingBottom": "8px",
    "paddingLeft": "8px",
    "paddingRight": "8px",
    "paddingTop": "8px",
  },
  "svgStyle": {
    "display": "block",
    "height": "120px",
    "width": "100%",
  },
  "pathStyle": {
    "fill": "none",
    "stroke": "var(--pp-accent-color, #66dfff)",
    "strokeWidth": "3"
  },
});

const styles = {
  "path": [stylex.attrs(definitions["pathStyle"]).class].join(" "),
  "root": [stylex.attrs(definitions["rootStyle"]).class].join(" "),
  "svg": [stylex.attrs(definitions["svgStyle"]).class].join(" "),
} as const;

export default styles;
