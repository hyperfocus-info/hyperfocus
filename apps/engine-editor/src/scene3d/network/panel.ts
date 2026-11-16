import { attachGameModal } from '@hyperfocus/ui/game-menu';
import { createReplaySaveAction } from '../replay/save-action.ts';
import { attachOnlineEntry } from '../game-menu/online-entry';
import { roomProfileLabel } from './profile-label.ts';
import { createQuickPlayImageBlock } from './quick-play/image-block.ts';
import { roomUploadsEnabled, quickPlayCanEquip } from '../uploads/policy.ts';
import { createLiveImageReport } from '../uploads/live-report.ts';
import { attachHostedEntry } from './hosted/entry.ts';
import { attachRoomChoices } from './hosted/room-choices.ts';
import type { createCombatConnection } from './connection.ts';
import type { PublicProfile } from '@hyperfocus/touch-of-death/appearance/profile';
import { createTrainingPanel } from './training/panel.ts';
import type { TrainingCommand, TrainingRoomSnapshot } from '@hyperfocus/touch-of-death/training/protocol';
import { attachCombatInviteControls } from './invite-panel.ts';
import type { readCombatConnection } from './input.ts';
import { createCommunityRoomPanel, type CommunityPanelData } from './community-panel.ts';
import type { SocialCommand, SocialSnapshot } from '@hyperfocus/touch-of-death/network/social-protocol';
import { createQuickPlayPanel } from './quick-play/panel.ts';
import type { QuickPlayCommand, QuickPlayRoomSnapshot } from '@hyperfocus/touch-of-death/network/quick-play/protocol';
import { createRoomVoice } from './voice/runtime.ts';
import { createRoomVoicePanel } from './voice/panel.ts';
import type { VoiceCommand, VoiceReportCommand, VoiceSnapshot } from '@hyperfocus/touch-of-death/network/voice/protocol';
import { createRoomUploadsPanel } from '../uploads/panel.ts';
import type { UploadCommand, UploadResponse } from '@hyperfocus/touch-of-death/uploads/protocol';

