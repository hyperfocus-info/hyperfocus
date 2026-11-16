import { attachGameSession } from '../game-menu/session';
import type { CommunityRoomSnapshot } from '@hyperfocus/touch-of-death/network/community-protocol';
import type { PublicProfile } from '@hyperfocus/touch-of-death/appearance/profile';
import { roomProfileLabel } from './profile-label.ts';
import { createRoomSocialPanel } from './social-panel.ts';
import type { SocialCommand, SocialSnapshot } from '@hyperfocus/touch-of-death/network/social-protocol';

export type CommunityPanelData = CommunityRoomSnapshot['community'];

/** Session overlay, independent of authored project state. All remote strings use textContent. */
export function createCommunityRoomPanel(options: {
  host: HTMLElement; canvas: HTMLCanvasElement; queue?(enabled: boolean): void; ready?(battleId: string): void; leave?(): void; social?(command: SocialCommand): void; onInteract(): void;
}) {
  const section = document.createElement('section');section.className = 'hf-community';section.hidden = true;
  section.innerHTML = `<button type="button" data-community-open aria-expanded="false" aria-controls="hf-community-room">Room</button>
    <section id="hf-community-room" class="hf-community-pane" aria-label="Winner stays room" hidden>
      <h2>Winner stays room</h2><p data-community-phase></p><p data-community-battle></p><p data-community-deadline></p>
      <button type="button" data-community-ready hidden>Ready</button><button type="button" data-community-queue>Join queue</button>
      <button type="button" data-community-close data-menu-back>View arena</button><button type="button" data-community-leave>Leave room</button>
      <div data-community-roster><h3>Members and queue</h3><ol data-community-members></ol><p data-community-result></p><p data-community-streak></p></div>
      <div data-community-invitation></div><details data-community-chat><summary>Room chat</summary><div data-community-social></div></details>
      <details data-community-tools><summary>Voice, pictures and fighter</summary><div data-community-tools-host></div></details>
      <p data-community-error role="alert"></p><p data-community-rule></p>
    </section>`;
  const style = document.createElement('style');style.textContent = '.hf-community [data-community-open]{position:absolute;right:16px;bottom:16px}';
  section.append(style);options.host.append(section);
  const find = <T extends Element>(selector: string) => section.querySelector<T>(selector)!;
  const open = find<HTMLButtonElement>('[data-community-open]'), pane = find<HTMLElement>('.hf-community-pane');
  const ready = find<HTMLButtonElement>('[data-community-ready]'), queue = find<HTMLButtonElement>('[data-community-queue]');
  const tools = find<HTMLElement>('[data-community-tools-host]'), invitationHost = find<HTMLElement>('[data-community-invitation]');
  const composition = attachGameSession({ element: pane, title: find('h2'), status: find('[data-community-phase]'),
    context: [find('[data-community-battle]'), find('[data-community-deadline]'), find('[data-community-error]'), find('[data-community-rule]')],
    body: find('[data-community-roster]'), tools: [invitationHost, find('[data-community-chat]'), find('[data-community-tools]')],
    back: () => find<HTMLButtonElement>('[data-community-close]').click(),
  });
  let data: CommunityPanelData | undefined, localId = '', lastPhase = '', focusedBattle = '', inlineError = '';
  let socialPanel: ReturnType<typeof createRoomSocialPanel> | undefined;
  let profiles: readonly PublicProfile[] = [];
  const label = (id: string) => roomProfileLabel(id, profiles);
  const show = (visible: boolean) => { pane.hidden = !visible;open.setAttribute('aria-expanded', String(visible)); };
  const invoke = (action: () => void) => { options.onInteract();try { inlineError = '';action(); } catch (cause) { inlineError = cause instanceof Error ? cause.message : 'Room action failed. Try again.'; } };
  open.addEventListener('click', () => { options.onInteract();show(Boolean(pane.hidden));if (!pane.hidden) composition.focus(); });
  find<HTMLButtonElement>('[data-community-close]').addEventListener('click', () => { show(false);options.canvas.focus({ preventScroll: true }); });
  ready.addEventListener('click', () => { if (data) invoke(() => options.ready?.(data!.battleId)); });
  queue.addEventListener('click', () => { const member = data?.members.find(item => item.userId === localId);if (member) invoke(() => options.queue?.(!member.wantsQueue)); });
  const leave = find<HTMLButtonElement>('[data-community-leave]');leave.hidden = !options.leave;
  leave.addEventListener('click', () => invoke(() => { options.leave?.();show(false);options.canvas.focus({ preventScroll: true }); }));
  return {
    toolsHost: tools, invitationHost,
    get focused() { return !section.hidden && (!pane.hidden || section.contains(document.activeElement)); },
    render(state: { active: boolean; playerId?: string; community?: CommunityPanelData; social?: SocialSnapshot; profiles?: readonly PublicProfile[] }) {
      profiles = state.profiles ?? [];
      section.hidden = !state.active || !state.community;
      if (section.hidden) { data = undefined;lastPhase = '';focusedBattle = '';socialPanel?.dispose();socialPanel = undefined;show(false);return; }
      if (data && state.community!.revision < data.revision) return;
      data = state.community!;localId = data.members.find(member => member.playerId === state.playerId)?.userId ?? '';
      if (options.social && state.social) {
        socialPanel ??= createRoomSocialPanel({ host: find<HTMLElement>('[data-community-social]'), onSend: options.social, onInteract: options.onInteract });
        socialPanel.render({ social: state.social, localUserId: localId, members: data.members, profiles });
      }
      const local = data.members.find(member => member.userId === localId), seat = data.fighters.indexOf(localId);
      if (data.phase !== lastPhase) { show(data.phase !== 'playing');if (data.phase === 'playing' && section.contains(document.activeElement)) options.canvas.focus({ preventScroll: true });lastPhase = data.phase; }
      find<HTMLElement>('[data-community-tools]').hidden = ![...tools.children].some(child => child instanceof HTMLElement && !child.hidden && child.tagName !== 'STYLE');
      find<HTMLElement>('[data-community-chat]').hidden = !socialPanel;
      const needsReady = data.phase === 'ready' && seat >= 0 && !data.ready[seat];
      ready.hidden = data.phase !== 'ready' || seat < 0;ready.disabled = !needsReady || !options.ready;ready.textContent = needsReady ? 'Ready' : 'Ready · waiting for opponent';
      queue.disabled = !local || !options.queue;queue.textContent = local?.wantsQueue ? 'Watch only' : 'Join queue';
      find<HTMLElement>('[data-community-battle]').textContent = data.fighters.length === 2 ? `${label(data.fighters[0]!)} vs ${label(data.fighters[1]!)} · ${data.phase === 'ready' ? 'Getting ready' : 'Fighting'}` : 'Waiting for two people to join the queue.';
      find<HTMLElement>('[data-community-battle]').title = data.fighters.join(' vs ');
      const seconds = Math.max(0, Math.ceil((data.deadline - Date.now()) / 1000));
      find<HTMLElement>('[data-community-deadline]').textContent = data.phase === 'ready' ? `Ready within ${seconds}s. Players who do not confirm will watch until they rejoin the queue.` : '';
      const rows = data.members.slice(0, 32).map(member => {
        const row = document.createElement('li'), position = data!.queue.indexOf(member.userId), fighter = data!.fighters.includes(member.userId);row.title = member.userId;
        const name = document.createElement('span'), state = document.createElement('span');
        name.textContent = `${label(member.userId)}${member.userId === localId ? ' (You)' : ''}`;
        state.textContent = !member.online ? 'Disconnected · place reserved' : fighter ? data!.phase === 'ready' ? data!.ready[data!.fighters.indexOf(member.userId)] ? 'Ready' : 'Confirming' : 'Fighting' : position >= 0 ? `Queue ${position + 1}` : 'Watching';
        row.dataset.local = String(member.userId === localId);row.append(name, state);return row;
      });
      find('[data-community-members]').replaceChildren(...rows);
      find<HTMLElement>('[data-community-result]').textContent = data.lastWinner <= 1 && data.lastFighters[data.lastWinner] ? `Last set: ${label(data.lastFighters[data.lastWinner]!)} wins.` : data.lastBattleId ? 'Last set: draw.' : '';
      find<HTMLElement>('[data-community-streak]').textContent = data.streakUserId ? `${label(data.streakUserId)} · ${data.streakWins} consecutive ${data.streakWins === 1 ? 'win' : 'wins'}` : '';
      find<HTMLElement>('[data-community-result]').title = data.lastFighters[data.lastWinner] ?? '';
      find<HTMLElement>('[data-community-streak]').title = data.streakUserId;
      find<HTMLElement>('[data-community-error]').textContent = inlineError || data.error;
      find<HTMLElement>('[data-community-rule]').textContent = `Win to stay in. After ${data.streakCap} ${data.streakCap === 1 ? 'win' : 'wins'}, rotate so everyone gets a turn.`;
      composition.setStatus(data.phase === 'playing' ? seat >= 0 ? 'Your set is live' : 'Set in progress' : needsReady ? 'Your turn to fight' : data.phase === 'ready' && seat >= 0 ? 'Waiting for your opponent' : local?.wantsQueue ? 'You’re in the queue' : 'Watch or join the queue');
      const close = find<HTMLButtonElement>('[data-community-close]');close.textContent = data.phase === 'playing' ? 'Return to play' : 'View arena';
      leave.textContent = data.phase === 'playing' && seat >= 0 ? 'Concede and leave' : 'Leave room';
      const actions = [
        { button: ready, priority: needsReady ? 'primary' as const : 'secondary' as const, explanation: !options.ready ? 'Ready is unavailable for this connection.' : ready.disabled ? 'You are ready. Waiting for your opponent.' : undefined },
        { button: queue, priority: !needsReady && !local?.wantsQueue && data.phase !== 'playing' ? 'primary' as const : 'secondary' as const, explanation: queue.disabled ? 'Queue controls are unavailable for this connection.' : undefined },
        { button: close, priority: data.phase === 'playing' ? 'primary' as const : 'utility' as const },
        { button: leave, priority: 'utility' as const, destructive: data.phase === 'playing' && seat >= 0 },
      ];
      actions.sort((a, b) => Number(b.priority === 'primary') - Number(a.priority === 'primary'));
      composition.render({ waiting: !actions.some(action => !action.button.hidden && action.priority === 'primary'), actions });
      if (needsReady && focusedBattle !== data.battleId) { focusedBattle = data.battleId;show(true);composition.focus(ready); }
    },
    dispose() { composition.dispose();socialPanel?.dispose();section.remove(); },
  };
}
