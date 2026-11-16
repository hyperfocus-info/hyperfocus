import { createAssistantLearningId, createAssistantLogEntryId,
  type AssistantLearning, type AssistantQuestion } from "@hyperfocus/ai-core/protocol";

export type AssistantQuestionCategory =
  | "target-selection"
  | "taste-calibration"
  | "access-environment"
  | "schedule-or-job-selection"
  | "todo-or-question-selection"
  | "recovery-or-safety"
  | "unknown";

const OPERATIONAL_PROMPT_QUESTION_CATEGORIES = new Set<AssistantQuestionCategory>([
  "schedule-or-job-selection", "todo-or-question-selection", "recovery-or-safety", "access-environment"
]);
const MAX_PROMPT_ANSWERED_QUESTIONS = 3;

export type AssistantQuestionDecision =
  | {
      kind: "ask";
      category: AssistantQuestionCategory;
      reason: string;
    }
  | {
      kind: "suppress";
      category: AssistantQuestionCategory;
      reason: string;
      matchingQuestionId?: string;
      note: string;
    }
  | {
      kind: "auto-answer";
      category: AssistantQuestionCategory;
      reason: string;
      matchingQuestionId?: string;
      answerText: string;
    }
  | {
      kind: "note";
      category: AssistantQuestionCategory;
      reason: string;
      note: string;
    };

export function createAssistantQuestionPolicyEffects(
  assistantId: string,
  prompt: string,
  decision: Exclude<AssistantQuestionDecision, { kind: "ask" }>,
  createdAt: string
) {
  const autoAnswered = decision.kind === "auto-answer";
  const summary = prompt.replace(/\s+/g, " ").trim().slice(0, 120);
  return {
    learning: { id: createAssistantLearningId(), assistantId,
      summary: `${autoAnswered ? "Auto-answered assistant question" : "Did not ask assistant question"}: ${summary}. ${autoAnswered ? decision.answerText : decision.note}`,
      source: `question-policy:${decision.category}`, confidence: decision.kind === "note" ? "low" as const : "high" as const, createdAt },
    log: { id: createAssistantLogEntryId(), assistantId, level: "info" as const,
      summary: autoAnswered ? "Question auto-answered" : "Question suppressed", detail: decision.reason,
      detailsJson: { prompt, decision }, createdAt }
  };
}

export function selectAssistantPromptQuestions(questions: AssistantQuestion[]) {
  const selected: AssistantQuestion[] = []; const seenKeys = new Set<string>();
  for (const question of questions.filter((entry) => entry.status === "answered").sort((left, right) =>
    (right.answeredAt ?? right.askedAt).localeCompare(left.answeredAt ?? left.askedAt))) {
    if (!question.answerText || OPERATIONAL_PROMPT_QUESTION_CATEGORIES.has(classifyAssistantQuestion(question.prompt))) continue;
    const key = `${classifyAssistantQuestion(question.prompt)}:${normalizeQuestionText(question.prompt)}:${normalizeQuestionText(question.answerText)}`;
    if (seenKeys.has(key)) continue; seenKeys.add(key); selected.push(question);
    if (selected.length >= MAX_PROMPT_ANSWERED_QUESTIONS) break;
  }
  return selected;
}

export function readAssistantPromptQuestions(
  readPage: (cursor: string | undefined) => { items: AssistantQuestion[]; nextCursor?: string }
) {
  let selected: AssistantQuestion[] = []; let cursor: string | undefined;
  do { const page = readPage(cursor); selected = selectAssistantPromptQuestions([...selected, ...page.items]);
    cursor = page.nextCursor; } while (cursor !== undefined);
  return selected;
}

export function readAssistantPendingPromptQuestions(
  readPage: (cursor: string | undefined) => { items: AssistantQuestion[]; nextCursor?: string }, limit: number = 32
) {
  const selected: AssistantQuestion[] = []; let cursor: string | undefined;
  do { const page = readPage(cursor); selected.push(...page.items.filter((entry) => entry.status === "pending" || entry.status === "deferred")
      .slice(0, limit - selected.length)); cursor = selected.length < limit ? page.nextCursor : undefined;
  } while (cursor !== undefined);
  return selected;
}

export function readAssistantQuestionPolicyContext(readPage: (cursor: string | undefined) =>
  { items: AssistantQuestion[]; nextCursor?: string }) {
  return [...readAssistantPendingPromptQuestions(readPage), ...readAssistantPromptQuestions(readPage)];
}

export function someAssistantQuestion(readPage: (cursor: string | undefined) =>
  { items: AssistantQuestion[]; nextCursor?: string }, predicate: (question: AssistantQuestion) => boolean) {
  let cursor: string | undefined;
  do { const page = readPage(cursor); if (page.items.some(predicate)) return true; cursor = page.nextCursor; }
  while (cursor !== undefined);
  return false;
}

