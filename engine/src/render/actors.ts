import {
  createBarDrawCall,
  createInteractionOutlineDrawCall,
  createLabelDrawCall,
  rectHeight,
  rectWidth,
  type GroupRenderData,
  type Renderable,
  type RenderRectLike
} from "./draw-data.ts";
import type { RenderStage } from "./stage.ts";

export type ActorRenderData = {
  id?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  image?: CanvasImageSource;
  frame?: string | number;
  label?: string;
  health?: number;
  maxHealth?: number;
  selected?: boolean;
  interactable?: boolean;
  visible?: boolean;
  alpha?: number;
  ySort?: number;
};

export type ActorRendererConfig<TActor extends ActorRenderData = ActorRenderData> = {
  image?: CanvasImageSource;
  width?: number;
  height?: number;
  frameWidth?: number;
  frameHeight?: number;
  columns?: number;
  frames?: Record<string, RenderRectLike>;
  labelOffsetY?: number;
  healthOffsetY?: number;
  showLabels?: boolean;
  showHealthBars?: boolean;
  outlineSelected?: boolean;
  getFrame?: (actor: TActor) => RenderRectLike | undefined;
};

export function createActorRenderer<TActor extends ActorRenderData = ActorRenderData>(config: ActorRendererConfig<TActor> = {}) {
  function frameFor(actor: TActor) {
    const explicit = config.getFrame?.(actor);
    if (explicit) return explicit;
    if (typeof actor.frame === "string") return config.frames?.[actor.frame];
    if (typeof actor.frame === "number" && config.columns && config.frameWidth && config.frameHeight) {
      return {
        x: (actor.frame % config.columns) * config.frameWidth,
        y: Math.floor(actor.frame / config.columns) * config.frameHeight,
        width: config.frameWidth,
        height: config.frameHeight
      };
    }
    return undefined;
  }

  function toDrawCall(actor: TActor): GroupRenderData | undefined {
    if (actor.visible === false) return undefined;
    const image = actor.image ?? config.image;
    const width = actor.width ?? config.width ?? config.frameWidth ?? 32;
    const height = actor.height ?? config.height ?? config.frameHeight ?? 32;
    const frame = frameFor(actor);
    const calls: Renderable[] = [];
    if (image) {
      calls.push({
        kind: "sprite",
        image,
        x: actor.x,
        y: actor.y,
        width,
        height,
        sourceX: frame?.x,
        sourceY: frame?.y,
        sourceWidth: frame ? rectWidth(frame) : undefined,
        sourceHeight: frame ? rectHeight(frame) : undefined,
        alpha: actor.alpha,
        anchor: "bottom"
      });
    }
    if ((config.showHealthBars ?? true) && actor.health !== undefined && actor.maxHealth !== undefined) {
      calls.push(createBarDrawCall({
        x: actor.x - width / 2,
        y: actor.y + (config.healthOffsetY ?? -height - 8),
        width,
        height: 5,
        value: actor.health,
        max: actor.maxHealth,
        background: "rgba(0,0,0,0.55)",
        fill: "#66e26f",
        stroke: "rgba(255,255,255,0.4)"
      }));
    }
    if ((config.showLabels ?? true) && actor.label) {
      calls.push(createLabelDrawCall({
        x: actor.x,
        y: actor.y + (config.labelOffsetY ?? -height - 20),
        text: actor.label,
        background: "rgba(0,0,0,0.65)",
        fill: "#fff",
        maxWidth: Math.max(48, width * 2)
      }));
    }
    if ((config.outlineSelected ?? true) && (actor.selected || actor.interactable)) {
      calls.push(createInteractionOutlineDrawCall({
        x: actor.x - width / 2,
        y: actor.y - height,
        width,
        height,
        stroke: actor.selected ? "#ffd866" : "#8fd3ff",
        lineWidth: actor.selected ? 3 : 2,
        dash: actor.selected ? undefined : [4, 3]
      }));
    }
    return {
      kind: "group",
      id: actor.id,
      x: actor.x,
      y: actor.y,
      ySort: actor.ySort ?? actor.y,
      visible: actor.visible,
      alpha: actor.alpha,
      calls
    };
  }

  return {
    toDrawCall,
    draw(actor: TActor) {
      return toDrawCall(actor);
    },
    push(stage: Pick<RenderStage, "push">, layer: string, actors: Iterable<TActor>) {
      let pushed = 0;
      for (const actor of actors) {
        const call = toDrawCall(actor);
        if (!call) continue;
        stage.push(layer, call);
        pushed += 1;
      }
      return pushed;
    }
  };
}
