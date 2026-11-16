import "@hyperfocus/ui/stylex-entry.css";
import { render } from "solid-js/web";
import "uplot/dist/uPlot.min.css";
import "./styles.css";
import { DashboardApp } from "./app";

const root = document.getElementById("app");
if (!root) throw new Error("Dashboard root is missing.");
render(() => <DashboardApp />, root);
