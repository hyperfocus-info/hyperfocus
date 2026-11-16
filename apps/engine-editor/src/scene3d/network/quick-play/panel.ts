import { attachGameSession } from '../../game-menu/session';
import { createReplaySaveAction } from '../../replay/save-action.ts';
import type { QuickPlayCommand, QuickPlayRoomSnapshot } from '@hyperfocus/touch-of-death/network/quick-play/protocol';
import type { PublicProfile } from '@hyperfocus/touch-of-death/appearance/profile';
import { roomProfileLabel } from '../profile-label.ts';

export function createQuickPlayPanel(options: {
  host: HTMLElement; canvas: HTMLCanvasElement; send(command: QuickPlayCommand): void; leave(): void; onInteract(): void; saveReplay?(): void | Promise<void>; reviewFight?(): void; shareReplay?(): void; practiceOffline?(): void; practiceWhileSearching?(): void; queueWarmup?(): boolean; stopWarmup?(): void;
}) {
  const section = document.createElement('section');section.className = 'hf-quick-play';section.hidden = true;
  section.innerHTML = `<h2>Online Quick Play</h2><p data-quick-players></p><p data-quick-status role="status" aria-live="polite"></p><p data-quick-deadline></p><p data-quick-guidance></p><p data-quick-rating></p><p data-quick-error role="alert"></p>
    <div class="hf-network-buttons"><button type="button" data-quick-search>Search</button><button type="button" data-quick-accept>Accept match</button><button type="button" data-quick-cancel>Cancel search</button><button type="button" data-quick-save hidden>Save replay</button><button type="button" data-quick-leave>Leave Quick Play</button></div>
    <details data-quick-customization><summary>Pictures and fighter</summary><div data-quick-customization-host></div></details>`;
  options.host.append(section);
  const find = <T extends Element>(selector: string) => section.querySelector<T>(selector)!;
  const customization = find<HTMLDetailsElement>('[data-quick-customization]');
  const customizationHost = find<HTMLElement>('[data-quick-customization-host]');
  const search = find<HTMLButtonElement>('[data-quick-search]'), accept = find<HTMLButtonElement>('[data-quick-accept]'), cancel = find<HTMLButtonElement>('[data-quick-cancel]');
  const error = find<HTMLElement>('[data-quick-error]');
  let data: QuickPlayRoomSnapshot['quickPlay'] | undefined, focusedMatch = '', previousPhase = '', pending = '', localError = '';
  const send = (command: QuickPlayCommand) => {
    options.onInteract();localError = '';pending = command.type;
    try { options.send(command); } catch (cause) { localError = cause instanceof Error ? cause.message : 'Could not send. Try again.';pending = ''; }
    error.textContent = localError;
  };
  search.addEventListener('click', () => { if (data?.connectionReady && !search.disabled) send({ type: 'quick-search', requestId: crypto.randomUUID() }); });
  accept.addEventListener('click', () => { if (data?.phase === 'ready') send({ type: 'quick-accept', matchId: data.matchId }); });
  cancel.addEventListener('click', () => send({ type: 'quick-cancel', requestId: crypto.randomUUID() }));
  const saveReplay = find<HTMLButtonElement>('[data-quick-save]');
  const review = document.createElement('button');review.type = 'button';review.dataset.quickReview = '';review.textContent = 'Review fight';review.hidden = true;saveReplay.before(review);
  const share = document.createElement('button');share.type = 'button';share.dataset.quickShare = '';share.textContent = 'Share replay';share.hidden = true;saveReplay.before(share);
  const practice = document.createElement('button');practice.type = 'button';practice.dataset.quickPractice = '';practice.textContent = 'Leave and practice';practice.hidden = true;cancel.after(practice);
  share.onclick = () => { if (share.hidden || data?.phase !== 'result') return;options.onInteract();try { options.shareReplay?.(); } catch (cause) { error.textContent = cause instanceof Error ? cause.message : 'Could not share this replay.'; } };
  practice.onclick = () => { if (practice.hidden || !['idle', 'searching'].includes(data?.phase ?? '')) return;options.onInteract();if (data?.phase === 'searching' && options.practiceWhileSearching) options.practiceWhileSearching();else options.practiceOffline?.(); };
  const warmup = document.createElement('aside');warmup.className = 'tod-queue-warmup';warmup.hidden = true;
  warmup.innerHTML = '<span>Searching while you practice. A match will ask you to accept.</span><button type="button">Back to queue</button>';
  warmup.querySelector('button')!.onclick = () => { options.stopWarmup?.(); };options.host.append(warmup);
  const warmupStyle = document.createElement('style');warmupStyle.textContent = '.hf-quick-play[data-warmup=true]{display:none!important}.tod-queue-warmup{position:absolute;bottom:1rem;left:1rem;right:1rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.75rem 1rem;background:var(--game-surface,#151d18);color:var(--game-text,#eee9dc);pointer-events:auto;font:1rem/1.4 Arial,sans-serif}.tod-queue-warmup[hidden]{display:none}';options.host.append(warmupStyle);
  const leave = find<HTMLButtonElement>('[data-quick-leave]');
  const composition = attachGameSession({ element: section, title: find('h2'), status: find('[data-quick-status]'),
    context: [find('[data-quick-players]'), find('[data-quick-deadline]'), find('[data-quick-guidance]'), find('[data-quick-rating]'), error], tools: [customization],
    back: () => leave.click(),
  });
  leave.dataset.menuBack = '';
  review.onclick = () => { if (section.hidden || data?.phase !== 'result' || review.hidden) return;options.onInteract();try { options.reviewFight?.(); } catch (cause) { localError = cause instanceof Error ? cause.message : 'Could not review this fight.';error.textContent = localError; } };
  const replayDownload = createReplaySaveAction({ save: options.saveReplay, report(message) { localError = message;error.textContent = message; } });
  saveReplay.addEventListener('click', () => { if (!saveReplay.hidden) { options.onInteract();replayDownload.run(); } });
  find<HTMLButtonElement>('[data-quick-leave]').addEventListener('click', () => { options.onInteract();options.leave();options.canvas.focus({ preventScroll: true }); });
  return {
    customizationHost,
    get focused() { return !section.hidden && !options.queueWarmup?.(); },
    render(state: { active: boolean; quickPlay?: QuickPlayRoomSnapshot['quickPlay']; canSaveReplay?: boolean; profiles?: readonly PublicProfile[]; localUserId?: string }) {
      section.dataset.warmup = String(!!options.queueWarmup?.());warmup.hidden = !state.active || !options.queueWarmup?.();
      practice.textContent = state.quickPlay?.phase === 'searching' && options.practiceWhileSearching ? 'Practice while searching' : 'Leave and practice';
      review.hidden = !state.active || state.quickPlay?.phase !== 'result' || !state.canSaveReplay || !options.reviewFight;
      share.hidden = !state.active || state.quickPlay?.phase !== 'result' || !state.canSaveReplay || !options.shareReplay;
      practice.hidden = !state.active || !['idle', 'searching'].includes(state.quickPlay?.phase ?? '') || !options.practiceOffline;
      customization.hidden = ![...customizationHost.children].some(child => child instanceof HTMLElement && !child.hidden && !['STYLE', 'SCRIPT'].includes(child.tagName));
      saveReplay.hidden = !state.active || state.quickPlay?.phase !== 'result' || !state.canSaveReplay || !options.saveReplay;
      saveReplay.disabled = replayDownload.pending;
      data = state.quickPlay;section.hidden = !state.active || !data || data.phase === 'playing';
      section.dataset.phase = data?.phase ?? '';
      if (!state.active || !data) { customization.open = false;focusedMatch = '';previousPhase = '';pending = '';localError = '';return; }
      const players = find<HTMLElement>('[data-quick-players]');
      players.textContent = ['ready', 'result'].includes(data.phase) && state.profiles?.length ? data.users.map(id => roomProfileLabel(id, state.profiles)).join(' vs ') : '';players.title = data.users.join(' vs ');
      const entering = !previousPhase || previousPhase === 'playing';
      if (data.phase !== previousPhase) { pending = '';localError = '';if (data.phase === 'playing') { customization.open = false;options.canvas.focus({ preventScroll: true }); }previousPhase = data.phase; }
      if (data.error) pending = '';
      search.hidden = data.phase !== 'idle' && data.phase !== 'result';search.textContent = data.phase === 'result' ? 'Play again' : data.error || localError ? 'Retry search' : 'Search';
      search.disabled = !data.connectionReady;
      accept.hidden = data.phase !== 'ready';cancel.hidden = data.phase !== 'ready' && data.phase !== 'searching';cancel.textContent = data.phase === 'ready' ? 'Decline' : 'Cancel search';
      const accepted = data.phase === 'ready' && !!data.ready[data.users.indexOf(state.localUserId ?? '')];
      accept.disabled = accepted;accept.textContent = accepted ? 'Accepted · waiting for opponent' : 'Accept match';
      const seconds = Math.max(0, Math.ceil((data.deadline - Date.now()) / 1000));
      const result = { none: 'Set ended', win: 'Win', loss: 'Loss', draw: 'Draw', aborted: 'Interrupted' }[data.outcome];
      composition.setStatus(data.phase === 'saving' ? 'Saving result…' : data.phase === 'idle' ? pending ? 'Request sent. Waiting for the host.' : 'Find your next opponent' : data.phase === 'searching' ? 'Searching for an opponent…' : data.phase === 'ready' ? 'Match found' : data.phase === 'result' ? result : 'Match in progress');
      find<HTMLElement>('[data-quick-guidance]').textContent = data.phase === 'searching' ? 'The skill range widens as you wait. You can cancel at any time.' : data.phase === 'ready' ? pending === 'quick-accept' ? 'Acceptance requested. Waiting for both players; you can retry Accept match if needed.' : 'Both players must accept before the set starts.' : data.phase === 'result' && data.outcome === 'aborted' ? 'The set was interrupted. No rating change.' : data.phase === 'result' ? 'Search again when you are ready for another set.' : 'Play a set against someone near your skill level.';
      find<HTMLElement>('[data-quick-guidance]').hidden = data.phase === 'result' && data.outcome !== 'aborted';
      find<HTMLElement>('[data-quick-deadline]').textContent = data.phase === 'ready' ? `Accept within ${seconds}s` : '';
      const completed = data.phase === 'result' && ['win', 'loss', 'draw'].includes(data.outcome);
      if (data.phase === 'saving') find<HTMLElement>('[data-quick-guidance]').textContent = 'The host has not confirmed this result yet. You can leave, but no rating change is final until it is saved.';
      find<HTMLElement>('[data-quick-rating]').textContent = completed ? `Rating ${data.rating} (${data.ratingDelta >= 0 ? '+' : ''}${data.ratingDelta})` : '';
      error.textContent = localError || data.error;
      if (!data.connectionReady && !search.hidden) { composition.setStatus('Checking your connection…');find<HTMLElement>('[data-quick-guidance]').textContent = 'Search becomes available when the host finishes measuring your connection. You can leave at any time.';find<HTMLElement>('[data-quick-guidance]').hidden = false; }
      if (accepted) { composition.setStatus('Waiting for your opponent');find<HTMLElement>('[data-quick-guidance]').textContent = 'You accepted. The set starts when both players are ready.'; }
      composition.render({ waiting: accepted || ['searching', 'saving', 'playing'].includes(data.phase), actions: [
        { button: search, priority: 'primary', explanation: !data.connectionReady ? 'Waiting for the host to measure your connection.' : undefined }, { button: accept, priority: accepted ? 'secondary' : 'primary', explanation: accepted ? 'You accepted. Waiting for your opponent.' : undefined },
        { button: cancel, priority: 'secondary' }, { button: practice, priority: 'secondary', explanation: data.phase === 'searching' && options.practiceWhileSearching ? 'Keep searching while practicing. A match will ask you to accept.' : 'Leaves the queue and opens local practice.' }, { button: review, priority: 'secondary' }, { button: share, priority: 'secondary' },
        { button: saveReplay, priority: 'utility' }, { button: leave, priority: 'utility' },
      ] });
      if (entering && !section.hidden) composition.focus();
      if (data.phase === 'ready' && !accepted && focusedMatch !== data.matchId) { focusedMatch = data.matchId;composition.focus(accept); }
    },
    dispose() { replayDownload.dispose();composition.dispose();warmup.remove();warmupStyle.remove();section.remove(); },
  };
}
