import { render } from "solid-js/web";
import "@uploadthing/solid/styles.css";
import "./styles/global.css";
import App from "./app";

const root = document.getElementById("root");
if (root !== null) {
  render(() => <App />, root);
}