/** Delivered-game session controls; credentials are never persisted or shared in URLs. */
export function createCombatConnectionPanel(options: {
  canvas: HTMLCanvasElement; contentId: string; hostedOrigin?: string; hasAppearance?: boolean;
  connect(details: Parameters<typeof readCombatConnection>[0]): Promise<void>;
  leave(): void; onInteract(): void;
  saveReplay?(): void | Promise<void>; reviewFight?(): void; shareReplay?(): void; practiceOffline?(): void; practiceWhileSearching?(): void; queueWarmup?(): boolean; stopWarmup?(): void;
  queue?(enabled: boolean): void; ready?(battleId: string): void;
  social?(command: SocialCommand): void;
  quickPlay?(command: QuickPlayCommand): void;
  training?(command: TrainingCommand): void;
  voice?(command: VoiceCommand | VoiceReportCommand): void;
  requestUpload?(command: UploadCommand): Promise<UploadResponse>;
  textureSlots?: readonly { id: string; label: string }[];
}) {
  const host = document.createElement('section');host.className = 'hf-network';
  host.innerHTML = `<button type="button" data-network-open>Play with friends</button><button type="button" data-network-quick>Online Quick Play</button>
    <div class="hf-network-live" hidden><span data-network-live-status></span><button type="button" data-network-save>Save replay</button><button type="button" data-network-leave>Leave bout</button></div>
    <dialog aria-labelledby="hf-network-title"><form data-network-connect>
      <div class="hf-network-title"><h2 id="hf-network-title">Play with friends</h2><button type="button" data-network-close aria-label="Close connection panel">Back</button></div>
      <p data-network-guidance>Join the same room to fight together. Your host supplies the connection details and a separate access token for each player.</p>
      <p data-network-social-rewards hidden>Play together: 25 coins per five active minutes, up to 100 per account each UTC day. Idle players and spectators do not earn; unfinished minutes reset when the room closes.</p>
      <p data-network-tab-help>Stay in this tab during fights; you have ten seconds to return if you switch. Share replays after the set.</p>
      <div data-network-fields>
      <fieldset data-network-choice="roomType"></fieldset>
      <fieldset data-network-choice="role" aria-describedby="hf-network-role-help"></fieldset>
      <small id="hf-network-role-help">Watch without taking a fighter seat. Choose Fight when you want to play.</small>
      <details data-network-room-settings><summary>Room settings</summary>
        <label>Room ID<input name="roomId" required maxlength="96" autocomplete="off" placeholder="Your host’s room ID"></label>
        <p data-network-profile-guidance>Your first visit copies your saved identity. Equipment uses this host’s collection; device unlocks stay on your device. An existing online fighter stays unchanged.</p>
      </details>
      <details data-network-connection-details><summary>Connection details</summary>
        <label>Server address<input name="endpoint" required autocomplete="off" placeholder="wss://your-host.example"></label>
        <label>Match ID<input name="matchId" required maxlength="96" autocomplete="off"></label>
        <label>Access token<input name="token" type="password" required maxlength="8192" autocomplete="off" spellcheck="false"></label>
        <label>Game version<input name="contentId" readonly aria-describedby="hf-network-content-help"></label>
        <small id="hf-network-content-help">Fighters, spectators and the host must use this game version. Access tokens stay in this session.</small>
      </details>
      </div>
      <p data-network-status role="status" aria-live="polite">No room joined.</p>
      <div class="hf-network-buttons"><button type="submit">Join room</button><button type="button" data-network-cancel hidden>Return to local play</button></div>
    </form></dialog>`;
  const style = document.createElement('style');style.textContent = `
    .hf-network{position:absolute;inset:0;pointer-events:none;z-index:12;font:14px/1.5 system-ui;color:#e9f1f5;color-scheme:dark}
    [data-network-active=true]>.playable-controls>button{display:none!important}
    .hf-network button,.hf-network dialog{pointer-events:auto}.hf-network button{font:inherit;cursor:pointer;border:1px solid #526676;border-radius:4px;background:#14232f;color:#e9f1f5;padding:10px 16px;min-height:44px}
    .hf-network button:hover{background:#263f4e}.hf-network button:focus-visible,.hf-network input:focus-visible,.hf-network summary:focus-visible{outline:2px solid #6adbdc;outline-offset:3px}.hf-network button:disabled{opacity:.5;cursor:pointer}
    .hf-network [data-network-open]{position:absolute;left:5%;top:calc(6% + 34px)}.hf-network [data-network-quick]{position:absolute;left:5%;top:calc(6% + 138px)}.hf-network [hidden]{display:none!important}
    .hf-network dialog{box-sizing:border-box;width:min(520px,calc(100vw - 24px));max-height:calc(100dvh - 32px);overflow:hidden;border:1px solid #526676;border-radius:8px;padding:24px;background:#101c28;color:#e9f1f5;box-shadow:0 20px 100px #0009}
    .hf-network dialog::backdrop{background:#040a12cc}.hf-network-title{display:flex;align-items:center;justify-content:space-between;gap:12px}.hf-network h2{font-size:26px;line-height:1.15;margin:0}.hf-network p{color:#bdccd7}.hf-network label{display:flex;flex-direction:column;gap:5px;margin:12px 0}.hf-network input{box-sizing:border-box;width:100%;min-width:0;padding:10px 12px;border:1px solid #526676;border-radius:4px;background:#080f17;color:#e9f1f5;font:inherit;min-height:44px}.hf-network input[readonly]{color:#91a8b8;font-size:12px}
    .hf-network details{border-top:1px solid #344653;margin-top:16px;padding-top:8px}.hf-network summary{cursor:pointer;padding:8px 0}.hf-network small{display:block;color:#91a8b8}.hf-network-buttons{display:flex;gap:8px;flex-wrap:wrap}.hf-network button[type=submit],.hf-network [data-network-cancel]{background:#ff694f;color:#130d0c;border-color:#ff694f;font-weight:700}
    .hf-network-live{box-sizing:border-box;position:absolute;left:16px;bottom:16px;display:flex;flex-wrap:wrap;align-items:center;gap:12px;background:#0c162bf5;border:1px solid #344653;border-radius:4px;padding:6px 8px;max-width:calc(100% - 32px);pointer-events:auto}.hf-network-live span{font-size:12px}.hf-network-live label{display:flex;align-items:center;gap:8px;margin:0;min-height:44px}.hf-network-live input[type=checkbox]{width:20px;min-width:20px;height:20px;min-height:20px;padding:0;margin:0;accent-color:#6adbdc}
    @media(max-width:600px){.hf-network [data-network-open]{padding:8px 10px;font-size:12px}.hf-network dialog{padding:18px}.hf-network-live{bottom:62px;left:8px;max-width:calc(100% - 16px);gap:8px}.hf-network-live button{padding:6px 10px}}
  `;
  style.textContent += `.hf-network form{display:flex;flex-direction:column;max-height:calc(100dvh - 82px)}.hf-network form>[data-network-fields]{overflow:auto;min-height:0;padding:0 4px}.hf-network form>.hf-network-buttons{flex-shrink:0;padding-top:12px;border-top:1px solid #344653}.hf-network form>p{flex-shrink:0;margin:8px 0}.hf-network p:empty{display:none}.hf-network .hf-network-title{flex-shrink:0}.hf-network .hf-room-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;border:0;padding:0;margin:12px 0}.hf-network .hf-room-choices legend{font-weight:700;margin-bottom:8px}.hf-network .hf-room-choices label{flex-direction:row;align-items:center;border:1px solid #526676;border-radius:4px;padding:8px;margin:0;min-height:44px;box-sizing:border-box;cursor:pointer}.hf-network .hf-room-choices label:has(:checked){background:#263f4e;border-color:#6adbdc}.hf-network .hf-room-choices label:focus-within{outline:2px solid #6adbdc;outline-offset:2px}.hf-network .hf-room-choices input{width:18px;min-height:18px;height:18px;flex-shrink:0;margin:0;accent-color:#6adbdc}.hf-network .hf-room-choices label:has(:disabled){opacity:.5;cursor:default}.hf-network .hf-room-invitation{margin:12px 0}.hf-network .hf-room-invitation>details{border:0;padding:0;margin:0}.hf-network .hf-room-invitation>button{margin-top:8px}.hf-network .hf-room-invitation p{margin:6px 0;font-size:12px}.hf-network .hf-room-invitation details[open]>summary{margin-bottom:6px}@media(max-width:600px){.hf-network form{max-height:calc(100dvh - 70px)}.hf-network .hf-room-choices{gap:6px}}`;
  host.append(style);options.canvas.parentElement?.append(host);
  host.querySelector<HTMLElement>('[data-network-profile-guidance]')!.hidden = !options.hasAppearance;
  const dialog = host.querySelector('dialog')!, form = host.querySelector('form')!;
  const open = host.querySelector<HTMLButtonElement>('[data-network-open]')!, close = host.querySelector<HTMLButtonElement>('[data-network-close]')!;
  const cancel = host.querySelector<HTMLButtonElement>('[data-network-cancel]')!, submit = host.querySelector<HTMLButtonElement>('[type=submit]')!;
  const status = host.querySelector<HTMLElement>('[data-network-status]')!, live = host.querySelector<HTMLElement>('.hf-network-live')!;
  const value = (name: string) => form.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  const { role, roomType } = attachRoomChoices({ form });
  const entry = attachOnlineEntry(form);
  const connectionDetails = form.querySelector<HTMLDetailsElement>('[data-network-connection-details]')!;
  const quickOpen = host.querySelector<HTMLButtonElement>('[data-network-quick]')!;
  let privateMatchId = '', previousRoomType = 'combat-relay', previousRoomId = '';
  const syncRoomType = () => {
    entry.render(false, roomType.value === 'tod-quick-play');
    const community = roomType.value === 'tod-community';
    const quick = roomType.value === 'tod-quick-play';
    const training = roomType.value === 'tod-training';
    if ((community || quick || training) && previousRoomType === 'combat-relay') privateMatchId = value('matchId').value;
    if (quick && previousRoomType !== 'tod-quick-play') previousRoomId = value('roomId').value;
    if (!quick && previousRoomType === 'tod-quick-play') value('roomId').value = previousRoomId;
    value('matchId').closest('label')!.hidden = community || quick || training;value('matchId').value = community ? 'community' : quick ? 'quick-play' : training ? 'training' : privateMatchId || (['community', 'training'].includes(value('matchId').value) ? '' : value('matchId').value);
    value('roomId').maxLength = community || training ? 64 : 96;
    role.element.hidden = quick || training;value('roomId').closest('label')!.hidden = quick;
    if (training) role.value = 'fighter';
    if (quick) { role.value = 'fighter';value('roomId').value = 'quick-play';value('matchId').value = 'quick-play';value('matchId').closest('label')!.hidden = true; }
    host.querySelector<HTMLElement>('#hf-network-role-help')!.textContent = community ? 'Fight joins the rotation queue. Watch stays in the room without queueing.' : 'Watch without taking a fighter seat. Choose Fight when you want to play.';
    if (training) host.querySelector<HTMLElement>('#hf-network-role-help')!.textContent = 'Train with one partner. Reset and side swaps require mutual agreement.';
    previousRoomType = roomType.value;
  };
  roomType.element.addEventListener('change', syncRoomType);
  const voiceRuntime = createRoomVoice({ send: command => { if (!options.voice) throw new Error('Voice is unavailable on this host.');options.voice(command); }, sendReport: command => { if (!options.voice) throw new Error('Voice reports are unavailable on this host.');options.voice(command); } });
  const communityPanel = createCommunityRoomPanel({ host, canvas: options.canvas, queue: options.queue, ready: options.ready, social: command => {
    if (command.type === 'social-mute' || command.type === 'social-block') voiceRuntime.preference(command.type === 'social-mute' ? 'mute' : 'block', command.targetId, command.enabled);
    if (command.type === 'social-block') uploadsPanel.block(command.targetId, command.enabled);
    options.social?.(command);
  }, leave: options.leave, onInteract: options.onInteract });
  const voicePanel = createRoomVoicePanel({ host: communityPanel.toolsHost, runtime: voiceRuntime, onInteract: options.onInteract });
  const uploadsPanel = createRoomUploadsPanel({ host: communityPanel.toolsHost, request: command => options.requestUpload ? options.requestUpload(command) : Promise.reject(new Error('Picture uploads are unavailable.')), onInteract: options.onInteract, textureSlots: options.textureSlots });
  const liveImages = document.createElement('label');liveImages.hidden = true;liveImages.innerHTML = '<input type="checkbox" data-upload-live-hide> Hide uploaded images';live.append(liveImages);
  const liveHide = liveImages.querySelector<HTMLInputElement>('input')!;liveHide.addEventListener('change', () => uploadsPanel.setHidden(liveHide.checked));
  const roomPictures = document.createElement('details');roomPictures.className = 'hf-room-pictures';roomPictures.hidden = true;
  roomPictures.innerHTML = '<summary>Pictures</summary><div data-room-picture-pane><p>Play continues while Pictures is open. You can change equipped images at any time.</p><div data-room-picture-targets aria-label="Choose fighter images"></div><button type="button" data-room-picture-close>Return to play</button></div>';
  const picturePane = roomPictures.querySelector<HTMLElement>('[data-room-picture-pane]')!, pictureTargets = roomPictures.querySelector<HTMLElement>('[data-room-picture-targets]')!;
  const pictureStyle = document.createElement('style');pictureStyle.textContent = '.hf-room-pictures{position:absolute;left:12px;bottom:110px;max-width:min(420px,calc(100% - 24px));background:#101c28;border:1px solid #526676;border-radius:8px;pointer-events:auto}.hf-room-pictures[hidden]{display:none}.hf-room-pictures>summary{padding:10px;cursor:pointer;min-height:44px}.hf-room-pictures [data-room-picture-pane]{padding:0 12px 12px;max-height:55dvh;overflow:auto}.hf-room-pictures p{font-size:12px;white-space:normal}.hf-room-pictures button{min-height:44px;margin:3px}.hf-room-pictures [aria-pressed=true]{outline:2px solid #65d9ff}';roomPictures.append(pictureStyle);host.append(roomPictures);
  roomPictures.querySelector<HTMLButtonElement>('[data-room-picture-close]')!.onclick = () => { roomPictures.open = false;options.canvas.focus({ preventScroll: true }); };
  let pictureFocusTimer: ReturnType<typeof setTimeout> | undefined;const pictureSummary = roomPictures.querySelector('summary')!;pictureSummary.addEventListener('click', () => { if (!roomPictures.open) return;clearTimeout(pictureFocusTimer);pictureFocusTimer = setTimeout(() => { if (!roomPictures.open && document.activeElement === pictureSummary && roomPictures.isConnected && !roomPictures.hidden) options.canvas.focus({ preventScroll: true }); }, 0); });
  let selectedPictureUser = '', pictureIdentity = '', pictureTargetKey = '';
  const quickImages = createQuickPlayImageBlock({ send: command => { if (!options.social) throw new Error('Image blocking is unavailable.');options.social(command); }, preference: uploadsPanel.block, onInteract: options.onInteract });
  const imageReport = createLiveImageReport({ request: command => options.requestUpload ? options.requestUpload(command) : Promise.reject(new Error('Image reports are unavailable.')), onInteract: options.onInteract, canvas: options.canvas, textureSlots: options.textureSlots });
  const quickPanel = createQuickPlayPanel({ host, canvas: options.canvas, send: command => { if (!options.quickPlay) throw new Error('Quick Play is unavailable.');options.quickPlay(command); }, saveReplay: options.saveReplay, reviewFight: options.reviewFight, shareReplay: options.shareReplay, practiceOffline: options.practiceOffline, practiceWhileSearching: options.practiceWhileSearching, queueWarmup: options.queueWarmup, stopWarmup: options.stopWarmup, leave: options.leave, onInteract: options.onInteract });
  const trainingPanel = createTrainingPanel({ host, canvas: options.canvas, send: command => { if (!options.training) throw new Error('Shared training is unavailable.');options.training(command); }, saveReplay: options.saveReplay, leave: options.leave, onInteract: options.onInteract });
  value('contentId').value = options.contentId;
  const saveReplay = host.querySelector<HTMLButtonElement>('[data-network-save]')!;
  saveReplay.hidden = !options.saveReplay;
  const replayDownload = createReplaySaveAction({ save: options.saveReplay, report(error) { inlineError = error; } });
  saveReplay.addEventListener('click', () => { options.onInteract();replayDownload.run(); });
  const invites = attachCombatInviteControls({ form, roomType, contentId: options.contentId, origin: options.hostedOrigin, onInvite() { open.click(); } });
  const hosted = options.hostedOrigin ? attachHostedEntry({ form, roomType, origin: options.hostedOrigin, contentId: options.contentId, changed() {
    if (dialog.open && document.activeElement?.matches('[name=roomType]')) form.querySelector<HTMLInputElement>('[name=roomType]:checked')?.focus();
  } }) : undefined;
  let joining = false, joinAttempt = 0;
  const syncJoining = () => { submit.disabled = joining || !!hosted?.checking;submit.textContent = joining ? 'Joining…' : hosted?.label ?? 'Join room';form.setAttribute('aria-busy', String(joining)); };
  let previousStatus = '', inlineError = '';
  const cancelJoin = () => { joinAttempt++;hosted?.cancel();if (joining) options.leave();joining = false;syncJoining();value('token').value = ''; };
  const modal = attachGameModal({ dialog, onRequestClose() { if (!cancel.hidden && !joining) { hosted?.cancel();options.leave(); }cancelJoin(); } });
  const dismiss = () => { value('token').value = '';modal.close();if (open.hidden) options.canvas.focus({ preventScroll: true }); };
  open.addEventListener('click', () => { options.onInteract();if (roomType.value === 'tod-quick-play') { roomType.value = [...roomType.options].find(option => !option.disabled && option.value !== 'tod-quick-play')?.value ?? 'combat-relay';roomType.element.dispatchEvent(new Event('change')); }entry.render(false, roomType.value === 'tod-quick-play');modal.open(form.querySelector<HTMLInputElement>('[name=roomType]:checked')!); });
  quickOpen.addEventListener('click', () => { options.onInteract();roomType.value = 'tod-quick-play';roomType.element.dispatchEvent(new Event('change'));connectionDetails.open = !hosted?.available;entry.render(false, true);modal.open(hosted?.available ? submit : value('endpoint')); });
  close.addEventListener('click', () => { cancelJoin();dismiss(); });

  form.addEventListener('input', () => { inlineError = ''; });
  form.addEventListener('invalid', event => { const target = event.target;if (target instanceof HTMLElement) { const details = target.closest('details');if (details) details.open = true; } }, true);
  form.addEventListener('submit', event => {
    event.preventDefault();options.onInteract();
    if (joining || hosted?.checking) return;
    inlineError = '';
    const attempt = ++joinAttempt;
    const details = { endpoint: value('endpoint').value, roomId: value('roomId').value, matchId: roomType.value === 'tod-community' ? 'community' : value('matchId').value, contentId: options.contentId, token: value('token').value, role: role.value === 'spectator' ? 'spectator' as const : 'fighter' as const, ...(roomType.value === 'tod-training' ? { roomType: 'tod-training' as const } : roomType.value === 'tod-community' ? { roomType: 'tod-community' as const } : roomType.value === 'tod-quick-play' ? { roomType: 'tod-quick-play' as const } : {}) };
    let getToken: (() => Promise<string>) | undefined;
    try { getToken = hosted?.prepare(details.endpoint); } catch (cause) { inlineError = cause instanceof Error ? cause.message : 'Review the host before joining.';status.textContent = inlineError;return; }
    value('token').value = '';joining = true;syncJoining();
    void options.connect({ ...details, ...(getToken ? { getToken } : {}) }).catch(cause => { if (attempt !== joinAttempt) return;inlineError = cause instanceof Error ? cause.message : 'Could not join this room.';status.textContent = inlineError; }).finally(() => { if (attempt === joinAttempt) { joining = false;syncJoining(); } });
  });
  for (const button of [cancel, host.querySelector<HTMLButtonElement>('[data-network-leave]')!]) button.addEventListener('click', () => { hosted?.cancel();options.leave();dismiss(); });
  return {
    get focused() { return dialog.open || !roomPictures.hidden && roomPictures.contains(document.activeElement) || imageReport.focused || quickImages.focused || communityPanel.focused || uploadsPanel.focused || quickPanel.focused || trainingPanel.focused || voicePanel.focused; },
    receiveVoice: voiceRuntime.receive,
    receiveVoiceReport: voiceRuntime.reportResult,
    invalidateUploads(ownerId: string) { uploadsPanel.invalidate(ownerId);imageReport.invalidate(ownerId); },
    uploadVisibility: () => uploadsPanel.visibility,
    voiceState: () => voiceRuntime.state,
    voiceStats: voiceRuntime.diagnostics,
    profileHost(roomType: string) {
      if (roomType === 'combat-relay' && dialog.open) return form;
      if (roomType === 'tod-quick-play') return quickPanel.customizationHost;
      if (roomType === 'tod-community') return communityPanel.toolsHost;
      if (roomType === 'tod-training') return trainingPanel.toolsHost;
      return host.querySelector<HTMLElement>('.hf-network-live');
    },
    render(state: Pick<ReturnType<typeof createCombatConnection>['state'], 'active' | 'status' | 'message' | 'frame' | 'confirmedFrame'> & { reconnecting?: boolean; voice?: VoiceSnapshot; role?: 'fighter' | 'spectator'; roomType?: 'combat-relay' | 'tod-community' | 'tod-quick-play' | 'tod-training'; training?: TrainingRoomSnapshot['training']; matchId?: string; matchSeats?: readonly string[]; roomImages?: {enabled:boolean;blockedUserIds:string[];error:string}; profileBindings?: Array<{playerId:string;userId:string}>; playerId?: string; community?: CommunityPanelData; social?: SocialSnapshot; quickPlay?: QuickPlayRoomSnapshot['quickPlay']; canSaveReplay?: boolean; profiles?: readonly PublicProfile[] }, menu: boolean) {
      const active = state.active;entry.render(active, (active ? state.roomType : roomType.value) === 'tod-quick-play');open.hidden = active || !menu;live.hidden = !active;
      quickOpen.hidden = active || !menu || !options.quickPlay;
      // Quick Play is a hosted player intent. Manual host setup remains in the invitation flow.
      quickOpen.dataset.menuUnavailable = String(!hosted?.available);
      quickOpen.dataset.menuUnavailableReason = hosted?.checking ? 'Checking online play…' : 'Quick Play is unavailable on this host. You can still join a friend’s room.';
      const community = state.roomType === 'tod-community';
      const quick = state.roomType === 'tod-quick-play';
      const training = state.roomType === 'tod-training';
      host.querySelector<HTMLElement>('[data-network-social-rewards]')!.hidden = !['combat-relay', 'tod-training'].includes(active ? state.roomType ?? 'combat-relay' : roomType.value) || (active ? state.role : role.value) === 'spectator';
      if (training || quick && state.quickPlay?.phase !== 'playing') live.hidden = true;
      host.querySelector<HTMLElement>('[data-network-leave]')!.textContent = quick ? 'Leave Quick Play' : community ? 'Leave room' : 'Leave bout';
      if (training) host.querySelector<HTMLElement>('[data-network-leave]')!.textContent = 'Leave training';
      const conceding = state.role !== 'spectator' && (quick && state.quickPlay?.phase === 'playing' || community && state.community?.phase === 'playing');
      if (conceding) host.querySelector<HTMLElement>('[data-network-leave]')!.textContent = 'Concede and leave';
      saveReplay.disabled = replayDownload.pending || !(state.canSaveReplay ?? state.confirmedFrame >= 0);
      const ended = state.status === 'interrupted' || state.status === 'desynced';
      const recovering = active && !ended && !!state.reconnecting;
      const connected = active && !ended && !recovering;
      dialog.dataset.canInvite = String(connected && !quick);
      voiceRuntime.update({ active: community && connected, playerId: state.playerId ?? '', voice: state.voice, muted: state.social?.muted });
      voicePanel.render({ active: community && connected && !!options.voice, profiles: state.profiles });
      const pictures = roomUploadsEnabled(state) && connected && !!options.requestUpload;
      const privatePictures = pictures && (training || state.roomType === 'combat-relay');
      const reporter = state.profileBindings?.find(binding => binding.playerId === state.playerId)?.userId ?? '';
      const fighterUsers = (state.matchSeats ?? []).flatMap(playerId => state.profileBindings?.find(binding => binding.playerId === playerId)?.userId ?? []);
      const identity = quick ? `${state.playerId}:${state.quickPlay?.matchId}:${state.quickPlay?.users.join(",")}` : `${state.playerId}:${state.roomType}:${state.matchId}:${fighterUsers.join(",")}`;
      const targets = fighterUsers.filter(userId => userId !== reporter);
      if (identity !== pictureIdentity || !privatePictures) { pictureIdentity = identity;selectedPictureUser = '';roomPictures.open = false; }
      if (!targets.includes(selectedPictureUser)) selectedPictureUser = targets.length === 1 ? targets[0]! : '';
      const targetKey = JSON.stringify([targets, state.profiles]);
      if (targetKey !== pictureTargetKey) { pictureTargetKey = targetKey;pictureTargets.replaceChildren();for (const userId of targets) { const button = document.createElement('button');button.type = 'button';button.dataset.roomPictureUser = userId;button.textContent = roomProfileLabel(userId, state.profiles);button.onclick = () => { options.onInteract();selectedPictureUser = userId; };pictureTargets.append(button); } }
      for (const button of pictureTargets.querySelectorAll<HTMLButtonElement>('button')) button.setAttribute('aria-pressed', String(button.dataset.roomPictureUser === selectedPictureUser));
      pictureTargets.hidden = targets.length < 2;roomPictures.hidden = !privatePictures;
      uploadsPanel.mount(privatePictures ? picturePane : quick ? quickPanel.customizationHost : communityPanel.toolsHost);
      uploadsPanel.render({ active: pictures, identity: community ? state.playerId : identity, visible: !quick || quickPlayCanEquip(state.quickPlay?.phase), localUserId: reporter, members: quick ? (state.quickPlay?.users ?? []).map(userId => ({ userId })) : privatePictures ? fighterUsers.map(userId => ({ userId })) : state.community?.members ?? [], blocked: quick ? state.quickPlay?.blockedUserIds : privatePictures ? state.roomImages?.blockedUserIds : state.social?.blocked, profiles: state.profiles, canEquip: privatePictures || (quick ? quickPlayCanEquip(state.quickPlay?.phase) : state.community?.phase === 'waiting') });
      const quickImageHost = privatePictures ? picturePane : quick && state.quickPlay?.phase === 'playing' ? live : quickPanel.customizationHost;
      if (quickImages.element.parentElement !== quickImageHost) quickImageHost.append(quickImages.element);
      quickImages.render({ active: pictures && (quick || privatePictures), localUserId: reporter, quickPlay: state.quickPlay, ...(privatePictures ? { target: { identity, userId: selectedPictureUser, blockedUserIds: state.roomImages?.blockedUserIds ?? [], error: state.roomImages?.error ?? '' } } : {}), profiles: state.profiles });
      if (imageReport.element.parentElement !== quickImageHost) quickImageHost.append(imageReport.element);
      const reportOwner = privatePictures ? selectedPictureUser : reporter && state.quickPlay?.users.includes(reporter) ? state.quickPlay.users.find(userId => userId !== reporter) ?? '' : '';
      const reportBlocked = privatePictures ? state.roomImages?.blockedUserIds ?? [] : state.quickPlay?.blockedUserIds ?? [];
      imageReport.render({ identity: privatePictures || pictures && quick && ['ready', 'playing', 'saving', 'result'].includes(state.quickPlay?.phase ?? '') ? identity : '', ownerId: reportOwner, blocked: reportBlocked.includes(reportOwner) || uploadsPanel.visibility.blocked.includes(reportOwner) });
      const hideHost = privatePictures ? picturePane : live;if (liveImages.parentElement !== hideHost) hideHost.append(liveImages);
      liveImages.hidden = !pictures || !privatePictures && (!quick || state.quickPlay?.phase !== 'playing');liveHide.checked = uploadsPanel.visibility.hidden;
      if (state.status === 'recovering') live.hidden = false;
      const watching = state.role === 'spectator';
      const explanation = state.message === 'The room interrupted this bout.' ? 'The connection to this bout was interrupted.' : watching && state.status === 'catching-up' ? 'Catching up to the bout…' : watching && ['watching', 'running'].includes(state.status) ? 'Watching fighter 1 vs fighter 2' : watching && state.status === 'waiting' ? 'Waiting for fighters. You will watch when the bout starts.' : state.message;
      host.querySelector<HTMLElement>('#hf-network-title')!.textContent = ended ? 'Online play interrupted' : active ? community ? 'Winner stays room' : watching ? 'Watch the bout' : 'Your private room' : 'Play with friends';
      host.querySelector<HTMLElement>('[data-network-fields]')!.hidden = active;
      host.querySelector<HTMLElement>('[data-network-guidance]')!.textContent = ended ? 'Return to local play. Check the message below before trying to reconnect.' : active ? community ? 'Join the queue or watch. Confirm Ready when your turn comes.' : watching ? 'Keep this tab open to watch. Spectating does not take a fighter seat.' : 'Keep this tab open. The bout starts when both players are connected.' : 'Join the same room to fight or watch together. Your host supplies the connection details and a separate access token for each person.';
      if (!active && hosted?.available) { host.querySelector<HTMLElement>('[data-network-guidance]')!.textContent = roomType.value === 'tod-quick-play' ? 'Find an opponent on this host.' : 'Create a room or join with a friend’s invitation.';host.querySelector<HTMLElement>('#hf-network-title')!.textContent = roomType.value === 'tod-quick-play' ? 'Online Quick Play' : 'Play with friends'; }
      if (training && active && !ended) { host.querySelector<HTMLElement>('#hf-network-title')!.textContent = 'Shared training';host.querySelector<HTMLElement>('[data-network-guidance]')!.textContent = 'Invite one partner to practice. Both players agree before a reset or side swap.'; }
      if (recovering) { host.querySelector<HTMLElement>('#hf-network-title')!.textContent = 'Reconnecting';host.querySelector<HTMLElement>('[data-network-guidance]')!.textContent = 'Keep this tab open while the host tries to restore your connection. Your place is reserved for up to ten seconds.'; }
      if (conceding && !recovering) host.querySelector<HTMLElement>('[data-network-guidance]')!.textContent = 'Leaving concedes the live bout. Switching tabs or losing connection allows ten seconds to return. Lobby members and spectators can stay connected in the background.';
      status.textContent = inlineError || (active ? explanation : '');host.querySelector<HTMLElement>('[data-network-live-status]')!.textContent = inlineError || explanation;
      submit.hidden = active;cancel.hidden = !active;close.hidden = active;cancel.textContent = conceding ? 'Concede and leave' : 'Return to local play';
      syncJoining();
      for (const name of ['endpoint', 'roomId', 'matchId', 'token']) value(name).disabled = active;
      role.disabled = active;
      roomType.disabled = active;
      if (state.status !== previousStatus) {
        if (!recovering && ['running', 'watching', 'catching-up'].includes(state.status)) { value('token').value = '';dismiss(); }
        if (ended) { if (!dialog.open) modal.open(cancel); }
        previousStatus = state.status;
      }
      if (community && active && state.community && !ended && !recovering && dialog.open) dismiss();
      if (state.roomType === 'tod-quick-play' && active && state.quickPlay && !ended && !recovering && dialog.open) dismiss();
      if (training && active && state.training && !ended && !recovering && dialog.open) dismiss();
      if (recovering && !dialog.open) modal.open(cancel);
      if (!recovering && !ended && ['running', 'watching', 'catching-up'].includes(state.status) && dialog.open) dismiss();
      communityPanel.render({ active: community && active && !ended, playerId: state.playerId, community: state.community, social: state.social, profiles: state.profiles });
      quickPanel.render({ active: state.roomType === 'tod-quick-play' && active && !ended, quickPlay: state.quickPlay, canSaveReplay: state.canSaveReplay, profiles: state.profiles, localUserId: reporter });
      trainingPanel.render({ active: training && active && !ended, training: state.training, matchId: state.matchId, localUserId: state.profileBindings?.find(binding => binding.playerId === state.playerId)?.userId, profiles: state.profiles, canSaveReplay: state.canSaveReplay });
      const shareHost = community ? communityPanel.invitationHost : training ? trainingPanel.invitationHost : dialog.open ? form : live;
      invites.render({ active, shareHost, enabled: !joining && !hosted?.checking && (!active || connected) && !quick });
    },
    dispose() { replayDownload.dispose();clearTimeout(pictureFocusTimer);invites.dispose();imageReport.dispose();quickImages.dispose();hosted?.dispose();uploadsPanel.dispose();voiceRuntime.dispose();voicePanel.dispose();communityPanel.dispose();quickPanel.dispose();trainingPanel.dispose();entry.dispose();modal.dispose();host.remove(); },
  };
}
