import { describe, expect, it } from "bun:test";
import {
  buildCodexGeneratorCommand, isCodexGeneratorOutputLimitError,
  readBoundedTextStream,
  resolveCodexGeneratorTimeoutMs,
  runCodexGenerator,
} from "./codex-generator";

describe("codex generator command", () => {
  it("builds a Codex exec command compatible with the local CLI", () => {
    const command = buildCodexGeneratorCommand({
      model: "5.5 low fast",
      prompt: "Genre: Glitch Hop\nScale/Mode: F# Major Pentatonic",
      provider: "cursor",
      system: "Return tracker text.",
    });

    expect(command.executable).toBe("codex");
    expect(command.args).toContain("exec");
    expect(command.args).toContain("--ephemeral");
    expect(command.args).toContain("--skip-git-repo-check");
    expect(command.args).toContain("--ignore-rules");
    expect(command.args).toContain("--color");
    expect(command.args).toContain("never");
    expect(command.args).toContain("--sandbox");
    expect(command.args).toContain("read-only");
    expect(command.args).toContain("--model");
    expect(command.args).toContain("gpt-5.5");
    expect(command.args).toContain("features.fast_mode=true");
    expect(command.args).not.toContain("--ask-for-approval");
    expect(command.prompt).toContain("Scale/Mode: F# Major Pentatonic");
    expect(command.prompt).toContain("Return only raw Delta-Tick String Tracker Format.");
  });

  it("passes an output schema and allows a JSON envelope when schema is provided", () => {
    const command = buildCodexGeneratorCommand({
      prompt: "Genre: Lofi",
      responseSchema: { properties: { tracker: { type: "string" } }, type: "object" },
      responseSchemaName: "generator-model-envelope-v1",
      system: "Return only Delta-Tick String Tracker Format v2:\n!BPM:120!",
    }, "C:/tmp/padpilot-last-message.txt", "C:/tmp/padpilot-schema.json");

    expect(command.args).toContain("--output-schema");
    expect(command.args).toContain("C:/tmp/padpilot-schema.json");
    expect(command.prompt).toContain("Return only a JSON object matching the provided output schema.");
    expect(command.prompt).toContain("tracker field");
    expect(command.prompt).toContain("The JSON tracker field must contain Delta-Tick String Tracker Format v2:");
    expect(command.prompt).toContain("Primary lanes need material in each 4-bar section");
    expect(command.prompt).not.toContain("Every track needs notes in every 4-bar section");
    expect(command.prompt).not.toContain("Return only Delta-Tick String Tracker Format v2:");
    expect(command.prompt).not.toContain("otherwise return tracker text");
    expect(command.prompt).not.toContain("No JSON");
  });

  it("rewrites punctuation variants of raw-only tracker directives in schema mode", () => {
    const command = buildCodexGeneratorCommand({
      prompt: "Genre: Lofi",
      responseSchema: { properties: { tracker: { type: "string" } }, type: "object" },
      system: "Return only Delta-Tick String Tracker Format v2.\n!BPM:120!",
    });

    expect(command.prompt).toContain("The JSON tracker field must contain Delta-Tick String Tracker Format v2:");
    expect(command.prompt).not.toContain("Return only Delta-Tick String Tracker Format v2.");
  });

  it("can route the final Codex response to an explicit output file", () => {
    const command = buildCodexGeneratorCommand({
      prompt: "Genre: Lofi",
      system: "Return tracker text.",
    }, "C:/tmp/padpilot-last-message.txt");

    expect(command.args).toContain("--output-last-message");
    expect(command.args).toContain("C:/tmp/padpilot-last-message.txt");
    expect(command.args.at(-1)).toBe(command.prompt);
  });

  it("uses a longer configurable timeout for slow Codex generations", () => {
    const previous = process.env.PADPILOT_CODEX_TIMEOUT_MS;
    try {
      delete process.env.PADPILOT_CODEX_TIMEOUT_MS;
      expect(resolveCodexGeneratorTimeoutMs()).toBe(300_000);

      process.env.PADPILOT_CODEX_TIMEOUT_MS = "90000";
      expect(resolveCodexGeneratorTimeoutMs()).toBe(90_000);

      process.env.PADPILOT_CODEX_TIMEOUT_MS = "1";
      expect(resolveCodexGeneratorTimeoutMs()).toBe(10_000);

      process.env.PADPILOT_CODEX_TIMEOUT_MS = "999999999";
      expect(resolveCodexGeneratorTimeoutMs()).toBe(1_800_000);
    } finally {
      if (previous === undefined) {
        delete process.env.PADPILOT_CODEX_TIMEOUT_MS;
      } else {
        process.env.PADPILOT_CODEX_TIMEOUT_MS = previous;
      }
    }
  });

  it("stops consuming child output when the byte budget is exceeded", async () => {
    let overflowed = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
        controller.close();
      },
    });

    expect(await readBoundedTextStream(stream, 5, "stdout", () => {
      overflowed = true;
    }).then(() => false, isCodexGeneratorOutputLimitError)).toBe(true);
    expect(overflowed).toBe(true);
  });

  it("rejects an oversized output schema before spawning Codex", async () => {
    expect(await runCodexGenerator({
      prompt: "Genre: Lofi",
      responseSchema: { description: "x".repeat(300_000), type: "object" },
      system: "Return tracker text.",
    }).then(() => false, isCodexGeneratorOutputLimitError)).toBe(true);
  });
});
