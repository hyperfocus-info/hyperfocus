import { mmoCatalog } from "../shared-world-catalog.ts";
import { type MmoCatalogDef, type PlayerEntity } from "../shared-contracts.ts";
import {
  CATALOG_SECTIONS,
  catalogEntryDiscovered,
  catalogEntryHint,
  catalogSectionById,
  labelize,
  type CatalogSectionId,
  type CatalogViewMode
} from "./live-ui-model.ts";
import { panelStack } from "./live-ui-elements.ts";

export function createCatalogPanel(input: { invalidate: () => void; render: () => void }) {
  let catalogSection: CatalogSectionId = "factions";
  let catalogViewMode: CatalogViewMode = "nearby";

  function catalogEntries(sectionId: CatalogSectionId): readonly MmoCatalogDef[] {
    return mmoCatalog[sectionId];
  }

  function catalogViewTabs() {
    const tabs = document.createElement("div");
    tabs.className = "mmo-tab-strip";
    tabs.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
    for (const mode of [
      { id: "nearby", label: "Nearby", title: "Known through the current route and local rumors" },
      { id: "all", label: "World", title: "All known names, including rumors" }
    ] as const) {
      const button = document.createElement("button");
      const active = catalogViewMode === mode.id;
      button.className = `mmo-tab${active ? " is-active" : ""}`;
      button.type = "button";
      button.textContent = mode.label;
      button.title = mode.title;
      button.addEventListener("click", () => {
        if (catalogViewMode === mode.id) return;
        catalogViewMode = mode.id;
        input.invalidate();
        input.render();
      });
      tabs.append(button);
    }
    return tabs;
  }

  function catalogTabs() {
    const tabs = document.createElement("div");
    tabs.className = "mmo-tab-strip";
    for (const section of CATALOG_SECTIONS) {
      const button = document.createElement("button");
      const active = section.id === catalogSection;
      button.className = `mmo-tab${active ? " is-active" : ""}`;
      button.type = "button";
      button.textContent = section.label;
      button.title = section.title;
      button.addEventListener("click", () => {
        if (catalogSection === section.id) return;
        catalogSection = section.id;
        input.invalidate();
        input.render();
      });
      tabs.append(button);
    }
    return tabs;
  }

  function catalogEntryRow(player: PlayerEntity, entry: MmoCatalogDef) {
    const row = document.createElement("div");
    const discovered = catalogEntryDiscovered(player, entry);
    row.className = `mmo-skill-card${discovered ? "" : " is-locked"}`;
    row.style.cursor = "default";

    const top = document.createElement("div");
    top.style.display = "grid";
    top.style.gridTemplateColumns = "minmax(0, 1fr) auto";
    top.style.gap = "8px";
    top.style.alignItems = "baseline";

    const name = document.createElement("strong");
    name.textContent = entry.name;
    name.style.color = "#f3ead7";
    name.style.fontSize = "12px";
    name.style.lineHeight = "1.2";
    name.style.minWidth = "0";
    name.style.overflowWrap = "anywhere";

    const meta = document.createElement("span");
    meta.textContent = discovered ? `${labelize(entry.zoneId)} | ${labelize(entry.role)}` : "Rumor";
    meta.style.color = "#b9a98e";
    meta.style.fontSize = "10px";
    meta.style.whiteSpace = "nowrap";

    const summary = document.createElement("div");
    summary.textContent = catalogEntryHint(player, entry);
    summary.style.color = "#d9cfb8";
    summary.style.fontSize = "11px";
    summary.style.lineHeight = "1.3";
    summary.style.overflowWrap = "anywhere";

    top.append(name, meta);
    row.append(top, summary);
    return row;
  }

  function catalogGroup(player: PlayerEntity, label: string, entries: readonly MmoCatalogDef[], open: boolean) {
    const details = document.createElement("details");
    details.className = "mmo-panel-section";
    details.open = open;

    const summary = document.createElement("summary");
    summary.textContent = `${label} (${entries.length})`;
    summary.style.cursor = "pointer";
    summary.style.color = "#d8b56a";
    summary.style.fontWeight = "800";
    summary.style.fontSize = "12px";

    const rows = document.createElement("div");
    rows.className = "mmo-card-grid";
    rows.style.marginTop = "6px";
    for (const entry of entries) rows.append(catalogEntryRow(player, entry));

    details.append(summary, rows);
    return details;
  }

  function groupedCatalogEntries(player: PlayerEntity, entries: readonly MmoCatalogDef[]) {
    const section = catalogSectionById(catalogSection);
    const groups = new Map<string, MmoCatalogDef[]>();
    for (const entry of entries) {
      const key = section.groupBy === "zone" ? entry.zoneId : entry.role;
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }

    const keys = [...groups.keys()];
    if (section.groupBy === "zone") {
      keys.sort((left, right) => {
        if (left === player.zoneId) return -1;
        if (right === player.zoneId) return 1;
        return labelize(left).localeCompare(labelize(right));
      });
    }

    return keys.map((key, index) => ({
      label: section.groupBy === "zone" && key === player.zoneId ? `${labelize(key)} nearby` : labelize(key),
      entries: groups.get(key) ?? [],
      open: index === 0
    }));
  }

  function catalogContent(player: PlayerEntity) {
    const section = catalogSectionById(catalogSection);
    const entries = catalogEntries(catalogSection);
    const visibleEntries = catalogViewMode === "nearby" ? entries.filter((entry) => catalogEntryDiscovered(player, entry)) : entries;
    const groups = groupedCatalogEntries(player, visibleEntries);
    const title = document.createElement("div");
    title.className = "mmo-section-head";
    title.textContent = `${section.title} (${visibleEntries.length}/${entries.length})`;
    return panelStack(catalogViewTabs(), catalogTabs(), title, ...groups.map((group) => catalogGroup(player, group.label, group.entries, group.open)));
  }

  return {
    content: catalogContent,
    key() {
      return `${catalogSection}:${catalogViewMode}`;
    }
  };
}
