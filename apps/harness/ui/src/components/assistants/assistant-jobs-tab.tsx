import {
type BackgroundJob,
type BackgroundJobRun,
} from "@hyperfocus/ai-core/protocol";
import * as stylex from "@stylexjs/stylex";
import { ArrowUpRight,Plus } from "lucide-solid";
import { Show } from "solid-js";
import { type AssistantWorkloadCollectionState } from "../../assistant-workload-state";
import { formatShortTimestamp } from "../../lib/time-format";
import { ActionButton } from "../action-button";
import { assistantPanelStyles,assistantUtilityStyles } from "../assistants-panel.styles";
import { formatFailureCategory,formatFailureTracking } from "../background-jobs/job-diagnostics";
import { FileLinkedText } from "../file-linked-text";
import { Button } from "../primitives/button";
import { StatusChip,type StatusChipTone } from "../primitives/status-chip";
import { VirtualList } from "../primitives/virtual-list";
import { detailStyles } from "./assistant-detail.styles";
import { useAssistantsPanel } from "./state/panel-context";

function assistantWorkloadStatusSuffix(state: AssistantWorkloadCollectionState | undefined) {
  if (state?.status === "stale") return " · Refreshing...";
  if (state?.status !== "loading") return "";
  return ` · ${state.request?.kind === "load-more" ? "Loading more..." : state.request?.kind === "retry" ? "Retrying..." : "Loading..."}`;
}

function formatPromptStats(
  promptStats: BackgroundJobRun["promptStats"] | undefined,
) {
  if (!promptStats) {
    return undefined;
  }
  return `${promptStats.promptChars} chars, hash ${promptStats.promptHash}`;
}

export function AssistantJobsTab() {
  const controller = useAssistantsPanel();
  const { activeTab } = controller;
  return (
    <Show when={activeTab() === "jobs"}>
      <section
        class={
          stylex.attrs(
            assistantUtilityStyles.grid,
            assistantUtilityStyles.minH0,
            assistantUtilityStyles.flex1,
            assistantUtilityStyles.gap4,
            detailStyles.columns,
          ).class
        }
      >
        <AssistantJobsCollection />
        <AssistantRunsCollection />
      </section>
    </Show>
  );
}

function AssistantJobsCollection() {
  const controller = useAssistantsPanel();
  const {
    assistantJobsEmptyMessage, bootstrapAssistantJobs, canBootstrapAssistantJobs,
    loadMoreAssistantJobs, openAssistantJobEditor, retryAssistantJobs, selectedWorkloadPage,
    visibleJobs,
  } = controller;
  return (
    <div
              class={stylex.attrs(assistantUtilityStyles.minW0).class}
            >
              <div
                class={
                  stylex.attrs(
                    assistantUtilityStyles.mb3,
                    assistantUtilityStyles.flex,
                    assistantUtilityStyles.itemsCenter,
                    assistantUtilityStyles.justifyBetween, assistantUtilityStyles.flexWrap,
                    assistantUtilityStyles.gap3,
                  ).class
                }
              >
                <div
                  class={
                    stylex.attrs(
                      assistantUtilityStyles.text0585,
                      assistantUtilityStyles.fontSemibold,
                      assistantUtilityStyles.uppercase,
                      assistantUtilityStyles.tracking018,
                      assistantUtilityStyles.textMuted,
                    ).class
                  }
                >
                  <h3><span id="assistant-jobs-heading">Assistant jobs</span><span role="status" aria-live="polite">{assistantWorkloadStatusSuffix(selectedWorkloadPage()?.jobs)}</span></h3>
                </div>
                <div class={stylex.attrs(assistantUtilityStyles.flex, assistantUtilityStyles.itemsCenter, assistantUtilityStyles.gap2).class}>
                  <Show when={selectedWorkloadPage()?.jobs.status === "error"}>
                    <span role="alert" class={stylex.attrs(assistantUtilityStyles.text0575, assistantUtilityStyles.textDanger, assistantUtilityStyles.wrapAnywhere).class}>Jobs failed: {selectedWorkloadPage()?.jobs.error}</span>
                    <Button variant="secondary" size="sm" justificationForNoTooltip="Visible retry label is self explanatory." onClick={retryAssistantJobs}>Retry jobs</Button>
                  </Show>
                  <ActionButton tooltip="Create background job for this assistant" icon={<Plus class={stylex.attrs(assistantUtilityStyles.h4, assistantUtilityStyles.w4).class} />} onClick={openAssistantJobEditor}>New job</ActionButton>
                </div>
              </div>
              <VirtualList
                role="list" aria-labelledby="assistant-jobs-heading"
                aria-busy={selectedWorkloadPage()?.jobs.status === "loading" || selectedWorkloadPage()?.jobs.status === "stale" || undefined}
                class={
                  stylex.attrs(
                    assistantUtilityStyles.h120,
                    assistantUtilityStyles.pr2,

                  ).class
                }
                contentClass={
                  stylex.attrs(assistantUtilityStyles.wFull).class
                }
                itemClass={
                  stylex.attrs(assistantUtilityStyles.pb3).class
                }
                items={visibleJobs()}
                getKey={(job) => job.id}
                estimateSize={120}
                pagination={{
                  kind: "forward",
                  initialCount: 60,
                  batchSize: 60,
                }}
                empty={
                  <div
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.borderL2,
                        assistantUtilityStyles.borderDashed,
                        assistantUtilityStyles.borderBorder,
                        assistantUtilityStyles.py3,
                        assistantUtilityStyles.pl4,
                      ).class
                    }
                  >
                    <div
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.text0675,
                          assistantUtilityStyles.textMuted,
                        ).class
                      }
                    >
                      {assistantJobsEmptyMessage()}
                    </div>
                    <Show when={canBootstrapAssistantJobs()}>
                      <ActionButton
                        tooltip="Create default research, todo maintenance, and implementation jobs"
                        icon={<Plus class={stylex.attrs(assistantUtilityStyles.h35, assistantUtilityStyles.w35).class} />}
                        size="sm"
                        variant="secondary"
                        class={stylex.attrs(assistantUtilityStyles.mt3).class}
                        onClick={bootstrapAssistantJobs}
                      >
                        Bootstrap jobs
                      </ActionButton>
                    </Show>
                  </div>
                }
              >
        {(job) => <AssistantJobCard job={job} />}
              </VirtualList>
              <Show when={selectedWorkloadPage()?.jobs.nextCursor || selectedWorkloadPage()?.jobs.hasRequestedMore}>
                <Button variant="secondary" size="sm"
                  justificationForNoTooltip="Visible load-more label is self explanatory." aria-busy={selectedWorkloadPage()?.jobs.status === "loading" || undefined}
                  aria-disabled={selectedWorkloadPage()?.jobs.status !== "loaded" || !selectedWorkloadPage()?.jobs.nextCursor}
                  onClick={loadMoreAssistantJobs}>
                  {selectedWorkloadPage()?.jobs.status === "loading" ? "Loading more jobs..." : selectedWorkloadPage()?.jobs.nextCursor ? "Load more jobs" : "All loaded jobs shown"}
                </Button>
              </Show>
            </div>
  );
}

