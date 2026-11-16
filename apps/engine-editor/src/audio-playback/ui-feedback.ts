export type GameUiCue = 'focus' | 'confirm' | 'back' | 'adjust' | 'denied';
const eventName = 'hf-ui-feedback';

/** Controller actions that do not click a control use the same host listener. */
export function dispatchGameUiCue(target: HTMLElement, cue: GameUiCue) {
  target.dispatchEvent(new CustomEvent(eventName, { bubbles: true, detail: cue }));
}

/** One host-owned listener set remains active when gameplay is paused. */
export function createUiAudioFeedback(options: { parent: HTMLElement; play: (cue: GameUiCue) => void }) {
  const values = new WeakMap<HTMLElement, string>();
  const clicks = new WeakMap<Event, GameUiCue>();
  let navigation = false, hovered: HTMLElement | undefined, lastFocus: HTMLElement | undefined, lastFocusTime = -Infinity;
  const control = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('button, input, textarea, select, summary, [role="button"]') ?? undefined : undefined;
  const available = (target: HTMLElement) => !target.closest('[hidden], [inert], dialog:not([open])') && !target.matches(':disabled') && !target.closest('[aria-disabled="true"]');
  const forwarded = (target: HTMLElement) => target.hasAttribute('data-menu-docked') || target.tagName === 'SUMMARY' && target.parentElement?.hasAttribute('data-menu-docked') === true;
  const focus = (target: HTMLElement) => {
    if (!available(target) || forwarded(target) || lastFocus === target) return;
    lastFocus = target;
    const now = performance.now();if (now - lastFocusTime < 60) return;
    lastFocusTime = now;options.play('focus');
  };
  const current = (target: HTMLElement) => target instanceof HTMLInputElement ? target.type === 'checkbox' ? String(target.checked) : target.value : target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement ? target.value : '';
  const onKey = (event: KeyboardEvent) => {
    if (['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { navigation = true;queueMicrotask(() => { navigation = false; }); }
  };
  const onFocus = (event: FocusEvent) => { const target = control(event.target);if (!target) return;values.set(target, current(target));if (navigation) focus(target); };
  const onPointer = (event: PointerEvent) => { const target = control(event.target);if (!target || target === hovered) return;hovered = target;focus(target); };
  const onDown = (event: PointerEvent) => { const target = control(event.target);if (target) values.set(target, current(target)); };
  const prepareClick = (event: MouseEvent) => {
    const target = control(event.target);if (!target || forwarded(target)) return;
    if (!available(target)) { clicks.set(event, 'denied');return; }
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
    const back = target.hasAttribute('data-menu-back') || /^(back|cancel|close|return)(\b|$)/i.test(target.getAttribute('aria-label') ?? target.textContent?.trim() ?? '') || target.tagName === 'SUMMARY' && target.parentElement instanceof HTMLDetailsElement && target.parentElement.open;
    clicks.set(event, back ? 'back' : 'confirm');
  };
  const onClick = (event: MouseEvent) => { const cue = clicks.get(event);if (cue && !event.defaultPrevented) options.play(cue); };
  const onChange = (event: Event) => {
    const target = control(event.target);if (!target || !available(target) || forwarded(target)) return;
    const value = current(target), previous = values.get(target);values.set(target, value);
    if (previous !== value) options.play('adjust');
  };
  const onCue = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const cue: unknown = event.detail;
    if (cue === 'focus') { const target = control(event.target);if (target) focus(target); }
    else if (cue === 'confirm' || cue === 'back' || cue === 'adjust' || cue === 'denied') options.play(cue);
  };
  const host = options.parent;
  host.addEventListener('keydown', onKey, true);host.addEventListener('focusin', onFocus);
  host.addEventListener('pointermove', onPointer);host.addEventListener('pointerdown', onDown);
  host.addEventListener('click', prepareClick, true);host.addEventListener('click', onClick);host.addEventListener('input', onChange);host.addEventListener('change', onChange);host.addEventListener(eventName, onCue);
  return { dispose() {
    host.removeEventListener('keydown', onKey, true);host.removeEventListener('focusin', onFocus);
    host.removeEventListener('pointermove', onPointer);host.removeEventListener('pointerdown', onDown);
    host.removeEventListener('click', prepareClick, true);host.removeEventListener('click', onClick);host.removeEventListener('input', onChange);host.removeEventListener('change', onChange);host.removeEventListener(eventName, onCue);
  } };
}
