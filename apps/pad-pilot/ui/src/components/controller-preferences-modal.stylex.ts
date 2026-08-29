import * as stylex from "@stylexjs/stylex";

export const mappingRowTitleMarker = stylex.defineMarker();
export const learnItemMarker = stylex.defineMarker();

const definitions = stylex.create({
  "panelStyle": {
    "columnGap": "1rem",
    "display": "grid",
    "rowGap": "1rem",
  },
  "rowListStyle": {
    "columnGap": "0.75rem",
    "display": "grid",
    "rowGap": "0.75rem",
  },
  "mappingRowStyle": {
    "backgroundColor": "rgba(255, 255, 255, 0.03)",
    "backgroundImage": "none",
    "columnGap": "0.75rem",
    "display": "grid",
    "rowGap": "0.75rem",
    "borderBottomColor": "rgba(255, 255, 255, 0.08)",
    "borderBottomLeftRadius": "0.85rem",
    "borderBottomRightRadius": "0.85rem",
    "borderBottomStyle": "solid",
    "borderBottomWidth": "1px",
    "borderLeftColor": "rgba(255, 255, 255, 0.08)",
    "borderLeftStyle": "solid",
    "borderLeftWidth": "1px",
    "borderRightColor": "rgba(255, 255, 255, 0.08)",
    "borderRightStyle": "solid",
    "borderRightWidth": "1px",
    "borderTopColor": "rgba(255, 255, 255, 0.08)",
    "borderTopLeftRadius": "0.85rem",
    "borderTopRightRadius": "0.85rem",
    "borderTopStyle": "solid",
    "borderTopWidth": "1px",
    "paddingBottom": "0.9rem",
    "paddingLeft": "0.9rem",
    "paddingRight": "0.9rem",
    "paddingTop": "0.9rem",
  },
  "mappingRowHeaderStyle": {
    "alignItems": "center",
    "columnGap": "0.75rem",
    "display": "flex",
    "justifyContent": "space-between",
    "rowGap": "0.75rem",
  },
  "mappingRowTitleStyle": {
    "columnGap": "0.15rem",
    "display": "grid",
    "rowGap": "0.15rem",
  },
  "mappingRowTitleStrongStyle": {
    "fontSize": { default: null, [stylex.when.ancestor(":is(*)", mappingRowTitleMarker)]: "0.95rem" }
  },
  "mappingRowTitleSpanStyle": {
    "fontSize": { default: null, [stylex.when.ancestor(":is(*)", mappingRowTitleMarker)]: "0.78rem" },
    "opacity": { default: null, [stylex.when.ancestor(":is(*)", mappingRowTitleMarker)]: "0.8" }
  },
  "mappingRowFieldsStyle": {
    "columnGap": "0.75rem",
    "display": "grid",
    "gridTemplateColumns": "repeat(auto-fit, minmax(12rem, 1fr))",
    "rowGap": "0.75rem",
  },
  "mappingRowActionsStyle": {
    "columnGap": "0.5rem",
    "display": "flex",
    "flexWrap": "wrap",
    "rowGap": "0.5rem",
  },
  "footerActionsStyle": {
    "columnGap": "0.75rem",
    "display": "flex",
    "justifyContent": "space-between",
    "rowGap": "0.75rem",
  },
  "savedLayoutRowStyle": {
    "columnGap": "0.75rem",
    "display": "grid",
    "gridTemplateColumns": "repeat(auto-fit, minmax(12rem, 1fr))",
    "rowGap": "0.75rem",
  },
  "learnGridStyle": {
    "columnGap": "0.75rem",
    "display": "grid",
    "gridTemplateColumns": "repeat(auto-fit, minmax(12rem, 1fr))",
    "rowGap": "0.75rem",
  },
  "learnItemStyle": {
    "backgroundColor": "rgba(255, 255, 255, 0.025)",
    "backgroundImage": "none",
    "columnGap": "0.35rem",
    "display": "grid",
    "rowGap": "0.35rem",
    "borderBottomColor": "rgba(255, 255, 255, 0.08)",
    "borderBottomLeftRadius": "0.85rem",
    "borderBottomRightRadius": "0.85rem",
    "borderBottomStyle": "solid",
    "borderBottomWidth": "1px",
    "borderLeftColor": "rgba(255, 255, 255, 0.08)",
    "borderLeftStyle": "solid",
    "borderLeftWidth": "1px",
    "borderRightColor": "rgba(255, 255, 255, 0.08)",
    "borderRightStyle": "solid",
    "borderRightWidth": "1px",
    "borderTopColor": "rgba(255, 255, 255, 0.08)",
    "borderTopLeftRadius": "0.85rem",
    "borderTopRightRadius": "0.85rem",
    "borderTopStyle": "solid",
    "borderTopWidth": "1px",
    "paddingBottom": "0.75rem",
    "paddingLeft": "0.75rem",
    "paddingRight": "0.75rem",
    "paddingTop": "0.75rem",
  },
  "learnItemStrongStyle": {
    "fontSize": { default: null, [stylex.when.ancestor(":is(*)", learnItemMarker)]: "0.85rem" }
  },
  "learnItemSpanStyle": {
    "fontSize": { default: null, [stylex.when.ancestor(":is(*)", learnItemMarker)]: "0.76rem" },
    "opacity": { default: null, [stylex.when.ancestor(":is(*)", learnItemMarker)]: "0.82" }
  },
  "learnActionsStyle": {
    "columnGap": "0.5rem",
    "display": "flex",
    "flexWrap": "wrap",
    "rowGap": "0.5rem",
  },
  "statusLineStyle": {
    "fontSize": "0.8rem",
    "opacity": "0.78"
  },
});

const styles = {
  "footer-actions": [stylex.attrs(definitions["footerActionsStyle"]).class].join(" "),
  "learn-actions": [stylex.attrs(definitions["learnActionsStyle"]).class].join(" "),
  "learn-grid": [stylex.attrs(definitions["learnGridStyle"]).class].join(" "),
  "learn-item": [stylex.attrs(learnItemMarker).class, stylex.attrs(definitions["learnItemStyle"]).class].join(" "),
  "learn-item-span": [stylex.attrs(definitions["learnItemSpanStyle"]).class].join(" "),
  "learn-item-strong": [stylex.attrs(definitions["learnItemStrongStyle"]).class].join(" "),
  "mapping-row": [stylex.attrs(definitions["mappingRowStyle"]).class].join(" "),
  "mapping-row-actions": [stylex.attrs(definitions["mappingRowActionsStyle"]).class].join(" "),
  "mapping-row-fields": [stylex.attrs(definitions["mappingRowFieldsStyle"]).class].join(" "),
  "mapping-row-header": [stylex.attrs(definitions["mappingRowHeaderStyle"]).class].join(" "),
  "mapping-row-title": [stylex.attrs(mappingRowTitleMarker).class, stylex.attrs(definitions["mappingRowTitleStyle"]).class].join(" "),
  "mapping-row-title-span": [stylex.attrs(definitions["mappingRowTitleSpanStyle"]).class].join(" "),
  "mapping-row-title-strong": [stylex.attrs(definitions["mappingRowTitleStrongStyle"]).class].join(" "),
  "panel": [stylex.attrs(definitions["panelStyle"]).class].join(" "),
  "row-list": [stylex.attrs(definitions["rowListStyle"]).class].join(" "),
  "saved-layout-row": [stylex.attrs(definitions["savedLayoutRowStyle"]).class].join(" "),
  "status-line": [stylex.attrs(definitions["statusLineStyle"]).class].join(" "),
} as const;

export default styles;
