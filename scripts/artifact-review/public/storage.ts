import type { ArtifactItem, ArtifactReview } from "@hyperfocus/artifact-review/schema";

type Saved = { revision: number; updatedAt: string | null; review: ArtifactReview | null };
type State = { review: ArtifactReview; revision: number; serial: number; saved: number; conflict: boolean };

export function createReviewStore(options: { campaign: string; onStatus: (message: string, failed: boolean) => void; onSaved: () => void }) {
  const states = new Map<string, State>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flushing = false;
  return {
    initialize(items: ArtifactItem[], saved: Record<string, Saved>) {
      for (const item of items) {
        const current = saved[item.id];
        const compatible = current?.review?.version === item.version && current.review.sha256 === item.sha256;
        const review: ArtifactReview = compatible && current.review ? current.review : { version: item.version, sha256: item.sha256, grade: null, scores: {}, notes: "", annotations: [] };
        const state: State = { review, revision: compatible ? current?.revision || 0 : 0, serial: 0, saved: 0, conflict: false };
        states.set(item.id, state);
      }
    },
    get(id: string) { return states.get(id)!.review; },
    change(id: string) {
      const state = states.get(id)!;
      state.serial++;
      options.onStatus("Saving…", false);
      clearTimeout(timer);
      timer = setTimeout(() => void this.flush(), 350);
    },
    async flush() {
      if (flushing) return;
      flushing = true;
      let failed = false;
      try {
        for (const [id, state] of states) {
          while (state.serial > state.saved) {
            if (state.conflict) throw Error("Another device saved changes. Load the saved version before editing again.");
            const serial = state.serial;
            const response = await fetch(`/api/feedback/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: state.revision, review: state.review }) });
            if (response.status === 409) { state.conflict = true; throw Error("Another device saved changes. Load the saved version before editing again."); }
            if (!response.ok) throw Error(`Save failed (${response.status}). Keep this page open and retry; these changes are not saved.`);
            const result: Saved = await response.json();
            state.revision = result.revision;
            state.saved = serial;
          }
        }
        options.onStatus("Saved", false);
        options.onSaved();
      } catch (error) { failed = true; options.onStatus(error instanceof Error ? error.message : "Unable to save. Retry when connected.", true); }
      finally {
        flushing = false;
        if (!failed && this.pending()) timer = setTimeout(() => void this.flush(), 0);
      }
    },
    pending() { return [...states.values()].some(state => state.serial > state.saved); },
  };
}