function AssistantRunsCollection() {
  const controller = useAssistantsPanel();
  const {
    assistantChatFileLinks, assistantRunsEmptyMessage, loadMoreAssistantRuns,
    openAssistantBackgroundRun, pendingRunSourceId, retryAssistantRuns,
    selectedWorkloadPage, visibleRuns,
  } = controller;
  return (
    <div
              class={stylex.attrs(assistantUtilityStyles.minW0).class}
            >
              <div
                class={stylex.attrs(
                  assistantUtilityStyles.mb3, assistantUtilityStyles.flex, assistantUtilityStyles.itemsCenter, assistantUtilityStyles.justifyBetween, assistantUtilityStyles.flexWrap,
                  assistantUtilityStyles.gap2, assistantUtilityStyles.text0585,
                  assistantUtilityStyles.fontSemibold, assistantUtilityStyles.uppercase, assistantUtilityStyles.tracking018, assistantUtilityStyles.textMuted,
                ).class}
              >
                <h3><span id="assistant-runs-heading">Recent runs</span><span role="status" aria-live="polite">{assistantWorkloadStatusSuffix(selectedWorkloadPage()?.runs)}</span></h3>
                <Show when={selectedWorkloadPage()?.runs.status === "error"}>
                  <span role="alert" class={stylex.attrs(assistantUtilityStyles.text0575, assistantUtilityStyles.textDanger, assistantUtilityStyles.wrapAnywhere).class}>Runs failed: {selectedWorkloadPage()?.runs.error}</span>
                  <Button variant="secondary" size="sm" justificationForNoTooltip="Visible retry label is self explanatory." onClick={retryAssistantRuns}>Retry runs</Button>
                </Show>
              </div>
              <VirtualList
                role="list" aria-labelledby="assistant-runs-heading"
                aria-busy={selectedWorkloadPage()?.runs.status === "loading" || selectedWorkloadPage()?.runs.status === "stale" || undefined}
                class={
                  stylex.attrs(
                    assistantUtilityStyles.h120,
                    assistantUtilityStyles.pr2,

                  ).class
                }
                contentClass={
                  stylex.attrs(assistantUtilityStyles.wFull).class
                }
                itemClass={
                  stylex.attrs(assistantUtilityStyles.pb3).class
                }
                items={visibleRuns()}
                getKey={(run) => run.id}
                estimateSize={145}
                pagination={{
                  kind: "forward",
                  initialCount: 60,
                  batchSize: 60,
                }}
                empty={
                  <div
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.py3,
                        assistantUtilityStyles.text0675,
                        assistantUtilityStyles.textMuted,
                      ).class
                    }
                  >
                    {assistantRunsEmptyMessage()}
                  </div>
                }
              >
                {(run) => (
                  <article
                    role="listitem" aria-label={`Assistant run ${run.summary ?? run.id}`}
                    class={
                      stylex.attrs(
                        assistantUtilityStyles.overflowHidden,
                        assistantUtilityStyles.borderL2,
                        assistantUtilityStyles.py3,
                        assistantUtilityStyles.pl4,
                        assistantUtilityStyles.pr2,
                        assistantUtilityStyles.transition,
                        assistantUtilityStyles.hoverBorderAccentStrong,
                        assistantPanelStyles.sourceCard,
                        run.status === "succeeded"
                          ? assistantPanelStyles.borderEmerald
                          : run.status === "failed" ||
                              run.status === "cancelled"
                            ? assistantPanelStyles.borderRose
                            : run.status === "awaiting-approval" ||
                                run.status ===
                                  "awaiting-user-input" ||
                                run.status === "partial-complete"
                              ? assistantPanelStyles.borderAmber
                              : run.status === "running"
                                ? assistantPanelStyles.borderSky
                                : run.status === "queued"
                                  ? assistantPanelStyles.borderSlate
                                  : assistantPanelStyles.borderStone,
                      ).class
                    }
                  >
                    <div
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.flex,
                          assistantUtilityStyles.itemsCenter,
                          assistantUtilityStyles.justifyBetween, assistantUtilityStyles.flexWrap,
                          assistantUtilityStyles.gap3,
                        ).class
                      }
                    >
                      <div
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.minW0,
                            assistantUtilityStyles.breakWords, detailStyles.readable,
                            assistantUtilityStyles.text075,
                            assistantUtilityStyles.fontSemibold,
                            assistantUtilityStyles.textForeground,
                            assistantUtilityStyles.wrapAnywhere,
                          ).class
                        }
                      >
                        <FileLinkedText
                          text={run.summary ?? run.id}
                          fileLinks={assistantChatFileLinks()}
                        />
                      </div>
                      <div class={stylex.attrs(assistantUtilityStyles.flex, assistantUtilityStyles.itemsCenter, assistantUtilityStyles.gap2).class}>
                        <StatusChip tone={backgroundRunStatusTone(run.status)} class={stylex.attrs(assistantUtilityStyles.shrink0).class}>
                          {run.status}
                        </StatusChip>
                        <WorkloadSourceButton label={run.summary ?? run.id} kind="run" busy={pendingRunSourceId() === run.id} onClick={() => openAssistantBackgroundRun(run)} />
                      </div>
                    </div>
                    <div
                      class={
                        stylex.attrs(
                          assistantUtilityStyles.mt2,
                          assistantUtilityStyles.breakWords, detailStyles.readable,
                          assistantUtilityStyles.text0675,
                          assistantUtilityStyles.leading5,
                          assistantUtilityStyles.textMuted,
                          assistantUtilityStyles.wrapAnywhere,
                        ).class
                      }
                    >
                      <div>
                        <FileLinkedText
                          text={
                            run.failureMessage ??
                            `Triggered by ${run.triggerSource}`
                          }
                          fileLinks={assistantChatFileLinks()}
                        />
                      </div>
                      <Show when={run.failureCategory}>
                        {(category) => (
                          <div
                            class={
                              stylex.attrs(assistantUtilityStyles.mt1)
                                .class
                            }
                          >
                            Failure category:{" "}
                            {formatFailureCategory(category())}
                          </div>
                        )}
                      </Show>
                      <Show when={formatPromptStats(run.promptStats)}>
                        {(stats) => (
                          <div
                            class={
                              stylex.attrs(assistantUtilityStyles.mt1)
                                .class
                            }
                          >
                            Prompt: {stats()}
                          </div>
                        )}
                      </Show>
                      <div
                        class={
                          stylex.attrs(assistantUtilityStyles.mt1)
                            .class
                        }
                      >
                        Updated {formatShortTimestamp(run.updatedAt)}
                      </div>
                    </div>
                  </article>
                )}
              </VirtualList>
              <Show when={selectedWorkloadPage()?.runs.nextCursor || selectedWorkloadPage()?.runs.hasRequestedMore}>
                <Button variant="secondary" size="sm"
                  justificationForNoTooltip="Visible load-more label is self explanatory." aria-busy={selectedWorkloadPage()?.runs.status === "loading" || undefined}
                  aria-disabled={selectedWorkloadPage()?.runs.status !== "loaded" || !selectedWorkloadPage()?.runs.nextCursor}
                  onClick={loadMoreAssistantRuns}>
                  {selectedWorkloadPage()?.runs.status === "loading" ? "Loading more runs..." : selectedWorkloadPage()?.runs.nextCursor ? "Load more runs" : "All loaded runs shown"}
                </Button>
              </Show>
            </div>
  );
}

