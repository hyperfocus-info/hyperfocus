export const practiceMenuCategories = [
  { id: 'lessons', label: 'Learn a technique', purpose: 'Guided practice, watchable examples and feedback on your attempts.', actions: ['parry-drill', 'tech-drill', 'di-drill', 'arena-lesson', 'combo-lesson'] },
  { id: 'defense', label: 'Dummy behavior', purpose: 'A standing target, held guard, or mixed recovery.', actions: ['neutral', 'guard', 'random'] },
  { id: 'recovery', label: 'Launch & recovery', purpose: 'Practice following drift, techs and armored escapes.', actions: ['outward', 'sideways', 'tech', 'escape'] },
] as const;
const categories = practiceMenuCategories;

/** Pages reuse the real action buttons; selection never creates a second command path. */
export function createPracticePages(options: { actions: HTMLElement }) {
  const nav = document.createElement('nav');nav.className = 'hf-practice-pages';nav.setAttribute('aria-label', 'Practice setup');
  const heading = document.createElement('p');heading.className = 'hf-practice-page-title';
  const back = document.createElement('button');back.type = 'button';back.textContent = 'Back to Practice';back.dataset.menuBack = '';
  const choices = categories.map(category => {
    const button = document.createElement('button');button.type = 'button';button.textContent = category.label;
    button.onclick = () => { page = category.id;refresh();options.actions.querySelector<HTMLButtonElement>('button:not([hidden]):not(:disabled)')?.focus(); };
    return button;
  });
  nav.append(heading, back, ...choices);let page = '', active = false;
  back.onclick = () => { const previous = categories.findIndex(category => category.id === page);page = '';refresh();choices[previous]?.focus(); };
  function refresh() {
    nav.hidden = !active;
    const category = categories.find(category => category.id === page);
    heading.textContent = category?.id === 'recovery' ? 'Choose how the dummy responds to your hits.' : category?.id === 'defense' ? 'Choose how the dummy defends. Your controls stay unchanged.' : category?.label ?? 'Practice';back.hidden = !category;
    choices.forEach(button => { button.hidden = !!category; });
    for (const button of options.actions.querySelectorAll<HTMLButtonElement>('[data-gameplay-action]')) {
      const action = button.dataset.gameplayAction!;
      const known = categories.some(item => item.actions.some(id => action === `practice:${id}`));
      button.hidden = active && (category ? !category.actions.some(id => action === `practice:${id}`) : known);
    }
  }
  return {
    render(value: boolean) { if (active !== value) page = '';active = value;if (active && nav.nextElementSibling !== options.actions) options.actions.before(nav);refresh(); },
    dispose() { nav.remove(); },
  };
}
