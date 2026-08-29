import { afterEach, describe, expect, test } from "bun:test";
import { render } from "solid-js/web";
import { CoachmarkTour, canContinueCoachmark } from "./coachmark-tour";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("CoachmarkTour", () => {
  test("requires the highlighted interaction before advancing", async () => {
    const target = document.createElement("button");
    target.dataset.tourTarget = "";
    document.body.append(target);
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <CoachmarkTour open portal={false} steps={[
      { id: "target", title: "Use it", description: "Try the control.", target: "[data-tour-target]", requireTargetInteraction: true },
      { id: "done", title: "Done", description: "All set.", target: "[data-missing]" },
    ]} onClose={() => undefined} />, host);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const next = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Next")!;
    expect(target.dataset.hfCoachmarkTarget).toBe("true");
    expect(next.disabled).toBe(true);
    dispose();
    expect(target.dataset.hfCoachmarkTarget).toBeUndefined();
  });

  test("allows progress after interaction or when a target is unavailable", () => {
    const step = { id: "target", title: "Use it", description: "Try it", target: "button", requireTargetInteraction: true };
    expect(canContinueCoachmark(step, true, false)).toBe(false);
    expect(canContinueCoachmark(step, true, true)).toBe(true);
    expect(canContinueCoachmark(step, false, false)).toBe(true);
  });
});
