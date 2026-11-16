import type { ArtifactAnnotation } from "@hyperfocus/artifact-review/schema";

export type ImageRect = NonNullable<ArtifactAnnotation["rect"]>;
type Point = { x: number; y: number };
import { clamp01 as clamp } from '@hyperfocus/utilities/math';

/** Coordinates refer to the image content, independent of viewport or drag direction. */
export function rectangleBetween(from: Point, to: Point): ImageRect | undefined {
  const left = clamp(Math.min(from.x, to.x)), top = clamp(Math.min(from.y, to.y));
  const width = clamp(Math.max(from.x, to.x)) - left, height = clamp(Math.max(from.y, to.y)) - top;
  return width > 0 && height > 0 ? { x: left, y: top, width, height } : undefined;
}

export function validImageRect(rect: ImageRect) {
  return Object.values(rect).every(Number.isFinite) && rect.x >= 0 && rect.y >= 0
    && rect.width > 0 && rect.height > 0 && rect.x + rect.width <= 1 && rect.y + rect.height <= 1;
}

export function createImageRegions(options: {
  host: HTMLElement; annotations: () => ArtifactAnnotation[];
  changed: (rect: ImageRect | undefined) => void; edit: (id: string) => void;
}) {
  const controls = document.createElement("div"); controls.className = "image-region-controls"; controls.hidden = true;
  const draw = document.createElement("button"); draw.type = "button"; draw.textContent = "Draw image region";
  draw.setAttribute("aria-pressed", "false");
  const help = document.createElement("p"); help.className = "muted";
  help.textContent = "Choose Draw, then drag on the image. Or enter percentages below and use Set region. Escape cancels drawing.";
  const details = document.createElement("details"), summary = document.createElement("summary"); summary.textContent = "Set region with keyboard";
  const fields = document.createElement("div"); fields.className = "range";
  const inputs = (["Left", "Top", "Width", "Height"] as const).map((name, index) => {
    const label = document.createElement("label"), input = document.createElement("input");
    label.textContent = `${name} (%)`; input.type = "number"; input.min = index < 2 ? "0" : "0.01";
    input.max = "100"; input.step = "any"; input.value = index < 2 ? "25" : "50";
    label.append(input); fields.append(label); return input;
  });
  const apply = document.createElement("button"); apply.type = "button"; apply.textContent = "Set region";
  const error = document.createElement("p"); error.setAttribute("role", "alert"); error.className = "region-error";
  details.append(summary, fields, apply, error); controls.append(draw, help, details); options.host.append(controls);
  let image: HTMLImageElement | undefined, layer: HTMLDivElement | undefined, observer: ResizeObserver | undefined;
  let rect: ImageRect | undefined, selected: string | undefined, drawing = false;
  let drag: { pointer: number; start: Point; previous: ImageRect | undefined } | undefined;
  function mode(value: boolean) {
    drawing = value; draw.setAttribute("aria-pressed", String(value));
    if (layer) { layer.classList.toggle("drawing", value); layer.style.touchAction = value ? "none" : "auto"; }
  }
  function render() {
    if (!layer) return;
    layer.replaceChildren();
    for (const [index, entry] of options.annotations().entries()) {
      if (!entry.rect) continue;
      const box = document.createElement("button"); box.type = "button"; box.className = "image-region-box";
      box.textContent = String(index + 1); box.setAttribute("aria-label", `Edit image region note ${index + 1}: ${entry.text}`);
      box.setAttribute("aria-pressed", String(entry.id === selected));
      position(box, entry.rect); box.onclick = () => { if (!drawing) options.edit(entry.id); }; layer.append(box);
    }
    if (rect) { const box = document.createElement("div"); box.className = "image-region-box image-region-draft"; box.setAttribute("aria-hidden", "true"); position(box, rect); layer.append(box); }
  }
  function position(node: HTMLElement, value: ImageRect) {
    Object.assign(node.style, { left: `${value.x * 100}%`, top: `${value.y * 100}%`, width: `${value.width * 100}%`, height: `${value.height * 100}%` });
  }
  function set(value: ImageRect | undefined, id?: string) {
    rect = value ? { ...value } : undefined; selected = id; error.textContent = ""; mode(false);
    const values = value ? [value.x, value.y, value.width, value.height] : [.25, .25, .5, .5];
    inputs.forEach((input, index) => { input.value = String(Number((values[index] * 100).toFixed(6))); });
    render();
  }
  apply.onclick = () => {
    const [x, y, width, height] = inputs.map(input => input.value === "" ? NaN : Number(input.value) / 100);
    const value = { x, y, width, height };
    if (!validImageRect(value)) { error.textContent = "Enter a region inside the image: positive width and height, with left + width and top + height at most 100%."; return; }
    set(value, selected); options.changed(value);
  };
  draw.onclick = () => mode(!drawing);
  function cancel() { if (drag) { rect = drag.previous; drag = undefined; render(); } mode(false); }
  const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && drawing) { cancel(); draw.focus(); } };
  controls.addEventListener("keydown", escape);
  function unbind() {
    observer?.disconnect(); image?.removeEventListener("load", layout); image?.ownerDocument.removeEventListener("keydown", escape);
    const stage = layer?.parentElement;
    if (stage && image && stage.classList.contains("image-region-stage")) stage.replaceWith(image);
    observer = undefined; image = undefined; layer = undefined; drag = undefined; controls.hidden = true; set(undefined);
  }
  function layout() {
    if (!image || !layer) return;
    const bounds = image.getBoundingClientRect(), ratio = image.naturalWidth / image.naturalHeight;
    const width = ratio ? Math.min(bounds.width, bounds.height * ratio) : bounds.width;
    const height = ratio ? Math.min(bounds.height, bounds.width / ratio) : bounds.height;
    Object.assign(layer.style, { width: `${width}px`, height: `${height}px`, left: `${image.offsetLeft + (bounds.width - width) / 2}px`, top: `${image.offsetTop + (bounds.height - height) / 2}px` });
  }
  function bind(value: HTMLImageElement) {
    unbind(); image = value; controls.hidden = false;
    const stage = document.createElement("div"); stage.className = "image-region-stage";
    image.replaceWith(stage); stage.append(image); layer = document.createElement("div"); layer.className = "image-region-layer"; stage.append(layer);
    const point = (event: PointerEvent) => { const bounds = layer!.getBoundingClientRect(); return { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height }; };
    layer.onpointerdown = event => {
      if (!drawing || event.button !== 0 || drag) return;
      event.preventDefault(); drag = { pointer: event.pointerId, start: point(event), previous: rect }; layer!.setPointerCapture(event.pointerId);
    };
    layer.onpointermove = event => { if (drag?.pointer === event.pointerId) { rect = rectangleBetween(drag.start, point(event)); render(); } };
    layer.onpointerup = event => {
      if (drag?.pointer !== event.pointerId) return;
      const next = rectangleBetween(drag.start, point(event)); const previous = drag.previous; drag = undefined;
      if (layer!.hasPointerCapture(event.pointerId)) layer!.releasePointerCapture(event.pointerId);
      set(next || previous, selected); if (next) options.changed(next);
    };
    layer.onpointercancel = cancel; layer.onlostpointercapture = () => { if (drag) cancel(); };
    observer = new ResizeObserver(layout); observer.observe(image); image.addEventListener("load", layout);
    image.ownerDocument.addEventListener("keydown", escape); layout(); render();
  }
  return { bind, unbind, set, render, startDrawing: () => { mode(true); image?.scrollIntoView({ block: 'nearest' }); } };
}
