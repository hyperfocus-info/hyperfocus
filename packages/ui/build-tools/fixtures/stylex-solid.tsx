import stylex from "@stylexjs/stylex";
import { render } from "solid-js/web";

const styles = stylex.create({
  root: {
    padding: { default: null, "@media (min-width: 1024px)": "1rem" },
    alignItems: { default: null, "@media (min-width: 1024px)": "center" },
    color: "rgb(18, 52, 86)",
    display: "grid",
    flexDirection: { default: "column", "@media (min-width: 1024px)": "row" },
  }
});

render(() => <main {...stylex.attrs(styles.root)}>StyleX + Solid</main>, document.body);
