import { createGameActionList } from '@hyperfocus/ui/game-menu';
import { attachGameModal } from '@hyperfocus/ui/game-menu';
import { gameMenuStyles } from './theme';

const tools = [
  ['insights', 'AI insights', '[data-ai-insights-open]'],
  ['export', 'Export AI observations', '[data-ai-report-open]'],
  ['training', 'AI training', '[data-bulk-training-open]'],
  ['clear', 'Clear saved AI history', '[data-ai-history-clear]'],
] as const;

/** Explicit opt-in surface, not an authorization/security boundary. Never entered through player settings. */
export function createGameDeveloperTools(options: { host: HTMLElement; enabled: boolean }) {
  if (!options.enabled) return { dispose() {} };
  const root = document.createElement('aside');root.className = 'tod-developer';root.dataset.audience = 'developer';
  const launcher = document.createElement('button');launcher.type = 'button';launcher.textContent = 'Developer tools';launcher.dataset.developerOpen = '';
  const dialog = document.createElement('dialog');dialog.setAttribute('aria-label', 'Developer tools');
  const title = document.createElement('h2');title.textContent = 'Developer tools';
  const info = document.createElement('p');info.textContent = 'AI observation, analysis, and training on this device. These tools are separate from player progression.';
  const actions = createGameActionList({ audience: 'developer', primaryRequired: false });
  const back = document.createElement('button');back.className = 'tod-back';back.type = 'button';back.textContent = 'Back';
  dialog.append(title, info, actions.element, back);
  const style = document.createElement('style');style.textContent = gameMenuStyles + '.tod-developer>[data-developer-open]{position:absolute;top:1rem;right:1rem;z-index:50;min-height:44px;background:#101612;color:#eee9dc;border:1px dashed #e7aa63;padding:.5rem 1rem}.tod-developer .hf-game-modal{width:min(42rem,calc(100vw - 2rem))}';
  root.append(style, launcher, dialog);options.host.append(root);
  const modal = attachGameModal({ dialog });back.onclick = modal.close;
  launcher.onclick = () => {
    actions.render(tools.map(([id, label, selector]) => {
      const source = options.host.querySelector<HTMLButtonElement>(selector);
      return { id, label, priority: 'secondary', audience: 'developer', destructive: id === 'clear', disabled: !source, explanation: !source ? 'Unavailable in this build.' : undefined,
        run() { source?.click();if (source) { const button = actions.element.querySelector<HTMLElement>(`[data-menu-action="${id}"] .hf-game-action-label`);if (button) button.textContent = source.textContent; } } };
    }));
    modal.open();
  };
  return { dispose() { modal.dispose();root.remove(); } };
}
