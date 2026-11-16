import { createGuestCredentials, discoverHostedDemo, type HostedDemo } from './discovery.ts';
import { createRecoveryPanel } from './recovery-panel.ts';
import type { attachRoomChoices } from './room-choices.ts';

/** Deployment-owned guest affordances around the existing portable invitation form. */
export function attachHostedEntry(options: { form: HTMLFormElement; roomType: ReturnType<typeof attachRoomChoices>['roomType']; origin: string; contentId: string; changed(): void }) {
  const { form, roomType } = options, lifetime = new AbortController();
  let host: HostedDemo | undefined, manual = false, pending: AbortController | undefined, disposed = false, roomEdited = false, checking = true;
  const field = (name: string) => form.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  let destinationIntent: 'default' | 'manual' | 'invitation' = field('endpoint').value ? 'manual' : 'default';
  const details = form.querySelector<HTMLDetailsElement>('[data-network-connection-details]')!;
  const settings = form.querySelector<HTMLDetailsElement>('[data-network-room-settings]')!;
  const box = document.createElement('div');box.innerHTML = `<p data-guest-status role="status">Checking online play…</p><p data-guest-help hidden>Guest profile saved in this browser. Clearing browser data or letting guest access expire loses access.</p><div class="hf-network-buttons"><button type="button" data-guest-create hidden>Create room</button><button type="button" data-guest-retry hidden>Retry online play</button><button type="button" data-guest-manual hidden>Use another host</button></div>`;
  form.querySelector('[data-network-fields]')!.prepend(box);
  settings.append(box.querySelector('[data-guest-help]')!, box.querySelector('.hf-network-buttons')!);
  const find = (key: string) => form.querySelector<HTMLElement>(`[data-guest-${key}]`)!;
  const recovery = createRecoveryPanel({ parent: form.querySelector<HTMLElement>('[data-network-fields]')!, changed: options.changed });
  const label = () => {
    if (checking) return 'Checking host…';
    if (!host || manual) return 'Join room';
    const action = roomType.value === 'tod-quick-play' ? 'enter Quick Play' : destinationIntent === 'invitation' ? 'join room' : 'create room';
    return host.clerkPublishableKey ? `Sign in to ${action}` : action[0]!.toUpperCase() + action.slice(1);
  };
  function sync() {
    const enabled = !!host && !manual;
    if (enabled && !checking) find('status').textContent = destinationIntent === 'invitation' ? 'Invitation ready. Review the room, then join.'
      : roomType.value === 'tod-quick-play' ? 'Enter Quick Play to search for an opponent on this host.'
      : roomType.value === 'tod-training' ? 'Create a shared training room, then invite one partner.'
      : roomType.value === 'tod-community' ? 'Create a winner-stays room, then invite friends to fight or watch.'
      : 'Create a private set, then share its invitation with a friend.';
    recovery.setHost(enabled ? host : undefined);
    details.hidden = enabled;field('token').required = !enabled;field('endpoint').required = !enabled;
    find('help').hidden = !enabled;find('create').hidden = !enabled || roomType.value === 'tod-quick-play';find('manual').hidden = !host;
    find('help').textContent = host?.clerkPublishableKey ? 'Sign in to keep your fighter, rewards and rating across devices.' : host?.recoveryPath ? 'Guest access is saved in this browser. Save and activate a recovery key below to keep access if browser data is lost.' : 'Guest profile saved in this browser. Clearing browser data or letting guest access expire loses access.';
    find('manual').textContent = manual ? 'Use this game host' : 'Use another host';
    const submit = form.querySelector<HTMLButtonElement>('[type=submit]')!;
    if (form.getAttribute('aria-busy') !== 'true') { submit.textContent = label();submit.disabled = checking; }
    if (enabled) {
      field('token').value = '';
      if (roomType.value === 'combat-relay' && destinationIntent !== 'invitation') field('matchId').value = host!.matchId;
      for (const option of roomType.options) option.disabled = !host!.roomTypes.some(type => type === option.value);
      if (!host!.roomTypes.some(type => type === roomType.value)) { roomType.value = host!.roomTypes[0]!;roomType.element.dispatchEvent(new Event('change')); }
    } else for (const option of roomType.options) option.disabled = false;
  }
  async function discover() {
    checking = true;
    find('retry').hidden = true;find('status').textContent = 'Checking online play…';
    try {
      const result = await discoverHostedDemo({ origin: options.origin, contentId: options.contentId, signal: lifetime.signal });
      if (disposed) return;host = result;
      if (host) {
        if (destinationIntent === 'default' && !manual) field('endpoint').value = host.endpoint;
        else manual = destinationIntent === 'manual' || field('endpoint').value !== host.endpoint;
      }
      if (host && !manual && !roomEdited && destinationIntent === 'default' && host.roomTypes.includes('combat-relay')) { roomType.value = 'combat-relay';roomType.element.dispatchEvent(new Event('change')); }
      find('status').textContent = host ? 'Create a private set, then share its invitation with a friend.' : 'Online matchmaking is unavailable here. You can join another host with an invitation and access token.';
      if (host && !field('roomId').value) field('roomId').value = `room-${crypto.randomUUID()}`;
    } catch (error) { if (disposed) return;find('status').textContent = error instanceof Error ? error.message : 'Online play is unavailable.';find('retry').hidden = false; }
    checking = false;sync();if (host && !manual) form.querySelector<HTMLElement>('[data-network-guidance]')!.textContent = 'Create a room or join with a friend’s invitation.';options.changed();
  }
  find('create').textContent = 'New room';
  find('create').addEventListener('click', () => { destinationIntent = 'default';field('roomId').value = `room-${crypto.randomUUID()}`;field('roomId').focus();find('status').textContent = 'New room selected. Create it to invite a friend.';form.dispatchEvent(new Event('hosted-new-room'));sync(); });
  find('retry').addEventListener('click', () => { void discover(); });
  find('manual').addEventListener('click', () => { manual = !manual;destinationIntent = manual ? 'manual' : 'default';field('token').value = '';if (!manual && host) field('endpoint').value = host.endpoint;sync();details.open = manual; });
  roomType.element.addEventListener('change', () => { roomEdited = true;sync(); });
  details.addEventListener('input', () => { destinationIntent = 'manual';manual = true; });
  form.addEventListener('hosted-invite', () => {
    destinationIntent = 'invitation';
    if (!host) return;
    manual = field('endpoint').value !== host.endpoint;
    sync();details.open = manual;
    find('status').textContent = manual ? 'This invitation uses another host. Review its address and supply that host’s access token.' : 'Invitation ready. Join to play.';
  });
  void discover();
  return {
    get checking() { return checking; },
    get label() { return label(); },
    get available() { return !!host && !manual; },
    prepare(endpoint: string) {
      if (!host || manual) return undefined;
      if (endpoint !== host.endpoint) throw new Error('Review this invitation’s host before joining.');
      if (recovery.busy) throw new Error('Finish the recovery action before joining a room.');
      recovery.cancel();
      pending?.abort();pending = new AbortController();
      return createGuestCredentials({ host, signal: AbortSignal.any([lifetime.signal, pending.signal]) });
    },
    cancel() { pending?.abort();pending = undefined;recovery.cancel(); },
    dispose() { disposed = true;lifetime.abort();pending?.abort();recovery.dispose();box.remove(); },
  };
}
