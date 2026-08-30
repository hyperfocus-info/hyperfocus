import * as stylex from "@stylexjs/stylex";

export const viewportMarker = stylex.defineMarker();

const definitions = stylex.create({
  "viewportStyle": {
    "columnGap": "10px",
    "display": "flex",
    "flexDirection": "column",
    "pointerEvents": "none",
    "position": "fixed",
    "rowGap": "10px",
    "zIndex": 30,
    "right": "18px",
    "top": "18px",
  },
  "viewportChildStyle": {
    "pointerEvents": { default: null, [stylex.when.ancestor(":is(*)", viewportMarker)]: "auto" }
  },
});

const styles = {
  "viewport": [stylex.attrs(viewportMarker).class, stylex.attrs(definitions["viewportStyle"]).class].join(" "),
  "viewport-child": [stylex.attrs(definitions["viewportChildStyle"]).class].join(" "),
} as const;

export default styles;
