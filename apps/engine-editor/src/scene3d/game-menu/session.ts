import { validateGameActions } from '@hyperfocus/ui/game-menu';
import { gameSessionStyles } from './session-theme';

type SessionAction = { button: HTMLButtonElement; priority: 'primary' | 'secondary' | 'utility'; explanation?: string; destructive?: boolean };

/** Online phase composition. Native controls and command ownership stay with each session. */
export function attachGameSession(options: {
  element: HTMLElement; title: HTMLElement; status: HTMLElement; context?: HTMLElement[];
  body?: HTMLElement; tools?: HTMLElement[]; back?: () => void;
}) {
  const { element, title, status } = options;
  element.classList.add('tod-session');element.tabIndex = -1;
  const identity = document.createElement('header');identity.className = 'tod-session-identity';
  const eyebrow = document.createElement('p');eyebrow.className = 'tod-session-eyebrow';eyebrow.textContent = 'Touch of Death / Online';
  title.classList.add('tod-session-title');status.classList.add('tod-session-status');
  status.setAttribute('role', 'status');status.setAttribute('aria-live', 'polite');status.setAttribute('aria-atomic', 'true');
  identity.append(eyebrow, title, status, ...(options.context ?? []));
  const actions = document.createElement('nav');actions.className = 'tod-session-actions';actions.setAttribute('aria-label', 'Session actions');
  const tools = document.createElement('div');tools.className = 'tod-session-tools';tools.append(...(options.tools ?? []));
  const layout = document.createElement('div');layout.className = 'tod-session-layout';layout.append(identity, actions);
  if (options.body) { options.body.classList.add('tod-session-body');layout.append(options.body); }
  layout.append(tools);element.append(layout);
  const style = document.createElement('style');style.textContent = gameSessionStyles;element.append(style);
  let current: SessionAction[] = [], focused: HTMLElement | undefined;
  function available() {
    return [...element.querySelectorAll<HTMLElement>('button,input,select,textarea,summary')].filter(node => {
      if (node.matches(':disabled,[tabindex="-1"]') || node.closest('[hidden],[inert]')) return false;
      for (let parent: HTMLElement | null = node; parent && parent !== element; parent = parent.parentElement) {
        if (getComputedStyle(parent).display === 'none') return false;
        if (parent instanceof HTMLDetailsElement && !parent.open && !parent.querySelector(':scope>summary')?.contains(node)) return false;
      }
      return true;
    });
  }
  const focus = (preferred?: HTMLElement) => {
    const target = preferred ?? current.find(action => !action.button.disabled)?.button ?? available()[0] ?? element;
    target.focus({ preventScroll: true });target.scrollIntoView?.({ block: 'nearest' });
  };
  const key = (event: KeyboardEvent) => {
    if (event.repeat && ['Enter', ' '].includes(event.key) && event.target instanceof HTMLButtonElement) event.preventDefault();
    if (event.key === 'Escape') { event.preventDefault();event.stopPropagation();options.back?.(); }
    if (event.key === 'Tab') {
      const targets = available(), first = targets[0], last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault();last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault();first?.focus(); }
    }
  };
  const rememberFocus = (event: FocusEvent) => { if (event.target instanceof HTMLElement) focused = event.target; };
  element.addEventListener('focusin', rememberFocus);
  element.addEventListener('keydown', key);
  return {
    tools, actions, focus,
    setStatus(value: string) { if (status.textContent !== value) status.textContent = value; },
    render(state: { waiting: boolean; actions: SessionAction[] }) {
      const entries = state.actions.filter(action => !action.button.hidden);
      if (new Set(state.actions.map(action => action.button)).size !== state.actions.length) throw Error('Session actions must use distinct controls.');
      validateGameActions(entries.map((action, index) => ({ id: String(index), label: action.button.textContent ?? '', priority: action.priority,
        audience: 'player', disabled: action.button.disabled, explanation: action.explanation, run() {} })), 'player', !state.waiting);
      if (state.waiting && !status.textContent?.trim()) throw Error('A waiting session must explain its state.');
      element.dataset.sessionWaiting = String(state.waiting);
      const active = document.activeElement;
      // Browsers may blur a focused button immediately when its owner disables it.
      const previous = active === document.body ? focused : active;
      const lostFocus = previous instanceof HTMLButtonElement && actions.contains(previous) && !entries.some(action => action.button === previous && !previous.disabled);
      current = entries;
      for (const action of state.actions) {
        action.button.dataset.priority = action.priority;action.button.dataset.audience = 'player';action.button.dataset.destructive = String(!!action.destructive);
        if (action.explanation) action.button.title = action.explanation;else action.button.removeAttribute('title');
      }
      // Move only on phase changes. Tick renders must preserve focus and input drafts.
      const nodes = state.actions.map(action => action.button);
      if (nodes.some((node, index) => actions.children[index] !== node) || actions.children.length !== nodes.length) {
        const restore = active instanceof HTMLElement && actions.contains(active) && !lostFocus ? active : undefined;
        actions.replaceChildren(...nodes);restore?.focus({ preventScroll: true });
      }
      if (lostFocus && !element.hidden) focus();
    },
    dispose() { element.removeEventListener('keydown', key);element.removeEventListener('focusin', rememberFocus);style.remove(); },
  };
}
