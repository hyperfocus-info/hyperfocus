import * as stylex from "@stylexjs/stylex";

export const headerMarker = stylex.defineMarker();
export const sectionHeaderMarker = stylex.defineMarker();

const definitions = stylex.create({
  "rootStyle": {
    "columnGap": "16px",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "16px",
    "minWidth": "0",
  },
  "headerStyle": {
    "columnGap": "4px",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "4px",
  },
  "headerH3Style": {
    "color": { default: null, [stylex.when.ancestor(":is(*)", headerMarker)]: "#eff9ff" },
    "fontSize": { default: null, [stylex.when.ancestor(":is(*)", headerMarker)]: "0.98rem" },
    "letterSpacing": { default: null, [stylex.when.ancestor(":is(*)", headerMarker)]: "0.06em" },
    "marginBottom": { default: null, [stylex.when.ancestor(":is(*)", headerMarker)]: "0" },
    "marginLeft": { default: null, [stylex.when.ancestor(":is(*)", headerMarker)]: "0" },
    "marginRight": { default: null, [stylex.when.ancestor(":is(*)", headerMarker)]: "0" },
    "marginTop": { default: null, [stylex.when.ancestor(":is(*)", headerMarker)]: "0" },
  },
  "headerPStyle": {
    "color": { default: null, [stylex.when.ancestor(":is(*)", headerMarker)]: "rgba(196, 223, 242, 0.76)" },
    "fontSize": { default: null, [stylex.when.ancestor(":is(*)", headerMarker)]: "0.88rem" },
    "marginBottom": { default: null, [stylex.when.ancestor(":is(*)", headerMarker)]: "0" },
    "marginLeft": { default: null, [stylex.when.ancestor(":is(*)", headerMarker)]: "0" },
    "marginRight": { default: null, [stylex.when.ancestor(":is(*)", headerMarker)]: "0" },
    "marginTop": { default: null, [stylex.when.ancestor(":is(*)", headerMarker)]: "0" },
  },
  "bodyStyle": {
    "columnGap": "14px",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "14px",
  },
  "sectionStyle": {
    "backgroundColor": "rgba(11, 19, 31, 0.86)",
    "backgroundImage": "none",
    "columnGap": "10px",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "10px",
    "borderBottomColor": "rgba(94, 142, 180, 0.26)",
    "borderBottomLeftRadius": "16px",
    "borderBottomRightRadius": "16px",
    "borderBottomStyle": "solid",
    "borderBottomWidth": "1px",
    "borderLeftColor": "rgba(94, 142, 180, 0.26)",
    "borderLeftStyle": "solid",
    "borderLeftWidth": "1px",
    "borderRightColor": "rgba(94, 142, 180, 0.26)",
    "borderRightStyle": "solid",
    "borderRightWidth": "1px",
    "borderTopColor": "rgba(94, 142, 180, 0.26)",
    "borderTopLeftRadius": "16px",
    "borderTopRightRadius": "16px",
    "borderTopStyle": "solid",
    "borderTopWidth": "1px",
    "paddingBottom": "14px",
    "paddingLeft": "14px",
    "paddingRight": "14px",
    "paddingTop": "14px",
  },
  "sectionHeaderStyle": {
    "columnGap": "3px",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "3px",
  },
  "sectionHeaderH4Style": {
    "color": { default: null, [stylex.when.ancestor(":is(*)", sectionHeaderMarker)]: "#9ae7ff" },
    "fontSize": { default: null, [stylex.when.ancestor(":is(*)", sectionHeaderMarker)]: "0.82rem" },
    "letterSpacing": { default: null, [stylex.when.ancestor(":is(*)", sectionHeaderMarker)]: "0.08em" },
    "textTransform": { default: null, [stylex.when.ancestor(":is(*)", sectionHeaderMarker)]: "uppercase" },
    "marginBottom": { default: null, [stylex.when.ancestor(":is(*)", sectionHeaderMarker)]: "0" },
    "marginLeft": { default: null, [stylex.when.ancestor(":is(*)", sectionHeaderMarker)]: "0" },
    "marginRight": { default: null, [stylex.when.ancestor(":is(*)", sectionHeaderMarker)]: "0" },
    "marginTop": { default: null, [stylex.when.ancestor(":is(*)", sectionHeaderMarker)]: "0" },
  },
  "sectionHeaderPStyle": {
    "color": { default: null, [stylex.when.ancestor(":is(*)", sectionHeaderMarker)]: "rgba(196, 223, 242, 0.72)" },
    "fontSize": { default: null, [stylex.when.ancestor(":is(*)", sectionHeaderMarker)]: "0.82rem" },
    "marginBottom": { default: null, [stylex.when.ancestor(":is(*)", sectionHeaderMarker)]: "0" },
    "marginLeft": { default: null, [stylex.when.ancestor(":is(*)", sectionHeaderMarker)]: "0" },
    "marginRight": { default: null, [stylex.when.ancestor(":is(*)", sectionHeaderMarker)]: "0" },
    "marginTop": { default: null, [stylex.when.ancestor(":is(*)", sectionHeaderMarker)]: "0" },
  },
});

const styles = {
  "body": [stylex.attrs(definitions["bodyStyle"]).class].join(" "),
  "header": [stylex.attrs(headerMarker).class, stylex.attrs(definitions["headerStyle"]).class].join(" "),
  "header-h3": [stylex.attrs(definitions["headerH3Style"]).class].join(" "),
  "header-p": [stylex.attrs(definitions["headerPStyle"]).class].join(" "),
  "root": [stylex.attrs(definitions["rootStyle"]).class].join(" "),
  "section": [stylex.attrs(definitions["sectionStyle"]).class].join(" "),
  "section-header": [stylex.attrs(sectionHeaderMarker).class, stylex.attrs(definitions["sectionHeaderStyle"]).class].join(" "),
  "section-header-h4": [stylex.attrs(definitions["sectionHeaderH4Style"]).class].join(" "),
  "section-header-p": [stylex.attrs(definitions["sectionHeaderPStyle"]).class].join(" "),
} as const;

export default styles;
