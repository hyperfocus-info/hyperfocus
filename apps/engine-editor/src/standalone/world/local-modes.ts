/** App launchers whose implementations still require a main-thread world. */
const selectors = [
  '[data-network-open]', '[data-network-quick]', '[data-replay-open]', '[data-wardrobe-open]',
  '[data-routine-open]', '[data-tutorial-open]', '[data-ai-report-open]', '[data-ai-insights-open]',
];

export function lockLocalWorldLaunchers(host: HTMLElement | null) {
  const events = new AbortController();
  const reason = 'Reload the standard playable to use this mode.';
  const restores: Array<() => void> = [];
  for (const source of host?.querySelectorAll<HTMLElement>(selectors.join(',')) ?? []) {
    const unavailable = source.dataset.menuUnavailable, explanation = source.dataset.menuUnavailableReason;
    source.dataset.menuUnavailable = 'true';source.dataset.menuUnavailableReason = reason;
    // Source controls also serve pause/developer menus. Capture blocks their
    // launch before any modal opens; the command owners independently reject it.
    source.addEventListener('click', event => { event.preventDefault();event.stopImmediatePropagation(); }, { capture: true, signal: events.signal });
    restores.push(() => {
      if (unavailable === undefined) delete source.dataset.menuUnavailable;else source.dataset.menuUnavailable = unavailable;
      if (explanation === undefined) delete source.dataset.menuUnavailableReason;else source.dataset.menuUnavailableReason = explanation;
    });
  }
  return () => { events.abort();for (const restore of restores) restore(); };
}
