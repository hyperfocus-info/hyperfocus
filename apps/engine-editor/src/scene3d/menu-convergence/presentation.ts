import type { MenuRecipe } from './contracts';
import { parseMenuRecipe } from './composition';

/** This adapter is shared by real gameplay presentation and the convergence render host. */
export function createMenuComposition(options: { root: HTMLElement; recipe: MenuRecipe }) {
  const recipe = parseMenuRecipe(options.recipe);
  const style = document.createElement('style');
  const selector = '.hf-fight-stage .hyperfocus-gameplay-3d[data-stage=menu][data-menu-composition]';
  style.textContent = `
${selector} .hf3d-actions,${selector} .hf3d-menu-dock{gap:${recipe.gap}px}
${selector} .hf3d-overlay h2{font-size:${recipe.titleSize}px}
${selector} .hf3d-bottom{width:min(${recipe.railWidth}px,42%)}
${selector} .hf3d-action-range input{min-height:44px}
${recipe.layout === 'stacked' ? `${selector}{align-items:center!important;justify-content:flex-start;padding-top:32px;gap:16px}
${selector} .hf3d-overlay{align-self:center;width:min(620px,100%);text-align:center;margin:0}
${selector} .hf3d-overlay p{margin-inline:auto}
${selector} .hf3d-bottom{position:static;transform:none;align-self:center;width:min(${recipe.railWidth}px,100%);min-height:0;flex:1 1 auto}` : ''}
${recipe.layout === 'compact' ? `${selector}{justify-content:flex-start;padding-top:36px}
${selector} .hf3d-overlay{width:42%;margin:0}
${selector} .hf3d-bottom{top:36px;transform:none;max-height:calc(100% - 72px)}` : ''}
@media(max-width:700px){
${selector}{padding:20px 16px 48px;gap:12px}
${selector} .hf3d-overlay{width:100%;text-align:left}
${selector} .hf3d-overlay h2{font-size:${recipe.mobileTitleSize}px}
${selector} .hf3d-bottom{position:static;transform:none;width:100%;min-height:0;flex:1 1 auto;max-height:100%}
}
${recipe.shortHeight === 'scroll' ? `@media(max-height:480px){
${selector}{overflow:auto;display:flex;flex-direction:column;justify-content:flex-start;padding:16px;gap:12px}
${selector} .hf3d-overlay{width:100%;min-height:0;margin:0;flex:none}
${selector} .hf3d-overlay h2{font-size:${recipe.mobileTitleSize}px;margin-bottom:12px}
${selector} .hf3d-bottom{position:static;transform:none;width:min(${recipe.railWidth}px,100%);max-height:none;overflow:visible;flex:none;align-self:${recipe.layout === 'stacked' ? 'center' : 'flex-start'}}
${recipe.layout === 'stacked' ? `${selector} .hf3d-overlay{width:min(${recipe.railWidth}px,100%);max-width:none;align-self:center;text-align:center}` : ''}
}` : ''}`;
  options.root.dataset.menuComposition = recipe.layout;
  options.root.append(style);
  return { dispose() { delete options.root.dataset.menuComposition;style.remove(); } };
}
