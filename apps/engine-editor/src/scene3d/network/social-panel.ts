import { createGameSelect } from '@hyperfocus/ui/game-menu';
import type { SocialCommand, SocialSnapshot } from '@hyperfocus/touch-of-death/network/social-protocol';
import type { PublicProfile } from '@hyperfocus/touch-of-death/appearance/profile';
import { roomProfileLabel } from './profile-label.ts';

/** Room communication is host-owned; drafts and pending commands are session-local. */
export function createRoomSocialPanel(options: { host: HTMLElement; onSend(command: SocialCommand): void; onInteract(): void }) {
  const section = document.createElement('section');section.className = 'hf-room-social';
  section.innerHTML = `<h3>Room chat</h3><div data-social-transcript role="log" aria-label="Room messages" aria-live="polite" aria-relevant="additions text"></div>
    <form data-social-form><label>Message<input data-social-draft maxlength="280" autocomplete="off" placeholder="Say hello to the room"></label><button type="submit" data-social-send>Send</button></form>
    <p data-social-status role="status"></p><button type="button" data-social-retry hidden>Retry message</button><button type="button" data-social-dismiss hidden>Dismiss failed action</button>
    <details><summary>Communication controls</summary><label>Person<button type="button" data-social-person></button></label>
    <div class="hf-network-buttons"><button type="button" data-social-mute>Mute</button><button type="button" data-social-block>Block</button></div>
    <p>Mute hides their messages. Block hides communication both ways; it does not remove a fighter from the room.</p>
    <label>Message to report<button type="button" data-social-report-message></button></label><label>Reason<button type="button" data-social-reason></button></label>
    <button type="button" data-social-report>Submit report</button><p>Reports are saved by the room host. Submission does not mean someone has reviewed it.</p></details>`;
  const style = document.createElement('style');style.textContent = '.hf-room-social{border-top:1px solid #344653;margin-top:16px;padding-top:8px}.hf-room-social [data-social-transcript]{max-height:180px;overflow:auto;overflow-wrap:anywhere;font-size:13px}.hf-room-social [data-social-transcript] p{margin:6px 0;white-space:pre-wrap}.hf-room-social form{display:flex;align-items:end;gap:8px}.hf-room-social form label{flex:1;min-width:0}.hf-room-social form button{margin-bottom:12px}';
  section.append(style);options.host.append(section);
  const find = <T extends Element>(selector: string) => section.querySelector<T>(selector)!;
  const draft = find<HTMLInputElement>('[data-social-draft]'), send = find<HTMLButtonElement>('[data-social-send]'), retry = find<HTMLButtonElement>('[data-social-retry]');
  const person = createGameSelect({ element: find<HTMLButtonElement>('[data-social-person]'), ariaLabel: 'Person', options: [] });
  const message = createGameSelect({ element: find<HTMLButtonElement>('[data-social-report-message]'), ariaLabel: 'Message to report', options: [] });
  const reportReasons = ['harassment', 'spam', 'inappropriate', 'other'] as const;
  const reason = createGameSelect({ element: find<HTMLButtonElement>('[data-social-reason]'), ariaLabel: 'Reason', options: reportReasons.map(value => ({ value, label: value[0]!.toUpperCase() + value.slice(1) })) });
  const mute = find<HTMLButtonElement>('[data-social-mute]'), block = find<HTMLButtonElement>('[data-social-block]'), report = find<HTMLButtonElement>('[data-social-report]');
  const status = find<HTMLElement>('[data-social-status]'), transcript = find<HTMLElement>('[data-social-transcript]');
  let social: SocialSnapshot | undefined, local = '', messageKey = '', peopleKey = '', draftVersion = 0;
  let pending: { command: SocialCommand; draft: string; version: number; failed: boolean } | undefined;
  let profiles: readonly PublicProfile[] = [];
  const label = (id: string) => roomProfileLabel(id, profiles);
  const refreshControls = () => {
    send.disabled = Boolean(pending);retry.hidden = !pending;retry.textContent = 'Retry pending action';
    find<HTMLButtonElement>('[data-social-dismiss]').hidden = !pending?.failed;
    mute.disabled = block.disabled = !person.value || Boolean(pending);
    mute.textContent = social?.muted.includes(person.value) ? 'Unmute' : 'Mute';block.textContent = social?.blocked.includes(person.value) ? 'Unblock' : 'Block';
    report.disabled = !message.value || Boolean(pending) || Boolean(social?.reported.includes(message.value));
  };
  const dispatch = (command: SocialCommand) => {
    options.onInteract();pending = { command, draft: draft.value, version: draftVersion, failed: false };status.textContent = 'Sending… Waiting for the host.';refreshControls();
    try { options.onSend(command); } catch (cause) { pending.failed = true;status.textContent = cause instanceof Error ? cause.message : 'Could not send. Retry when connected.';refreshControls(); }
  };
  const requestId = () => crypto.randomUUID();
  draft.addEventListener('input', () => { draftVersion++; });
  find<HTMLFormElement>('[data-social-form]').addEventListener('submit', event => {
    event.preventDefault();if (pending) return;const text = draft.value.trim();
    if (!text) { status.textContent = 'Write a message first.';return; }
    if (text.length > 280 || new TextEncoder().encode(text).length > 512) { status.textContent = 'Use at most 280 characters and 512 bytes. Shorten this message.';return; }
    dispatch({ type: 'social-send', requestId: requestId(), text });
  });
  retry.addEventListener('click', () => { if (!pending) return;const previous = pending;dispatch(previous.command);pending!.draft = previous.draft;pending!.version = previous.version; });
  find<HTMLButtonElement>('[data-social-dismiss]').addEventListener('click', () => { if (!pending?.failed) return;options.onInteract();pending = undefined;status.textContent = 'Draft kept. You can edit it and send again.';refreshControls(); });
  person.element.addEventListener('change', refreshControls);message.element.addEventListener('change', refreshControls);
  mute.addEventListener('click', () => { if (person.value && !pending) dispatch({ type: 'social-mute', requestId: requestId(), targetId: person.value, enabled: !social?.muted.includes(person.value) }); });
  block.addEventListener('click', () => { if (person.value && !pending) dispatch({ type: 'social-block', requestId: requestId(), targetId: person.value, enabled: !social?.blocked.includes(person.value) }); });
  report.addEventListener('click', () => {
    const selectedReason = reportReasons.find(value => value === reason.value);
    if (message.value && !pending && selectedReason) dispatch({ type: 'social-report', requestId: requestId(), messageId: message.value, reason: selectedReason });
  });
  const replaceOptions = (select: ReturnType<typeof createGameSelect>, values: Array<{ value: string; text: string; title: string }>) => {
    select.setOptions(values.map(item => ({ value: item.value, label: item.text, description: item.title })));
  };
  return {
    get focused() { return person.focused || message.focused || reason.focused || section.contains(document.activeElement); },
    render(state: { social: SocialSnapshot; localUserId: string; members: { userId: string }[]; profiles?: readonly PublicProfile[] }) {
      profiles = state.profiles ?? [];
      social = state.social;local = state.localUserId;
      if (pending && social.requestId === pending.command.requestId) {
        if (social.error) { pending.failed = true;status.textContent = social.error; }
        else {
          if (pending.command.type === 'social-send' && draftVersion === pending.version && draft.value === pending.draft) draft.value = '';
          status.textContent = social.notice || (pending.command.type === 'social-report' ? 'Report saved by the host.' : 'Done.');pending = undefined;
        }
      } else if (!pending) status.textContent = social.error || social.notice;
      const people = [...new Set([...state.members.map(member => member.userId), ...social.muted, ...social.blocked])].filter(id => id !== local);
      const nextPeople = JSON.stringify(people.map(id => [id, label(id)]));
      if (nextPeople !== peopleKey) { peopleKey = nextPeople;replaceOptions(person, people.map(id => ({ value: id, text: label(id), title: id }))); }
      const visible = social.messages.filter(item => !social!.muted.includes(item.senderId) && !social!.blocked.includes(item.senderId));
      const nextMessages = JSON.stringify([visible, visible.map(item => label(item.senderId))]);
      if (nextMessages !== messageKey) {
        messageKey = nextMessages;const atBottom = transcript.scrollHeight - transcript.clientHeight - transcript.scrollTop < 24;
        transcript.replaceChildren(...visible.map(item => { const row = document.createElement('p');row.title = item.senderId;row.textContent = `${label(item.senderId)}${item.senderId === local ? ' (You)' : ''}: ${item.text}`;return row; }));
        if (atBottom) transcript.scrollTop = transcript.scrollHeight;
        replaceOptions(message, visible.filter(item => item.senderId !== local).map(item => ({ value: item.id, text: `${label(item.senderId)}: ${item.text.slice(0, 64)}`, title: `${item.senderId}: ${item.text}` })));
      }
      refreshControls();
    },
    dispose() { person.dispose();message.dispose();reason.dispose();section.remove(); },
  };
}
