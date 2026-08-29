import { itemIcons, uiAssetBase } from "../data/assets.ts";

const LIVE_UI_STYLE_ID = "mmo-skill-demo-live-ui";

function svgIcon(paths: string) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

export function toolbarIcons() {
  return {
    quest: svgIcon('<path d="M7 4h11v15H7z"/><path d="M5 6h2v15l2-2 2 2V6"/><path d="M10 8h5M10 12h6M10 16h4"/>'),
    event: svgIcon('<path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="M7 7l3 3"/><path d="M17 7l-3 3"/><path d="M7 17l3-3"/><path d="M17 17l-3-3"/>'),
    bag: svgIcon('<path d="M7 8h10l1 12H6L7 8z"/><path d="M9 8a3 3 0 0 1 6 0"/><path d="M9 13h6"/>'),
    gear: svgIcon('<path d="M12 3l7 4v5c0 4-2.7 7-7 9-4.3-2-7-5-7-9V7l7-4z"/><path d="M9 12l2 2 4-5"/>'),
    skills: svgIcon('<path d="M4 20l7-7"/><path d="M14 4l6 6"/><path d="M12 6l6 6-8 8H4v-6l8-8z"/><path d="M16 8l-8 8"/>'),
    stats: svgIcon('<path d="M5 19V9"/><path d="M12 19V5"/><path d="M19 19v-7"/><path d="M3 19h18"/>'),
    catalog: svgIcon('<path d="M5 5.5A3 3 0 0 1 8 3h12v17H8a3 3 0 0 0-3 3V5.5z"/><path d="M5 5.5A3 3 0 0 1 8 8h12"/><path d="M9 12h6"/>'),
    journal: svgIcon('<path d="M6 4h10l2 2v14H6z"/><path d="M16 4v4h4"/><path d="M9 10h6"/><path d="M9 14h7"/><path d="M9 18h4"/>'),
    craft: svgIcon('<path d="M14 4l6 6"/><path d="M4 20l6-6"/><path d="M12 6l6 6"/><path d="M7 17l-2-2 8-8 2 2-8 8z"/><path d="M17 3l4 4"/>'),
    map: svgIcon('<path d="M4 6l5-2 6 2 5-2v16l-5 2-6-2-5 2V6z"/><path d="M9 4v16"/><path d="M15 6v16"/><path d="M7 15l3-3 3 2 4-5"/>'),
    world: svgIcon('<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"/><path d="M3.6 9h16.8"/><path d="M3.6 15h16.8"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/>'),
    dungeon: svgIcon('<path d="M5 21V8l7-5 7 5v13"/><path d="M9 21v-7h6v7"/><path d="M8 10h2M14 10h2"/>'),
    cottage: svgIcon('<path d="M3 11l9-8 9 8"/><path d="M5 10v11h14V10"/><path d="M10 21v-6h4v6"/>'),
    heal: svgIcon('<path d="M12 5v14"/><path d="M5 12h14"/>')
  };
}

