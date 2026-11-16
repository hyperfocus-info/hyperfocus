import type { ModeDefinition } from "@hyperfocus/ai-core/protocol";

export type ModeDraft = Omit<ModeDefinition, "scope" | "updatedAt">;
export type RetainedModeDraft = { draft: ModeDraft; selectedModeId?: string; creating: boolean; pending?: Promise<void> };
const owners = new WeakMap<object, Map<string, RetainedModeDraft>>();
const active = new Set<WeakRef<Map<string, RetainedModeDraft>>>();
const references = new WeakMap<Map<string, RetainedModeDraft>, WeakRef<Map<string, RetainedModeDraft>>>();
function hasDrafts() {
  let found = false;
  for (const reference of active) { const entries = reference.deref(); if (!entries?.size) active.delete(reference); else found = true; }
  return found;
}
function warnBeforeUnload(event: BeforeUnloadEvent) { if (hasDrafts()) { event.preventDefault(); event.returnValue = ""; } else window.removeEventListener("beforeunload", warnBeforeUnload); }

/** Session-only drafts follow the real store and project, never browser storage. */
export function modeDraftJournal(owner: object) {
  let drafts = owners.get(owner);
  if (!drafts) { drafts = new Map(); owners.set(owner, drafts); }
  const entries = drafts;
  let reference = references.get(entries);
  if (!reference) { reference = new WeakRef(entries); references.set(entries, reference); }
  const activeReference = reference;
  return {
    get: (key: string) => entries.get(key),
    set: (key: string, draft: RetainedModeDraft) => { entries.set(key, draft); active.add(activeReference); window.addEventListener("beforeunload", warnBeforeUnload); },
    delete: (key: string) => { entries.delete(key); if (!hasDrafts()) window.removeEventListener("beforeunload", warnBeforeUnload); }
  };
}
