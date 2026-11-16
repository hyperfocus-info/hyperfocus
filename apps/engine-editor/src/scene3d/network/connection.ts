import { roomUploadsEnabled, quickPlayCanEquip } from '../uploads/policy.ts';
import { createRewardClient } from '../rewards/client.ts';
import { captureReplayAppearance, type ReplayAppearance } from '../replay/appearance.ts';
import { decisiveReplayFrame } from '../replay/bookmark.ts';
import { readFriendRivalryScope } from './rivalry.ts';
import { connectAuthoritative, type AuthoritativeClient, type AuthoritativeSession } from '@hyperfocus/engine/net';
import { combatRoomInputCodec, type CombatRoomSnapshot } from '@hyperfocus/engine/combat/net';
import { emptyProfileMetadata, profileCombatSnapshotSchema, profileProtocolVersion, readProfileMetadata, readProfileCommand, type PublicProfile } from '@hyperfocus/touch-of-death/appearance/profile';
import type { createNetworkCombatSession, createNetworkCombatSpectator } from '@hyperfocus/engine/project/runtime-3d';
import { readCombatConnection } from './input.ts';
import { communityProtocolVersion, communityRoomSnapshotSchema, readCommunitySnapshot, type CommunityRoomSnapshot } from '@hyperfocus/touch-of-death/network/community-protocol';
import { quickPlayProtocolVersion, quickPlayRoomSnapshotSchema, readQuickPlayCommand, readQuickPlaySnapshot, type QuickPlayRoomSnapshot } from '@hyperfocus/touch-of-death/network/quick-play/protocol';
import { readSocialCommand, type SocialCommand, type SocialSnapshot } from '@hyperfocus/touch-of-death/network/social-protocol';
import { trainingProtocolVersion, trainingRoomSnapshotSchema, readTrainingSnapshot, readTrainingCommand, type TrainingRoomSnapshot } from '@hyperfocus/touch-of-death/training/protocol';
import { readVoiceCommand, readVoiceSignal, readVoiceReportCommand, readVoiceReportResult, type VoiceReportResult, type VoiceSignal, type VoiceSnapshot } from '@hyperfocus/touch-of-death/network/voice/protocol';
import { readUploadCommand, readUploadResponse, readUploadInvalidation, type UploadResponse } from '@hyperfocus/touch-of-death/uploads/protocol';

type NetworkSession = ReturnType<typeof createNetworkCombatSession>;
type SpectatorSession = ReturnType<typeof createNetworkCombatSpectator>;
type ConnectionDetails = Parameters<typeof readCombatConnection>[0];

