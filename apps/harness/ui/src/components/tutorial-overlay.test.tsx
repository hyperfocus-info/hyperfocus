/** @jsxImportSource solid-js */
import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
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

  it("keeps scopes isolated and reads live progress and commands after step changes", async () => {
    const [step, setStep] = createSignal(0);
    const [satisfied, setSatisfied] = createSignal(false);
    const [next, setNext] = createSignal(() => firstNext());
    const firstNext = mock(() => undefined);
    const secondNext = mock(() => undefined);
    const otherNext = mock(() => undefined);
    const result = render(() => <>
      <button data-tour-id="open-project">Open target</button>
      <section data-test-tutorial-first=""><TutorialOverlay tutorialId="open-project" stepIndex={step()}
        completionSatisfied={satisfied()} onBack={() => setStep(0)} onNext={() => next()()} onClose={() => {}} /></section>
      <section data-test-tutorial-second=""><TutorialOverlay tutorialId="open-project" stepIndex={1}
        completionSatisfied={false} onBack={() => {}} onNext={otherNext} onClose={() => {}} /></section>
    </>);
    const first = result.container.querySelector("[data-test-tutorial-first]");
    const second = result.container.querySelector("[data-test-tutorial-second]");
    if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement)) throw new Error("Missing tutorial scopes");
    const controls = within(first);
    fireEvent.click(screen.getByRole("button", { name: "Open target" }));
    expect(requireButton(controls.getByRole("button", { name: "Next" })).disabled).toBe(false);
    fireEvent.click(controls.getByRole("button", { name: "Next" }));
    expect(firstNext).toHaveBeenCalledTimes(1);
    setStep(1); setSatisfied(true); setNext(() => secondNext);
    fireEvent.click(await controls.findByRole("button", { name: "Finish" }));
    expect(secondNext).toHaveBeenCalledTimes(1);
    expect(requireButton(within(second).getByRole("button", { name: "Finish" })).disabled).toBe(true);
    expect(otherNext).not.toHaveBeenCalled();
    fireEvent.click(controls.getByRole("button", { name: "Back" }));
    expect(requireButton(await controls.findByRole("button", { name: "Next" })).disabled).toBe(true);
    result.unmount();
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
