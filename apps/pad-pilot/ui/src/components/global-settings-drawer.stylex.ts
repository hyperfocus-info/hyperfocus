import * as stylex from "@stylexjs/stylex";

export const settingRowMarker = stylex.defineMarker();

const definitions = stylex.create({
  "sectionBodyStyle": {
    "columnGap": "12px",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "12px",
  },
  "settingRowStyle": {
    "columnGap": "6px",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "6px",
  },
  "settingRowSpanStyle": {
    "color": { default: null, [stylex.when.ancestor(":is(*)", settingRowMarker)]: "rgba(221, 234, 255, 0.72)" },
    "fontSize": { default: null, [stylex.when.ancestor(":is(*)", settingRowMarker)]: "11px" },
    "fontWeight": { default: null, [stylex.when.ancestor(":is(*)", settingRowMarker)]: 700 },
    "letterSpacing": { default: null, [stylex.when.ancestor(":is(*)", settingRowMarker)]: "0.08em" },
    "textTransform": { default: null, [stylex.when.ancestor(":is(*)", settingRowMarker)]: "uppercase" }
  },
  "controllerButtonStyle": {
    "alignSelf": "flex-start"
  },
});

const styles = {
  "controller-button": [stylex.attrs(definitions["controllerButtonStyle"]).class].join(" "),
  "section-body": [stylex.attrs(definitions["sectionBodyStyle"]).class].join(" "),
  "setting-row": [stylex.attrs(settingRowMarker).class, stylex.attrs(definitions["settingRowStyle"]).class].join(" "),
  "setting-row-span": [stylex.attrs(definitions["settingRowSpanStyle"]).class].join(" "),
} as const;

export default styles;
