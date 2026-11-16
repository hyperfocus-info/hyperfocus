import { combatInputActions3D } from '@hyperfocus/engine/project/runtime-3d';
import { createLocalAiReceiptHandler } from './ai-receipts.ts';
import { createLocalCpuUsage } from './cpu-usage.ts';
import { resolve } from 'node:path';
import { migrateProject } from '@hyperfocus/engine/project';
import { readHyperfocusProjectPair } from '@hyperfocus/engine/project/filesystem';
import { createAuthoritativeServer } from '@hyperfocus/engine/server';
import { createProfileCombatRoom } from './profiles/room.ts';
import { withSocialProgression } from './progression/social-room.ts';
import { createProfileService } from './profiles/service.ts';
import { readAppearanceCatalog3D } from '@hyperfocus/engine/project/runtime-3d';
import { profileProtocolVersion } from '../src/appearance/profile.ts';
import { combatRoomInputCodec } from '@hyperfocus/engine/combat/net';
import { readCombatProject3D } from '@hyperfocus/engine/project/runtime-3d';
import { combatContentPrefix, combatContentSource } from '../src/network/identity.ts';
import { createLocalCombatRecordings } from './recordings.ts';
import { encodeReplayArchive, replayContentType } from '../src/replay/archive.ts';
import { createHostStorage } from './postgres/host-storage.ts';
import { resolveHostStorageConfig } from './postgres/config.ts';
import { createCommunityRoom } from './community/room.ts';
import { createRoomSocialService } from './community/social.ts';
import { createDurableMmoServices } from '@hyperfocus/engine/server';
import { communityProtocolVersion, communityRoomSnapshotSchema } from '../src/network/community-protocol.ts';
import { createQuickPlayRoom } from './quick-play/room.ts';
import { quickPlayProtocolVersion } from '../src/network/quick-play/protocol.ts';
import { createTrainingRoom } from './training/room.ts';
import { trainingProtocolVersion } from '../src/training/protocol.ts';
import { withRoomVoice } from './voice/room.ts';
import { createVoiceReportService } from './voice/report-service.ts';
import { readVoiceIceConfig, type VoiceIceConfig } from '../src/network/voice/protocol.ts';
import { createUploadService } from './uploads/service.ts';
import { withRoomUploads } from './uploads/room.ts';
import { createUploadReportService } from './uploads/report-service.ts';
import { createUploadModerationHandler, readModeratorConfig } from './uploads/moderation-http.ts';
import { createDemoDocument } from './demo-document.ts';
import { createDemoAudio } from './demo-audio.ts';
import { createWebDeliveryHandler } from '@hyperfocus/engine/tooling/build-project';
import { SESSION_SUPERSEDED_CLOSE_CODE } from '@hyperfocus/engine/protocol';
import { createClerkIdentity, readClerkFrontendOrigin } from './guest-session/clerk.ts';
import { withRoomProgression } from './progression/room.ts';
import { createDemoOriginPolicy } from './public-origin.ts';
import { createHostedPolicyLearning } from './policy-learning/host.ts';
import { loadDeploymentPolicy } from './policy-learning/deployment.ts';
import { createReplayShares } from './replay-share/service.ts';
import { createReplayShareHttp } from './replay-share/http.ts';

/** Shared local/package host. Repository development launches through the managed combat-relay surface. */
/** Trusted disk loading uses bounded portable bytes, never browser hydration/base64. */
export function readLocalCombatProject(options: { projectRoot: string }) {
  return readHyperfocusProjectPair(resolve(options.projectRoot), {
    parseProject: migrateProject, maxArchiveBytes: 536870912, maxUnpackedBytes: 536870912, maxAssets: 5000,
  });
}

