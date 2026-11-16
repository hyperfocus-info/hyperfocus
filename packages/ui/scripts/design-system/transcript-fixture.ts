import type { Page } from "playwright";

export const transcriptAnswer = `## A quieter starting point

Keep the first screen focused on **one useful action**. The details can stay available without competing with it.

1. Name the current project clearly.
2. Keep the primary action next to its result.
3. Show the next step when there is no content.

> Dense tools still need readable groups and a predictable rhythm.

### Suggested settings

| Setting | Default | Why it matters |
| --- | --- | --- |
| Preview | Enabled | Immediate feedback |
| Quality | Balanced | A responsive editing loop |
| Details | On request | Less visual competition |

\`\`\`typescript
const settings = { preview: true, quality: "balanced", description: "A deliberately long code line should scroll inside its own block, without widening the whole conversation." };
\`\`\`

Read the [design notes](https://example.invalid/notes) before exporting.

Reference: ${"delivery_reference_".repeat(18)}

This is a synthetic review conversation. No project change has been proposed.`;

export async function prepareTranscript(page: Page, app: "editor" | "padpilot") {
  let reply = transcriptAnswer;
  let requests = 0;
  let releaseRun: Promise<void> | undefined;
  let failRun = false;
  await page.route("**/api/ai/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/preferences")) return route.fulfill({ json: { version: 1 } });
    if (path.endsWith("/catalog")) return route.fulfill({ json: {
      agents: [{ id: "direct", label: "Direct", providerIds: ["openai"], supportsReasoning: true, supportsStructuredOutput: true, available: true }],
      providers: [{ id: "openai", label: "OpenAI", authenticated: true, credentialSource: "ambient", modelIds: ["fixture"] }],
      models: [{ id: "fixture", providerId: "openai", label: "Transcript fixture", reasoning: true, input: ["text"] }]
    } });
    if (path.endsWith("/run")) {
      requests++;
      const body = route.request().postDataJSON();
      if (releaseRun) { await releaseRun; releaseRun = undefined; }
      if (failRun) {
        failRun = false;
        return route.fulfill({ json: { requestId: body.requestId, profile: body.profile, stopReason: "error", text: "", errorMessage: "Synthetic provider unavailable. Try again." } });
      }
      return route.fulfill({ json: { requestId: body.requestId, profile: body.profile, stopReason: "stop", text: reply } });
    }
    await route.abort();
    throw new Error(`Unexpected AI request blocked: ${path}`);
  });
  await page.goto(app === "editor" ? process.env.EDITOR_URL ?? "http://127.0.0.1:8797" : `${process.env.PADPILOT_URL ?? "http://127.0.0.1:3001"}/app`);
  if (app === "editor") {
    await page.locator("[data-project-home]").waitFor();
    await page.getByRole("button", { name: "Starter template", exact: true }).click();
    await page.getByRole("option", { name: /^Precision platformer/ }).click();
    await page.locator("#new-project-name").fill("Moonlight Delivery");
    await page.getByRole("button", { name: "Create platformer", exact: true }).click();
    const close = page.locator('[data-editor-action="close-center"]').first();
    if (await close.isVisible()) await close.click();
    await page.getByRole("button", { name: "Open AI project actions", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Continue as guest", exact: true }).click();
    await page.getByRole("button", { name: "Open AI suggestions", exact: true }).click();
  }
  const panel = page.locator(app === "editor" ? "[data-test-editor-ai-panel]" : "[data-test-padpilot-ai-panel]");
  await panel.waitFor();
  const transcript = panel.locator("[data-test-chat-transcript]");
  return { panel, transcript, get requests() { return requests; }, holdNext() {
    let resume = () => {};
    releaseRun = new Promise<void>(resolve => { resume = resolve; });
    return resume;
  }, failNext() { failRun = true; }, async send(prompt: string, answer = transcriptAnswer) {
    reply = answer;
    const previousCount = Number(await transcript.getAttribute("data-retained-message-count"));
    await panel.locator("textarea").fill(prompt);
    await panel.getByRole("button", { name: "Send", exact: true }).click();
    await page.waitForFunction(count => Number(document.querySelector("[data-test-chat-transcript]")?.getAttribute("data-retained-message-count")) === count + 2, previousCount);
    await page.waitForTimeout(150);
  } };
}
