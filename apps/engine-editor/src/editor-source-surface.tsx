import * as stylex from "@stylexjs/stylex";
import { createSourceDocument, SourceEditor, type SourceDocument } from "@hyperfocus/ui";
import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";

export type EditorSourceSurface = {
  load(file?: { path: string; source: string }): boolean;
  path(): string;
  dirty(): boolean;
  text(): string;
  save(): Promise<void>;
  dispose(): void;
};

export function createEditorSourceSession(options: { path: string; source: string; save: (source: string) => Promise<void> | void }) {
  return createSourceDocument({
    uri: options.path,
    language: "typescript",
    text: options.source,
    save: async (source) => { await options.save(source); },
  });
}

/** Mounts the shared CodeMirror surface while retaining a hidden textarea as a
 * compatibility seam for older automation and portable-editor integrations. */
export function mountEditorSourceSurface(options: {
  textarea: HTMLTextAreaElement;
  status: HTMLElement;
  lineCount: HTMLElement;
  save(path: string, source: string): Promise<void> | void;
}): EditorSourceSurface {
  const host = document.createElement("div");
  host.className = stylex.attrs(styles.host).class ?? "";
  host.dataset.solidOwner = "source-editor";
  options.textarea.hidden = true;
  options.textarea.setAttribute("aria-hidden", "true");
  options.textarea.after(host);
  const [documentState, setDocumentState] = createSignal<SourceDocument>();
  let unsubscribe: (() => void) | undefined;
  const syncCompatibilityInput = () => {
    documentState()?.setText(options.textarea.value);
  };
  options.textarea.addEventListener("input", syncCompatibilityInput);

  const disposeRender = render(() => (
    <div {...stylex.attrs(styles.root)}>
      <Show when={documentState()} keyed fallback={<p {...stylex.attrs(styles.empty)}>Create a TypeScript file to begin…</p>}>
        {(document) => <SourceEditor document={document} onSaveError={(error) => {
          options.status.textContent = error instanceof Error ? error.message : "Could not save source";
        }} />}
      </Show>
    </div>
  ), host);

  const load = (file?: { path: string; source: string }) => {
    const current = documentState();
    const currentSnapshot = current?.getSnapshot();
    if (currentSnapshot?.dirty && currentSnapshot.uri !== file?.path) {
      const discard = globalThis.confirm?.(`Discard unsaved changes in ${currentSnapshot.uri}?`) === true;
      if (!discard) {
        options.status.textContent = `Unsaved changes in ${currentSnapshot.uri} · save before switching`;
        return false;
      }
    }
    if (!file) {
      unsubscribe?.();
      unsubscribe = undefined;
      setDocumentState(undefined);
      options.textarea.value = "";
      options.textarea.disabled = true;
      options.status.textContent = "Create a script to begin";
      options.lineCount.textContent = "0 lines";
      return true;
    }
    if (current?.getSnapshot().uri === file.path) {
      const snapshot = current.getSnapshot();
      if (!snapshot.dirty && snapshot.text !== file.source) current.reload(file.source);
      return true;
    }
    unsubscribe?.();
    const next = createEditorSourceSession({ path: file.path, source: file.source, save: (source) => options.save(file.path, source) });
    unsubscribe = next.subscribe((snapshot) => {
      options.textarea.value = snapshot.text;
      options.textarea.disabled = false;
      options.status.textContent = snapshot.saving ? "Saving…" : snapshot.dirty ? "Unsaved script changes" : "Saved to project";
      options.lineCount.textContent = `${snapshot.text.split("\n").length} lines`;
    });
    setDocumentState(next);
    return true;
  };

  return {
    load,
    path: () => documentState()?.getSnapshot().uri ?? "",
    dirty: () => documentState()?.getSnapshot().dirty === true,
    text: () => documentState()?.getSnapshot().text ?? "",
    async save() { await documentState()?.save(); },
    dispose() {
      unsubscribe?.();
      options.textarea.removeEventListener("input", syncCompatibilityInput);
      disposeRender();
      host.remove();
      options.textarea.hidden = false;
      options.textarea.removeAttribute("aria-hidden");
    },
  };
}

const styles = stylex.create({
  host: { overflow: "hidden", flexBasis: 0, flexGrow: 1, flexShrink: 1, minHeight: 0, },
  root: { overflow: "hidden", height: "100%", minHeight: 0, },
  empty: { margin: 0, alignItems: "center", color: "#91a6aa", display: "flex", justifyContent: "center", height: "100%", },
});
