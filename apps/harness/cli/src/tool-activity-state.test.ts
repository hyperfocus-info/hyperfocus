import { describe, expect, test } from "bun:test";
import type { ExecutionToolActivity } from "@hyperfocus/ai-core/protocol";
import { recordToolEnd, recordToolStart, recordToolUpdate } from "./tool-activity-state";

describe("tool activity raw details", () => {
  test("does not create an ambiguous duplicate tool call across owners", () => {
    const event = { type: "tool-start" as const, toolCallId: "shared", toolName: "shell", args: { command: "echo hi" } };
    const first = recordToolStart([], { runId: "run-1", owner: "main", event });
    const duplicate = recordToolStart(first, { runId: "run-1", owner: "subagent", subagentId: "subagent", event });
    expect(duplicate).toBe(first); expect(duplicate).toHaveLength(1);
    const updated = recordToolUpdate(duplicate, { runId: "run-1", owner: "subagent", subagentId: "subagent",
      event: { type: "tool-update", toolCallId: "shared", toolName: "shell", args: undefined,
        partialResult: { stdout: "foreign" } } });
    const ended = recordToolEnd(updated, { runId: "run-1", owner: "subagent", subagentId: "subagent",
      event: { type: "tool-end", toolCallId: "shared", toolName: "shell", result: { stdout: "foreign-final" }, isError: false } });
    expect(updated).toBe(first); expect(ended).toBe(first);
    expect(ended[0]).toMatchObject({ owner: "main", status: "running", rawArgsJson: '{"command":"echo hi"}' });
    expect(ended[0]?.rawResultJson).toBeUndefined();
    const wrongTool = recordToolEnd(first, { runId: "run-1", owner: "main",
      event: { type: "tool-end", toolCallId: "shared", toolName: "different", result: "foreign", isError: false } });
    expect(wrongTool).toBe(first);
  });

  test("stores bounded raw args and keeps previews", () => {
    const activities = recordToolStart([], {
      runId: "run-1",
      owner: "main",
      event: {
        type: "tool-start",
        toolCallId: "tool-1",
        toolName: "shell",
        args: { command: "echo hi", z: 1, a: 2 }
      },
      occurredAt: "2026-04-23T12:00:00.000Z"
    });

    expect(activities[0]?.command).toBe("echo hi");
    expect(activities[0]?.rawArgsJson).toBe('{"a":2,"command":"echo hi","z":1}');
    expect(activities[0]?.rawArgsTruncated).toBe(false);
    expect(activities[0]?.rawArgsRedacted).toBe(false);
  });

  test("stores partial and final raw result", () => {
    const started = recordToolStart([], {
      runId: "run-1",
      owner: "main",
      event: { type: "tool-start", toolCallId: "tool-1", toolName: "shell", args: { command: "echo hi" } },
      occurredAt: "2026-04-23T12:00:00.000Z"
    });
    const updated = recordToolUpdate(started, {
      runId: "run-1",
      owner: "main",
      event: { type: "tool-update", toolCallId: "tool-1", toolName: "shell", args: undefined, partialResult: { stdout: "partial" } },
      occurredAt: "2026-04-23T12:00:01.000Z"
    });
    const ended = recordToolEnd(updated, {
      runId: "run-1",
      owner: "main",
      event: { type: "tool-end", toolCallId: "tool-1", toolName: "shell", result: { stdout: "final", exitCode: 0 }, isError: false },
      occurredAt: "2026-04-23T12:00:02.000Z"
    });

    expect(updated[0]?.rawResultJson).toBe('{"stdout":"partial"}');
    expect(updated[0]?.rawResultStatus).toBe("partial");
    expect(ended[0]?.rawResultJson).toBe('{"exitCode":0,"stdout":"final"}');
    expect(ended[0]?.rawResultStatus).toBe("final");
    expect(ended[0]?.stdoutPreview).toBe("final");
  });

  test("keeps terminal tool evidence authoritative over late events", () => {
    const identity = { runId: "run-1", owner: "main" as const };
    const started = recordToolStart([], { ...identity,
      event: { type: "tool-start", toolCallId: "terminal", toolName: "shell", args: { command: "ok" } } });
    const ended = recordToolEnd(started, { ...identity, event: { type: "tool-end", toolCallId: "terminal",
      toolName: "shell", result: { stdout: "authoritative" }, isError: false } });
    const lateUpdate = recordToolUpdate(ended, { ...identity, event: { type: "tool-update", toolCallId: "terminal",
      toolName: "shell", args: undefined, partialResult: { stdout: "stale" } } });
    const conflictingEnd = recordToolEnd(ended, { ...identity, event: { type: "tool-end", toolCallId: "terminal",
      toolName: "shell", result: { stderr: "stale failure" }, isError: true } });
    expect(lateUpdate).toBe(ended); expect(conflictingEnd).toBe(ended);
    expect(ended[0]).toMatchObject({ status: "completed", rawResultStatus: "final", outputPreview: "authoritative" });
  });

  test("redacts sensitive raw args and results before persistence", () => {
    const started = recordToolStart([], {
      runId: "run-1",
      owner: "main",
      event: {
        type: "tool-start",
        toolCallId: "tool-1",
        toolName: "web.fetch",
        args: {
          url: "https://example.test",
          headers: {
            authorization: "Bearer abcdefghijklmnopqrstuvwxyz",
            "x-api-key": "sk_test_abcdefghijklmnopqrstuvwxyz"
          }
        }
      },
      occurredAt: "2026-04-23T12:00:00.000Z"
    });
    const ended = recordToolEnd(started, {
      runId: "run-1",
      owner: "main",
      event: {
        type: "tool-end",
        toolCallId: "tool-1",
        toolName: "web.fetch",
        result: { stdout: "token ghp_abcdefghijklmnopqrstuvwxyz1234567890" },
        isError: false
      },
      occurredAt: "2026-04-23T12:00:01.000Z"
    });

    expect(started[0]?.rawArgsJson).toContain('"authorization":"[redacted]"');
    expect(started[0]?.rawArgsJson).toContain('"x-api-key":"[redacted]"');
    expect(started[0]?.rawArgsRedacted).toBe(true);
    expect(ended[0]?.rawResultJson).toContain("[redacted-token]");
    expect(ended[0]?.rawResultRedacted).toBe(true);
  });

  test("marks oversized raw values as truncated", () => {
    const activities = recordToolStart([], {
      runId: "run-1",
      owner: "main",
      event: {
        type: "tool-start",
        toolCallId: "tool-1",
        toolName: "shell",
        args: { command: "x".repeat(70_000) }
      },
      occurredAt: "2026-04-23T12:00:00.000Z"
    });

    expect(activities[0]?.rawArgsJson?.length).toBe(65_536);
    expect(activities[0]?.rawArgsTruncated).toBe(true);
    expect(activities[0]?.argsSummary?.length).toBe(4000);
  });

  test("omits raw values after the per-run raw artifact budget is exhausted", () => {
    let activities: ExecutionToolActivity[] = [];
    for (let index = 0; index < 17; index += 1) {
      activities = recordToolStart(activities, {
        runId: "run-1",
        owner: "main",
        event: {
          type: "tool-start",
          toolCallId: `tool-${index}`,
          toolName: "shell",
          args: { command: "x".repeat(70_000), index }
        },
        occurredAt: "2026-04-23T12:00:00.000Z"
      });
    }

    expect(activities[15]?.rawArgsJson?.length).toBe(65_536);
    expect(activities[16]?.rawArgsJson).toBeUndefined();
    expect(activities[16]?.rawArgsOmittedReason).toBe("run-budget-exceeded");
  });
});
