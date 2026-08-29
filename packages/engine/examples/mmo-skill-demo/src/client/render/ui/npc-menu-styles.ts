const STYLE_ID = "mmo-npc-menu-layer-style";

const NPC_MENU_STYLES = `
.mmo-npc-menu-layer {
  box-sizing: border-box;
  display: grid;
  inset: 18px;
  align-items: end;
  justify-items: center;
  pointer-events: none;
  position: fixed;
  z-index: 40;
}
.mmo-npc-menu-layer[hidden] { display: none; }
.mmo-dialog-frame,
.mmo-market-frame {
  backdrop-filter: blur(18px) saturate(132%);
  background:
    linear-gradient(135deg, rgba(15, 22, 27, 0.86), rgba(20, 16, 25, 0.78)),
    radial-gradient(circle at 14% 10%, color-mix(in srgb, var(--npc-accent, #f4d36b) 26%, transparent), transparent 32%);
  border: 1px solid rgba(225, 239, 243, 0.34);
  border-radius: 8px;
  box-shadow: 0 28px 70px rgba(0,0,0,0.46), inset 0 0 0 1px rgba(255,255,255,0.08);
  box-sizing: border-box;
  color: #f5f3e8;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  pointer-events: auto;
  position: relative;
}
.mmo-dialog-frame {
  display: grid;
  gap: 18px;
  grid-template-columns: 230px minmax(320px, 620px);
  margin-bottom: min(8vh, 54px);
  max-width: min(980px, calc(100vw - 36px));
  padding: 16px 18px;
  width: min(980px, calc(100vw - 36px));
}
.mmo-dialog-portrait {
  align-content: start;
  background: linear-gradient(180deg, rgba(6, 12, 17, 0.78), rgba(16, 23, 22, 0.68));
  border: 1px solid color-mix(in srgb, var(--npc-accent, #f4d36b) 72%, white 12%);
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08), 0 0 28px color-mix(in srgb, var(--npc-accent, #f4d36b) 18%, transparent);
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 12px;
}
.mmo-dialog-portrait-image {
  aspect-ratio: 1;
  background: radial-gradient(circle at 50% 25%, color-mix(in srgb, var(--npc-accent, #73e2ff) 22%, #0b1115), #071016 76%);
  border: 2px solid color-mix(in srgb, var(--npc-accent, #73e2ff) 82%, white 10%);
  border-radius: 7px;
  display: grid;
  overflow: hidden;
  place-items: center;
}
.mmo-dialog-portrait img {
  height: 104%;
  image-rendering: auto;
  object-fit: contain;
  width: 104%;
}
.mmo-dialog-portrait strong {
  color: #ffd36a;
  font: 900 18px/1.1 Inter, ui-sans-serif, system-ui, sans-serif;
  overflow-wrap: anywhere;
}
.mmo-dialog-portrait span {
  color: #b8c9cf;
  font-size: 12px;
  line-height: 1.2;
}
.mmo-dialog-body {
  align-content: start;
  display: grid;
  gap: 12px;
  min-width: 0;
}
.mmo-dialog-speech {
  background: linear-gradient(180deg, rgba(20, 27, 35, 0.82), rgba(17, 22, 22, 0.74));
  border: 1px solid rgba(218, 235, 241, 0.34);
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
  color: #f6f0e3;
  font: 500 19px/1.28 Inter, ui-sans-serif, system-ui, sans-serif;
  min-height: 118px;
  overflow-wrap: anywhere;
  padding: 20px 22px;
}
.mmo-dialog-highlight {
  font-weight: 900;
  text-shadow: 0 0 14px currentColor;
}
.mmo-dialog-highlight-item { color: #ffd36a; }
.mmo-dialog-highlight-place { color: #55ddea; }
.mmo-dialog-highlight-quest { color: #9fe889; }
.mmo-dialog-topics {
  display: grid;
  gap: 8px;
}
.mmo-dialog-topic {
  align-items: center;
  background: linear-gradient(90deg, rgba(19, 27, 36, 0.88), rgba(17, 29, 25, 0.78));
  border: 1px solid rgba(201, 222, 229, 0.28);
  border-radius: 7px;
  color: #f5f3e8;
  cursor: pointer;
  display: grid;
  gap: 2px;
  grid-template-columns: minmax(0, 1fr);
  min-height: 46px;
  padding: 8px 14px;
  text-align: left;
}
.mmo-dialog-topic.is-focused {
  border-color: #55ddea;
  box-shadow: 0 0 0 2px rgba(85,221,234,0.62), 0 0 24px rgba(85,221,234,0.28);
}
.mmo-dialog-topic:hover {
  border-color: rgba(85,221,234,0.54);
  box-shadow: inset 0 0 0 1px rgba(85,221,234,0.22);
}
.mmo-dialog-topic-label {
  font-size: 16px;
  font-weight: 800;
  overflow-wrap: anywhere;
}
.mmo-dialog-topic-meta {
  color: #b8c9cf;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.mmo-npc-menu-close {
  background: rgba(5, 8, 10, 0.56);
  border: 1px solid rgba(255,255,255,0.22);
  border-radius: 999px;
  color: #f5f3e8;
  cursor: pointer;
  font: 900 12px/1 Inter, ui-sans-serif, system-ui, sans-serif;
  height: 28px;
  position: absolute;
  right: 10px;
  top: 10px;
  width: 28px;
}
.mmo-npc-menu-close:hover {
  border-color: #ff8b7a;
  color: #ffb3a6;
}
.mmo-npc-menu-prompt {
  color: #d9e7e9;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0;
  opacity: 0.86;
  text-align: right;
}
.mmo-market-frame {
  display: grid;
  gap: 12px;
  margin-bottom: min(6vh, 42px);
  max-width: min(980px, calc(100vw - 36px));
  padding: 14px;
  width: min(980px, calc(100vw - 36px));
}
.mmo-market-header {
  align-items: center;
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1fr) auto 28px;
  padding-right: 34px;
}
.mmo-market-header h2 {
  color: #f5f3e8;
  font-size: 24px;
  line-height: 1.05;
  margin: 0;
  overflow-wrap: anywhere;
}
.mmo-market-header p {
  color: #b8c9cf;
  font-size: 12px;
  margin: 4px 0 0;
}
.mmo-market-wallet {
  background: linear-gradient(180deg, #ffd36a, #bb7e2a);
  border-radius: 999px;
  color: #17100a;
  font-size: 13px;
  font-weight: 900;
  min-width: 72px;
  padding: 6px 12px;
  text-align: center;
}
.mmo-market-panes {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.mmo-market-pane {
  background: rgba(8, 13, 16, 0.54);
  border: 1px solid rgba(201, 222, 229, 0.26);
  border-radius: 8px;
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 10px;
}
.mmo-market-pane.is-active-pane {
  border-color: rgba(85,221,234,0.64);
  box-shadow: inset 0 0 0 1px rgba(85,221,234,0.18);
}
.mmo-market-pane h3 {
  color: #d9e7e9;
  font-size: 14px;
  margin: 0;
  text-align: center;
}
.mmo-market-grid {
  display: grid;
  gap: 9px;
  grid-template-columns: repeat(4, minmax(58px, 1fr));
  min-height: 210px;
}
.mmo-market-item {
  aspect-ratio: 1;
  background: radial-gradient(circle at 50% 24%, rgba(255,255,255,0.10), rgba(8,12,14,0.92) 70%);
  border: 1px solid rgba(195, 211, 217, 0.32);
  border-radius: 7px;
  color: #f5f3e8;
  cursor: pointer;
  display: grid;
  overflow: hidden;
  padding: 6px;
  place-items: center;
  position: relative;
}
.mmo-market-item:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}
.mmo-market-item img {
  height: 68%;
  object-fit: contain;
  width: 68%;
}
.mmo-market-item.rarity-common { border-color: rgba(205,216,218,0.35); }
.mmo-market-item.rarity-uncommon { border-color: rgba(143, 232, 137, 0.72); }
.mmo-market-item.rarity-rare { border-color: rgba(85, 221, 234, 0.78); }
.mmo-market-item.rarity-epic { border-color: rgba(212, 155, 231, 0.86); }
.mmo-market-item.is-focused {
  border-color: #55ddea;
  box-shadow: 0 0 0 2px rgba(85,221,234,0.78), 0 0 24px rgba(85,221,234,0.28);
}
.mmo-market-count,
.mmo-market-price {
  border-radius: 999px;
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
  padding: 3px 5px;
  position: absolute;
}
.mmo-market-count {
  background: rgba(8, 12, 14, 0.78);
  color: #d9e7e9;
  right: 5px;
  top: 5px;
}
.mmo-market-price {
  background: linear-gradient(180deg, #ffd36a, #b47a2c);
  bottom: 5px;
  color: #17100a;
  right: 5px;
}
.mmo-market-empty {
  align-items: center;
  color: #9fb0b6;
  display: grid;
  font-size: 12px;
  grid-column: 1 / -1;
  justify-items: center;
}
.mmo-market-action {
  align-items: center;
  background: linear-gradient(90deg, rgba(28, 80, 47, 0.78), rgba(14, 36, 32, 0.76));
  border: 1px solid rgba(108, 232, 134, 0.66);
  border-radius: 8px;
  color: #e8ffe8;
  display: grid;
  font-size: 15px;
  font-weight: 800;
  gap: 4px;
  min-height: 54px;
  padding: 8px 14px;
  text-align: center;
}
@media (max-width: 760px) {
  .mmo-npc-menu-layer {
    align-items: end stretch;
    inset: 10px;
  }
  .mmo-dialog-frame {
    grid-template-columns: 1fr;
    margin-bottom: 0;
    max-height: calc(100vh - 20px);
    overflow: auto;
    padding: 12px;
    width: 100%;
  }
  .mmo-dialog-portrait {
    grid-template-columns: 82px minmax(0, 1fr);
  }
  .mmo-dialog-portrait-image {
    grid-row: span 2;
  }
  .mmo-dialog-speech {
    font-size: 16px;
    min-height: 92px;
    padding: 14px;
  }
  .mmo-market-frame {
    margin-bottom: 0;
    max-height: calc(100vh - 20px);
    overflow: auto;
    width: 100%;
  }
  .mmo-market-panes {
    grid-template-columns: 1fr;
  }
  .mmo-market-grid {
    grid-template-columns: repeat(4, minmax(48px, 1fr));
    min-height: 124px;
  }
  .mmo-market-header h2 {
    font-size: 20px;
  }
}
`;

export function ensureNpcMenuStyles(doc: Document) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = NPC_MENU_STYLES;
  (doc.head ?? doc.documentElement).append(style);
}
