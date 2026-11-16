/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import * as stylex from "@stylexjs/stylex";
import { createUiTest, requireElement } from "../utils/tests/test-harness";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { ExecutionPlanDialog } from "./execution-plan-dialog";
import { miscellaneousSurfaceStyles as styles } from "./miscellaneous-surfaces.styles";
import { harnessStore } from "../harness-store";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../utils/tests/store-test-utils";
import { createExecutionPlanFixture, createHarnessStateFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";

createUiTest("ExecutionPlanDialog", () => {
  beforeEach(() => {
    clearBrowserStateForTests();
  });

  it("renders execution plan details from store state", () => {
    const plan = createExecutionPlanFixture({
      summary: "# Ship markdown",
      finalExecutionBrief: "Use **safe** markdown.",
      prerequisites: [
        {
          id: "prereq-1",
          title: "Prep",
          instruction: "- install deps",
          reason: "Need [docs](https://example.com)",
          requiredForTaskIds: ["task-1"],
          owner: "main",
          status: "pending"
        }
      ],
      contracts: [
        {
          taskId: "task-1",
          title: "Inspect",
          instruction: "Render ```ts\ncode\n```",
          effortPoints: 2,
          ownedPaths: ["src"],
          dependsOnPrerequisiteIds: ["prereq-1"],
          deliverables: ["inspection"],
          integrationPoints: ["chat"],
          verificationScope: "owned-files-only",
          verificationCommands: ["bun test"],
          mergeNotes: "Merge cleanly"
        }
      ]
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        executionPlanDialogOpen: true,
        selectedExecutionPlan: plan
      })
    );

    render(() => <ExecutionPlanDialog executionPlan={harnessStore.state.selectedExecutionPlan} />);

    const dialog = screen.getByRole("dialog", { name: "Execution plan" });
    expect(dialog).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Ship markdown" })).not.toBeNull();
    expect(screen.getByText("safe").tagName).toBe("STRONG");
    expect(screen.getByText(plan.prerequisites[0]!.title)).not.toBeNull();
    expect(screen.getByText(plan.contracts[0]!.title)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Copy code block" })).not.toBeNull();
    const contentClasses = (stylex.attrs(styles.dialogContent).class ?? "").split(/\s+/).filter(Boolean);
    expect(Array.from(dialog.querySelectorAll("div")).some((element) => contentClasses.every((className) => (element.getAttribute("class") ?? "").split(/\s+/).includes(className)))).toBe(true);
  });

  it("closes from Escape and backdrop click", async () => {
    const plan = createExecutionPlanFixture();
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        executionPlanDialogOpen: true,
        selectedExecutionPlan: plan
      })
    );

    render(() => <ExecutionPlanDialog executionPlan={harnessStore.state.selectedExecutionPlan} />);
    fireEvent.keyDown(await screen.findByRole("dialog", { name: "Execution plan" }), { key: "Escape" });
    expect(harnessStore.state.executionPlanDialogOpen).toBe(false);
    expect(harnessStore.state.selectedExecutionPlan).toBeUndefined();

    harnessStore.openExecutionPlanDialog(plan);
    const dialog = screen.getByRole("dialog", { name: "Execution plan" });
    const backdrop = requireElement(dialog.parentElement?.previousElementSibling);

    fireEvent.click(backdrop);
    expect(harnessStore.state.executionPlanDialogOpen).toBe(false);
  });

  it("leads with the summary and keeps expert details collapsed", () => {
    const plan = createExecutionPlanFixture();
    seedHarnessStoreForTests(createHarnessStateFixture({ executionPlanDialogOpen: true, selectedExecutionPlan: plan }));
    render(() => <ExecutionPlanDialog executionPlan={harnessStore.state.selectedExecutionPlan} />);
    const body = screen.getByRole("heading", { name: "Summary" }).parentElement?.parentElement;
    expect(body?.firstElementChild?.textContent).toContain(plan.summary);
    const disclosures = [...screen.getByRole("dialog").querySelectorAll("details")];
    expect(disclosures.map(element => element.querySelector("summary")?.textContent)).toEqual(["Run details", "Execution brief"]);
    expect(disclosures.every(element => !element.open)).toBe(true);
    expect(screen.getByRole("heading", { name: "Prerequisites (1)" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Contracts (1)" })).not.toBeNull();
  });

  it("explains empty prerequisites and contracts", () => {
    const plan = createExecutionPlanFixture({ prerequisites: [], contracts: [] });
    seedHarnessStoreForTests(createHarnessStateFixture({ executionPlanDialogOpen: true, selectedExecutionPlan: plan }));
    render(() => <ExecutionPlanDialog executionPlan={harnessStore.state.selectedExecutionPlan} />);
    expect(screen.getByText("No explicit prerequisites.")).not.toBeNull();
    expect(screen.getByText("No contracts in this plan.")).not.toBeNull();
  });

  it("shows branchfs size warning badge from active project traces", () => {
    const plan = createExecutionPlanFixture();
    const project = createViewProjectFixture({
      id: "project-plan-warning",
      traces: [
        {
          sessionId: "session-1",
          stage: "branchfs-size-warning",
          message: "BranchFS materialization is large"
        }
      ]
    });
    seedHarnessStoreForTests(
      createHarnessStateFixture({
        executionPlanDialogOpen: true,
        selectedExecutionPlan: plan,
        workspace: {
          activeProjectId: project.id,
          projects: [project]
        }
      })
    );

    render(() => <ExecutionPlanDialog executionPlan={harnessStore.state.selectedExecutionPlan} />);

    expect(screen.getByText("BranchFS large")).not.toBeNull();
  });
});
