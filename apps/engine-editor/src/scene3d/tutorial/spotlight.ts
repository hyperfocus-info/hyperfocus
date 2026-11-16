import type { GameplaySnapshot3D } from '@hyperfocus/engine/project/runtime-3d';
import { projectFighterBar } from '../fight-hud/fighter-bars.ts';
import type { createGuidedFight } from './guided-fight.ts';

/** Coaching follows the actual fighter/tool projection without reading layout each frame. */
export function createGuidedSpotlight(options: { canvas: HTMLCanvasElement; playerId: string }) {
  const root = document.createElement('aside'), title = document.createElement('strong'), body = document.createElement('p'), arrow = document.createElement('span');
  root.className = 'hf-guided-spotlight';root.hidden = true;root.setAttribute('aria-label', 'Guided fight');arrow.textContent = '\u2193';arrow.setAttribute('aria-hidden', 'true');root.append(title, body, arrow);
  const style = document.createElement('style');
  style.textContent = '.hf-guided-spotlight{position:absolute;inset:0;z-index:5;pointer-events:none;color:#f4eee1;background:radial-gradient(ellipse 180px 155px at var(--focus-x,50%) var(--focus-y,53%),transparent 95%,#0003 100%);padding:16px 20px;font:14px/1.4 system-ui}.hf-guided-spotlight[hidden]{display:none}.hf-guided-spotlight strong,.hf-guided-spotlight p{display:block;width:min(440px,85%);margin:0;padding:8px 12px;background:#080c10ba}.hf-guided-spotlight p{font-size:12px;padding-top:0}.hf-guided-spotlight span{position:absolute;left:var(--focus-x,50%);top:max(125px,calc(var(--focus-y,53%) - 130px));transform:translateX(-50%);font-size:30px;color:#fff;text-shadow:0 2px 4px #000}@media(max-width:600px){.hf-guided-spotlight{padding:8px}.hf-guided-spotlight strong,.hf-guided-spotlight p{width:min(310px,80%);font-size:11px}}';
  root.append(style);options.canvas.parentElement?.append(root);let signature = '';
  return {
    render(input: { prompt: ReturnType<ReturnType<typeof createGuidedFight>['prompt']>; hidden: boolean; snapshot: GameplaySnapshot3D; matrix: ArrayLike<number>; width: number; height: number; interactionTargets?: Record<string, string> }) {
      const { prompt } = input;root.hidden = input.hidden || !prompt;if (root.hidden || !prompt) return;
      const next = JSON.stringify(prompt);
      if (next !== signature) { signature = next;root.dataset.phase = prompt.phase;title.textContent = prompt.title;body.textContent = prompt.body + (prompt.observed ? ' Pause: Next phase when you are ready.' : ' Pause: Skip this phase or change settings at any time.'); }
      const player = input.snapshot.combat?.state.fighters.find(fighter => fighter.id === options.playerId);
      const target = prompt.phase === 'arena' ? input.snapshot.combat?.interactions?.weapons.find(item => item.id === input.interactionTargets?.[options.playerId] && !item.owner && item.durability > 0) : undefined;
      const position = target?.position ?? player?.position;
      const point = position && projectFighterBar({ position: [position.x, position.y + (target ? .2 : .8), position.z], matrix: input.matrix, width: input.width, height: input.height });
      arrow.hidden = !point;
      if (point) { root.style.setProperty('--focus-x', Math.round(point.x) + 'px');root.style.setProperty('--focus-y', Math.round(point.y) + 'px');root.dataset.focus = target?.id ?? options.playerId; }
    },
    dispose() { root.remove(); },
  };
}
