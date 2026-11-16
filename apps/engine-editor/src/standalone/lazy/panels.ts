import type { createCombatConnectionPanel } from '../../scene3d/network/panel.ts';
import type { createCombatReplayPanel } from '../../scene3d/replay/panel.ts';

/** Keep recording and connections live; acquire their optional UI only on player intent. */
export function createDeferredNetworkPanel(options: Parameters<typeof createCombatConnectionPanel>[0]) {
  type Panel = ReturnType<typeof createCombatConnectionPanel>;
  let state: Parameters<Panel['render']> | undefined;
  const lazy = deferredPanel(options.canvas, [
    ['data-network-open', 'Play with friends'], ['data-network-quick', 'Online Quick Play'],
  ], async () => (await import('../../scene3d/network/panel.ts')).createCombatConnectionPanel(options), panel => { if (state) panel.render(...state); });
  const invitation = () => { if (location.hash.startsWith('#tod-room:')) lazy.run(() => {}); };
  window.addEventListener('hashchange', invitation);queueMicrotask(invitation);
  return {
    get focused() { return lazy.panel?.focused ?? lazy.loading; },
    receiveVoice(...args: Parameters<Panel['receiveVoice']>) { lazy.panel?.receiveVoice(...args); },
    receiveVoiceReport(...args: Parameters<Panel['receiveVoiceReport']>) { lazy.panel?.receiveVoiceReport(...args); },
    invalidateUploads(ownerId: string) { lazy.panel?.invalidateUploads(ownerId); },
    uploadVisibility: () => lazy.panel?.uploadVisibility() ?? { hidden: true, blocked: [] },
    voiceState: () => lazy.panel?.voiceState(),
    voiceStats: () => lazy.panel?.voiceStats() ?? Promise.resolve([]),
    profileHost: (roomType: string) => lazy.panel?.profileHost(roomType) ?? null,
    render(...args: Parameters<Panel['render']>) {
      state = args;
      lazy.buttons[0]!.hidden = args[0].active || !args[1];
      lazy.buttons[1]!.hidden = args[0].active || !args[1] || !options.quickPlay;
      lazy.panel?.render(...args);
    },
    dispose() { window.removeEventListener('hashchange', invitation);lazy.dispose(); },
  };
}

export function createDeferredReplayPanel(options: Parameters<typeof createCombatReplayPanel>[0]) {
  type Panel = ReturnType<typeof createCombatReplayPanel>;
  let state: Parameters<Panel['render']> | undefined;
  const lazy = deferredPanel(options.canvas, [['data-replay-open', 'Watch a replay']],
    async () => (await import('../../scene3d/replay/panel.ts')).createCombatReplayPanel(options), panel => { if (state) panel.render(...state); });
  return {
    get focused() { return lazy.panel?.focused ?? lazy.loading; },
    async prepare() { await lazy.prepare(); },
    reviewRecent() { lazy.run(panel => panel.reviewRecent()); },
    render(...args: Parameters<Panel['render']>) { state = args;lazy.buttons[0]!.hidden = args[0].active || !args[1];lazy.panel?.render(...args); },
    dispose: lazy.dispose,
  };
}

function deferredPanel<T extends { dispose(): void }>(canvas: HTMLCanvasElement, actions: string[][], create: () => Promise<T>, initialize: (panel: T) => void) {
  const host = document.createElement('section'), status = document.createElement('p');
  host.style.cssText = 'position:absolute;left:5%;top:6%;z-index:14;pointer-events:none';
  status.setAttribute('role', 'status');status.setAttribute('aria-live', 'polite');status.hidden = true;
  status.style.cssText = 'background:#101c28;color:#e9f1f5;padding:8px';
  host.append(status);canvas.parentElement?.append(host);
  let panel: T | undefined, pending: Promise<T | undefined> | undefined, disposed = false;
  const buttons = actions.map(([attribute, label]) => {
    const button = document.createElement('button');button.type = 'button';button.setAttribute(attribute!, '');button.textContent = label!;
    button.style.pointerEvents = 'auto';button.hidden = true;host.append(button);
    button.addEventListener('click', () => run(() => canvas.parentElement?.querySelector<HTMLButtonElement>(`[${attribute}]`)?.click()));
    return button;
  });
  async function prepare() {
    if (disposed) throw Error('This feature has been closed.');
    if (panel) return panel;
    if (pending) return pending;
    status.hidden = false;status.textContent = 'Loading…';buttons.forEach(button => { button.disabled = true; });
    pending = create().then(value => {
      if (disposed) { value.dispose();return; }
      panel = value;initialize(value);host.remove();return value;
    }).catch(cause => {
      if (!disposed) { status.textContent = 'Could not load this feature. Select it again to retry.';buttons.forEach(button => { button.disabled = false; }); }
      throw cause;
    }).finally(() => { pending = undefined; });
    return pending;
  }
  function run(action: (value: T) => void) {
    if (disposed || pending) return;
    void prepare().then(value => { if (value && !disposed) action(value); }).catch(() => undefined);
  }
  return { buttons, run, prepare, get panel() { return panel; }, get loading() { return !!pending; }, dispose() { disposed = true;panel?.dispose();host.remove(); } };
}
