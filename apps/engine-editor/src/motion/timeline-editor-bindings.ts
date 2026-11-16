import { editorSelect, selectEventValue } from "../components/editor-select-controls";
import type { ChoreographyRecipeId } from "./choreography-recipes.ts";

type Easing = "linear" | "ease-in" | "ease-out" | "ease-in-out" | "bounce";
type Context = {
  durationFrames(): number;
  loopStart(): number;
  loopEnd(): number;
  frame(): number;
  zoom(): number;
  setFrame(frame: number): void;
  setSnap(active: boolean): void;
  setBeatGrid(active: boolean): void;
  setZoom(value: number): void;
  setView(view: "dope" | "graph"): void;
  render(filter?: string): void;
  togglePlayback(): void;
  logOnion(active: boolean): void;
  setBpm(value: number): void;
  setFps(value: number): void;
  setSpeed(value: number): void;
  tapTempo(): void;
  addEvent(): void;
  findTransients(): void;
  addTrack(): void;
  applyRecipe(recipe: ChoreographyRecipeId): void;
  setClipCue(): void;
  previewExport(): void;
  previewStage(): void;
  updateMixer(): void;
  toggleMixer(property: "muted" | "solo"): void;
  editKeys(property: "frame" | "value", value: number): void;
  copyKeys(): void;
  pasteKeys(): void;
  deleteKeys(): void;
  selectedKeyCount(): number;
  keyboardActive(): boolean;
  setEasing(easing: Easing): void;
  beginBoxSelect(event: PointerEvent): void;
  commit(label: string): void;
};

export function bindTimelineEditor(context: Context) {
  const ruler = required<HTMLElement>("#sequence-ruler");
  const scrub = (event: PointerEvent) => { const rect = ruler.getBoundingClientRect(); context.setFrame((event.clientX - rect.left) / rect.width * context.durationFrames() / context.zoom()); };
  ruler.addEventListener("pointerdown", (event) => { scrub(event); ruler.setPointerCapture(event.pointerId); });
  ruler.addEventListener("pointermove", (event) => { if (ruler.hasPointerCapture(event.pointerId)) scrub(event); });
  required("#sequence-play").addEventListener("click", context.togglePlayback);
  required("#sequence-jump-start").addEventListener("click", () => context.setFrame(context.loopStart()));
  required("#sequence-jump-end").addEventListener("click", () => context.setFrame(context.loopEnd()));
  required("#sequence-step-back").addEventListener("click", () => context.setFrame(context.frame() - 1));
  required("#sequence-step-forward").addEventListener("click", () => context.setFrame(context.frame() + 1));
  bindToggle("#sequence-snap", context.setSnap); bindToggle("#sequence-beat-grid", (active) => { context.setBeatGrid(active); context.render(); }); bindToggle("#sequence-onion", context.logOnion);
  required<HTMLInputElement>("#sequence-track-filter").addEventListener("input", (event) => context.render(current(event).value));
  required<HTMLInputElement>("#sequence-bpm").addEventListener("change", (event) => { context.setBpm(Math.max(20, Math.min(400, Number(current(event).value)))); context.render(); context.commit("Change sequence tempo"); });
  editorSelect("#sequence-fps").element.addEventListener("change", (event) => { context.setFps(Number(current(event).value)); context.render(); context.commit("Change sequence frame rate"); });
  editorSelect("#sequence-speed").element.addEventListener("change", (event) => { context.setSpeed(Number(current(event).value)); context.commit("Change timeline playback speed"); });
  required<HTMLInputElement>("#sequence-zoom").addEventListener("input", (event) => { context.setZoom(Number(current(event).value)); context.render(); });
  document.querySelectorAll<HTMLButtonElement>("[data-sequence-view]").forEach((button) => button.addEventListener("click", () => {
    const view = button.dataset.sequenceView === "graph" ? "graph" : "dope"; context.setView(view);
    document.querySelectorAll<HTMLElement>("[data-sequence-view]").forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
    required<HTMLElement>("#sequence-canvas").hidden = view === "graph"; ruler.hidden = view === "graph"; required<HTMLElement>("#curve-editor").hidden = view !== "graph";
  }));
  required("#sequence-normalize").addEventListener("click", () => { context.setZoom(1); required<HTMLInputElement>("#sequence-zoom").value = "1"; context.render(); });
  required("#tap-tempo").addEventListener("click", context.tapTempo); required("#add-sequence-event").addEventListener("click", context.addEvent); required("#find-audio-transients").addEventListener("click", context.findTransients); required("#add-sequence-track").addEventListener("click", context.addTrack);
  document.querySelectorAll<HTMLButtonElement>("[data-choreography-recipe]").forEach((button) => button.addEventListener("click", () => { const recipe = button.dataset.choreographyRecipe; if (recipe === "anticipation" || recipe === "lunge" || recipe === "impact" || recipe === "bite" || recipe === "transform") context.applyRecipe(recipe); }));
  required("#set-clip-cue").addEventListener("click", context.setClipCue); required("#sequence-export").addEventListener("click", context.previewExport); required("#sequence-preview-stage").addEventListener("click", context.previewStage);
  required<HTMLInputElement>("#mixer-volume").addEventListener("input", context.updateMixer); required<HTMLInputElement>("#mixer-pan").addEventListener("input", context.updateMixer); required("#mixer-mute").addEventListener("click", () => context.toggleMixer("muted")); required("#mixer-solo").addEventListener("click", () => context.toggleMixer("solo"));
  required<HTMLInputElement>("#key-frame-input").addEventListener("change", (event) => context.editKeys("frame", Number(current(event).value))); required<HTMLInputElement>("#key-value-input").addEventListener("change", (event) => context.editKeys("value", Number(current(event).value)));
  required("#copy-sequence-keys").addEventListener("click", context.copyKeys); required("#delete-sequence-keys").addEventListener("click", context.deleteKeys);
  editorSelect("#key-easing").element.addEventListener("change", (event) => context.setEasing(asEasing(current(event).value))); document.querySelectorAll<HTMLButtonElement>("[data-easing]").forEach((button) => button.addEventListener("click", () => context.setEasing(asEasing(button.dataset.easing))));
  required<HTMLElement>("#sequence-canvas").addEventListener("pointerdown", context.beginBoxSelect);
  window.addEventListener("keydown", (event) => {
    const target = event.target; const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
    if (typing || !context.keyboardActive()) return;
    if (event.key === "," || event.key === ".") { context.setFrame(context.frame() + (event.key === "." ? 1 : -1)); event.preventDefault(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") { context.copyKeys(); event.preventDefault(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") { context.pasteKeys(); event.preventDefault(); return; }
    if ((event.key === "Delete" || event.key === "Backspace") && context.selectedKeyCount()) { context.deleteKeys(); event.preventDefault(); }
  });
}

function bindToggle(selector: string, update: (active: boolean) => void) {
  const button = required<HTMLButtonElement>(selector);
  button.addEventListener("click", () => { const active = !button.classList.contains("is-active"); button.classList.toggle("is-active", active); button.setAttribute("aria-pressed", String(active)); update(active); });
}
function asEasing(value?: string): Easing { return value === "ease-in" || value === "ease-out" || value === "ease-in-out" || value === "bounce" ? value : "linear"; }
function current(event: Event) {
 const target = event.currentTarget;
 if (target instanceof HTMLButtonElement) return { value: selectEventValue(event) };
 if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) throw new Error("Timeline event must come from a value control.");
 return target;
}
function required<T extends Element = HTMLElement>(selector: string) { const element = document.querySelector<T>(selector); if (!element) throw new Error(`Timeline markup is missing ${selector}`); return element; }
