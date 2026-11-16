import type { GameplayPresentation3D } from '@hyperfocus/engine/project/runtime-3d';
import { practiceMenuCategories } from '../fight-hud/practice/practice-pages';
import { createGameMenuShell } from './shell';
import type { GameMenuAction } from '@hyperfocus/ui/game-menu';
import { practicePreset } from '../fight-hud/practice/practice-catalog';

/** Pause, onboarding and results share hierarchy, but only expose actions relevant to their state. */
export function createContextMenu(options: { host: HTMLElement; root: HTMLElement; command(action: string): void }) {
  let presentation: GameplayPresentation3D | undefined, active = false, page = '', previousKind = '', practiceRequested = false;
  const modalReturns = new Map<HTMLDialogElement, () => void>();
  const disclosureReturns = new Map<HTMLDetailsElement, () => void>();
  const shell = createGameMenuShell({ parent: options.root, back() { page = practiceMenuCategories.some(category => category.id === page) ? 'practice-setup' : page === 'online' ? 'options' : '';render();shell.actions.focus(); } });
  shell.element.hidden = true;shell.element.dataset.context = 'true';
  const resultStatus = document.createElement('p');resultStatus.dataset.resultRewards = '';resultStatus.setAttribute('role', 'status');resultStatus.style.whiteSpace = 'pre-line';resultStatus.hidden = true;shell.body.append(resultStatus);
  function invoke(id: string, label: string, run: () => void, priority: GameMenuAction['priority'] = 'secondary', explanation?: string): GameMenuAction { return { id, label, priority, audience: 'player', run, explanation }; }
  function launch(id: string, label: string, selector: string) {
    return invoke(id, label, () => {
      const source = options.host.querySelector<HTMLElement>(selector), dialog = source?.parentElement?.querySelector('dialog');
      if(dialog){const prior=modalReturns.get(dialog);if(prior)dialog.removeEventListener('close',prior);const restore=()=>{modalReturns.delete(dialog);if(active){render();shell.actions.focus(id);}};modalReturns.set(dialog,restore);dialog.addEventListener('close',restore,{once:true});}
      const details=source?.parentElement;
      if(details instanceof HTMLDetailsElement){const prior=disclosureReturns.get(details);if(prior)details.removeEventListener('toggle',prior);const restore=()=>{if(details.open)return;details.removeEventListener('toggle',restore);disclosureReturns.delete(details);if(active){render();shell.actions.focus(id);}};disclosureReturns.set(details,restore);details.addEventListener('toggle',restore);}
      source?.click();
      if (source?.parentElement instanceof HTMLDetailsElement && !source.parentElement.querySelector('dialog[open]')) {
        const first = source.parentElement.matches('.hf-combat-reference') ? source.parentElement.querySelector<HTMLElement>('button:not(:disabled)') : undefined;
        (first ?? source).focus();
      }
    });
  }
  function supportEntries(online: boolean) {
    const entries = online ? [
      ['training', 'Shared training', '[data-training-open]'], ['community', 'Winner stays', '[data-community-open]'],
      ['session', 'Online fight tools', '.hf-live-menu>summary'], ['pictures', 'Room pictures', '.hf-room-pictures>summary'], ['mute', 'Mute voice', '[data-voice-quick-mute]'],
    ] : [['tutorial', 'Tutorial controls', '[data-tutorial-open]'], ['fighter', 'Your fighter', '[data-wardrobe-open]'], ['rewards', 'Rewards', '[data-rewards-open]'], ['replay', 'Watch a replay', '[data-replay-open]']];
    return entries.filter(([, , selector]) => { const source = options.host.querySelector(selector!);return source && !source.closest('[hidden]'); }).map(([id, label, selector]) => launch(id!, label!, selector!));
  }
  function commands(items: NonNullable<GameplayPresentation3D['actions']>) {
    const primary = items.find(item => ['pause', 'match:replay', 'match:rematch', 'guide:next', 'guide:finish'].includes(item.action)) ?? items[0];
    return items.map(item => {
      const preset = item.action.startsWith('practice:') ? practicePreset(item.action.slice(9)) : undefined;
      return { ...invoke(item.action, preset?.label ?? item.label, () => options.command(item.action), item === primary ? 'primary' : item.action === 'match:quit' || item.action === 'match:menu' ? 'utility' : 'secondary'), disabled: item.disabled, current: item.disabled && item.action.startsWith('practice:'), explanation: item.disabled ? item.action.startsWith('practice:') ? `Current setup. ${preset?.purpose ?? ''}` : 'Waiting for your opponent.' : preset?.purpose };
    });
  }
  function render() {
    if (!presentation) return;
    resultStatus.hidden = !!page || presentation.layout !== 'result' || !resultStatus.textContent;
    const title = presentation.overlay?.title ?? presentation.title;
    shell.identity.querySelector('h1')!.textContent = title;
    const summary = shell.identity.querySelector('p')!;summary.textContent = presentation.overlay?.body ?? '';summary.hidden = !summary.textContent;
    const authored = (presentation.actions ?? []).filter(item => item.action !== 'guide:start');
    const practice = authored.filter(item => item.action.startsWith('practice:'));
    const review = presentation.layout === 'result' ? authored.filter(item => item.action.startsWith('review:') || item.action === 'match:learn-defense') : [];
    const retry = review.find(item => item.action === 'review:practice') ?? review.find(item => item.action === 'match:learn-defense');
    let actions: GameMenuAction[];
    if (page === 'options' || page === 'online') {
      actions = supportEntries(page === 'online');
      if (page === 'options' && supportEntries(true).length) actions.push(invoke('online', 'Online tools', () => { page = 'online';render();shell.actions.focus(); }));
      if (actions[0]) actions[0].priority = 'primary';
    } else if (page === 'review') {
      actions = commands(review);
    } else if (page === 'practice-setup') {
      actions = practiceMenuCategories.map((category, index) => invoke(category.id, category.label, () => { page = category.id;render();shell.actions.focus(); }, index === 0 ? 'primary' : 'secondary', category.purpose));
      const grouped = new Set(practiceMenuCategories.flatMap(category => category.actions.map(id => `practice:${id}`)));
      actions.push(...commands(practice.filter(item => !grouped.has(item.action))).map(item => ({ ...item, priority: 'secondary' as const })));
      if (options.host.querySelector('[data-practice-open]:not([hidden])')) actions.push(launch('practice-tools', 'Practice readouts', '[data-practice-open]'));
      if (options.host.querySelector('[data-routine-open]:not([hidden])')) actions.push(launch('opponent-routine', 'Opponent routine', '[data-routine-open]'));
    } else if (page) {
      const category = practiceMenuCategories.find(category => category.id === page);
      actions = commands(practice.filter(item => category?.actions.some(id => item.action === `practice:${id}`)));
    } else if (presentation.layout === 'result' && authored.some(item => item.action.startsWith('guide:'))) {
      actions = commands(authored);
    } else {
      actions = commands(authored.filter(item => !item.action.startsWith('practice:') && !review.includes(item) && !(retry && item.action === 'match:practice')));
      if (retry) actions.splice(1, 0, { ...commands([retry])[0]!, priority: 'secondary', explanation: retry.action === 'review:practice' ? 'Try a different answer to the opening that ended this set.' : 'Practice a defense for the decisive contact.' });
      if (review.some(item => item !== retry)) actions.splice(retry ? 2 : 1, 0, invoke('review', 'Review this fight', () => { page = 'review';render();shell.actions.focus(); }));
      if (practice.length) actions.splice(1, 0, invoke('practice-setup', 'Practice setup', () => { page = 'practice-setup';render();shell.actions.focus(); }));
      if (authored.some(item => item.action === 'guide:back')) {
        if (options.host.querySelector('.hf-combat-reference>summary')) actions.push(launch('reference', 'Combat controls', '.hf-combat-reference>summary'));
        if (options.host.querySelector('.hf-runtime-controls>summary')) actions.push(launch('settings', 'Game settings', '.hf-runtime-controls>summary'));
      }
      if (authored.some(item => item.action === 'pause') && authored.some(item => item.action.startsWith('guide:')) && options.host.querySelector('[data-tutorial-open]:not([hidden])')) actions.splice(1, 0, launch('tutorial', 'Tutorial controls', '[data-tutorial-open]'));
      if (authored.some(item => item.action === 'pause') && !authored.some(item => item.action.startsWith('guide:'))) {
        if (options.host.querySelector('.hf-combat-reference>summary')) actions.splice(actions.length - 1, 0, launch('reference', 'Combat controls', '.hf-combat-reference>summary'));
        if (options.host.querySelector('.hf-runtime-controls>summary')) actions.splice(actions.length - 1, 0, launch('settings', 'Settings', '.hf-runtime-controls>summary'));
        if (supportEntries(false).length || supportEntries(true).length) actions.splice(actions.length - 1, 0, invoke('options', 'Player options', () => { page = 'options';render();shell.actions.focus(); }));
      } else if (presentation.layout === 'result' && !authored.some(item => item.action.startsWith('guide:')) && options.host.querySelector('[data-rewards-open]')) actions.push(launch('rewards', 'Rewards', '[data-rewards-open]'));
    }
    const priority = { primary: 0, secondary: 1, utility: 2 };actions.sort((a, b) => priority[a.priority] - priority[b.priority]);
    const training = page === 'practice-setup' || practiceMenuCategories.some(category => category.id === page);
    if (training) { shell.identity.querySelector('h1')!.textContent = 'Practice';summary.textContent = 'Choose what to work on. Each selection replaces the current setup and returns you to the arena.';summary.hidden = false; }
    shell.render({ page: page || 'context', title: page === 'options' ? 'Player options' : page === 'online' ? 'Online tools' : page === 'review' ? 'Review this fight' : page === 'practice-setup' ? 'Training setup' : practiceMenuCategories.find(category => category.id === page)?.label ?? '', root: !page, actions });
  }
  return {
    setResultStatus(text: string) { if (resultStatus.textContent !== text) resultStatus.textContent = text;resultStatus.hidden = !!page || presentation?.layout !== 'result' || !text; },
    openPracticeSetup() { practiceRequested = true; },
    render(input: GameplayPresentation3D) {
      presentation = input;
      const next = options.host.classList.contains('hf-fight-stage') && (input.layout === 'menu' || input.layout === 'result') && !!input.actions?.length && !input.actions.some(item => item.action === 'match:start');
      const kind = input.layout === 'result' ? 'result' : input.actions?.some(item => item.action === 'pause') ? 'pause' : `guide:${input.title}`;
      const entered = next && (!active || kind !== previousKind);
      if (entered || !next) page = '';
      if (next && practiceRequested) { page = 'practice-setup';practiceRequested = false; }
      active = next;previousKind = kind;shell.element.hidden = !active;
      if (active) { shell.element.dataset.kind = kind;render();if (entered) shell.actions.focus(); }
      return active;
    },
    dispose() { for(const [dialog,restore] of modalReturns)dialog.removeEventListener('close',restore);for(const [details,restore] of disclosureReturns)details.removeEventListener('toggle',restore);modalReturns.clear();disclosureReturns.clear();shell.dispose(); },
  };
}
