import { afterEach, describe, expect, mock, test } from "bun:test";
import { render } from "solid-js/web";
import { SolidMarkdown as ClientSolidMarkdown } from "../../node_modules/solid-markdown/dist/index.js";
import type { TranscriptMessage } from "./chat-transcript";

mock.module("solid-markdown", () => ({ SolidMarkdown: ClientSolidMarkdown }));
const { ChatTranscript } = await import("./chat-transcript");

afterEach(() => document.body.replaceChildren());

describe("ChatTranscript", () => {
  test("executes Markdown rendering for a bounded visible window", async () => {
    const host = document.createElement("div");
    host.style.height = "480px";
    document.body.append(host);
    const messages: TranscriptMessage[] = Array.from({ length: 10_000 }, (_, index) => ({
      id: `message-${index}`,
      role: index % 2 ? "assistant" : "user",
      content: `## Message ${index}\n\n- item one\n- item two\n\n\`code-${index}\``
    }));
    const dispose = render(() => (
      <ChatTranscript messages={messages} estimateMessageHeight={96} overscan={4} stickToEnd={false} />
    ), host);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const rendered = host.querySelectorAll("[data-test-chat-transcript-item]");
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(100);
    expect(host.textContent).toContain("Message");
    expect(host.querySelector("code")?.textContent ?? "").toContain("code-");
    expect(host.querySelector('[role="log"]')?.getAttribute("data-retained-message-count")).toBe("512");
    expect(host.querySelector('[role="log"]')?.getAttribute("data-retained-start")).toBe("9488");
    dispose();
  });

  test("offers host-owned paging while retaining only the configured message window", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    let requests = 0;
    const messages: TranscriptMessage[] = Array.from({ length: 20 }, (_, index) => ({
      id: `page-${index}`, role: "assistant", content: `Page ${index}`
    }));
    const dispose = render(() => <ChatTranscript messages={messages} maxRetainedMessages={5}
      onRequestPrevious={() => { requests += 1; }} stickToEnd={false} />, host);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(host.querySelector('[role="log"]')?.getAttribute("data-retained-message-count")).toBe("5");
    expect(host.textContent).toContain("Load earlier messages");
    expect(host.textContent).toContain("Page 15");
    expect(host.textContent).not.toContain("Page 0");
    const previousButton = host.querySelector("button");
    expect(previousButton).toBeInstanceOf(HTMLButtonElement);
    if (previousButton instanceof HTMLButtonElement) previousButton.click();
    expect(requests).toBe(1);
    dispose();
  });

  test("sanitizes rendered Markdown and exposes an accessible empty state", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const message: TranscriptMessage = {
      id: "safe",
      role: "assistant",
      content: "| A | B |\n| - | - |\n| 1 | 2 |\n\n<script>bad()</script>"
    };
    const dispose = render(() => <ChatTranscript messages={[message]} stickToEnd={false} />, host);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(host.querySelector('[role="log"]')?.getAttribute("aria-label")).toBe("Chat transcript");
    expect(host.querySelector("table")).not.toBeNull();
    expect(host.querySelector("script")).toBeNull();
    dispose();

    const emptyDispose = render(() => <ChatTranscript messages={[]} emptyMessage="Nothing here" />, host);
    expect(host.textContent).toContain("Nothing here");
    emptyDispose();
  });
});