export async function startLocalCombatRelay(options: { projectRoot: string; port: number; hostname?: '127.0.0.1' | '0.0.0.0'; clerk?: { publishableKey: string; secretKey: string }; databaseUrl?: string; databasePath?: string; demo?: { artifactPath: string; publicOrigin?: string; previewOrigin?: string }; voice?: Partial<VoiceIceConfig>; moderator?: { token: string; reviewerId: string }; moderationScriptPath?: string; aiReceiptsPath?: string; policyCandidatePath?: string }) {
  const hostInstance = crypto.randomUUID();
  if (options.demo && (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535)) throw new Error('Demo hosting needs an explicit port.');
  if (options.hostname === '0.0.0.0' && !options.demo?.publicOrigin) throw new Error('Public binding requires an exact public HTTPS origin.');
  if (options.clerk && !options.demo) throw new Error('Clerk requires hosted demo mode.');
  const localReceipts = await createLocalAiReceiptHandler({ path: options.aiReceiptsPath, port: options.port, publicBinding: options.hostname === '0.0.0.0' });
  const localCpu = createLocalCpuUsage({ port: options.port, publicBinding: options.hostname === '0.0.0.0' });
  const voice = readVoiceIceConfig(options.voice);
  const moderator = options.moderator ? readModeratorConfig(options.moderator) : undefined;
  let moderationScript = '';
  if (moderator && options.moderationScriptPath) {
    moderationScript = await Bun.file(resolve(options.moderationScriptPath)).text();
    if (!moderationScript.trim()) throw new Error('The prebuilt host moderation script is empty.');
  } else if (moderator) {
    const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, '../src/uploads/moderation-entry.ts')], target: 'browser', format: 'iife', minify: true });
    if (!build.success || build.outputs.length !== 1) throw new Error('Could not build the host moderation page.');
    moderationScript = await build.outputs[0]!.text();
  }
  const snapshot = await readLocalCombatProject({ projectRoot: options.projectRoot });
  const html = options.demo ? await Bun.file(resolve(options.demo.artifactPath)).text() : '';
  const demoDocument = options.demo ? createDemoDocument({ html, clerkFrontendOrigin: options.clerk ? readClerkFrontendOrigin(options.clerk.publishableKey) : undefined }) : undefined;
  const demoAudio = options.demo ? createDemoAudio({ html, project: snapshot.project, assets: snapshot.assets }) : undefined;
  const webDirectory = options.demo && await Bun.file(resolve(options.demo.artifactPath, '..', 'web/build.json')).exists() ? resolve(options.demo.artifactPath, '..', 'web') : options.demo && resolve(options.demo.artifactPath, '..');
  const webDelivery = webDirectory && html.includes('"manifestUrl"') ? await createWebDeliveryHandler({ directory: webDirectory }) : undefined;
  const publicAssetPaths = new Set([...(demoAudio?.paths ?? []), ...(webDelivery?.inventory.files.filter(file => file.path !== 'index.html').map(file => `/${file.path}`) ?? [])]);
  const originPolicy = options.demo ? createDemoOriginPolicy({ port: options.port, publicOrigin: options.demo.publicOrigin, previewOrigin: options.demo.previewOrigin, publicBinding: options.hostname === '0.0.0.0', audioPaths: publicAssetPaths }) : undefined;
  const demoOrigin = originPolicy?.origin ?? `http://127.0.0.1:${options.port}`;
  const combat = readCombatProject3D(snapshot.project.extensions?.hyperfocusCombat);
  if (combat?.fighters.length !== 2) throw new Error('Local combat relay requires an authored two-fighter project.');
  const contentId = `${combatContentPrefix}${new Bun.CryptoHasher('sha256').update(combatContentSource(snapshot.project)).digest('hex')}`, roomId = 'arena', matchId = 'local-bout', seed = 7;
  const deploymentPolicy = options.policyCandidatePath ? await loadDeploymentPolicy({ path: options.policyCandidatePath, contentId }) : undefined;
  if (deploymentPolicy && !options.demo) throw Error('Deployment policy evaluation requires hosted demo mode.');
  const allowedActions = combatInputActions3D({ definition: combat, rematch: true });
  const recordings = createLocalCombatRecordings();
  const databasePath = options.databasePath ?? resolve(options.projectRoot, '../community.sqlite');
  const catalog = readAppearanceCatalog3D(snapshot.project.extensions?.hyperfocusAppearance);
  let server: ReturnType<typeof createAuthoritativeServer>;
  const storage = await createHostStorage({ databasePath, databaseUrl: options.databaseUrl, catalog, moderation: !!moderator, guest: options.demo ? { origin: demoOrigin, verifyIdentity: options.clerk ? createClerkIdentity({ ...options.clerk, origin: demoOrigin }) : undefined, async onRestore(userId) {
    const player = server.presence.byUser(userId);if (!player) return;
    try { await server.leavePlayer(player.id, 'duplicate-login'); }
    finally {
      const connection = player.connection;
      if (connection && typeof connection === 'object' && 'close' in connection && typeof connection.close === 'function') connection.close(SESSION_SUPERSEDED_CLOSE_CODE, 'This fighter was restored in another browser.');
    }
  } } : undefined });
  const { guests, persistence, socialStore, ratings, rewards, moderationIndex } = storage;
  let policyLearning: ReturnType<typeof createHostedPolicyLearning> | undefined;
  try {
  const services = createDurableMmoServices(socialStore, { maxChatMessagesPerChannel: 32, maxChatMessageLength: 280 });
  const social = createRoomSocialService({ persistence, services });
  const voiceReports = createVoiceReportService({ persistence });
  const uploads = createUploadService({ persistence, allowedSlots: catalog ? [...new Set([...(catalog.textureSlots?.map(slot => slot.id) ?? []), 'profile-emblem'])] : [], allowView: ({ roomId, ownerId, viewerId }) => social.allowCommunication({ roomId, userId: viewerId, otherUserId: ownerId }) });
  const reports = createUploadReportService({ persistence, uploads });
  const profiles = catalog ? createProfileService({ persistence, catalog, rewards }) : undefined;
  const moderation = moderator && moderationIndex ? createUploadModerationHandler({ moderator, script: moderationScript, uploads, reports, page: input => moderationIndex.page(input) }) : undefined;
  const assets = snapshot.assets;
  const replayShares = guests ? createReplayShareHttp({ origin: demoOrigin, service: createReplayShares({ store: socialStore, contentId }),
    async authenticate(token) { const result = await guests.auth.verify(token);return result.ok ? result.userId : undefined; } }) : undefined;
  if (guests) policyLearning = createHostedPolicyLearning({ origin: demoOrigin, contentId, store: socialStore, project: snapshot.project, assets, deploymentPolicy,
    async authenticate(token) { const result = await guests.auth.verify(token);return result.ok ? result.userId : undefined; } });
  server = createAuthoritativeServer({ transport: 'websocket', hostname: options.hostname ?? '127.0.0.1', port: options.port,
    requestGuard: originPolicy?.guard,
    devMode: !guests, ...(guests ? { auth: guests.auth } : {}), reconnectGraceMs: 10000, rooms: [withRoomProgression({ rewards, room: withSocialProgression({ rewards, room: createProfileCombatRoom({ matchId, contentId, seed, allowedActions, maxSpectators: 6, profiles, social, uploads, reports, onConfirmedFrames: batch => recordings.accept(batch) }) }) }),
      withRoomProgression({ rewards, room: withRoomUploads({ room: withRoomVoice({ room: createCommunityRoom({ project: snapshot.project, assets, contentId, seed, persistence, social, profiles, onResult: async result => rewards.awardMatch(result) }), schema: communityRoomSnapshotSchema, social, reports: voiceReports, ...voice }), uploads, reports, canEquip: ({ ctx }) => !ctx.state.coordinator.snapshot().battle }) }),
      withRoomProgression({ rewards, room: createQuickPlayRoom({ project: snapshot.project, assets, contentId, seed, services, ratings, profiles, social, uploads, reports, onResult: async result => rewards.awardMatch(result) }) }),
      withRoomProgression({ rewards, room: withSocialProgression({ rewards, room: createTrainingRoom({ contentId, seed, allowedActions, profiles, social, uploads, reports }) }) })], inputCodec: combatRoomInputCodec,
    replication: { binary: true, snapshotRate: 2, deltaRate: 60 },
    async httpHandler(request) {
      const url = new URL(request.url);
      const receiptResponse = localReceipts(request);if (receiptResponse) return receiptResponse;
      const cpuResponse = localCpu(request);if (cpuResponse) return cpuResponse;
      if (url.pathname === '/tod-health' && request.method === 'GET') { const healthy = await storage.healthy();return new Response(healthy ? 'ok' : 'unavailable', { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }); }
      const audioResponse = demoAudio?.respond(request);if (audioResponse) return audioResponse;
      if (url.pathname !== '/' && webDelivery) { const response = await webDelivery.respond(request);if (response) return response; }
      if (originPolicy?.isPreview(request)) return url.pathname === '/' ? demoDocument!.respond(request)
        : new Response('Online play uses the primary game address.', { status: 404, headers: { 'Cache-Control': 'no-store' } });
      if (guests) {
        // The public request guard keeps moderator routes on the backend origin.
        if (options.demo?.publicOrigin) { const reviewed = await moderation?.(request);if (reviewed) return reviewed; }
        let guestRequest: Request;
        try { guestRequest = originPolicy!.guestRequest(request); } catch { return new Response('Forbidden', { status: 403 }); }
        const replayResponse = await replayShares?.(guestRequest);if (replayResponse) return replayResponse;
        const policyResponse = await policyLearning?.handle(guestRequest);if (policyResponse) return policyResponse;
        const guestResponse = await guests.handle(guestRequest);if (guestResponse) return guestResponse;
        if (url.pathname === '/' || url.pathname === '/tod-demo.json') {
          if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
          const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Tod-Host-Instance': hostInstance };
          return url.pathname === '/' ? demoDocument!.respond(request)
            : Response.json({ version: 1, contentId, endpoint: originPolicy!.endpoint, guestSessionPath: '/tod-guest-session', ...(options.clerk ? { clerkPublishableKey: options.clerk.publishableKey } : { recoveryPath: '/tod-guest-recovery' }), roomTypes: ['combat-relay', 'tod-community', 'tod-quick-play', 'tod-training'], matchId: 'local-bout' }, { headers });
        }
        if (url.pathname === '/combat-recordings.json' || url.pathname === '/combat-recording.json' || url.pathname === '/combat-recording.pb') return new Response('Not found', { status: 404 });
      }
      const reviewed = await moderation?.(request);if (reviewed) return reviewed;
      if (!['/combat-config.json', '/community-config.json', '/quick-play-config.json', '/training-config.json', '/combat-recordings.json', '/combat-recording.json', '/combat-recording.pb'].includes(url.pathname)) return new Response('Not found', { status: 404 });
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
      const origin = request.headers.get('origin'), headers = new Headers({ 'Cache-Control': 'no-store' });
      if (origin) {
        let parsed: URL;try { parsed = new URL(origin); } catch { return new Response('Forbidden', { status: 403 }); }
        if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) return new Response('Forbidden', { status: 403 });
        headers.set('Access-Control-Allow-Origin', origin);headers.set('Vary', 'Origin');
      }
      if (url.pathname === '/combat-recordings.json') return Response.json({ rooms: recordings.list(), maxRooms: 8, maxFrames: 36000, persistence: 'process-memory' }, { headers });
      if (url.pathname === '/combat-recording.pb' || url.pathname === '/combat-recording.json') {
        const value = recordings.read(url.searchParams.get('roomId') ?? '');
        if (!value) return new Response('Recording not found', { status: 404, headers });
        if (url.pathname.endsWith('.json')) return Response.json(value, { headers });
        headers.set('Content-Type', replayContentType);
        headers.set('Content-Disposition', 'attachment; filename="touch-of-death-replay.pb"');
        return new Response(encodeReplayArchive({ value }), { headers });
      }
      const community = url.pathname === '/community-config.json';
      if (url.pathname === '/training-config.json') return Response.json({ endpoint: `ws://127.0.0.1:${server.getStats().port}`, roomId: 'training', roomType: 'tod-training', matchId: 'training', contentId, seed, mode: 'local-development', trainingVersion: trainingProtocolVersion, profileVersion: profileProtocolVersion }, { headers });
      if (url.pathname === '/quick-play-config.json') return Response.json({ endpoint: `ws://127.0.0.1:${server.getStats().port}`, roomId: 'quick-play', roomType: 'tod-quick-play', matchId: 'quick-play', contentId, seed, mode: 'local-development', quickPlayVersion: quickPlayProtocolVersion }, { headers });
      return Response.json({ endpoint: `ws://127.0.0.1:${server.getStats().port}`, roomId: community ? 'friends' : roomId, roomType: community ? 'tod-community' : 'combat-relay', matchId: community ? 'community' : matchId, contentId, seed,
        mode: 'local-development', profileVersion: profileProtocolVersion, ...(community ? { communityVersion: communityProtocolVersion } : {}), allowedActions: community ? allowedActions.filter(action => action !== 'match:rematch') : allowedActions }, { headers });
    },
  });
  const stop = server.stop;
  server.stop = async () => { try { await stop(); } finally { try { await policyLearning?.dispose(); } finally { await storage.close(); } } };
  server.start();return server;
  } catch (cause) { try { await policyLearning?.dispose(); } finally { await storage.close(); }throw cause; }
}

