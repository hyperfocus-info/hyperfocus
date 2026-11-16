import type { PiAgentPromptRequest } from "../pi-agent-adapter";
import type { FakePromptUsage } from "./fake-pi-agent-prompt-types";

type ComplexTask = {
  id: string;
  title: string;
  instruction: string;
};

type ComplexTaskPair = [ComplexTask, ComplexTask];
type ComplexScenario = "default" | "early-fail" | "tool-failure";

function withJson(withUsage: FakePromptUsage, payload: Record<string, unknown>) {
  return withUsage(JSON.stringify(payload));
}

function createRepeatedQuestionResult(
  request: PiAgentPromptRequest,
  defaultExecutionModelId: string,
  withUsage: FakePromptUsage
) {
  if (!request.prompt.includes("first answer")) {
    return withJson(withUsage, {
      type: "question",
      summary: "Need first detail",
      question: {
        id: "question-1",
        prompt: "First repeated question?",
        choices: [
          {
            id: "choice-1",
            label: "First",
            description: "Use first answer.",
            answerText: "first answer",
            recommended: true
          },
          {
            id: "choice-2",
            label: "Second",
            description: "Use second option.",
            answerText: "second option",
            recommended: false
          },
          {
            id: "choice-3",
            label: "Custom",
            description: "Type custom answer.",
            answerText: "custom answer",
            recommended: false
          }
        ],
        required: true
      }
    });
  }

  if (!request.prompt.includes("second answer")) {
    return withJson(withUsage, {
      type: "question",
      summary: "Need second detail",
      question: {
        id: "question-1",
        prompt: "Second repeated question?",
        choices: [
          {
            id: "choice-1",
            label: "Second",
            description: "Use second answer.",
            answerText: "second answer",
            recommended: true
          },
          {
            id: "choice-2",
            label: "Alternative",
            description: "Use alternative answer.",
            answerText: "alternative answer",
            recommended: false
          },
          {
            id: "choice-3",
            label: "Custom",
            description: "Type custom answer.",
            answerText: "custom answer",
            recommended: false
          }
        ],
        required: true
      }
    });
  }

  return withJson(withUsage, {
    type: "ready",
    difficultyScore: 20,
    summary: "Ready after repeated questions",
    executionModelId: defaultExecutionModelId,
    usesSubagents: false,
    subtasks: [],
    finalExecutionBrief: "single-step request"
  });
}

function createClarificationResult(
  request: PiAgentPromptRequest,
  defaultExecutionModelId: string,
  withUsage: FakePromptUsage
) {
  if (request.prompt.includes("Prior planning Q/A:\n(none)")) {
    return withJson(withUsage, {
      type: "question",
      summary: "Need one detail before planning",
      question: {
        id: "question-1",
        prompt: "Which route should handle this?",
        placeholder: "api/users/[id]",
        choices: [
          {
            id: "choice-1",
            label: "API route",
            description: "Use provided API route.",
            answerText: "api/users/[id]",
            recommended: true
          },
          {
            id: "choice-2",
            label: "Web route",
            description: "Use page route.",
            answerText: "users/[id]",
            recommended: false
          },
          {
            id: "choice-3",
            label: "Custom",
            description: "Type custom route.",
            answerText: "custom route",
            recommended: false
          }
        ],
        required: true
      }
    });
  }

  return withJson(withUsage, {
    type: "ready",
    difficultyScore: 20,
    summary: "Single-step execution after clarification",
    executionModelId: defaultExecutionModelId,
    usesSubagents: false,
    subtasks: [],
    finalExecutionBrief: "single-step request"
  });
}

function createResumeResult(defaultExecutionModelId: string, withUsage: FakePromptUsage) {
  return withJson(withUsage, {
    type: "ready",
    difficultyScore: 72,
    summary: "Split into two tasks with one risky patch",
    executionModelId: defaultExecutionModelId,
    usesSubagents: true,
    subtasks: [
      { id: "task-1", title: "Inspect files", instruction: "Inspect the codebase" },
      { id: "task-2", title: "Patch code", instruction: "Patch code hard" }
    ],
    finalExecutionBrief: "Combine the subagent outputs into one answer"
  });
}

function createScaffoldResult(defaultExecutionModelId: string, withUsage: FakePromptUsage) {
  return withJson(withUsage, {
    type: "ready",
    difficultyScore: 20,
    summary: "Scaffold missing app files",
    executionModelId: defaultExecutionModelId,
    usesSubagents: false,
    subtasks: [],
    finalExecutionBrief: "Scaffold app files in the workspace"
  });
}

function createContract(task: ComplexTask, ownedPath: string, deliverable: string, prerequisites: string[] = []) {
  return {
    taskId: task.id,
    title: task.title,
    instruction: task.instruction,
    effortPoints: 2,
    ownedPaths: [ownedPath],
    dependsOnPrerequisiteIds: prerequisites,
    deliverables: [deliverable],
    integrationPoints: ["Aggregator summary"],
    verificationScope: "owned-files-only",
    verificationCommands: ["bun --version"],
    mergeNotes: "No merge conflicts expected."
  };
}

