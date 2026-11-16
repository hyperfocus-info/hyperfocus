/** Domain geometry and Touch of Death theme, shared by Quick Play, rotation and training. */
export const gameSessionStyles = `
.hf-network .tod-session{box-sizing:border-box;position:absolute;inset:0;width:100%;max-height:none;overflow:auto;pointer-events:auto;border:0;border-radius:0;background:linear-gradient(100deg,#101612f5,#101612cc 50%,#101612f5 85%);box-shadow:none;padding:max(3rem,env(safe-area-inset-top)) max(3rem,env(safe-area-inset-right)) max(4rem,env(safe-area-inset-bottom)) max(3rem,env(safe-area-inset-left));color:var(--game-text,#eee9dc);font:var(--game-body,1rem)/1.5 Arial,Helvetica,sans-serif;z-index:2;scroll-padding:2rem}
.tod-session *{box-sizing:border-box;min-width:0}.tod-session-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(18rem,26rem);gap:2rem 4rem;max-width:80rem;margin:auto;min-height:100%;align-content:center;align-items:center}
.hf-network .tod-session p{color:var(--game-muted,#bec6b9);font-size:1rem;max-width:52ch;margin:1rem 0;overflow-wrap:anywhere}
.hf-network .tod-session .tod-session-eyebrow{font-size:.875rem;letter-spacing:.12em;text-transform:uppercase;color:var(--game-accent,#e7aa63);margin:0 0 1.5rem}
.hf-network .tod-session .tod-session-title{font:600 var(--game-label,1.25rem)/1.3 Arial,sans-serif;color:var(--game-muted,#bec6b9);margin:0 0 1rem}
.hf-network .tod-session .tod-session-status{font:700 var(--game-heading,clamp(2rem,3vw,3rem))/1.15 Arial,sans-serif;letter-spacing:-.025em;color:var(--game-text,#eee9dc);margin:0 0 1.5rem;max-width:22ch;text-wrap:balance}
.hf-network .tod-session [role=alert]{color:#ffb4a8}.tod-session-actions{display:flex;flex-direction:column;gap:.5rem}
.hf-network .tod-session-actions button{width:100%;border:0;border-radius:0;background:transparent;color:var(--game-text,#eee9dc);text-align:left;min-height:56px;padding:.75rem 1rem;font:600 var(--game-label,1.25rem)/1.3 Arial,sans-serif;overflow-wrap:anywhere}
.hf-network .tod-session-actions button[data-priority=primary]{min-height:72px;background:var(--game-text,#eee9dc);color:var(--game-ink,#101612);margin-bottom:1rem}
.hf-network .tod-session-actions button[data-priority=utility]{font-size:1rem;color:var(--game-muted,#bec6b9)}
.hf-network .tod-session-actions button:hover:not(:disabled){background:#364335;color:var(--game-text,#eee9dc)}
.hf-network .tod-session-actions button[data-priority=primary]:hover:not(:disabled){background:var(--game-accent,#e7aa63);color:var(--game-ink,#101612)}
.hf-network .tod-session button:disabled{opacity:1;color:#a4aca2;background:#263028;cursor:pointer}
.hf-network .tod-session :is(button,input,select,textarea,summary):focus-visible,.hf-network .tod-session [data-pad-focus=true]{outline:3px solid var(--game-focus,#82e5ef)!important;outline-offset:3px!important}
.hf-network .tod-session-actions button:active:not(:disabled){translate:2px 0}
.tod-session-body{align-self:start;grid-column:1;max-width:36rem;width:100%}.tod-session-tools{grid-column:2;grid-row:2;align-self:start}
.hf-network .tod-session h3{font:600 1rem/1.5 Arial,sans-serif;margin:0 0 1rem;color:var(--game-muted,#bec6b9)}
.hf-network .tod-session ol{list-style:none;padding:0;margin:0}.hf-network .tod-session .tod-session-body li{display:flex;justify-content:space-between;gap:1rem;padding:.5rem 0;border:0;overflow-wrap:anywhere;align-items:baseline}.tod-session .tod-session-body li span:last-child{font-size:.875rem;color:var(--game-muted,#bec6b9)}
.tod-session .tod-session-body li[data-local=true] span:first-child{color:var(--game-accent,#e7aa63)}
.tod-session .tod-session-body li span:first-child{flex:1}.tod-session .tod-session-body li span:last-child{flex:0 0 auto;max-width:50%}
.hf-network .tod-session details{border-top:1px solid var(--game-line,#eee9dc36);margin:0 0 .5rem;padding:0}.hf-network .tod-session summary{min-height:48px;padding:.75rem .5rem;font-size:1rem}
.hf-network .tod-session-tools>details>div{padding:1rem .5rem}.hf-network .tod-session-tools:empty,.hf-network .tod-session p:empty{display:none}
.hf-network .tod-session-tools button{background:transparent;border-color:var(--game-line,#eee9dc36);border-radius:0;color:var(--game-text,#eee9dc);font-size:1rem;min-height:44px}
.hf-network .tod-session .hf-room-invitation{margin:0 0 1rem}.hf-network .tod-session .hf-room-invitation>button{margin:0}
.hf-network:has(.tod-session:not([hidden]))>.hf-network-live,.hf-network:has(.tod-session:not([hidden])) [data-community-open],.hf-network:has(.tod-session:not([hidden])) [data-training-open],.hf-network:has(.tod-session:not([hidden]))>.hf-voice-quick{visibility:hidden}
@media(max-width:800px),(max-height:480px){.hf-network .tod-session{padding:max(1.5rem,env(safe-area-inset-top)) max(1.5rem,env(safe-area-inset-right)) max(4rem,env(safe-area-inset-bottom)) max(1.5rem,env(safe-area-inset-left))}.tod-session-layout{grid-template-columns:minmax(0,1fr);gap:1.5rem;align-content:start;max-width:36rem;min-height:0}.tod-session-actions,.tod-session-tools,.tod-session-body{grid-column:1;grid-row:auto}.tod-session-actions{grid-row:2}.hf-network .tod-session .tod-session-eyebrow{margin-bottom:1rem}.hf-network .tod-session-actions button{min-height:48px}.hf-network .tod-session-actions button[data-priority=primary]{min-height:64px}.hf-network .tod-session .tod-session-body li{flex-wrap:wrap;gap:.25rem .75rem}}
@media(prefers-reduced-motion:reduce){.hf-network .tod-session-actions button:active{translate:none}}
`;
