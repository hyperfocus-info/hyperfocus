import stylex from "@stylexjs/stylex";
import { render } from "solid-js/web";

const styles = stylex.create({
  root: {
    color: "rgb(18, 52, 86)",
    display: "grid"
  }
});

render(() => <main {...stylex.attrs(styles.root)}>StyleX + Solid</main>, document.body);
