import * as stylex from "@stylexjs/stylex";

export const headerMarker = stylex.defineMarker();
export const compareRowMarker = stylex.defineMarker();

const definitions = stylex.create({
  "rackStyle": {
    "alignItems": "center",
    "backgroundImage": "linear-gradient(\n      180deg,\n      rgba(45, 48, 54, 0.92),\n      rgba(11, 18, 25, 0.98)\n    ),\n    radial-gradient(circle at top, rgba(77, 233, 255, 0.1), transparent 34%)",
    "boxShadow": "inset 0 0 0 1px rgba(255, 255, 255, 0.03)",
    "columnGap": "10px",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "10px",
    "borderBottomColor": "rgba(104, 190, 217, 0.24)",
    "borderBottomLeftRadius": "18px",
    "borderBottomRightRadius": "18px",
    "borderBottomStyle": "solid",
    "borderBottomWidth": "1px",
    "borderLeftColor": "rgba(104, 190, 217, 0.24)",
    "borderLeftStyle": "solid",
    "borderLeftWidth": "1px",
    "borderRightColor": "rgba(104, 190, 217, 0.24)",
    "borderRightStyle": "solid",
    "borderRightWidth": "1px",
    "borderTopColor": "rgba(104, 190, 217, 0.24)",
    "borderTopLeftRadius": "18px",
    "borderTopRightRadius": "18px",
    "borderTopStyle": "solid",
    "borderTopWidth": "1px",
    "paddingBottom": "12px",
    "paddingLeft": "12px",
    "paddingRight": "12px",
    "paddingTop": "12px",
    "width": { default: "232px", "@media (max-width: 1180px)": "100%" },
  },
  "headerStyle": {
    "alignItems": "center",
    "columnGap": "10px",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "10px",
    "borderBottomColor": "rgba(104, 190, 217, 0.24)",
    "borderBottomStyle": "solid",
    "borderBottomWidth": "1px",
    "paddingBottom": "8px",
    "width": "100%",
  },
  "meterRowStyle": {
    "alignItems": "center",
    "columnGap": "10px",
    "display": "flex",
    "flexDirection": "row",
    "justifyContent": "space-between",
    "rowGap": "10px",
  },
  "knobRowStyle": {
    "alignItems": "center",
    "columnGap": "10px",
    "display": "flex",
    "flexDirection": "row",
    "justifyContent": "space-between",
    "rowGap": "10px",
  },
  "mixBlockStyle": {
    "alignItems": "center",
    "columnGap": "10px",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "10px",
  },
  "headerStrongStyle": {
    "color": { default: null, [stylex.when.ancestor(":is(*)", headerMarker)]: "#6ef6ff" },
    "letterSpacing": { default: null, [stylex.when.ancestor(":is(*)", headerMarker)]: "0.12em" }
  },
  "headerSmallStyle": {
    "color": { default: null, [stylex.when.ancestor(":is(*)", headerMarker)]: "rgba(198, 226, 236, 0.66)" }
  },
  "compareRowStyle": {
    "columnGap": "8px",
    "display": "flex",
    "flexWrap": "wrap",
    "rowGap": "8px",
  },
  "compareRowChildStyle": {
    "flex": { default: null, [stylex.when.ancestor(":is(*)", compareRowMarker)]: "1 1 92px" }
  },
  "tallMeterStyle": {
    "minHeight": "178px",
    "width": "94px"
  },
});

const styles = {
  "compare-row": [stylex.attrs(compareRowMarker).class, stylex.attrs(definitions["compareRowStyle"]).class].join(" "),
  "compare-row-child": [stylex.attrs(definitions["compareRowChildStyle"]).class].join(" "),
  "header": [stylex.attrs(headerMarker).class, stylex.attrs(definitions["headerStyle"]).class].join(" "),
  "header-small": [stylex.attrs(definitions["headerSmallStyle"]).class].join(" "),
  "header-strong": [stylex.attrs(definitions["headerStrongStyle"]).class].join(" "),
  "knob-row": [stylex.attrs(definitions["knobRowStyle"]).class].join(" "),
  "meter-row": [stylex.attrs(definitions["meterRowStyle"]).class].join(" "),
  "mix-block": [stylex.attrs(definitions["mixBlockStyle"]).class].join(" "),
  "rack": [stylex.attrs(definitions["rackStyle"]).class].join(" "),
  "tall-meter": [stylex.attrs(definitions["tallMeterStyle"]).class].join(" "),
} as const;

export default styles;
