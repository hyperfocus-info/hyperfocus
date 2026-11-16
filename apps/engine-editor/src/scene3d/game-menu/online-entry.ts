import { gameMenuStyles } from './theme';

/** Invitation and room selection stay one step before joining; manual host details are contextual. */
export function attachOnlineEntry(form: HTMLFormElement) {
  const dialog = form.closest('dialog')!;dialog.classList.add('tod-online-entry');
  const title = form.querySelector<HTMLElement>('.hf-network-title')!;
  const eyebrow = document.createElement('p');eyebrow.className = 'tod-online-eyebrow';eyebrow.textContent = 'Touch of Death / Online';title.before(eyebrow);
  const style = document.createElement('style');style.textContent = gameMenuStyles + `
    .hf-network .tod-online-entry{width:min(64rem,calc(100vw - 2rem));border-radius:0;scroll-padding:1rem;overflow-wrap:anywhere}
    .hf-network .tod-online-entry form{max-height:none;display:block}
    .hf-network .tod-online-entry .tod-online-eyebrow{font-size:.875rem;letter-spacing:.12em;text-transform:uppercase;color:var(--game-accent);margin:0 0 1rem}
    .hf-network .tod-online-entry h2{font:700 var(--game-heading,2rem)/1.1 Arial,sans-serif;text-transform:none;letter-spacing:-.025em;margin:0}
    .hf-network .tod-online-entry [data-network-close]{border:0;background:none;font-size:1rem;flex-shrink:0}
    .hf-network .tod-online-entry p{color:var(--game-muted);font-size:1rem}
    .hf-network .tod-online-entry form>[data-network-fields]{overflow:visible;padding:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1rem 3rem;align-items:start;margin:2rem 0}
    .tod-online-entry [data-network-choice=roomType]{grid-column:1;grid-row:2/5}
    .tod-online-entry [data-network-choice=role]{grid-column:2;grid-row:3}
    .tod-online-entry #hf-network-role-help{grid-column:2;grid-row:4}
    .tod-online-entry .hf-room-invitation{grid-column:2;grid-row:2}
    .tod-online-entry [data-network-room-settings],.tod-online-entry [data-network-connection-details],.tod-online-entry [data-guest-recovery]{grid-column:1/-1}
    .tod-online-entry [data-network-fields]>div:has([data-guest-status]){grid-column:1/-1}
    .hf-network .tod-online-entry .hf-room-choices{display:flex;flex-direction:column;gap:.5rem;margin:0}
    .hf-network .tod-online-entry .hf-room-choices legend{font:600 1rem/1.5 Arial,sans-serif;margin:0 0 .75rem}
    .hf-network .tod-online-entry .hf-room-choices label{border:0;border-radius:0;min-height:64px;padding:.75rem 1rem;gap:1rem}
    .hf-network .tod-online-entry .hf-room-choices label:has(:checked){box-shadow:inset 3px 0 var(--game-accent);background:#29362d}
    .tod-online-entry .hf-room-choices span{font-size:1.125rem}.hf-network .tod-online-entry .hf-room-choices small{font-size:.875rem;color:var(--game-muted);margin-top:.25rem}
    .hf-network .tod-online-entry .hf-room-choices[data-network-choice=role]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
    .hf-network .tod-online-entry .hf-room-choices input{min-width:20px;width:20px;height:20px;min-height:20px;accent-color:var(--game-accent)}
    .hf-network .tod-online-entry .hf-room-invitation{margin:0}.hf-network .tod-online-entry .hf-room-invitation label{margin-top:0}
    .hf-network .tod-online-entry input,.hf-network .tod-online-entry textarea{border-radius:0;background:var(--game-ink);border-color:var(--game-line);color:var(--game-text)}
    .hf-network .tod-online-entry button{font:600 1rem/1.4 Arial,sans-serif;min-height:48px;border:0;border-radius:0;background:transparent;color:var(--game-text);padding:.75rem 1rem}
    .hf-network .tod-online-entry button[type=submit],.hf-network .tod-online-entry [data-network-cancel]{background:var(--game-text);color:var(--game-ink);font-size:1.25rem;min-height:64px;width:min(100%,26rem);text-align:left}
    .hf-network .tod-online-entry button:disabled{opacity:1;background:#263028;color:#a4aca2}.hf-network .tod-online-entry button:hover:not(:disabled){background:#364335;color:var(--game-text)}
    .hf-network .tod-online-entry button[type=submit]:hover:not(:disabled),.hf-network .tod-online-entry [data-network-cancel]:hover{background:var(--game-accent);color:var(--game-ink)}
    .hf-network .tod-online-entry[data-can-invite=true] [data-network-copy]{background:var(--game-text);color:var(--game-ink);font-size:1.25rem;min-height:64px;width:min(100%,26rem);text-align:left}
    .hf-network .tod-online-entry[data-can-invite=true] [data-network-copy]:hover:not(:disabled){background:var(--game-accent);color:var(--game-ink)}
    .hf-network .tod-online-entry[data-can-invite=true] [data-network-cancel]{background:transparent;color:var(--game-muted);font-size:1rem;min-height:48px;width:auto}
    .hf-network .tod-online-entry details{border-color:var(--game-line);margin:0;padding:0}.hf-network .tod-online-entry summary{min-height:48px;padding:.75rem 0;color:var(--game-muted)}
    .hf-network .tod-online-entry form>.hf-network-buttons{border:0;padding-top:1rem;justify-content:flex-end}
    .hf-network .tod-online-entry[data-entry-state=active] [data-network-status]{font-size:var(--game-label);max-width:52ch;color:var(--game-text);margin:2rem 0}
    .hf-network .tod-online-entry[data-entry-mode=quick] form>[data-network-fields]{display:block}
    .tod-online-entry[data-entry-mode=quick] [data-network-choice],.tod-online-entry[data-entry-mode=quick] .hf-room-invitation,.tod-online-entry[data-entry-mode=quick] #hf-network-role-help,.tod-online-entry[data-entry-mode=quick] [data-network-room-settings]{display:none}
    @media(max-width:800px),(max-height:480px){.hf-network .tod-online-entry form>[data-network-fields]{display:flex;flex-direction:column;gap:1.5rem;margin:1.5rem 0}.tod-online-entry [data-network-fields]>*{width:100%}.tod-online-entry .hf-room-invitation{order:0}.tod-online-entry [data-network-choice=roomType]{order:1}.tod-online-entry [data-network-choice=role]{order:2}.tod-online-entry #hf-network-role-help{order:3}.tod-online-entry [data-network-room-settings],.tod-online-entry [data-network-connection-details],.tod-online-entry [data-guest-recovery]{order:4}.hf-network .tod-online-entry form>.hf-network-buttons{justify-content:stretch}.hf-network .tod-online-entry button[type=submit]{width:100%}}
    @media(max-width:600px){.hf-network .tod-online-entry .hf-network-title{flex-wrap:wrap}.hf-network .tod-online-entry .hf-room-choices[data-network-choice=role]{display:flex}.hf-network .tod-online-entry [data-network-close]{margin-left:auto}}
  `;
  dialog.append(style);
  return {
    render(active: boolean, quick: boolean) { dialog.dataset.entryState = active ? 'active' : 'entry';dialog.dataset.entryMode = quick ? 'quick' : 'friends'; },
    dispose() { style.remove(); },
  };
}
