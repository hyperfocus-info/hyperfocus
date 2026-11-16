import { expect, test } from "bun:test";
import { isProgressionObservation } from "./observation-input";

test("progression evidence validates nested starter claims without discarding future metadata", () => {
  expect(isProgressionObservation({ title: "goal", proximalGoalVisible: false, evidence: ["capture"], extra: 1 })).toBe(true);
  for (const value of [{ title: 3 }, { notes: "text" }, { starter: { title: "x", summary: "x", claims: [{ claim: "x", sufficiency: "proven", evidence: [], nextEvidence: [] }] } }, { nextStepGuidance: "false" }]) {
    expect(isProgressionObservation(value)).toBe(false);
  }
});
