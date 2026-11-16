import { applyAppearance3D, applyAppearanceMotion3D, readAppearanceCatalog3D, resolveAppearance3D, type CombatProject3D, type Hyperfocus3DEvaluatedFrame, type createHyperfocus3DRuntime } from '@hyperfocus/engine/project/runtime-3d';
import type { CombatSnapshot } from '@hyperfocus/engine/combat';
import { createSaveProfileStore, type AtomicSaveStorage } from '@hyperfocus/engine/save';
import type { createCombatConnection } from '../network/connection.ts';
import { createWardrobeState, type PlayerAppearance } from './wardrobe-state.ts';
import { createWardrobePanel } from './wardrobe-panel.ts';
import { createWardrobePreview } from './preview.ts';
import type { WardrobeView } from './preview.ts';
import type { ProfileCommand, PublicProfile } from '@hyperfocus/touch-of-death/appearance/profile';
import type { ReplayAppearance } from '../replay/appearance.ts';
import { replayAppearanceActors, validateReplayCatalog } from './replay.ts';
import { previewAppearanceStyle } from './style-preview.ts';

/** Host-owned saves and DOM. Appearance never enters the combat input or checkpoint. */
export function createStandaloneAppearance(options: {
  project: { id: string; extensions?: Record<string, unknown> }; runtime: Awaited<ReturnType<typeof createHyperfocus3DRuntime>>;
  canvas: HTMLCanvasElement; storage: AtomicSaveStorage; combat: CombatProject3D; onInteract(): void; clearInput(): void;
  network(): ReturnType<typeof createCombatConnection> | undefined;
  profileHost(roomType: string): HTMLElement | null | undefined;
  replayAppearance?(): ReplayAppearance | undefined;
  canEquip?(slot: string, option: string): boolean;
  onTarget?(target: string): void;
  requireWorld?(): void;
  presentFighter?: Parameters<typeof createWardrobePreview>[0]['presentFighter'];
}) {
  const parsed = readAppearanceCatalog3D(options.project.extensions?.hyperfocusAppearance, options.runtime.declaration);
  const candidateActorId = options.combat.fighters.find(fighter => fighter.control === 'player')?.entityId;
  if (!parsed || !candidateActorId || !parsed.actors.some(actor => actor.entityId === candidateActorId)) return undefined;
  const actorId: string = candidateActorId;
  const fighterIndex = options.combat.fighters.findIndex(fighter => fighter.entityId === actorId);
  if (fighterIndex !== 0 && fighterIndex !== 1) throw new Error('Wardrobe actor must occupy a combat fighter seat.');
  const catalog = parsed;
  const store = createSaveProfileStore(options.storage, `${options.project.id}:appearance`, { limits: { maxSlots: 1, maxBytes: 65536 } });
  const state = createWardrobeState({ catalog,
    requireWorld: options.requireWorld,
    canEquip: options.canEquip,
    load: async () => (await store.loadSlot('local', 'wardrobe'))?.data,
    save: async value => { await store.saveSlot('local', 'wardrobe', value); },
  });
  let preview: ReturnType<typeof createWardrobePreview> | undefined, previewLook: PlayerAppearance | undefined;
  let previewView: WardrobeView = 'three-quarter';
  let previewPose: { phase: 'intro' | 'victory'; started: number } | undefined;
  let previewStyle: { channel: 'movement' | 'hit' | 'particles' | 'recovery'; started: number } | undefined;
  let presentationReducedMotion = false;
  let uploadError = '', uploadSuccess = '', publicationIdentity = '', pending = false, disposed = false;
  let retry: { identity: string; look: string; command: ProfileCommand } | undefined;
  const panel = createWardrobePanel({ canvas: options.canvas, catalog, state, onInteract: options.onInteract,
    canEquip: options.canEquip,
    onTarget: options.onTarget,
    onChange(look) { previewLook = look;if (previewPose) previewPose.started = performance.now(); },
    onPreview(phase) { previewStyle = undefined;previewPose = { phase, started: performance.now() }; },
    onPreviewStyle(channel) { previewPose = undefined;previewStyle = { channel, started: performance.now() }; },
    onView(view) { previewView = view;preview?.setView(view); },
    onOpenChange(open) { options.clearInput();if (!open) { preview?.dispose();preview = undefined;previewPose = undefined;previewStyle = undefined; } },
  });
  const online = document.createElement('div');online.className = 'hf-profile-online';online.hidden = true;
  const label = document.createElement('span'), upload = document.createElement('button'), feedback = document.createElement('span');
  upload.type = 'button';upload.textContent = 'Use saved fighter online';upload.dataset.profileUpload = '';
  label.dataset.profileName = '';feedback.setAttribute('role', 'status');feedback.setAttribute('aria-live', 'polite');
  const style = document.createElement('style');style.textContent = '.hf-profile-online{display:flex;flex-basis:100%;flex-wrap:wrap;align-items:center;gap:8px;color:#e9f1f5;padding:12px 0 0;margin-top:12px;border-top:1px solid #526676;font:13px/1.4 system-ui}.hf-profile-online[hidden]{display:none}.hf-profile-online button{font:inherit;min-height:44px;padding:8px 12px;border:1px solid #526676;background:#142d3b;color:inherit;cursor:pointer}.hf-profile-online button:focus-visible{outline:2px solid #6adbdc;outline-offset:2px}.hf-profile-online button:disabled{opacity:.6;cursor:pointer}.hf-profile-online [role=status]{flex-basis:100%}';
  online.append(style, label, upload, feedback);options.canvas.parentElement?.append(online);
  upload.addEventListener('click', () => { void send(); });
  async function send() {
    if (pending || !state.state.ready || state.state.busy || !state.state.hasSavedDeviceFighter) return;
    const network = options.network(), current = network?.state;
    const userId = current?.profileBindings.find(binding => binding.playerId === current.playerId)?.userId;
    const profile = current?.profiles.find(profile => profile.userId === userId);
    if (!network || !profile) return;
    options.onInteract();pending = true;uploadError = '';uploadSuccess = '';const look = state.state.saved.current, signature = JSON.stringify(look);
    if (!retry || retry.identity !== current!.playerId || retry.look !== signature) retry = { identity: current!.playerId, look: signature, command: { type: 'profile-save', requestId: crypto.randomUUID(), expectedRevision: profile.revision, ...look } };
    try { await network.saveProfile(retry.command);retry = undefined;if (!disposed && options.network() === network && network.state.playerId === current!.playerId) uploadSuccess = `Saved ${look.name} to this host.`; }
    catch (cause) { uploadError = cause instanceof Error ? cause.message : 'Could not save your online fighter.';if (uploadError.startsWith('Your profile changed.')) retry = undefined; }
    finally { pending = false; }
  }
  const resolved = new Map<string, { signature: string; look: ReturnType<typeof resolveAppearance3D> }>();
  function resolveLook(id: string, look: Pick<PlayerAppearance, 'selections'>) {
    const signature = JSON.stringify(look.selections);let entry = resolved.get(id);
    if (!entry || entry.signature !== signature) { entry = { signature, look: resolveAppearance3D({ catalog, actorId: id, selections: look.selections }) };resolved.set(id, entry); }
    return entry.look;
  }
  function currentLooks(replay: boolean): Array<{ actorId: string; look: Pick<PlayerAppearance, 'selections'> }> {
    if (replay) return replayAppearanceActors({ appearance: options.replayAppearance?.(), fighters: options.combat.fighters });
    const network = options.network();
    if (network?.terminalPresentation) return replayAppearanceActors({ appearance: network.terminalPresentation.appearance, fighters: options.combat.fighters });
    if (!network?.active) return state.state.ready ? [{ actorId, look: panel.open && previewLook ? previewLook : state.state.saved.current }] : [];
    const current = network.state;
    return current.matchSeats.flatMap((playerId, index) => {
      const id = options.combat.fighters[index]?.entityId, userId = current.profileBindings.find(binding => binding.playerId === playerId)?.userId;
      const look = current.profiles.find(profile => profile.userId === userId);
      return id && look && catalog.actors.some(actor => actor.entityId === id) ? [{ actorId: id, look }] : [];
    });
  }
  return {
    get state() { return state.state; },
    catalog,
    previewTarget: panel.previewTarget,
    async equipLook(selections: Record<string, string>) {
      const look = state.state.saved.current;
      state.edit({ ...look, selections: { ...look.selections, ...selections } });
      await state.save();if (state.state.error) throw new Error(state.state.error);
    },
    async equip(slotId: string, optionId: string) {
      const look = state.state.saved.current;
      state.edit({ ...look, selections: { ...look.selections, [slotId]: optionId } });
      await state.save();
      if (state.state.error) throw new Error(state.state.error);
    },
    initialProfile() { return state.initialProfile(); },
    validateReplayAppearance(appearance?: ReplayAppearance) { validateReplayCatalog({ appearance, fighters: options.combat.fighters, catalog }); },
    get focused() { return panel.focused || online.contains(document.activeElement); },
    validateProfiles(profiles: readonly PublicProfile[]) { for (const profile of profiles) resolveAppearance3D({ catalog, actorId, selections: profile.selections }); },
    fighterNames(replay: boolean) {
      const result: Record<string, { name: string; icon: string; card?: string }> = {};
      const card = (id: string, look: Pick<PlayerAppearance, 'selections'>) => resolveLook(id, look).styles?.find(style => style.channel === 'card')?.style ?? 'classic';
      if (replay) {
        for (const { actorId, look } of replayAppearanceActors({ appearance: options.replayAppearance?.(), fighters: options.combat.fighters })) result[actorId] = { name: look.name, icon: look.icon, card: card(actorId, look) };
        return result;
      }
      const network = options.network();
      if (network?.terminalPresentation) { for (const { actorId, look } of replayAppearanceActors({ appearance: network.terminalPresentation.appearance, fighters: options.combat.fighters })) result[actorId] = { name: look.name, icon: look.icon, card: card(actorId, look) };return result; }
      if (!network?.active) {
        if (state.state.ready) result[actorId] = { ...state.state.saved.current, name: state.state.hasSavedDeviceFighter ? state.state.saved.current.name : 'You', card: card(actorId, state.state.saved.current) };
        return result;
      }
      const current = network.state;
      for (const [index, playerId] of current.matchSeats.entries()) {
        const id = options.combat.fighters[index]?.entityId, userId = current.profileBindings.find(binding => binding.playerId === playerId)?.userId;
        const profile = current.profiles.find(profile => profile.userId === userId);
        if (id && profile) result[id] = { ...profile, card: card(id, profile) };
      }
      return result;
    },
    render(menu: boolean, replay: boolean) {
      const network = options.network(), current = network?.state;
      const identity = `${current?.active ? current.playerId : ''}:${state.state.saved.current.name}`;
      if (identity !== publicationIdentity) { publicationIdentity = identity;uploadSuccess = '';uploadError = ''; }
      panel.render(menu && !network?.active && !replay);
      const userId = current?.profileBindings.find(binding => binding.playerId === current.playerId)?.userId;
      const own = current?.profiles.find(profile => profile.userId === userId);
      const host = current && options.profileHost(current.roomType);if (host && online.parentElement !== host) host.append(online);
      online.hidden = !current?.active || !own || current.status !== 'lobby' && current.status !== 'waiting';
      label.textContent = own ? `On this host: ${own.name}. Saved on this device: ${state.state.hasSavedDeviceFighter ? state.state.saved.current.name : "none"}.` : '';
      const locked = current?.community?.phase === 'ready' || current?.quickPlay?.phase === 'ready' || current?.quickPlay?.phase === 'saving';
      const saved = state.state.saved.current, same = !!own && own.name === saved.name && own.icon === saved.icon && Object.entries(saved.selections).every(([slot, value]) => own.selections[slot] === value);
      const unavailable = Object.entries(saved.selections).some(([slot, value]) => options.canEquip?.(slot, value) === false);
      upload.textContent = same ? 'Your saved fighter is online' : `Use ${saved.name} online`;
      upload.disabled = pending || !state.state.ready || state.state.busy || !state.state.hasSavedDeviceFighter || locked || same || unavailable;feedback.textContent = pending ? 'Saving your online fighter...' : uploadError || uploadSuccess || (unavailable ? 'Some saved styles are not in your account collection yet. Earn them online or save a fighter using starter styles. Device coins stay on this device.' : same ? 'Friends see this fighter. Account rewards are saved by this host.' : locked ? 'Your fighter is locked for this match.' : 'Use saved fighter online replaces this host fighter with your saved device fighter.');
    },
    apply(frame: Hyperfocus3DEvaluatedFrame, replay: boolean, combatState?: CombatSnapshot, reducedMotion?: boolean) {
      presentationReducedMotion = reducedMotion ?? false;
      for (const { actorId: id, look } of currentLooks(replay)) {
        const resolved = resolveLook(id, look);applyAppearance3D(frame, resolved);
        applyAppearanceMotion3D({ frame, resolved, state: combatState, reducedMotion });
      }
    },
    styles(replay: boolean) {
      const looks = currentLooks(replay);
      return catalog.actors.flatMap(({ entityId }) => resolveLook(entityId, looks.find(look => look.actorId === entityId)?.look ?? { selections: {} }).styles ?? []);
    },
    poses(replay: boolean) {
      const looks = currentLooks(replay);
      const network = options.network(), confirmedVictory = !network?.active || ['round-result', 'match-result'].includes(network.session?.confirmedMatch?.phase ?? '') || network.terminalPresentation?.match.phase === 'match-result';
      return catalog.actors.flatMap(({ entityId }) => resolveLook(entityId, looks.find(look => look.actorId === entityId)?.look ?? { selections: {} }).poses ?? []).filter(pose => pose.phase !== 'victory' || confirmedVictory);
    },
    preview(frame: Hyperfocus3DEvaluatedFrame) {
      if (!panel.open || disposed) return;
      preview ??= createWardrobePreview({ canvas: panel.previewCanvas, runtime: options.runtime, actorId, config: options.combat.config, presentFighter: options.presentFighter });
      preview.setView(previewView);
      const progress = previewPose ? Math.min(1, (performance.now() - previewPose.started) / 2400) : 1;
      const pose = previewPose && resolveLook(actorId, previewLook ?? state.state.saved.current).poses?.find(pose => pose.phase === previewPose!.phase);
      const style = previewStyle;
      const decorate = style ? (frame: Hyperfocus3DEvaluatedFrame, combatState: CombatSnapshot) => previewAppearanceStyle({ frame, actorId,
        state: combatState, channel: style.channel, progress: Math.min(1, (performance.now() - style.started) / 1800),
        resolved: resolveLook(actorId, previewLook ?? state.state.saved.current), reducedMotion: presentationReducedMotion }) : undefined;
      preview.render(frame, actorId, pose && progress < 1 ? { style: pose.style, phase: pose.phase,
        fighterIndex,
        progress, settle: Math.min(1, Math.max(0, (1 - progress) * 4)) } : undefined, decorate, style ? { channel: style.channel,
          style: resolveLook(actorId, previewLook ?? state.state.saved.current).styles?.find(patch => patch.channel === style.channel)?.style ?? 'classic',
          progress: Math.min(1, (performance.now() - style.started) / 1800), tick: Math.floor((performance.now() - style.started) * 60 / 1000), reducedMotion: presentationReducedMotion } : undefined);
      if (progress === 1) previewPose = undefined;
      if (style && performance.now() - style.started > (style.channel === 'particles' ? 4800 : 1800)) previewStyle = undefined;
    },
    dispose() { disposed = true;preview?.dispose();panel.dispose();online.remove(); },
  };
}
