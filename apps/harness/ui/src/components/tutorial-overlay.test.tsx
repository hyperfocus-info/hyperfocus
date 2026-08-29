/** @jsxImportSource solid-js */
import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest, requireButton } from "../utils/tests/test-harness";
import { clearBrowserStateForTests } from "../utils/tests/store-test-utils";
import { dismissTutorialFromEscape, isTutorialStepAdvanceAllowed, TutorialOverlay } from "./tutorial-overlay";

createUiTest("TutorialOverlay", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
    globalThis.__padPilotDisablePortals = true;
  });

  afterEach(() => {
    globalThis.__padPilotDisablePortals = true;
  });

  it("shows fallback instructions and blocks missing-target clickthrough", async () => {
    const onBack = mock(() => undefined);
    const onNext = mock(() => undefined);
    const onClose = mock(() => undefined);

    render(() => <TutorialOverlay tutorialId="open-project" stepIndex={1} completionSatisfied={false} onBack={onBack} onNext={onNext} onClose={onClose} />);

    expect(await screen.findByText(/If the project sidebar is hidden/i)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(requireButton(screen.getByRole("button", { name: "Finish" })).disabled).toBe(true);
    expect(onNext).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("requires mapped workspace progress before finishing", async () => {
    const onNext = mock(() => undefined);
    render(() => (
      <>
        <button data-tour-id="project-sidebar">Project sidebar target</button>
        <TutorialOverlay
          tutorialId="open-project"
          stepIndex={1}
          completionSatisfied={false}
          onBack={() => undefined}
          onNext={onNext}
          onClose={() => undefined}
        />
      </>
    ));

    const target = await screen.findByRole("button", { name: "Project sidebar target" });
    fireEvent.click(target);
    const finish = requireButton(await screen.findByRole("button", { name: "Finish" }));
    expect(finish.disabled).toBe(true);
    fireEvent.click(finish);
    expect(onNext).not.toHaveBeenCalled();
  });

  it("allows a verified workspace goal to finish even if its final target is hidden", async () => {
    const onNext = mock(() => undefined);
    render(() => (
      <TutorialOverlay
        tutorialId="open-project"
        stepIndex={1}
        completionSatisfied
        onBack={() => undefined}
        onNext={onNext}
        onClose={() => undefined}
      />
    ));

    const finish = requireButton(await screen.findByRole("button", { name: "Finish" }));
    expect(finish.disabled).toBe(false);
    fireEvent.click(finish);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("dismisses the active tutorial from Escape", () => {
    const onClose = mock(() => undefined);
    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });

    expect(dismissTutorialFromEscape(event, true, onClose)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

it("requires a real target interaction for intermediate tutorial steps", () => {
  expect(
    isTutorialStepAdvanceAllowed({
      finalStep: false,
      targetPresent: false,
      targetInteracted: true,
      completionSatisfied: false
    })
  ).toBe(false);
  expect(
    isTutorialStepAdvanceAllowed({
      finalStep: false,
      targetPresent: true,
      targetInteracted: false,
      completionSatisfied: false
    })
  ).toBe(false);
  expect(
    isTutorialStepAdvanceAllowed({
      finalStep: false,
      targetPresent: true,
      targetInteracted: true,
      completionSatisfied: false
    })
  ).toBe(true);
});

it("uses mapped progress, not target clicks, for final tutorial completion", () => {
  expect(
    isTutorialStepAdvanceAllowed({
      finalStep: true,
      targetPresent: true,
      targetInteracted: true,
      completionSatisfied: false
    })
  ).toBe(false);
  expect(
    isTutorialStepAdvanceAllowed({
      finalStep: true,
      targetPresent: false,
      targetInteracted: false,
      completionSatisfied: true
    })
  ).toBe(true);
});
