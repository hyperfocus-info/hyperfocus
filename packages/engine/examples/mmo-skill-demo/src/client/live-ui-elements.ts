import { itemQty } from "../shared-loadout.ts";
import { type PlayerEntity } from "../shared-contracts.ts";
import { itemLabel, itemMeta } from "./live-ui-model.ts";
import { itemIconSrc } from "./live-ui-style.ts";

export function ownedItem(player: PlayerEntity, id: string) {
  const quantity = itemQty(player, id);
  return quantity > 0 ? { id, name: itemLabel(id), quantity, description: itemMeta(id, player) } : undefined;
}

export function itemIcon(id: string, alt = "") {
  const frame = document.createElement("span");
  frame.className = "mmo-item-icon";
  const img = document.createElement("img");
  img.src = itemIconSrc(id);
  img.alt = alt;
  img.loading = "lazy";
  frame.append(img);
  return frame;
}

export function namedBody(nameText: string, metaText = "") {
  const body = document.createElement("span");
  body.className = "mmo-item-body";
  const name = document.createElement("span");
  name.className = "mmo-item-name";
  name.textContent = nameText;
  const meta = document.createElement("span");
  meta.className = "mmo-item-meta";
  meta.textContent = metaText;
  body.append(name, meta);
  return body;
}

export function panelStack(...children: HTMLElement[]) {
  const wrap = document.createElement("div");
  wrap.className = "mmo-panel-stack";
  wrap.replaceChildren(...children);
  return wrap;
}

export function panelSection(titleText: string, ...children: HTMLElement[]) {
  const section = document.createElement("section");
  section.className = "mmo-panel-section";
  const header = document.createElement("div");
  header.className = "mmo-section-head";
  header.textContent = titleText;
  section.append(header, ...children);
  return section;
}

export function progressPill(label: string, value: number, max: number, suffix = "") {
  const wrap = document.createElement("div");
  wrap.className = "mmo-progress-pill";
  const safeMax = Math.max(1, max);
  const clamped = Math.max(0, Math.min(safeMax, value));
  const top = document.createElement("div");
  top.className = "mmo-progress-label";
  const left = document.createElement("span");
  left.textContent = label;
  const right = document.createElement("strong");
  right.textContent = suffix || `${Math.floor(clamped)}/${Math.floor(safeMax)}`;
  top.append(left, right);
  const track = document.createElement("div");
  track.className = "mmo-progress-track";
  const fill = document.createElement("div");
  fill.className = "mmo-progress-fill";
  fill.style.width = `${clamped / safeMax * 100}%`;
  track.append(fill);
  wrap.append(top, track);
  return wrap;
}

export function statChip(label: string, value: string | number, title?: string) {
  const chip = document.createElement("div");
  chip.className = "mmo-stat-chip";
  chip.title = title ?? `${label}: ${value}`;
  const labelNode = document.createElement("span");
  labelNode.textContent = label;
  const valueNode = document.createElement("strong");
  valueNode.textContent = String(value);
  chip.append(labelNode, valueNode);
  return chip;
}

export function statGrid(chips: HTMLElement[]) {
  const grid = document.createElement("div");
  grid.className = "mmo-stat-grid";
  grid.replaceChildren(...chips);
  return grid;
}



export function gridPanel(children: HTMLElement[]) {
  const grid = document.createElement("div");
  grid.className = "mmo-card-grid";
  grid.replaceChildren(...children);
  return grid;
}

export function textRows(rows: string[]) {
  const wrap = document.createElement("div");
  wrap.className = "mmo-text-list";
  for (const row of rows) {
    const line = document.createElement("div");
    line.textContent = row;
    wrap.append(line);
  }
  return wrap;
}
