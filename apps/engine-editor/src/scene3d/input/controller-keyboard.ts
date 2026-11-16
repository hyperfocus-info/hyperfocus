type TextField = HTMLInputElement | HTMLTextAreaElement;
type Action = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel';

/** A controller edits the ordinary field; its existing input/change handlers own persistence. */
export function createControllerKeyboard(options: { parent?: HTMLElement } = {}) {
  const dialog = document.createElement('dialog');dialog.className = 'hf-controller-keyboard';
  const heading = document.createElement('h2'), help = document.createElement('p');
  let preview: TextField = document.createElement('input');
  preview.readOnly = true;preview.tabIndex = -1;preview.setAttribute('aria-label', 'Text being edited');
  help.textContent = 'D-pad moves between keys. Choose Done to save, or Cancel to restore the original text.';
  const keys = document.createElement('div'), actions = document.createElement('div'), style = document.createElement('style');
  keys.className = 'hf-controller-keys';actions.className = 'hf-controller-key-actions';
  style.textContent = '.hf-controller-keyboard{box-sizing:border-box;width:min(640px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:16px;border:1px solid #e7aa63;background:#101615;color:#eee9dc;font:14px/1.4 Arial,Helvetica,sans-serif}.hf-controller-keyboard::backdrop{background:#000b}.hf-controller-keyboard h2{margin:0 0 10px;font-size:18px}.hf-controller-keyboard p{margin:12px 0 0;font-size:12px}.hf-controller-keyboard input,.hf-controller-keyboard textarea{box-sizing:border-box;width:100%;min-height:40px;margin:0 0 12px;padding:8px;border:1px solid #eee9dc70;background:#202a28;color:#eee9dc;font:inherit}.hf-controller-keys{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:4px}.hf-controller-key-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin-top:8px}.hf-controller-keyboard button{box-sizing:border-box;min-width:0;min-height:38px;padding:4px;border:1px solid #eee9dc60;background:#26302c;color:#eee9dc;font:700 13px/1 Arial,Helvetica,sans-serif;cursor:pointer}.hf-controller-keyboard button:hover{background:#39483e}.hf-controller-keyboard button:focus-visible,.hf-controller-keyboard button[data-pad-focus=true]{outline:2px solid #65d9ff;outline-offset:1px;background:#39483e}.hf-controller-keyboard button[aria-pressed=true]{border-color:#e7aa63;color:#e7aa63}@media(max-width:420px){.hf-controller-keyboard{padding:12px}.hf-controller-keys{gap:3px}.hf-controller-keyboard button{min-height:36px;font-size:12px}}';
  dialog.append(style, heading, preview, keys, actions, help);(options.parent ?? document.body).append(dialog);
  let target: TextField | undefined, original = '', start = 0, end = 0, originalStart = 0, originalEnd = 0, shifted = false, symbols = false, row = 0, column = 0;
  let rows: HTMLButtonElement[][] = [];
  function focus() {
    for (const button of rows.flat()) delete button.dataset.padFocus;
    const button = rows[row]?.[column];
    if (button) { button.dataset.padFocus = 'true';button.focus({ preventScroll: true });button.scrollIntoView?.({ block: 'nearest' }); }
  }
  function updatePreview() {
    if (!target) return;
    preview.value = target.value;
    // A password stays masked; copying it into textContent would expose it.
    if (preview instanceof HTMLInputElement) preview.type = target instanceof HTMLInputElement && target.type === 'password' ? 'password' : 'text';
  }
  function edit(value: string, remove = false) {
    if (!target) return;
    const current = target.value;
    if (remove && start === end && start > 0) start -= [...current.slice(0, start)].at(-1)!.length;
    const available = target.maxLength < 0 ? Infinity : Math.max(0, target.maxLength - current.length + end - start);
    let insertion = '';
    for (const character of value) { if (insertion.length + character.length > available) break;insertion += character; }
    target.value = current.slice(0, start) + insertion + current.slice(end);start += insertion.length;end = start;
    target.dispatchEvent(new Event('input', { bubbles: true }));updatePreview();
  }
  function close(cancel: boolean) {
    const field = target;if (!field) return;
    if (cancel && field.value !== original) { field.value = original;field.dispatchEvent(new Event('input', { bubbles: true })); }
    field.dispatchEvent(new Event('change', { bubbles: true }));target = undefined;dialog.close();
    field.focus({ preventScroll: true });
    try { field.setSelectionRange(cancel ? originalStart : start, cancel ? originalEnd : end); } catch { /* Email fields have no selection API. */ }
  }
  function button(label: string, action: () => void, parent: HTMLElement) {
    const item = document.createElement('button');item.type = 'button';item.textContent = label;
    item.addEventListener('click', action);parent.append(item);return item;
  }
  function rebuild() {
    keys.replaceChildren();actions.replaceChildren();
    const layout = symbols ? ['!@#$%^&*()', '-_=+[]{}\\|', ';:\'",.<>/?', '`~'] : ['1234567890', 'qwertyuiop', "asdfghjkl'", 'zxcvbnm,.?', '@_-:/+!#()'];
    rows = layout.map(letters => [...letters].map(letter => {
      const value = shifted ? letter.toUpperCase() : letter;
      return button(value, () => edit(value), keys);
    }));
    const controls = [button('Space', () => edit(' '), actions), button('Delete', () => edit('', true), actions), button('Shift', () => { shifted = !shifted;rebuild();focus(); }, actions), button(symbols ? 'Letters' : 'Symbols', () => { symbols = !symbols;rebuild();focus(); }, actions), button('Done', () => close(false), actions), button('Cancel', () => close(true), actions)];
    controls[2]!.setAttribute('aria-pressed', String(shifted));rows.push(controls.slice(0, 3), controls.slice(3));
    if (target instanceof HTMLTextAreaElement) rows.push([button('New line', () => edit('\n'), actions)]);
    row = Math.min(row, rows.length - 1);column = Math.min(column, rows[row]!.length - 1);
  }
  const cancel = (event: Event) => { event.preventDefault();event.stopPropagation();close(true); };
  dialog.addEventListener('cancel', cancel);
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') cancel(event);
  });
  return {
    get active() { return !!target; },
    open(field: TextField) {
      if (field.disabled || field.readOnly || field instanceof HTMLInputElement && !['text', 'email', 'url', 'password', 'search', 'tel'].includes(field.type)) return false;
      if (target) close(true);
      target = field;original = field.value;start = field.selectionStart ?? original.length;end = field.selectionEnd ?? start;
      originalStart = start;originalEnd = end;
      const nextPreview = field instanceof HTMLTextAreaElement ? document.createElement('textarea') : document.createElement('input');
      nextPreview.readOnly = true;nextPreview.tabIndex = -1;nextPreview.setAttribute('aria-label', 'Text being edited');preview.replaceWith(nextPreview);preview = nextPreview;
      shifted = false;symbols = false;row = 0;column = 0;
      const label = field.getAttribute('aria-label') ?? field.labels?.[0]?.textContent?.trim() ?? field.placeholder ?? 'text';
      heading.textContent = `Edit ${label || 'text'}`;dialog.setAttribute('aria-label', heading.textContent);
      rebuild();updatePreview();dialog.showModal();focus();return true;
    },
    handle(action: Action) {
      if (!target) return;
      if (action === 'cancel') { close(true);return; }
      if (action === 'confirm') { rows[row]?.[column]?.click();return; }
      if (action === 'up' || action === 'down') { row = (row + (action === 'down' ? 1 : -1) + rows.length) % rows.length;column = Math.min(column, rows[row]!.length - 1); }
      else column = (column + (action === 'right' ? 1 : -1) + rows[row]!.length) % rows[row]!.length;
      focus();
    },
    dispose() { if (target) close(true);dialog.remove(); },
  };
}
