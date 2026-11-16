type Bindings = { keyboard: ReadonlySet<string>; gamepad: ReadonlySet<string> };

/** Resets and foreground returns must not turn held buttons into fresh presses. */
export function createTrainingReleaseInput() {
  let keyboard = new Set<string>(), gamepad = new Set<string>();
  function released(current: ReadonlySet<string>, blocked: Set<string>) {
    for (const binding of blocked) if (!current.has(binding)) blocked.delete(binding);
    return new Set([...current].filter(binding => !blocked.has(binding)));
  }
  return {
    capture(input: Bindings) { keyboard = new Set(input.keyboard);gamepad = new Set(input.gamepad); },
    releaseKeyboard(input: { binding: string }) { keyboard.delete(input.binding); },
    filter(input: Bindings) { return { keyboard: released(input.keyboard, keyboard), gamepad: released(input.gamepad, gamepad) }; },
  };
}
