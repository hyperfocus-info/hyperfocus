import type { Page } from "playwright";
import type { prepareTranscript } from "./transcript-fixture";

export async function checkTranscriptStates(page: Page, fixture: Awaited<ReturnType<typeof prepareTranscript>>, app: string, output: string) {
  const mask = [fixture.panel.locator('input[type="password"]:visible')];
  const before = Number(await fixture.transcript.getAttribute("data-retained-message-count"));
  const resume = fixture.holdNext();
  const sending = fixture.send("Please explain the next step after reviewing this conversation.");
  await page.waitForFunction(count => Number(document.querySelector("[data-test-chat-transcript]")?.getAttribute("data-retained-message-count")) === count + 1, before);
  await fixture.panel.screenshot({ path: `${output}/${app}-loading-panel.png`, mask });
  resume();
  await sending;
  fixture.failNext();
  await fixture.panel.locator("textarea").fill("Try another explanation while the provider is unavailable.");
  await fixture.panel.getByRole("button", { name: "Send", exact: true }).click();
  await fixture.panel.getByRole("alert").getByText("Synthetic provider unavailable. Try again.", { exact: true }).waitFor();
  const after = Number(await fixture.transcript.getAttribute("data-retained-message-count"));
  if (after !== before + 3) throw new Error(`${app}: failed request lost conversation history.`);
  await fixture.panel.screenshot({ path: `${output}/${app}-error-panel.png`, mask });
  await fixture.send("Retry the explanation after recovery.");
  if (await fixture.panel.getByRole("alert").count()) throw new Error(`${app}: retry retained the previous request error.`);
  if (app === "padpilot") {
    await page.setViewportSize({ width: 390, height: 568 });
    const setup = fixture.panel.getByRole("button", { name: "AI settings", exact: true });
    await setup.focus();
    await page.keyboard.press("Enter");
    await fixture.panel.locator('input[type="password"]').waitFor({ state: "visible" });
    const send = fixture.panel.getByRole("button", { name: "Send", exact: true });
    await send.scrollIntoViewIfNeeded();
    const reachable = await send.evaluate(element => { const rect = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)); });
    if (!reachable) throw new Error("PadPilot open setup prevents reaching Send.");
    await fixture.panel.screenshot({ path: `${output}/${app}-setup-short-panel.png`, mask });
    await setup.focus();
    await page.keyboard.press("Enter");
    await fixture.panel.locator('input[type="password"]').waitFor({ state: "hidden" });
  }
  return { app, states: { loading: "Intercepted request held until screenshot", error: "Prior messages retained", recovery: "Next request succeeds", before, afterError: after } };
}