function AssistantJobCard(props: { job: BackgroundJob }) {
  const controller = useAssistantsPanel();
  const { assistantChatFileLinks, openAssistantBackgroundJob, pendingJobSourceId } = controller;
  const { job } = props;
  return (
    <article
                        role="listitem" aria-label={`Assistant job ${job.name}`}
                        class={
                          stylex.attrs(
                            assistantUtilityStyles.overflowHidden,
                            assistantUtilityStyles.borderL2,
                            assistantUtilityStyles.py3,
                            assistantUtilityStyles.pl4,
                            assistantUtilityStyles.pr2,
                            assistantUtilityStyles.transition,
                            assistantUtilityStyles.hoverBorderAccentStrong,
                            assistantPanelStyles.sourceCard,
                            job.status === "enabled"
                              ? assistantPanelStyles.borderEmerald
                              : assistantPanelStyles.borderSlate,
                          ).class
                        }
                      >
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.flex,
                              assistantUtilityStyles.itemsStart,
                              assistantUtilityStyles.justifyBetween, assistantUtilityStyles.flexWrap,
                              assistantUtilityStyles.gap3,
                            ).class
                          }
                        >
                          <div
                            class={
                              stylex.attrs(
                                assistantUtilityStyles.breakWords, detailStyles.readable,
                                assistantUtilityStyles.text075,
                                assistantUtilityStyles.fontSemibold,
                                assistantUtilityStyles.textForeground,
                              ).class
                            }
                          >
                            {job.name}
                          </div>
                          <div class={stylex.attrs(assistantUtilityStyles.flex, assistantUtilityStyles.itemsCenter, assistantUtilityStyles.gap2).class}>
                            <StatusChip tone={backgroundJobStatusTone(job.status)} class={stylex.attrs(assistantUtilityStyles.shrink0).class}>
                              {job.status}
                            </StatusChip>
                            <WorkloadSourceButton label={job.name} kind="job" busy={pendingJobSourceId() === job.id} onClick={() => openAssistantBackgroundJob(job)} />
                          </div>
                        </div>
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.mt1,
                              assistantUtilityStyles.text0575,
                              assistantUtilityStyles.uppercase,
                              assistantUtilityStyles.tracking014,
                              assistantUtilityStyles.textMuted,
                            ).class
                          }
                        >
                          {job.kind}
                        </div>
                        <div
                          class={
                            stylex.attrs(
                              assistantUtilityStyles.mt2,
                              assistantUtilityStyles.breakWords, detailStyles.readable,
                              assistantUtilityStyles.text0675,
                              assistantUtilityStyles.leading5,
                              assistantUtilityStyles.textMuted,
                              assistantUtilityStyles.wrapAnywhere,
                            ).class
                          }
                        >
                          <div>
                            <FileLinkedText
                              text={job.description ?? job.scheduleInput}
                              fileLinks={assistantChatFileLinks()}
                            />
                          </div>
                          <Show when={formatFailureTracking(job)}>
                            {(line) => (
                              <div
                                class={
                                  stylex.attrs(assistantUtilityStyles.mt1)
                                    .class
                                }
                              >
                                <FileLinkedText
                                  text={line()}
                                  fileLinks={assistantChatFileLinks()}
                                />
                              </div>
                            )}
                          </Show>
                        </div>
                      </article>
  );
}

function WorkloadSourceButton(props: { label: string; kind: "job" | "run"; busy: boolean; onClick: () => void }) { return <Button
      type="button" size="icon" variant="ghost" tooltip={`Open ${props.kind} source`} aria-label={`Open source for ${props.label}`}
      aria-busy={props.busy || undefined} aria-disabled={props.busy} onClick={() => { if (!props.busy) props.onClick(); }}>
      <ArrowUpRight class={stylex.attrs(assistantUtilityStyles.h4, assistantUtilityStyles.w4).class} /></Button>;
}

function backgroundJobStatusTone(
  status: BackgroundJob["status"],
): StatusChipTone {
  return status === "enabled" ? "success" : "neutral";
}

function backgroundRunStatusTone(
  status: BackgroundJobRun["status"],
): StatusChipTone {
  switch (status) {
    case "succeeded":
      return "success";
    case "partial-complete":
      return "warning";
    case "failed":
    case "cancelled":
      return "danger";
    case "awaiting-approval":
    case "awaiting-user-input":
      return "warning";
    case "running":
      return "info";
    case "queued":
      return "neutral";
    case "skipped":
      return "neutral";
  }
}