if (import.meta.main) {
  const index = process.argv.indexOf('--project'), projectRoot = index >= 0 ? process.argv[index + 1] : undefined;
  if (!projectRoot) throw new Error('Expected --project <editor-project-directory>.');
  const port = Number(process.env.PORT ?? 8801);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  let voice: VoiceIceConfig;
  try { voice = readVoiceIceConfig(process.env.TOUCH_OF_DEATH_VOICE_CONFIG ? JSON.parse(process.env.TOUCH_OF_DEATH_VOICE_CONFIG) : {}); }
  catch { throw new Error('Invalid TOUCH_OF_DEATH_VOICE_CONFIG. Supply bounded ICE servers and an all or relay transport policy.'); }
  const moderator = process.env.TOUCH_OF_DEATH_MODERATOR_TOKEN ? { token: process.env.TOUCH_OF_DEATH_MODERATOR_TOKEN, reviewerId: process.env.TOUCH_OF_DEATH_REVIEWER_ID ?? 'local-host' } : undefined;
  const { databasePath, databaseUrl } = resolveHostStorageConfig();
  if (process.env.TOUCH_OF_DEATH_PUBLIC_ORIGIN && !process.env.TOUCH_OF_DEATH_DEMO_HTML) throw new Error('TOUCH_OF_DEATH_PUBLIC_ORIGIN requires a guest-enabled demo HTML artifact.');
  const demo = process.env.TOUCH_OF_DEATH_DEMO_HTML ? { artifactPath: resolve(process.env.TOUCH_OF_DEATH_DEMO_HTML), publicOrigin: process.env.TOUCH_OF_DEATH_PUBLIC_ORIGIN, previewOrigin: process.env.TOUCH_OF_DEATH_PREVIEW_ORIGIN } : undefined;
  const moderationScriptPath = process.env.TOUCH_OF_DEATH_MODERATOR_SCRIPT;
  const publishableKey = process.env.PUBLIC_CLERK_PUBLISHABLE_KEY, secretKey = process.env.CLERK_SECRET_KEY;
  if (!!publishableKey !== !!secretKey) throw new Error('Set both PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY.');
  const clerk = publishableKey && secretKey ? { publishableKey, secretKey } : undefined;
  const hostname = process.env.TOUCH_OF_DEATH_BIND_ADDRESS;
  if (hostname !== undefined && hostname !== '127.0.0.1' && hostname !== '0.0.0.0') throw new Error('Invalid TOUCH_OF_DEATH_BIND_ADDRESS.');
  const server = await startLocalCombatRelay({ projectRoot, port, hostname, clerk, voice, moderator, databasePath, databaseUrl, demo, moderationScriptPath, aiReceiptsPath: process.env.TOUCH_OF_DEATH_AI_RECEIPTS, policyCandidatePath: process.env.TOUCH_OF_DEATH_POLICY_CANDIDATE });
  console.info(`Local combat relay ready at http://127.0.0.1:${server.getStats().port}/combat-config.json`);
  const shutdown = () => { void server.stop().then(() => process.exit(0)); };
  process.once('SIGINT', shutdown);process.once('SIGTERM', shutdown);
}
