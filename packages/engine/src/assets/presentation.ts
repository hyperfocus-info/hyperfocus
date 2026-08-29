import type { AssetLoadSnapshot, AssetProgressSmoother } from "./loader.ts";

export type AssetLoaderRafLoopOptions = {
  read: () => AssetLoadSnapshot;
  render: (snapshot: AssetLoadSnapshot) => void;
  smoother?: AssetProgressSmoother;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (id: number) => void;
  stopWhen?: (snapshot: AssetLoadSnapshot) => boolean;
  now?: () => number;
};

export type AssetLoaderRafLoop = {
  stop(): void;
  isRunning(): boolean;
};

export type CanvasAssetLoaderPalette = {
  background: string;
  backgroundDeep: string;
  grid: string;
  accent: string;
  accentAlt: string;
  warning: string;
  text: string;
  muted: string;
  track: string;
};

export type CanvasAssetLoaderOptions = {
  title?: string;
  subtitle?: string;
  palette?: Partial<CanvasAssetLoaderPalette>;
  fontFamily?: string;
  reduceMotion?: boolean;
};

export type CanvasAssetLoaderView = {
  render(snapshot: AssetLoadSnapshot): void;
  clear(): void;
};

export type AssetLoaderUiPalette = {
  surface: string;
  surfaceAlt: string;
  border: string;
  accent: string;
  accentAlt: string;
  text: string;
  muted: string;
  shadow: string;
};

export type AssetLoaderUiOptions = {
  title?: string;
  subtitle?: string;
  backgroundImage?: string;
  palette?: Partial<AssetLoaderUiPalette>;
  zIndex?: number;
  document?: Document;
  parent?: HTMLElement;
};

export type AssetLoaderUi = {
  root: HTMLElement;
  render(snapshot: AssetLoadSnapshot): void;
  attach(parent?: HTMLElement): void;
  hide(options?: { removeDelayMs?: number }): void;
  remove(): void;
};

const defaultCanvasPalette: CanvasAssetLoaderPalette = {
  background: "#10170f",
  backgroundDeep: "#050807",
  grid: "rgba(202, 226, 183, 0.16)",
  accent: "#f0c96a",
  accentAlt: "#8de6c2",
  warning: "#ff8b66",
  text: "#f8f5e8",
  muted: "#c3d1b5",
  track: "rgba(0, 0, 0, 0.48)"
};

const defaultUiPalette: AssetLoaderUiPalette = {
  surface: "rgba(8, 13, 12, 0.9)",
  surfaceAlt: "rgba(21, 31, 27, 0.88)",
  border: "rgba(220, 238, 190, 0.34)",
  accent: "#d7ff8d",
  accentAlt: "#88d8ff",
  text: "#f6fff0",
  muted: "#cfe0c8",
  shadow: "rgba(0, 0, 0, 0.48)"
};

const uiStyleId = "ce-asset-loader-style";

export function runAssetLoaderRafLoop(options: AssetLoaderRafLoopOptions): AssetLoaderRafLoop {
  const requestFrame = options.requestAnimationFrame ?? fallbackRequestAnimationFrame(options.now);
  const cancelFrame = options.cancelAnimationFrame ?? fallbackCancelAnimationFrame;
  let running = true;
  let frameId = 0;

  function tick(time: number) {
    if (!running) return;
    frameId = 0;
    try {
      if (!Number.isFinite(time)) throw new RangeError("asset loader frame time must be finite");
      const raw = options.read();
      const snapshot = options.smoother ? options.smoother.update(raw, time) : raw;
      options.render(snapshot);
      if (!running) return;
      if (options.stopWhen?.(snapshot)) {
        stop();
        return;
      }
      frameId = requestFrame(tick);
    } catch (error) {
      running = false;
      frameId = 0;
      throw error;
    }
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelFrame(frameId);
    frameId = 0;
  }

  frameId = requestFrame(tick);
  return {
    stop,
    isRunning() {
      return running;
    }
  };
}