/** Owns one connection attempt and ignores late callbacks from a departed room. */
export function createCombatConnection(options: {
  createSession(match: CombatRoomSnapshot, localPeerId: string, send: (input: unknown) => void, mode?: 'set' | 'training'): NetworkSession;
  createSpectator?(match: CombatRoomSnapshot, onCursor: (cursor: { frame: number }) => void): SpectatorSession;
  onChange(): void; onLeave(): void;
  onBattleEnd?(terminal?: boolean): void;
  validateProfiles?(profiles: readonly PublicProfile[]): void;
  transport?: (details: ConnectionDetails) => AuthoritativeClient<CombatRoomSnapshot>;
}) {
  let client: AuthoritativeClient<CombatRoomSnapshot> | undefined, session: NetworkSession | SpectatorSession | undefined;
  let generation = 0, active = false, status = 'offline', message = 'Invite a friend for a private bout.';
  let shareCredentials: ConnectionDetails | undefined;
  let rivalryScope = '';
  let transportRecovering = false, awaitingResume = false, rejoined = false, pendingResend = false;
  let visible = true, suspended = false, visibilityAttempt = 0;
  const rewards = createRewardClient({ send: command => !!active && !transportRecovering && status !== 'interrupted' && client?.sendEvent(command).status === 'sent' });
  let role: 'fighter' | 'spectator' = 'fighter';
  let seatLabel = '';
  let roomType: 'combat-relay' | 'tod-community' | 'tod-quick-play' | 'tod-training' = 'combat-relay', playerId = '', sessionMatchId = '';
  let training: TrainingRoomSnapshot['training'] | undefined;
  let community: CommunityRoomSnapshot['community'] | undefined;
  let sessionAppearance: ReplayAppearance | undefined;
  let terminalPresentation: { matchId: string; match: NonNullable<NetworkSession['confirmedMatch']>; appearance?: ReplayAppearance } | undefined;
  let completedReplay: { recording: ReturnType<NetworkSession['exportRecording']>; stoppedReason: string; appearance?: ReplayAppearance; startFrame?: number } | undefined;
  let quickPlay: QuickPlayRoomSnapshot['quickPlay'] | undefined;
  let social: SocialSnapshot | undefined;
  let voice: VoiceSnapshot | undefined;
  const voiceListeners = new Set<(signal: VoiceSignal) => void>();
  const voiceReportListeners = new Set<(result: VoiceReportResult) => void>();
  const uploadListeners = new Set<(ownerId: string) => void>();
  let pendingUpload: { requestId: string; resolve(response: UploadResponse): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> } | undefined;
  let uploadScope = '';
  function rejectUpload(reason: string) { if (pendingUpload) { clearTimeout(pendingUpload.timer);pendingUpload.reject(new Error(reason));pendingUpload = undefined; } }
  let profileMetadata = emptyProfileMetadata(), matchSeats: string[] = [];
  let pendingProfile: { requestId: string; resolve(value: PublicProfile): void; reject(reason: Error): void; timer: ReturnType<typeof setTimeout> } | undefined;
  function rejectProfile(reason: string) { if (pendingProfile) { clearTimeout(pendingProfile.timer);pendingProfile.reject(new Error(reason));pendingProfile = undefined; } }
  let unsubscribe: Array<() => void> = [];
  function close() { rewards.interrupt();transportRecovering = awaitingResume = rejoined = pendingResend = suspended = false;rejectUpload('Upload action was interrupted. Rejoin and retry.');rejectProfile('Profile save was interrupted. Rejoin and retry the same request.');for (const release of unsubscribe) release();unsubscribe = [];client?.close();client = undefined; }
  function recovering(reason: string) {
    transportRecovering = awaitingResume = true;rejoined = false;status = 'recovering';message = reason;
    rejectUpload('Connection interrupted. Refresh pictures after reconnecting.');rejectProfile('Connection interrupted. Retry the same profile save after reconnecting.');options.onChange();
  }
  function fail(reason: string) { generation++;session?.interrupt(reason);status = 'interrupted';message = reason;close();options.onChange(); }
  function retainReplay() {
    if (session && session.recordingStatus.frames > 0) completedReplay = currentReplay();
    sessionAppearance = undefined;
  }
  function suspendHiddenFighter() {
    if (visible || suspended || !active || !client || !session || role !== 'fighter' || ['interrupted', 'desynced'].includes(status)) return;
    suspended = true;visibilityAttempt++;
    recovering('Fight suspended while this tab is hidden. Return within ten seconds to resume.');
    client.close({ mode: 'suspend' });
  }
  function currentReplay() {
    if (!session) throw Error('No replay is available.');
    const recording = session.exportRecording();
    return { recording, stoppedReason: session.recordingStatus.stoppedReason, startFrame: decisiveReplayFrame(session.game.snapshot().combat, session.frame(), recording.frames.length), ...(sessionAppearance ? { appearance: structuredClone(sessionAppearance) } : {}) };
  }
  return {
    reward: rewards.request,
    get rewardUpdate() { return rewards.latest; },
    get socialProgress() { return rewards.socialProgress; },
    get terminalPresentation() { return terminalPresentation && structuredClone(terminalPresentation); },
    get active() { return active; },
    get session() { return session; },
    setVisibility(input: { visible: boolean }) {
      visible = input.visible;
      if (!visible) { suspendHiddenFighter();return; }
      if (!suspended || !client) return;
      suspended = false;
      const attempt = generation, resume = ++visibilityAttempt;
      message = 'Returning to the fight. Checking your reserved seat…';options.onChange();
      void client.connect().catch(cause => { if (attempt === generation && resume === visibilityAttempt && !suspended) fail(cause instanceof Error ? cause.message : 'Could not return to the fight.'); });
    },
    get state() {
      const quality = roomType === 'tod-quick-play' ? quickPlay?.error : roomType === 'tod-community' ? community?.error : undefined;
      const warning = active && !transportRecovering && ['running', 'waiting-for-input'].includes(status) && quality?.startsWith('Connection delivery has') ? quality : '';
      return { active, reconnecting: transportRecovering, role, roomType, playerId, community, quickPlay, training, matchId: sessionMatchId, rivalryScope, social, voice, ...structuredClone(profileMetadata), matchSeats: [...matchSeats], status, message: warning ? `${message} ${warning}` : message, canSaveReplay: (session?.recordingStatus.frames ?? 0) > 0 || !!completedReplay, frame: session?.frame() ?? 0, confirmedFrame: session?.confirmedFrame() ?? -1 };
    },
    onVoiceSignal(callback: (signal: VoiceSignal) => void) { voiceListeners.add(callback);return () => voiceListeners.delete(callback); },
    onVoiceReport(callback: (result: VoiceReportResult) => void) { voiceReportListeners.add(callback);return () => voiceReportListeners.delete(callback); },
    onUploadInvalidate(callback: (ownerId: string) => void) { uploadListeners.add(callback);return () => uploadListeners.delete(callback); },
    requestUpload(command: unknown): Promise<UploadResponse> {
      const parsed = readUploadCommand(command);
      if (!active || !roomUploadsEnabled({ roomType, quickPlay, roomImages: profileMetadata.roomImages }) || status === 'interrupted' || transportRecovering) return Promise.reject(new Error('Pictures are unavailable on this connection.'));
      if (parsed.type === 'upload-equip' && roomType === 'tod-quick-play' && !quickPlayCanEquip(quickPlay?.phase)) return Promise.reject(new Error('Change prints before searching or after the result.'));
      if (pendingUpload) return Promise.reject(new Error('Wait for the current picture action.'));
      return new Promise((resolve, reject) => {
        pendingUpload = { requestId: parsed.requestId, resolve, reject, timer: setTimeout(() => rejectUpload('Picture action timed out. Retry the same action.'), 10000) };
        try { if (client?.sendEvent(parsed).status !== 'sent') rejectUpload('Could not send the picture action. Retry.'); } catch { rejectUpload('Could not send the picture action. Retry.'); }
      });
    },
    voice(command: unknown) {
      const parsed = command && typeof command === 'object' && 'type' in command && command.type === 'voice-report' ? readVoiceReportCommand(command) : readVoiceCommand(command);
      if (!active || roomType !== 'tod-community' || status === 'interrupted' || client?.sendEvent(parsed).status !== 'sent') throw new Error('Room voice is not connected.');
    },
    exportReplay() {
      if (session && session.recordingStatus.frames > 0) return currentReplay();
      if (completedReplay) return structuredClone(completedReplay);
      throw new Error('No confirmed replay frames are available yet.');
    },
    async shareReplay(archive: unknown) {
      const credentials = shareCredentials;if (!credentials) throw Error('Join a room before creating a replay link.');
      const endpoint = new URL(credentials.endpoint);endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
      if (endpoint.origin !== location.origin) throw Error('Open the game on your host to create a replay link. You can still download the file.');
      const { encodeReplayArchive, replayContentType } = await import('@hyperfocus/touch-of-death/replay');
      const body = encodeReplayArchive({ value: archive });
      if (body.length > 524288) throw Error('Replay link limit is 512 KiB. Download the replay file instead.');
      const token = await credentials.getToken?.() ?? credentials.token;
      const response = await fetch('/tod-replay-share', { method: 'POST', headers: { 'Content-Type': replayContentType, Authorization: `Bearer ${token}` }, body, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw Error((await response.text()).slice(0, 240) || 'Could not create a replay link.');
      const value: unknown = await response.json();
      if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string' || !/^[a-f0-9-]{36}$/.test(value.id)) throw Error('The host returned an invalid replay link.');
      const link = new URL(location.href);link.hash = `replay=${value.id}`;link.search = '';return link.href;
    },
    async connect(raw: ConnectionDetails) {
      const details = readCombatConnection(raw);
      if (active) throw new Error('Leave the current connection before joining another room.');
      shareCredentials = details;
      role = details.role;
      roomType = details.roomType;completedReplay = undefined;terminalPresentation = undefined;sessionAppearance = undefined;community = undefined;quickPlay = undefined;training = undefined;social = undefined;playerId = '';sessionMatchId = '';
      profileMetadata = emptyProfileMetadata();matchSeats = [];
      uploadScope = '';
      voice = undefined;
      if ((role === 'spectator' || roomType === 'tod-community') && !options.createSpectator) throw new Error('Watching is not available in this game.');
      const attempt = ++generation;active = true;status = 'connecting';message = 'Connecting to your host…';options.onChange();
      rivalryScope = '';
      if (!options.transport && roomType === 'combat-relay') void readFriendRivalryScope(details).then(scope => { if (attempt === generation) rivalryScope = scope; });
      let admission: AuthoritativeSession | undefined, latest: CombatRoomSnapshot | undefined;
      const start = () => {
        if (attempt !== generation || !admission || !latest || session) return;
        if (latest.status === 'recovering') { status = 'recovering';message = 'Waiting for the fighter to reconnect.';options.onChange();return; }
        if (roomType === 'tod-training' && (training?.phase !== 'playing' || latest.status !== 'ready')) {
          status = 'lobby';message = training?.error || 'Waiting for your training partner. Share this room invitation.';options.onChange();return;
        }
        if (roomType === 'tod-quick-play' && (quickPlay?.phase !== 'playing' || latest.status !== 'ready')) {
          status = 'lobby';role = 'fighter';message = quickPlay?.error || (quickPlay?.phase === 'searching' ? 'Finding an opponent…'
            : quickPlay?.phase === 'ready' ? 'Opponent found. Accept to begin.' : quickPlay?.phase === 'result' ? 'Bout complete. Search again when you’re ready.' : 'Find an opponent for your next bout.');options.onChange();return;
        }
        if (roomType === 'tod-community' && (community?.phase !== 'playing' || latest.status !== 'ready')) {
          status = 'lobby';role = 'spectator';message = community?.error || (community?.phase === 'ready' ? 'Next fighters: ready up to begin.' : 'Join the queue or watch your friends.');options.onChange();return;
        }
        if (latest.status === 'waiting') { status = 'waiting';message = 'Room joined. Waiting for your friend…';options.onChange();return; }
        if (latest.status !== 'ready') { fail('This bout is no longer available. Leave and ask your host for a new room.');return; }
        if (roomType === 'tod-community') role = latest.seats.includes(admission.playerId) ? 'fighter' : 'spectator';
        if ((roomType === 'tod-quick-play' || roomType === 'tod-training') && !latest.seats.includes(admission.playerId)) throw new Error('The room assigned a different fighter seat.');
        const battleId = latest.matchId;sessionMatchId = battleId;completedReplay = undefined;pendingResend = false;
        session = role === 'spectator' ? options.createSpectator!(latest, cursor => {
          if (attempt !== generation || battleId !== sessionMatchId) return;
          if (client?.sendEvent({ type: 'combat-spectator-cursor', frame: cursor.frame, ...(roomType === 'tod-community' ? { matchId: battleId } : {}) }).status !== 'sent') recovering('Connection interrupted. Your viewing position is held while reconnecting.');
        }) : options.createSession(latest, admission.playerId, input => {
          if (attempt !== generation || battleId !== sessionMatchId || roomType === 'tod-quick-play' && quickPlay?.phase !== 'playing') return;
          if (client?.sendInput(input).status !== 'sent') recovering('Connection interrupted. Your sampled inputs are held while reconnecting.');
        }, roomType === 'tod-training' ? training!.mode : 'set');
        sessionAppearance = captureReplayAppearance({ seats: latest.seats, profiles: profileMetadata.profiles, profileBindings: profileMetadata.profileBindings });
        seatLabel = role === 'spectator' ? 'Watching fighter 1 vs fighter 2' : `You are fighter ${latest.seats.indexOf(admission.playerId) + 1}`;
        session.receive(latest);status = session.status.status;message = session.status.reason || `${seatLabel} · ${roomType === 'tod-community' ? 'winner stays room' : roomType === 'tod-quick-play' ? 'Quick Play' : roomType === 'tod-training' ? 'shared training' : 'private bout'}`;options.onChange();suspendHiddenFighter();
      };
      try {
        client = options.transport?.(details) ?? connectAuthoritative<CombatRoomSnapshot>({ url: details.endpoint, token: details.token,
          ...(details.getToken ? { getToken: async () => {
            if (attempt !== generation) throw new Error('Guest connection cancelled.');
            const token = await details.getToken!();
            if (attempt !== generation) throw new Error('Guest connection cancelled.');
            return token;
          } } : {}),
          roomId: details.roomId, roomType, request: { matchId: details.matchId, contentId: details.contentId, role, profileVersion: profileProtocolVersion, ...(details.initialProfile ? { initialProfile: details.initialProfile } : {}), ...(roomType === 'tod-community' ? { wantsQueue: role === 'fighter', communityVersion: communityProtocolVersion } : {}), ...(roomType === 'tod-quick-play' ? { quickPlayVersion: quickPlayProtocolVersion } : {}), ...(roomType === 'tod-training' ? { trainingVersion: trainingProtocolVersion } : {}) },
          inputCodec: combatRoomInputCodec, schema: roomType === 'tod-community' ? communityRoomSnapshotSchema : roomType === 'tod-quick-play' ? quickPlayRoomSnapshotSchema : roomType === 'tod-training' ? trainingRoomSnapshotSchema : profileCombatSnapshotSchema,
          // A cold authored arena and its first profile can outlast two seconds.
          // This bounds admission; the host still owns the ten-second recovery grace.
          reconnect: { maxAttempts: 9, initialDelayMs: 250, maxDelayMs: 1500 }, joinTimeoutMs: 15000 });
        const receive = (snapshot: CombatRoomSnapshot) => {
          if (attempt !== generation || transportRecovering && !rejoined) return;
          try {
            if (snapshot.contentId !== details.contentId || roomType === 'combat-relay' && snapshot.matchId !== details.matchId) throw new Error('The host supplied a different match or content version.');
            if (roomType === 'tod-training') {
              const incoming = readTrainingSnapshot(snapshot);
              if (training && incoming.training.revision < training.revision) return;
              training = incoming.training;
              if (session && (incoming.matchId !== sessionMatchId || training.phase !== 'playing' || incoming.status === 'interrupted')) {
                retainReplay();session.interrupt('Training moved to a new attempt.');session = undefined;sessionMatchId = '';options.onBattleEnd?.();
              }
              snapshot = incoming;
            }
            if (roomType === 'tod-quick-play') {
              const incoming = readQuickPlaySnapshot(snapshot);quickPlay = incoming.quickPlay;
              const resultPhase = quickPlay.phase === 'saving' || quickPlay.phase === 'result';
              if (terminalPresentation && (!resultPhase || incoming.matchId !== terminalPresentation.matchId)) { terminalPresentation = undefined;options.onBattleEnd?.(); }
              const completing = resultPhase && incoming.matchId === sessionMatchId && incoming.status === 'ready';
              if (session && (incoming.matchId !== sessionMatchId || quickPlay.phase !== 'playing' && !completing || incoming.status === 'interrupted')) {
                const confirmed = session.confirmedMatch;
                if (resultPhase && incoming.matchId === sessionMatchId && confirmed?.phase === 'match-result') terminalPresentation = { matchId: sessionMatchId, match: confirmed, ...(sessionAppearance ? { appearance: structuredClone(sessionAppearance) } : {}) };
                retainReplay();session.interrupt('Quick Play moved to the next pairing.');session = undefined;sessionMatchId = '';options.onBattleEnd?.(!!terminalPresentation);
              }
              snapshot = incoming;
            }
            if (roomType === 'tod-community') {
              const incoming = readCommunitySnapshot(snapshot);
              if (community && incoming.community.revision < community.revision) return;
              community = incoming.community;
              social = incoming.social;
              voice = incoming.voice;
              if (session && (incoming.matchId !== sessionMatchId || community.phase !== 'playing' || incoming.status === 'interrupted')) {
                retainReplay();session.interrupt('The room moved to the next pairing.');session = undefined;sessionMatchId = '';options.onBattleEnd?.();
              }
              snapshot = incoming;
            }
            const incomingProfiles = readProfileMetadata(snapshot);
            options.validateProfiles?.(incomingProfiles.profiles);
            if (roomType === 'combat-relay' || roomType === 'tod-training') {
              const nextScope = JSON.stringify([incomingProfiles.roomImages.enabled, snapshot.matchId, snapshot.seats.map(id => [id, incomingProfiles.profileBindings.find(binding => binding.playerId === id)?.userId])]);
              if (uploadScope && nextScope !== uploadScope) rejectUpload('Picture audience changed. Refresh and try again.');
              uploadScope = nextScope;
            }
            profileMetadata = incomingProfiles;matchSeats = [...snapshot.seats];
            if (pendingProfile && profileMetadata.profileResult.requestId === pendingProfile.requestId) {
              const { error } = profileMetadata.profileResult;
              if (error) rejectProfile(error);
              else {
                const userId = profileMetadata.profileBindings.find(binding => binding.playerId === playerId)?.userId;
                const saved = profileMetadata.profiles.find(profile => profile.userId === userId);
                if (!saved) throw new Error('Profile save confirmation has no authenticated profile.');
                clearTimeout(pendingProfile.timer);pendingProfile.resolve(structuredClone(saved));pendingProfile = undefined;
              }
            }
            latest = snapshot;
            if (awaitingResume && rejoined) { transportRecovering = awaitingResume = false;pendingResend = true; }
            if (session) {
              session.receive(snapshot);
              if (session.status.status === 'interrupted') fail(session.status.reason);
              else if (pendingResend && (snapshot.status === 'ready' || role === 'spectator')) {
                pendingResend = false;
                if (role === 'fighter') {
                  if (!('resendPendingInputs' in session)) throw new Error('Fighter connection requires a fighter session.');
                  session.resendPendingInputs();
                } else {
                  if (!('resendCursor' in session)) throw new Error('Spectator connection requires a spectator session.');
                  session.resendCursor();
                }
              }
              if (!transportRecovering && status !== 'interrupted') {
                const changed = status !== session.status.status && (status === 'recovering' || session.status.status === 'recovering');
                status = session.status.status;message = session.status.reason || `${seatLabel} · ${roomType === 'tod-community' ? 'winner stays room' : roomType === 'tod-quick-play' ? 'Quick Play' : roomType === 'tod-training' ? 'shared training' : 'private bout'}`;
                if (changed) options.onChange();
              }
            }
            else start();
          } catch (cause) { fail(cause instanceof Error ? cause.message : 'The room sent an invalid update.'); }
        };
        unsubscribe = [client.onSnapshot(receive), client.onDelta(receive), client.onMessage(message => {
          if (attempt === generation && message.type === 'event') {
            rewards.receive(message.payload);
            const probe = message.payload;
            if (roomType === 'tod-quick-play' && probe && typeof probe === 'object' && 'type' in probe && probe.type === 'tod-latency-probe'
              && 'nonce' in probe && typeof probe.nonce === 'string' && /^[a-f0-9-]{36}$/i.test(probe.nonce)) client?.sendEvent({ type: 'tod-latency-ack', nonce: probe.nonce });
            if (role === 'fighter' && ['tod-community', 'tod-quick-play'].includes(roomType) && probe && typeof probe === 'object'
              && 'type' in probe && probe.type === 'tod-quality-probe' && 'matchId' in probe && probe.matchId === sessionMatchId
              && 'nonce' in probe && typeof probe.nonce === 'string' && /^[a-f0-9-]{36}$/i.test(probe.nonce)) {
              client?.sendEvent({ type: 'tod-quality-ack', matchId: probe.matchId, nonce: probe.nonce });
            }
          }
          if (attempt !== generation || !roomUploadsEnabled({ roomType, quickPlay, roomImages: profileMetadata.roomImages }) || message.type !== 'event') return;
          const payload = message.payload;
          if (payload && typeof payload === 'object' && 'type' in payload && payload.type === 'upload-invalidate') {
            try { const { ownerId } = readUploadInvalidation(payload);for (const listener of uploadListeners) listener(ownerId); } catch { /* Invalid gallery notices do not affect combat. */ }
            return;
          }
          if (payload && typeof payload === 'object' && 'type' in payload && payload.type === 'upload-result') {
            try {
              const result = readUploadResponse(payload);
              if (pendingUpload?.requestId === result.requestId) {
                if (result.error) rejectUpload(result.error);
                else { const pending = pendingUpload;pendingUpload = undefined;clearTimeout(pending.timer);pending.resolve(result); }
              }
            } catch { /* Malformed image responses cannot interrupt combat. */ }
            return;
          }
          if (roomType !== 'tod-community' || !payload || typeof payload !== 'object' || !('type' in payload)) return;
          if (payload.type === 'voice-report-result') {
            try { const result = readVoiceReportResult(payload);for (const listener of voiceReportListeners) listener(result); } catch { /* Invalid report receipts cannot interrupt combat. */ }
            return;
          }
          if (payload.type !== 'voice-signal') return;
          try { const signal = readVoiceSignal(payload);for (const listener of voiceListeners) listener(signal); } catch { /* Invalid voice traffic cannot interrupt the fight. */ }
        }), client.onState(state => {
          if (attempt !== generation) return;
          if (state.status === 'recovering' && admission) { recovering(suspended ? 'Fight suspended while this tab is hidden. Return within ten seconds to resume.' : `Reconnecting (attempt ${state.attempt}). Your fight inputs are paused.`);return; }
          if (state.status === 'joined' && admission && awaitingResume) {
            if (state.session.playerId !== admission.playerId || state.session.roomId !== admission.roomId) { fail('The host could not restore your previous seat. Leave and join a new bout.');return; }
            admission = state.session;rejoined = true;message = 'Reconnected. Checking the saved input timeline…';options.onChange();return;
          }
          if (state.status === 'failed' || state.status === 'closed') fail(state.status === 'failed' ? state.reason : 'Connection closed. Leave and join a new bout.');
        })];
        admission = await client.connect();
        if (attempt === generation) { playerId = admission.playerId;status = 'waiting';message = 'Room joined. Waiting for your friend…';start();options.onChange(); }
      } catch (cause) { if (attempt === generation) fail(cause instanceof Error ? cause.message : 'Could not connect.'); }
    },
    saveProfile(command: unknown): Promise<PublicProfile> {
      const parsed = readProfileCommand(command);
      if (!active || !playerId || status === 'interrupted') return Promise.reject(new Error('Join a room before saving your online profile.'));
      if (pendingProfile) return Promise.reject(new Error('Wait for your current profile save.'));
      return new Promise((resolve, reject) => {
        pendingProfile = { requestId: parsed.requestId, resolve, reject, timer: setTimeout(() => rejectProfile('Profile save timed out. Retry the same request.'), 10000) };
        if (client?.sendEvent(parsed).status !== 'sent') rejectProfile('Could not send your profile. Retry the same request.');
      });
    },
    training(command: unknown) {
      const parsed = readTrainingCommand(command);
      if (!active || roomType !== 'tod-training' || status === 'interrupted' || training?.phase !== 'playing' || parsed.matchId !== sessionMatchId) throw new Error('This training attempt is no longer available.');
      if (parsed.type === 'training-respond' && parsed.proposalId !== training.proposalId) throw new Error('This training proposal expired.');
      if (client?.sendEvent(parsed).status !== 'sent') throw new Error('Could not send this training action. Try again.');
    },
    quickPlay(command: unknown) {
      const parsed = readQuickPlayCommand(command);
      if (!active || roomType !== 'tod-quick-play' || status === 'interrupted') throw new Error('Quick Play is not connected.');
      if (parsed.type === 'quick-accept' && (quickPlay?.phase !== 'ready' || parsed.matchId !== quickPlay.matchId)) throw new Error('This opponent offer has expired.');
      if (client?.sendEvent(parsed).status !== 'sent') throw new Error('Could not send this Quick Play action. Check your connection and retry.');
    },
    queue(enabled: boolean) {
      if (!active || roomType !== 'tod-community' || status === 'interrupted' || client?.sendEvent({ type: 'community-queue', enabled }).status !== 'sent') throw new Error('Could not change your queue position.');
    },
    social(command: SocialCommand) {
      const parsed = readSocialCommand(command);
      const localUserId = profileMetadata.profileBindings.find(binding => binding.playerId === playerId)?.userId;
      const quickBlock = !!localUserId && roomType === 'tod-quick-play' && quickPlay?.uploadsEnabled && parsed.type === 'social-block'
        && quickPlay.users.includes(localUserId) && quickPlay.users.includes(parsed.targetId) && parsed.targetId !== localUserId;
      const privateBlock = !!localUserId && ['combat-relay', 'tod-training'].includes(roomType) && profileMetadata.roomImages.enabled && parsed.type === 'social-block'
        && parsed.targetId !== localUserId && profileMetadata.profileBindings.some(binding => matchSeats.includes(binding.playerId) && binding.userId === parsed.targetId);
      if (!active || roomType !== 'tod-community' && !quickBlock && !privateBlock || status === 'interrupted' || transportRecovering || client?.sendEvent(parsed).status !== 'sent') throw new Error('Could not send this room action. Check your connection and retry.');
    },
    ready(battleId: string) {
      if (!active || roomType !== 'tod-community' || community?.battleId !== battleId || community.phase !== 'ready' || client?.sendEvent({ type: 'community-ready', battleId }).status !== 'sent') throw new Error('This ready request has expired.');
    },
    tick(input: { catchUp?: boolean } = {}) {
      if (!session || status === 'interrupted' || transportRecovering || !visible) return false;
      try {
        const deadline = performance.now() + 6;
        let advanced;
        if (role === 'spectator') {
          if (!('resendCursor' in session)) throw new Error('Spectator connection requires a spectator session.');
          advanced = session.tick({ maxFrames: input.catchUp ? 120 : 1, shouldYield: () => performance.now() >= deadline });
        } else advanced = session.tick();
        if (!transportRecovering) { status = session.status.status;message = session.status.reason || `${seatLabel} · ${roomType === 'tod-community' ? 'winner stays room' : roomType === 'tod-quick-play' ? 'Quick Play' : roomType === 'tod-training' ? 'shared training' : 'private bout'}`; }return advanced;
      }
      catch (cause) { fail(cause instanceof Error ? cause.message : 'The bout could not continue.');return false; }
    },
    interrupt: fail,
    leave() { generation++;close();session = undefined;terminalPresentation = undefined;sessionAppearance = undefined;completedReplay = undefined;sessionMatchId = '';community = undefined;quickPlay = undefined;training = undefined;social = undefined;profileMetadata = emptyProfileMetadata();matchSeats = [];playerId = '';active = false;status = 'offline';message = 'Invite a friend for a private bout.';options.onLeave();options.onChange(); },
    dispose() { generation++;close();session = undefined;terminalPresentation = undefined;sessionAppearance = undefined;completedReplay = undefined;active = false; },
  };
}
