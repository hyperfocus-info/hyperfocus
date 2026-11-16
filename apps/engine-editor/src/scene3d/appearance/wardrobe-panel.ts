import type { AppearanceCatalog3D } from '@hyperfocus/engine/project/runtime-3d';
import { profileIcons } from '@hyperfocus/touch-of-death/appearance/profile';
import type { createWardrobeState, PlayerAppearance } from './wardrobe-state.ts';
import { wardrobeStyles } from './styles.ts';
import type { WardrobeView } from './preview.ts';
import { createWardrobePages } from './wardrobe-pages.ts';
import { cosmeticTargets, itemTargetId } from '@hyperfocus/touch-of-death/rewards/targets';

export function createWardrobePanel(options: {
  canvas: HTMLCanvasElement; catalog: AppearanceCatalog3D; state: ReturnType<typeof createWardrobeState>;
  onInteract(): void; onChange(look: PlayerAppearance): void; onOpenChange(open: boolean): void;
  onPreview?(phase: 'intro' | 'victory'): void;
  onPreviewStyle?(channel: 'movement' | 'hit' | 'particles' | 'recovery'): void;
  canEquip?(slot: string, option: string): boolean;
  onView?(view: WardrobeView): void;
  onTarget?(target: string): void;
}) {
  const host = document.createElement('section');host.className = 'hf-wardrobe';
  host.innerHTML = `<button type="button" data-wardrobe-open>Your fighter</button><dialog aria-labelledby="hf-wardrobe-title">
    <header><h2 id="hf-wardrobe-title">Your fighter</h2><button type="button" data-wardrobe-close aria-label="Cancel wardrobe changes">×</button></header>
    <div class="hf-wardrobe-body"><div class="hf-wardrobe-preview"><canvas data-wardrobe-preview aria-label="Live fighter preview"></canvas><p>Preview any style. Cosmetic changes only.</p></div>
    <div class="hf-wardrobe-options" data-wardrobe-editor><div data-wardrobe-identity><label>Fighter name<input data-wardrobe-name maxlength="48" autocomplete="off" spellcheck="false"></label>
    <fieldset><legend>Profile icon</legend><div class="hf-wardrobe-choices" data-wardrobe-icons role="radiogroup" aria-label="Profile icon"></div></fieldset></div>
    <section data-wardrobe-looks><h3>Signature looks</h3><p>One cut, one palette, one entrance. Preview the whole look, then earn its pieces together.</p><div data-wardrobe-look-list></div></section><div data-wardrobe-slots class="hf-wardrobe-options"></div><section data-wardrobe-outfits><h3>Saved outfits</h3><p>Save up to three named looks. Saving an outfit also saves your fighter.</p><div data-wardrobe-presets></div></section></div></div>
    <div class="hf-wardrobe-preview-actions"><button type="button" data-wardrobe-stop-preview hidden>Back to equipped style</button><button type="button" data-wardrobe-target hidden>Work toward this style</button></div><p data-wardrobe-status role="status" aria-live="polite"></p><div class="hf-wardrobe-recovery" data-wardrobe-recovery hidden><button type="button" data-wardrobe-retry>Try loading again</button><button type="button" data-wardrobe-defaults>Use default fighter</button></div>
    <footer><button type="button" data-wardrobe-cancel>Cancel</button><button type="button" data-wardrobe-save>Save fighter</button></footer></dialog>`;
  const style = document.createElement('style');style.textContent = wardrobeStyles;host.append(style);options.canvas.parentElement!.append(host);
  const query = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  const dialog = query<HTMLDialogElement>('dialog'), launcher = query<HTMLButtonElement>('[data-wardrobe-open]');
  const name = query<HTMLInputElement>('[data-wardrobe-name]'), status = query<HTMLParagraphElement>('[data-wardrobe-status]');
  const choiceButtons: Array<{ button: HTMLButtonElement; slot?: string; value: string; label: string }> = [];
  if (options.onView) {
    const views = document.createElement('div');views.className = 'hf-wardrobe-views';views.setAttribute('role', 'group');views.setAttribute('aria-label', 'Fighter viewing angle');
    for (const [id, label] of [['front', 'Front'], ['three-quarter', '3/4'], ['side', 'Side']] as const) {
      const button = document.createElement('button');button.type = 'button';button.textContent = label;button.dataset.wardrobeView = id;button.setAttribute('aria-pressed', String(id === 'three-quarter'));
      button.onclick = () => { options.onInteract();options.onView?.(id);for (const other of views.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other === button)); };views.append(button);
    }
    query('.hf-wardrobe-preview').append(views);
  }
  const previewButtons = (['intro', 'victory'] as const).map(phase => {
    const button = document.createElement('button');button.type = 'button';button.dataset.wardrobePreviewPose = phase;
    button.textContent = phase === 'intro' ? 'Preview intro' : 'Preview victory';
    button.hidden = !options.onPreview || !options.catalog.slots.some(slot => slot.options.some(option => option.poses?.some(pose => pose.phase === phase)));
    button.onclick = () => { if (!options.state.state.ready || options.state.state.busy) return;options.onInteract();options.onPreview?.(phase); };
    query('.hf-wardrobe-preview').append(button);return button;
  });
  for (const channel of ['movement', 'hit', 'particles', 'recovery'] as const) {
    const button = document.createElement('button');button.type = 'button';button.dataset.wardrobePreviewStyle = channel;
    button.textContent = `Preview ${channel === 'hit' ? 'hit reaction' : channel === 'recovery' ? 'get-up' : channel}`;
    button.hidden = !options.onPreviewStyle || !options.catalog.slots.some(slot => slot.options.some(option => option.styles?.some(style => style.channel === channel)));
    button.onclick = () => { if (!options.state.state.ready || options.state.state.busy) return;options.onInteract();options.onPreviewStyle?.(channel); };
    query('.hf-wardrobe-preview').append(button);previewButtons.push(button);
  }
  const cardPreview = document.createElement('p');cardPreview.dataset.wardrobeCard = '';query('.hf-wardrobe-preview').append(cardPreview);
  let disposed = false, menu = true, localError = '';
  let trying: { selections: Record<string, string>; label: string; target: string } | undefined;
  const targets = cosmeticTargets(options.catalog.slots.flatMap(slot => slot.options.map(option => ({ slot: slot.id, option: option.id, label: `${slot.label}: ${option.label}`, rarity: option.rarity }))));
  function notify() { const look = options.state.state.draft;options.onChange(trying ? { ...look, selections: { ...look.selections, ...trying.selections } } : look); }
  query('[data-wardrobe-stop-preview]').onclick = () => { trying = undefined;notify();render(menu);pages.focus(); };
  query('[data-wardrobe-target]').onclick = () => { const target = trying?.target;if (!target || options.state.state.busy) return;close();options.onTarget?.(target); };
  function chooseTarget(id: string) {
    const target = targets.find(target => target.id === id);if (!target || !options.state.state.ready || options.state.state.busy) return;
    options.onInteract();
    if (Object.entries(target.selections).some(([slot, value]) => options.canEquip?.(slot, value) === false && options.state.state.saved.current.selections[slot] !== value)) {
      trying = { selections: target.selections, label: target.label, target: id };localError = '';notify();render(menu);
    } else edit({ selections: { ...options.state.state.draft.selections, ...target.selections } });
  }
  const looks = targets.filter(target => target.kind === 'look');
  query('[data-wardrobe-looks]').hidden = !looks.length;
  for (const look of looks) {
    const button = document.createElement('button');button.type = 'button';button.className = 'hf-signature-look';button.dataset.signatureLook = look.id;
    const title = document.createElement('strong'), detail = document.createElement('span');title.textContent = look.label;detail.textContent = look.description;button.append(title, detail);
    button.onclick = () => chooseTarget(look.id);query('[data-wardrobe-look-list]').append(button);
  }
  if (looks.length && options.onPreview) for (const phase of ['intro', 'victory'] as const) {
    const button = document.createElement('button');button.type = 'button';button.textContent = phase === 'intro' ? 'Watch entrance' : 'Watch victory';button.onclick = () => { options.onInteract();options.onPreview?.(phase); };query('[data-wardrobe-looks]').append(button);
  }
  function edit(change: Partial<PlayerAppearance>) {
    try { options.state.edit({ ...options.state.state.draft, name: name.value, ...change });trying = undefined;localError = '';notify(); }
    catch (cause) { localError = cause instanceof Error ? cause.message : 'Choose a valid fighter appearance.'; }
    render(menu);
  }
  function choice(parent: HTMLElement, label: string, value: string, slot?: string, color?: readonly number[], rarity?: string) {
    const button = document.createElement('button');button.type = 'button';button.textContent = label;button.setAttribute('role', 'radio');button.dataset.wardrobeChoice = value;
    if (color) { const swatch = document.createElement('span');swatch.className = 'hf-wardrobe-swatch';swatch.setAttribute('aria-hidden', 'true');swatch.style.backgroundColor = `rgb(${color.slice(0, 3).map(value => Math.round(value * 255)).join(',')})`;button.prepend(swatch); }
    button.onclick = () => {
      options.onInteract();
      if (slot && options.canEquip?.(slot, value) === false && options.state.state.saved.current.selections[slot] !== value) { trying = { selections: { [slot]: value }, label, target: itemTargetId({ slot, option: value }) };localError = '';notify();render(menu); }
      else if (slot) edit({ selections: { ...options.state.state.draft.selections, [slot]: value } });else edit({ icon: value });
    };
    if (rarity) { button.dataset.rarity = rarity;const badge = document.createElement('small');badge.className = 'hf-cosmetic-rarity';badge.textContent = rarity[0]!.toUpperCase() + rarity.slice(1);button.append(badge); }
    parent.append(button);choiceButtons.push({ button, slot, value, label });
  }
  for (const icon of profileIcons) choice(query('[data-wardrobe-icons]'), icon[0]!.toUpperCase() + icon.slice(1), icon);
  for (const slot of options.catalog.slots) {
    const field = document.createElement('fieldset'), legend = document.createElement('legend'), group = document.createElement('div');
    field.dataset.wardrobeSlot = slot.id;legend.textContent = slot.label;group.className = 'hf-wardrobe-choices';group.setAttribute('role', 'radiogroup');group.setAttribute('aria-label', slot.label);
    field.append(legend, group);query('[data-wardrobe-slots]').append(field);
    if (options.canEquip && slot.options.some(option => !options.canEquip!(slot.id, option.id))) { const help = document.createElement('p');help.textContent = 'Starter styles are free. Unlock more in Rewards (100 coins per box). Device and online collections are separate.';field.append(help); }
    for (const option of slot.options) choice(group, option.label, option.id, slot.id, option.colors?.[0]?.baseColor, option.rarity);
  }
  const presets = Array.from({ length: 3 }, (_, index) => {
    const row = document.createElement('div');row.className = 'hf-wardrobe-outfit';
    const input = document.createElement('input');input.maxLength = 24;input.placeholder = `Outfit ${index + 1} name`;input.setAttribute('aria-label', `Outfit ${index + 1} name`);
    const load = document.createElement('button'), save = document.createElement('button');load.type = save.type = 'button';load.textContent = 'Wear';save.textContent = 'Save';
    load.setAttribute('aria-label', `Wear outfit ${index + 1}`);save.setAttribute('aria-label', `Save outfit ${index + 1}`);
    load.onclick = () => { options.onInteract();try { options.state.usePreset(index);trying = undefined;localError = '';name.value = options.state.state.draft.name;notify(); } catch (cause) { localError = String(cause); }render(menu); };
    save.onclick = () => { void saveLook({ index, name: input.value }); };
    row.append(input, load, save);query('[data-wardrobe-presets]').append(row);return { input, load, save, savedName: '' };
  });
  const pages = createWardrobePages({ dialog, catalog: options.catalog });
  async function saveLook(preset?: { index: number; name: string }) {
    if (trying || localError || options.state.state.busy || !options.state.state.ready) return;
    options.onInteract();const pending = options.state.save(preset);render(menu);await pending;if (disposed) return;notify();render(menu);
    if (!options.state.state.error && !preset && dialog.open) close(false);
  }
  function close(discard = true) {
    if (options.state.state.busy) return;
    if (discard) options.state.discard();trying = undefined;localError = '';name.value = options.state.state.draft.name;notify();dialog.close();options.onOpenChange(false);launcher.focus();render(menu);
  }
  async function load() { const pending = options.state.load();render(menu);await pending;if (!disposed) { name.value = options.state.state.draft.name;notify();render(menu); } }
  launcher.onclick = () => { options.onInteract();localError = '';name.value = options.state.state.draft.name;pages.reset();dialog.showModal();options.onOpenChange(true);render(menu);pages.focus(); };
  query('[data-wardrobe-close]').onclick = query('[data-wardrobe-cancel]').onclick = () => { options.onInteract();close(); };
  query('[data-wardrobe-save]').onclick = () => { void saveLook(); };
  query('[data-wardrobe-retry]').onclick = () => { options.onInteract();void load(); };
  query('[data-wardrobe-defaults]').onclick = () => { if (options.state.state.ready || options.state.state.busy) return;options.onInteract();options.state.useDefaults();localError = '';name.value = options.state.state.draft.name;notify();render(menu); };
  name.oninput = () => edit({ name: name.value });
  dialog.addEventListener('cancel', event => { event.preventDefault();close(); });
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const target = event.target;if (!(target instanceof HTMLButtonElement) || target.getAttribute('role') !== 'radio') return;
    const buttons = [...target.parentElement!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = buttons.indexOf(target), delta = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
    if (buttons.length) { event.preventDefault();const next = buttons[(index + delta + buttons.length) % buttons.length]!;next.focus();next.click(); }
  });
  function render(isMenu: boolean) {
    menu = isMenu;
    if (!menu && dialog.open) { if (!options.state.state.busy) options.state.discard();trying = undefined;localError = '';dialog.close();options.onOpenChange(false);notify(); }
    launcher.hidden = !menu || dialog.open;
    const state = options.state.state, blocked = state.busy || !state.ready;
    const selectedCard = options.catalog.slots.flatMap(slot => slot.options.filter(option => option.id === (trying?.selections[slot.id] ?? state.draft.selections[slot.id] ?? slot.defaultOptionId))).flatMap(option => option.styles ?? []).find(style => style.channel === 'card')?.style;
    cardPreview.hidden = !selectedCard;cardPreview.textContent = state.draft.name;
    cardPreview.style.cssText = `padding:12px;border-radius:4px;color:white;background:${selectedCard === 'sunrise' ? 'linear-gradient(110deg,#502719,#241727)' : selectedCard === 'night' ? 'linear-gradient(110deg,#142b4b,#291b42)' : '#101821'};border-inline-start:3px solid ${selectedCard === 'sunrise' ? '#ffd28c' : selectedCard === 'night' ? '#cbb9ff' : 'transparent'}`;
    for (const input of host.querySelectorAll<HTMLInputElement>('dialog input')) input.disabled = blocked;
    for (const button of host.querySelectorAll<HTMLButtonElement>('dialog button')) button.disabled = state.busy;
    for (const button of previewButtons) button.disabled = blocked;
    for (const { button, slot, value, label } of choiceButtons) {
      const selected = (slot ? trying?.selections[slot] ?? state.draft.selections[slot] ?? options.catalog.slots.find(item => item.id === slot)!.defaultOptionId : state.draft.icon) === value;
      const locked = !!slot && options.canEquip?.(slot, value) === false && state.saved.current.selections[slot] !== value;
      button.setAttribute('aria-checked', String(selected));button.tabIndex = selected ? 0 : -1;button.disabled = blocked;button.dataset.locked = String(locked);
      button.title = locked ? 'Preview this style. Collect it in Rewards before equipping.' : '';
      const text = [...button.childNodes].find(node => node.nodeType === Node.TEXT_NODE);if (text) text.textContent = label + (locked ? ' · Locked · Preview' : '');
    }
    presets.forEach((row, index) => { const preset = state.saved.presets[index];if (preset && preset.name !== row.savedName) { row.savedName = preset.name;if (document.activeElement !== row.input) row.input.value = preset.name; }row.input.disabled = blocked || index > state.saved.presets.length;row.load.disabled = blocked || !preset;row.save.disabled = blocked || index > state.saved.presets.length || !!localError || !!trying; });
    query<HTMLButtonElement>('[data-wardrobe-save]').disabled = blocked || !!localError || !!trying;
    query('[data-wardrobe-stop-preview]').hidden = !trying;
    query('[data-wardrobe-target]').hidden = !trying || !options.onTarget;
    for (const button of host.querySelectorAll<HTMLButtonElement>('[data-signature-look]')) { button.disabled = blocked;button.setAttribute('aria-pressed', String(trying?.target === button.dataset.signatureLook)); }
    query('[data-wardrobe-recovery]').hidden = state.ready || state.busy;
    const error = localError || state.error;status.dataset.error = String(!!error);status.textContent = error || (state.busy ? 'Working…' : trying ? `Preview only: ${trying.label}. Unlock in Rewards to equip. Your saved fighter is unchanged.` : !state.ready ? 'Load your fighter to continue.' : state.dirty ? 'Unsaved changes' : state.hasSavedDeviceFighter ? 'Your fighter is saved on this device.' : 'Save your fighter on this device. Online collections are separate.');
  }
  void load();
  return { render, previewTarget(id: string) { if (!dialog.open) launcher.click();chooseTarget(id);query('[data-wardrobe-target]').focus(); }, get focused() { return dialog.open; }, get open() { return dialog.open; }, previewCanvas: query<HTMLCanvasElement>('[data-wardrobe-preview]'),
    dispose() { disposed = true;if (dialog.open) dialog.close();options.onOpenChange(false);host.remove(); } };
}