export function createCanvasAssetLoader(
  target: HTMLCanvasElement | CanvasRenderingContext2D,
  options: CanvasAssetLoaderOptions = {}
): CanvasAssetLoaderView {
  const rawContext = "getContext" in target ? target.getContext("2d") : target;
  if (!rawContext) throw new Error("createCanvasAssetLoader requires a 2D canvas context");
  const ctx: CanvasRenderingContext2D = rawContext;
  const canvas = ctx.canvas;
  const palette = { ...defaultCanvasPalette, ...options.palette };
  const fontFamily = options.fontFamily ?? "Inter, ui-sans-serif, system-ui, sans-serif";

  function render(snapshot: AssetLoadSnapshot) {
    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    const cssWidth = Math.max(1, canvas.clientWidth || width);
    const cssScale = width / cssWidth;
    const compact = cssWidth < 520;
    const titlePx = cssPixels(cssWidth, cssScale, 28, cssWidth / 11, 56);
    const subtitlePx = cssPixels(cssWidth, cssScale, 13, cssWidth / 30, 19);
    const percentPx = cssPixels(cssWidth, cssScale, 20, cssWidth / 13, 34);
    const metaPx = cssPixels(cssWidth, cssScale, 12, cssWidth / 34, 15);
    const progress = clamp01(snapshot.visibleProgress);
    const time = options.reduceMotion ? 0 : defaultNow() / 1000;
    const title = options.title ?? snapshot.label ?? "Loading";
    const subtitle = snapshot.activeLabel || options.subtitle || snapshot.label || "Preparing assets";
    const percent = `${Math.round(progress * 100).toString().padStart(2, "0")}%`;

    ctx.save();
    try {
      ctx.clearRect(0, 0, width, height);

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, palette.background);
    bg.addColorStop(1, palette.backgroundDeep);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    drawCanvasLoaderBands(ctx, width, height, palette, time);
    drawCanvasLoaderContours(ctx, width, height, palette, time);

    const panelWidth = Math.min(width * 0.72, 560);
    const panelX = (width - panelWidth) * 0.5;
    const panelY = height * 0.5 - 78;
    const barWidth = panelWidth;
    const barHeight = cssPixels(cssWidth, cssScale, 10, cssWidth / 36, 16);
    const barY = panelY + 86;

    ctx.font = `800 ${titlePx}px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = palette.text;
    drawFittedCanvasText(ctx, title, panelX, panelY, compact ? panelWidth : panelWidth * 0.72);

    ctx.font = `600 ${subtitlePx}px ${fontFamily}`;
    ctx.fillStyle = palette.muted;
    drawFittedCanvasText(ctx, subtitle, panelX, panelY + 32, panelWidth * 0.84);

    if (!compact) {
      ctx.font = `900 ${percentPx}px ${fontFamily}`;
      ctx.textAlign = "right";
      ctx.fillStyle = snapshot.status === "failed" ? palette.warning : palette.accent;
      ctx.fillText(percent, panelX + panelWidth, panelY + 12);
    }

    drawRoundedRect(ctx, panelX, barY, barWidth, barHeight, barHeight * 0.5);
    ctx.fillStyle = palette.track;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const fillWidth = Math.max(barHeight, barWidth * progress);
    drawRoundedRect(ctx, panelX, barY, fillWidth, barHeight, barHeight * 0.5);
    const fill = ctx.createLinearGradient(panelX, 0, panelX + barWidth, 0);
    fill.addColorStop(0, palette.accentAlt);
    fill.addColorStop(0.55, palette.accent);
    fill.addColorStop(1, snapshot.status === "failed" ? palette.warning : "#fff2a0");
    ctx.fillStyle = fill;
    ctx.fill();

    if (!options.reduceMotion && snapshot.status !== "failed") {
      const shimmerX = panelX + ((time * 180) % (barWidth + 90)) - 90;
      ctx.save();
      try {
        drawRoundedRect(ctx, panelX, barY, fillWidth, barHeight, barHeight * 0.5);
        ctx.clip();
        const shine = ctx.createLinearGradient(shimmerX, 0, shimmerX + 90, 0);
        shine.addColorStop(0, "rgba(255,255,255,0)");
        shine.addColorStop(0.5, "rgba(255,255,255,0.42)");
        shine.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = shine;
        ctx.fillRect(shimmerX, barY, 90, barHeight);
      } finally {
        ctx.restore();
      }
    }

    ctx.font = `700 ${metaPx}px ${fontFamily}`;
    ctx.textAlign = "left";
    ctx.fillStyle = palette.muted;
    ctx.fillText(`${snapshot.completed}/${Math.max(1, snapshot.total)} ready`, panelX, barY + 34);
    ctx.textAlign = "right";
    ctx.fillStyle = compact ? (snapshot.status === "failed" ? palette.warning : palette.accent) : palette.muted;
      ctx.fillText(compact ? percent : snapshot.failed ? `${snapshot.failed} failed` : "streaming assets", panelX + panelWidth, barY + 34);
    } finally {
      ctx.restore();
    }
  }

  function clear() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { render, clear };
}

export function createAssetLoaderUi(options: AssetLoaderUiOptions = {}): AssetLoaderUi {
  const doc = options.document ?? document;
  ensureAssetLoaderStyle(doc);
  const palette = { ...defaultUiPalette, ...options.palette };
  const root = doc.createElement("div");
  root.className = "ce-asset-loader";
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  setCssVar(root, "--ce-asset-loader-z", String(options.zIndex ?? 20));
  setCssVar(root, "--ce-asset-loader-bg-image", options.backgroundImage ?? "none");
  setCssVar(root, "--ce-asset-loader-surface", palette.surface);
  setCssVar(root, "--ce-asset-loader-surface-alt", palette.surfaceAlt);
  setCssVar(root, "--ce-asset-loader-border", palette.border);
  setCssVar(root, "--ce-asset-loader-accent", palette.accent);
  setCssVar(root, "--ce-asset-loader-accent-alt", palette.accentAlt);
  setCssVar(root, "--ce-asset-loader-text", palette.text);
  setCssVar(root, "--ce-asset-loader-muted", palette.muted);
  setCssVar(root, "--ce-asset-loader-shadow", palette.shadow);

  const panel = doc.createElement("div");
  panel.className = "ce-asset-loader__panel";

  const title = doc.createElement("div");
  title.className = "ce-asset-loader__title";
  title.textContent = options.title ?? "Loading";

  const subtitle = doc.createElement("div");
  subtitle.className = "ce-asset-loader__subtitle";
  subtitle.textContent = options.subtitle ?? "Preparing assets";

  const meter = doc.createElement("div");
  meter.className = "ce-asset-loader__meter";
  meter.setAttribute("role", "progressbar");
  meter.setAttribute("aria-valuemin", "0");
  meter.setAttribute("aria-valuemax", "100");

  const fill = doc.createElement("span");
  fill.className = "ce-asset-loader__fill";
  const spark = doc.createElement("span");
  spark.className = "ce-asset-loader__spark";
  fill.appendChild(spark);
  meter.appendChild(fill);

  const readout = doc.createElement("div");
  readout.className = "ce-asset-loader__readout";
  const label = doc.createElement("span");
  label.textContent = options.subtitle ?? "Preparing assets";
  const percent = doc.createElement("strong");
  percent.textContent = "00%";
  readout.append(label, percent);

  panel.append(title, subtitle, meter, readout);
  root.append(panel);
  let removeTimer: ReturnType<typeof setTimeout> | undefined;

  function clearRemoveTimer() {
    if (removeTimer === undefined) return;
    clearTimeout(removeTimer);
    removeTimer = undefined;
  }

  function render(snapshot: AssetLoadSnapshot) {
    const progress = clamp01(snapshot.visibleProgress);
    const percentValue = Math.round(progress * 100);
    root.dataset.status = snapshot.status;
    title.textContent = options.title ?? snapshot.label ?? "Loading";
    subtitle.textContent = snapshot.activeLabel || options.subtitle || snapshot.label || "Preparing assets";
    label.textContent = snapshot.failed ? `${snapshot.failed} failed` : `${snapshot.completed}/${Math.max(1, snapshot.total)} ready`;
    percent.textContent = `${percentValue.toString().padStart(2, "0")}%`;
    fill.style.transform = `scaleX(${progress})`;
    meter.setAttribute("aria-valuenow", String(percentValue));
  }

  function attach(parent = options.parent ?? doc.body) {
    clearRemoveTimer();
    root.classList.remove("is-done");
    if (!root.parentNode) parent.appendChild(root);
  }

  function remove() {
    clearRemoveTimer();
    root.parentNode?.removeChild(root);
  }

  function hide(hideOptions: { removeDelayMs?: number } = {}) {
    root.classList.add("is-done");
    const delay = nonNegativeFinite(hideOptions.removeDelayMs ?? 260, "asset loader removeDelayMs");
    clearRemoveTimer();
    removeTimer = setTimeout(remove, delay);
  }

  if (options.parent) attach(options.parent);
  return { root, render, attach, hide, remove };
}

function nonNegativeFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a non-negative finite number`);
  return value;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function defaultNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

let nextFallbackFrameId = 1;
const fallbackFrameTimers = new Map<number, ReturnType<typeof setTimeout>>();

function fallbackRequestAnimationFrame(now?: () => number) {
  return (callback: FrameRequestCallback) => {
    if (typeof requestAnimationFrame === "function") return requestAnimationFrame(callback);
    const id = nextFallbackFrameId;
    nextFallbackFrameId += 1;
    const timer = setTimeout(() => {
      fallbackFrameTimers.delete(id);
      callback((now ?? defaultNow)());
    }, 16);
    fallbackFrameTimers.set(id, timer);
    return id;
  };
}

function fallbackCancelAnimationFrame(id: number) {
  const fallbackTimer = fallbackFrameTimers.get(id);
  if (fallbackTimer !== undefined) {
    clearTimeout(fallbackTimer);
    fallbackFrameTimers.delete(id);
    return;
  }
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(id);
  }
}

