import { render } from "solid-js/web";
import "@uploadthing/solid/styles.css";
import "./components/elements/element-typography.module.css";
import App from "./app";

const root = document.getElementById("root");
if (root !== null) {
  render(() => <App />, root);
}

