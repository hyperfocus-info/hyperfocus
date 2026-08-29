import { expect, test } from "bun:test";
import { requireBootstrapFlightState } from "./bootstrap-queue";

test("queued bootstrap rejects a missing flight-state invariant", () => {
  expect(() => requireBootstrapFlightState(undefined, "assistant-missing-state"))
    .toThrow("Bootstrap flight state missing for assistant assistant-missing-state.");
});
