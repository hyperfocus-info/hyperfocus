export type KeyboardBindings = Record<string, string>;

export type KeyboardState = {
  set(code: string, isDown: boolean): boolean;
  bind(code: string, action: string): void;
  down(action: string): boolean;
  held(action: string): boolean;
  pressed(action: string): boolean;
  released(action: string): boolean;
  consume(action: string): boolean;
  consumeRelease(action: string): boolean;
  update(): void;
  reset(): void;
  state(action: string): { down: boolean; held: boolean; pressed: boolean; released: boolean };
  dispose(): void;
};

type KeyboardEventTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;
export type KeyboardActionOptions = {
  resetOnBlur?: boolean;
  /** Clears held keys when a tab is hidden, frozen, or placed in page cache. */
  resetOnLifecycleChange?: boolean;
  lifecycleTarget?: KeyboardEventTarget;
};

function clearRecord(record: Record<string, boolean>) {
  for (const action of Object.keys(record)) delete record[action];
}

export function createKeyboardState(bindings: KeyboardBindings = {}): KeyboardState {
  const held: Record<string, boolean> = Object.create(null);
  const pressed: Record<string, boolean> = Object.create(null);
  const released: Record<string, boolean> = Object.create(null);
  const downCodes = new Set<string>();

  function isActionHeld(action: string) {
    for (const [boundCode, boundAction] of Object.entries(bindings)) {
      if (boundAction === action && downCodes.has(boundCode)) return true;
    }
    return false;
  }

  function refreshAction(action: string, wasHeld: boolean) {
    const isHeld = isActionHeld(action);
    held[action] = isHeld;
    if (isHeld && !wasHeld) pressed[action] = true;
    if (!isHeld && wasHeld) released[action] = true;
  }

  function set(code: string, isDown: boolean) {
    if (!Object.prototype.hasOwnProperty.call(bindings, code)) return false;
    const action = bindings[code];
    if (typeof action !== "string" || action.length === 0) return false;
    const wasHeld = held[action] === true;
    if (isDown) downCodes.add(code);
    else downCodes.delete(code);
    refreshAction(action, wasHeld);
    return true;
  }

  const state = {
    set,
    bind(code: string, action: string) {
      const previousAction = Object.prototype.hasOwnProperty.call(bindings, code) ? bindings[code] : undefined;
      const previousWasHeld = typeof previousAction === "string" && held[previousAction] === true;
      const nextWasHeld = held[action] === true;
      bindings[code] = action;
      if (typeof previousAction === "string" && previousAction !== action) refreshAction(previousAction, previousWasHeld);
      if (previousAction !== action) refreshAction(action, nextWasHeld);
    },
    down(action: string) {
      return held[action] === true;
    },
    held(action: string) {
      return held[action] === true;
    },
    pressed(action: string) {
      return pressed[action] === true;
    },
    released(action: string) {
      return released[action] === true;
    },
    consume(action: string) {
      const wasDown = pressed[action] === true;
      pressed[action] = false;
      return wasDown;
    },
    consumeRelease(action: string) {
      const wasReleased = released[action] === true;
      released[action] = false;
      return wasReleased;
    },
    update() {
      for (const action of Object.keys(pressed)) pressed[action] = false;
      for (const action of Object.keys(released)) released[action] = false;
    },
    reset() {
      downCodes.clear();
      clearRecord(held);
      clearRecord(pressed);
      clearRecord(released);
    },
    state(action: string) {
      return {
        down: held[action] === true,
        held: held[action] === true,
        pressed: pressed[action] === true,
        released: released[action] === true
      };
    },
    dispose() {
      state.reset();
    }
  };
  return state;
}

function eventCode(event: Event): string | undefined {
  const code: unknown = Reflect.get(event, "code");
  return typeof code === "string" ? code : undefined;
}

function lifecycleIsHidden(target: KeyboardEventTarget) {
  const hidden: unknown = Reflect.get(target, "hidden");
  const visibilityState: unknown = Reflect.get(target, "visibilityState");
  return hidden === true || visibilityState === "hidden";
}

export function createKeyboardActions(
  bindings: KeyboardBindings,
  target: KeyboardEventTarget | null | undefined = typeof window === "undefined" ? undefined : window,
  options: KeyboardActionOptions = {}
) {
  if (!target) throw new Error("createKeyboardActions requires an event target outside the browser");
  const state = createKeyboardState(bindings);
  const resetOnBlur = options.resetOnBlur ?? true;
  const resetOnLifecycleChange = options.resetOnLifecycleChange ?? true;
  const lifecycleTarget = options.lifecycleTarget
    ?? (typeof document === "undefined" ? target : document);

  function onKeyDown(event: Event) {
    const code = eventCode(event);
    if (code === undefined) return;
    if (state.set(code, true)) event.preventDefault();
  }

  function onKeyUp(event: Event) {
    const code = eventCode(event);
    if (code === undefined) return;
    if (state.set(code, false)) event.preventDefault();
  }

  function onBlur() {
    state.reset();
  }

  function onVisibilityChange() {
    if (lifecycleIsHidden(lifecycleTarget)) state.reset();
  }

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  if (resetOnBlur) target.addEventListener("blur", onBlur);
  if (resetOnLifecycleChange) {
    lifecycleTarget.addEventListener("visibilitychange", onVisibilityChange);
    target.addEventListener("pagehide", onBlur);
    target.addEventListener("freeze", onBlur);
  }

  return {
    ...state,
    dispose() {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      if (resetOnBlur) target.removeEventListener("blur", onBlur);
      if (resetOnLifecycleChange) {
        lifecycleTarget.removeEventListener("visibilitychange", onVisibilityChange);
        target.removeEventListener("pagehide", onBlur);
        target.removeEventListener("freeze", onBlur);
      }
      state.dispose();
    }
  };
}
