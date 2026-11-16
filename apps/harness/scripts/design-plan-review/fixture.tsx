import { render } from "solid-js/web";
import { ExecutionPlanDialog } from "../../ui/src/components/execution-plan-dialog";
import { UiStateProviders } from "../../ui/src/store-providers";
import { harnessStore } from "../../ui/src/harness-store";
import { createExecutionPlanFixture } from "../../ui/src/utils/tests/test-fixtures";
import "../../ui/src/global-styles";

function ReviewFixture() {
  const plan = createExecutionPlanFixture({
    summary: "## Repair workspace exports\nKeep exported files complete when a customer workspace contains long names. Review the affected paths and verification before building.",
    finalExecutionBrief: "Preserve existing exports. Add a focused regression and verify that cancellation leaves the previous artifact available.",
    gating: { mode: "approve", delaySeconds: 0 },
    prerequisites: [{ id: "fixture-prep", title: "Confirm the current export format", instruction: "Read the existing export contract before changing its output.", reason: "Existing customer archives must remain readable.", owner: "main", status: "pending", requiredForTaskIds: ["task-1"] }],
  });
  plan.contracts[0]!.title = "Preserve complete workspace exports";
  plan.contracts[0]!.ownedPaths = [`src/export/${"customer_workspace_".repeat(12)}.ts`];
  plan.contracts[0]!.instruction = "Keep archive entries intact and add coverage for long workspace names.";
  harnessStore.actions.setCommandDispatcher(() => { throw new Error("Fixture cannot send commands"); });
  return <><button onClick={() => harnessStore.openExecutionPlanDialog(plan)}>Review plan</button><button onClick={() => harnessStore.openExecutionPlanDialog({ ...plan, prerequisites: [], contracts: [] })}>Review empty plan</button><ExecutionPlanDialog executionPlan={harnessStore.state.selectedExecutionPlan} /></>;
}

render(() => <UiStateProviders><ReviewFixture /></UiStateProviders>, document.getElementById("root")!);
