#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(skillRoot, "references", "persona-modifiers.json");

if (process.argv.includes("--help")) {
  console.log("Usage: bun generate-persona-modifiers.ts [--check]\n\nRegenerate the canonical 1,000-entry persona catalog, or verify it is current.");
  process.exit(0);
}

const contexts = [
  { id: "baseline", statement: "", reaction: "" },
  { id: "time-pressure", statement: " while under time pressure", reaction: " Under time pressure, prioritize the shortest safe path." },
  { id: "distracted", statement: " while frequently distracted", reaction: " Interruptions make lost context and weak resumability more costly." },
  { id: "first-session", statement: " during a first session", reaction: " Do not assume prior exposure to this product's vocabulary or layout." },
  { id: "after-failure", statement: " after a recent failed attempt", reaction: " Trust is already reduced, so recovery and truthful status matter more." },
  { id: "high-stakes", statement: " while the outcome feels high-stakes", reaction: " Require stronger confirmation, evidence, and reversibility." },
  { id: "low-energy", statement: " while mentally tired", reaction: " Reduce memory load and unnecessary decisions." },
  { id: "public-space", statement: " while working in a public or shared space", reaction: " Privacy, discreet presentation, and safe defaults matter more." },
  { id: "repeat-use", statement: " as a returning frequent user", reaction: " Repetition makes avoidable friction and lack of shortcuts more visible." },
  { id: "comparison", statement: " while comparing this product with alternatives", reaction: " Value, differentiation, and unexplained friction will be judged quickly." }
];

