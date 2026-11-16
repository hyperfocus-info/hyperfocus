import type { Hyperfocus3DDeclaration, Hyperfocus3DEvaluatedImpactFrame, PortableAsset3D } from "@hyperfocus/engine/project/runtime-3d";

export type CanonicalImpactTextureSources = ReadonlyMap<string, CanvasImageSource>;

/** Shared first-party compositor used by gameplay preview, standalone builds, and video export. */
export function drawCanonicalImpactFrame(options: {
  context: CanvasRenderingContext2D;
  source: CanvasImageSource;
  width: number;
  height: number;
  frame: Hyperfocus3DEvaluatedImpactFrame;
  textures?: CanonicalImpactTextureSources;
}) {
  const { context, source, width, height, frame } = options;
  context.save(); context.globalAlpha = 1; context.globalCompositeOperation = "source-over"; context.filter = "none";
  context.fillStyle = frame.background; context.fillRect(0, 0, width, height);
  if (frame.source === "texture") {
    const texture = frame.textureId ? options.textures?.get(frame.textureId) : undefined;
    if (!texture) throw new Error(`Impact frame ${frame.id} requires hydrated texture ${frame.textureId ?? "<unset>"}.`);
    drawCover(context, texture, width, height);
  } else if (frame.source !== "solid") {
    drawProcessedScene(context, source, width, height, frame);
  }
  drawGraphicMarks(context, width, height, frame);
  context.restore();
}

export function transformImpactPixels(source: Uint8ClampedArray, width: number, height: number, frame: Hyperfocus3DEvaluatedImpactFrame): Uint8ClampedArray {
  if (source.length !== width * height * 4) throw new RangeError("Impact-frame source pixels do not match their dimensions.");
  const output = new Uint8ClampedArray(source.length), background = rgb(frame.background), foreground = rgb(frame.foreground), accent = rgb(frame.accent);
  const offset = Math.max(1, Math.round(frame.chromaticOffset * width));
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = (y * width + x) * 4, right = (y * width + Math.min(width - 1, x + 1)) * 4, below = (Math.min(height - 1, y + 1) * width + x) * 4;
    const luminance = luma(source, index), edge = Math.min(1, Math.abs(luminance - luma(source, right)) * 2.4 + Math.abs(luminance - luma(source, below)) * 2.4);
    let color: readonly number[];
    if (frame.source === "scene-edges") color = edge > 0.08 + (1 - frame.edgeStrength) * 0.42 ? foreground : background;
    else if (frame.source === "scene-color") {
      const left = (y * width + Math.max(0, x - offset)) * 4, shifted = (y * width + Math.min(width - 1, x + offset)) * 4;
      const contrast = (value: number) => Math.max(0, Math.min(255, (value - 128) * 2.15 + 154));
      color = [contrast(source[left]!), contrast(source[index + 1]!), contrast(source[shifted + 2]!)];
      if (edge > 0.22) color = mixColor(color, accent, frame.edgeStrength * 0.65);
    } else {
      color = luminance >= frame.threshold ? foreground : background;
      if (edge > 0.16 + (1 - frame.edgeStrength) * 0.5) color = accent;
    }
    const mixed = mixColor([source[index]!, source[index + 1]!, source[index + 2]!], color, frame.intensity);
    output[index] = mixed[0]!; output[index + 1] = mixed[1]!; output[index + 2] = mixed[2]!; output[index + 3] = 255;
  }
  return output;
}

export function createCanonicalImpactTextureSources(declaration: Readonly<Hyperfocus3DDeclaration>, assets: readonly PortableAsset3D[]): CanonicalImpactTextureSources {
  const byId = new Map(assets.map((asset) => [asset.id, asset])), output = new Map<string, CanvasImageSource>();
  for (const texture of declaration.textures) {
    const asset = byId.get(texture.assetId); if (!asset || asset.bytes.byteLength !== texture.width * texture.height * 4) continue;
    const canvas = document.createElement("canvas"); canvas.width = texture.width; canvas.height = texture.height;
    const context = canvas.getContext("2d"); if (!context) throw new Error(`Canvas 2D is unavailable while preparing impact texture ${texture.id}.`);
    const pixels = new Uint8ClampedArray(asset.bytes.byteLength); pixels.set(asset.bytes);
    context.putImageData(new ImageData(pixels, texture.width, texture.height), 0, 0); output.set(texture.id, canvas);
  }
  return output;
}

