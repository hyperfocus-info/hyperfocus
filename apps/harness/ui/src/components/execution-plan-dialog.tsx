import { For, Show } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { AlertTriangle } from "lucide-solid";
import type { ExecutionPlan } from "@hyperfocus/ai-core/protocol";
import { harnessStore } from "../harness-store";
import type { ChatFileTarget } from "../lib/chat-file-links";
import { openIdeWindow } from "../lib/ide-window";
import { FileLinkedText, type FileLinkConfig } from "./file-linked-text";
import { MarkdownContent } from "./markdown-content";
import { Dialog } from "./primitives/dialog";
import { miscellaneousSurfaceStyles as styles } from "./miscellaneous-surfaces.styles";
import { planReviewStyles as review } from "./execution-plan/execution-plan-dialog.styles";

type ExecutionPlanDialogProps = {
  executionPlan?: ExecutionPlan;
};

export function ExecutionPlanDialog(props: ExecutionPlanDialogProps) {
  const state = harnessStore.state;
  const activeProject = () =>
    state.workspace.projects.find((project) => project.id === state.workspace.activeProjectId) ?? state.workspace.projects[0];
  const fileLinks = (): FileLinkConfig | undefined => {
    const project = activeProject();
    return project
      ? {
          rootPath: project.rootPath,
          filePaths: project.filePaths ?? [],
          onOpenFile: handleOpenFile
        }
      : undefined;
  };
  const hasBranchfsSizeWarning = () =>
    state.workspace.projects
      .find((project) => project.id === state.workspace.activeProjectId)
      ?.traces.some((trace) => trace.stage === "branchfs-size-warning") ?? false;

  function handleOpenFile(target: ChatFileTarget) {
    const project = activeProject();
    if (!project) {
      return;
    }
    openIdeWindow({ projectId: project.id, threadId: project.activeThreadId });
    harnessStore.openIdeFile(target.path, target.line, target.column);
  }

  return (
    <Dialog
      open={state.executionPlanDialogOpen}
      onClose={() => harnessStore.closeExecutionPlanDialog()}
      title="Execution plan"
      eyebrow="Plan"
      description="Review the proposed work, prerequisites, and checks. Return to the plan card to build."
      class={stylex.attrs(styles.dialogWide).class}
      contentClass={stylex.attrs(styles.dialogContent).class}
    >
      <Show when={props.executionPlan} fallback={<p>No plan selected. Close this dialog and open a plan from the conversation.</p>}>
        {(executionPlan) => (
          <div {...stylex.attrs(styles.planBody, review.body)} data-test-plan-review="">
            <section>
              <h3 {...stylex.attrs(review.heading)}>Summary</h3>
              <MarkdownContent content={() => executionPlan().summary} class={stylex.attrs(styles.marginTopMd).class} fileLinks={fileLinks()} />
            </section>
            <details {...stylex.attrs(review.disclosure)}>
              <summary {...stylex.attrs(review.trigger)}>Run details</summary>
              <div {...stylex.attrs(styles.planFacts, review.facts)}>
              <div>Run: {executionPlan().runId}</div>
              <div>Iteration: {executionPlan().iteration}</div>
              <div>Route: {executionPlan().route}</div>
              <div>Difficulty: {executionPlan().difficultyScore}%</div>
              <div>Planner: {executionPlan().planningModelId}</div>
              <div>Executor: {executionPlan().executionModelId}</div>
              <div>Isolation: {executionPlan().subagentWorktreeStrategy}</div>
              <div>
                Buckets: {executionPlan().actualSubagentCount}/{executionPlan().targetSubagentCount}
              </div>
              <div>Gate: {executionPlan().gating.mode}</div>
              <div>Delay: {executionPlan().gating.delaySeconds}s</div>
              <div>Correctness: {executionPlan().correctnessPolicy}</div>
              <div>Origin: {executionPlan().origin}</div>
              </div>
            </details>
            <Show when={hasBranchfsSizeWarning()}>
              <div {...stylex.attrs(styles.warningBadge)}>
                <AlertTriangle {...stylex.attrs(styles.iconXs)} />
                BranchFS large
              </div>
            </Show>

            <details {...stylex.attrs(review.disclosure)}>
              <summary {...stylex.attrs(review.trigger)}>Execution brief</summary>
              <MarkdownContent content={() => executionPlan().finalExecutionBrief} class={stylex.attrs(styles.marginTopMd).class} fileLinks={fileLinks()} />
            </details>

            <section>
              <h3 {...stylex.attrs(review.heading)}>Prerequisites ({executionPlan().prerequisites.length})</h3>
              <Show
                when={executionPlan().prerequisites.length > 0}
                fallback={<div {...stylex.attrs(styles.planEmpty)}>No explicit prerequisites.</div>}
              >
                <div {...stylex.attrs(styles.planStack)}>
                  <For each={executionPlan().prerequisites}>
                    {(prerequisite) => (
                      <div {...stylex.attrs(styles.planCard, review.card)}>
                        <h4 {...stylex.attrs(review.title)}>{prerequisite.title}</h4>
                        <MarkdownContent content={() => prerequisite.instruction} class={stylex.attrs(styles.marginTopSm).class} tone="muted" size="compact" fileLinks={fileLinks()} />
                        <div {...stylex.attrs(styles.planMeta)}>Reason:</div>
                        <MarkdownContent content={() => prerequisite.reason} tone="muted" size="compact" fileLinks={fileLinks()} />
                        <div {...stylex.attrs(styles.planMeta)}>Owner: {prerequisite.owner}</div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </section>

            <section>
              <h3 {...stylex.attrs(review.heading)}>Contracts ({executionPlan().contracts.length})</h3>
              <Show when={executionPlan().contracts.length > 0} fallback={<div {...stylex.attrs(styles.planEmpty)}>No contracts in this plan.</div>}>
              <div {...stylex.attrs(styles.planStack)}>
                <For each={executionPlan().contracts}>
                  {(contract) => (
                    <div {...stylex.attrs(styles.planCard, review.card)}>
                      <h4 {...stylex.attrs(review.title)}>{contract.title}</h4>
                      <MarkdownContent content={() => contract.instruction} class={stylex.attrs(styles.marginTopSm).class} tone="muted" size="compact" fileLinks={fileLinks()} />
                      <div {...stylex.attrs(styles.planMeta)}>
                        <FileLinkedText text={`Owned paths: ${contract.ownedPaths.join(", ")}`} fileLinks={fileLinks()} />
                      </div>
                      <div {...stylex.attrs(styles.planMeta)}>
                        <FileLinkedText text={`Deliverables: ${contract.deliverables.join(", ")}`} fileLinks={fileLinks()} />
                      </div>
                      <div {...stylex.attrs(styles.planMeta)}>
                        <FileLinkedText text={`Integrates with: ${contract.integrationPoints.join(", ") || "none"}`} fileLinks={fileLinks()} />
                      </div>
                      <div {...stylex.attrs(styles.planMeta)}>
                        <FileLinkedText text={`Verify: ${contract.verificationCommands.join(" && ")}`} fileLinks={fileLinks()} />
                      </div>
                      <div {...stylex.attrs(styles.planMeta)}>
                        <FileLinkedText text={`Merge notes: ${contract.mergeNotes}`} fileLinks={fileLinks()} />
                      </div>
                    </div>
                  )}
                </For>
              </div>
              </Show>
            </section>
          </div>
        )}
      </Show>
    </Dialog>
  );
}

