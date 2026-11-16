import { expect, test } from "bun:test";
import { inspectNavigation, type NavigationAction } from "./contract";

const action: NavigationAction = { id: "ledger", destination: "transactions", priority: "secondary", audience: "user", available: true };
const composition = { actions: [action], destinations: ["transactions"], audience: "user" as const, rootActionCount: 4, maxRootActions: 4, primary: "optional" as const };
test("grouped navigation allows no primary, while a required decision composition rejects it", () => {
  expect(inspectNavigation(composition).passed).toBe(true);
  expect(inspectNavigation({ ...composition, primary: "required" }).violations[0]?.ruleId).toBe("ui.navigation.primary-action-hierarchy");
});
test("duplicate destinations need an explicit semantic justification", () => {
  expect(inspectNavigation({ ...composition, actions: [action, { ...action, id: "other" }] }).violations[0]).toMatchObject({ ruleId: "ui.navigation.no-duplicate-destinations" });
  expect(inspectNavigation({ ...composition, actions: [action, { ...action, id: "other", aliasReason: "Contextual return to the same task" }] }).passed).toBe(true);
});
test("unavailable and invalid routes are rejected", () => {
  expect(inspectNavigation({ ...composition, actions: [{ ...action, destination: "missing" }] }).passed).toBe(false);
  expect(inspectNavigation({ ...composition, actions: [{ ...action, available: false }] }).passed).toBe(false);
});
test("developer actions, missing priorities and excessive root actions are rejected", () => {
  const undeclared = { ...action }; Reflect.deleteProperty(undeclared, "priority");
  for (const candidate of [{ ...composition, actions: [{ ...action, audience: "developer" as const }] },
    { ...composition, actions: [undeclared] }, { ...composition, rootActionCount: 5 }]) {
    expect(inspectNavigation(candidate).violations[0]?.ruleId).toBe("ui.navigation.primary-action-hierarchy");
  }
});