export function countAssistantPendingQuestions(readPage: (cursor: string | undefined) =>
  { items: AssistantQuestion[]; nextCursor?: string }) { let count = 0; let cursor: string | undefined;
  do { const page = readPage(cursor); count += page.items.filter((question) => question.status === "pending").length;
    cursor = page.nextCursor; } while (cursor !== undefined); return count; }

export function visitAssistantQuestionPolicyCandidates(
  readPage: (cursor: string | undefined) => { items: AssistantQuestion[]; nextCursor?: string },
  visit: (question: AssistantQuestion, context: AssistantQuestion[]) => void
) {
  const context: AssistantQuestion[] = []; let cursor: string | undefined;
  do { const page = readPage(cursor); context.push(...page.items.slice(0, 256 - context.length));
    cursor = context.length < 256 ? page.nextCursor : undefined; } while (cursor !== undefined);
  cursor = undefined;
  do { const page = readPage(cursor); for (const question of page.items) {
      if (question.status === "pending" || question.status === "deferred") visit(question,
        context.filter((entry) => entry.id !== question.id)); }
    cursor = page.nextCursor; } while (cursor !== undefined);
}

type EvaluateAssistantQuestionInput = {
  prompt: string;
  questions: AssistantQuestion[];
  learnings?: AssistantLearning[];
  runtimeReadOnly?: boolean;
  forceBlocking?: boolean;
  autoApproveNonBlocking?: boolean;
};

const durableAnswerPatterns = [
  /\bdon'?t ask(?: me)? again\b/i,
  /\bdo not ask(?: me)? again\b/i,
  /\buse (?:your )?(?:best )?judg(?:e)?ment\b/i,
  /\bpick (?:a )?random\b/i,
  /\b(?:pick|choose|select)\b.*\bbrowser-playable\b/i,
  /\buse existing guidance\b/i,
  /\bcurrent context\b/i,
  /\bthat'?s your job\b/i,
  /\balways give the same response\b/i,
  /\bwork on other useful tasks\b/i
];

export function evaluateAssistantQuestionPolicy(input: EvaluateAssistantQuestionInput): AssistantQuestionDecision {
  const prompt = input.prompt.trim();
  const normalizedPrompt = normalizeQuestionText(prompt);
  const category = classifyAssistantQuestion(prompt);

  if (input.forceBlocking || category === "schedule-or-job-selection" || category === "todo-or-question-selection" || category === "recovery-or-safety") {
    return { kind: "ask", category, reason: "This question requires an explicit answer before work can continue." };
  }
  if (isHighRiskQuestion(prompt)) {
    return { kind: "ask", category, reason: "Question involves irreversible or high-risk work." };
  }
  if (input.autoApproveNonBlocking === false) {
    return { kind: "ask", category, reason: "Auto-approval for non-blocking assistant questions is disabled." };
  }
  if (category === "unknown") {
    return { kind: "ask", category, reason: "This question has no recognized non-blocking policy." };
  }

  const existingQuestion = findExistingQuestion(category, normalizedPrompt, input.questions);
  if (existingQuestion?.status === "pending" || existingQuestion?.status === "deferred") {
    return {
      kind: "ask",
      category,
      reason: "An equivalent assistant question is still awaiting an answer."
    };
  }

  if (existingQuestion?.status === "answered" && existingQuestion.answerText) {
    const answerText = existingQuestion.answerText.trim();
    if (shouldAutoAnswer(category, answerText)) {
      return {
        kind: "auto-answer",
        category,
        reason: "An earlier durable answer already resolves this question category.",
        matchingQuestionId: existingQuestion.id,
        answerText
      };
    }
    if (isDurableSuppressingAnswer(answerText)) {
      return {
        kind: "suppress",
        category,
        reason: "User previously told the assistant not to ask this again.",
        matchingQuestionId: existingQuestion.id,
        note: `Use previous answer instead of asking again: ${answerText}`
      };
    }
  }

  const durableCategoryQuestion = input.questions.find(
    (question) =>
      question.status === "answered" &&
      question.answerText &&
      classifyAssistantQuestion(question.prompt) === category &&
      isDurableSuppressingAnswer(question.answerText)
  );
  if (durableCategoryQuestion?.answerText) {
    const answerText = durableCategoryQuestion.answerText.trim();
    if (shouldAutoAnswer(category, answerText)) {
      return {
        kind: "auto-answer",
        category,
        reason: "An earlier durable category answer already resolves this question.",
        matchingQuestionId: durableCategoryQuestion.id,
        answerText
      };
    }
    return {
      kind: "suppress",
      category,
      reason: "User previously gave durable guidance for this question category.",
      matchingQuestionId: durableCategoryQuestion.id,
      note: `Use category guidance instead of asking again: ${answerText}`
    };
  }

  const learningText = (input.learnings ?? []).map((learning) => learning.summary).join("\n");
  if (category === "taste-calibration" && hasTasteGuidance(learningText)) {
    return {
      kind: "suppress",
      category,
      reason: "Existing learnings already contain taste guidance.",
      note: "Use existing taste guidance instead of asking for another calibration answer."
    };
  }
  if (category === "target-selection" && hasTargetGuidance(learningText)) {
    return {
      kind: "auto-answer",
      category,
      reason: "Existing learnings already define target-selection behavior.",
      answerText: "Use existing target-selection guidance and choose the most useful safe target without asking."
    };
  }

  if (category === "access-environment" && input.runtimeReadOnly === false) {
    return {
      kind: "suppress",
      category,
      reason: "Runtime is writable, so the access blocker is likely stale or hallucinated.",
      note: "Verify with tools and continue instead of asking for write access."
    };
  }

  return {
    kind: "note",
    category,
    reason: "Default assistant policy is async autonomy first.",
    note: `Make a reasonable assumption and keep working instead of asking: ${prompt}`
  };
}

