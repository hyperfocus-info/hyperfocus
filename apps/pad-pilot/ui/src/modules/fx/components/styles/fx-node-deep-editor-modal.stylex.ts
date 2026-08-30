import * as stylex from "@stylexjs/stylex";

const definitions = stylex.create({
  "editorStyle": {
    "columnGap": "16px",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "16px",
    "minHeight": "520px",
  },
  "editorBodyStyle": {
    "columnGap": "16px",
    "display": "flex",
    "flexDirection": "column",
    "rowGap": "16px",
  },
  "editorToolbarStyle": {
    "alignItems": "center",
    "columnGap": "12px",
    "display": "flex",
    "justifyContent": "space-between",
    "rowGap": "12px",
  },
  "editorChipStyle": {
    "backgroundColor": "rgba(77, 233, 255, 0.12)",
    "backgroundImage": "none",
    "color": "#67efff",
    "fontSize": "0.74rem",
    "letterSpacing": "0.14em",
    "borderBottomLeftRadius": "999px",
    "borderBottomRightRadius": "999px",
    "borderTopLeftRadius": "999px",
    "borderTopRightRadius": "999px",
    "paddingBottom": "6px",
    "paddingLeft": "12px",
    "paddingRight": "12px",
    "paddingTop": "6px",
  },
});

const styles = {
  "editor": [stylex.attrs(definitions["editorStyle"]).class].join(" "),
  "editor-body": [stylex.attrs(definitions["editorBodyStyle"]).class].join(" "),
  "editor-chip": [stylex.attrs(definitions["editorChipStyle"]).class].join(" "),
  "editor-toolbar": [stylex.attrs(definitions["editorToolbarStyle"]).class].join(" "),
} as const;

export default styles;