function drawCanvasLoaderBands(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: CanvasAssetLoaderPalette,
  time: number
) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  for (let index = 0; index < 10; index += 1) {
    const y = (index / 9) * height;
    const offset = Math.sin(time * 0.6 + index * 0.8) * 18;
    const line = ctx.createLinearGradient(0, y, width, y + 28);
    line.addColorStop(0, "rgba(255,255,255,0)");
    line.addColorStop(0.5, palette.grid);
    line.addColorStop(1, "rgba(255,255,255,0)");
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-40, y + offset);
    ctx.lineTo(width + 40, y - height * 0.12 + offset);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCanvasLoaderContours(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: CanvasAssetLoaderPalette,
  time: number
) {
  ctx.save();
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  for (let row = 0; row < 5; row += 1) {
    ctx.beginPath();
    for (let x = -20; x <= width + 20; x += 18) {
      const baseY = height * (0.18 + row * 0.17);
      const y = baseY + Math.sin(x * 0.015 + row * 1.2 + time * 0.35) * 16;
      if (x === -20) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, Math.abs(width) * 0.5, Math.abs(height) * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
}

function drawFittedCanvasText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }
  const originalFont = ctx.font;
  const fontSizeMatch = /(\d+(?:\.\d+)?)px/.exec(originalFont);
  if (fontSizeMatch) {
    const originalSize = Number(fontSizeMatch[1]);
    let size = originalSize;
    while (size > Math.max(12, originalSize * 0.62) && ctx.measureText(text).width > maxWidth) {
      size -= 1;
      ctx.font = originalFont.replace(fontSizeMatch[0], `${size}px`);
    }
    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, x, y);
      ctx.font = originalFont;
      return;
    }
    ctx.font = originalFont;
  }
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}...`).width > maxWidth) clipped = clipped.slice(0, -1);
  ctx.fillText(`${clipped}...`, x, y);
}

function cssPixels(cssWidth: number, cssScale: number, min: number, preferred: number, max: number) {
  const cssSize = Math.max(min, Math.min(max, preferred || cssWidth));
  return cssSize * Math.max(0.5, cssScale);
}

function setCssVar(element: HTMLElement, name: string, value: string) {
  element.style.setProperty(name, value);
}

function ensureAssetLoaderStyle(doc: Document) {
  if (doc.getElementById(uiStyleId)) return;
  const style = doc.createElement("style");
  style.id = uiStyleId;
  style.textContent = `