const traits = [
  ["money-to-spend", "has money to spend", "financial", "spending-capacity", "Can pay, but still needs a credible value proposition and clear paid consequences."],
  ["strict-budget", "has almost no discretionary budget", "financial", "spending-capacity", "Needs a useful free baseline and transparent limits before investing time."],
  ["future-finance-insecure", "is insecure about future finances", "financial", "financial-security", "Treats surprise cost, unclear renewal, and irreversible purchase pressure as trust failures."],
  ["financially-secure", "feels financially secure", "financial", "financial-security", "May prioritize saved time and quality over the lowest price."],
  ["expense-account", "is spending an employer's budget", "financial", "purchase-owner", "Needs receipts, policy clarity, and an explanation they can defend to an approver."],
  ["own-money", "is spending personal money", "financial", "purchase-owner", "Feels waste and dark patterns personally; needs clear total cost."],
  ["subscription-averse", "strongly dislikes subscriptions", "financial", "billing-model", "Will prefer ownership, metered use, or an obvious cancel path."],
  ["subscription-comfortable", "is comfortable with subscriptions", "financial", "billing-model", "Still expects visible renewal terms and ongoing value."],
  ["bad-eyesight", "has low vision", "sensory", "vision", "Needs scalable text, strong contrast, generous targets, and meaning beyond color."],
  ["blind", "is blind and uses a screen reader", "sensory", "vision", "Depends on semantic structure, accessible names, announced state, and nonvisual evidence."],
  ["color-blind", "has color-vision deficiency", "sensory", "color-perception", "Cannot rely on hue alone to distinguish state, severity, or selection."],
  ["color-sensitive", "is unusually sensitive to harsh color combinations", "sensory", "color-perception", "May abandon visually fatiguing or flashing presentation even when technically legible."],
  ["hard-of-hearing", "is hard of hearing", "sensory", "hearing", "Needs captions, visible alerts, and no audio-only instructions."],
  ["deaf", "is Deaf and does not use audio cues", "sensory", "hearing", "All meaning and timing cues must be available visually or textually."],
  ["tremor", "has hand tremors", "motor", "pointer-control", "Needs forgiving target sizes, spacing, undo, and protection from accidental activation."],
  ["precise-pointer", "uses a precise pointer comfortably", "motor", "pointer-control", "Can handle density but still benefits from stable targets and feedback."],
  ["one-handed", "can use only one hand", "motor", "hand-use", "Chords, drag gestures, and distant simultaneous controls may be inaccessible."],
  ["two-handed", "comfortably uses both hands", "motor", "hand-use", "Can use conventional shortcuts but should not be forced into them."],
  ["limited-dexterity", "has limited fine-motor dexterity", "motor", "fine-motor", "Needs alternatives to precise dragging, tiny controls, and time-sensitive gestures."],
  ["touch-confident", "is most comfortable with touch input", "input", "primary-input", "Expects direct manipulation, touch-sized controls, and no hover-only information."],
  ["keyboard-preferring", "prefers to use the keyboard", "input", "primary-input", "Judges focus order, shortcuts, visible focus, and escape behavior as core functionality."],
  ["mouse-preferring", "prefers to use a mouse", "input", "primary-input", "Expects discoverable visible controls and reliable pointer feedback."],
  ["voice-input", "primarily dictates text by voice", "input", "text-entry", "Needs tolerant text fields, review before submission, and labels voice software can target."],
  ["small-screen", "works mostly on a small screen", "environment", "screen-space", "Needs one usable primary pane, progressive disclosure, and no clipped essential actions."],
  ["large-monitor", "works on a large high-resolution monitor", "environment", "screen-space", "Expects useful space utilization without excessively long lines or scattered actions."],
  ["computer-new", "is very new to computers", "literacy", "computer-skill", "Needs literal labels, obvious next steps, forgiving defaults, and plain recovery."],
  ["computer-basic", "has basic computer skills", "literacy", "computer-skill", "Understands common controls but not product-specific jargon or developer conventions."],
  ["computer-expert", "is a computer expert", "literacy", "computer-skill", "Values speed, inspectability, shortcuts, and precise failure detail."],
  ["mobile-only-history", "has previously used only phones and tablets", "literacy", "device-history", "Desktop panes, right-click, hover, and filesystem concepts may be unfamiliar."],
  ["filesystem-unfamiliar", "does not understand files and folders", "literacy", "filesystem-knowledge", "Needs task language and safe browsing rather than unexplained paths and roots."],
  ["filesystem-fluent", "is fluent with files, folders, and paths", "literacy", "filesystem-knowledge", "Wants exact locations, predictable persistence, and direct navigation."],
  ["ai-new", "has never used an AI assistant", "literacy", "ai-familiarity", "Needs consequence-based choices, examples, cost/privacy context, and clear review responsibility."],
  ["ai-casual", "has casually used chat-based AI", "literacy", "ai-familiarity", "Understands prompting but may not understand tools, plans, autonomy, or persistent context."],
  ["ai-expert", "is expert with AI agents", "literacy", "ai-familiarity", "Expects model/control transparency, traces, boundaries, and efficient orchestration."],
  ["guided-likes", "likes being guided", "guidance", "guidance-preference", "Welcomes contextual next steps when they remain skippable and relevant."],
  ["guided-dislikes", "does not like being guided", "guidance", "guidance-preference", "Resents forced tours, interruptions, and repeated coach marks; wants direct access."],
  ["examples-first", "learns best from examples", "guidance", "learning-mode", "Needs a realistic sample near the task, not an abstract explanation alone."],
  ["docs-first", "prefers to read documentation before acting", "guidance", "learning-mode", "Needs searchable, accurate reference material and stable terminology."],
  ["trial-and-error", "learns by trying things", "guidance", "exploration-style", "Needs safe experimentation, undo, previews, and recoverable errors."],
  ["instruction-following", "follows instructions literally", "guidance", "exploration-style", "Ambiguous copy or missing steps can block progress even when an expert could infer intent."],
  ["asks-for-help", "readily asks for help", "guidance", "help-seeking", "Needs an obvious help route that preserves current context."],
  ["avoids-help", "avoids asking for help", "guidance", "help-seeking", "The product must make recovery discoverable without requiring social escalation."],
  ["high-reasoning", "has unusually strong abstract reasoning", "cognition", "reasoning", "Can infer complex models but still expects consistency and truthful system state."],
  ["average-reasoning", "has average abstract reasoning", "cognition", "reasoning", "Needs concepts chunked around recognizable tasks and concrete consequences."],
  ["limited-reasoning", "has difficulty with abstract reasoning", "cognition", "reasoning", "Needs concrete language, constrained choices, examples, and immediate feedback without condescension."],
  ["strong-memory", "has a strong working memory", "cognition", "working-memory", "Can hold more context but still benefits from visible state and summaries."],
  ["weak-memory", "has limited working memory", "cognition", "working-memory", "Needs persistent context, short steps, recognition over recall, and resumability."],
  ["dyslexic", "is dyslexic", "cognition", "reading", "Benefits from plain copy, scannable structure, nonjustified text, and reduced reading burden."],
  ["low-literacy", "has limited reading literacy", "cognition", "literacy-level", "Needs short concrete language, familiar words, icons with labels, and examples."],
  ["high-literacy", "has advanced reading literacy", "cognition", "literacy-level", "Can consume nuance but should not be forced through verbose copy for routine actions."],
  ["adhd", "has attention-regulation difficulties", "cognition", "attention", "Needs salient next actions, low distraction, resumable flows, and visible progress."],
  ["child", "is a child", "life-stage", "age", "Needs age-appropriate language, strong safety defaults, limited purchase pressure, and recoverability."],
  ["older-adult", "is an older adult", "life-stage", "age", "May bring deep domain knowledge while benefiting from clarity, stability, and adjustable presentation."],
  ["student", "is a student", "life-stage", "role", "Often balances limited budget, evaluation anxiety, deadlines, and a need to learn rather than merely finish."],
  ["professional", "is using the product for paid professional work", "life-stage", "role", "Needs reliability, auditability, predictable output, and efficient recovery."],
  ["caregiver", "is a caregiver with fragmented availability", "life-stage", "role", "Needs interruption tolerance, autosave, and easy resumption after long gaps."],
  ["lazy", "avoids effort that does not feel necessary", "motivation", "effort-tolerance", "Will abandon chores, duplicate entry, and premature configuration quickly."],
  ["methodical", "is willing to work methodically", "motivation", "effort-tolerance", "Will complete longer flows when progress and purpose remain clear."],
  ["impatient", "is highly impatient", "motivation", "patience", "Needs rapid feedback, useful defaults, and honest wait states."],
  ["patient", "is unusually patient", "motivation", "patience", "Will wait when progress, control, and expected outcome remain visible."],
  ["big-dream", "has a big dream they want to realize", "motivation", "idea-state", "Needs ambition translated into a credible first step without shrinking the goal."],
  ["no-ideas", "has no idea what to do at all", "motivation", "idea-state", "Needs bounded inspiration and concrete starting points without an empty prompt burden."],
  ["clear-goal", "has a precise outcome in mind", "motivation", "goal-clarity", "Wants a direct path and becomes frustrated by generic onboarding."],
  ["vague-goal", "has only a vague goal", "motivation", "goal-clarity", "Needs progressive clarification through examples and low-cost choices."],
  ["explorer", "enjoys exploring every option", "motivation", "exploration-desire", "Values discoverability and depth, but still needs a stable way back."],
  ["task-focused", "wants to finish one task and leave", "motivation", "exploration-desire", "Treats unrelated features, upsells, and setup as obstruction."],
  ["design-sensitive", "is sensitive to bad design", "emotion", "design-sensitivity", "Notices inconsistency, weak hierarchy, awkward spacing, and unpolished feedback immediately."],
  ["confusion-averse", "strongly dislikes being confused", "emotion", "ambiguity-tolerance", "Needs visible cause and effect, stable terminology, and clear recovery."],
  ["anxious", "is anxious about making mistakes", "emotion", "error-anxiety", "Needs previews, undo, nonjudgmental errors, and explicit statements about what will happen."],
  ["risk-comfortable", "is comfortable taking risks", "emotion", "error-anxiety", "May move quickly, so the product must still guard destructive or paid actions."],
  ["low-trust", "starts with little trust in the product", "emotion", "initial-trust", "Needs verifiable claims, transparent permissions, and no hidden state changes."],
  ["high-trust", "starts inclined to trust the product", "emotion", "initial-trust", "Can onboard quickly but should not be exploited through vague consent or overclaiming."],
  ["privacy-sensitive", "is highly privacy-sensitive", "emotion", "privacy-concern", "Needs local/remote boundaries, retention, sharing, and permission consequences stated clearly."],
  ["privacy-casual", "rarely thinks about privacy", "emotion", "privacy-concern", "Needs protective defaults because they may not seek out risk information."],
  ["perfectionist", "is a perfectionist", "work-style", "quality-threshold", "Needs preview, fine control, iteration, and confidence that edits will not be lost."],
  ["good-enough", "prefers a good-enough result quickly", "work-style", "quality-threshold", "Needs strong defaults and a short completion path with optional refinement."],
  ["collaborative", "expects to collaborate with other people", "work-style", "collaboration", "Needs shareable context, ownership clarity, and understandable history."],
  ["solo", "expects to work entirely alone", "work-style", "collaboration", "Needs self-contained recovery and should not be forced through team concepts."],
  ["control-seeking", "wants detailed control over every step", "work-style", "automation-control", "Needs inspectable plans, granular settings, and intervention points."],
  ["automation-seeking", "wants the product to handle everything possible", "work-style", "automation-control", "Needs reliable defaults, outcome checks, and clear boundaries for unattended work."],
  ["frequent-switcher", "switches between many tasks", "work-style", "task-switching", "Needs preserved drafts, unmistakable context, and fast navigation without cross-task leakage."],
  ["single-tasker", "works on one task at a time", "work-style", "task-switching", "Needs a focused surface without unrelated queues competing for attention."],
  ["deadline", "is facing an imminent deadline", "environment", "time-availability", "Needs the critical path, honest estimates, and no surprise setup late in the flow."],
  ["unhurried", "has ample time available", "environment", "time-availability", "Can learn and explore, but still expects their time to be respected."],
  ["slow-network", "has a slow or unreliable internet connection", "environment", "connectivity", "Needs offline/local clarity, resumable transfers, progress, and tolerant retries."],
  ["fast-network", "has a fast reliable internet connection", "environment", "connectivity", "May not expose loading defects but still needs accurate remote/local status."],
  ["old-device", "uses an old low-powered device", "environment", "device-performance", "Needs responsive basics, bounded animation, and graceful performance degradation."],
  ["powerful-device", "uses a powerful modern device", "environment", "device-performance", "Expects immediate interaction and may notice artificial waits or inefficient rendering."],
  ["noisy-space", "works in a noisy environment", "environment", "surroundings", "Needs visual state and resilient focus because audio and concentration are unreliable."],
  ["quiet-space", "works in a quiet controlled environment", "environment", "surroundings", "Can focus deeply but still should not depend on audio cues."],
  ["shared-device", "uses a device shared with other people", "environment", "device-ownership", "Needs account clarity, session privacy, safe persistence, and obvious sign-out or cleanup."],
  ["private-device", "uses a private personal device", "environment", "device-ownership", "Can benefit from remembered state while still needing control over retention."],
  ["non-native-language", "uses the product in a non-native language", "language", "language-fluency", "Needs plain idiom-free copy, consistent terms, and tolerance for imperfect input."],
  ["native-language", "is fully fluent in the product language", "language", "language-fluency", "Can understand nuance but still needs concise, consistent copy."],
  ["jargon-familiar", "knows the product domain's jargon", "language", "domain-vocabulary", "Values precise terms and may want denser expert detail."],
  ["jargon-unfamiliar", "does not know the product domain's jargon", "language", "domain-vocabulary", "Needs task-oriented labels, definitions in context, and examples."],
  ["failure-history", "has been burned by similar software before", "emotion", "prior-experience", "Interprets vague status and missing recovery as confirmation that this product is unsafe."],
  ["positive-history", "has had good experiences with similar software", "emotion", "prior-experience", "Arrives with strong conventions and notices needless divergence from them."],
  ["needs-proof", "needs evidence before believing work is complete", "trust", "completion-proof", "Needs inspectable results, timestamps, logs, previews, or tests tied to the right entity."],
  ["accepts-summary", "is comfortable accepting a concise completion summary", "trust", "completion-proof", "Values a clear outcome first, with deeper evidence available on demand."]
];

