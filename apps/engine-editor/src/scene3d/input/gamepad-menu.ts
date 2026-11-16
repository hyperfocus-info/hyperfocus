import { adjacentMenuTarget } from './menu-focus.ts';
import { combatBindingLabel } from '../fight-hud/control-hint.ts';
import { createControllerKeyboard } from './controller-keyboard.ts';
import { dispatchGameUiCue } from '../../audio-playback/ui-feedback.ts';
import { createMenuNavigationInput } from '@hyperfocus/engine/ui/core';

/** Controller navigation uses the same visible buttons and checkboxes as pointer input. */
export function createGamepadMenu(options: { canvas: HTMLCanvasElement; mappings?: readonly { action: string; bindings: readonly string[] }[] }) {
  let held = new Set<string>(), consumed = new Set<string>(), practiceNavigation = false, previousMode = '';
  const navigation = createMenuNavigationInput();
  let previousScope: HTMLElement | undefined, scopeKey = '';
  const host = options.canvas.parentElement;
  const keyboard = createControllerKeyboard({ parent: host ?? undefined });
  let returnTarget: HTMLElement | undefined;
  const style = document.createElement('style');
  style.textContent = '[data-pad-focus=true]{outline:3px solid #65d9ff!important;outline-offset:3px!important}';host?.append(style);
  const guide = document.createElement('p');guide.className = 'hf-pad-guide';guide.hidden = true;host?.append(guide);
  function visible(element: HTMLElement) {
    if (element.closest('[hidden], [inert], dialog:not([open])') || element.matches(':disabled')) return false;
    for (let parent: HTMLElement | null = element; parent && parent !== host; parent = parent.parentElement) {
      const style = getComputedStyle(parent);if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    for (let parent = element.parentElement; parent && parent !== host; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement && !parent.open && element !== parent.querySelector(':scope>summary')) return false;
    return getComputedStyle(element).display !== 'none';
  }
  function scope() {
    const selector = host?.querySelector<HTMLElement>('[aria-haspopup="listbox"][aria-expanded="true"]');
    const popup = document.getElementById(selector?.getAttribute('aria-controls') ?? '')?.closest<HTMLElement>('[data-dom-select-popup]');
    if (popup) return popup;
    const replayDialog = [...(host?.querySelectorAll<HTMLElement>('dialog[open]') ?? [])].at(-1);
    if (replayDialog) return replayDialog;
    const onlinePanel = [...(host?.querySelectorAll<HTMLElement>('[data-training-pane], .hf-community-pane, .hf-quick-play, .hf-tutorial[data-expanded=true], .hf-tutorial[data-completion-prompt=true]') ?? [])].find(visible);
    if (onlinePanel) return onlinePanel;
    const details = [...(host?.querySelectorAll<HTMLElement>('.hf-runtime-controls[open], .hf-practice-diagnostics[open], .hf-combat-reference[open], .hf3d-control-disclosure[open], .hf-live-menu[open], .hf-room-pictures[open], .playable-controls details[open]:not(.playable-transcript)') ?? [])].find(visible);
    if (details && visible(details)) return details;
    const replayLive = host?.querySelector<HTMLElement>('.hf-replay-live');
    if (replayLive && visible(replayLive)) return replayLive;
    return [...(host?.querySelectorAll<HTMLElement>('.tod-menu:not([hidden])') ?? [])].find(visible);
  }
  function targets() {
    const panel = scope();
    if (panel) return [...panel.querySelectorAll<HTMLElement>('button, input, textarea, select, summary')].filter(visible);
    return [...(host?.querySelectorAll<HTMLElement>('button, input, textarea, select, summary') ?? [])].filter(visible);
  }
  function focus(target: HTMLElement | undefined, userNavigation = false) {
    for (const element of host?.querySelectorAll<HTMLElement>('[data-pad-focus]') ?? []) delete element.dataset.padFocus;
    if (!target && document.activeElement instanceof HTMLElement && host?.contains(document.activeElement)) document.activeElement.blur();
    if (target) { target.dataset.padFocus = 'true';target.focus({ preventScroll: true });target.scrollIntoView?.({ block: 'nearest' }); }
    if (target && userNavigation) dispatchGameUiCue(target, 'focus');
  }
  function restoreFocus() {
    // Some panels hide their launcher while open. Its proxy must reappear before
    // this poll chooses a fallback; the normal render refreshes availability next.
    if (returnTarget?.hasAttribute('data-menu-proxy') && returnTarget.isConnected) returnTarget.hidden = false;
    focus(returnTarget && visible(returnTarget) ? returnTarget : undefined);
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (event.key === 'Tab' && scope()?.classList.contains('tod-menu')) {
      const available = targets(), index = available.findIndex(target => target === document.activeElement);
      if (available.length && (index < 0 || event.shiftKey && index === 0 || !event.shiftKey && index === available.length - 1)) {
        event.preventDefault();event.stopPropagation();focus(event.shiftKey ? available.at(-1) : available[0]);
      }
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) && (host?.querySelector('.tod-menu:not([hidden])') || scope()?.classList.contains('tod-session'))) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      const available = targets(), current = document.activeElement;
      if (!available.length) return;
      const index = available.findIndex(target => target === current);
      const next = event.key === 'Home' ? available[0] : event.key === 'End' ? available.at(-1) : current instanceof HTMLElement && index >= 0 ? adjacentMenuTarget({ targets: available, current, direction: event.key === 'ArrowDown' ? 'down' : 'up' }) : available[0];
      event.preventDefault();event.stopPropagation();focus(next, true);return;
    }
    if (event.key !== 'Escape') return;
    if (event.repeat) { event.preventDefault();return; }
    const panel = scope(), pageBack = [...((panel ?? host)?.querySelectorAll<HTMLButtonElement>('[data-menu-back]') ?? [])].find(visible);
    if (panel instanceof HTMLDialogElement) { event.preventDefault();event.stopPropagation();if (panel.dispatchEvent(new Event('cancel', { cancelable: true }))) panel.close(); }
    else if (pageBack) { event.preventDefault();event.stopPropagation();pageBack.click(); }
    else if (panel instanceof HTMLDetailsElement) { event.preventDefault();event.stopPropagation();panel.open = false;dispatchGameUiCue(panel, 'back');focus(returnTarget && visible(returnTarget) ? returnTarget : undefined); }
    else if (panel?.dataset.kind === 'pause') { event.preventDefault();event.stopPropagation();panel.querySelector<HTMLButtonElement>('[data-menu-action="pause"]')?.click(); }
  };
  host?.addEventListener('keydown', onKey);
  const onFocus = (event: FocusEvent) => {
    for (const element of host?.querySelectorAll<HTMLElement>('[data-pad-focus]') ?? []) delete element.dataset.padFocus;
    if (host?.dataset.padNavigation === 'true' && event.target instanceof HTMLElement && targets().includes(event.target)) event.target.dataset.padFocus = 'true';
  };
  host?.addEventListener('focusin', onFocus);
  const suspendNavigation = () => navigation.reset({ waitForNeutral: true });
  window.addEventListener('blur', suspendNavigation);
  document.addEventListener('visibilitychange', suspendNavigation);
  return {
    poll(input: { bindings: ReadonlySet<string>; axes?: ArrayLike<number>; mode: 'menu' | 'practice' | 'play'; navigationToggle?: readonly string[]; controller?: boolean; nowMs?: number }) {
      if (input.controller === false) {
        for (const element of host?.querySelectorAll<HTMLElement>('[data-pad-focus]') ?? []) delete element.dataset.padFocus;
        guide.hidden = true;if (host) host.dataset.padNavigation = 'false';
      }
      // With no controller, steady polling cannot navigate or activate a panel.
      // Still route mode changes and disconnects once so focus/consumed edges reset.
      if (input.axes === undefined && !input.bindings.size && !held.size && !navigation.direction && !practiceNavigation
        && input.mode === previousMode && !keyboard.active && guide.hidden) {
        return { bindings: new Set<string>(), axes: undefined, navigating: false };
      }
      const fresh = (button: number) => input.bindings.has(`Gamepad.Button${button}`) && !held.has(`Gamepad.Button${button}`);
      const mappedButtons = (action: string, fallback: string) => options.mappings?.find(mapping => mapping.action === action)?.bindings.filter(binding => binding.startsWith('Gamepad')) ?? [fallback];
      const pauses = mappedButtons('pause', 'Gamepad.Button9');
      const confirms = mappedButtons('match:start', 'Gamepad.Button0').filter(binding => host?.dataset.menuOpen !== 'true' || !pauses.includes(binding));
      if (!confirms.length) confirms.push('Gamepad.Button0');
      const currentScope = scope(), nextScope = `${input.mode}:${currentScope?.dataset.page ?? ''}:${currentScope?.dataset.kind ?? ''}:${keyboard.active}`;
      if (previousScope !== currentScope || scopeKey !== nextScope) { navigation.reset({ waitForNeutral: !!scopeKey });previousScope = currentScope;scopeKey = nextScope; }
      const digital = [12, 13, 14, 15].some(button => input.bindings.has(`Gamepad.Button${button}`)) ? {
        x: Number(input.bindings.has('Gamepad.Button15')) - Number(input.bindings.has('Gamepad.Button14')),
        y: Number(input.bindings.has('Gamepad.Button13')) - Number(input.bindings.has('Gamepad.Button12')),
      } : undefined;
      const move = navigation.sample({ nowMs: input.nowMs ?? performance.now(), x: input.axes?.[0], y: input.axes?.[1], digital });
      const activating = confirms.some(binding => input.bindings.has(binding) && !held.has(binding)) || fresh(confirms.includes('Gamepad.Button1') ? 0 : 1) || pauses.some(binding => input.bindings.has(binding) && !held.has(binding));
      const nextDirection = activating || input.controller === false || document.hidden ? undefined : move;
      if (keyboard.active) {
        if (nextDirection) keyboard.handle(nextDirection);
        if (fresh(confirms.includes('Gamepad.Button1') ? 0 : 1) || pauses.some(binding => input.bindings.has(binding) && !held.has(binding))) keyboard.handle('cancel');
        else if (confirms.some(binding => input.bindings.has(binding) && !held.has(binding))) keyboard.handle('confirm');
        held = new Set(input.bindings);consumed = new Set(input.bindings);
        return { bindings: new Set<string>(), axes: undefined, navigating: true };
      }
      const wardrobe = host?.querySelector<HTMLDialogElement>('.hf-wardrobe dialog[open]');
      if (wardrobe) for (const [button, delta] of [[4, -1], [5, 1]] as const) {
        if (fresh(button)) { wardrobe.dispatchEvent(new CustomEvent('wardrobe-category', { detail: delta }));if (document.activeElement instanceof HTMLElement) focus(document.activeElement); }
        for (const binding of input.bindings) if (binding.endsWith(`.Button${button}`)) consumed.add(binding);
      }
      if (input.axes === undefined && input.bindings.size === 0 && practiceNavigation) { practiceNavigation = false;focus(undefined); }
      if (input.mode !== previousMode) {
        practiceNavigation = false;previousMode = input.mode;
        // A room can open as the host leaves Pause. Preserve the destination's
        // native focus, including its explicit return to the arena.
        const active = document.activeElement;
        if (input.controller !== false && active !== options.canvas && !(active instanceof HTMLElement && scope()?.contains(active) && visible(active))) focus(undefined);
      }
      if (host?.dataset.menuOpen === 'true' && pauses.some(binding => input.bindings.has(binding) && !held.has(binding))) {
        const panel = scope();
        if (panel instanceof HTMLDetailsElement) panel.open = false;
        else if (panel instanceof HTMLDialogElement && panel.dispatchEvent(new Event('cancel', { cancelable: true }))) panel.close();
        focus(undefined);
      }
      const toggles = input.navigationToggle ?? ['Gamepad.Button17'];
      if (input.mode === 'practice' && toggles.some(binding => input.bindings.has(binding) && !held.has(binding))) {
        if (host?.classList.contains('hf-fight-stage') && !input.navigationToggle) host.querySelector<HTMLButtonElement>('.playable-controls>button')?.click();
        else practiceNavigation = !practiceNavigation;
        for (const binding of input.bindings) if (toggles.some(toggle => toggle.split('.').at(-1) === binding.split('.').at(-1))) consumed.add(binding);
        if (!practiceNavigation) focus(undefined);
      }
      const backButton = confirms.includes('Gamepad.Button1') ? 0 : 1;
      if ((input.mode === 'menu' || practiceNavigation || scope()) && fresh(backButton)) {
        for (const binding of input.bindings) if (binding.endsWith(`.Button${backButton}`)) consumed.add(binding);
        const panel = scope();
        const pageBack = [...((panel ?? host)?.querySelectorAll<HTMLButtonElement>('[data-menu-back]') ?? [])].find(visible);
        if (panel?.hasAttribute('data-dom-select-popup')) panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        else if (pageBack) pageBack.click();
        else if (panel instanceof HTMLDialogElement) { if (panel.dispatchEvent(new Event('cancel', { cancelable: true }))) { panel.close();dispatchGameUiCue(panel, 'back'); }restoreFocus(); }
        else if (panel instanceof HTMLDetailsElement) { panel.open = false;dispatchGameUiCue(panel, 'back');focus(returnTarget && visible(returnTarget) ? returnTarget : panel.querySelector<HTMLElement>('summary') ?? undefined); }
        else if (panel?.querySelector<HTMLButtonElement>('[data-training-close],[data-community-close]')) { panel.querySelector<HTMLButtonElement>('[data-training-close],[data-community-close]')!.click();focus(returnTarget); }
        else if (practiceNavigation) { practiceNavigation = false;if (host) dispatchGameUiCue(host, 'back');focus(undefined); }
        else if (panel?.dataset.kind === 'pause') panel.querySelector<HTMLButtonElement>('[data-menu-action="pause"]')?.click();
        else host?.querySelector<HTMLButtonElement>('[data-gameplay-action="pause"]')?.click();
      }
      const panelOwnsInput = host?.classList.contains('hf-fight-stage') && !!scope() && !scope()?.classList.contains('hf-replay-live');
      const ownsInput = (input.axes !== undefined || input.bindings.size > 0) && (input.mode === 'menu' || input.mode === 'practice' && practiceNavigation || panelOwnsInput === true);
      const navigating = input.controller !== false && ownsInput;
      if (host && host.dataset.padNavigation !== String(navigating)) host.dataset.padNavigation = String(navigating);
      guide.hidden = !navigating;const help = `D-pad: move · ${combatBindingLabel(confirms[0] ?? 'Gamepad.Button0')}: select · ${combatBindingLabel(`Gamepad.Button${backButton}`)}: back`;
      if (guide.textContent !== help) guide.textContent = help;
      const horizontal = nextDirection === 'right' ? 1 : nextDirection === 'left' ? -1 : 0;
      if (navigating) {
        const available = targets();let index = available.findIndex(target => target === document.activeElement);
        if (index < 0) { index = Math.max(0, available.findIndex(target => target.hasAttribute('data-menu-action')));focus(available[index]); }
        else if (available[index]?.dataset.padFocus !== 'true') focus(available[index]);
        const target = available[index];
        const adjusting = horizontal && (target instanceof HTMLSelectElement || target instanceof HTMLInputElement && ['range', 'number'].includes(target.type));
        const changeSelect = (select: HTMLSelectElement, step: number) => { for (let count = 0; count < select.options.length; count++) { select.selectedIndex = (select.selectedIndex + step + select.options.length) % select.options.length;if (!select.options[select.selectedIndex]?.disabled) break; }select.dispatchEvent(new Event('change', { bubbles: true })); };
        if (adjusting) {
          if (target instanceof HTMLSelectElement) changeSelect(target, horizontal);
          else if (target instanceof HTMLInputElement) { const previous = target.value;target.value = String(Math.max(target.min === '' ? -Infinity : Number(target.min), Math.min(target.max === '' ? Infinity : Number(target.max), Number(target.value) + horizontal * Number(target.step || 1))));if (target.value === previous) dispatchGameUiCue(target, 'denied');else { target.dispatchEvent(new Event('input', { bubbles: true }));target.dispatchEvent(new Event('change', { bubbles: true })); } }
        } else if (nextDirection && target) { const next = adjacentMenuTarget({ targets: available, current: target, direction: nextDirection });index = next ? available.indexOf(next) : index;focus(available[index], next !== target); }
        if (confirms.some(binding => input.bindings.has(binding) && !held.has(binding) && !consumed.has(binding))) {
          for (const binding of input.bindings) if (confirms.some(confirm => confirm.split('.').at(-1) === binding.split('.').at(-1))) consumed.add(binding);
          const target = available[index];
          if (target instanceof HTMLSelectElement) changeSelect(target, 1);
          else if ((target instanceof HTMLInputElement && ['text', 'search', 'email', 'url', 'password', 'tel'].includes(target.type) || target instanceof HTMLTextAreaElement) && !target.readOnly) keyboard.open(target);
          else { const prior = scope();if (!prior) returnTarget = target;target?.click();if (prior?.classList.contains('tod-menu') && scope() !== prior) returnTarget = target; }
        }
      }
      held = new Set(input.bindings);
      consumed = new Set([...consumed].filter(binding => input.bindings.has(binding)));
      if (ownsInput) for (const binding of input.bindings) if (!pauses.includes(binding)) consumed.add(binding);
      // Options remains pause/resume. Cross cannot leak into a jump or Start action.
      return { bindings: new Set([...input.bindings].filter(binding => !consumed.has(binding))), axes: ownsInput ? undefined : input.axes, navigating: ownsInput };
    },
    dispose() { keyboard.dispose();host?.removeEventListener('keydown', onKey);host?.removeEventListener('focusin', onFocus);window.removeEventListener('blur', suspendNavigation);document.removeEventListener('visibilitychange', suspendNavigation);focus(undefined);if (host) delete host.dataset.padNavigation;guide.remove();style.remove(); },
  };
}
