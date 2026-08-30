import * as stylex from "@stylexjs/stylex";

const definitions = stylex.create({
  "tabListStyle": {
    "alignItems": "stretch",
    "display": "flex",
  },
  "tabStyle": {
    "outline": "none"
  },
});

const styles = {
  "tab": [stylex.attrs(definitions["tabStyle"]).class].join(" "),
  "tab-list": [stylex.attrs(definitions["tabListStyle"]).class].join(" "),
} as const;

export default styles;
