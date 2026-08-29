import { describe, expect, test } from "bun:test";
import { defaultProviderCapabilities } from "@hyperfocus/ai-core/capabilities";
import { parseClientCommand, parseServerEvent } from "@hyperfocus/ai-core/protocol";

describe("client command validation", () => {
  test("rejects malformed chat.send payloads", () => {
    expect(() =>
      parseClientCommand({
        type: "chat.send",
        requestId: "req-1",
        payload: {
          projectId: "project-1",
          agentId: "pi",
          executionModelId: "bad model id",
          content: "hello"
        }
      })
    ).toThrow();
  });

  test("rejects malformed agent.list payloads", () => {
    expect(() =>
      parseClientCommand({
        type: "agent.list",
        payload: {}
      })
    ).toThrow();
  });

  test("accepts usage reset command", () => {
    expect(
      parseClientCommand({
        type: "usage.reset",
        requestId: "req-usage-reset"
      }).type
    ).toBe("usage.reset");
  });

  test("rejects malformed project.add payloads", () => {
    expect(() =>
      parseClientCommand({
        type: "project.add",
        requestId: "req-2",
        payload: {
          rootPath: ""
        }
      })
    ).toThrow();
  });

  test("accepts project.search payloads", () => {
    expect(
      parseClientCommand({
        type: "project.search",
        requestId: "req-search",
        payload: {
          query: "repo"
        }
      }).type
    ).toBe("project.search");
  });

  test("accepts IDE file and search payloads", () => {
    expect(
      parseClientCommand({
        type: "ide.fileTree.list",
        requestId: "req-ide-tree",
        payload: {
          projectId: "project-1"
        }
      }).type
    ).toBe("ide.fileTree.list");
    expect(
      parseClientCommand({
        type: "ide.file.read",
        requestId: "req-ide-read",
        payload: {
          projectId: "project-1",
          path: "src/app.ts"
        }
      }).type
    ).toBe("ide.file.read");
    expect(
      parseClientCommand({
        type: "ide.search.run",
        requestId: "req-ide-search",
        payload: {
          projectId: "project-1",
          query: "needle",
          regex: false,
          caseSensitive: true
        }
      }).type
    ).toBe("ide.search.run");
  });

  test("accepts branchfs cleanup payloads", () => {
    expect(
      parseClientCommand({
        type: "branchfs.cleanup",
        requestId: "req-branchfs-cleanup",
        payload: {
          projectId: "project-1",
          mode: "all"
        }
      }).type
    ).toBe("branchfs.cleanup");
  });

  test("accepts thread cleanup archive payloads", () => {
    const command = parseClientCommand({
      type: "thread.cleanupArchive",
      requestId: "req-cleanup",
      payload: {
        projectIds: ["project-1", "project-2"],
        olderThanMs: 30 * 24 * 60 * 60 * 1000,
        ageBasis: "last-user-message"
      }
    });

    expect(command.type).toBe("thread.cleanupArchive");
  });

  test("accepts thread pin payloads", () => {
    const command = parseClientCommand({
      type: "thread.pin",
      requestId: "req-thread-pin",
      payload: {
        projectId: "project-1",
        threadId: "thread-1",
        pinned: true
      }
    });

    expect(command.type).toBe("thread.pin");
  });

  test("accepts memory reorder payloads", () => {
    const command = parseClientCommand({
      type: "memory.reorder",
      requestId: "req-memory-reorder",
      payload: {
        projectId: "project-1",
        memoryEntryId: "memory-1",
        direction: "up"
      }
    });

    expect(command.type).toBe("memory.reorder");
  });

  test("accepts thread cleanup archive payloads for all projects", () => {
    const command = parseClientCommand({
      type: "thread.cleanupArchive",
      requestId: "req-cleanup-all",
      payload: {
        olderThanMs: 7 * 24 * 60 * 60 * 1000,
        ageBasis: "last-user-message"
      }
    });

    expect(command.type).toBe("thread.cleanupArchive");
  });

  test("rejects malformed thread cleanup archive payloads", () => {
    expect(() =>
      parseClientCommand({
        type: "thread.cleanupArchive",
        requestId: "req-cleanup-bad",
        payload: {
          projectIds: [""],
          olderThanMs: 0,
          ageBasis: "updated-at"
        }
      })
    ).toThrow();
  });

  test("rejects malformed preferences.save payloads", () => {
    expect(() =>
      parseClientCommand({
        type: "preferences.save",
        requestId: "req-pref",
        payload: {
          openAiApiKey: "",
          providerBrand: "gpt",
          debugEnabled: true,
          tracePanelDefaultOpen: false,
          attachmentsEnabled: true,
          capabilities: defaultProviderCapabilities
        }
      })
    ).toThrow();
  });

  test("accepts preferences.clearApiKey without payload", () => {
    expect(
      parseClientCommand({
        type: "preferences.clearApiKey",
        requestId: "req-clear"
      }).type
    ).toBe("preferences.clearApiKey");
  });

  test("accepts provider connection test commands", () => {
    const parsed = parseClientCommand({
      type: "preferences.testProviderConnection",
      requestId: "req-test-provider",
      payload: {
        provider: "openai",
        apiKey: "sk-local-123"
      }
    });

    expect(parsed.type).toBe("preferences.testProviderConnection");
  });

  test("rejects malformed provider connection test commands", () => {
    expect(() =>
      parseClientCommand({
        type: "preferences.testProviderConnection",
        requestId: "req-test-provider-bad",
        payload: {
          provider: "ollama",
          apiKey: "local"
        }
      })
    ).toThrow();
  });

  test("accepts preferences.save payloads with dirty git controls", () => {
    expect(
      parseClientCommand({
        type: "preferences.save",
        requestId: "req-pref-valid",
        payload: {
          openAiApiKey: "sk-local-123",
          providerBrand: "gpt",
          debugEnabled: true,
          tracePanelDefaultOpen: false,
          attachmentsEnabled: true,
          capabilities: defaultProviderCapabilities,
          subagentWorktreeStrategyDefault: "same-worktree",
          blockChatOnDirtyGitDefault: true,
          dirtyGitChangeLimitDefault: 12,
          autoCompactContextThresholdPercentDefault: 40,
          planExecutionModeDefault: "countdown",
          planExecutionDelaySecondsDefault: 10,
          correctnessIterationModeDefault: "ask-before-iterate",
          backgroundJobApprovalPolicyDefault: "ask-risky",
          assistantAutoApproveNonBlockingQuestionsDefault: false,
          maxBackgroundJobsDefault: 10
        }
      }).type
    ).toBe("preferences.save");
  });

  test("rejects out-of-range max background jobs preferences", () => {
    const payload = {
      providerBrand: "gpt",
      debugEnabled: true,
      tracePanelDefaultOpen: false,
      subagentWorktreeStrategyDefault: "same-worktree",
      blockChatOnDirtyGitDefault: true,
      dirtyGitChangeLimitDefault: 12,
      autoCompactContextThresholdPercentDefault: 40,
      planExecutionModeDefault: "countdown",
      planExecutionDelaySecondsDefault: 10,
      correctnessIterationModeDefault: "ask-before-iterate",
      backgroundJobApprovalPolicyDefault: "ask-risky"
    };

    expect(() =>
      parseClientCommand({
        type: "preferences.save",
        requestId: "req-pref-low",
        payload: {
          ...payload,
          maxBackgroundJobsDefault: 4
        }
      })
    ).toThrow();
    expect(() =>
      parseClientCommand({
        type: "preferences.save",
        requestId: "req-pref-high",
        payload: {
          ...payload,
          maxBackgroundJobsDefault: 101
        }
      })
    ).toThrow();
  });

  test("accepts planning.answer payloads", () => {
    expect(
      parseClientCommand({
        type: "planning.answer",
        requestId: "req-answer",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          questionId: "question-1",
          content: "Use the API route."
        }
      }).type
    ).toBe("planning.answer");
  });

  test("accepts runtime budget launch payloads", () => {
    expect(
      parseClientCommand({
        type: "chat.send",
        requestId: "req-budget-chat",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          agentId: "pi",
          content: "ship it",
          runtimeBudget: { maxTurns: 3 }
        }
      }).type
    ).toBe("chat.send");

    expect(
      parseClientCommand({
        type: "run.execute",
        requestId: "req-budget-run",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          runtimeBudget: { maxTurns: 2 }
        }
      }).type
    ).toBe("run.execute");

    expect(
      parseClientCommand({
        type: "assistant.chat.send",
        requestId: "req-controls-assistant-chat",
        payload: {
          assistantId: "assistant-1",
          content: "Check this",
          modeId: "implement",
          executionModelId: "openai/gpt-5.4",
          reasoningStrength: "high",
          fastMode: true
        }
      }).type
    ).toBe("assistant.chat.send");
  });

  test("rejects invalid runtime budget values", () => {
    expect(() =>
      parseClientCommand({
        type: "run.execute",
        requestId: "req-budget-bad",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          runtimeBudget: { maxTurns: 0 }
        }
      })
    ).toThrow();
  });

  test("accepts run.complete payloads", () => {
    expect(
      parseClientCommand({
        type: "run.complete",
        requestId: "req-complete",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          assistantMessageContent: "Done.",
          partialReason: "Some optional checks skipped."
        }
      }).type
    ).toBe("run.complete");
  });

  test("accepts planning.answer-batch payloads", () => {
    expect(
      parseClientCommand({
        type: "planning.answer-batch",
        requestId: "req-answer-batch",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          answers: [
            { questionId: "question-1", content: "Use the API route." },
            { questionId: "question-2", content: "Keep current styling." }
          ]
        }
      }).type
    ).toBe("planning.answer-batch");
  });

  test("accepts assistant.create-from-thread payloads", () => {
    expect(
      parseClientCommand({
        type: "assistant.create-from-thread",
        requestId: "req-assistant-thread",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          sourcePrompt: "Catalog builder start executing todos",
          name: "Catalog builder",
          scope: "project",
          modeId: "implement",
          executionModelId: "openai/gpt-5.4",
          agentId: "pi"
        }
      }).type
    ).toBe("assistant.create-from-thread");
  });

  test("accepts assistant circuit breaker retry payloads", () => {
    expect(
      parseClientCommand({
        type: "assistant.circuit-breaker.retry",
        requestId: "req-assistant-recover",
        payload: {
          assistantId: "assistant-1"
        }
      }).type
    ).toBe("assistant.circuit-breaker.retry");
  });

  test("accepts assistant job bootstrap payloads", () => {
    expect(
      parseClientCommand({
        type: "assistant.jobs.bootstrap",
        requestId: "req-assistant-jobs-bootstrap",
        payload: {
          assistantId: "assistant-1",
          projectId: "project-1"
        }
      }).type
    ).toBe("assistant.jobs.bootstrap");
  });

  test("accepts assistant.question.answer-batch payloads", () => {
    expect(
      parseClientCommand({
        type: "assistant.question.answer-batch",
        requestId: "req-assistant-answer-batch",
        payload: {
          assistantId: "assistant-1",
          answers: [
            { questionId: "assistant-question-1", content: "Proceed with defaults." },
            { questionId: "assistant-question-2", content: "Run validation after." }
          ]
        }
      }).type
    ).toBe("assistant.question.answer-batch");
  });

  test("rejects malformed assistant.create-from-thread payloads", () => {
    expect(() =>
      parseClientCommand({
        type: "assistant.create-from-thread",
        requestId: "req-assistant-thread",
        payload: {
          threadId: "thread-1",
          sourcePrompt: "Catalog builder start executing todos"
        }
      })
    ).toThrow();
  });

  test("accepts planning payloads with attachments", () => {
    const attachment = {
      id: "attachment-plan",
      kind: "text",
      name: "plan.md",
      mimeType: "text/markdown",
      sizeBytes: 120,
      url: "https://example.com/plan.md",
      key: "plan-key",
      uploadedAt: new Date().toISOString()
    } as const;

    expect(
      parseClientCommand({
        type: "planning.answer",
        requestId: "req-answer-attach",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          questionId: "question-1",
          content: "Use the uploaded plan.",
          attachments: [attachment]
        }
      }).type
    ).toBe("planning.answer");

    expect(
      parseClientCommand({
        type: "planning.refine",
        requestId: "req-refine-attach",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          content: "Refine with uploaded plan.",
          attachments: [attachment]
        }
      }).type
    ).toBe("planning.refine");
  });

  test("accepts composer control payloads on chat and run commands", () => {
    expect(
      parseClientCommand({
        type: "chat.send",
        requestId: "req-controls-chat",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          agentId: "pi",
          content: "Ship it",
          modeLocked: true,
          reasoningStrength: "extra-high",
          fastMode: true
        }
      }).type
    ).toBe("chat.send");

    expect(
      parseClientCommand({
        type: "run.execute",
        requestId: "req-controls-run",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          reasoningStrength: "medium",
          fastMode: false
        }
      }).type
    ).toBe("run.execute");
  });

  test("accepts chat.send payloads with attachments", () => {
    expect(
      parseClientCommand({
        type: "chat.send",
        requestId: "req-attach",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          agentId: "pi",
          content: "Review attached files",
          attachments: [
            {
              id: "attachment-1",
              kind: "text",
              name: "spec.md",
              mimeType: "text/markdown",
              sizeBytes: 120,
              url: "https://example.com/spec.md",
              key: "spec-key",
              uploadedAt: new Date().toISOString()
            }
          ]
        }
      }).type
    ).toBe("chat.send");
  });

  test("accepts chat.send payloads with document attachments", () => {
    expect(
      parseClientCommand({
        type: "chat.send",
        requestId: "req-attach-doc",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          agentId: "pi",
          content: "Review attached documents",
          attachments: [
            {
              id: "attachment-doc-1",
              kind: "document",
              documentType: "pdf",
              name: "spec.pdf",
              mimeType: "application/pdf",
              sizeBytes: 2048,
              url: "https://example.com/spec.pdf",
              key: "spec-pdf",
              uploadedAt: new Date().toISOString()
            }
          ]
        }
      }).type
    ).toBe("chat.send");
  });

  test("rejects empty planning.answer content", () => {
    expect(() =>
      parseClientCommand({
        type: "planning.answer",
        requestId: "req-answer-2",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          questionId: "question-1",
          content: "   "
        }
      })
    ).toThrow();
  });

  test("accepts planning.refine payloads", () => {
    expect(
      parseClientCommand({
        type: "planning.refine",
        requestId: "req-refine",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          content: "Scope this to the existing route only."
        }
      }).type
    ).toBe("planning.refine");
  });

  test("accepts cli-session.start payloads", () => {
    expect(
      parseClientCommand({
        type: "cli-session.start",
        requestId: "req-cli-start",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          agentId: "codex-cli",
          cols: 120,
          rows: 32,
          prompt: "Inspect this repo"
        }
      }).type
    ).toBe("cli-session.start");
  });

  test("accepts terminal session and preference payloads", () => {
    expect(
      parseClientCommand({
        type: "terminal.session.create",
        requestId: "req-terminal-start",
        payload: {
          projectId: "project-1",
          shellId: "bash",
          cols: 120,
          rows: 32,
          env: [{ name: "FEATURE_FLAG", value: "1", secret: false }]
        }
      }).type
    ).toBe("terminal.session.create");

    expect(
      parseClientCommand({
        type: "terminal.sessions.list",
        requestId: "req-terminal-list",
        payload: {
          projectId: "project-1"
        }
      }).type
    ).toBe("terminal.sessions.list");

    expect(
      parseClientCommand({
        type: "terminal.history.list",
        requestId: "req-terminal-history",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1"
        }
      }).type
    ).toBe("terminal.history.list");

    expect(
      parseClientCommand({
        type: "terminal.session.set-input-override",
        requestId: "req-terminal-override",
        payload: {
          projectId: "project-1",
          sessionId: "terminal-1",
          allowInput: true
        }
      }).type
    ).toBe("terminal.session.set-input-override");

    expect(
      parseClientCommand({
        type: "terminal.preferences.save",
        requestId: "req-terminal-prefs",
        payload: {
          preferences: {
            scrollbackLimit: 10000,
            copyOnSelect: false,
            ctrlCMode: "auto",
            rendererMode: "xterm-webgl"
          },
          layout: {
            type: "split",
            id: "root",
            direction: "vertical",
            sizes: [50, 50],
            children: [
              { type: "leaf", id: "left", sessionId: "terminal-1" },
              { type: "leaf", id: "right", sessionId: "terminal-2" }
            ]
          }
        }
      }).type
    ).toBe("terminal.preferences.save");
  });

  test("rejects malformed terminal env vars", () => {
    expect(() =>
      parseClientCommand({
        type: "terminal.session.create",
        requestId: "req-terminal-invalid",
        payload: {
          projectId: "project-1",
          cols: 80,
          rows: 24,
          env: [{ name: "1INVALID", value: "bad", secret: false }]
        }
      })
    ).toThrow();
  });

  test("accepts terminal history events with agent source metadata", () => {
    const now = new Date().toISOString();
    expect(
      parseServerEvent({
        type: "terminal.history.listed",
        requestId: "req-terminal-history",
        payload: {
          scope: {
            projectId: "project-1",
            threadId: "thread-1",
            runId: "run-1"
          },
          sessions: [
            {
              id: "terminal-1",
              projectId: "project-1",
              source: {
                kind: "agent",
                threadId: "thread-1",
                runId: "run-1",
                label: "Run run-1",
                trigger: "run"
              },
              name: "PowerShell",
              shellId: "powershell",
              cwd: "C:\\repo",
              status: "exited",
              inputMode: "read-only",
              inputOverride: false,
              cols: 120,
              rows: 32,
              startedAt: now,
              updatedAt: now,
              exitedAt: now,
              closedAt: now
            }
          ]
        }
      }).type
    ).toBe("terminal.history.listed");
  });

  test("accepts run.execute payloads", () => {
    expect(
      parseClientCommand({
        type: "run.execute",
        requestId: "req-execute",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1"
        }
      }).type
    ).toBe("run.execute");
  });

  test("accepts run.resume payloads", () => {
    expect(
      parseClientCommand({
        type: "run.resume",
        requestId: "req-resume",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          guidanceText: "Retry only the patch task.",
          subagentIds: ["task-2"]
        }
      }).type
    ).toBe("run.resume");
  });

  test("accepts run.retry payloads", () => {
    expect(
      parseClientCommand({
        type: "run.retry",
        requestId: "req-retry",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          subagentId: "task-1"
        }
      }).type
    ).toBe("run.retry");
  });

  test("accepts run.refresh payloads", () => {
    expect(
      parseClientCommand({
        type: "run.refresh",
        requestId: "req-refresh",
        payload: {
          projectId: "project-1",
          threadId: "thread-1",
          runId: "run-1",
          subagentId: "task-1"
        }
      }).type
    ).toBe("run.refresh");
  });

  test("accepts execution pause and resume commands", () => {
    expect(
      parseClientCommand({
        type: "execution.pause-all",
        requestId: "req-pause"
      }).type
    ).toBe("execution.pause-all");

    expect(
      parseClientCommand({
        type: "execution.resume-all",
        requestId: "req-resume-all"
      }).type
    ).toBe("execution.resume-all");
  });

  test("accepts update commands for non-agent cli targets", () => {
    expect(
      parseClientCommand({
        type: "cli-updates.install",
        requestId: "req-claude-update",
        payload: {
          agentId: "claude-cli"
        }
      }).type
    ).toBe("cli-updates.install");
  });

  test("accepts run diagnostics inspect payloads for 1, 7, and 30 days only", () => {
    expect(
      parseClientCommand({
        type: "run-diagnostics.inspect",
        requestId: "req-diag-7",
        payload: {
          windowDays: 7
        }
      }).type
    ).toBe("run-diagnostics.inspect");

    expect(() =>
      parseClientCommand({
        type: "run-diagnostics.inspect",
        requestId: "req-diag-invalid",
        payload: {
          windowDays: 2
        }
      })
    ).toThrow();
  });
});