const LIVE_UI_STYLES = `
#ui {
  inset: 18px 18px auto auto;
  justify-items: end;
  max-height: calc(100vh - 36px);
  overflow: visible;
  pointer-events: none;
  width: auto;
}
#ui .ce-mmo-shell {
  align-items: end;
  gap: 8px;
  min-height: 0;
  pointer-events: none;
}
#ui .ce-mmo-chrome {
  background: linear-gradient(180deg, rgba(15, 19, 16, 0.78), rgba(5, 8, 8, 0.62));
  border-color: rgba(216, 181, 106, 0.48);
  box-shadow: 0 14px 36px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(255,238,174,0.08);
  pointer-events: auto;
}
#ui .ce-mmo-toolbar {
  display: grid;
  gap: 6px;
  grid-auto-flow: column;
  grid-auto-columns: 38px;
}
#ui .ce-mmo-tool {
  background: radial-gradient(circle at 50% 18%, rgba(245,211,118,0.20), rgba(10,14,13,0.88) 64%);
  border-color: rgba(216,181,106,0.52);
  box-shadow: inset 0 0 0 1px rgba(255,246,206,0.06), 0 8px 18px rgba(0,0,0,0.24);
  color: #f2dfaa;
  height: 38px;
  min-width: 38px;
  padding: 0;
}
#ui .ce-mmo-tool:hover,
#ui .ce-mmo-tool:focus-visible {
  border-color: rgba(255,233,154,0.9);
  color: #fff4bf;
  outline: none;
  transform: translateY(-1px);
}
#ui .ce-mmo-tool.is-active {
  color: #1b130d;
  box-shadow: 0 0 0 1px rgba(255,246,206,0.24), 0 0 22px rgba(216,181,106,0.24);
}
#ui .ce-mmo-tool-icon,
#ui .ce-mmo-tool-icon svg {
  height: 21px;
  width: 21px;
}
#ui .ce-mmo-tool-label {
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}
#ui .ce-mmo-body,
#ui .ce-mmo-panels {
  width: min(410px, calc(100vw - 28px));
}
#ui .ce-mmo-body {
  pointer-events: auto;
}
#ui .ce-mmo-panel {
  background:
    linear-gradient(180deg, rgba(19, 19, 17, 0.96), rgba(7, 10, 10, 0.95)),
    radial-gradient(circle at 80% 12%, rgba(216,181,106,0.16), transparent 36%);
  border-color: rgba(216,181,106,0.58);
  box-shadow: 0 22px 60px rgba(0,0,0,0.46), inset 0 0 0 1px rgba(255,245,201,0.08);
  max-height: min(68vh, 620px);
}
#ui .ce-mmo-panel-header {
  color: #f1d68b;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 17px;
  letter-spacing: 0;
  padding: 10px 12px;
}
#ui .ce-mmo-panel-body {
  max-height: min(58vh, 540px);
  overflow: auto;
  padding: 10px;
  scrollbar-color: rgba(216,181,106,0.56) rgba(8,10,10,0.6);
}
main.is-map-open::after,
main.is-map-open > #status,
main.is-map-open > #client-log {
  display: none;
}
main::after {
  content: none !important;
  display: none !important;
}
.mmo-panel-stack,
.mmo-panel-section,
.mmo-card-grid,
.mmo-text-list,
.mmo-stat-grid {
  display: grid;
}
.mmo-panel-stack { gap: 10px; }
.mmo-panel-section {
  background: rgba(11, 14, 13, 0.54);
  border: 1px solid rgba(133, 102, 55, 0.46);
  border-radius: 7px;
  gap: 8px;
  padding: 9px;
}
.mmo-section-head {
  align-items: center;
  color: #f1d68b;
  display: flex;
  font: 800 11px/1 Inter, ui-sans-serif, system-ui, sans-serif;
  gap: 6px;
  justify-content: space-between;
  letter-spacing: 0;
  text-transform: uppercase;
}
.mmo-card-grid {
  gap: 7px;
  grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
}
.mmo-item-card,
.mmo-skill-card,
.mmo-stat-chip,
.mmo-choice-card {
  background: linear-gradient(180deg, rgba(26,31,27,0.82), rgba(10,13,12,0.88));
  border: 1px solid rgba(156,126,70,0.42);
  border-radius: 6px;
  color: #f3ead7;
}
.mmo-item-card,
.mmo-skill-card,
.mmo-choice-card {
  cursor: pointer;
  display: grid;
  gap: 7px;
  min-width: 0;
  padding: 7px;
  text-align: left;
}
.mmo-item-card {
  grid-template-columns: 36px minmax(0, 1fr) auto;
  min-height: 50px;
}
.mmo-item-body {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.mmo-item-card:hover:not(:disabled),
.mmo-skill-card:hover:not(:disabled),
.mmo-choice-card:hover:not(:disabled) {
  border-color: rgba(255,226,139,0.86);
  color: #fff2ba;
}
.mmo-item-card.is-active,
.mmo-skill-card.is-active,
.mmo-choice-card.is-active {
  border-color: rgba(244,211,107,0.95);
  box-shadow: inset 0 0 0 1px rgba(244,211,107,0.28), 0 0 18px rgba(244,211,107,0.16);
}
.mmo-item-card.is-locked,
.mmo-skill-card.is-locked {
  background: linear-gradient(180deg, rgba(20,24,23,0.68), rgba(8,11,11,0.78));
  border-color: rgba(137,162,128,0.26);
}
.mmo-skill-card.is-complete {
  border-color: rgba(120,214,180,0.50);
}
.mmo-status-badge {
  border: 1px solid rgba(216,181,106,0.34);
  border-radius: 999px;
  color: #e7d9b3;
  font-size: 10px;
  font-weight: 900;
  padding: 2px 6px;
  white-space: nowrap;
}
.mmo-item-card:disabled,
.mmo-skill-card:disabled,
.mmo-choice-card:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}
.mmo-item-icon {
  align-items: center;
  background: radial-gradient(circle at 45% 32%, rgba(216,181,106,0.28), rgba(11,14,13,0.92) 72%);
  border: 1px solid rgba(216,181,106,0.42);
  border-radius: 5px;
  display: grid;
  height: 36px;
  justify-items: center;
  overflow: hidden;
  width: 36px;
}
.mmo-item-icon img {
  height: 30px;
  object-fit: contain;
  width: 30px;
}
.mmo-item-name,
.mmo-skill-name {
  font-size: 12px;
  font-weight: 800;
  line-height: 1.16;
  min-width: 0;
  overflow-wrap: anywhere;
}
.mmo-item-meta,
.mmo-skill-meta,
.mmo-text-list {
  color: #cfc3a9;
  font-size: 11px;
  line-height: 1.28;
}
.mmo-item-count {
  align-self: center;
  background: #d8b56a;
  border-radius: 999px;
  color: #14100d;
  font-size: 11px;
  font-weight: 900;
  min-width: 28px;
  padding: 3px 6px;
  text-align: center;
}
.mmo-tab-strip {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.mmo-tab,
.mmo-compact-button {
  background: rgba(18,22,20,0.82);
  border: 1px solid rgba(156,126,70,0.44);
  border-radius: 6px;
  color: #e9dec4;
  cursor: pointer;
  font: 800 11px/1 Inter, ui-sans-serif, system-ui, sans-serif;
  min-height: 32px;
  padding: 6px 8px;
}
.mmo-tab.is-active,
.mmo-compact-button.is-active {
  background: linear-gradient(180deg, #d8b56a, #a97432);
  color: #18110c;
}
.mmo-stat-grid {
  gap: 7px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.mmo-stat-chip {
  display: grid;
  gap: 3px;
  min-height: 48px;
  padding: 7px 8px;
}
.mmo-stat-chip span:first-child {
  color: #b9a98e;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
}
.mmo-stat-chip strong {
  font-size: 13px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.mmo-progress-pill {
  display: grid;
  gap: 4px;
}
.mmo-progress-label {
  align-items: center;
  color: #e7d9bc;
  display: flex;
  font-size: 11px;
  gap: 8px;
  justify-content: space-between;
}
.mmo-progress-track {
  background: rgba(0,0,0,0.46);
  border: 1px solid rgba(216,181,106,0.20);
  border-radius: 999px;
  height: 7px;
  overflow: hidden;
}
.mmo-progress-fill {
  background: linear-gradient(90deg, #6fd18f, #f4d36b);
  height: 100%;
}
.mmo-text-list {
  gap: 6px;
}
.mmo-text-list > div {
  border-top: 1px solid rgba(185,169,142,0.16);
  padding-top: 6px;
}
.mmo-choice-card {
  grid-template-columns: minmax(0, 1fr);
}
.mmo-slider-row {
  align-items: center;
  color: #f3ead7;
  display: grid;
  font-size: 12px;
  font-weight: 800;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto;
}
.mmo-slider-row input {
  grid-column: 1 / -1;
  width: 100%;
}
@media (max-width: 720px) {
  #ui {
    inset: auto 10px 10px 10px;
    justify-items: end;
  }
  #ui .ce-mmo-toolbar {
    grid-auto-flow: initial;
    grid-template-columns: repeat(6, 38px);
  }
  #ui .ce-mmo-panel {
    max-height: 52vh;
  }
  #ui .ce-mmo-panel-body {
    max-height: 44vh;
  }
  .mmo-tab-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .mmo-stat-grid {
    grid-template-columns: 1fr;
  }
}
`;

export function ensureLiveUiStyle(doc: Document) {
  if (doc.getElementById(LIVE_UI_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = LIVE_UI_STYLE_ID;
  style.textContent = LIVE_UI_STYLES;
  (doc.head ?? doc.documentElement).append(style);
}
export function itemIconSrc(id: string) {
  return `${uiAssetBase}${itemIcons[id] ?? itemIcons.empty}`;
}

export function tooltipText(title: string, line?: string, meta?: string) {
  return [title, line, meta].filter((part): part is string => Boolean(part)).join("\n");
}
