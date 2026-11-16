import { readVoiceReportResult, type VoiceReportCommand } from '@hyperfocus/touch-of-death/network/voice/protocol';
type Target = { playerId: string; userId: string; sessionId: string };
/** One bounded, session-scoped report; audio never enters this controller. */
export function createVoiceReportClient(options: { send?(command: VoiceReportCommand): void; now?: () => number }) {
  let context = '', sessionId = '', enabled = false, peers: readonly Target[] = [];
  let target: Target | undefined, command: VoiceReportCommand | undefined, busy = false, deadline = 0, saved = false, error = '';
  const now = options.now ?? Date.now;
  function cancel() { target = undefined;command = undefined;busy = false;saved = false;error = ''; }
  return {
    update(input: { playerId: string; sessionId: string; enabled: boolean; peers: readonly Target[] }) {
      const next = JSON.stringify([input.playerId, input.sessionId]);
      if (next !== context || !input.enabled) cancel();
      context = next;sessionId = input.sessionId;enabled = input.enabled && !!options.send && !!sessionId;peers = input.peers;
      if (target && peers.some(peer => peer.playerId === target!.playerId && peer.sessionId !== target!.sessionId)) cancel();
    },
    select(playerId: string) { if (!enabled) return;const peer = peers.find(peer => peer.playerId === playerId);if (!peer) return;cancel();target = { ...peer }; },
    send(reason: VoiceReportCommand['reason']) {
      if (!enabled || !target || busy || saved) return;
      if (!command) command = { type: 'voice-report', requestId: crypto.randomUUID(), sessionId, targetPlayerId: target.playerId, targetSessionId: target.sessionId, reason };
      busy = true;deadline = now() + 10000;error = '';
      try { options.send!({ ...command }); } catch { busy = false;error = 'Report could not be sent. Retry to send the same report.'; }
    },
    receive(value: unknown) {
      let result: ReturnType<typeof readVoiceReportResult>;try { result = readVoiceReportResult(value); } catch { return; }
      if (!enabled || !command || saved || result.requestId !== command.requestId) return;
      busy = false;error = result.error ? 'The host could not save this report. Retry.' : '';saved = !result.error;
    },
    cancel,
    get state() {
      if (busy && now() >= deadline) { busy = false;error = 'No confirmation yet. Retry to check the same report.'; }
      return { enabled, target: target ? { ...target } : undefined, busy, saved, error, retry: !!command && !saved, reason: command?.reason };
    },
  };
}
