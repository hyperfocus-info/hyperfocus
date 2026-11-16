import { gameSelectStyles } from '@hyperfocus/ui/game-menu';

/** Touch of Death theme over semantic game roles. Spacing follows the shared 4/8/12/16/24/32/48/64 scale. */
export const gameMenuStyles = `
${gameSelectStyles}
.hf-fight-stage{--game-ink:#101612;--game-surface:#151d18;--game-text:#eee9dc;--game-muted:#bec6b9;--game-accent:#e7aa63;--game-focus:#82e5ef;--game-line:#eee9dc36;--game-space:1rem;--game-body:1rem;--game-label:1.25rem;--game-heading:clamp(2rem,3vw,3rem);--game-display:clamp(5rem,9vw,9rem);--game-fast:120ms;--game-enter:180ms}
.tod-menu,.hf-game-modal{color:var(--game-text,#eee9dc);font:var(--game-body,1rem)/1.5 Arial,Helvetica,sans-serif;box-sizing:border-box}
.tod-menu *,.hf-game-modal *{box-sizing:border-box;min-width:0}
.tod-menu [hidden],.hf-game-modal [hidden]{display:none!important}
.hyperfocus-gameplay-3d[data-game-menu=true]{padding:0!important;background:none!important;overflow:visible!important}
.hyperfocus-gameplay-3d[data-game-menu=true]::before,.hyperfocus-gameplay-3d[data-game-menu=true]::after,.hyperfocus-gameplay-3d[data-game-menu=true]>.hf3d-heading,.hyperfocus-gameplay-3d[data-game-menu=true]>.hf3d-overlay,.hyperfocus-gameplay-3d[data-game-menu=true]>.hf3d-bottom{display:none!important}
.tod-menu{position:absolute;inset:0;pointer-events:auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(20rem,28rem);align-items:center;gap:4rem;padding:max(2rem,env(safe-area-inset-top)) max(3rem,env(safe-area-inset-right)) max(4rem,env(safe-area-inset-bottom)) max(3rem,env(safe-area-inset-left));overflow:auto;background:linear-gradient(90deg,#101612e6 0%,#10161299 40%,#10161266 56%,#101612eb 78%);scroll-padding:2rem}
.tod-identity{align-self:center;max-width:38rem;text-shadow:0 2px 24px #0008}
.tod-identity h1{font:900 var(--game-display)/.9 Impact,'Arial Narrow',sans-serif;text-transform:uppercase;letter-spacing:-.025em;margin:0}
.tod-identity h1 span{display:block;font:800 .23em/2 Arial,sans-serif;letter-spacing:.22em}
.tod-identity p{margin:2rem 0 0;color:var(--game-muted);max-width:28ch}
.tod-menu-content{width:100%;padding:1rem 0;animation:tod-menu-enter var(--game-enter) ease-out both}
.tod-page-heading{margin:0 0 1.5rem}.tod-page-heading h2{font:700 var(--game-heading)/1.1 Arial,sans-serif;letter-spacing:-.025em;margin:0 0 .5rem}.tod-page-heading p{color:var(--game-muted);margin:0;max-width:36ch}
.tod-menu[data-page=root] .tod-page-heading{display:none}
.tod-menu[data-context=true] .tod-identity h1{font-size:clamp(3rem,6vw,6rem);line-height:1.05;overflow-wrap:anywhere}
.tod-menu[data-context=true] .tod-identity p{white-space:pre-line;font-size:1.125rem;line-height:1.6;max-width:42ch}
.tod-menu[data-page=context] .tod-page-heading{display:none}
.tod-menu[data-kind=pause]{background:linear-gradient(90deg,#101612d9,#10161299 45%,#101612eb 78%);backdrop-filter:blur(4px)}
.hf-game-actions{display:flex;flex-direction:column;gap:.5rem}
.tod-menu .hf-game-action,.hf-game-modal .hf-game-action{position:relative;display:flex;flex-direction:column;justify-content:center;gap:.25rem;width:100%;min-height:3.5rem;padding:.75rem 1rem;border:0;border-radius:0;background:transparent;color:var(--game-text);text-align:left;cursor:pointer;font:600 var(--game-label)/1.3 Arial,sans-serif;transition:background var(--game-fast),color var(--game-fast)}
.tod-menu .hf-game-action[data-priority=primary],.hf-game-modal .hf-game-action[data-priority=primary]{background:var(--game-text);color:var(--game-ink);min-height:4.5rem;margin-bottom:1rem;padding-right:3rem}
.hf-game-action[data-priority=primary]::after{content:'→';position:absolute;right:1rem;top:50%;transform:translateY(-50%);font-size:1.5rem}
.hf-game-action-detail{display:block;font:400 .875rem/1.4 Arial,sans-serif;color:var(--game-muted)}
.hf-game-action-label{overflow-wrap:anywhere}.hf-game-action[aria-current=true] .hf-game-action-label::after{content:' ✓';color:var(--game-accent)}
.hf-game-action[data-priority=primary] .hf-game-action-detail{color:#38443b}
.hf-game-action[data-priority=primary]:disabled .hf-game-action-detail{color:var(--game-muted)}
.tod-menu .hf-game-action[data-priority=utility]{font-size:1rem;color:var(--game-muted)}
.tod-menu .hf-game-action:hover:not(:disabled),.hf-game-modal .hf-game-action:hover:not(:disabled){background:#364335;color:var(--game-text)}
.tod-menu .hf-game-action[data-priority=primary]:hover:not(:disabled){background:var(--game-accent);color:var(--game-ink)}
.tod-menu :is(button,input,select):focus,.hf-game-modal :is(button,input,select,summary):focus-visible,.tod-menu [data-pad-focus=true],.hf-game-modal [data-pad-focus=true]{outline:3px solid var(--game-focus)!important;outline-offset:3px!important}
.tod-menu .hf-game-action:focus,.tod-menu .hf-game-action[data-pad-focus=true]{box-shadow:inset 4px 0 var(--game-focus)}
.hf-game-action:active:not(:disabled){translate:2px 0}.hf-game-action:disabled{opacity:1!important;color:#a4aca2!important;cursor:default;background:#263028!important}
.tod-back{font:600 1rem/1.4 Arial,sans-serif;border:0;background:none;color:var(--game-muted);min-height:44px;padding:.5rem 1rem;margin:0 0 1rem -1rem;cursor:pointer}
.tod-back::before{content:'←';margin-right:.5rem}
.tod-menu-help{position:absolute;left:max(3rem,env(safe-area-inset-left));bottom:max(1rem,env(safe-area-inset-bottom));font-size:.875rem;color:var(--game-muted)}
.hf-fight-stage[data-pad-navigation=true] .tod-menu-help{visibility:hidden}
.tod-menu-body:empty{display:none}.tod-menu-body{margin-bottom:1.5rem}
.tod-menu-body label{display:grid;grid-template-columns:1fr auto;gap:.5rem;color:var(--game-muted)}
.tod-menu-body input[type=range]{grid-column:1/-1;width:100%;min-height:44px;accent-color:var(--game-accent)}
.hf-game-modal{--game-ink:#101612;--game-surface:#151d18;--game-text:#eee9dc;--game-muted:#bec6b9;--game-accent:#e7aa63;--game-focus:#82e5ef;--game-line:#eee9dc36;--game-label:1.25rem;--game-body:1rem;--game-fast:120ms;background:var(--game-surface)!important;color:var(--game-text)!important;width:min(70rem,calc(100vw - 2rem));max-height:calc(100dvh - 2rem);border:0!important;padding:2rem!important;overflow:auto!important;box-shadow:0 24px 100px #0009}
.hf-game-modal::backdrop{background:#060c09c9;backdrop-filter:blur(8px)}
.hf-game-modal{max-width:calc(100vw - max(1rem,env(safe-area-inset-left),env(safe-area-inset-right)) - max(1rem,env(safe-area-inset-left),env(safe-area-inset-right)))!important;max-height:calc(100dvh - max(1rem,env(safe-area-inset-top),env(safe-area-inset-bottom)) - max(1rem,env(safe-area-inset-top),env(safe-area-inset-bottom)))!important}
.hf-game-modal h2{font:900 clamp(2rem,4vw,3rem)/1.1 Impact,'Arial Narrow',sans-serif;text-transform:uppercase;letter-spacing:.01em;margin:0 0 1.5rem}
.hf-game-modal h3{font:700 1.25rem/1.3 Arial,sans-serif;margin:0 0 1rem}.hf-game-modal p{max-width:55ch;overflow-wrap:anywhere}
.hf-game-modal button,.hf-game-modal select{min-height:44px}.hf-game-modal input[type=range]{min-height:44px;accent-color:var(--game-accent)}
.hf-game-sections{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1.5rem;border-bottom:1px solid var(--game-line)}
.hf-game-modal .hf-game-sections button{width:auto;flex:1 1 auto;min-height:48px;padding:.75rem .5rem;border:0;border-bottom:3px solid transparent;background:transparent;color:var(--game-muted);font:600 1rem/1.4 Arial,sans-serif;cursor:pointer;text-align:center}
.hf-game-modal .hf-game-sections button[aria-selected=true]{color:var(--game-text);border-bottom-color:var(--game-accent)}
.hf-game-modal .hf-game-sections button{transition:background var(--game-fast)}
@keyframes tod-menu-enter{from{opacity:0;translate:0 8px}to{opacity:1;translate:0 0}}
@media(max-width:800px){.tod-menu{grid-template-columns:1fr;align-content:start;gap:2rem;padding:2rem 1.5rem 4rem;background:linear-gradient(#101612b3,#101612ee 36%)}.tod-identity h1{font-size:clamp(4rem,15vw,6rem)}.tod-identity p{margin-top:1rem}.tod-menu-content{max-width:32rem;justify-self:center}.tod-menu-help{position:static;grid-column:1/-1;margin-top:1rem}.hf-game-modal{padding:1.5rem!important}.tod-menu[data-page=root] .tod-identity{justify-self:center;width:min(100%,32rem)}}
@media(max-height:480px){.tod-menu{grid-template-columns:1fr;align-content:start;gap:1.5rem;padding:1.5rem}.tod-identity h1{font-size:4rem}.tod-identity p{display:none}.tod-menu-content{max-width:32rem;justify-self:start}.tod-menu-help{position:static}.tod-menu .hf-game-action{min-height:44px}.hf-game-modal{padding:1rem!important}}
@media(prefers-reduced-motion:reduce){.tod-menu-content{animation:none}.hf-game-action{transition:none!important}.hf-game-action:active{translate:none}.hf-game-modal::backdrop{backdrop-filter:none}}
@media(max-width:800px){.tod-menu{padding:max(2rem,env(safe-area-inset-top)) max(1.5rem,env(safe-area-inset-right)) max(4rem,env(safe-area-inset-bottom)) max(1.5rem,env(safe-area-inset-left))}}
@media(max-height:480px){.tod-menu{padding:max(1.5rem,env(safe-area-inset-top)) max(1.5rem,env(safe-area-inset-right)) max(4rem,env(safe-area-inset-bottom)) max(1.5rem,env(safe-area-inset-left))}}
.hf-fight-stage .hf-pad-guide{left:max(1.5rem,env(safe-area-inset-left));bottom:max(1rem,env(safe-area-inset-bottom));max-width:calc(100% - 3rem)}
`;
