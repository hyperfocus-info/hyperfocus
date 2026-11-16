type Mapping = { action: string; bindings: readonly string[] };
/** Measures physical presses, independent of Drive's optional toggle latch. */
export function createDriveTapInput(options: { mappings: readonly Mapping[] }) {
  const memory = new Map<string, { down: boolean; start?: number }>(), pending = new Set<string>(), released = new Set<string>();
  const edges: Array<{ binding: string; down: boolean; timeMs: number }> = [];
  let signature = '';
  return {
    recordKeyboard(edge: { binding: string; down: boolean; timeMs: number }) { if (edges.length < 128 && options.mappings.some(mapping => mapping.action.endsWith(':drive') && mapping.bindings.includes(edge.binding))) edges.push(edge); },
    poll(input: { nowMs: number; keyboard: ReadonlySet<string>; gamepad: ReadonlySet<string>; active: boolean; gamepadConnected?: boolean }) {
      const drives = options.mappings.filter(mapping => mapping.action.endsWith(':drive'));
      const nextSignature = JSON.stringify(drives);
      const changed = !!signature && signature !== nextSignature;signature = nextSignature;
      const active = input.active && !changed;
      if (!active) pending.clear();
      for (const mapping of drives) for (const device of ['keyboard', 'gamepad'] as const) {
        const key = `${mapping.action}/${device}`, saved = memory.get(key) ?? { down: false };
        if (device === 'gamepad' && input.gamepadConnected === false) { delete saved.start;saved.down = false; }
        const update = (down: boolean, time: number) => {
          if (active && down && !saved.down) saved.start = time;
          if (active && !down && saved.down && saved.start !== undefined && time >= saved.start && time - saved.start < 250 && !released.has(mapping.action)) { pending.add(mapping.action.replace(/drive$/, 'jump-tap'));released.add(mapping.action); }
          if (!active || !down) delete saved.start;saved.down = down;
        };
        if (device === 'keyboard') for (const edge of edges) if (mapping.bindings.includes(edge.binding)) update(edge.down, edge.timeMs);
        update(mapping.bindings.some(binding => input[device].has(binding)), input.nowMs);memory.set(key, saved);
      }
      for (const mapping of drives) if (!memory.get(`${mapping.action}/keyboard`)?.down && !memory.get(`${mapping.action}/gamepad`)?.down) released.delete(mapping.action);
      edges.length = 0;return new Set(pending);
    },
    acknowledge() { pending.clear(); },
    reset() { pending.clear();released.clear();edges.length = 0;for (const saved of memory.values()) delete saved.start; },
  };
}
