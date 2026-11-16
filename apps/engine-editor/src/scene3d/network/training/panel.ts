import { attachGameSession } from '../../game-menu/session';
import { createReplaySaveAction } from '../../replay/save-action.ts';
import type { TrainingCommand, TrainingRoomSnapshot } from '@hyperfocus/touch-of-death/training/protocol';
import type { PublicProfile } from '@hyperfocus/touch-of-death/appearance/profile';
import { roomProfileLabel } from '../profile-label.ts';

export function createTrainingPanel(options: { host: HTMLElement; canvas: HTMLCanvasElement; send(command: TrainingCommand): void; leave(): void; saveReplay?(): void | Promise<void>; onInteract(): void }) {
  const section = document.createElement('section');section.className = 'hf-training';section.hidden = true;
  section.innerHTML = `<button type="button" data-training-open aria-expanded="false">Training</button><section data-training-pane hidden aria-label="Shared training"><h2>Shared training</h2><p data-training-phase></p><p data-training-partner></p><p data-training-status></p><p data-training-guidance>Practice the same combat rules together. Resetting or swapping sides needs both players' agreement.</p><div class="hf-network-buttons"><button type="button" data-training-reset>Propose reset</button><button type="button" data-training-swap>Propose side swap</button><button type="button" data-training-accept>Accept</button><button type="button" data-training-decline>Decline</button><button type="button" data-training-save>Save replay</button><button type="button" data-training-close data-menu-back>Return to training</button><button type="button" data-training-leave>Leave training</button></div><p data-training-error role="alert"></p></section>`;
  options.host.append(section);
  const find = <T extends HTMLElement>(key: string) => section.querySelector<T>(`[data-training-${key}]`)!;
  const pane = find<HTMLElement>('pane'), open = find<HTMLButtonElement>('open'), accept = find<HTMLButtonElement>('accept');
  const invitationHost = document.createElement('div');
  const composition = attachGameSession({ element: pane, title: pane.querySelector('h2')!, status: find('phase'),
    context: [find('partner'), find('status'), find('guidance'), find('error')], tools: [invitationHost],
    back: () => find<HTMLButtonElement>('close').click(),
  });
  const style = document.createElement('style');style.textContent = '.hf-training [data-training-open]{position:absolute;right:16px;bottom:16px}';section.append(style);
  let current: TrainingRoomSnapshot['training'] | undefined, matchId = '', localUserId = '', lastMatch = '', focusedProposal = '', localError = '';
  function show(visible: boolean) { pane.hidden = !visible;open.setAttribute('aria-expanded', String(visible)); }
  function run(action: () => void) { options.onInteract();localError = '';try { action(); } catch (cause) { localError = cause instanceof Error ? cause.message : 'Action failed. Try again.'; }find('error').textContent = localError; }
  open.onclick = () => { options.onInteract();show(Boolean(pane.hidden));if (!pane.hidden) composition.focus(); };
  find('close').onclick = () => { show(false);options.canvas.focus({ preventScroll: true }); };
  find('leave').onclick = () => run(() => { options.leave();show(false);options.canvas.focus({ preventScroll: true }); });
  for (const action of ['reset', 'swap'] as const) find(action).onclick = () => run(() => options.send({ type: 'training-propose', matchId, requestId: crypto.randomUUID(), action }));
  accept.onclick = () => run(() => { if (current?.proposalId) options.send({ type: 'training-respond', matchId, proposalId: current.proposalId, accept: true }); });
  find('decline').onclick = () => run(() => { if (current?.proposalId) options.send({ type: 'training-respond', matchId, proposalId: current.proposalId, accept: false }); });
  const replayDownload = createReplaySaveAction({ save: options.saveReplay, report(error) { localError = error;find('error').textContent = error; } });
  find('save').onclick = () => { options.onInteract();replayDownload.run(); };
  return {
    invitationHost, toolsHost: composition.tools,
    get focused() { return !section.hidden && (!pane.hidden || section.contains(document.activeElement)); },
    render(state: { active: boolean; training?: TrainingRoomSnapshot['training']; matchId?: string; localUserId?: string; profiles?: readonly PublicProfile[]; canSaveReplay?: boolean }) {
      section.hidden = !state.active || !state.training;if (section.hidden) { current = undefined;lastMatch = '';focusedProposal = '';show(false);return; }
      if (current && state.training!.revision < current.revision) return;
      current = state.training!;matchId = state.matchId ?? '';localUserId = state.localUserId ?? '';
      if (current.phase !== 'playing') show(true);
      else if (lastMatch !== matchId) { lastMatch = matchId;show(false);options.canvas.focus({ preventScroll: true }); }
      const proposed = Boolean(current.proposalId), mine = current.requestedBy === localUserId;
      for (const action of ['reset', 'swap']) { find<HTMLButtonElement>(action).disabled = current.phase !== 'playing' || proposed;find(action).hidden = current.phase !== 'playing' || proposed; }
      accept.hidden = !proposed || mine;find('decline').hidden = !proposed;
      find<HTMLButtonElement>('save').hidden = !options.saveReplay || current.phase !== 'playing';find<HTMLButtonElement>('save').disabled = replayDownload.pending || !state.canSaveReplay;
      const other = current.users.find(id => id !== localUserId), seat = current.users.indexOf(localUserId);find('partner').textContent = other ? `Training with ${roomProfileLabel(other, state.profiles)} · You control fighter ${seat + 1}` : 'Waiting for your partner.';find('partner').title = other ?? '';
      const seconds = Math.max(0, Math.ceil((current.deadline - Date.now()) / 1000));
      find('status').textContent = current.phase !== 'playing' ? 'Share the room invitation. Training begins when your partner joins.' : proposed ? `${mine ? 'You proposed' : 'Your partner proposed'} ${current.action === 'swap' ? 'swapping sides' : 'a fresh attempt'}. ${mine ? 'Waiting for your partner' : 'Accept or decline'} · ${seconds}s remaining.` : 'Try a situation together. Open Training to propose a fresh attempt or swap sides.';
      find('error').textContent = localError || current.error;
      composition.setStatus(current.phase !== 'playing' ? 'Waiting for your partner' : proposed ? mine ? 'Waiting for agreement' : current.action === 'swap' ? 'Swap sides?' : 'Start a fresh attempt?' : 'Practice together');
      find('guidance').hidden = current.phase !== 'playing' || proposed;
      find('close').textContent = current.phase === 'playing' ? 'Return to training' : 'View arena';
      const close = find<HTMLButtonElement>('close');
      const actions = [
        { button: accept, priority: 'primary' as const },
        { button: close, priority: current.phase === 'playing' && !proposed ? 'primary' as const : 'utility' as const },
        { button: find<HTMLButtonElement>('decline'), priority: 'secondary' as const },
        { button: find<HTMLButtonElement>('reset'), priority: 'secondary' as const, explanation: 'Resetting needs both players’ agreement.' },
        { button: find<HTMLButtonElement>('swap'), priority: 'secondary' as const, explanation: 'Swapping needs both players’ agreement.' },
        { button: find<HTMLButtonElement>('save'), priority: 'utility' as const, explanation: 'Available after confirmed combat has been recorded.' },
        { button: find<HTMLButtonElement>('leave'), priority: 'utility' as const },
      ];
      composition.render({ waiting: current.phase !== 'playing' || proposed && mine, actions });
      if (proposed && focusedProposal !== current.proposalId) { focusedProposal = current.proposalId;show(true);if (!mine) composition.focus(accept); }
    },
    dispose() { replayDownload.dispose();composition.dispose();section.remove(); },
  };
}
