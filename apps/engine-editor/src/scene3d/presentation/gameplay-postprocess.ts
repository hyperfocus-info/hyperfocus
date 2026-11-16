import type { Hyperfocus3DEvaluatedFrame } from '@hyperfocus/engine/project/runtime-3d';
import { drawCombatScreenEffects, type CombatScreenEffects } from '../fight-hud/screen-effects.ts';
import type { CanvasGeometry } from '../canvas-geometry';

type Graph = Hyperfocus3DEvaluatedFrame['renderGraph'];

/** Pixel compositor shared by editor Play and portable gameplay, below all HUD layers. */
export function createGameplayPostProcess3D(options: { canvas: HTMLCanvasElement }) {
  const { canvas } = options;
  const overlay = document.createElement('canvas');
  overlay.className = 'gameplay-postprocess';
  overlay.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, { position: 'absolute', pointerEvents: 'none', display: 'none' });
  canvas.after(overlay);
  const context = overlay.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D is unavailable for gameplay post processing.');
  const glow = document.createElement('canvas');
  const glowContext = glow.getContext('2d', { alpha: false });
  if (!glowContext) throw new Error('Canvas 2D is unavailable for gameplay bloom.');
  let geometryReads = 0;
  return {
    get geometryReads() { return geometryReads; },
    hide() { geometryReads = 0;overlay.style.display = 'none'; },
    source() { return overlay.style.display === 'none' ? canvas : overlay; },
    render(graph: Graph, combat?: CombatScreenEffects, geometry?: Readonly<CanvasGeometry>, layoutOrder: 'layout-first' | 'pixels-first' = 'layout-first') {
      geometryReads = 0;
      if (!graph.bloom && !graph.vignette && graph.exposure === 1 && !combat?.danger && !combat?.blur && !combat?.exhaustion) { overlay.style.display = 'none'; return; }
      const width = canvas.width, height = canvas.height;
      if (overlay.width !== width) overlay.width = width;
      if (overlay.height !== height) overlay.height = height;
      // Canvas2D filter assignment can resolve CSS. Read geometry before any
      // writes, and let the standalone host place overlay/HUD writes after pixels.
      const left = geometry?.left ?? canvas.offsetLeft, top = geometry?.top ?? canvas.offsetTop;
      const cssWidth = geometry?.width ?? canvas.clientWidth, cssHeight = geometry?.height ?? canvas.clientHeight;
      const layout = () => Object.assign(overlay.style, { display: 'block', left: `${left}px`, top: `${top}px`, width: `${cssWidth}px`, height: `${cssHeight}px` });
      geometryReads = geometry ? 0 : 4;
      if (layoutOrder === 'layout-first') layout();
      drawGameplayPostProcess3D({ context, source: canvas, glow, glowContext, width, height, graph, exhaustion: combat?.exhaustion });
      if (combat) drawCombatScreenEffects(context, canvas, width, height, combat);
      if (layoutOrder === 'pixels-first') layout();
    },
    dispose() { overlay.remove(); glow.width = glow.height = 1; },
  };
}

/** Bright-pass bloom is downsampled, with no CPU readback or gameplay-frame allocation. */
export function drawGameplayPostProcess3D(options: { context: CanvasRenderingContext2D; source: CanvasImageSource; glow: HTMLCanvasElement; glowContext: CanvasRenderingContext2D; width: number; height: number; graph: Graph; exhaustion?: number }) {
  const { context, source, glow, glowContext, width, height, graph } = options;
  // Cutaways can leave alpha in the WebGL canvas. Replace the previous frame;
  // source-over would retain its fighters beneath newly transparent scenery.
  context.save(); context.globalAlpha = 1; context.globalCompositeOperation = 'copy';
  const grayscale = `grayscale(${Math.max(0, Math.min(1, options.exhaustion ?? 0)) * 100}%)`;
  context.filter = `brightness(${Math.max(.1, Math.min(2, graph.exposure))}) ${grayscale}`;
  context.drawImage(source, 0, 0, width, height); context.filter = 'none';
  if (graph.bloom && graph.bloom.strength > 0) {
    const gw = Math.max(1, Math.round(width / 4)), gh = Math.max(1, Math.round(height / 4));
    if (glow.width !== gw) glow.width = gw;
    if (glow.height !== gh) glow.height = gh;
    // Contrast pushes midtones toward black before blur; opaque silhouettes stay crisp.
    glowContext.filter = `brightness(${1 / Math.max(.2, graph.bloom.threshold)}) contrast(300%) ${grayscale}`;
    glowContext.globalCompositeOperation = 'copy';
    glowContext.drawImage(source, 0, 0, gw, gh);
    glowContext.filter = 'none';
    context.globalCompositeOperation = 'screen'; context.globalAlpha = Math.min(.18, graph.bloom.strength * .18);
    context.filter = `blur(${Math.max(1, graph.bloom.radius * 14)}px)`;
    context.drawImage(glow, 0, 0, width, height); context.filter = 'none';
  }
  if (graph.vignette) {
    const gradient = context.createRadialGradient(width * .5, height * .45, height * .28, width * .5, height * .5, Math.hypot(width, height) * .56);
    gradient.addColorStop(0, 'rgba(5,9,18,0)'); gradient.addColorStop(1, `rgba(5,9,18,${Math.min(.45, graph.vignette)})`);
    context.globalCompositeOperation = 'source-over'; context.globalAlpha = 1; context.fillStyle = gradient; context.fillRect(0, 0, width, height);
  }
  context.restore();
}
