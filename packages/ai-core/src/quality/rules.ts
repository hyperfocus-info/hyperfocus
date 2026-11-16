import { aiDesignGuidanceForTask } from "../runtime/design-context";
import type { QualityRule } from "./contracts";

export type QualityRuleDefinition = {
  id: string; version: string; source: string; scope: string; title?: string;
  category: QualityRule["category"]; severity: QualityRule["severity"]; verifierIds: string[]; content: string;
};
const source = "docs/design-system/navigation-settings.md";
// Metadata on existing contracts. This catalog is intentionally bounded, not a rule language.
export const qualityRules: readonly QualityRuleDefinition[] = [
  { id: "ui.navigation.no-duplicate-destinations", title: "Clear navigation destinations", version: "1", source, scope: "ui", category: "structural", severity: "blocking", verifierIds: ["navigation"],
    content: "Navigation destinations are unique within a composition. An intentional alias needs a semantic justification. Destinations must exist and be available to the declared audience." },
  { id: "ui.navigation.primary-action-hierarchy", title: "Clear next action", version: "1", source: "DESIGN.md", scope: "ui", category: "structural", severity: "blocking", verifierIds: ["navigation"],
    content: "Declare action priority and audience in navigation compositions. Respect the composition's root-action budget and primary-action requirement; a read-only view need not invent a primary action. Keep internal developer commands off ordinary user surfaces." },
  { id: "ui.interaction.drawer-recovery", title: "Resume work after closing a panel", version: "1", source: "DESIGN.md", scope: "recovery", category: "behavioral", severity: "blocking", verifierIds: ["recovery"],
    content: "A hidden workbench or drawer retains an always-reachable reopen action. Exercise open, hide, reopen and resume; preserve unfinished work and active task state." },
  { id: "ui.interaction.focus-restoration", title: "Keyboard focus returns correctly", version: "1", source, scope: "recovery", category: "behavioral", severity: "blocking", verifierIds: ["focus"],
    content: "Escape closes only the newest overlay and returns keyboard focus to its connected trigger. Test the actual transition, including recovery after closing." },
  { id: "ui.responsive.no-unintended-overflow", title: "Readable at every supported size", version: "1", source: "DESIGN.md", scope: "ui", category: "geometric", severity: "blocking", verifierIds: ["responsive"],
    content: "Important actions remain discoverable, readable and usable at supported narrow, intermediate and desktop layouts and enlarged text. Reject clipped or overlapping controls and unintended page overflow; reachable intentional scroll regions are allowed." },
  { id: "experience.primary-journey-complete", title: "Complete the intended workflow", version: "1", source: "docs/agent-outcomes.md", scope: "journey", category: "behavioral", severity: "blocking", verifierIds: ["journey"],
    content: "Exercise the intended audience's complete primary journey against observable host state. Individual working controls or the implementing agent's summary do not establish completion." },
  { id: "experience.primary-journey-complete", title: "Complete the Books workflow", version: "books-1", source: "apps/engine-editor/website/examples/books/docs/task-navigation.md", scope: "books", category: "behavioral", severity: "blocking", verifierIds: ["journey"],
    content: "For a small-business owner in Books: reach Transactions, open a companion workbench, enter an unfinished task, hide it, reopen it and resume the same task with its draft intact." },
  { id: "ui.composition.approved-reference", title: "Human design review", version: "1", source: "DESIGN.md", scope: "ui", category: "qualitative", severity: "advisory", verifierIds: ["human-composition"],
    content: "Preserve approved product decisions. Automated geometry checks do not establish taste approval; unresolved material composition choices require explicit human review." },
  { id: "editor.project.applied-revision", title: "Saved project matches the reviewed change", version: "1", source: "apps/engine-editor/README.md", scope: "editor", category: "structural", severity: "blocking", verifierIds: ["editor-candidate"],
    content: "After applying a proposal, independently reopen the captured project and all binary assets. Bind evidence to the originating command session, applied revision and content hash. An edit, Undo or project switch invalidates the receipt." },
  { id: "editor.preview.rendered", title: "Project runs in the preview", version: "1", source: "apps/engine-editor/README.md", scope: "editor", category: "behavioral", severity: "blocking", verifierIds: ["editor-render"],
    content: "Run the applied project in the real Editor Play surface. Require a visible rendered canvas and advancing frames without runtime errors. Unsupported project kinds or missing assets remain unverified; a project schema check alone is insufficient." },
  { id: "editor.preview.edit-recovery", title: "Resume editing after preview", version: "1", source: "apps/engine-editor/README.md", scope: "editor", category: "behavioral", severity: "blocking", verifierIds: ["editor-recovery"],
    content: "Exercise Edit, Play, return to Edit and reopen Play with actual controls at supported viewports. Preserve the exact authored project and assets through the transitions. These checks do not certify project-specific game UX or aesthetic quality." },
];

