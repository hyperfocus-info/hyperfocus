import * as stylex from "@stylexjs/stylex";

const definitions = stylex.create({
  "viewportStyle": {
    "columnGap": "0.75rem",
    "display": "grid",
    "position": "fixed",
    "rowGap": "0.75rem",
    "zIndex": 1200,
    "right": "1rem",
    "top": "1rem",
    "width": "min(26rem, calc(100vw - 2rem))",
  },
});

const styles = {
  "viewport": [stylex.attrs(definitions["viewportStyle"]).class].join(" "),
} as const;

export default styles;
