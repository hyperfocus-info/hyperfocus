/** A generator selects from an owned grammar; it does not invent a fallback. */
export type DirectionRecipe = { id: string; family: string; intent: string; strength: string; weakness: string } &
  ({ treatment: string; motion?: string } | { motion: string; treatment?: string });
export type ArtDirectionGrammar = { id: string; owner: string; recipes: readonly DirectionRecipe[]; requiredEvidence: readonly string[]; evidenceByFamily?: Readonly<Record<string, readonly string[]>> };
export type DirectionRequest = { id: string; family: string; intent: string; recipe?: string };
export type DirectionPlan = { grammar: string; owner: string; requiredEvidence: string[]; assignments: (DirectionRequest & { recipe: string; treatment: string; motion: string; strength: string; weakness: string; requiredEvidence?: string[] })[] };

function requireText(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Art direction requires ${name}`);
}

/** Material ambiguities stay unresolved. Unknown slots and unbounded candidates fail. */
export function compileArtDirection(grammar: ArtDirectionGrammar, requests: readonly DirectionRequest[]): DirectionPlan {
  requireText(grammar.id, 'grammar identity'); requireText(grammar.owner, 'owning direction document');
  if (!Array.isArray(grammar.recipes) || !grammar.recipes.length || !Array.isArray(requests) || !requests.length) throw new Error('Art direction requires recipes and actual asset requests');
  if (!Array.isArray(grammar.requiredEvidence) || !grammar.requiredEvidence.length || new Set(grammar.requiredEvidence).size !== grammar.requiredEvidence.length) throw new Error('Declare unique required rendered evidence');
  for (const key of grammar.requiredEvidence) requireText(key, 'evidence name');
  const ids = new Set<string>();
  for (const recipe of grammar.recipes) {
    for (const key of ['id', 'family', 'intent', 'strength', 'weakness'] as const) requireText(recipe[key], `recipe ${key}`);
    requireText(recipe.treatment ?? recipe.motion, 'recipe treatment');
    if (recipe.treatment !== undefined && recipe.motion !== undefined && recipe.treatment !== recipe.motion) throw new Error(`Conflicting treatment and legacy motion for ${recipe.id}`);
    if (ids.has(recipe.id)) throw new Error(`Duplicate recipe ${recipe.id}`);
    ids.add(recipe.id);
  }
  for (const [family, evidence] of Object.entries(grammar.evidenceByFamily ?? {})) {
    if (!grammar.recipes.some(recipe => recipe.family === family)) throw new Error(`Evidence for unknown family ${family}`);
    if (!Array.isArray(evidence) || !evidence.length || new Set(evidence).size !== evidence.length) throw new Error(`Declare unique required rendered evidence for ${family}`);
    for (const key of evidence) requireText(key, 'family evidence name');
  }
  const assigned = new Set<string>();
  const assignments = requests.map(request => {
    for (const key of ['id', 'family', 'intent'] as const) requireText(request[key], `request ${key}`);
    if (assigned.has(request.id)) throw new Error(`Duplicate assignment ${request.id}`);
    assigned.add(request.id);
    const candidates = grammar.recipes.filter(recipe => recipe.family === request.family && recipe.intent === request.intent);
    if (!candidates.length) throw new Error(`No directed recipe for ${request.id}: ${request.family}/${request.intent}`);
    if (candidates.length > 3) throw new Error(`Unbounded candidate slot ${request.family}/${request.intent}`);
    const selected = request.recipe ? candidates.find(recipe => recipe.id === request.recipe) : candidates.length === 1 ? candidates[0] : undefined;
    if (!selected) throw new Error(`Select a bounded recipe for ${request.id}: ${candidates.map(recipe => recipe.id).join(', ')}`);
    const treatment = selected.treatment ?? selected.motion;
    requireText(treatment, 'selected treatment');
    // Preserve the existing motion field for current game consumers and saved plans.
    return { ...request, recipe: selected.id, treatment, motion: treatment, strength: selected.strength, weakness: selected.weakness, requiredEvidence: [...(grammar.evidenceByFamily?.[request.family] ?? grammar.requiredEvidence)] };
  });
  return { grammar: grammar.id, owner: grammar.owner, requiredEvidence: [...grammar.requiredEvidence], assignments };
}

/** Numeric trajectory separation catches recycling, never establishes good taste. */
export function compareMotionSignatures(a: readonly (readonly number[])[], b: readonly (readonly number[])[]) {
  if (!a.length || a.length !== b.length || a.some((row, i) => !row.length || row.length !== b[i]!.length || [...row, ...b[i]!].some(n => !Number.isFinite(n)))) throw new Error('Motion signatures require matching finite phase samples');
  const distances = a.map((row, i) => Math.sqrt(row.reduce((sum, n, j) => sum + (n - b[i]![j]!) ** 2, 0) / row.length));
  return { mean: distances.reduce((sum, n) => sum + n, 0) / distances.length, peak: Math.max(...distances) };
}

/** A candidate cannot skip a required view, pass a failed check or inherit approval. */
export function validateDirectionEvidence(plan: DirectionPlan, evidence: readonly { id: string; media: Record<string, string>; checks: { name: string; passed: boolean }[] }[]) {
  const failures: string[] = [];
  for (const assignment of plan.assignments) {
    const rows = evidence.filter(row => row.id === assignment.id), row = rows[0];
    if (rows.length !== 1 || !row) { failures.push(`${assignment.id}: require exactly one evidence record`); continue; }
    const required = assignment.requiredEvidence ?? plan.requiredEvidence;
    if (!required.length) failures.push(`${assignment.id}: no required evidence`);
    for (const key of required) if (!row.media[key]?.trim()) failures.push(`${assignment.id}: missing ${key}`);
    if (!row.checks.length || row.checks.some(check => !check.passed)) failures.push(`${assignment.id}: objective checks incomplete or failed`);
  }
  return { stage: failures.length ? 'ROUGH' as const : 'CANDIDATE' as const, failures };
}