.ce-asset-loader {
  align-items: center;
  background:
    linear-gradient(90deg, rgba(3, 7, 7, 0.78), rgba(4, 9, 8, 0.38) 48%, rgba(0, 0, 0, 0.78)),
    linear-gradient(180deg, rgba(6, 9, 8, 0.18), rgba(0, 0, 0, 0.82) 72%, rgba(0, 0, 0, 0.96)),
    var(--ce-asset-loader-bg-image);
  background-position: center;
  background-size: cover;
  color: var(--ce-asset-loader-text);
  display: grid;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  inset: 0;
  justify-items: center;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
  padding: 18px;
  pointer-events: auto;
  position: fixed;
  transition: opacity 220ms ease, visibility 220ms ease;
  width: 100vw;
  z-index: var(--ce-asset-loader-z);
}
.ce-asset-loader::before {
  background:
    repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 64px),
    repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 64px);
  content: "";
  inset: 0;
  opacity: 0.5;
  pointer-events: none;
  position: absolute;
}
.ce-asset-loader.is-done {
  opacity: 0;
  visibility: hidden;
}
.ce-asset-loader__panel {
  background:
    linear-gradient(180deg, var(--ce-asset-loader-surface-alt), var(--ce-asset-loader-surface));
  border: 1px solid var(--ce-asset-loader-border);
  border-radius: 8px;
  box-shadow:
    0 28px 80px var(--ce-asset-loader-shadow),
    inset 0 1px 0 rgba(255,255,255,0.08);
  box-sizing: border-box;
  display: grid;
  gap: 12px;
  max-width: calc(100vw - 28px);
  padding: 20px;
  position: relative;
  width: min(540px, calc(100vw - 28px));
}
.ce-asset-loader__title {
  color: var(--ce-asset-loader-text);
  font-size: clamp(28px, 6vw, 54px);
  font-weight: 900;
  letter-spacing: 0;
  line-height: 0.98;
}
.ce-asset-loader__subtitle {
  color: var(--ce-asset-loader-muted);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
  min-height: 18px;
}
.ce-asset-loader__meter {
  background: rgba(0, 0, 0, 0.46);
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 999px;
  height: 14px;
  margin-top: 4px;
  overflow: hidden;
  position: relative;
}
.ce-asset-loader__fill {
  background:
    linear-gradient(90deg, var(--ce-asset-loader-accent-alt), var(--ce-asset-loader-accent), #fff2a0);
  display: block;
  height: 100%;
  position: relative;
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 90ms linear;
  width: 100%;
}
.ce-asset-loader__spark {
  animation: ceAssetLoaderSpark 1300ms linear infinite;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.62), transparent);
  inset: 0 auto 0 0;
  position: absolute;
  width: 90px;
}
.ce-asset-loader__readout {
  align-items: center;
  color: var(--ce-asset-loader-muted);
  display: flex;
  font-size: 12px;
  font-weight: 800;
  gap: 12px;
  justify-content: space-between;
  line-height: 1.2;
}
.ce-asset-loader__readout span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ce-asset-loader__readout strong {
  color: var(--ce-asset-loader-accent);
  font-size: 18px;
  line-height: 1;
}
.ce-asset-loader[data-status="failed"] .ce-asset-loader__fill {
  background: linear-gradient(90deg, #ff8b66, #ffd178);
}
@keyframes ceAssetLoaderSpark {
  from { transform: translateX(-90px); }
  to { transform: translateX(560px); }
}
@media (prefers-reduced-motion: reduce) {
  .ce-asset-loader, .ce-asset-loader__fill { transition: none; }
  .ce-asset-loader__spark { animation: none; display: none; }
}
@media (max-width: 720px) {
  .ce-asset-loader {
    align-items: end;
    padding: 14px;
  }
  .ce-asset-loader__panel {
    gap: 10px;
    padding: 16px;
    width: min(420px, calc(100vw - 28px));
  }
  .ce-asset-loader__title {
    font-size: clamp(30px, 12vw, 42px);
  }
}
`;
  (doc.head ?? doc.documentElement).appendChild(style);
}