export function resolveAssistantPolicyAnswer(decision: AssistantQuestionDecision) {
  switch (decision.kind) {
    case "auto-answer": return decision.answerText;
    case "suppress":
    case "note": return decision.note;
    case "ask": return decision.reason;
  }
}

export function classifyAssistantQuestion(prompt: string): AssistantQuestionCategory {
  const text = normalizeQuestionText(prompt);
  if (/\b(concrete sweep input|sweep input|issue output text block|what should i use as input|what should i use as concrete)\b/.test(text)) {
    return "target-selection";
  }
  if (/\b(circuit breaker|repeated failure|recover|recovery|paused itself|retry bootstrap|bootstrap was interrupted|stalled)\b/.test(text)) {
    return "recovery-or-safety";
  }
  if (/\b(schedule|cron|interval|run now|which job|background job|queued job)\b/.test(text)) {
    return "schedule-or-job-selection";
  }
  if (/\b(which|what)\s+.*\b(todo|question)\b|\bquestion should be answered\b|\btodo should be updated\b/.test(text)) {
    return "todo-or-question-selection";
  }
  if (/\b(read only|read-only|writable|write access|filesystem access|workspace access|direct play access|captured play session|browser session)\b/.test(text)) {
    return "access-environment";
  }
  if (
    /\b(good|bad|like|dislike|taste|feel|sticky|stickiness|onboarding|controls?|pacing|difficulty|juice|clarity|restart|launcher|arcade)\b/.test(text)
  ) {
    return "taste-calibration";
  }
  if (/\b(which|what|name)\s+.*\b(game|folder|mechanic|project|target|inspect|evaluate|calibrate)\b/.test(text)) {
    return "target-selection";
  }
  return "unknown";
}

export function normalizeQuestionText(input: string) {
  return input
    .toLowerCase()
    .replace(/`[^`]+`/g, " target ")
    .replace(/["'.,:;!?()[\]{}_/\\-]+/g, " ")
    .replace(/\b(the|a|an|this|that|these|those|please|assistant|user|current|specific)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findExistingQuestion(category: AssistantQuestionCategory, normalizedPrompt: string, questions: AssistantQuestion[]) {
  const candidates = questions
    .filter((question) => question.status === "pending" || question.status === "deferred" || question.status === "answered")
    .map((question) => ({
      question,
      category: classifyAssistantQuestion(question.prompt),
      normalized: normalizeQuestionText(question.prompt)
    }))
    .filter((entry) => entry.category === category);

  return candidates.find((entry) => isSimilar(normalizedPrompt, entry.normalized))?.question;
}

function isSimilar(left: string, right: string) {
  if (left === right || left.includes(right) || right.includes(left)) {
    return true;
  }
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return false;
  }
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.min(leftTokens.size, rightTokens.size) >= 0.45;
}

function tokenSet(input: string) {
  return new Set(input.split(" ").filter((token) => token.length > 2));
}

function shouldAutoAnswer(category: AssistantQuestionCategory, answerText: string) {
  if (!isDurableSuppressingAnswer(answerText)) {
    return false;
  }
  return category === "target-selection";
}

function isDurableSuppressingAnswer(answerText: string) {
  return durableAnswerPatterns.some((pattern) => pattern.test(answerText));
}

function hasTasteGuidance(text: string) {
  return /\b(sticky|stickiness|tight gameplay|simple to understand|mechanics.*stack|dynamic|not overwhelming|arcade loop)\b/i.test(text);
}

function hasTargetGuidance(text: string) {
  return /\b(pick|choose|select).*\b(random|target|game|folder|browser-playable)|\bactive .*target\b|\btarget is already\b|\buse current context\b/i.test(text);
}

function isHighRiskQuestion(prompt: string) {
  return /\b(delete|destroy|destructive|irreversible|permanent|overwrite|drop table|credential|secret|api key|production|prod|payment|charge)\b/i.test(prompt);
}
