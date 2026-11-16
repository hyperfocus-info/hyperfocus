import { menuActions, menuRecipeSchema, defect, type MenuIntent, type MenuRecipe } from './contracts';
import { titleMenuPreference } from './preference';

/** Behavioral evidence is proven; legacy screenshots do not establish owner taste. */
export const titleComposition = {
  id: 'tod-title-rail-v1',
  evidence: [
    'apps/engine-editor/src/scene3d/gameplay-presentation.test.ts',
    'apps/engine-editor/src/scene3d/fight-hud/menu-dock.test.ts',
    'apps/engine-editor/src/scene3d/input/gamepad-menu.test.ts',
    'apps/engine-editor/README.md#touch-of-death',
  ],
  contract: 'Start match first and uniquely primary; Practice and Random AI remain local actions. Online play stays on the first page. More options/Back use the existing dock and handlers. Keep the existing game art direction. No developer tools in player navigation. The host already supplies all required destinations: match:start = Start match at selected AI level; match:practice = Learn in Practice; match:quick = Random AI levels 3–9; [data-network-open] = Play with friends (the existing friend-room flow, not a new friends list); [data-network-quick] = Online Quick Play; .hf-runtime-controls>summary = Game settings behind More options. The existing difficulty range emits match:difficulty:N. These capabilities need no new routes or handlers.',
  degreesOfFreedom: ['approved balanced split placement', 'bounded rail width, spacing, title scale and relative visual weighting', 'one short supporting sentence'],
  tasteApproval: titleMenuPreference,
} as const;

export function resolveComposition(intent: MenuIntent) {
  const criteria = {
    surface: intent.surface === 'tod-title-menu',
    audience: intent.audience === 'new-and-returning-players',
    capabilities: (['local-match', 'practice', 'random-ai', 'online-play', 'settings'] as const).every(item => intent.capabilities.includes(item)),
    inputs: (['pointer', 'keyboard', 'controller'] as const).every(item => intent.inputModes.includes(item)),
    resolved: intent.confidence !== 'low' && !intent.ambiguities.some(item => item.material),
  };
  const matched = Object.values(criteria).every(Boolean);
  return { selected: matched ? titleComposition.id : null, status: matched ? 'proven-behavior-match' : 'NO PROVEN COMPOSITION MATCHED', criteria,
    score: Object.values(criteria).filter(Boolean).length, maximum: Object.keys(criteria).length,
    evidence: titleComposition.evidence, exploration: matched ? null : 'Unsupported in this first slice; clarify intent or add a validated composition.' };
}

export function checkRecipe(recipe: MenuRecipe) {
  const findings = [];
  if (recipe.actions.length !== menuActions.length || menuActions.some((id, index) => recipe.actions[index] !== id)) {
    findings.push(defect('action-contract', 'Missing, duplicate, or forbidden player action', JSON.stringify(recipe.actions)));
  }
  if (recipe.primaryAction !== 'match:start' || recipe.actions[0] !== 'match:start') findings.push(defect('primary-action', 'Start match must be first and uniquely primary', recipe.primaryAction));
  if (/\b(debug|telemetry|schema|pipeline|export json|benchmark|developer)\b/i.test(recipe.supportCopy)) findings.push(defect('developer-copy', 'Implementation language leaked into player copy', recipe.supportCopy));
  return findings;
}

export function parseMenuRecipe(input: unknown) {
  const recipe = menuRecipeSchema.parse(input), failures = checkRecipe(recipe);
  if (failures.length) throw new Error(failures.map(item => item.problem).join('; '));
  return recipe;
}