export type QualityTask = { intent: string; paths?: readonly string[]; project?: string; surface?: "ui" | "game" | "backend"; profile?: "implementation" | "prototype" };
/** Explicit intent prefix; mentioning an old prototype must not weaken a production task. */
export function qualityProfile(task: QualityTask) {
  return task.profile ?? (/^\s*(?:prototype|experiment|spike):/i.test(task.intent) ? "prototype" : "implementation");
}
export function qualityEligibility(task: QualityTask, catalog: readonly QualityRuleDefinition[] = qualityRules) {
  const paths = (task.paths ?? []).map(value => value.replaceAll("\\", "/"));
  const visualPaths = paths.some(value => /(?:^|\/)(?:client|ui|components)\/|\.tsx$/.test(value) && !/\.(?:test|spec)\./.test(value));
  const change = /\b(?:build|create|make|design|implement|fix|repair|change|add|remove|update|improve|ship|verify|validate|test|polish)\b/i.test(task.intent);
  const directUi = /\b(?:navigation|sidebar|workbench|drawer|toolbar|screen|menu|responsive|frontend|user interface)\b/i.test(task.intent);
  const ui = visualPaths || task.surface === "ui" || task.surface === "game" || (change && (directUi || Boolean(aiDesignGuidanceForTask({ task: task.intent }))));
  const recovery = ui && (/\b(?:drawer|workbench|modal|dialog|overlay|recover|navigation|sidebar|menu)\b/i.test(task.intent) || visualPaths);
  const books = task.project === "books" || paths.some(value => /(?:^|\/)books\//.test(value));
  const journey = ui && (recovery || /\b(?:workflow|journey|app|application)\b/i.test(task.intent));
  const ranked = new Map<string, { definition: QualityRuleDefinition; specificity: number; eligible: QualityRule["eligible"]; rationale: string }>();
  const conflicts: string[] = [];
  for (const definition of catalog) {
    const applicable = definition.scope === "editor" ? task.project === "editor" : definition.scope === "books" ? books && journey : definition.scope === "recovery" ? recovery : definition.scope === "journey" ? journey : definition.scope === "ui" ? ui : false;
    const specificity = applicable ? definition.scope === "books" ? 2 : 1 : 0;
    const previous = ranked.get(definition.id);
    if (previous && specificity === previous.specificity && applicable) conflicts.push(definition.id);
    if (!previous || specificity > previous.specificity) ranked.set(definition.id, {
      definition: qualityProfile(task) === "prototype" ? { ...definition, severity: "advisory" } : definition, specificity, eligible: applicable ? "yes" : "no",
      rationale: applicable ? definition.scope === "editor" ? "Editor host produces an applied portable project; rendered revision verification is required." : definition.scope === "books" ? "Books project and workbench journey; scoped contract takes precedence." : visualPaths ? "Affected implementation paths expose an interface." : "Declared task intent requires this interface behavior." : "Task signals do not require this contract scope.",
    });
  }
  return { rules: [...ranked.values()], conflicts: [...new Set(conflicts)], uncertainty: !ui && task.surface !== "backend" && change ? ["No UI intent or affected UI paths established; bounded routing cannot infer every task. Re-evaluate after implementation."] : [] };
}
