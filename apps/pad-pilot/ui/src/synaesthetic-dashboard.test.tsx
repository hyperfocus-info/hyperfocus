import { afterEach, beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import { createUiTest } from "../../utils/tests/test-harness";
import { DashboardApp, DimensionBar, ReportView, RunActions } from "../../scripts/synaesthetic-evaluator/dashboard/app";

const originalFetch = globalThis.fetch;

function libraryRows() {
  return screen.getAllByRole("row").slice(1).map((row) => row.querySelector("strong")?.textContent);
}

createUiTest("Synaesthetic dashboard", () => {
  beforeEach(() => {
    history.replaceState({}, "", "/");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("exposes the same diagnostic tooltip from the dimension label and bar", async () => {
    render(() => (
      <DimensionBar
        dimension={{ id: "sound-quality", score: 0.88, confidence: 0.9 }}
        explanation="Full evidence explanation"
      />
    ));

    const triggers = screen.getAllByTestId("tooltip-container");
    expect(triggers).toHaveLength(2);

    fireEvent.mouseEnter(triggers[0]!);
    expect((await screen.findByRole("tooltip")).textContent).toBe("Full evidence explanation");
    fireEvent.mouseLeave(triggers[0]!);

    fireEvent.mouseEnter(triggers[1]!);
    expect((await screen.findByRole("tooltip")).textContent).toBe("Full evidence explanation");
  });

  it("sorts library rows by score in both directions", async () => {
    globalThis.fetch = Object.assign(
      async () => new Response(JSON.stringify({
        runs: [
          { id: "low", displayName: "Zebra.mp3", sourcePath: "C:\\Zebra.mp3", overall: 0.4, confidence: 0.8, evaluatedAt: "2026-03-03T00:00:00.000Z" },
          { id: "high", displayName: "Alpha.mp3", sourcePath: "C:\\Alpha.mp3", overall: 0.9, confidence: 0.9, evaluatedAt: "2026-01-01T00:00:00.000Z" },
          { id: "middle", displayName: "Middle.mp3", sourcePath: "C:\\Middle.mp3", overall: 0.7, confidence: 0.7, evaluatedAt: "2026-02-02T00:00:00.000Z" },
        ],
      })),
      { preconnect: originalFetch.preconnect },
    );

    render(() => <DashboardApp />);
    await screen.findByText("Zebra.mp3");

    const scoreSort = screen.getByRole("button", { name: "Overall / listener" });
    fireEvent.click(scoreSort);
    expect(scoreSort.closest('[role="columnheader"]')?.getAttribute("aria-sort")).toBe("descending");
    expect(libraryRows()).toEqual(["Alpha.mp3", "Middle.mp3", "Zebra.mp3"]);

    fireEvent.click(scoreSort);
    expect(scoreSort.closest('[role="columnheader"]')?.getAttribute("aria-sort")).toBe("ascending");
    expect(libraryRows()).toEqual(["Zebra.mp3", "Middle.mp3", "Alpha.mp3"]);

    const fileSort = screen.getByRole("button", { name: "File" });
    fireEvent.click(fileSort);
    expect(libraryRows()).toEqual(["Alpha.mp3", "Middle.mp3", "Zebra.mp3"]);
    fireEvent.click(fileSort);
    expect(libraryRows()).toEqual(["Zebra.mp3", "Middle.mp3", "Alpha.mp3"]);

    const confidenceSort = screen.getByRole("button", { name: "Confidence" });
    fireEvent.click(confidenceSort);
    expect(libraryRows()).toEqual(["Alpha.mp3", "Zebra.mp3", "Middle.mp3"]);

    const evaluatedSort = screen.getByRole("button", { name: "Evaluated" });
    fireEvent.click(evaluatedSort);
    expect(evaluatedSort.closest('[role="columnheader"]')?.getAttribute("aria-sort")).toBe("descending");
    expect(libraryRows()).toEqual(["Zebra.mp3", "Middle.mp3", "Alpha.mp3"]);
  });

  it("defaults to the latest algorithm and keeps only the newest run per track", async () => {
    globalThis.fetch = Object.assign(
      async () => new Response(JSON.stringify({
        runs: [
          { id: "blue-v2", mediaId: "blue", displayName: "Blue Tint 0.mp3", sourcePath: "C:\\Blue Tint 0.mp3", overall: 0.78, confidence: 0.9, evaluatorFingerprint: "synaesthetic-evaluator-v2", evaluatedAt: "2026-08-27T06:01:01.000Z" },
          { id: "blue-v23-old", mediaId: "blue", displayName: "Blue Tint 0.mp3", sourcePath: "C:\\Blue Tint 0.mp3", overall: 0.94, confidence: 0.9, evaluatorFingerprint: "synaesthetic-evaluator-v2.3", evaluatedAt: "2026-08-27T06:13:01.000Z" },
          { id: "blue-v23", mediaId: "blue", displayName: "Blue Tint 0.mp3", sourcePath: "C:\\Blue Tint 0.mp3", overall: 0.953, confidence: 0.9, evaluatorFingerprint: "synaesthetic-evaluator-v2.3", evaluatedAt: "2026-08-27T06:14:01.000Z" },
          { id: "current", mediaId: "current", displayName: "Current Only.mp3", sourcePath: "C:\\Current Only.mp3", overall: 0.91, confidence: 0.9, evaluatorFingerprint: "synaesthetic-evaluator-v2.3", evaluatedAt: "2026-08-27T06:15:01.000Z" },
          { id: "legacy", mediaId: "legacy", displayName: "Legacy Only.mp3", sourcePath: "C:\\Legacy Only.mp3", overall: 0.82, confidence: 0.9, evaluatorFingerprint: "synaesthetic-evaluator-v2.2", evaluatedAt: "2026-08-27T06:10:01.000Z" },
        ],
      })),
      { preconnect: originalFetch.preconnect },
    );

    render(() => <DashboardApp />);
    const algorithm = await screen.findByLabelText("Algorithm version");
    if (!(algorithm instanceof HTMLSelectElement)) throw new Error("Algorithm filter must be a select.");

    expect(algorithm.value).toBe("synaesthetic-evaluator-v2.3");
    expect(screen.getAllByText("Blue Tint 0.mp3")).toHaveLength(1);
    const currentBlue = screen.getByRole("row", { name: /Blue Tint 0\.mp3/ });
    expect(within(currentBlue).getByText("95%")).toBeTruthy();
    expect(within(currentBlue).getByText("v2.3")).toBeTruthy();
    expect(screen.queryByText("Legacy Only.mp3")).toBeNull();

    fireEvent.change(algorithm, { target: { value: "synaesthetic-evaluator-v2" } });
    const legacyBlue = screen.getByRole("row", { name: /Blue Tint 0\.mp3/ });
    expect(within(legacyBlue).getByText("78%")).toBeTruthy();
    expect(within(legacyBlue).getByText("v2")).toBeTruthy();
    expect(screen.queryByText("Current Only.mp3")).toBeNull();
  });

  it("shows run actions and disables Edit without a colocated FLP", async () => {
    globalThis.fetch = Object.assign(
      async () => new Response(JSON.stringify({
        runs: [
          { id: "editable", displayName: "Editable.mp3", sourcePath: "C:\\Editable.mp3", sourceAvailable: true, hasColocatedFlp: true, overall: 0.9, confidence: 0.9 },
          { id: "audio-only", displayName: "Audio Only.mp3", sourcePath: "C:\\Audio Only.mp3", sourceAvailable: true, hasColocatedFlp: false, overall: 0.8, confidence: 0.8 },
        ],
      })),
      { preconnect: originalFetch.preconnect },
    );

    render(() => <DashboardApp />);
    const editable = await screen.findByRole("row", { name: /Editable\.mp3/ });
    const audioOnly = screen.getByRole("row", { name: /Audio Only\.mp3/ });

    expect(within(editable).getByRole("button", { name: "Reanalyze" }).hasAttribute("disabled")).toBeFalse();
    expect(within(editable).getByRole("button", { name: "Play" }).hasAttribute("disabled")).toBeFalse();
    expect(within(editable).getByRole("button", { name: "Edit" }).hasAttribute("disabled")).toBeFalse();
    expect(within(audioOnly).getByRole("button", { name: "Edit" }).hasAttribute("disabled")).toBeTrue();
  });

  it("leads report with safety and producer actions without a redundant contributors panel", async () => {
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/series")) return new Response(JSON.stringify({ series: [] }));
        return new Response(JSON.stringify({
          id: "clipped",
          displayName: "Clipped.mp3",
          overall: 0.4,
          confidence: 0.94,
          sourceAvailable: true,
          hasColocatedFlp: false,
          dimensions: [{ id: "soundQuality", score: 0.82, confidence: 0.94 }],
          metrics: [{ id: "audio.mix.translation-readiness", dimension: "soundQuality", score: 0.82, confidence: 0.94, valid: true }],
          actions: [{ id: "safety.severe-clipping", priority: 1, severity: "critical", title: "Restore transient headroom", observation: "Sustained clipping detected.", impact: "Punch may be flattened.", steps: ["Lower limiter input."], verify: "Reanalyze and confirm cap clears.", confidence: 0.98 }],
          safetyChecks: [{ cap: 0.4, reasons: ["severe sustained clipping"] }],
          series: [],
          sections: [],
        }));
      },
      { preconnect: originalFetch.preconnect },
    );

    render(() => <ReportView runId="clipped" onTogglePlayback={() => undefined} />);

    expect(await screen.findByRole("heading", { name: "Fix first" })).toBeTruthy();
    expect(screen.getByText("Restore transient headroom")).toBeTruthy();
    expect(screen.getByText("severe sustained clipping")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Contributors" })).toBeNull();
    expect(screen.getByText(/Evidence details/)).toBeTruthy();
  });

  it("collects a structured human review for future evaluator versions", async () => {
    let submitted: Record<string, unknown> | undefined;
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/series")) return new Response(JSON.stringify({ series: [] }));
        if (url.endsWith("/reviews") && init?.method === "POST") {
          submitted = JSON.parse(String(init.body)) as Record<string, unknown>;
          return new Response(JSON.stringify({ id: "review-1", datasetSplit: "train", ...submitted }), { status: 201 });
        }
        return new Response(JSON.stringify({
          id: "reviewed",
          displayName: "Reviewed.mp3",
          overall: 0.81,
          confidence: 0.82,
          sourceAvailable: true,
          hasColocatedFlp: false,
          dimensions: [{ id: "groove", score: 0.7, confidence: 0.75 }],
          metrics: [],
          actions: [{ id: "audio.rhythm.pulse-coherence", priority: 1, severity: "medium", title: "Strengthen pulse anchors", observation: "Pulse varies.", impact: "Motion may weaken.", steps: ["Inspect onsets."], verify: "Compare pulse timeline.", confidence: 0.75 }],
          safetyChecks: [],
          series: [],
          sections: [],
        }));
      },
      { preconnect: originalFetch.preconnect },
    );

    render(() => <ReportView runId="reviewed" onTogglePlayback={() => undefined} />);
    expect(await screen.findByRole("heading", { name: "Your review" })).toBeTruthy();

    fireEvent.input(screen.getByLabelText("Overall rating (0-100)"), { target: { value: "96" } });
    fireEvent.input(screen.getByLabelText("Genre or style tags"), { target: { value: "trap, melodic rap" } });
    fireEvent.change(screen.getByLabelText("Review Strengthen pulse anchors"), { target: { value: "intentional" } });
    fireEvent.click(screen.getByRole("button", { name: "Save review" }));

    expect((await screen.findByRole("status", { name: "Review status" })).textContent).toContain("Review saved to train split");
    expect(submitted).toEqual(expect.objectContaining({
      actionFeedback: [{ actionId: "audio.rhythm.pulse-coherence", verdict: "intentional" }],
      calibrationEligible: true,
      genreTags: ["trap", "melodic rap"],
      overallScore: 0.96,
    }));
  });

  it("plays, opens the project, and returns the new reanalysis run", async () => {
    const requests: string[] = [];
    const played: string[] = [];
    const reruns: string[] = [];
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        return new Response(JSON.stringify(url.endsWith("/reanalyze") ? { runId: "new-run" } : { opened: true }));
      },
      { preconnect: originalFetch.preconnect },
    );
    const run = {
      confidence: 0.9,
      dimensions: [],
      displayName: "Editable.mp3",
      hasColocatedFlp: true,
      id: "editable",
      metrics: [],
      overall: 0.9,
      actions: [],
      safetyChecks: [],
      sections: [],
      series: [],
      sourceAvailable: true,
      strengths: [],
      weaknesses: [],
    };

    render(() => (
      <RunActions
        run={run}
        playing={false}
        onTogglePlayback={(selected) => played.push(selected.id)}
        onReanalyzed={(runId) => reruns.push(runId)}
      />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(played).toEqual(["editable"]);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByText("Project opened");
    expect(requests).toContain("/api/v1/runs/editable/edit");

    fireEvent.click(screen.getByRole("button", { name: "Reanalyze" }));
    await screen.findByText("Analysis complete");
    expect(requests).toContain("/api/v1/runs/editable/reanalyze");
    expect(reruns).toEqual(["new-run"]);
  });
});
