import { requireDomId, requireHtmlElement as element, requireInput } from "@hyperfocus/ui/dom";
import type { ArtifactItem, ArtifactReview } from "@hyperfocus/artifact-review/schema";
import { createImageRegions, type ImageRect } from "./image-regions";

export function createAnnotations(options: { item: () => ArtifactItem; review: () => ArtifactReview; media: () => HTMLMediaElement | null; changed: () => void }) {

  const start = requireInput("start", document), end = requireInput("end", document), note = requireDomId("annotation-note", HTMLTextAreaElement, document);
  let sectionId: string | undefined, editing: string | undefined;
  const error = element("annotation-error");
  let rect: ImageRect | undefined;
  const regionHost = document.createElement("div");
  (note.previousElementSibling?.matches("label") ? note.previousElementSibling : note)?.before(regionHost);
  const regions = createImageRegions({ host: regionHost, annotations: () => options.review().annotations,
    changed(value) {
      rect = value; sectionId = undefined; start.value = ""; end.value = "";
      element("anchor-label").textContent = value ? "Image region" : "Whole output"; note.focus();
    }, edit(id) { const entry = options.review().annotations.find(value => value.id === id); if (entry) edit(entry); },
  });
  function reset() {
    sectionId = undefined; editing = undefined;
    rect = undefined; regions.set(undefined);
    start.value = ""; end.value = ""; note.value = ""; error.textContent = "";
    element("anchor-label").textContent = "Whole output";
    element("add-note").textContent = "Add note";
    element("cancel-note").hidden = true;
  }
  function seek(seconds: number, play = false) {
    const media = options.media(); if (!media) return;
    media.currentTime = seconds;
    if (play) void media.play().catch(() => { error.textContent = "Tap the player's play button to begin."; });
    else media.pause();
  }
  element("mark-start").onclick = () => { options.media()?.pause(); start.value = (options.media()?.currentTime || 0).toFixed(1); };
  element("mark-end").onclick = () => { options.media()?.pause(); end.value = (options.media()?.currentTime || 0).toFixed(1); };
  element("note-moment").onclick = () => { options.media()?.pause(); reset(); start.value = (options.media()?.currentTime || 0).toFixed(1); note.focus(); };
  element("finish-range").onclick = () => { options.media()?.pause(); end.value = (options.media()?.currentTime || 0).toFixed(1); note.focus(); };
  element("play-range").onclick = () => seek(Number(start.value) || 0, true);
  element("clear-anchor").onclick = reset;
  element("cancel-note").onclick = reset;
  element("add-note").onclick = () => {
    error.textContent = "";
    if (!note.value.trim()) { error.textContent = "Write a note before adding it."; note.focus(); return; }
    const from = start.value === "" ? undefined : Number(start.value), to = end.value === "" ? undefined : Number(end.value);
    if ((from !== undefined && (!Number.isFinite(from) || from < 0)) || (to !== undefined && (from === undefined || !Number.isFinite(to) || to <= from))) { error.textContent = "Choose a valid start and an end after it."; return; }
    const duration = options.media()?.duration;
    if (duration && ((from || 0) > duration || (to || 0) > duration)) { error.textContent = "The selected time is beyond the end of this output."; return; }
    const annotation = { id: editing || `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, sectionId, startSeconds: from, endSeconds: to, rect, text: note.value.trim() };
    const list = options.review().annotations, index = list.findIndex(entry => entry.id === editing);
    if (index >= 0) list[index] = annotation; else list.push(annotation);
    options.changed(); reset(); render();
  };
  function edit(entry: ArtifactReview["annotations"][number]) {
    editing = entry.id; sectionId = entry.sectionId; rect = entry.rect ? { ...entry.rect } : undefined;
    regions.set(rect, entry.id); start.value = entry.startSeconds?.toString() || ""; end.value = entry.endSeconds?.toString() || "";
    note.value = entry.text; element("anchor-label").textContent = rect ? "Image region" : entry.sectionId || "Whole output";
    element("add-note").textContent = "Save note"; element("cancel-note").hidden = false; note.focus();
  }
  function render() {
    regions.render();
    const list = element("annotations"); list.replaceChildren();
    element("annotation-count").textContent = `Section notes (${options.review().annotations.length})`;
    for (const entry of options.review().annotations) {
      const row = document.createElement("li"), anchor = document.createElement("div"), text = document.createElement("p"), tools = document.createElement("div");
      anchor.className = "anchor"; tools.className = "tools";
      anchor.textContent = [options.item().sections?.find(section => section.id === entry.sectionId)?.title, entry.startSeconds !== undefined ? `${entry.startSeconds.toFixed(1)}s${entry.endSeconds !== undefined ? ` – ${entry.endSeconds.toFixed(1)}s` : ""}` : ""].filter(Boolean).join(" · ") || "Whole output";
      if (entry.rect) anchor.textContent = `Image region · left ${Math.round(entry.rect.x * 100)}%, top ${Math.round(entry.rect.y * 100)}%, width ${Math.round(entry.rect.width * 100)}%, height ${Math.round(entry.rect.height * 100)}%`;
      text.textContent = entry.text;
      const button = (label: string, action: () => void) => { const node = document.createElement("button"); node.textContent = label; node.onclick = action; tools.append(node); };
      if (entry.startSeconds !== undefined) button("Jump here", () => seek(entry.startSeconds!));
      button("Edit", () => { edit(entry); element("anchor-label").textContent = anchor.textContent; });
      button("Delete", () => { options.review().annotations = options.review().annotations.filter(value => value.id !== entry.id); options.changed(); if (editing === entry.id) reset(); render(); });
      row.append(anchor, text, tools); list.append(row);
    }
    if (!list.children.length) { const empty = document.createElement("li"); empty.className = "empty"; empty.textContent = options.item().kind === "image" ? "Draw a region or set its percentages, then add a note. Leave the anchor empty to discuss the whole image." : "Choose a section or mark a media moment, then add a note. You can leave as many as you need."; list.append(empty); }
  }
  return {
    reset, render, bindImage: regions.bind, unbindImage: regions.unbind, drawRegion: regions.startDrawing,
    hasDraft: () => Boolean(note.value.trim() || rect || editing || start.value || end.value || sectionId),
    selectSection(id: string) { reset(); const section = options.item().sections?.find(value => value.id === id); if (!section) return; sectionId = id; start.value = section.startSeconds?.toString() || ""; end.value = section.endSeconds?.toString() || ""; element("anchor-label").textContent = section.title; if (section.startSeconds !== undefined) seek(section.startSeconds); note.focus(); },
    bindMedia(media: HTMLMediaElement) { media.addEventListener("timeupdate", () => { if (end.value && !media.paused && media.currentTime >= Number(end.value)) media.pause(); }); },
  };
}
