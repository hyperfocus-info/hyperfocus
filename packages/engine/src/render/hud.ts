import {
  createBarDrawCall,
  createInteractionOutlineDrawCall,
  createLabelDrawCall,
  createTextBlockDrawCall,
  defaultDrawState,
  drawRenderable,
  type RectRenderData,
  type RenderPaint,
  type Renderable,
  type TextBlockRenderData,
  type TextRenderData
} from "./draw-data.ts";

export type HudRendererConfig = {
  font?: string;
  fill?: RenderPaint;
  panelFill?: RenderPaint;
  panelStroke?: RenderPaint;
  drawDataCaches?: boolean;
};

export function createHudRenderer(config: HudRendererConfig = {}) {
  return {
    text(options: Omit<TextRenderData, "kind">): TextRenderData {
      return { kind: "text", font: config.font, fill: config.fill ?? "#fff", ...options };
    },
    textBlock(options: Omit<TextBlockRenderData, "kind">): TextBlockRenderData {
      return { kind: "text-block", font: config.font, fill: config.fill ?? "#fff", ...options };
    },
    panel(options: Omit<RectRenderData, "kind">): RectRenderData {
      return { kind: "rect", fill: config.panelFill ?? "rgba(0,0,0,0.65)", stroke: config.panelStroke, ...options };
    },
    bar: createBarDrawCall,
    label: createLabelDrawCall,
    outline: createInteractionOutlineDrawCall,
    textBlockCall: createTextBlockDrawCall,
    render(ctx: CanvasRenderingContext2D, calls: Iterable<Renderable>) {
      let drawn = 0;
      const state = { ...defaultDrawState, drawDataCaches: config.drawDataCaches ?? defaultDrawState.drawDataCaches };
      for (const call of calls) {
        if (drawRenderable(ctx, call, state)) drawn += 1;
      }
      return { drawn };
    }
  };
}
