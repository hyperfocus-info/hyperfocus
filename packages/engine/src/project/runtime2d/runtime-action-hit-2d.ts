import type { PlayableComponent2D } from "./runtime-2d-contracts.ts";

type ActionEntity2D = {
  id: string; x: number; y: number; width: number; height: number; scale: number;
  rotation?: number; opacity?: number; layer?: number; components?: readonly PlayableComponent2D[];
};
type Point2D = { x: number; y: number };
type HitOptions2D = { entities: readonly ActionEntity2D[]; worldPoint: Point2D; screenPoint?: Point2D };

/** Unscaled authored rectangle, including UI text's horizontal anchor. */
export function playableEntityLocalBounds2D(options: { entity: ActionEntity2D }) {
  return entityLocalBounds(options.entity);
}

function entityLocalBounds(entity: ActionEntity2D) {
  const component = renderedComponent(entity);
  const align = component?.type === "ui" ? component.values.align : undefined;
  return { x: align === "left" ? 0 : align === "right" ? -entity.width : -entity.width / 2, y: -entity.height / 2, width: entity.width, height: entity.height };
}

/** Resolve the frontmost authored sprite/UI action at an already mapped pointer position. */
export function hitTestPlayableAction2D(options: HitOptions2D): { entityId: string; action: string } | undefined {
  const entity = hitEntity(options.entities, options.worldPoint, options.screenPoint, true);
  const component = entity && renderedComponent(entity);
  return entity && component ? { entityId: entity.id, action: String(component.values.pointerAction) } : undefined;
}

/** Shared selection geometry for hosts that also edit the same world and screen-space entities. */
export function hitTestPlayableEntity2D(options: HitOptions2D): string | undefined {
  return hitEntity(options.entities, options.worldPoint, options.screenPoint, false)?.id;
}

function renderedComponent(entity: ActionEntity2D) {
  return entity.components?.find((component) => component.enabled && component.type === "ui")
    ?? entity.components?.find((component) => component.enabled && component.type === "sprite");
}

function hitEntity(entities: readonly ActionEntity2D[], worldPoint: Point2D, screenPoint: Point2D | undefined, actionsOnly: boolean) {
  let hit: ActionEntity2D | undefined;
  let layer = -Infinity, screenLayer = false;
  for (const entity of entities) {
    if ((entity.opacity ?? 1) <= 0 || !Number.isFinite(entity.scale) || entity.scale === 0) continue;
    const component = renderedComponent(entity);
    if (component?.values.visible === false || actionsOnly && (typeof component?.values.pointerAction !== "string" || !component.values.pointerAction.trim())) continue;
    const screen = component?.type === "ui" && component.values.screenSpace === true;
    const entityLayer = entity.layer ?? 0;
    if (hit && (screenLayer && !screen || screenLayer === screen && entityLayer < layer)) continue;
    const point = screen ? screenPoint ?? worldPoint : worldPoint;
    const dx = point.x - entity.x, dy = point.y - entity.y, angle = -(entity.rotation ?? 0);
    if (![dx, dy, angle, entity.width, entity.height].every(Number.isFinite) || entity.width <= 0 || entity.height <= 0) continue;
    const x = (dx * Math.cos(angle) - dy * Math.sin(angle)) / entity.scale, y = (dx * Math.sin(angle) + dy * Math.cos(angle)) / entity.scale;
    const bounds = entityLocalBounds(entity);
    if (x < bounds.x || x > bounds.x + bounds.width || y < bounds.y || y > bounds.y + bounds.height) continue;
    hit = entity;
    layer = entityLayer; screenLayer = screen;
  }
  return hit;
}
