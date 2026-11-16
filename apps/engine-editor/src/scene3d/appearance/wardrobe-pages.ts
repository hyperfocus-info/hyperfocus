import type { AppearanceCatalog3D } from '@hyperfocus/engine/project/runtime-3d';

/** Keep authored choices intact; show one bounded group beside the fighter. */
export function createWardrobePages(options: { dialog: HTMLDialogElement; catalog: AppearanceCatalog3D }) {
  const { dialog, catalog } = options;
  const identity = dialog.querySelector<HTMLElement>('[data-wardrobe-identity]')!, outfits = dialog.querySelector<HTMLElement>('[data-wardrobe-outfits]')!;
  const fields = new Map([...dialog.querySelectorAll<HTMLElement>('[data-wardrobe-slot]')].map(field => [field.dataset.wardrobeSlot!, field]));
  const looks = dialog.querySelector<HTMLElement>('[data-wardrobe-looks]');
  const groups = [...(looks && !looks.hidden ? [{ label: 'Signature looks', field: looks }] : []), ...catalog.slots.map(slot => ({ label: slot.label, field: fields.get(slot.id)! })), { label: 'Profile', field: identity }, { label: 'Outfits', field: outfits }];
  for (const slot of catalog.slots) {
    const field = fields.get(slot.id)!;
    for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-wardrobe-preview-pose],[data-wardrobe-preview-style]')) {
      const phase = button.dataset.wardrobePreviewPose, channel = button.dataset.wardrobePreviewStyle;
      if (slot.options.some(option => option.poses?.some(pose => pose.phase === phase) || option.styles?.some(style => style.channel === channel))) field.append(button);
    }
  }
  const nav = document.createElement('nav');nav.className = 'hf-wardrobe-tabs';nav.setAttribute('role', 'tablist');nav.setAttribute('aria-label', 'Fighter categories');
  const help = document.createElement('p');help.className = 'hf-wardrobe-shortcuts';help.textContent = 'L1 / R1 or Q / E: category | D-pad / arrows: choose | Cross / Enter: equip | Circle / Esc: cancel';
  dialog.querySelector('header')!.after(nav, help);
  let page = 0;
  const buttons = groups.map((group, index) => {
    const button = document.createElement('button');button.type = 'button';button.textContent = group.label;button.setAttribute('role', 'tab');button.dataset.wardrobeCategory = String(index);
    button.id = 'hf-wardrobe-tab-' + index;group.field.id = 'hf-wardrobe-page-' + index;button.setAttribute('aria-controls', group.field.id);group.field.setAttribute('role', 'tabpanel');group.field.setAttribute('aria-labelledby', button.id);
    button.onclick = () => select(index, false);nav.append(button);return button;
  });
  function refresh() {
    groups.forEach((group, index) => { group.field.hidden = index !== page;buttons[index]!.setAttribute('aria-selected', String(index === page));buttons[index]!.tabIndex = index === page ? 0 : -1; });
  }
  function focusChoice() { buttons[page]!.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });(groups[page]!.field.querySelector<HTMLElement>('[aria-checked=true]:not(:disabled),input:not(:disabled),button:not(:disabled)') ?? buttons[page]!).focus({ preventScroll: true }); }
  function select(index: number, choose: boolean) { page = (index + groups.length) % groups.length;refresh();buttons[page]!.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });if (choose) focusChoice(); }
  dialog.addEventListener('wardrobe-category', event => {
    if (!(event instanceof CustomEvent) || typeof event.detail !== 'number' || !Number.isSafeInteger(event.detail)) throw new TypeError('Invalid wardrobe category movement.');
    select(page + event.detail, true);
  });
  dialog.addEventListener('keydown', event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLElement && event.target.isContentEditable || event.ctrlKey || event.altKey || event.metaKey) return;
    const key = event.key.toLowerCase(), tab = event.target instanceof HTMLElement && event.target.getAttribute('role') === 'tab';
    if (key === 'q' || key === 'e') { event.preventDefault();if (!event.repeat) select(page + (key === 'e' ? 1 : -1), true); }
    else if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault();select(event.key === 'Home' ? 0 : event.key === 'End' ? groups.length - 1 : page + (event.key === 'ArrowRight' ? 1 : -1), false);buttons[page]!.focus(); }
  });
  refresh();
  return { reset() { select(0, false); }, focus: focusChoice };
}
