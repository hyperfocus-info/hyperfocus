import { createGameSelect } from '@hyperfocus/ui/game-menu';
import type { PublicProfile } from '@hyperfocus/touch-of-death/appearance/profile';
import { roomProfileLabel } from '../profile-label.ts';
import type { createRoomVoice } from './runtime.ts';

/** Voice controls are session-only; permission is requested only by Join voice. */
export function createRoomVoicePanel(options: { host: HTMLElement; runtime: ReturnType<typeof createRoomVoice>; onInteract(): void }) {
  const section = document.createElement('section');section.className = 'hf-voice';
  section.innerHTML = `<h3>Room voice</h3><p>Opt in to talk with this room. You join with your microphone muted. Voice is not recorded.</p><p data-voice-status role="status" aria-live="polite"></p><div class="hf-network-buttons"><button type="button" data-voice-join>Join voice</button><button type="button" data-voice-mute>Unmute mic</button><button type="button" data-voice-deafen>Deafen</button><button type="button" data-voice-retry>Enable audio</button><button type="button" data-voice-leave>Leave voice</button></div><p data-voice-network></p><ul data-voice-peers></ul><p data-voice-error role="alert"></p>`;
  const quick = document.createElement('button');quick.type = 'button';quick.dataset.voiceQuickMute = '';quick.className = 'hf-voice-quick';quick.hidden = true;
  const report = document.createElement('div');report.hidden = true;report.dataset.voiceReportForm = '';
  report.innerHTML = '<p data-voice-report-target></p><p>No audio is recorded or attached. The host saves a report; this does not confirm human review.</p><label>Reason <button type="button" data-voice-report-reason></button></label><div class="hf-network-buttons"><button type="button" data-voice-report-send>Send report</button><button type="button" data-voice-report-cancel>Close report</button></div><p data-voice-report-status role="status" aria-live="polite"></p>';
  section.append(report);
  const style = document.createElement('style');style.textContent = '.hf-voice{border-top:1px solid #526676;margin-top:16px;padding-top:8px}.hf-voice [data-voice-error]{color:#ffb4a8}.hf-voice ul{padding-left:20px;overflow-wrap:anywhere}.hf-network .hf-voice-quick{position:absolute;right:94px;bottom:16px;max-width:calc(100% - 112px);min-height:44px}.hf-voice button{min-height:44px}@media(max-width:600px){.hf-network .hf-voice-quick{right:82px;bottom:8px;max-width:calc(100% - 100px)}}';
  section.append(style);options.host.append(section);options.host.closest('.hf-network')?.append(quick);
  const find = <T extends HTMLElement>(key: string) => section.querySelector<T>(`[data-voice-${key}]`)!;
  const reportReasons = ['harassment', 'hate', 'threats', 'other'] as const;
  const reason = createGameSelect({ element: find<HTMLButtonElement>('report-reason'), ariaLabel: 'Voice report reason', options: reportReasons.map(value => ({ value, label: value[0]!.toUpperCase() + value.slice(1) })) });
  let signature = '';
  let reportTarget = '';
  function act(callback: () => void) { options.onInteract();callback(); }
  find('join').addEventListener('click', () => act(() => { void options.runtime.join(); }));
  const toggleMic = () => act(() => options.runtime.setMic(!options.runtime.state.mic));
  find('mute').addEventListener('click', toggleMic);quick.addEventListener('click', toggleMic);
  find('deafen').addEventListener('click', () => act(() => options.runtime.setDeafened(!options.runtime.state.deafened)));
  find('leave').addEventListener('click', () => act(() => options.runtime.leave()));
  find('retry').addEventListener('click', () => act(() => { void options.runtime.resumeAudio(); }));
  find('report-send').addEventListener('click', () => { const selectedReason = reportReasons.find(value => value === reason.value);if (selectedReason) act(() => options.runtime.sendReport(selectedReason)); });
  find('report-cancel').addEventListener('click', () => act(() => options.runtime.cancelReport()));
  return {
    render(input: { active: boolean; profiles?: readonly PublicProfile[] }) {
      section.hidden = !input.active;const state = options.runtime.state, joined = state.phase === 'joined', busy = state.phase === 'permission' || state.phase === 'joining';
      quick.hidden = !input.active || !joined;quick.disabled = state.deafened;quick.textContent = state.mic ? 'Mic live · Mute' : 'Mic muted · Unmute';
      find('join').hidden = joined || busy;find('leave').hidden = state.phase === 'off';find('leave').textContent = busy ? 'Cancel voice' : 'Leave voice';
      for (const key of ['mute', 'deafen', 'retry']) find(key).hidden = !joined;
      find<HTMLButtonElement>('mute').disabled = state.deafened;find('mute').textContent = state.mic ? 'Mute mic' : 'Unmute mic';
      find('deafen').textContent = state.deafened ? 'Undeafen' : 'Deafen';
      find('status').textContent = state.phase === 'permission' ? 'Waiting for microphone permission. You can cancel.' : state.phase === 'joining' ? 'Joining room voice…' : joined ? state.deafened ? 'Deafened: incoming audio and your microphone are muted. Undeafen, then explicitly unmute to speak.' : state.mic ? 'Your microphone is live.' : 'Your microphone is muted. Unmute when you want to speak.' : 'Voice is off. Room chat is still available.';
      find('network').textContent = state.localNetworkOnly ? 'This host has no STUN/TURN servers configured. Voice may only connect on the same local network.' : 'Voice uses this host’s connection servers. If a peer cannot connect, leave voice and join again.';
      find('error').textContent = state.error;
      const reporting = state.report;
      report.hidden = !input.active || !reporting?.enabled || !reporting.target;
      if (reporting?.target) {
        const target = `${reporting.target.playerId}:${reporting.target.sessionId}`;
        if (reportTarget !== target) { reportTarget = target;reason.value = 'harassment'; }
        find('report-target').textContent = `Report voice from ${roomProfileLabel(reporting.target.userId, input.profiles)}`;
        reason.disabled = reporting.busy || reporting.retry || reporting.saved;
        find<HTMLButtonElement>('report-send').disabled = reporting.busy || reporting.saved;
        find('report-send').textContent = reporting.retry ? 'Retry report' : 'Send report';
        find('report-status').textContent = reporting.error || (reporting.saved ? 'Report saved by the host. No audio was recorded.' : reporting.busy ? 'Waiting for the host to save your report...' : 'Choose a reason, then send.');
      } else reportTarget = '';
      const next = JSON.stringify([state.peers, input.profiles, reporting?.enabled]);
      if (signature !== next) {
        signature = next;find('peers').replaceChildren(...state.peers.map(peer => { const row = document.createElement('li');row.title = peer.userId;row.textContent = `${roomProfileLabel(peer.userId, input.profiles)} · ${peer.muted ? 'Muted for you' : peer.status}${peer.error ? ` · ${peer.error}` : ''}`;
          if (reporting?.enabled) { const button = document.createElement('button');button.type = 'button';button.dataset.voiceReport = peer.playerId;button.textContent = 'Report voice';button.addEventListener('click', () => act(() => options.runtime.reportPeer(peer.playerId)));row.append(button); }
          return row; }));
      }
    },
    get focused() { return reason.focused || section.contains(document.activeElement) || document.activeElement === quick; },
    dispose() { reason.dispose();section.remove();quick.remove(); },
  };
}
