import type { GameplayPresentation3D } from '@hyperfocus/engine/project/runtime-3d';

/** Integer sliders emit an absolute action so fast pointer changes keep their latest value. */
export function createGameplayRange(options: { item: NonNullable<GameplayPresentation3D['actions']>[number]; actions: Set<string>; onInteract: () => void }) {
  const element = document.createElement('label'), text = document.createElement('span'), input = document.createElement('input');
  element.className = 'hf3d-action-range';element.dataset.gameplayAction = options.item.action;
  input.type = 'range';input.step = '1';element.append(text, input);
  const refreshLabel = () => { text.textContent = `${input.getAttribute('aria-label')}: ${input.value} / ${input.max}`;input.setAttribute('aria-valuetext', `${input.value} of ${input.max}`); };
  input.addEventListener('input', () => {
    for (const action of options.actions) if (action.startsWith(`${options.item.action}:`)) options.actions.delete(action);
    options.actions.add(`${options.item.action}:${input.value}`);refreshLabel();options.onInteract();
  });
  return {
    element,
    render(item: NonNullable<GameplayPresentation3D['actions']>[number]) {
      if (!item.range) return;
      input.min = String(item.range.min);input.max = String(item.range.max);input.value = String(item.range.value);input.disabled = item.disabled === true;
      input.setAttribute('aria-label', item.label);refreshLabel();
    },
  };
}
