import * as stylex from "@stylexjs/stylex";

const definitions = stylex.create({
  "rootStyle": {
    "columnGap": "0.75rem",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "0.75rem",
  },
  "headerStyle": {
    "alignItems": "center",
    "columnGap": "0.75rem",
    "display": "flex",
    "flexWrap": "wrap",
    "justifyContent": "space-between",
    "rowGap": "0.75rem",
  },
  "labelBlockStyle": {
    "columnGap": "0.25rem",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "0.25rem",
  },
  "labelStyle": {
    "color": "rgba(255, 255, 255, 0.92)",
    "fontSize": "0.9rem",
    "fontWeight": 600
  },
  "descriptionStyle": {
    "color": "rgba(255, 255, 255, 0.62)",
    "fontSize": "0.8rem"
  },
  "actionsStyle": {
    "columnGap": "0.5rem",
    "display": "flex",
    "flexWrap": "wrap",
    "rowGap": "0.5rem",
  },
  "summaryStyle": {
    "backgroundColor": "rgba(9, 13, 24, 0.72)",
    "backgroundImage": "none",
    "color": "rgba(255, 255, 255, 0.88)",
    "borderBottomColor": "rgba(255, 255, 255, 0.12)",
    "borderBottomLeftRadius": "0.85rem",
    "borderBottomRightRadius": "0.85rem",
    "borderBottomStyle": "solid",
    "borderBottomWidth": "1px",
    "borderLeftColor": "rgba(255, 255, 255, 0.12)",
    "borderLeftStyle": "solid",
    "borderLeftWidth": "1px",
    "borderRightColor": "rgba(255, 255, 255, 0.12)",
    "borderRightStyle": "solid",
    "borderRightWidth": "1px",
    "borderTopColor": "rgba(255, 255, 255, 0.12)",
    "borderTopLeftRadius": "0.85rem",
    "borderTopRightRadius": "0.85rem",
    "borderTopStyle": "solid",
    "borderTopWidth": "1px",
    "paddingBottom": "0.85rem",
    "paddingLeft": "1rem",
    "paddingRight": "1rem",
    "paddingTop": "0.85rem",
  },
  "statusStyle": {
    "color": "rgba(126, 200, 255, 0.9)",
    "fontSize": "0.8rem"
  },
  "warningStyle": {
    "color": "rgba(255, 182, 93, 0.92)",
    "fontSize": "0.8rem"
  },
  "editorStyle": {
    "columnGap": "0.75rem",
    "display": "grid",
    "gridTemplateColumns": "repeat(auto-fit, minmax(180px, 1fr))",
    "rowGap": "0.75rem",
  },
});

const styles = {
  "actions": [stylex.attrs(definitions["actionsStyle"]).class].join(" "),
  "description": [stylex.attrs(definitions["descriptionStyle"]).class].join(" "),
  "editor": [stylex.attrs(definitions["editorStyle"]).class].join(" "),
  "header": [stylex.attrs(definitions["headerStyle"]).class].join(" "),
  "label": [stylex.attrs(definitions["labelStyle"]).class].join(" "),
  "label-block": [stylex.attrs(definitions["labelBlockStyle"]).class].join(" "),
  "root": [stylex.attrs(definitions["rootStyle"]).class].join(" "),
  "status": [stylex.attrs(definitions["statusStyle"]).class].join(" "),
  "summary": [stylex.attrs(definitions["summaryStyle"]).class].join(" "),
  "warning": [stylex.attrs(definitions["warningStyle"]).class].join(" "),
} as const;

export default styles;
