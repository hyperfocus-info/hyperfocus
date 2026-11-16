import { voiceBrowser, type VoiceBrowser, type VoicePeer, type VoiceStream } from './browser.ts';
import type { VoiceCommand, VoiceSignal, VoiceSnapshot } from '@hyperfocus/touch-of-death/network/voice/protocol';
import type { VoiceReportCommand } from '@hyperfocus/touch-of-death/network/voice/protocol';
import { createVoiceReportClient } from './report-client.ts';

type Peer = { playerId: string; userId: string; sessionId: string; pc: VoicePeer; audio: HTMLAudioElement; candidates: RTCIceCandidateInit[]; chain: Promise<void>; error: string; restarted: boolean };

/** Opt-in audio is independent of fighter seats and never enters combat recordings. */
export function createRoomVoice(options: { send(command: VoiceCommand): void; sendReport?(command: VoiceReportCommand): void; browser?: VoiceBrowser; iceServers?: RTCIceServer[] }) {
  const reports = createVoiceReportClient({ send: options.sendReport });
  const browser = options.browser ?? voiceBrowser, peers = new Map<string, Peer>();
  // Identity is this mounted room client plus the admitted session. Generation fences
  // pending capture/peer work across leave, room changes and disposal.
  let generation = 0, active = false, playerId = '', voice: VoiceSnapshot | undefined, stream: VoiceStream | undefined;
  let phase: 'off' | 'permission' | 'joining' | 'joined' = 'off', error = '', requestId = '', mic = false, deafened = false;
  let micRequest = '', sessionId = '';
  let abandoned: { playerId: string; sessionId: string; attempts: number } | undefined;
  let muted = new Set<string>(), timer: ReturnType<typeof setTimeout> | undefined;
  const pendingSignals: VoiceSignal[] = [], blocked = new Set<string>();
  const failedPeers = new Set<string>();
  const localMutes = new Map<string, boolean>(), cancelledJoins = new Set<string>();
  function closePeer(peer: Peer) { peers.delete(peer.playerId);peer.pc.close();peer.audio.pause();peer.audio.srcObject = null;peer.audio.remove(); }
  function leave(notify = true) {
    reports.update({ playerId: '', sessionId: '', enabled: false, peers: [] });
    if (phase === 'joining' && requestId) { cancelledJoins.add(requestId);if (cancelledJoins.size > 8) cancelledJoins.delete(cancelledJoins.values().next().value!); }
    generation++;clearTimeout(timer);timer = undefined;pendingSignals.length = 0;failedPeers.clear();
    if (notify && active && sessionId) { try { options.send({ type: 'voice-leave', sessionId }); } catch {} }
    for (const peer of [...peers.values()]) closePeer(peer);
    stream?.getTracks().forEach(track => track.stop());stream = undefined;mic = false;deafened = false;phase = 'off';requestId = '';sessionId = '';micRequest = '';
  }
  const current = (peer: Peer, attempt: number) => generation === attempt && peers.get(peer.playerId) === peer && phase === 'joined';
  function signal(peer: Peer, kind: VoiceSignal['kind'], data: string) {
    if (!voice?.sessionId) return;
    options.send({ type: 'voice-signal', sessionId: voice.sessionId, targetPlayerId: peer.playerId, targetSessionId: peer.sessionId, kind, data });
  }
  function enqueue(peer: Peer, work: (attempt: number) => Promise<void>) {
    const attempt = generation;
    peer.chain = peer.chain.then(async () => { if (current(peer, attempt)) await work(attempt); }).catch(() => {
      if (current(peer, attempt)) peer.error = 'Voice connection failed. Leave voice and join again to retry.';
    });
  }
  async function offer(peer: Peer, attempt: number, restart = false) {
    const description = await peer.pc.createOffer({ iceRestart: restart });if (!current(peer, attempt)) return;
    await peer.pc.setLocalDescription(description);if (current(peer, attempt)) signal(peer, 'offer', description.sdp ?? '');
  }
  function playback(peer: Peer) { peer.audio.muted = deafened || muted.has(peer.userId); }
  function makePeer(member: VoiceSnapshot['peers'][number]) {
    const pc = browser.peer({ iceServers: voice?.iceServers ?? options.iceServers ?? [], iceTransportPolicy: voice?.iceTransportPolicy ?? 'all' }), audio = browser.audio();
    const peer: Peer = { ...member, pc, audio, candidates: [], chain: Promise.resolve(), error: '', restarted: false };peers.set(member.playerId, peer);
    pc.addStream(stream!);
    const attempt = generation;playback(peer);
    pc.onicecandidate = event => { if (event.candidate && current(peer, attempt)) { try { signal(peer, 'ice', JSON.stringify(event.candidate.toJSON())); } catch { peer.error = 'Voice signaling was interrupted.'; } } };
    pc.ontrack = event => {
      if (!current(peer, attempt) || event.track.kind !== 'audio') return;
      audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);playback(peer);
      void audio.play().catch(() => { if (current(peer, attempt)) peer.error = 'Audio playback is paused by your browser. Use Enable audio.'; });
    };
    pc.onconnectionstatechange = () => {
      if (!current(peer, attempt)) return;
      if (pc.connectionState === 'connected') peer.error = '';
      if (pc.connectionState === 'failed') {
        peer.error = 'Could not connect voice. This host may need a TURN relay for your network.';
        if (playerId < peer.playerId && !peer.restarted) { peer.restarted = true;enqueue(peer, token => offer(peer, token, true)); }
      }
    };
    if (playerId < peer.playerId) enqueue(peer, token => offer(peer, token));
  }
  function syncPeers() {
    if (phase !== 'joined' || !voice) return;
    const allowed = voice.peers.filter(member => member.playerId !== playerId && !blocked.has(member.userId));
    for (const peer of [...peers.values()]) if (!allowed.some(member => member.playerId === peer.playerId && member.sessionId === peer.sessionId)) closePeer(peer);
    for (const member of allowed) if (!peers.has(member.playerId) && !failedPeers.has(member.sessionId)) {
      try { makePeer(member); } catch { const peer = peers.get(member.playerId);if (peer) closePeer(peer);failedPeers.add(member.sessionId);error = 'Your browser could not start voice. Leave voice and try again.'; }
    }
    for (const peer of peers.values()) playback(peer);
  }
  const api = {
    get state() { return { phase, mic, deafened, error, report: reports.state, localNetworkOnly: !(voice?.iceServers.length || options.iceServers?.length), peers: [...peers.values()].map(peer => ({ playerId: peer.playerId, userId: peer.userId, status: peer.pc.connectionState, muted: peer.audio.muted, error: peer.error })) }; },
    reportPeer: reports.select,
    sendReport: reports.send,
    cancelReport: reports.cancel,
    reportResult: reports.receive,
    async join() {
      if (!active || phase !== 'off') return;
      if (abandoned) { error = 'Your previous voice session is still closing. Leave the room and rejoin before joining voice.';return; }
      const attempt = ++generation;phase = 'permission';error = '';mic = false;deafened = false;
      try {
        const captured = await browser.capture();captured.getTracks().forEach(track => { track.enabled = false; });
        if (attempt !== generation || !active) { captured.getTracks().forEach(track => track.stop());return; }
        if (!captured.getAudioTracks().length) { captured.getTracks().forEach(track => track.stop());throw new Error('No microphone track is available.'); }
        stream = captured;
        for (const track of captured.getAudioTracks()) track.addEventListener('ended', () => {
          if (attempt !== generation || stream !== captured) return;
          leave();error = 'Your microphone disconnected or its permission was revoked. Reconnect it, then join voice again.';
        }, { once: true });
        requestId = crypto.randomUUID();phase = 'joining';options.send({ type: 'voice-join', requestId });
        timer = setTimeout(() => { if (attempt === generation && phase === 'joining') { leave();error = 'Voice did not join. Try again.'; } }, 12000);
      } catch (cause) { if (attempt === generation) { leave();error = cause instanceof Error ? cause.message : 'Microphone permission was not granted. You can still use room chat.'; } }
    },
    leave,
    setMic(enabled: boolean) {
      if (phase !== 'joined' || !voice?.sessionId || enabled && deafened) return;
      if (!enabled) { mic = false;stream?.getAudioTracks().forEach(track => { track.enabled = false; }); }
      micRequest = crypto.randomUUID();
      try { options.send({ type: 'voice-mic', sessionId: voice.sessionId, requestId: micRequest, enabled });error = ''; }
      catch { error = 'Could not change your microphone. Try again.'; }
    },
    setDeafened(enabled: boolean) { if (enabled) { api.setMic(false);mic = false;stream?.getAudioTracks().forEach(track => { track.enabled = false; }); }deafened = enabled;for (const peer of peers.values()) playback(peer); },
    preference(kind: 'mute' | 'block', userId: string, enabled: boolean) {
      if (kind === 'mute') localMutes.set(userId, enabled);
      const target = kind === 'block' ? blocked : muted;enabled ? target.add(userId) : target.delete(userId);
      if (kind === 'block') syncPeers();else for (const peer of peers.values()) playback(peer);
    },
    async resumeAudio() { for (const peer of peers.values()) { try { await peer.audio.play();peer.error = ''; } catch { peer.error = 'Your browser is still preventing voice playback.'; } } },
    update(input: { active: boolean; playerId: string; voice?: VoiceSnapshot; muted?: readonly string[] }) {
      if (playerId !== input.playerId) { abandoned = undefined;cancelledJoins.clear(); }
      else if (!input.active && sessionId) abandoned = { playerId, sessionId, attempts: 0 };
      if (!input.active || active && playerId !== input.playerId) { leave(false);localMutes.clear();blocked.clear(); }
      active = input.active;playerId = input.playerId;muted = new Set(input.muted ?? []);
      for (const [userId, enabled] of localMutes) enabled ? muted.add(userId) : muted.delete(userId);
      if (!active) { voice = undefined;return; }
      voice = input.voice;
      if (abandoned) {
        if (voice && voice.sessionId !== abandoned.sessionId) abandoned = undefined;
        else if (voice?.sessionId === abandoned.sessionId && abandoned.attempts < 5) {
          abandoned.attempts++;
          try { options.send({ type: 'voice-leave', sessionId: abandoned.sessionId });abandoned = undefined; }
          catch { error = 'Could not close your previous voice session. Leave the room and rejoin if this persists.'; }
        }
        if (abandoned) return;
      }
      if (voice?.sessionId && cancelledJoins.has(voice.requestId)) {
        try { options.send({ type: 'voice-leave', sessionId: voice.sessionId });cancelledJoins.delete(voice.requestId); } catch {}
        return;
      }
      if (phase === 'joining' && voice?.requestId === requestId) {
        clearTimeout(timer);
        if (voice.error || !voice.sessionId) { const reason = voice.error || 'Voice admission failed.';leave(false);error = reason;return; }
        phase = 'joined';sessionId = voice.sessionId;
      }
      if (phase === 'joined' && (!voice?.sessionId || voice.sessionId !== sessionId)) { leave(false);error = 'Voice ended. Join again when ready.';return; }
      if (phase === 'joined' && micRequest && voice?.requestId === micRequest) {
        micRequest = '';error = voice.error;mic = !voice.error && voice.mic && !deafened;stream?.getAudioTracks().forEach(track => { track.enabled = mic; });
      }
      syncPeers();
      reports.update({ playerId, sessionId, enabled: phase === 'joined' && !!voice?.reportingEnabled, peers: voice?.peers.filter(peer => peer.playerId !== playerId) ?? [] });
      if (phase === 'joined') for (const queued of pendingSignals.splice(0)) api.receive(queued);
    },
    receive(signalValue: VoiceSignal) {
      if (phase === 'joined' && signalValue.targetSessionId !== voice?.sessionId) return;
      const peer = peers.get(signalValue.fromPlayerId);
      if (phase === 'joining' || phase === 'joined' && !peer) { if (pendingSignals.length < 64) pendingSignals.push(signalValue);return; }
      if (!peer || phase !== 'joined' || signalValue.sessionId !== peer.sessionId || signalValue.targetSessionId !== voice?.sessionId) return;
      enqueue(peer, async attempt => {
        if (signalValue.kind === 'ice') {
          const candidate: RTCIceCandidateInit = JSON.parse(signalValue.data || '{}');
          if (!peer.pc.remoteDescription) { if (peer.candidates.length >= 64) throw new Error('Too many voice candidates.');peer.candidates.push(candidate); }
          else await peer.pc.addIceCandidate(candidate);
          return;
        }
        if (signalValue.kind === 'offer' && playerId < peer.playerId || signalValue.kind === 'answer' && playerId > peer.playerId) return;
        const media = signalValue.data.split(/\r?\n/).filter(line => line.startsWith('m='));
        if (media.length !== 1 || !/^m=audio[ \t]/.test(media[0]!)) throw new Error('Room voice accepts one audio stream only.');
        await peer.pc.setRemoteDescription({ type: signalValue.kind, sdp: signalValue.data });if (!current(peer, attempt)) return;
        for (const candidate of peer.candidates.splice(0)) { await peer.pc.addIceCandidate(candidate);if (!current(peer, attempt)) return; }
        if (signalValue.kind === 'offer') {
          const answer = await peer.pc.createAnswer();if (!current(peer, attempt)) return;
          await peer.pc.setLocalDescription(answer);if (current(peer, attempt)) signal(peer, 'answer', answer.sdp ?? '');
        }
      });
    },
    async diagnostics() {
      const reports = await Promise.all([...peers.values()].map(async peer => {
        const stats = await peer.pc.getStats(), audio: Record<string, unknown>[] = [];
        stats.forEach(report => { if (['inbound-rtp', 'outbound-rtp', 'media-source'].includes(report.type) && (report.kind === 'audio' || report.mediaType === 'audio')) audio.push({ type: report.type, packetsReceived: report.packetsReceived, packetsSent: report.packetsSent, bytesReceived: report.bytesReceived, totalAudioEnergy: report.totalAudioEnergy, audioLevel: report.audioLevel }); });
        return { playerId: peer.playerId, userId: peer.userId, status: peer.pc.connectionState, playbackMuted: peer.audio.muted, playbackPaused: peer.audio.paused, audio };
      }));
      return { phase, mic, deafened, tracks: stream?.getTracks().map(track => ({ enabled: track.enabled, readyState: track.readyState, kind: track.kind })) ?? [], peers: reports };
    },
    dispose() { leave(false);abandoned = undefined;cancelledJoins.clear();active = false; },
  };
  return api;
}
