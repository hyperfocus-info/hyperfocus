import { createCombatInvite, readCombatInvite } from './invite.ts';
import type { attachRoomChoices } from './hosted/room-choices.ts';

/** Session-only sharing UI. Import reviews details; it never connects automatically. */
export function attachCombatInviteControls(options: { form: HTMLFormElement; roomType: ReturnType<typeof attachRoomChoices>['roomType']; contentId: string; origin?: string; onInvite?(): void }) {
  const fields = options.form.querySelector<HTMLElement>('[data-network-fields]')!;
  const host = document.createElement('div');host.className = 'hf-room-invitation';
  host.innerHTML = `<details data-network-invite-pane open><summary hidden>Invitation details</summary><label>Room invitation<input data-network-invite maxlength="4096" autocomplete="off" spellcheck="false" placeholder="Paste your friend’s invite link or code"></label>
    <button type="button" data-network-import>Use invitation</button></details><button type="button" data-network-copy>Copy invitation</button>
    <p data-network-invite-status role="status" aria-live="polite"></p>`;
  fields.querySelector('[data-network-room-settings]')!.before(host);
  const code = host.querySelector<HTMLInputElement>('[data-network-invite]')!;
  const status = host.querySelector<HTMLElement>('[data-network-invite-status]')!;
  const pane = host.querySelector('details')!, importButton = host.querySelector<HTMLButtonElement>('[data-network-import]')!, copyButton = host.querySelector<HTMLButtonElement>('[data-network-copy]')!;
  const roomSettings = fields.querySelector<HTMLElement>('[data-network-room-settings]')!;
  roomSettings.append(copyButton);
  let active = false, disposed = false;
  const value = (name: string) => options.form.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  const importInvite = () => {
    if (active || disposed) return;
    try {
      const invite = readCombatInvite({ code: code.value, contentId: options.contentId });
      options.roomType.value = invite.roomType ?? 'combat-relay';
      options.roomType.element.dispatchEvent(new Event('change', { bubbles: true }));
      for (const name of ['endpoint', 'roomId', 'matchId'] as const) value(name).value = invite[name];
      const connection = options.form.querySelector<HTMLDetailsElement>('[data-network-connection-details]')!;
      value('token').value = '';connection.open = true;
      status.textContent = 'Invitation ready. Review the room, then join.';
      pane.open = false;pane.querySelector('summary')!.hidden = false;
      options.form.dispatchEvent(new Event('hosted-invite'));
      if (!connection.hidden) value('token').focus();
      else { status.textContent = 'Invitation ready. Join your friend’s room.';options.form.querySelector<HTMLButtonElement>('[type=submit]')!.focus(); }
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not read invitation.'; }
  };
  importButton.addEventListener('click', importInvite);
  const resetInvite = () => { code.value = '';status.textContent = ''; };
  options.form.addEventListener('hosted-new-room', resetInvite);
  copyButton.addEventListener('click', () => {
    try {
      const selected = options.roomType.value;
      const roomType = selected === 'tod-community' || selected === 'tod-training' ? selected : 'combat-relay';
      code.value = createCombatInvite({ endpoint: value('endpoint').value, roomId: value('roomId').value, matchId: value('matchId').value, contentId: options.contentId, roomType });
      if (options.origin && /^https?:\/\//.test(options.origin) && new URL(options.origin).host === new URL(value('endpoint').value).host) code.value = `${new URL(options.origin).origin}/#${code.value}`;
      const fallback = () => { pane.open = true;code.focus();code.select();status.textContent = 'Copy the invitation above and send it to your friend.'; };
      status.textContent = 'Copying invitation…';
      // Selection remains usable when clipboard permission is unavailable in a downloaded export.
      if (!navigator.clipboard) fallback();
      else void navigator.clipboard.writeText(code.value).then(() => { if (disposed) return;status.textContent = 'Invitation copied. Send it to your friend.';if (active) pane.open = false; }).catch(() => { if (!disposed) fallback(); });
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not create invitation.'; }
  });
  const openLink = () => { if (disposed || active || !location.hash.startsWith('#tod-room:')) return;code.value = location.hash.slice(1);options.onInvite?.();importInvite(); };
  window.addEventListener('hashchange', openLink);queueMicrotask(openLink);
  return {
    render(state: { active: boolean; shareHost?: HTMLElement; enabled: boolean }) {
      if (state.active !== active) { active = state.active;pane.open = !active;pane.querySelector('summary')!.hidden = !active;code.readOnly = active;importButton.hidden = active;copyButton.textContent = active ? 'Invite friend' : 'Copy invitation';status.textContent = ''; }
      const target = active && state.shareHost ? state.shareHost : fields;
      const copyHost = active ? host : roomSettings;if (copyButton.parentElement !== copyHost) copyHost.append(copyButton);
      if (host.parentElement !== target) {
        const before = target.querySelector('[data-community-battle], [data-training-partner], [data-network-room-settings]');
        if (target === options.form) fields.after(host);else if (before) target.insertBefore(host, before);else target.append(host);
      }
      host.hidden = active && !state.enabled;copyButton.disabled = !state.enabled;
    },
    dispose() { disposed = true;window.removeEventListener('hashchange', openLink);options.form.removeEventListener('hosted-new-room', resetInvite);copyButton.remove();host.remove(); },
  };
}
