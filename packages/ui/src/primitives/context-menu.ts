export type ContextMenuRequest = { point?: { x: number; y: number }; target: HTMLElement; source: 'pointer' | 'keyboard' };

/** Hosts provide the same actions as their visible menu; editing keeps its native menu. */
export function bindContextMenu(target: HTMLElement, open: (request: ContextMenuRequest) => void) {
  const previous = target.getAttribute('data-hf-context-surface');
  target.setAttribute('data-hf-context-surface', '');
  function eligible(event: Event) {
    if (event.defaultPrevented || !(event.target instanceof Element)) return false;
    if (event.target.closest('[data-hf-context-surface]') !== target) return false;
    if (event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),a[href],[data-native-context-menu]')) return false;
    return !target.ownerDocument.getSelection()?.toString();
  }
  const pointer = (event: MouseEvent) => {
    if (!eligible(event)) return;
    event.preventDefault();event.stopPropagation();
    open({ target, source: 'pointer', point: { x: event.clientX, y: event.clientY } });
  };
  const keyboard = (event: KeyboardEvent) => {
    if (event.repeat || event.isComposing || !(event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) || !eligible(event)) return;
    event.preventDefault();event.stopPropagation();open({ target, source: 'keyboard' });
  };
  target.addEventListener('contextmenu', pointer);
  target.addEventListener('keydown', keyboard);
  return () => {
    target.removeEventListener('contextmenu', pointer);target.removeEventListener('keydown', keyboard);
    if (previous === null) target.removeAttribute('data-hf-context-surface');else target.setAttribute('data-hf-context-surface', previous);
  };
}

export function moveContextMenuFocus(menu: HTMLElement, event: KeyboardEvent) {
  const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter(item => item.closest('[role="menu"]') === menu && !item.hasAttribute('disabled') && item.getAttribute('aria-disabled') !== 'true' && !item.closest('[hidden]'));
  if (!items.length) return;
  const index = items.findIndex(item => item === menu.ownerDocument.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (index + 1) % items.length : event.key === 'ArrowUp' ? index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length : -1;
  if (next < 0) return;
  event.preventDefault();event.stopPropagation();items[next]!.focus();
}
