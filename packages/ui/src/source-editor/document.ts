export type SourceDiagnostic = {
  from: number;
  to: number;
  severity: "info" | "warning" | "error";
  message: string;
};

export type SourceDocumentOptions = {
  uri: string;
  language: string;
  text: string;
  save?: (text: string) => Promise<void>;
};

export type SourceDocumentSnapshot = Readonly<{
  uri: string;
  language: string;
  text: string;
  savedText: string;
  dirty: boolean;
  saving: boolean;
  version: number;
}>;

export function createSourceDocument(options: SourceDocumentOptions) {
  let snapshot: SourceDocumentSnapshot = Object.freeze({ uri: options.uri, language: options.language, text: options.text, savedText: options.text, dirty: false, saving: false, version: 0 });
  const listeners = new Set<(value: SourceDocumentSnapshot) => void>();
  const notify = (listener: (value: SourceDocumentSnapshot) => void) => {
    try { listener(snapshot); }
    catch { /* A failed view cannot interrupt edits, persistence, or other observers. */ }
  };
  const publish = (patch: Partial<SourceDocumentSnapshot>) => {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    for (const listener of listeners) notify(listener);
  };
  let pendingSave: Promise<void> | undefined;
  const save = (): Promise<void> => {
    if (pendingSave) return pendingSave;
    const write = options.save;
    if (!write || !snapshot.dirty) return Promise.resolve();
    const text = snapshot.text;
    pendingSave = Promise.resolve().then(() => write(text)).then(() => {
      pendingSave = undefined;
      publish({ savedText: text, dirty: snapshot.text !== text, saving: false });
    }, (error) => {
      pendingSave = undefined;
      publish({ saving: false });
      throw error;
    });
    const pending = pendingSave;
    publish({ saving: true });
    return pending;
  };
  return {
    getSnapshot: () => snapshot,
    setText(text: string) { publish({ text, dirty: text !== snapshot.savedText, version: snapshot.version + 1 }); },
    reload(text: string) { publish({ text, savedText: text, dirty: false, version: snapshot.version + 1 }); },
    save,
    /** Save-and-close boundary: wait for pending writes and persist newer edits. */
    async flush() {
      if (!options.save) return;
      while (pendingSave || snapshot.dirty) await save();
    },
    subscribe(listener: (value: SourceDocumentSnapshot) => void) { listeners.add(listener); notify(listener); return () => listeners.delete(listener); }
  };
}

export type SourceDocument = ReturnType<typeof createSourceDocument>;
