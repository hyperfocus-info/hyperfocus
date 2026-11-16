/** Project existing launchers into one menu rail; original panels own every action. */
export function createFightMenuDock(options: { host: HTMLElement; footer: HTMLElement; playerOnly?: boolean }) {
  const dock = document.createElement('nav');dock.className = 'hf3d-menu-dock';dock.setAttribute('aria-label', 'More ways to play');
  const entries = new Map<HTMLElement, { button: HTMLButtonElement; hiddenOwner: HTMLElement; onFocus: () => void; primary: boolean }>();
  const selectors = ['[data-network-open]', '[data-network-quick]', '[data-replay-open]', '[data-wardrobe-open]', '[data-rewards-open]', '.hf-runtime-controls>summary', '[data-practice-open]', '.hf-combat-reference>summary', '.playable-controls>details:not(.playable-transcript)>summary', '[data-training-open]', '[data-community-open]', '.hf-live-menu>summary', '.hf-room-pictures>summary', '[data-voice-quick-mute]'];
  const developerSelectors = ['[data-ai-report-open]', '[data-ai-insights-open]', '[data-ai-history-clear]', '[data-bulk-training-open]'];
  if (!options.playerOnly) selectors.push(...developerSelectors);
  const suppressed = new Map<HTMLElement, HTMLElement['hidden']>();
  let liveMenu: HTMLDetailsElement | undefined;
  const more = document.createElement('button'), back = document.createElement('button');more.type = back.type = 'button';more.textContent = 'More options';back.textContent = 'Back';back.dataset.menuBack = '';dock.append(more, back);
  let expanded = false;
  function refresh() { dock.dataset.expanded = String(expanded);more.hidden = expanded;back.hidden = !expanded;for (const [source, entry] of entries) entry.button.hidden = (entry.primary ? expanded : !expanded) || Boolean(source.closest('[hidden]')); }
  more.onclick = () => { expanded = true;refresh();back.focus(); };
  back.onclick = () => { expanded = false;refresh();more.focus(); };
  options.footer.append(dock);dock.hidden = true;
  function clear() {
    for (const [source, hidden] of suppressed) source.hidden = hidden;
    suppressed.clear();
    for (const { hiddenOwner } of entries.values()) delete hiddenOwner.dataset.menuDocked;
    dock.hidden = true;expanded = false;
  }
  return {
    render(active: boolean) {
      const live = options.host.querySelector<HTMLElement>('.hf-network-live');
      if (live && !liveMenu) { liveMenu = document.createElement('details');liveMenu.className = 'hf-live-menu';const summary = document.createElement('summary');summary.textContent = 'Online fight tools';live.before(liveMenu);liveMenu.append(summary, live); }
      if (liveMenu && live) liveMenu.hidden = live.hidden;
      if (!active) { clear();return; }
      dock.hidden = false;if (dock.nextElementSibling) options.footer.append(dock);
      if (options.playerOnly) for (const source of options.host.querySelectorAll<HTMLElement>(developerSelectors.join(','))) {
        if (!suppressed.has(source)) suppressed.set(source, source.hidden);
        source.hidden = true;
      }
      for (const selector of selectors) {
        const source = options.host.querySelector<HTMLElement>(selector);
        if (!source) continue;
        let entry = entries.get(source);
        if (!entry) {
          const button = document.createElement('button');button.type = 'button';button.dataset.menuProxy = '';
          const hiddenOwner = source.tagName === 'SUMMARY' ? source.parentElement! : source;
          button.onclick = () => { source.click();if (source.tagName === 'SUMMARY') {
            const first = hiddenOwner.matches('.hf-combat-reference') ? hiddenOwner.querySelector<HTMLButtonElement>('button:not(:disabled)') : undefined;
            (first ?? source).focus({ preventScroll: true });
          } };
          const onFocus = () => { if (source.tagName !== 'SUMMARY' && hiddenOwner.dataset.menuDocked === 'true') button.focus({ preventScroll: true }); };
          source.addEventListener('focus', onFocus);
          const primary = source.matches('[data-network-open], [data-network-quick], [data-community-open], [data-training-open], .hf-live-menu>summary, .hf-combat-reference>summary, .hf-practice-diagnostics>summary');
          entry = { button, hiddenOwner, onFocus, primary };entries.set(source, entry);if (primary) dock.insertBefore(button, more);else dock.append(button);
        }
        // Refresh owns visibility once. Temporarily hiding a focused primary
        // proxy before restoring it makes browsers blur it on every frame.
        entry.button.disabled = source instanceof HTMLButtonElement && source.disabled;
        const label = source.textContent?.trim() ?? '';
        if (entry.button.textContent !== label) { entry.button.textContent = label;entry.button.setAttribute('aria-label', label); }
        entry.hiddenOwner.dataset.menuDocked = 'true';
      }
      refresh();
    },
    dispose() { clear();for (const [source, entry] of entries) source.removeEventListener('focus', entry.onFocus);const live = liveMenu?.querySelector('.hf-network-live');if (live) liveMenu!.before(live);liveMenu?.remove();dock.remove();entries.clear(); },
  };
}
