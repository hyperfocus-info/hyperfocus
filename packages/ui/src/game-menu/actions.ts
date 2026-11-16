/** Small presentation contract: hosts retain commands, persistence and availability. */
export type GameMenuAction = {
  id: string;
  label: string;
  priority: 'primary' | 'secondary' | 'utility';
  audience: 'player' | 'developer';
  explanation?: string;
  disabled?: boolean;
  destructive?: boolean;
  current?: boolean;
  run(): void;
};

export function validateGameActions(actions: readonly GameMenuAction[], audience: GameMenuAction['audience'], primaryRequired = true) {
  if (actions.length > 6) throw Error('A game menu supports at most six actions. Group additional destinations on another page.');
  if (new Set(actions.map(action => action.id)).size !== actions.length) throw Error('Menu action IDs must be unique.');
  if (actions.some(action => action.audience !== audience)) throw Error('Menu actions must match the surface audience.');
  const primary = actions.filter(action => action.priority === 'primary');
  if (primary.length > 1 || primaryRequired && primary.length !== 1) throw Error('Declare one primary menu action.');
  if (primary.length && actions[0] !== primary[0]) throw Error('The primary action must be first.');
  if (actions.some(action => !action.id.trim() || !action.label.trim() || action.disabled && !action.explanation?.trim())) throw Error('Actions need an ID and label; unavailable actions need a reason.');
}

/** Stable nodes preserve controller focus when availability changes on a render tick. */
export function createGameActionList(options: { audience: GameMenuAction['audience']; primaryRequired?: boolean }) {
  const element = document.createElement('nav');element.className = 'hf-game-actions';element.setAttribute('aria-label', 'Menu actions');
  let signature = '';
  const handlers = new Map<string, GameMenuAction>();
  return {
    element,
    render(actions: readonly GameMenuAction[]) {
      validateGameActions(actions, options.audience, options.primaryRequired ?? true);
      handlers.clear();for (const action of actions) handlers.set(action.id, action);
      const next = JSON.stringify(actions.map(({ run, ...action }) => action));
      if (next === signature) return;signature = next;
      const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.menuAction : undefined;
      const previous = new Map([...element.querySelectorAll<HTMLButtonElement>('button')].map(button => [button.dataset.menuAction, button]));
      element.replaceChildren(...actions.map(action => {
        const button = previous.get(action.id) ?? document.createElement('button');
        button.type = 'button';button.className = 'hf-game-action';button.dataset.menuAction = action.id;button.dataset.priority = action.priority;button.dataset.audience = action.audience;
        button.dataset.destructive = String(!!action.destructive);button.disabled = !!action.disabled;
        if (action.current) button.setAttribute('aria-current', 'true');else button.removeAttribute('aria-current');
        button.setAttribute('aria-label', action.label);
        const label = document.createElement('span');label.className = 'hf-game-action-label';label.textContent = action.label;
        const detail = document.createElement('span');detail.className = 'hf-game-action-detail';detail.textContent = action.explanation ?? '';detail.hidden = !action.explanation;
        button.replaceChildren(label, detail);button.onclick = () => { const current = handlers.get(action.id);if (current && !current.disabled) current.run(); };
        button.onkeydown = event => { if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault(); };
        return button;
      }));
      if (focused) {
        const available = [...element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        (available.find(button => button.dataset.menuAction === focused) ?? available[0] ?? element.parentElement?.querySelector<HTMLElement>('[data-menu-back]'))?.focus({ preventScroll: true });
      }
    },
    focus(id?: string) { const targets = [...element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];(targets.find(button => button.dataset.menuAction === id) ?? targets[0])?.focus({ preventScroll: true }); },
  };
}
