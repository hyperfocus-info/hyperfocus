import type { SwarmRun } from "@hyperfocus/ai-core/swarm";
import type { Page } from "playwright";

/** Inspect preserved real data without introducing workload expectations or fixture results. */
export async function inspectArchivedOutcome(options: { page: Page; run: SwarmRun; surface: string; capture: (page: Page, name: string) => Promise<void> }) {
  const { page, run, surface, capture } = options;
  const inspectedArtifactIds: string[] = [];
  const dialog = page.getByRole("dialog", { name: "Run with Swarm", exact: true });
  await dialog.getByText("Archived run. Read-only evidence. Execution and integration are unavailable.", { exact: true }).waitFor();
  for (const name of ["Launch workers", "Cancel run", "Approve and integrate", "Reject candidate", "Finish without integrating", "Queue follow-up plan", "Create review link"])
    if (await dialog.getByRole("button", { name, exact: true }).count()) throw Error(`Archived ${surface} exposed ${name}.`);
  await capture(page, `${surface}-archived.png`);
  if (!run.outcome) return inspectedArtifactIds;
  const summary = dialog.locator("summary").filter({ hasText: /^Outcome analysis$/ });
  await summary.click();
  const outcome = dialog.locator("[data-test-task-review-outcome]");
  await outcome.waitFor();
  if (!(await outcome.innerText()).includes(run.outcome.intendedOutcome)) throw Error(`${surface} did not display the preserved interpretation.`);
  for (const section of ["interpretation", "methods", "hypotheses", "experiments", "evaluations", "knowledge", "decision"]) {
    const block = outcome.locator(`[data-outcome-section="${section}"]`);
    const disclosure = block.locator("xpath=ancestor::details[1]");
    if (!await disclosure.count()) continue;
    const heading = disclosure.locator("summary").first();
    await heading.click(); await heading.evaluate(element => element.scrollIntoView({ block: "start" }));
    await capture(page, `${surface}-outcome-${section}.png`);
    if (section === "experiments") {
      const evidenceIds = new Set(run.outcome.experiments.flatMap(experiment => experiment.artifactIds));
      const artifact = run.artifacts.find(value => evidenceIds.has(value.id) && value.bytes <= 33_554_432 && (value.mediaType.startsWith("text/") || value.mediaType.includes("json")));
      if (artifact) {
        const [response] = await Promise.all([
          page.waitForResponse(value => value.url().endsWith(`/runs/${run.id}/artifacts/${artifact.id}`) && value.request().method() === "GET"),
          block.getByRole("button", { name: artifact.name, exact: true }).first().click(),
        ]);
        if (!response.ok()) throw Error(`${surface} could not inspect the retained experiment receipt.`);
        const preview = dialog.locator("[data-test-task-review-artifact] pre");
        await preview.waitFor(); await preview.evaluate(element => element.scrollIntoView({ block: "start" }));
        await capture(page, `${surface}-outcome-experiment-evidence.png`);
        inspectedArtifactIds.push(artifact.id);
      }
    }
    await heading.click();
  }
  return inspectedArtifactIds;
}
