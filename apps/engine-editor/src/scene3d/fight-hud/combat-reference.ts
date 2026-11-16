import { createGameSelect } from '@hyperfocus/ui/game-menu';

/** Short readable pages keep every help section reachable without a scroll wheel. */
export function createCombatReference() {
  const root = document.createElement('details'), summary = document.createElement('summary');
  const title = document.createElement('h3'), text = document.createElement('p'), nav = document.createElement('nav');
  const previous = document.createElement('button'), next = document.createElement('button');
  const topic = createGameSelect({ element: document.createElement('button'), ariaLabel: 'Combat help topic' });
  topic.element.addEventListener('change', () => { index = Math.max(0, pages.findIndex(page => page.title === topic.value));show(); });
  root.className = 'hf-combat-reference';summary.textContent = 'Combat controls';root.hidden = true;
  nav.setAttribute('aria-label', 'Control pages');previous.type = next.type = 'button';previous.textContent = 'Previous';next.textContent = 'Next';
  previous.dataset.referencePrevious = '';next.dataset.referenceNext = '';
  nav.append(previous, next);root.append(summary, topic.element, title, nav, text);title.setAttribute('aria-live', 'polite');
  let source = '', index = 0, pages: Array<{ title: string; text: string }> = [];
  function show() {
    const page = pages[index];title.textContent = page ? `${page.title} · ${index + 1} / ${pages.length}` : 'Controls';
    if (page) topic.value = page.title;
    text.textContent = page?.text ?? '';previous.disabled = index === 0;next.disabled = index >= pages.length - 1;
    root.scrollTop = 0;
  }
  function change(delta: number) { index = Math.max(0, Math.min(pages.length - 1, index + delta));show();if (document.activeElement === previous && previous.disabled) next.focus();if (document.activeElement === next && next.disabled) previous.focus(); }
  previous.onclick = () => change(-1);next.onclick = () => change(1);
  return {
    element: root,
    render(hint: string, visible: boolean) {
      root.hidden = !visible;if (!visible) root.open = false;
      if (hint === source) return;source = hint;index = 0;
      const groups = new Map<string, string[]>();
      for (const line of hint.split('\n').filter(Boolean)) {
        const name = line.startsWith('Defense signals:') ? 'Defense signals'
          : /wall|move \/ aim|sprint|lock-on/.test(line) && !/cracked structures|grapple/.test(line) ? 'Movement'
          : /Guard covers|guard \/|After parry|Launch steering|Defense signals|shield =/.test(line) ? 'Defense'
          : /grapple|White outlines/.test(line) ? 'Items and terrain' : 'Attacks and timing';
        const lines = groups.get(name) ?? [];lines.push(line);groups.set(name, lines);
      }
      pages = [...groups].flatMap(([title, lines]) => { const chunks: typeof pages = [];for (let i = 0; i < lines.length; i += 2) chunks.push({ title, text: lines.slice(i, i + 2).join('\n\n') });return chunks; });
      topic.setOptions([...groups.keys()].map(value => ({ value, label: value })));
      show();
    },
    dispose() { topic.dispose();root.remove(); },
  };
}
