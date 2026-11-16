import { createGameActionList, type GameMenuAction } from '@hyperfocus/ui/game-menu';
import { gameMenuStyles } from './theme';

export function createGameMenuShell(options: { parent: HTMLElement; audience?: GameMenuAction['audience']; back(): void }) {
  const element = document.createElement('section');element.className = 'tod-menu';element.dataset.candidate = 'rail';element.setAttribute('aria-label', 'Touch of Death menu');
  const style = document.createElement('style');style.textContent = gameMenuStyles;
  const identity = document.createElement('header');identity.className = 'tod-identity';
  identity.innerHTML = '<h1><span>Touch of</span>Death</h1><p>One opening. Everything changes.</p>';
  const content = document.createElement('div');content.className = 'tod-menu-content';
  const heading = document.createElement('header');heading.className = 'tod-page-heading';
  const back = document.createElement('button');back.type = 'button';back.className = 'tod-back';back.textContent = 'Back';back.dataset.menuBack = '';back.onclick = options.back;
  const title = document.createElement('h2'), description = document.createElement('p');heading.append(back, title, description);
  const body = document.createElement('div');body.className = 'tod-menu-body';
  const actions = createGameActionList({ audience: options.audience ?? 'player' });
  const help = document.createElement('footer');help.className = 'tod-menu-help';help.textContent = '↑ ↓ Move   /   Enter Select   /   Esc Back';
  content.append(heading, body, actions.element);element.append(style, identity, content, help);options.parent.append(element);
  return { element, body, actions, identity,
    render(input: { page: string; title: string; description?: string; root?: boolean; actions: readonly GameMenuAction[] }) {
      element.dataset.page = input.page;back.hidden = !!input.root;title.textContent = input.title;description.textContent = input.description ?? '';description.hidden = !input.description;
      actions.render(input.actions);
    },
    dispose() { element.remove(); },
  };
}
