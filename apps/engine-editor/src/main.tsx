import "../../../packages/ui/src/stylex-entry.css";
import { render } from "solid-js/web";
import { EditorAiPanel } from "./editor-ai-panel";
import "./client";

const aiRoot = document.getElementById("editor-ai-root");
if (!aiRoot) throw new Error("Missing editor AI mount point");
render(() => <EditorAiPanel />, aiRoot);

