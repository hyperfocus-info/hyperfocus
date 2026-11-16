import { requireDomId, requireHtmlElement as element, requireInput, requireButton } from "@hyperfocus/ui/dom";
import type { ArtifactManifest, ArtifactItem } from "@hyperfocus/artifact-review/schema";
import { createReviewStore } from "./storage";
import { createAnnotations } from "./annotations";
import { renderHistory } from "./history";
import { renderComparison, reviewEntries } from './comparison';

// These elements are owned by the bundled index.html, not caller-provided markup.

const notes = requireDomId("notes", HTMLTextAreaElement, document);
const search = requireInput("search", document);
let manifest: ArtifactManifest, active: ArtifactItem;
let store: ReturnType<typeof createReviewStore>;
const media = () => {
  const target = document.querySelector("#media video, #media audio");
  if (target === null) return null;
  if (!(target instanceof HTMLMediaElement)) throw new Error("Expected review media element");
  return target;
};
const annotations = createAnnotations({ item: () => active, review: () => store.get(active.id), media, changed: () => store.change(active.id) });

function status(message: string, failed: boolean) {
  element("save-status").textContent = message;
  element("retry").hidden = !failed;
  element("reload").hidden = !message.includes("Another device");
}

function navigation() {
  const entries = reviewEntries(manifest.items);
  const index = entries.findIndex(item => item.id === active.id || Boolean(active.comparison && item.comparison?.id === active.comparison.id));
  requireButton("previous", document).disabled = index <= 0;
  requireButton("next", document).disabled = index >= entries.length - 1;
  element("position").textContent = `${index + 1} / ${entries.length}`;
  const list = element("items"); list.replaceChildren();
  const query = search.value.toLowerCase();
  for (const item of entries.filter(item => `${item.title} ${item.description || ""}`.toLowerCase().includes(query))) {
    const button = document.createElement("button"), label = document.createElement("span"), meta = document.createElement("small");
    const selected = item.id === active.id || Boolean(active.comparison && item.comparison?.id === active.comparison.id);
    button.classList.toggle("active", selected); button.setAttribute("aria-pressed", String(selected));
    label.textContent = item.comparison ? item.title.replace(/ · after$/, '') : item.title; meta.textContent = `${item.comparison ? 'Before / after' : item.kind} · ${store.get(item.id).grade || "Unrated"}`;
    button.append(label, meta); button.onclick = () => select(item); list.append(button);
  }
  if (!list.children.length) list.textContent = "No matching outputs.";
}

function grades() {
  const list = element("grades"); list.replaceChildren();
  for (const grade of ["A", "B", "C", "D", "F", null] as const) {
    const button = document.createElement("button"); button.textContent = grade || "Unrated";
    button.setAttribute("aria-pressed", String(store.get(active.id).grade === grade));
    button.onclick = () => { store.get(active.id).grade = grade; store.change(active.id); grades(); navigation(); }; list.append(button);
  }
}

function scores() {
  const list = element("scores"); list.replaceChildren();
  for (const dimension of active.dimensions || []) {
    const row = document.createElement("div"), label = document.createElement("p"), choices = document.createElement("div");
    row.className = "score"; label.textContent = dimension.title; choices.className = "tools";
    const min = dimension.min ?? 1, max = dimension.max ?? 5;
    if (!Number.isInteger(min) || !Number.isInteger(max) || max - min > 7 || max - min < 2) {
      const input = document.createElement("input"); input.type = "number"; input.step = "any"; input.min = String(min); input.max = String(max);
      input.placeholder = `${min} to ${max}`; input.setAttribute("aria-label", dimension.title);
      input.value = store.get(active.id).scores[dimension.id]?.toString() || "";
      input.onchange = () => { if (input.checkValidity()) { store.get(active.id).scores[dimension.id] = input.value === "" ? null : Number(input.value); store.change(active.id); } else input.reportValidity(); };
      row.append(label, input); list.append(row); continue;
    }
    const values: (number | null)[] = [];
    for (let value = dimension.min ?? 1; value <= (dimension.max ?? 5); value++) values.push(value);
    values.push(null);
    for (const value of values) {
      const button = document.createElement("button"); button.textContent = value === null ? "Unrated" : String(value);
      button.setAttribute("aria-label", `${dimension.title}: ${button.textContent}`);
      button.setAttribute("aria-pressed", String((store.get(active.id).scores[dimension.id] ?? null) === value));
      button.onclick = () => { store.get(active.id).scores[dimension.id] = value; store.change(active.id); scores(); }; choices.append(button);
    }
    row.append(label, choices); list.append(row);
  }
}

