/** A pause edge belongs to the host until release, including aliases on the same key. */
export function createPauseInputGate() {
  let held = false, consuming = false;
  return {
    step(input: { actions: Set<string>; paused: boolean; handlesStart: boolean }) {
      const down = input.actions.has('pause');
      const toggle = down && !held && (input.paused || !input.handlesStart);
      held = down;
      if (!down) consuming = false;
      if (toggle) consuming = true;
      if (consuming) input.actions.clear();
      return { toggle, consumed: consuming };
    },
  };
}
