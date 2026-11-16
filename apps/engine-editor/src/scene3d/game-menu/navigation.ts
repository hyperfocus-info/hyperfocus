import type { GameplayPresentation3D } from '@hyperfocus/engine/project/runtime-3d';
import type { GameMenuAction } from '@hyperfocus/ui/game-menu';
import { createGameMenuShell } from './shell';

type Page = 'root' | 'play' | 'local' | 'online' | 'practice' | 'watch' | 'settings';
const parents: Record<Page, Page> = { root: 'root', play: 'root', local: 'play', online: 'play', practice: 'root', watch: 'play', settings: 'root' };
const titles: Record<Page, string> = { root: 'Main menu', play: 'Play', local: 'Fight the AI', online: 'Online', practice: 'Practice', watch: 'Watch fights', settings: 'Settings' };
const sourceSelectors = ['[data-network-open]', '[data-network-quick]', '[data-replay-open]', '[data-situations-open]', '[data-wardrobe-open]', '[data-rewards-open]', '.hf-runtime-controls>summary', '.playable-controls>details:not(.playable-transcript)>summary'];

/** Player intent owns navigation. Source controls retain their existing command/lifecycle. */
export function createTitleNavigation(options: { host: HTMLElement; root: HTMLElement; command(action: string): void }) {
  let page: Page = 'root', active = false, presentation: GameplayPresentation3D | undefined;
  const sources = new Map<HTMLElement, { owner: HTMLElement; restore(): void }>();
  let sourceReturn: string | undefined;
  const shell = createGameMenuShell({ parent: options.root, back() { page = parents[page];render();shell.actions.focus(); } });
  shell.element.hidden = true;
  function go(next: Page) { page = next;render();shell.actions.focus(); }
  const action = (id: string, label: string, run: () => void, priority: GameMenuAction['priority'] = 'secondary', explanation?: string): GameMenuAction => ({ id, label, run, priority, explanation, audience: 'player' });
  const route = (next: Page, label: string, priority: GameMenuAction['priority'] = 'secondary', explanation?: string) => action(next, label, () => go(next), priority, explanation);
  function command(id: string, label: string, priority: GameMenuAction['priority'] = 'secondary', explanation?: string) {
    const item = presentation?.actions?.find(item => item.action === id);
    return { ...action(id, label, () => options.command(id), priority, explanation), disabled: !item || item.disabled, explanation: !item || item.disabled ? 'Unavailable in this session.' : explanation };
  }
  function launch(id: string, label: string, selector: string, priority: GameMenuAction['priority'] = 'secondary', explanation?: string): GameMenuAction {
    const source = options.host.querySelector<HTMLElement>(selector);
    const disabled = !source || source.matches(':disabled') || !!source.closest('[hidden]') || source.dataset.menuUnavailable === 'true';
    return { ...action(id, label, () => {
      if (!source) return;sourceReturn = id;source.click();
      if (source.parentElement instanceof HTMLDetailsElement && !source.parentElement.querySelector('dialog[open]')) source.focus({ preventScroll: true });
    }, priority, explanation), disabled, explanation: disabled ? source?.dataset.menuUnavailableReason ?? 'Unavailable in this session.' : explanation };
  }
  function choices(): GameMenuAction[] {
    switch (page) {
      case 'root': return [route('play', 'Play', 'primary', 'Choose your fight'), route('practice', 'Practice'), launch('fighter', 'Your fighter', '[data-wardrobe-open]'), launch('rewards', 'Rewards', '[data-rewards-open]'), route('settings', 'Settings', 'utility')];
      case 'play': return [route('local', 'Fight the AI', 'primary', 'Play on this device'), launch('friends', 'Invite a friend', '[data-network-open]', 'secondary', 'Create a private set or use an invitation'), route('online', 'Online', 'secondary', 'Quick Play and room modes'), route('watch', 'Watch fights', 'utility')];
      case 'local': return [command('match:start', 'Start match', 'primary', `AI level ${difficulty.value} of 9`), command('match:quick', 'Random opponent', 'secondary', 'AI levels 3–9')];
      case 'online': return [launch('quick-play', 'Quick Play', '[data-network-quick]', 'primary', 'Find an opponent'), launch('friends', 'Play with friends', '[data-network-open]', 'secondary', 'Private sets, winner stays, or shared training')];
      case 'practice': return [command('match:practice', 'Free practice', 'primary', 'Explore movement, attacks, and defense'), launch('situations', 'Saved situations', '[data-situations-open]'), command('guide:start', 'Guided first fight'), command('match:first', 'Try an easy opponent', 'secondary', 'Start a set against AI level 1')];
      case 'watch': return [launch('replay', 'Watch a replay', '[data-replay-open]', 'primary'), command('match:theater', 'Watch expert AI', 'secondary', 'AI level 9 versus AI level 9')];
      case 'settings': return [launch('controls', 'Game settings', '.hf-runtime-controls>summary', 'primary')];
    }
  }
  const label = document.createElement('label'), text = document.createElement('span'), value = document.createElement('output'), difficulty = document.createElement('input');
  text.textContent = 'AI difficulty';difficulty.type = 'range';difficulty.min = '1';difficulty.max = '9';difficulty.step = '1';difficulty.setAttribute('aria-label', 'AI difficulty');label.append(text, value, difficulty);
  difficulty.oninput = () => { value.value = `${difficulty.value} / 9`;options.command(`match:difficulty:${difficulty.value}`);render(); };
  function dockSources() {
    for (const selector of sourceSelectors) {
      const source = options.host.querySelector<HTMLElement>(selector);if (!source || sources.has(source)) continue;
      const owner = source.tagName === 'SUMMARY' ? source.parentElement! : source;
      const prior = owner.dataset.menuDocked;
      const restoreFocus = () => { if (source.tagName !== 'SUMMARY' && active) shell.actions.focus(sourceReturn); };
      const dialog = source.parentElement?.querySelector('dialog');
      // Some legacy launchers remain hidden until their panel's close handler finishes.
      const restoreModalFocus = () => { if (active) { render();shell.actions.focus(sourceReturn); } };
      const restoreDisclosureFocus = () => { if(owner instanceof HTMLDetailsElement && !owner.open)restoreModalFocus(); };
      dialog?.addEventListener('close', restoreModalFocus);
      owner.addEventListener('toggle',restoreDisclosureFocus);
      source.addEventListener('focus', restoreFocus);sources.set(source, { owner, restore() { source.removeEventListener('focus', restoreFocus);dialog?.removeEventListener('close',restoreModalFocus);owner.removeEventListener('toggle',restoreDisclosureFocus);if (prior === undefined) delete owner.dataset.menuDocked;else owner.dataset.menuDocked = prior; } });
      owner.dataset.menuDocked = 'true';
    }
  }
  function render() {
    dockSources();
    const range = presentation?.actions?.find(item => item.action === 'match:difficulty')?.range;
    if (range && document.activeElement !== difficulty) difficulty.value = String(range.value);
    value.value = `${difficulty.value} / 9`;
    if (page === 'local') { if (!label.isConnected) shell.body.append(label); } else label.remove();
    shell.render({ page, title: titles[page], root: page === 'root', actions: choices() });
  }
  return {
    render(input: GameplayPresentation3D) {
      presentation = input;
      const next = options.host.classList.contains('hf-fight-stage') && input.layout === 'menu' && !!input.actions?.some(item => item.action === 'match:start');
      const entered = next && !active;
      if (next !== active) {
        active = next;page = 'root';shell.element.hidden = !active;options.root.dataset.gameMenu = String(active);
        if (!active) { for (const source of sources.values()) source.restore();sources.clear(); }
      }
      if (active) { render();if (entered) shell.actions.focus(); }return active;
    },
    dispose() { for (const source of sources.values()) source.restore();shell.dispose();delete options.root.dataset.gameMenu; },
  };
}
