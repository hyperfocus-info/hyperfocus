/** Standalone game branding; DOM controls intentionally avoid an editor framework dependency. */
export const rewardStyles = `
.tod-social-progress{position:absolute;right:1rem;bottom:4rem;z-index:8;width:min(18rem,calc(100% - 2rem));box-sizing:border-box;padding:.65rem .8rem;background:var(--game-surface,#151d18);color:var(--game-text,#eee9dc);font:.8rem/1.4 Arial,sans-serif;pointer-events:none}.tod-social-progress[hidden]{display:none}.tod-social-progress strong,.tod-social-progress span{display:block}.tod-social-progress progress{display:block;width:100%;height:4px;margin:.4rem 0;accent-color:var(--game-accent,#e7aa63)}.tod-social-progress span{color:var(--game-muted,#bec6b9)}

 .tod-social-reward-notice{position:absolute;bottom:4.5rem;left:50%;transform:translateX(-50%);z-index:12;box-sizing:border-box;max-width:calc(100% - 2rem);margin:0;padding:.75rem 1rem;background:var(--game-surface,#151d18);color:var(--game-text,#eee9dc);font:1rem/1.5 Arial,sans-serif;pointer-events:none;overflow-wrap:anywhere}.tod-social-reward-notice[hidden]{display:none}
 .hf-rewards dialog.hf-game-modal[open]{display:flex;flex-direction:column;overflow:hidden!important}.hf-rewards .tod-reward-header,.hf-rewards .tod-reward-footer{flex-shrink:0}.hf-rewards .tod-reward-layout{min-height:0;overflow:auto;overscroll-behavior:contain}
.hf-rewards{position:absolute;left:18px;bottom:76px;z-index:31;font:14px/1.45 system-ui;color:var(--hf-reward-text,#f1edde)}
.hf-rewards[hidden],.hf-rewards [hidden]{display:none!important}
.hf-rewards dialog{--reward-accent:#e9ad58;--reward-focus:#78e1ef;box-sizing:border-box;color:inherit;background:#121b19;border:1px solid #58605a;border-top:3px solid var(--reward-accent);width:min(600px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:clamp(16px,4vw,30px);box-shadow:0 24px 80px #0009}
.hf-rewards dialog::backdrop{background:#06100dc9;backdrop-filter:blur(8px)}
.hf-rewards header{position:relative;padding-bottom:18px;border-bottom:1px solid #ffffff24}
.hf-rewards h2{font-size:clamp(28px,5vw,42px);line-height:1.05;letter-spacing:-.04em;text-transform:uppercase;margin:0 0 16px;font-weight:900}
.hf-rewards h3{margin:0;font-size:17px}.hf-rewards p{margin:6px 0 12px;overflow-wrap:anywhere;color:#bdc5bd}
.hf-rewards [data-balance]{color:var(--reward-accent);font-size:25px;font-variant-numeric:tabular-nums;font-weight:750;margin:0}
.hf-rewards [data-scope]{font-size:12px;margin-bottom:0}.hf-rewards section{padding:18px 0;border-bottom:1px solid #ffffff24}
.hf-rewards button{box-sizing:border-box;display:block;width:100%;text-align:left;font:inherit;font-weight:650;min-height:48px;padding:12px 16px;border:1px solid #ffffff35;border-radius:2px;background:#25332d;color:inherit;cursor:pointer;transition:background .14s,border-color .14s}
.hf-rewards button:hover:not(:disabled){background:#344b3e;border-color:var(--reward-accent)}
.hf-rewards button:focus-visible{outline:3px solid var(--reward-focus);outline-offset:3px}
.hf-rewards button:disabled{color:#a7aea8;background:#19241f;border-color:#ffffff15;cursor:pointer}
.hf-rewards [data-action=daily]:not(:disabled){background:var(--reward-accent);border-color:var(--reward-accent);color:#191c16}
.hf-rewards [data-action=read]{border-color:#efbb74;margin:12px 0}.hf-rewards [data-close]{margin-top:20px;background:transparent}
.hf-rewards [data-achievement-list],.hf-rewards [data-collection]{display:grid;gap:8px;padding:0;list-style:none;margin:12px 0 0}
.hf-rewards [data-collection]:empty{display:none}.hf-rewards [data-next-info]{margin-top:18px}
.hf-rewards [data-receipt]{position:relative;isolation:isolate;overflow:hidden;margin-top:16px;border-left:3px solid var(--reward-accent);background:#e9ad5810;padding:14px 16px}
.hf-rewards [role=status]{position:relative;z-index:1;margin:0;color:inherit;font-weight:650;min-height:20px}
.hf-rewards [data-particles]{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:0}
.hf-rewards [data-particles] i{position:absolute;left:50%;top:65%;width:4px;height:10px;background:var(--reward-accent);box-shadow:0 0 8px #e9ad5890;animation:hf-reward-spark 900ms cubic-bezier(.1,.6,.3,1) both;animation-delay:var(--delay)}
@keyframes hf-reward-spark{0%{opacity:0;transform:translate(0,14px) rotate(0)}15%{opacity:1}100%{opacity:0;transform:translate(var(--x),var(--y)) rotate(var(--spin))}}
.hf-rewards [data-help]{font-size:12px;margin:14px 0 0;text-align:center}
@media(prefers-reduced-motion:reduce){.hf-rewards button{transition:none}.hf-rewards [data-particles]{display:none}.hf-rewards dialog::backdrop{backdrop-filter:none}}
.hf-rewards dialog.hf-game-modal{width:min(68rem,calc(100vw - 2rem));padding:2rem!important}
.hf-rewards .tod-reward-header{display:flex;justify-content:space-between;align-items:baseline;gap:1.5rem;border:0;padding:0;margin-bottom:2rem}
.hf-rewards .tod-reward-header h2{margin:0}.hf-rewards .tod-reward-header [data-scope]{max-width:26ch;text-align:right;font-size:.875rem}
.tod-reward-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:3rem}
.hf-rewards .tod-reward-hero{border:0;padding:0;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start}
.tod-coin{display:grid;place-items:center;width:4rem;height:4rem;border:2px solid var(--game-accent);border-radius:50%;font-size:2rem;color:var(--game-accent);box-shadow:0 0 0 .5rem #e7aa630c;margin-bottom:1.5rem}
.hf-rewards .tod-eyebrow{font-size:.875rem;text-transform:uppercase;letter-spacing:.12em;margin:0 0 .5rem}
.hf-rewards [data-balance]{font:900 clamp(2rem,4vw,3rem)/1.1 Impact,'Arial Narrow',sans-serif;max-width:100%;overflow-wrap:anywhere;color:var(--game-text)}
.hf-rewards .tod-reward-heading{font:900 clamp(2rem,4vw,3rem)/1.05 Impact,'Arial Narrow',sans-serif;text-transform:uppercase;margin:0 0 1.5rem}
.hf-rewards [data-unlock-host]{width:100%}.hf-rewards .tod-unlock{position:relative;border:1px solid var(--game-accent);border-left:4px solid var(--game-accent);padding:1.5rem;margin-bottom:1.5rem;background:linear-gradient(120deg,#e7aa631a,transparent)}
.hf-rewards .tod-unlock h3{font-size:1.75rem;line-height:1.15;margin:0 0 .5rem}.hf-rewards .tod-unlock [data-unlock-rarity]{font-size:.875rem}
.hf-rewards [data-unlock-swatch]{height:3rem;width:5rem;border:1px solid #ffffff40;margin-bottom:1rem}
.hf-rewards [data-unlock-equip]{background:var(--game-accent);color:var(--game-ink);border:0}.hf-rewards .tod-unlock[data-fresh=true]{animation:tod-unlock-in .3s ease-out both}
@keyframes tod-unlock-in{from{transform:translateY(8px);opacity:.5}to{transform:translateY(0);opacity:1}}
.hf-rewards [data-goals]{padding:0;list-style:none;width:100%;margin:.75rem 0}.hf-rewards [data-goals] li{padding:.75rem 0;border-bottom:1px solid var(--game-line);font-size:.875rem}.hf-rewards [data-goals] button{width:auto;margin-top:.5rem;min-height:44px}
.hf-rewards [data-achievement-list],.hf-rewards [data-other-achievements]{scroll-padding:8px;padding:4px}.hf-rewards :is([data-achievement-list],[data-other-achievements])>div{padding:.5rem 0;border-bottom:1px solid var(--game-line)}
.hf-rewards .tod-reward-activities :is([data-achievement-list],[data-other-achievements]) button:disabled{background:transparent;color:var(--game-text);padding:0;opacity:1}.hf-rewards :is([data-achievement-list],[data-other-achievements]) button:not(:disabled){background:var(--game-accent);color:var(--game-ink)}
.hf-rewards :is([data-achievement-list],[data-other-achievements]) small{display:block;color:var(--game-muted);font-variant-numeric:tabular-nums}.hf-rewards :is([data-achievement-list],[data-other-achievements]) progress{margin:.5rem 0}
.hf-rewards summary{min-height:44px;cursor:pointer;padding:.75rem 0;color:var(--game-text);font-weight:650}.hf-rewards .tod-goal-summary{width:100%}.hf-rewards [data-mastery]{font-size:.875rem}.hf-rewards .tod-all-milestones{margin-top:1rem}
@media(prefers-reduced-motion:reduce){.hf-rewards .tod-unlock[data-fresh=true]{animation:none}}
.hf-rewards [data-receipt]{border:0;background:none;padding:0;margin:1.5rem 0 .5rem}.hf-rewards [role=status]{font-size:1.125rem;color:var(--game-accent);min-height:0}
.hf-rewards [data-sets]{font-size:.875rem;margin-bottom:1.5rem}
.tod-progress-label{display:grid;grid-template-columns:1fr auto;gap:.5rem;width:100%;font-size:.875rem;color:var(--game-muted)}
.tod-progress-label progress{grid-column:1/-1}.hf-rewards progress{width:100%;height:.5rem;accent-color:var(--game-accent);border:0}
.hf-rewards progress::-webkit-progress-bar{background:#364335}.hf-rewards progress::-webkit-progress-value{background:var(--game-accent)}
.hf-rewards .tod-reward-explanation{font-size:.875rem;line-height:1.6;margin-top:1rem}
.hf-rewards .tod-reward-activities section{border:0;padding:0;min-height:8rem}.hf-rewards .tod-reward-activities h3{margin:0 0 1rem}
.hf-rewards .tod-reward-activities button:not([role=tab]){min-height:48px;font-size:1rem;padding:.75rem 1rem;border:0;background:#29372d;color:var(--game-text)}
.hf-rewards .tod-reward-activities :is([data-achievement-list],[data-other-achievements]) button:not(:disabled){background:var(--game-accent);color:var(--game-ink)}
.hf-rewards .tod-reward-activities :is([data-achievement-list],[data-other-achievements]) button:hover:not(:disabled){background:var(--game-text);color:var(--game-ink)}
.hf-rewards [data-unlock-preview]{margin-top:.5rem}.hf-rewards .tod-reward-layout:has(.tod-unlock:not([hidden])) .tod-reward-hero{grid-row:1}
[data-reduced-motion=true] .hf-rewards .tod-unlock{animation:none}[data-reduced-motion=true] .hf-rewards [data-particles]{display:none}
.hf-rewards .tod-reward-activities [data-action=daily]:not(:disabled){background:var(--game-accent);color:var(--game-ink)}
.hf-rewards .tod-reward-discovery{margin-top:2rem;border-top:1px solid var(--game-line);padding-top:1rem}.hf-rewards .tod-reward-discovery p{font-size:.875rem}
.hf-rewards .tod-reward-discovery button{background:none!important;border:0;color:var(--game-muted);padding-left:0!important}
.hf-rewards .tod-reward-footer{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-top:2rem;border-top:1px solid var(--game-line);padding-top:1rem}
.hf-rewards .tod-reward-footer [data-close]{width:auto;margin:0;background:none;border:0;font-size:1rem;min-height:48px}.hf-rewards .tod-reward-footer [data-help]{margin:0;font-size:.875rem;color:var(--game-muted)}
@media(max-width:760px){.tod-reward-layout{grid-template-columns:1fr;gap:1.5rem}.hf-rewards dialog.hf-game-modal{padding:1.5rem!important}.hf-rewards .tod-reward-header{display:block;margin-bottom:1rem}.hf-rewards .tod-reward-header [data-scope]{text-align:left;max-width:none;margin-top:.5rem}.hf-rewards .tod-reward-hero{padding:0}.tod-coin{display:none}.hf-rewards .tod-reward-footer{flex-wrap:wrap}.hf-rewards .tod-reward-footer [data-help]{display:none}.hf-rewards .tod-reward-activities{grid-row:1}.hf-rewards .tod-reward-heading{font-size:2rem}}
.hf-rewards .tod-style-goal{border-inline-start:3px solid var(--game-accent);padding:0 0 1.25rem 1rem;margin-bottom:1.25rem;border-bottom:1px solid var(--game-line)}
.hf-rewards .tod-style-goal h3{font-size:1.6rem;line-height:1.1;margin:.5rem 0}.hf-rewards .tod-style-goal p{font-size:.875rem}
.hf-rewards .tod-style-goal details{margin-top:.75rem}.hf-rewards .tod-style-goal summary{cursor:pointer;min-height:44px;align-content:center}.hf-rewards .tod-style-goal label{display:block}.hf-rewards .tod-style-goal button{margin-top:.5rem}.hf-rewards .tod-goal-actions{display:grid;gap:.25rem}.hf-rewards [data-goal-clear]{background:transparent!important;color:var(--game-muted)}
`;
