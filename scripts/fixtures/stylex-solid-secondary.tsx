import stylex from "@stylexjs/stylex";
import { render } from "solid-js/web";

const styles = stylex.create({
  root: {
    backgroundColor: "rgb(86, 52, 18)",
    width: { default: "100%", "@media (min-width: 640px)": "20rem" }
  }
});

render(() => <aside {...stylex.attrs(styles.root)}>Concurrent StyleX + Solid</aside>, document.body);
