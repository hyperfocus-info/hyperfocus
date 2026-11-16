export const wardrobeStyles = `
.hf-wardrobe .hf-cosmetic-rarity{display:block;font-size:11px;line-height:1.5;margin-top:3px;color:#bdc3bd;font-weight:400}
.hf-wardrobe-views{display:flex;gap:6px;margin-top:8px}.hf-wardrobe-views button{flex:1}.hf-wardrobe-views [aria-pressed=true]{border-color:var(--tod-accent,#e7aa63)}
.hf-wardrobe [data-rarity=uncommon] .hf-cosmetic-rarity{color:#b3cca0}
.hf-wardrobe [data-rarity=rare] .hf-cosmetic-rarity{color:#a7cce5}
.hf-wardrobe [data-rarity=legendary] .hf-cosmetic-rarity{color:#e7bb76}
.hf-wardrobe{position:absolute;inset:0;pointer-events:none;z-index:13;color:#edf4f7;font:14px/1.45 system-ui}
.hf-wardrobe [hidden]{display:none!important}.hf-wardrobe button,.hf-wardrobe dialog{pointer-events:auto}
.hf-wardrobe button{font:inherit;color:inherit;background:#152733;border:1px solid #506778;border-radius:5px;min-height:44px;padding:9px 13px;cursor:pointer}
.hf-wardrobe button:hover{background:#294653}.hf-wardrobe button:disabled{opacity:.45;cursor:pointer}
.hf-wardrobe button:focus-visible,.hf-wardrobe input:focus-visible{outline:2px solid #83e3da;outline-offset:3px}
.hf-wardrobe [data-wardrobe-open]{position:absolute;left:18px;bottom:20px}
.hf-wardrobe dialog{color:inherit;background:#0c1823;border:1px solid #526a78;border-radius:12px;width:min(900px,calc(100vw - 32px));max-height:calc(100dvh - 32px);padding:0;box-sizing:border-box;overflow:auto}
.hf-wardrobe dialog::backdrop{background:#020811cf}.hf-wardrobe header,.hf-wardrobe footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;background:#10212d}
.hf-wardrobe h2{font-size:24px;margin:0}.hf-wardrobe h3{font-size:16px;margin:0 0 10px}.hf-wardrobe p{margin:8px 0}
.hf-wardrobe-body{display:grid;grid-template-columns:minmax(220px,.85fr) minmax(0,1fr);gap:20px;padding:20px}
.hf-wardrobe-preview{position:sticky;top:0;align-self:start}.hf-wardrobe-preview canvas{display:block;width:100%;height:340px;background:radial-gradient(ellipse at center,#233944,#0c1823);border-radius:8px}
.hf-wardrobe-preview p{color:#b8cad5;text-align:center}.hf-wardrobe-options{min-width:0;display:grid;gap:18px}
.hf-wardrobe label{display:grid;gap:6px}.hf-wardrobe input{font:inherit;box-sizing:border-box;width:100%;min-width:0;min-height:44px;background:#08131b;color:inherit;border:1px solid #506778;border-radius:5px;padding:9px 11px}
.hf-wardrobe fieldset{margin:0;padding:0;border:0;min-width:0}.hf-wardrobe legend{margin-bottom:8px;font-weight:650}
.hf-wardrobe-choices{display:flex;flex-wrap:wrap;gap:7px}.hf-wardrobe [aria-checked=true]{border-color:#8ee5d6;background:#214b4c;box-shadow:inset 0 0 0 1px #8ee5d6}
.hf-wardrobe-swatch{display:inline-block;width:16px;height:16px;border:1px solid #adc3ca;border-radius:3px;vertical-align:middle;margin-right:8px}
.hf-wardrobe [role=radio]{flex:1 0 auto}.hf-wardrobe-outfit{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px;margin-top:8px}
.hf-wardrobe [data-wardrobe-status]{padding:0 20px;min-height:22px;color:#bad3df}.hf-wardrobe [data-wardrobe-status][data-error=true]{color:#ffd19b}
.hf-wardrobe-recovery{padding:0 20px 16px;display:flex;gap:8px}.hf-wardrobe footer{position:sticky;bottom:0;border-top:1px solid #314755}.hf-wardrobe [data-wardrobe-save]{background:#b8efdf;color:#10232b;border-color:#b8efdf;font-weight:700}
@media(max-width:600px){.hf-wardrobe dialog{width:calc(100vw - 16px);max-height:calc(100dvh - 16px)}.hf-wardrobe-body{grid-template-columns:1fr;padding:12px;gap:12px}.hf-wardrobe-preview{position:static}.hf-wardrobe-preview canvas{height:210px}.hf-wardrobe header,.hf-wardrobe footer{padding:12px}.hf-wardrobe h2{font-size:22px}.hf-wardrobe-outfit button{padding:8px}.hf-wardrobe [data-wardrobe-open]{left:12px;bottom:12px}}
.hf-wardrobe dialog[open]{display:flex;flex-direction:column;height:min(900px,calc(100dvh - 32px));overflow:hidden}
.hf-wardrobe header,.hf-wardrobe footer{flex-shrink:0}
.hf-wardrobe-body{flex:1;min-height:0;overflow:hidden}
.hf-wardrobe-preview{position:static;align-self:stretch;min-height:0;display:flex;flex-direction:column;justify-content:center}
.hf-wardrobe-preview canvas{height:0;max-height:none;flex:1;min-height:120px;aspect-ratio:auto}
.hf-wardrobe-preview>p:not([data-wardrobe-card]){font-size:12px;margin:4px 0}.hf-wardrobe-preview{position:relative}.hf-wardrobe-preview [data-wardrobe-card]{position:absolute;top:8px;left:8px;right:8px;margin:0;padding:6px;font-size:12px;pointer-events:none}.hf-wardrobe-views{margin-top:4px}
.hf-wardrobe-options[data-wardrobe-editor]{display:block;overflow:auto;padding:4px;scroll-padding:8px}
.hf-wardrobe-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.hf-wardrobe-tabs{display:flex;gap:6px;flex-shrink:0;overflow-x:auto;padding:8px 20px;scroll-padding-inline:20px;border-bottom:1px solid #526a78}.hf-wardrobe-tabs button{flex:0 0 auto;white-space:nowrap}.hf-wardrobe-tabs [aria-selected=true]{border-color:var(--tod-accent,#e7aa63);box-shadow:inset 0 -3px var(--tod-accent,#e7aa63)}
.hf-wardrobe .hf-wardrobe-shortcuts{flex-shrink:0;padding:4px 20px;margin:0;font-size:12px;color:var(--tod-muted,#b8cad5)}
.hf-wardrobe [data-wardrobe-editor] button{box-sizing:border-box;width:100%;max-width:100%;text-align:left}
.hf-wardrobe :is(.hf-wardrobe-tabs,[data-wardrobe-editor]){scrollbar-color:#637064 #16201a;scrollbar-width:thin}
.hf-wardrobe fieldset>button{margin-top:12px}
.hf-wardrobe [data-wardrobe-identity]>fieldset{margin-top:16px}
.hf-wardrobe footer{position:static;display:grid;grid-template-columns:1fr 1fr}
.hf-wardrobe [data-wardrobe-status]{flex-shrink:0;font-size:12px;margin:6px 0}
.hf-wardrobe dialog{background:#121b19;border-color:#58605a;border-top:3px solid #e7aa63;border-radius:2px;width:min(1080px,calc(100vw - 32px));color:#f1edde}
.hf-wardrobe header,.hf-wardrobe footer{background:#17221c}.hf-wardrobe h2{font:900 2rem/1.1 Impact,'Arial Narrow',sans-serif;text-transform:uppercase;letter-spacing:.02em}
.hf-wardrobe-body{grid-template-columns:minmax(240px,1.15fr) minmax(0,1fr);gap:24px}.hf-wardrobe button,.hf-wardrobe input{background:#25332d;border-color:#ffffff35;border-radius:2px}.hf-wardrobe button:hover:not(:disabled){background:#344b3e;border-color:#e7aa63}
.hf-wardrobe [aria-checked=true]{border-color:#e7aa63;background:#3c3b29;box-shadow:inset 3px 0 #e7aa63}.hf-wardrobe [data-wardrobe-save]{background:#e7aa63;color:#191c16;border-color:#e7aa63}
.hf-wardrobe [data-wardrobe-stop-preview]{flex-shrink:0;align-self:flex-start;margin:0 20px;border-color:#e7aa63}.hf-wardrobe [data-wardrobe-preview]{border-radius:2px}
.hf-wardrobe [data-locked=true]{color:#d7ded7}.hf-wardrobe .hf-wardrobe-tabs{border-color:#ffffff24}
.hf-wardrobe-outfit{grid-template-columns:1fr 1fr}.hf-wardrobe-outfit input{grid-column:1 / -1}
@media(max-width:600px){.hf-wardrobe dialog[open]{height:calc(100dvh - 16px)}.hf-wardrobe-body{grid-template-columns:1fr;grid-template-rows:210px minmax(0,1fr);gap:8px}.hf-wardrobe-preview canvas{height:180px;max-height:none}.hf-wardrobe-preview>p:not([data-wardrobe-card]){display:none}.hf-wardrobe-preview [data-wardrobe-card]{margin:0;flex-shrink:0}.hf-wardrobe header{padding:10px 12px}.hf-wardrobe footer{padding:10px 12px}.hf-wardrobe [data-wardrobe-status]{padding:0 12px}}
.hf-wardrobe-preview-actions{display:flex;flex-wrap:wrap;gap:8px;padding:0 20px;flex-shrink:0}.hf-wardrobe .hf-wardrobe-preview-actions [data-wardrobe-stop-preview]{margin:0}.hf-wardrobe [data-wardrobe-target]{border-color:#e7aa63;background:#e7aa63;color:#161a16}.hf-wardrobe .hf-signature-look{display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:6px;width:100%;padding:14px;margin:8px 0;min-height:80px}.hf-wardrobe .hf-signature-look strong{font-size:18px}.hf-wardrobe .hf-signature-look span{font-weight:400;line-height:1.4;color:#c4cbc4}.hf-wardrobe .hf-signature-look[aria-pressed=true]{border-color:#e7aa63;border-inline-start-width:4px;background:#302f24}.hf-wardrobe [data-wardrobe-looks]>button{margin:8px 8px 0 0}
.hf-wardrobe [data-wardrobe-looks]>button{width:auto}
`;
