import { afterEach, expect, test } from "bun:test";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { TaskReviewOutcome } from "./task-review-outcome";

afterEach(() => document.body.replaceChildren());

test("outcome review preserves expanded sections and evidence focus during live updates", () => {
  const host = document.createElement("div"); document.body.append(host);
  const [status, setStatus] = createSignal("inconclusive");
  let inspected = "";
  const dispose = render(() => <TaskReviewOutcome outcome={{ summary: "Reduce frame preparation with measured evidence", facts: [{ label: "Outcome demonstrated", value: "blocked" }], sections: [{ id: "experiments", title: "Experiments", items: [{ id: "probe", label: "Allocation probe", status: status(), detail: "No measured improvement yet.", facts: [{ label: "Evaluator", value: "independent-reviewer" }], artifacts: [{ id: "receipt", label: "receipt.json" }, { id: "missing", label: "missing.json", unavailable: true }] }] }] }} onInspect={id => { inspected = id; }} />, host);
  try {
    const disclosures = [...host.querySelectorAll("details")];
    expect(disclosures.every(disclosure => !disclosure.open)).toBe(true);
    disclosures.forEach(disclosure => { disclosure.open = true; });
    const evidence = host.querySelector<HTMLButtonElement>("button")!;
    evidence.focus(); setStatus("contradicted");
    expect([...host.querySelectorAll("details")]).toEqual(disclosures);
    expect(disclosures.every(disclosure => disclosure.open)).toBe(true);
    expect(document.activeElement).toBe(evidence);
    evidence.click(); expect(inspected).toBe("receipt");
    expect(host.textContent).toContain("contradicted");
    expect(host.textContent).toContain("blocked");
    expect(host.textContent).toContain("missing.json (unavailable)");
    expect(host.querySelectorAll("button")[1]?.disabled).toBe(true);
  } finally { dispose(); }
});
