import * as stylex from "@stylexjs/stylex";

const definitions = stylex.create({
  "rootStyle": {
    "backgroundColor": "transparent",
    "backgroundImage": "linear-gradient(180deg, rgba(246, 237, 219, 0.92), rgba(211, 199, 175, 0.94))",
    "boxShadow": "inset 0 0 0 0.09rem rgba(255, 255, 255, 0.45),\n    0 0.9rem 1.8rem rgba(0, 0, 0, 0.14)",
    "color": "#17130d",
    "columnGap": "0.8rem",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "0.8rem",
    "borderBottomColor": "rgba(25, 22, 17, 0.72)",
    "borderBottomLeftRadius": "1.2rem",
    "borderBottomRightRadius": "1.2rem",
    "borderBottomStyle": "solid",
    "borderBottomWidth": "0.14rem",
    "borderLeftColor": "rgba(25, 22, 17, 0.72)",
    "borderLeftStyle": "solid",
    "borderLeftWidth": "0.14rem",
    "borderRightColor": "rgba(25, 22, 17, 0.72)",
    "borderRightStyle": "solid",
    "borderRightWidth": "0.14rem",
    "borderTopColor": "rgba(25, 22, 17, 0.72)",
    "borderTopLeftRadius": "1.2rem",
    "borderTopRightRadius": "1.2rem",
    "borderTopStyle": "solid",
    "borderTopWidth": "0.14rem",
    "paddingBottom": "1rem",
    "paddingLeft": "1rem",
    "paddingRight": "1rem",
    "paddingTop": "1rem",
  },
  "titleStyle": {
    "fontSize": "1rem",
    "letterSpacing": "0.08em",
    "textTransform": "uppercase"
  },
  "actionsStyle": {
    "columnGap": "0.65rem",
    "display": "flex",
    "flexWrap": "wrap",
    "rowGap": "0.65rem",
  },
  "dragButtonStyle": {
    flexBasis: '8.5rem',
    flexGrow: '1',
    flexShrink: '1',
  },
  "saveButtonStyle": {
    flexBasis: '8.5rem',
    flexGrow: '1',
    flexShrink: '1',
  },
  "statusStyle": {
    "color": "rgba(28, 22, 13, 0.72)",
    "fontSize": "0.8rem",
    "lineHeight": 1.4,
    "minHeight": "1.35rem",
  },
});

const styles = {
  "actions": [stylex.attrs(definitions["actionsStyle"]).class].join(" "),
  "drag-button": [stylex.attrs(definitions["dragButtonStyle"]).class].join(" "),
  "root": [stylex.attrs(definitions["rootStyle"]).class].join(" "),
  "save-button": [stylex.attrs(definitions["saveButtonStyle"]).class].join(" "),
  "status": [stylex.attrs(definitions["statusStyle"]).class].join(" "),
  "title": [stylex.attrs(definitions["titleStyle"]).class].join(" "),
} as const;

export default styles;