if (traits.length !== 100) throw new Error(`Expected 100 base traits, received ${traits.length}.`);
if (contexts.length !== 10) throw new Error(`Expected 10 contexts, received ${contexts.length}.`);
for (const [index, trait] of traits.entries()) {
  if (trait.length !== 5 || trait.some((field) => typeof field !== "string" || field.trim().length === 0)) {
    throw new Error(`Trait ${index + 1} must contain five nonempty string fields.`);
  }
}

const modifiers = {};
for (const [traitIndex, [traitId, statement, category, axis, reaction]] of traits.entries()) {
  for (const [contextIndex, context] of contexts.entries()) {
    const numericId = traitIndex * contexts.length + contextIndex + 1;
    const id = String(numericId).padStart(4, "0");
    modifiers[id] = {
      id,
      key: `${traitId}.${context.id}`,
      statement: `${statement}${context.statement}`,
      category,
      axis,
      reaction: `${reaction}${context.reaction}`
    };
  }
}

const dictionary = {
  version: 1,
  count: Object.keys(modifiers).length,
  generatedFrom: { traitCount: traits.length, contextCount: contexts.length },
  modifiers
};
const serialized = `${JSON.stringify(dictionary, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== serialized) {
    console.error(`Persona dictionary is stale. Run: bun ${path.relative(process.cwd(), fileURLToPath(import.meta.url))}`);
    process.exit(1);
  }
  console.log(`Validated ${dictionary.count} persona modifiers at ${outputPath}`);
} else {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized);
  console.log(`Wrote ${dictionary.count} persona modifiers to ${outputPath}`);
}