function select(item: ArtifactItem) {
  if (active?.id === item.id) return;
  if (active && annotations.hasDraft() && !confirm('Discard the section note you have not added yet?')) return;
  annotations.unbindImage();
  media()?.pause(); active = item;
  element("title").textContent = item.title;
  element("identity").textContent = item.comparison ? `REVIEWING ${item.comparison.phase.toUpperCase()} · Notes attach to this image` : `${item.kind.toUpperCase()} / VERSION ${String(item.version).slice(0, 12)}`;
  element("description").textContent = item.description || "";
  element("text").textContent = item.text || "";
  requireDomId("about", HTMLDetailsElement, document).open = item.kind === "text";
  const target = element("media"); target.replaceChildren(); target.classList.remove('image-comparison', 'paired');
  if (item.media && (item.kind === "video" || item.kind === "audio")) {
    const player = document.createElement(item.kind); player.controls = true; player.preload = "metadata"; player.src = item.media;
    if (player instanceof HTMLVideoElement) player.playsInline = true;
    player.addEventListener("error", () => status("This media could not load. Notes still work; retry by selecting the output again.", true));
    annotations.bindMedia(player); target.append(player);
  } else if (item.media && item.kind === "image") {
    renderComparison({ items: manifest.items, active: item, target, select, bindImage: annotations.bindImage, drawRegion: annotations.drawRegion });
  }
  element("time-controls").hidden = !["video", "audio"].includes(item.kind);
  element("note-moment").hidden = !["video", "audio"].includes(item.kind);
  element("finish-range").hidden = !["video", "audio"].includes(item.kind);
  const sections = element("sections"); sections.replaceChildren();
  for (const section of item.sections || []) {
    const button = document.createElement("button"); button.textContent = section.title;
    button.onclick = () => { annotations.selectSection(section.id); if (section.text) { element("text").textContent = section.text; requireDomId("about", HTMLDetailsElement, document).open = true; } }; sections.append(button);
  }
  notes.value = store.get(item.id).notes;
  annotations.reset(); annotations.render(); grades(); scores(); navigation();
  void renderHistory({ id: item.id, target: element("history") });
}

async function start() {
  const [manifestResponse, feedbackResponse] = await Promise.all([fetch("/api/manifest"), fetch("/api/feedback")]);
  if (!manifestResponse.ok || !feedbackResponse.ok) throw Error("Review is unavailable. Reload this page to retry.");
  manifest = await manifestResponse.json();
  const feedback = await feedbackResponse.json();
  if (!manifest.items.length) throw Error("No outputs in this review yet.");
  document.title = `${manifest.title} · Hyperfocus review`;
  element("collection").textContent = manifest.title;
  store = createReviewStore({ campaign: manifest.id, onStatus: status, onSaved: () => { navigation(); void renderHistory({ id: active.id, target: element("history") }); } });
  store.initialize(manifest.items, feedback.items);
  select(reviewEntries(manifest.items)[0]!);
  status("Connected. Notes save automatically.", false);
  if (store.pending()) void store.flush();
  notes.oninput = () => { store.get(active.id).notes = notes.value; store.change(active.id); };
  search.oninput = navigation;
  const move = (delta: number) => { const entries = reviewEntries(manifest.items); const index = entries.findIndex(item => item.id === active.id || Boolean(active.comparison && item.comparison?.id === active.comparison.id)); const next = entries[index + delta]; if (next) select(next); };
  element("previous").onclick = () => move(-1);
  element("next").onclick = () => move(1);
  element("retry").onclick = () => void store.flush();
  element("reload").onclick = () => { if (confirm("Discard unsaved changes on this page and load the saved review?")) location.reload(); };
  window.addEventListener("online", () => void store.flush());
  document.addEventListener("visibilitychange", () => { if (document.hidden) void store.flush(); });
  window.addEventListener("beforeunload", event => { if (store.pending() || annotations.hasDraft()) { event.preventDefault(); event.returnValue = ""; } });
}

void start().catch(error => status(error instanceof Error ? error.message : "Unable to open review.", true));
