/** A bounded arcade burst around the coach; the arena and its hit cues stay clear. */
export function createTutorialCelebration(parent: HTMLElement) {
  const element = document.createElement('div');element.className = 'tod-lesson-burst';element.setAttribute('aria-hidden', 'true');element.hidden = true;
  const style = document.createElement('style');style.textContent = `
    .tod-lesson-burst{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1}
    .tod-lesson-burst i{position:absolute;left:50%;top:42%;width:7px;height:12px;background:var(--game-accent,#e7aa63);animation:tod-lesson-particle 1000ms cubic-bezier(.12,.65,.35,1) both;animation-delay:var(--delay)}
    .tod-lesson-burst i:nth-child(3n){background:var(--game-text,#eee9dc);border-radius:50%;width:8px;height:8px}
    .tod-lesson-burst i:nth-child(3n + 1){background:var(--game-focus,#82e5ef)}
    .hf-tutorial[data-celebrating=true] [data-tutorial-current] h3{animation:tod-lesson-pop 420ms ease-out both}
    .hf-tutorial[data-reduced-motion=true] .tod-lesson-burst{display:none}.hf-tutorial[data-reduced-motion=true] [data-tutorial-current] h3{animation:none}
    @keyframes tod-lesson-particle{from{opacity:1;transform:translate(0,0) rotate(0)}to{opacity:0;transform:translate(var(--x),var(--y)) rotate(var(--spin))}}
    @keyframes tod-lesson-pop{0%{transform:scale(.94)}45%{transform:scale(1.06)}100%{transform:scale(1)}}
    @media(prefers-reduced-motion:reduce){.tod-lesson-burst{display:none}.hf-tutorial[data-celebrating=true] [data-tutorial-current] h3{animation:none}}
  `;parent.append(style, element);
  let elapsed = 0;
  return {
    play() {
      elapsed = 0;parent.dataset.celebrating = 'true';element.hidden = false;
      element.replaceChildren(...Array.from({ length: 18 }, (_, index) => {
        const particle = document.createElement('i'), angle = index / 18 * Math.PI * 2;
        particle.style.setProperty('--x', `${Math.cos(angle) * (95 + index % 3 * 18)}px`);
        particle.style.setProperty('--y', `${Math.sin(angle) * 85 + 35}px`);
        particle.style.setProperty('--spin', `${index % 2 ? 180 : -180}deg`);
        particle.style.setProperty('--delay', `${index % 3 * 35}ms`);return particle;
      }));
    },
    tick(deltaMs: number) { if (element.hidden) return;elapsed += Math.min(100, Math.max(0, deltaMs));if (elapsed >= 1400) { element.hidden = true;delete parent.dataset.celebrating; } },
    clear() { element.hidden = true;delete parent.dataset.celebrating; },
    dispose() { style.remove();element.remove();delete parent.dataset.celebrating; },
  };
}
