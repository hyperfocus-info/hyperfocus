import * as stylex from "@stylexjs/stylex";

const definitions = stylex.create({
  "fieldStyle": {
    "color": "var(--pp-text-color, #d5e3ff)",
    "columnGap": "6px",
    "display": "flex",
    "flexDirection": "column",
    "fontSize": "12px",
    "rowGap": "6px",
    "minWidth": "0",
  },
  "comboboxStyle": {
    "minWidth": "0"
  },
});

const styles = {
  "combobox": [stylex.attrs(definitions["comboboxStyle"]).class].join(" "),
  "field": [stylex.attrs(definitions["fieldStyle"]).class].join(" "),
} as const;

export default styles;
