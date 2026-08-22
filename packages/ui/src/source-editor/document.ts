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

export type SourceDocumentSnapshot = {
  uri: string;
  language: string;
  text: string;
  savedText: string;
  dirty: boolean;
  saving: boolean;
  version: number;
};

export function createSourceDocument(options: SourceDocumentOptions) {
  let snapshot: SourceDocumentSnapshot = { uri: options.uri, language: options.language, text: options.text, savedText: options.text, dirty: false, saving: false, version: 0 };
  const listeners = new Set<(value: SourceDocumentSnapshot) => void>();
  const publish = (patch: Partial<SourceDocumentSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener(snapshot);
  };
  return {
    getSnapshot: () => snapshot,
    setText(text: string) { publish({ text, dirty: text !== snapshot.savedText, version: snapshot.version + 1 }); },
    reload(text: string) { publish({ text, savedText: text, dirty: false, version: snapshot.version + 1 }); },
    async save() {
      if (!options.save || !snapshot.dirty || snapshot.saving) return;
      const text = snapshot.text;
      publish({ saving: true });
      try {
        await options.save(text);
        publish({ savedText: text, dirty: snapshot.text !== text, saving: false });
      } catch (error) {
        publish({ saving: false });
        throw error;
      }
    },
    subscribe(listener: (value: SourceDocumentSnapshot) => void) { listeners.add(listener); listener(snapshot); return () => listeners.delete(listener); }
  };
}

export type SourceDocument = ReturnType<typeof createSourceDocument>;

