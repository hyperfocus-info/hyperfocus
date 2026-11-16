import type { Page } from "playwright";
import { prepareTranscript, transcriptAnswer } from "./transcript-fixture";

type Fixture = Awaited<ReturnType<typeof prepareTranscript>>;

export async function checkTranscript(page: Page, fixture: Fixture, app: string, output: string) {
  const results: object[] = [];
  const measure = async (name: string) => {
    const geometry = await fixture.transcript.evaluate(element => {
      const rect = element.getBoundingClientRect();
      let top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) continue;
        const bounds = parent.getBoundingClientRect();
        top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
      }
      return { width: element.clientWidth, scrollWidth: element.scrollWidth, height: element.clientHeight, visibleHeight: Math.max(0, bottom - top), scrollHeight: element.scrollHeight, mounted: element.querySelectorAll("[data-test-chat-transcript-item]").length };
    });
    if (geometry.scrollWidth > geometry.width + 1) throw new Error(`${app} ${name}: transcript overflows horizontally ${JSON.stringify(geometry)}`);
    if (geometry.visibleHeight < 118) throw new Error(`${app} ${name}: transcript reading area clipped ${JSON.stringify(geometry)}`);
    results.push({ app, name, geometry });
  };
  await measure("mobile");
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await page.waitForTimeout(200);
  await fixture.panel.screenshot({ path: `${output}/${app}-text200-panel.png`, mask: [fixture.panel.locator('input[type="password"]:visible')] });
  await measure("text200");
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await page.setViewportSize({ width: 390, height: 568 });
  await page.waitForTimeout(200);
  await fixture.panel.screenshot({ path: `${output}/${app}-short-panel.png`, mask: [fixture.panel.locator('input[type="password"]:visible')] });
  await measure("short");
  const send = fixture.panel.getByRole("button", { name: "Send", exact: true });
  await send.scrollIntoViewIfNeeded();
  const sendReachable = await send.evaluate(element => { const rect = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)); });
  if (!sendReachable) throw new Error(`${app}: composer send is not reachable in short viewport.`);
  results.push({ app, shortSendReachable: sendReachable });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const code = fixture.transcript.getByRole("region", { name: "Code block", exact: true });
  const codeTarget = await code.count() ? code.first() : fixture.transcript.locator('pre[aria-label="Code block"]').first();
  await codeTarget.focus();
  const codeBefore = await codeTarget.evaluate(element => element.scrollLeft);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);
  const codeAfter = await codeTarget.evaluate(element => element.scrollLeft);
  if (codeAfter <= codeBefore) throw new Error(`${app}: focused code did not scroll with keyboard.`);
  results.push({ app, codeKeyboardScroll: { before: codeBefore, after: codeAfter } });
  await fixture.transcript.getByRole("region", { name: "Message table", exact: true }).focus();
  if (!await fixture.transcript.getByRole("region", { name: "Message table", exact: true }).evaluate(element => element === document.activeElement)) throw new Error(`${app}: table cannot receive keyboard focus.`);
  for (let turn = 0; turn < 20; turn++) {
    await fixture.send(`Conversation turn ${turn + 2}: explain the next step.`, `### Step ${turn + 2}\n\nKeep the next decision visible and the secondary details available. This is a synthetic review conversation.\n\n${turn % 5 === 0 ? transcriptAnswer : "Use the existing controls and preserve keyboard access."}`);
  }
  await fixture.transcript.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.waitForTimeout(250);
  const retained = Number(await fixture.transcript.getAttribute("data-retained-message-count"));
  const mounted = await fixture.transcript.locator("[data-test-chat-transcript-item]").count();
  if (retained !== 42 || mounted >= retained) throw new Error(`${app}: history was not bounded: ${retained} retained, ${mounted} mounted.`);
  results.push({ app, longConversation: { retained, mounted } });
  await fixture.transcript.evaluate(element => { element.scrollTop = 100; element.dispatchEvent(new Event("scroll")); });
  await page.waitForTimeout(250);
  const readingBefore = await fixture.transcript.evaluate(element => element.scrollTop);
  await fixture.send("One more short question while reviewing older context.", "The latest answer stays available. This is a synthetic review conversation.");
  const readingAfter = await fixture.transcript.evaluate(element => element.scrollTop);
  if (Math.abs(readingAfter - readingBefore) > 2) throw new Error(`${app}: append displaced reading ${readingBefore} => ${readingAfter}`);
  results.push({ app, readingDuringAppend: { before: readingBefore, after: readingAfter } });
  await fixture.transcript.focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  const afterSpace = await fixture.transcript.evaluate(element => element.scrollTop);
  if (afterSpace <= readingAfter) throw new Error(`${app}: focused transcript Space did not scroll ${readingAfter} => ${afterSpace}`);
  results.push({ app, spaceKeyboardScroll: { before: readingAfter, after: afterSpace } });
  await measure("long-conversation");
  await fixture.panel.screenshot({ path: `${output}/${app}-history-panel.png`, mask: [fixture.panel.locator('input[type="password"]:visible')] });
  const latest = fixture.panel.getByRole("button", { name: "Return to latest", exact: true });
  await latest.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  const endGap = await fixture.transcript.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop);
  if (endGap > 2) throw new Error(`${app}: latest did not reach end ${endGap}`);
  results.push({ app, latestKeyboard: { endGap } });
  return results;
}