export function createCanonicalImpactOverlay(canvas: HTMLCanvasElement) {
  const parent = canvas.parentElement; if (!parent) throw new Error("Canonical impact overlay requires the render canvas to have a parent element.");
  const previousPosition = parent.style.position; if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
  const overlay = document.createElement("canvas"); overlay.className = "canonical-impact-overlay"; overlay.setAttribute("aria-hidden", "true");
  Object.assign(overlay.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none", display: "none" }); canvas.after(overlay);
  const context = overlay.getContext("2d", { alpha: false, willReadFrequently: true }); if (!context) throw new Error("Canvas 2D is unavailable for canonical impact frames.");
  const heldSource = document.createElement("canvas"); let heldCueId: string | undefined;
  return {
    render(frame: Hyperfocus3DEvaluatedImpactFrame | undefined, textures?: CanonicalImpactTextureSources) {
      if (!frame) { overlay.style.display = "none"; heldCueId = undefined; return; }
      if (overlay.width !== canvas.width) overlay.width = canvas.width; if (overlay.height !== canvas.height) overlay.height = canvas.height;
      let source: CanvasImageSource = canvas;
      if (frame.freezeSource) { if (heldCueId !== frame.id || heldSource.width !== canvas.width || heldSource.height !== canvas.height) { heldSource.width = canvas.width; heldSource.height = canvas.height; const heldContext = heldSource.getContext("2d", { alpha: false }); if (!heldContext) throw new Error("Canvas 2D is unavailable for a frozen impact source."); heldContext.drawImage(canvas, 0, 0); heldCueId = frame.id; } source = heldSource; } else heldCueId = undefined;
      overlay.style.display = "block"; drawCanonicalImpactFrame({ context, source, width: overlay.width, height: overlay.height, frame, textures });
    },
    dispose() { overlay.remove(); if (parent.style.position === "relative" && !previousPosition) parent.style.removeProperty("position"); else parent.style.position = previousPosition; },
  };
}

function drawProcessedScene(context: CanvasRenderingContext2D, source: CanvasImageSource, width: number, height: number, frame: Hyperfocus3DEvaluatedImpactFrame) {
  const scale = Math.min(1, 960 / width, 540 / height), workWidth = Math.max(1, Math.round(width * scale)), workHeight = Math.max(1, Math.round(height * scale));
  const work = document.createElement("canvas"); work.width = workWidth; work.height = workHeight; const workContext = work.getContext("2d", { willReadFrequently: true }); if (!workContext) throw new Error("Canvas 2D is unavailable for impact-frame processing.");
  workContext.drawImage(source, 0, 0, workWidth, workHeight); const image = workContext.getImageData(0, 0, workWidth, workHeight); image.data.set(transformImpactPixels(image.data, workWidth, workHeight, frame)); workContext.putImageData(image, 0, 0);
  context.imageSmoothingEnabled = false; context.drawImage(work, 0, 0, width, height); context.imageSmoothingEnabled = true;
}

function drawGraphicMarks(context: CanvasRenderingContext2D, width: number, height: number, frame: Hyperfocus3DEvaluatedImpactFrame) {
  if (frame.source === "solid" || frame.source === "texture") return;
  const random = seeded(frame.seed + frame.localFrame * 101), centerX = frame.center[0] * width, centerY = frame.center[1] * height, diagonal = Math.hypot(width, height);
  if (frame.preset === "energy-overexposure") { const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, diagonal * 0.42); glow.addColorStop(0, frame.accent); glow.addColorStop(0.16, `${frame.accent}dd`); glow.addColorStop(0.52, `${frame.foreground}22`); glow.addColorStop(1, `${frame.background}00`); context.fillStyle = glow; context.fillRect(0, 0, width, height); }
  if (frame.preset === "whiteout-slash") { context.save(); context.translate(centerX, centerY); context.rotate(frame.slashAngle); context.fillStyle = frame.accent; context.globalAlpha = 0.78 * frame.intensity; context.beginPath(); context.moveTo(-diagonal, -height * 0.035); context.lineTo(diagonal, -height * 0.13); context.lineTo(diagonal, height * 0.13); context.lineTo(-diagonal, height * 0.035); context.closePath(); context.fill(); context.restore(); }
  const count = Math.round(frame.lineDensity * 96 * frame.intensity);
  context.lineCap = "butt";
  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2, inner = diagonal * (0.035 + random() * 0.14), outer = diagonal * (0.42 + random() * 0.48), widthScale = 0.0012 + random() * random() * 0.009;
    context.strokeStyle = index % 7 === 0 ? frame.accent : frame.foreground; context.globalAlpha = (0.35 + random() * 0.65) * frame.intensity; context.lineWidth = Math.max(1, height * widthScale); context.beginPath(); context.moveTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner); context.lineTo(centerX + Math.cos(angle + (random() - 0.5) * 0.035) * outer, centerY + Math.sin(angle + (random() - 0.5) * 0.035) * outer); context.stroke();
  }
  if (frame.preset === "red-contact-burst") { context.globalAlpha = frame.intensity; context.fillStyle = frame.accent; context.beginPath(); const points = 26; for (let point = 0; point < points; point += 1) { const angle = point / points * Math.PI * 2, radius = Math.min(width, height) * (point % 2 ? 0.055 + random() * 0.06 : 0.13 + random() * 0.11), x = centerX + Math.cos(angle) * radius, y = centerY + Math.sin(angle) * radius; if (point === 0) context.moveTo(x, y); else context.lineTo(x, y); } context.closePath(); context.fill(); }
}

function drawCover(context: CanvasRenderingContext2D, source: CanvasImageSource, width: number, height: number) { const sourceWidth = "width" in source ? Number(source.width) : width, sourceHeight = "height" in source ? Number(source.height) : height, scale = Math.max(width / sourceWidth, height / sourceHeight), drawWidth = sourceWidth * scale, drawHeight = sourceHeight * scale; context.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight); }
function luma(pixels: Uint8ClampedArray, index: number) { return (pixels[index]! * 0.2126 + pixels[index + 1]! * 0.7152 + pixels[index + 2]! * 0.0722) / 255; }
function rgb(value: string): [number, number, number] { const parsed = Number.parseInt(value.slice(1), 16); return [parsed >> 16 & 255, parsed >> 8 & 255, parsed & 255]; }
function mixColor(from: readonly number[], to: readonly number[], amount: number): [number, number, number] { const t = Math.max(0, Math.min(1, amount)); return [Math.round(from[0]! + (to[0]! - from[0]!) * t), Math.round(from[1]! + (to[1]! - from[1]!) * t), Math.round(from[2]! + (to[2]! - from[2]!) * t)]; }
function seeded(seed: number) { let state = Math.max(1, Math.floor(seed)); return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0xffff_ffff; }; }
