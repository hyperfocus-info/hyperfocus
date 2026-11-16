import { fightScreenTheme } from './fight-screen-theme.ts';

/** Delivered-game chrome. These styles apply only to portable match layouts. */
export const fightScreenStyles = `
.hyperfocus-gameplay-3d[data-stage]{position:absolute!important;overflow:hidden;inset:auto;justify-content:space-between;gap:0;padding:24px;background:transparent}
.hyperfocus-gameplay-3d[data-stage=menu]{background:radial-gradient(ellipse at 20% 20%,#183841 0%,#101823 45%,#090d14 100%);justify-content:center;gap:24px}
.hyperfocus-gameplay-3d[data-stage=result]{background:linear-gradient(#090d1480,#090d14b3);backdrop-filter:blur(7px);justify-content:center;gap:20px;text-shadow:0 2px 8px #000;animation:hf3d-result-in .35s ease-out both;overflow:auto}
@keyframes hf3d-result-in{from{opacity:0;backdrop-filter:blur(0)}to{opacity:1;backdrop-filter:blur(7px)}}
.hf-fight-stage[data-fight-phase=result] :is([data-network-open],[data-network-quick],[data-replay-open],[data-wardrobe-open],[data-rewards-open]){display:none!important}
.hyperfocus-gameplay-3d[data-stage=result] .hf3d-menu-dock{margin-top:8px}
@media(prefers-reduced-motion:reduce){.hyperfocus-gameplay-3d[data-stage=result]{animation:none}}
.hyperfocus-gameplay-3d[data-stage=menu]:before{content:'TOUCH OF DEATH';position:absolute;left:5%;top:6%;font-size:12px;letter-spacing:.35em;color:#6adbdc}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay,.hyperfocus-gameplay-3d[data-stage=result] .hf3d-overlay{width:min(640px,100%);max-width:640px;min-height:210px;background:none;border:0;box-shadow:none;padding:24px}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay h2{font-size:clamp(42px,6vw,78px);letter-spacing:-.06em;text-transform:uppercase;font-weight:950;margin-bottom:24px}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay p{max-width:46ch;margin:auto;min-height:0;color:#bdccd7}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-bottom,.hyperfocus-gameplay-3d[data-stage=result] .hf3d-bottom{width:min(640px,100%);border:0;background:none;padding:0 20px}
.hyperfocus-gameplay-3d[data-stage] .hf3d-actions button{border-radius:4px}
.hyperfocus-gameplay-3d[data-stage] .hf3d-bottom{display:block}
.hyperfocus-gameplay-3d[data-stage] [hidden]{display:none!important}
.hyperfocus-gameplay-3d[data-stage=menu] [data-gameplay-action='match:start'],.hyperfocus-gameplay-3d[data-stage=result] [data-gameplay-action='match:replay']{background:#ff694f;color:#130d0c;min-width:180px}
.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-hint{font-size:12px;color:#91a8b8;max-width:56ch;margin:24px auto;line-height:1.8}
.hyperfocus-gameplay-3d[data-stage=intro]{justify-content:flex-end;background:linear-gradient(transparent 60%,#070e1de8)}
.hyperfocus-gameplay-3d[data-stage=intro] .hf3d-overlay{background:none;border:0;box-shadow:none;padding:12px}
.hyperfocus-gameplay-3d[data-stage=intro] .hf3d-bottom{background:none;border:0;padding:12px}
.hyperfocus-gameplay-3d[data-stage=countdown]{justify-content:center;background:none}
.hyperfocus-gameplay-3d[data-stage=countdown] .hf3d-overlay{background:none;border:0;box-shadow:none;text-shadow:0 3px 12px #000}
.hyperfocus-gameplay-3d[data-stage=countdown] .hf3d-overlay h2{font-size:100px;color:#fff1be}
.hyperfocus-gameplay-3d[data-stage=fight] .hf3d-heading{align-self:center;width:auto;max-width:none;background:#09111ab0;border:1px solid #ffffff24;border-radius:4px;padding:6px 16px;box-shadow:none}
.hyperfocus-gameplay-3d[data-stage=fight] .hf3d-heading h1{display:none}
.hyperfocus-gameplay-3d[data-stage=fight] .hf3d-heading>p:not(.hf3d-status){text-align:center;max-width:none;margin:0;font-weight:750;font-size:13px;letter-spacing:.1em}
.hyperfocus-gameplay-3d[data-stage=fight] .hf3d-bottom{width:auto;background:#0c162be8;padding:2px 8px;border-radius:4px;max-height:45%;overflow:auto;pointer-events:auto}
.hf3d-control-disclosure{pointer-events:auto}.hf3d-control-disclosure summary{min-height:36px;cursor:pointer;padding:8px 12px;color:#c1d1da}.hf3d-control-disclosure[open] summary{margin-bottom:8px}
@media(max-width:600px){.hyperfocus-gameplay-3d[data-stage]{padding:12px}.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-overlay{padding:12px;min-height:220px}.hyperfocus-gameplay-3d[data-stage=fight] .hf3d-heading{padding:6px 12px}.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-hint{margin:18px auto}.hyperfocus-gameplay-3d[data-stage=menu] .hf3d-actions{gap:6px}}
` + fightScreenTheme;

