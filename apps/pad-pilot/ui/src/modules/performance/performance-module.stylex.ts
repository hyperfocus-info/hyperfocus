import * as stylex from "@stylexjs/stylex";

const definitions = stylex.create({
  "moduleRootStyle": {
    "--pp-accent-color": "#49ff79",
    "--pp-base-bg": "#122817",
    "--pp-text-color": "#dcffe8",
    "backgroundColor": "transparent",
    "backgroundImage": "linear-gradient(\r\n    180deg,\r\n    color-mix(in srgb, var(--pp-base-bg), #1d3b24 18%),\r\n    color-mix(in srgb, var(--pp-base-bg), #040905 8%)\r\n  )",
    "color": "var(--pp-text-color)",
    "borderBottomColor": "color-mix(in srgb, var(--pp-accent-color), #ffffff 18%)",
    "borderBottomLeftRadius": "14px",
    "borderBottomRightRadius": "14px",
    "borderBottomStyle": "solid",
    "borderBottomWidth": "1px",
    "borderLeftColor": "color-mix(in srgb, var(--pp-accent-color), #ffffff 18%)",
    "borderLeftStyle": "solid",
    "borderLeftWidth": "1px",
    "borderRightColor": "color-mix(in srgb, var(--pp-accent-color), #ffffff 18%)",
    "borderRightStyle": "solid",
    "borderRightWidth": "1px",
    "borderTopColor": "color-mix(in srgb, var(--pp-accent-color), #ffffff 18%)",
    "borderTopLeftRadius": "14px",
    "borderTopRightRadius": "14px",
    "borderTopStyle": "solid",
    "borderTopWidth": "1px",
    "minHeight": "420px",
    "paddingBottom": "16px",
    "paddingLeft": "16px",
    "paddingRight": "16px",
    "paddingTop": "16px",
  },
  "titleStyle": {
    "fontSize": "24px",
    "marginBottom": "14px",
    "marginLeft": "0",
    "marginRight": "0",
    "marginTop": "0",
  },
  "grid2Style": {
    "columnGap": "12px",
    "display": "grid",
    "gridTemplateColumns": "repeat(2, minmax(120px, 1fr))",
    "rowGap": "12px",
  },
  "rowStyle": {
    "columnGap": "14px",
    "display": "flex",
    "flexWrap": "wrap",
    "rowGap": "14px",
    "marginTop": "12px",
  },
  "columnStyle": {
    "columnGap": "8px",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "8px",
    "marginTop": "12px",
  },
});

const styles = {
  "column": [stylex.attrs(definitions["columnStyle"]).class].join(" "),
  "grid-2": [stylex.attrs(definitions["grid2Style"]).class].join(" "),
  "module-root": [stylex.attrs(definitions["moduleRootStyle"]).class].join(" "),
  "row": [stylex.attrs(definitions["rowStyle"]).class].join(" "),
  "title": [stylex.attrs(definitions["titleStyle"]).class].join(" "),
} as const;

export default styles;
