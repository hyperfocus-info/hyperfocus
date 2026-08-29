import { renderableRecord, renderRecord, type Renderable, type RenderFramePool } from "@hyperfocus/engine/render";
import { type LootEntity } from "../../shared-contracts.ts";
import { hash, type ClientImages } from "../assets.ts";
import type { InteractableTarget } from "./types.ts";

export function lootImage(images: ClientImages, loot: LootEntity) {
  switch (loot.itemId) {
    case "gold":
      return images.goldIcon;
    case "iron-ore":
      return images.ironOreIcon;
    case "silk-thread":
      return images.silkThreadIcon;
    case "glade-berry":
    case "glade-berries":
      return images.gladeBerryIcon;
    case "cinder-ale":
      return images.cinderAleIcon;
    case "speed-potion":
    case "speed-potions":
      return images.speedPotionIcon;
    case "leather-boots":
    case "mining-boots":
      return images.bootsIcon;
    case "iron-chest":
      return images.ironChestIcon;
    case "ring-focus":
      return images.ringFocusIcon;
    case "broken-hilt":
      return images.brokenHiltIcon;
    default:
      return undefined;
  }
}

export function lootColor(loot: Pick<LootEntity, "itemId">) {
  if (loot.itemId === "gold") return "#f4d36b";
  if (loot.itemId.includes("ore") || loot.itemId.includes("iron")) return "#c8d0d8";
  if (loot.itemId.includes("silk") || loot.itemId.includes("ring")) return "#dfb7ff";
  if (loot.itemId.includes("berry")) return "#ff8bb5";
  if (loot.itemId.includes("ale")) return "#ffb36b";
  return "#9bd6ff";
}

export function createLootRenderCalls(loot: LootEntity, images: ClientImages, timeMs: number, currentInteractable?: InteractableTarget, out: Renderable[] = [], pool?: RenderFramePool): Renderable[] {
  const bob = Math.sin(timeMs * 0.005 + hash(loot.id)) * 2;
  const color = lootColor(loot);
  const image = lootImage(images, loot);
  const calls: Renderable[] = pool ? pool.array() : [];
  const shadow = renderRecord(pool, "outline");
  shadow.x = loot.x - 13;
  shadow.y = loot.y + 6;
  shadow.width = 26;
  shadow.height = 10;
  shadow.shape = "ellipse";
  shadow.fill = "rgba(6, 10, 8, 0.62)";
  shadow.shadowColor = color;
  shadow.shadowBlur = 8;
  calls.push(renderableRecord(shadow));
  if (image) {
    const sprite = renderRecord(pool, "sprite");
    sprite.image = image;
    sprite.x = loot.x - 12;
    sprite.y = loot.y - 16 + bob;
    sprite.width = 24;
    sprite.height = 24;
    sprite.shadowColor = color;
    sprite.shadowBlur = 8;
    calls.push(renderableRecord(sprite));
  } else {
    const body = renderRecord(pool, "circle");
    body.x = loot.x;
    body.y = loot.y - 4 + bob;
    body.radius = 9;
    body.fill = color;
    body.shadowColor = color;
    body.shadowBlur = 8;
    calls.push(renderableRecord(body));
  }
  const ring = renderRecord(pool, "circle");
  ring.x = loot.x;
  ring.y = loot.y - 4 + bob;
  ring.radius = 14;
  ring.stroke = color;
  ring.lineWidth = 1.5;
  calls.push(renderableRecord(ring));
  if (loot.amount > 1) {
    const text = String(loot.amount);
    const outline = renderRecord(pool, "text");
    outline.text = text;
    outline.x = loot.x + 11;
    outline.y = loot.y + 9 + bob;
    outline.font = "800 10px system-ui";
    outline.align = "center";
    outline.fill = "rgba(0,0,0,0)";
    outline.stroke = "rgba(0,0,0,0.75)";
    outline.lineWidth = 3;
    calls.push(renderableRecord(outline));
    const label = renderRecord(pool, "text");
    label.text = text;
    label.x = loot.x + 11;
    label.y = loot.y + 9 + bob;
    label.font = "800 10px system-ui";
    label.align = "center";
    label.fill = "#f5f3e8";
    calls.push(renderableRecord(label));
  }
  if (currentInteractable?.type === "loot" && currentInteractable.id === loot.id) {
    const outline = renderRecord(pool, "outline");
    outline.x = loot.x - 18;
    outline.y = loot.y - 16;
    outline.width = 36;
    outline.height = 28;
    outline.shape = "ellipse";
    outline.stroke = "#ffffff";
    outline.lineWidth = 2;
    calls.push(renderableRecord(outline));
  }
  const group = renderRecord(pool, "group");
  group.id = loot.id;
  group.x = loot.x;
  group.y = loot.y;
  group.ySort = loot.y;
  group.calls = calls;
  out.push(renderableRecord(group));
  return out;
}
