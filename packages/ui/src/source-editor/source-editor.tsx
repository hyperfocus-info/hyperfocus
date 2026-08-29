import * as stylex from "@stylexjs/stylex";
import { EditorState } from "@codemirror/state";
import { basicSetup, EditorView } from "codemirror";
import { onCleanup, onMount } from "solid-js";
import { tokens } from "../theme/tokens.stylex";
import type { SourceDiagnostic, SourceDocument } from "./document";

const styles = stylex.create({
  root: { overflow: "hidden", backgroundColor: tokens.background, color: tokens.foreground, fontSize: "0.78rem", height: "100%", minHeight: "10rem", width: "100%", }
});

export function SourceEditor(props: { document: SourceDocument; diagnostics?: readonly SourceDiagnostic[]; readOnly?: boolean; onSaveError?: (error: unknown) => void }) {
  let host: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let applyingDocumentChange = false;
  onMount(() => {
    if (!host) return;
    const initial = props.document.getSnapshot();
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initial.text,
        extensions: [
          basicSetup,
          EditorState.readOnly.of(Boolean(props.readOnly)),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !applyingDocumentChange) props.document.setText(update.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            keydown(event) {
              if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                void props.document.save().catch(props.onSaveError);
                return true;
              }
              return false;
            }
          })
        ]
      })
    });
    const unsubscribe = props.document.subscribe((snapshot) => {
      const current = view?.state.doc.toString();
      if (!view || current === snapshot.text) return;
      applyingDocumentChange = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: snapshot.text } });
      applyingDocumentChange = false;
    });
    onCleanup(() => { unsubscribe(); view?.destroy(); view = undefined; });
  });
  return <div ref={host} {...stylex.attrs(styles.root)} data-test-source-editor="" data-diagnostic-count={props.diagnostics?.length ?? 0} />;
}
