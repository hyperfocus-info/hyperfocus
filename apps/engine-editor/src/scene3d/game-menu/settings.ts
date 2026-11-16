import { attachGameModal } from '@hyperfocus/ui/game-menu';
import { createGameSections } from '@hyperfocus/ui/game-menu';
import { gameMenuStyles } from './theme';

export function createGameSettings(options: { root: HTMLDetailsElement; summary: HTMLElement; body: HTMLElement; controls: HTMLElement; audio: HTMLElement; performance?: HTMLElement; motion?: HTMLElement }) {
  const dialog = document.createElement('dialog');dialog.setAttribute('aria-label', options.performance ? 'Game settings' : 'Sound and controls');dialog.className = 'tod-settings';
  const title = document.createElement('h2');title.textContent = 'Settings';
  const back = document.createElement('button');back.type = 'button';back.className = 'tod-back';back.textContent = 'Back';
  const style = document.createElement('style');style.textContent = gameMenuStyles + `
  .hf-runtime-controls:has(.tod-settings[open]){display:contents!important}.hf-runtime-controls:has(.tod-settings[open])>summary{display:none!important}
  .hf-runtime-controls .tod-settings{width:min(54rem,calc(100vw - 2rem));font:1rem/1.5 Arial,sans-serif}.tod-settings>div{padding:0!important}
  .hf-runtime-controls .tod-settings[open]{display:flex;flex-direction:column;overflow:hidden!important}.tod-settings>h2,.tod-settings>button{flex-shrink:0}.tod-settings>div{min-height:0;overflow:auto;overscroll-behavior:contain}
  .tod-settings [role=tabpanel]{max-width:40rem;margin:0 auto;min-height:14rem}.tod-settings .hf-audio-mix-row{grid-template-columns:minmax(7rem,1fr) minmax(6rem,2fr) 3rem;padding:.75rem 0!important;border:0!important;font-size:1rem}
  .hf-runtime-controls .tod-settings :is(button,select){min-height:44px;font:inherit}.hf-runtime-controls .tod-settings select{width:100%;margin:0 0 1rem;padding:.75rem}
  .hf-runtime-controls .tod-settings p{font-size:1rem;margin:.5rem 0 1rem}.hf-runtime-controls .tod-settings label:has(input[type=checkbox]){display:flex;align-items:center;gap:.5rem;min-height:48px}
  .hf-runtime-controls .tod-settings>button{margin:1.5rem 0 0;background:none;border:0}.tod-settings [role=tabpanel]>button{margin:.5rem .5rem .5rem 0!important}
  .hf-runtime-controls .tod-settings .hf-game-sections{display:flex;flex-direction:row;gap:1rem}.hf-runtime-controls .tod-settings .hf-game-sections button{width:auto;flex:1 1 0;margin:0}
  @media(max-width:500px){.tod-settings .hf-audio-mix-row{grid-template-columns:1fr 3rem!important}.tod-settings .hf-audio-mix-row input{grid-column:1/-1;grid-row:2}}
  `;
  if (options.performance) options.body.append(options.performance);
  if (options.motion) options.body.append(options.motion);
  const sections = createGameSections({ parent: options.body, label: 'Settings categories', sections: [{ id: 'audio', label: 'Sound', content: options.audio }, { id: 'controls', label: 'Controls', content: options.controls }, ...(options.motion ? [{ id: 'motion', label: 'Motion', content: options.motion }] : []), ...(options.performance ? [{ id: 'performance', label: 'Performance', content: options.performance }] : [])] });
  dialog.append(title, options.body, back);options.root.append(style, dialog);
  const modal = attachGameModal({ dialog, onClose() { options.root.open = false; } });
  const open = (category = 'audio') => { options.root.open = true;sections.select(category);modal.open(sections.element.querySelector<HTMLElement>('[aria-selected=true]') ?? undefined); };
  const onClick = (event: Event) => { event.preventDefault();open(); };
  options.summary.addEventListener('click', onClick);back.onclick = modal.close;
  return { open, close: modal.close, dispose() { options.summary.removeEventListener('click', onClick);sections.dispose();modal.dispose();dialog.remove();style.remove(); } };
}