function createComplexPrerequisiteResult(
  request: PiAgentPromptRequest,
  defaultExecutionModelId: string,
  withUsage: FakePromptUsage
) {
  const shouldFailPrerequisite = request.prompt.includes("complex failing prerequisite task");
  const shouldUseAliasedOwner = request.prompt.includes("complex aliased prerequisite task");
  const tasks: ComplexTaskPair = [
    { id: "task-1", title: "Inspect files", instruction: "Inspect the codebase" },
    { id: "task-2", title: "Patch code", instruction: "Patch the code" }
  ];
  return withJson(withUsage, {
    difficultyScore: 72,
    summary: "Split into setup and subagent work",
    executionModelId: defaultExecutionModelId,
    usesSubagents: true,
    prerequisites: [
      {
        id: "setup-1",
        title: shouldFailPrerequisite ? "Fail shared setup" : "Create shared setup",
        instruction: shouldFailPrerequisite
          ? "Fail shared setup before fan-out"
          : "Create shared scaffold before fan-out",
        reason: "Subagents need shared setup first",
        requiredForTaskIds: ["task-1", "task-2"],
        owner: shouldUseAliasedOwner ? "user" : "main",
        verificationCommands: ["bun --version"]
      }
    ],
    subtasks: tasks,
    contracts: [
      createContract(tasks[0], "inspection.txt", "Inspect current codebase state", ["setup-1"]),
      createContract(tasks[1], "patch.txt", "Patch requested code path", ["setup-1"])
    ],
    finalExecutionBrief: "Combine setup and subagent outputs into one answer"
  });
}

function selectComplexScenario(prompt: string): ComplexScenario {
  if (prompt.includes("tool failure burst")) {
    return "tool-failure";
  }
  return prompt.includes("early fail") ? "early-fail" : "default";
}

function createComplexTasks(scenario: ComplexScenario): ComplexTaskPair {
  if (scenario === "tool-failure") {
    return [
      { id: "task-1", title: "Tool failure task", instruction: "Emit tool failure burst" },
      { id: "task-2", title: "Inspect files", instruction: "Inspect the codebase" }
    ];
  }
  if (scenario === "early-fail") {
    return [
      { id: "task-1", title: "Inspect files", instruction: "Inspect files slow" },
      { id: "task-2", title: "Patch code", instruction: "Patch code always fail" }
    ];
  }
  return [
    { id: "task-1", title: "Inspect files", instruction: "Inspect the codebase" },
    { id: "task-2", title: "Patch code", instruction: "Patch the code" }
  ];
}

function createComplexResult(request: PiAgentPromptRequest, defaultExecutionModelId: string, withUsage: FakePromptUsage) {
  if (
    request.prompt.includes("complex prerequisite task") ||
    request.prompt.includes("complex aliased prerequisite task") ||
    request.prompt.includes("complex failing prerequisite task")
  ) {
    return createComplexPrerequisiteResult(request, defaultExecutionModelId, withUsage);
  }

  const scenario = selectComplexScenario(request.prompt);
  const tasks = createComplexTasks(scenario);
  const firstContract =
    scenario === "tool-failure"
      ? createContract(tasks[0], "tool-burst.txt", "tool-burst.txt")
      : createContract(tasks[0], "inspection.txt", "Inspect current codebase state");
  const secondContract =
    scenario === "tool-failure"
      ? createContract(tasks[1], "inspection.txt", "Inspect current codebase state")
      : createContract(tasks[1], "patch.txt", "Patch requested code path");
  const summary =
    scenario === "tool-failure"
      ? "Split into tool burst and inspect work"
      : scenario === "early-fail"
        ? "Split into slow inspect and failing patch"
        : "Split into two tasks";

  return withJson(withUsage, {
    difficultyScore: 72,
    summary,
    executionModelId: defaultExecutionModelId,
    usesSubagents: true,
    subtasks: tasks,
    contracts: [firstContract, secondContract],
    finalExecutionBrief: "Combine the subagent outputs into one answer"
  });
}

function createDefaultResult(request: PiAgentPromptRequest, defaultExecutionModelId: string, withUsage: FakePromptUsage) {
  return withJson(withUsage, {
    difficultyScore: 20,
    summary: "Single-step execution",
    executionModelId: defaultExecutionModelId,
    usesSubagents: false,
    subtasks: [],
    finalExecutionBrief: request.prompt.includes("slow") ? "slow request" : "single-step request"
  });
}

export async function runFakePlannerPrompt(
  request: PiAgentPromptRequest,
  defaultExecutionModelId: string,
  withUsage: FakePromptUsage
) {
  if (request.prompt.includes("slow needs clarification")) {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (request.prompt.includes("same-run repeated question")) {
    return createRepeatedQuestionResult(request, defaultExecutionModelId, withUsage);
  }
  if (request.prompt.includes("needs clarification")) {
    return createClarificationResult(request, defaultExecutionModelId, withUsage);
  }
  if (request.prompt.includes("resume task")) {
    return createResumeResult(defaultExecutionModelId, withUsage);
  }
  if (request.prompt.includes("read-only scaffold failure")) {
    return createScaffoldResult(defaultExecutionModelId, withUsage);
  }
  if (request.prompt.includes("complex")) {
    return createComplexResult(request, defaultExecutionModelId, withUsage);
  }
  return createDefaultResult(request, defaultExecutionModelId, withUsage);
}
