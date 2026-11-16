import { describe, expect, test } from "bun:test";
import type { AssistantLearning, AssistantQuestion } from "@hyperfocus/ai-core/protocol";
import { createAssistantQuestionPolicyEffects, evaluateAssistantQuestionPolicy, readAssistantPendingPromptQuestions, readAssistantPromptQuestions } from "./assistant-question-policy";

const now = new Date().toISOString();

function question(overrides: Partial<AssistantQuestion>): AssistantQuestion {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    assistantId: overrides.assistantId ?? "assistant-1",
    prompt: overrides.prompt ?? "Which game should I evaluate?",
    status: overrides.status ?? "answered",
    answerText: overrides.answerText,
    linkedTodoIds: overrides.linkedTodoIds,
    askedAt: overrides.askedAt ?? now,
    answeredAt: overrides.answeredAt
  };
}

function learning(summary: string): AssistantLearning {
  return {
    id: crypto.randomUUID(),
    assistantId: "assistant-1",
    summary,
    source: "test",
    confidence: "high",
    createdAt: now
  };
}

test("prompt question scan reaches durable answers beyond bounded operational history", () => {
  const pages = Array.from({ length: 33 }, (_, pageIndex) => Array.from({ length: 128 }, (_, index) => question({
    id: `operational-${pageIndex}-${index}`, prompt: "Which todo should run?", answerText: "Run the first one."
  })));
  pages[32] = [question({ id: "durable-answer", prompt: "Which visual style should the game use?", answerText: "Use pixel art." })];
  const selected = readAssistantPromptQuestions((cursor) => {
    const index = cursor ? Number(cursor) : 0;
    return { items: pages[index]!, nextCursor: index + 1 < pages.length ? String(index + 1) : undefined };
  });
  expect(selected.map((entry) => entry.id)).toEqual(["durable-answer"]);
});

test("pending prompt scan reaches old questions while retaining bounded context", () => {
  const pages = Array.from({ length: 33 }, (_, pageIndex) => Array.from({ length: 128 }, (_, index) => question({
    id: `answered-${pageIndex}-${index}`, status: "answered", answerText: "Done"
  })));
  pages[32] = [question({ id: "old-pending", status: "pending" })];
  const selected = readAssistantPendingPromptQuestions((cursor) => { const index = cursor ? Number(cursor) : 0;
    return { items: pages[index]!, nextCursor: index + 1 < pages.length ? String(index + 1) : undefined }; });
  expect(selected.map((entry) => entry.id)).toEqual(["old-pending"]);
});

