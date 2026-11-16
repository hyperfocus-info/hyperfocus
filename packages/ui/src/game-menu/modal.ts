import { registerOverlay } from "../primitives/overlay-stack";

let sequence = 0;
/** Native modal boundary shared by game compositions; return focus belongs to the invoking control. */
export function attachGameModal(options: { dialog: HTMLDialogElement; onClose?: () => void; onRequestClose?: () => void }) {
  const { dialog } = options;
  let unregister: (() => void) | undefined;
  const id = `hf-game-modal-${++sequence}`;
  dialog.classList.add('hf-game-modal');
  const close = () => { if (!dialog.open) return;dialog.close();unregister?.();unregister = undefined; };
  const onClose = () => { if (dialog.open) return;unregister?.();unregister = undefined;options.onClose?.(); };
  const requestClose = () => { options.onRequestClose?.();close(); };
  const onKey = (event: KeyboardEvent) => {
    // Gameplay must never receive confirm/back while a modal owns focus.
    // Escape must reach the registry after focused/delegated controls, then
    // the browser's native cancellable dialog default. Other keys stay local.
    if (event.key !== 'Escape') event.stopPropagation();
    if (event.key === 'Tab') {
      const targets = [...dialog.querySelectorAll<HTMLElement>('button,input,select,textarea,summary,[tabindex="0"]')].filter(node => {
        if (node.matches(':disabled,[tabindex="-1"]') || node.closest('[hidden],[inert]')) return false;
        for (let parent: HTMLElement | null = node; parent && parent !== dialog; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (parent instanceof HTMLDetailsElement && !parent.open && !parent.querySelector(':scope>summary')?.contains(node)) return false;
        }
        return true;
      });
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault();last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault();first?.focus(); }
    }
  };
  dialog.addEventListener('close', onClose);dialog.addEventListener('keydown', onKey);
  return {
    open(initial?: HTMLElement) { if (dialog.open) return;const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;dialog.showModal();unregister = registerOverlay({ id, element: dialog, close: requestClose, restoreFocus: trigger });(initial ?? dialog.querySelector<HTMLElement>('button:not(:disabled)'))?.focus(); },
    close,
    dispose() { close();unregister?.();dialog.removeEventListener('close', onClose);dialog.removeEventListener('keydown', onKey); },
  };
}
