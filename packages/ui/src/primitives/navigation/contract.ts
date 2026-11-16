export type NavigationAction = {
  id: string; destination: string; priority: "primary" | "secondary"; audience: "user" | "developer";
  aliasReason?: string; available: boolean;
};

/** Semantic composition checks supplement rendered checks; neither implies route reachability. */
export function inspectNavigation(input: {
  actions: readonly NavigationAction[]; destinations: readonly string[]; audience: "user" | "developer";
  rootActionCount: number; maxRootActions: number; primary: "optional" | "required";
}) {
  const violations: { ruleId: string; detail: string }[] = [];
  const seen = new Map<string, NavigationAction>();
  for (const action of input.actions) {
    const previous = seen.get(action.destination);
    if (previous && !action.aliasReason?.trim()) violations.push({ ruleId: "ui.navigation.no-duplicate-destinations", detail: `${previous.id} and ${action.id} both target ${action.destination}; no semantic alias justification.` });
    seen.set(action.destination, action);
    if (!input.destinations.includes(action.destination) || !action.available) violations.push({ ruleId: "ui.navigation.no-duplicate-destinations", detail: `${action.id}: destination ${action.destination} is missing or unavailable.` });
    if (!["primary", "secondary"].includes(action.priority) || (input.audience === "user" && action.audience !== "user")) violations.push({ ruleId: "ui.navigation.primary-action-hierarchy", detail: `${action.id}: priority is undeclared or audience is inappropriate.` });
  }
  const primaries = input.actions.filter(action => action.priority === "primary").length;
  if (primaries > 1 || (input.primary === "required" && primaries !== 1) || input.rootActionCount > input.maxRootActions) violations.push({ ruleId: "ui.navigation.primary-action-hierarchy", detail: `${primaries} primary actions; ${input.rootActionCount} root actions (maximum ${input.maxRootActions}, primary ${input.primary}).` });
  return { passed: violations.length === 0, violations };
}
