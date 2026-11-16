import type { GameplayPresentation3D } from '@hyperfocus/engine/project/runtime-3d';

type Pad = { index: number; id?: string; connected: boolean; mapping: string; axes: readonly number[]; buttons: readonly { pressed: boolean; value: number }[] };

const buttonDown = (button: Pad['buttons'][number]) => button.pressed || button.value > .5;

/** Device display follows fresh physical input, not connection or held state. */
export function create3DInputActivity() {
  const previous = new Map<number, { id?: string; mapping: string; buttons: boolean[]; axes: number[] }>(), seen = new Set<number>();
  let controller = false, activePad: number | undefined, suspended = false;
  return {
    get controller() { return controller; },
    keyboard() { controller = false;activePad = undefined; },
    suspend() { suspended = true; },
    sample(options: { gamepads: readonly (Pad | null)[]; visible?: boolean }) {
      if (options.visible === false) { suspended = true;return; }
      const connected = new Set<number>();
      for (const pad of options.gamepads) {
        if (!pad?.connected) continue;
        connected.add(pad.index);
        const saved = previous.get(pad.index), buttons = pad.buttons.map(buttonDown);
        const axes = pad.axes.map((value, index) => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : saved?.axes[index] ?? 0);
        const same = saved && saved.id === pad.id && saved.mapping === pad.mapping && saved.buttons.length === buttons.length && saved.axes.length === axes.length;
        if (saved && !same && activePad === pad.index) { controller = false;activePad = undefined; }
        let changed = !seen.has(pad.index) && (buttons.some(Boolean) || axes.some(value => Math.abs(value) >= .2));
        if (same && !suspended) {
          changed = buttons.some((down, index) => down !== saved.buttons[index]);
          for (let index = 0; index < axes.length; index += 2) {
            const x = axes[index] ?? 0, y = axes[index + 1] ?? 0, oldX = saved.axes[index] ?? 0, oldY = saved.axes[index + 1] ?? 0;
            // A significant change accumulates against the last accepted sample.
            // This recognizes slow stick turns without letting resting jitter win.
            if (Math.max(Math.hypot(x, y), Math.hypot(oldX, oldY)) >= .2 && Math.hypot(x - oldX, y - oldY) >= .1) changed = true;
            else { axes[index] = oldX;if (index + 1 < axes.length) axes[index + 1] = oldY; }
          }
        }
        if (!suspended && changed) { controller = true;activePad = pad.index; }
        previous.set(pad.index, { id: pad.id, mapping: pad.mapping, buttons, axes });seen.add(pad.index);
      }
      for (const index of previous.keys()) if (!connected.has(index)) previous.delete(index);
      if (activePad !== undefined && !connected.has(activePad)) { controller = false;activePad = undefined; }
      suspended = false;
    },
  };
}

function browserGamepads() {
  try { return document.hidden ? [] : navigator.getGamepads?.() ?? []; }
  catch { return []; }
}

/** Host event ownership keeps synthetic controller menu events out of device choice. */
export function create3DInputDevice() {
  const activity = create3DInputActivity();
  let focused = document.hasFocus(), disposed = false;
  const keyboard = (event: KeyboardEvent) => {
    if (!event.isTrusted || event.type === 'keydown' && event.repeat || document.hidden) return;
    activity.sample({ gamepads: browserGamepads() });activity.keyboard();
  };
  const pointer = (event: PointerEvent) => {
    if (!event.isTrusted || document.hidden || event.type === 'pointermove' && !event.movementX && !event.movementY) return;
    activity.sample({ gamepads: browserGamepads() });activity.keyboard();
  };
  const wheel = (event: WheelEvent) => {
    if (!event.isTrusted || document.hidden || !event.deltaX && !event.deltaY && !event.deltaZ) return;
    activity.sample({ gamepads: browserGamepads() });activity.keyboard();
  };
  const blur = () => { focused = false;activity.suspend(); };
  const focus = () => { focused = true;activity.suspend(); };
  const visibility = () => activity.suspend();
  window.addEventListener('keydown', keyboard, true);window.addEventListener('keyup', keyboard, true);
  window.addEventListener('pointerdown', pointer, true);window.addEventListener('pointerup', pointer, true);window.addEventListener('pointermove', pointer, true);window.addEventListener('wheel', wheel, { capture: true, passive: true });
  window.addEventListener('blur', blur);window.addEventListener('focus', focus);document.addEventListener('visibilitychange', visibility);
  return {
    get controller() { return activity.controller; },
    poll() {
      const gamepads = disposed || !focused ? [] : browserGamepads();
      if (!disposed) activity.sample({ gamepads, visible: focused && !document.hidden });
      return read3DGamepadInput({ gamepads });
    },
    dispose() {
      disposed = true;
      window.removeEventListener('keydown', keyboard, true);window.removeEventListener('keyup', keyboard, true);
      window.removeEventListener('pointerdown', pointer, true);window.removeEventListener('pointerup', pointer, true);window.removeEventListener('pointermove', pointer, true);window.removeEventListener('wheel', wheel, true);
      window.removeEventListener('blur', blur);window.removeEventListener('focus', focus);document.removeEventListener('visibilitychange', visibility);
    },
  };
}

/** Named bindings stay portable project data; browser-specific polling stays in this host. */
export function read3DGamepadInput(options: { gamepads: readonly (Pad | null)[] }) {
  const bindings = new Set<string>();
  const connected = options.gamepads.filter((pad): pad is Pad => Boolean(pad?.connected));
  const primary = connected.find(pad => pad.mapping === 'standard');
  for (const pad of connected) for (let index = 0; index < pad.buttons.length; index++) {
    const button = pad.buttons[index];
    if (!button || (!button.pressed && !(button.value > .5))) continue;
    bindings.add(`Gamepad${pad.index}.Button${index}`);
    if (pad === primary) bindings.add(`Gamepad.Button${index}`);
  }
  return { bindings, axes: (primary ?? connected.at(0))?.axes };
}

export function poll3DGamepadInput() {
  return read3DGamepadInput({ gamepads: browserGamepads() });
}

export function controllerPresentation(options: { presentation: GameplayPresentation3D | undefined; connected: boolean }) {
  const { presentation } = options;
  if (!presentation || presentation.layout === 'fight' || !options.connected || !presentation.actions?.some(action => action.action.endsWith(':guard'))) return presentation;
  return { ...presentation, hint: 'DualSense: left stick move / aim attacks · Cross jump in any direction; hold for height; press in hit stun to tech · Square strike · Triangle heavy · R2 hold Drive · Circle tap step / air dash; hold to sprint · R1 feint · L1 guard / re-press parry · L2 escape · L3 evade · R3 lock-on · Options pause · Create restart · D-pad: up quick reply, down grab / pick up / throw, left sidestep, right evasive strike (after parry) · Touchpad practice controls · Right stick, PS and mute unassigned' };
}
