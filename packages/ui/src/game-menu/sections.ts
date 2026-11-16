/** Bounded categories for settings and rewards; inactive content leaves every input graph. */
export function createGameSections(options: { parent: HTMLElement; label: string; sections: readonly { id: string; label: string; content: HTMLElement }[] }) {
  if (options.sections.length > 5 || new Set(options.sections.map(item => item.id)).size !== options.sections.length) throw Error('Use at most five distinct game-menu categories.');
  const element = document.createElement('div');element.className = 'hf-game-sections';element.setAttribute('role', 'tablist');element.setAttribute('aria-label', options.label);
  const prefix = `game-sections-${crypto.randomUUID()}`;
  const entries = options.sections.map((section, index) => {
    const button = document.createElement('button');button.type = 'button';button.textContent = section.label;button.id = `${prefix}-tab-${index}`;button.setAttribute('role', 'tab');
    section.content.id = `${prefix}-panel-${index}`;section.content.setAttribute('role', 'tabpanel');section.content.setAttribute('aria-labelledby', button.id);button.setAttribute('aria-controls', section.content.id);
    element.append(button);return { ...section, button, available: true };
  });
  let selected: string | undefined = entries[0]?.id;
  function select(id: string) {
    const entry = entries.find(entry => entry.id === id && entry.available);if (!entry) return;selected = id;
    for (const entry of entries) { const current = entry.id === id;entry.button.setAttribute('aria-selected', String(current));entry.button.tabIndex = current ? 0 : -1;entry.content.hidden = !current; }
  }
  for (const entry of entries) entry.button.onclick = () => select(entry.id);
  const onKey = (event: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();event.stopPropagation();
    const available = entries.filter(entry => entry.available), current = available.findIndex(entry => entry.id === selected);
    const next = available[event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + available.length) % available.length];
    if (next) { select(next.id);next.button.focus(); }
  };
  element.addEventListener('keydown', onKey);options.parent.prepend(element);if (selected) select(selected);
  return { element, select,
    available(ids: readonly string[]) { for (const entry of entries) { entry.available = ids.includes(entry.id);entry.button.hidden = !entry.available; }if (!ids.includes(selected ?? '')) selected = entries.find(entry => entry.available)?.id;if (selected) select(selected); },
    dispose() { element.removeEventListener('keydown', onKey);element.remove(); },
  };
}