describe("assistant question policy", () => {
  test("suppresses duplicate taste questions after do-not-ask guidance", () => {
    const decision = evaluateAssistantQuestionPolicy({
      prompt: "What makes launcher game feel good or bad to you?",
      questions: [
        question({
          prompt: "What do you usually like or dislike in launcher-style browser games?",
          answerText:
            "A good game is simple to understand and mechanics stack into a dynamic but not overwhelming experience. Please dont ask again.",
          status: "answered"
        })
      ]
    });

    expect(decision.kind).toBe("suppress");
    expect(decision.category).toBe("taste-calibration");
  });

  test("auto-answers duplicate target questions from pick-random guidance", () => {
    const decision = evaluateAssistantQuestionPolicy({
      prompt: "Which game folder or mechanic should I evaluate first?",
      questions: [
        question({
          prompt: "Which game folder should this patrol inspect?",
          answerText: "Pick a random browser-playable game unless told otherwise.",
          status: "answered"
        })
      ]
    });

    expect(decision.kind).toBe("auto-answer");
    if (decision.kind === "auto-answer") {
      expect(decision.answerText).toContain("Pick a random");
    }
  });

  test("auto-answers concrete sweep input from durable target guidance", () => {
    const decision = evaluateAssistantQuestionPolicy({
      prompt: "What should I use as the concrete sweep input for this pass?",
      questions: [
        question({
          prompt: "Which game folder should this patrol inspect?",
          answerText: "Pick a random browser-playable game unless told otherwise, use current context, and do not ask again.",
          status: "answered"
        })
      ]
    });

    expect(decision.kind).toBe("auto-answer");
    expect(decision.category).toBe("target-selection");
  });

  test("treats missing issue output text block as nonblocking target selection when learnings define target behavior", () => {
    const decision = evaluateAssistantQuestionPolicy({
      prompt: "Missing the issue output text block. What should I use as input?",
      questions: [],
      learnings: [learning("For sweep passes, pick a random browser-playable game unless told otherwise.")]
    });

    expect(decision.kind).toBe("auto-answer");
    expect(decision.category).toBe("target-selection");
  });

  test("suppresses read-only access asks when runtime is writable", () => {
    const decision = evaluateAssistantQuestionPolicy({
      prompt: "Workspace is read-only. Should I wait for write access?",
      questions: [],
      runtimeReadOnly: false
    });

    expect(decision.kind).toBe("suppress");
    expect(decision.category).toBe("access-environment");
  });

  test("asks default nonblocking questions when auto-approval is disabled", () => {
    const decision = evaluateAssistantQuestionPolicy({
      prompt: "Should I keep going with a reasonable default?",
      questions: [],
      autoApproveNonBlocking: false
    });

    expect(decision.kind).toBe("ask");
    expect(decision.reason).toContain("Auto-approval");
  });

  test("asks for schedules and multiple row selection", () => {
    expect(
      evaluateAssistantQuestionPolicy({
        prompt: "What schedule should this assistant-owned job use?",
        questions: []
      }).kind
    ).toBe("ask");
    expect(
      evaluateAssistantQuestionPolicy({
        prompt: "Which todo should be updated?",
        questions: []
      }).kind
    ).toBe("ask");
  });

  test("asks for recovery and high-risk unknown work", () => {
    expect(
      evaluateAssistantQuestionPolicy({
        prompt: "Assistant paused itself after repeated failures. How should it proceed?",
        questions: []
      }).kind
    ).toBe("ask");
    expect(
      evaluateAssistantQuestionPolicy({
        prompt: "Should I permanently delete the existing production data?",
        questions: []
      }).kind
    ).toBe("ask");
  });

  test("keeps already pending duplicates blocking until answered", () => {
    const decision = evaluateAssistantQuestionPolicy({
      prompt: "Which game folder should I inspect first?",
      questions: [
        question({
          prompt: "Which game folder should I inspect first?",
          status: "pending"
        })
      ]
    });

    expect(decision.kind).toBe("ask");
  });

  test("mandatory blocking and risk take precedence over durable category guidance", () => {
    const questions = [question({ prompt: "Which project should I inspect?", answerText: "Use your best judgment." })];
    for (const input of [
      { prompt: "Which project should I inspect?", forceBlocking: true },
      { prompt: "Which project should I delete from production?" },
      { prompt: "Which project should I inspect?", autoApproveNonBlocking: false }
    ]) expect(evaluateAssistantQuestionPolicy({ ...input, questions }).kind).toBe("ask");
  });

  test("unknown questions cannot reuse unrelated guidance or default to authorization", () => {
    const questions = [question({ prompt: "Should I use concise prose?", answerText: "Use your best judgment." })];
    for (const prompt of ["Should I permanently delete production data?", "Should I publish these changes?"]) {
      expect(evaluateAssistantQuestionPolicy({ prompt, questions }).kind).toBe("ask");
      expect(evaluateAssistantQuestionPolicy({ prompt, questions: [] }).kind).toBe("ask");
    }
  });

  test("default assumptions are not recorded as high-confidence guidance", () => {
    const prompt = "Which project should I inspect?";
    const decision = evaluateAssistantQuestionPolicy({ prompt, questions: [] });
    expect(decision.kind).toBe("note");
    if (decision.kind === "ask") throw new Error("Expected a non-blocking assumption");
    expect(createAssistantQuestionPolicyEffects("assistant-1", prompt, decision, now).learning.confidence).toBe("low");
  });

  test("deferred questions remain blocking even when target learnings suggest a default", () => {
    expect(evaluateAssistantQuestionPolicy({ prompt: "Which project should I inspect?",
      questions: [question({ prompt: "Which project should I inspect?", status: "deferred" })],
      learnings: [learning("Choose a random target.")] }).kind).toBe("ask");
  });

  test("uses learnings as durable guidance", () => {
    const decision = evaluateAssistantQuestionPolicy({
      prompt: "What do you like or dislike about launcher game feel?",
      questions: [],
      learnings: [learning("Build sticky arcade games with tight gameplay loops.")]
    });

    expect(decision.kind).toBe("suppress");
  });
});