export function mountStandaloneFightScreen(canvas: HTMLCanvasElement) {
  const host = canvas.parentElement;if (!host) return;
  document.body.classList.add('hf-fight-player');host.classList.add('hf-fight-stage');
  const style = document.createElement('style');
  style.textContent = `html:has(.hf-fight-player),body.hf-fight-player{width:100%;height:100%;min-height:0;overflow:hidden;display:block;background:#090d14}.hf-fight-stage{position:relative!important;display:block;width:100vw;height:100dvh;max-width:none;padding:0;margin:0}.hf-fight-stage>canvas{position:absolute;inset:0;display:block;width:100%!important;height:100%!important;max-height:none;max-width:none;border:0}.hf-fight-stage>footer{display:none}.hf-fight-stage>.playable-controls:not(.playable-saves){position:absolute;z-index:7;right:12px;bottom:12px;width:auto;max-width:calc(100% - 24px);padding:0;display:flex;align-items:end;gap:8px}.hf-fight-stage>.playable-controls>.playable-actions{display:none}.hf-fight-stage>.playable-controls>details{background:#0c162bf5;border-radius:4px;padding:0 12px}.hf-fight-stage>.playable-controls>details[open]{position:absolute;bottom:50px;right:0;width:280px;padding:12px}.hf-fight-stage>.playable-controls>button{min-height:38px;padding:6px 12px;font-size:12px}.hf-fight-stage>.playable-saves{display:none}.hf-fight-stage[data-fight-phase=menu]>.playable-controls>button{display:none}.hf-fight-stage .hf3d-bottom{margin-right:0}.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=fight] .hf3d-bottom{align-self:flex-start;max-width:calc(100% - 230px)}@media(max-width:600px){.hf-fight-stage>.playable-controls{right:6px;bottom:8px;gap:4px}.hf-fight-stage>.playable-controls>details{font-size:11px;padding:0 8px}.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=fight] .hf3d-bottom{max-width:calc(100% - 175px)}.hf3d-control-disclosure summary{font-size:11px;padding:6px}}`;
  style.textContent += `.hf-fight-stage>.playable-controls{font-family:Arial,Helvetica,sans-serif;color:#eee9dc}.hf-fight-stage>.playable-controls>details{border:1px solid #eee9dc36;border-radius:0;background:#111611f5;color:#eee9dc}.hf-fight-stage>.playable-controls>details>summary{min-height:38px;display:list-item;align-content:center;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}.hf-fight-stage>.playable-controls button{border:1px solid #eee9dc36;border-radius:0;background:#151a17;color:#eee9dc;font-family:Arial,Helvetica,sans-serif;font-weight:700}.hf-fight-stage>.playable-controls button:hover:not(:disabled){border-color:#e7aa63;background:#323b31}.hf-fight-stage>.playable-controls button:focus-visible,.hf-fight-stage>.playable-controls summary:focus-visible{outline:2px solid #e7aa63;outline-offset:3px}.hf-fight-stage>.playable-controls input[type=range]{accent-color:#e7aa63}`;
  host.append(style);
}
