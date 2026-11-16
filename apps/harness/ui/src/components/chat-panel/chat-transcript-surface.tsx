import * as stylex from "@stylexjs/stylex";
import {
AlertTriangle,
RefreshCcw
} from "lucide-solid";
import { For,Match,Show,Switch } from "solid-js";
import { MemoryPane } from "../../memory/memory-pane";
import { ActionButton } from "../action-button";
import { chatPanelStyles as styles } from "../chat-panel.styles";
import { chatUtilityStyles } from "../chat-panel.utilities";
import { Button } from "../primitives/button";
import { ChatTranscriptEvents,ChatTranscriptMessages,ChatTranscriptPlan,ChatTranscriptRun } from "./chat-transcript-states";
import { useChatPanel } from "./state/panel-context";

export function ChatTranscriptSurface() {
  const controller = useChatPanel();
  const {
    activeProject, activeThreadIsStreaming, chatFileLinks, currentTab, executionPauseReason,
    executionPaused, failedSubtaskCount, handleResume, handleSelectPaneTab, project, resumableRun,
    state, visibleTabs,
  } = controller;
  return <div {...stylex.attrs(styles.paneBody)}>
            <Show when={currentTab()} keyed>
              {(selectedTab) => (
                <div {...stylex.attrs(styles.paneColumn)}>
                  <Show when={state.experienceMode === "advanced"}>
                  <div data-test-chat-pane-nav="" role="tablist" aria-label="Project panes" {...stylex.attrs(styles.paneTabs)}>
                    <div {...stylex.attrs(styles.paneTabList)}>
                      <For each={visibleTabs()}>
                        {(tab) => {
                          const pressed = selectedTab === tab.id;

                          return (
                            <Button
                              tooltip={tab.tooltip}
                              type="button"
                              role="tab"
                              variant="ghost"
                              class={stylex.attrs(styles.paneTab, pressed ? styles.paneTabSelected : styles.paneTabIdle).class}
                              aria-label={tab.label}
                              attr:aria-selected={pressed ? "true" : "false"}
                              tabIndex={pressed ? 0 : -1}
                              data-test-chat-pane-tab={tab.id}
                              onClick={() => handleSelectPaneTab(tab.id)}
                            >
                              {tab.icon}
                              <span {...stylex.attrs(styles.paneTabLabel)}>{tab.label}</span>
                            </Button>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                  </Show>
                  <Show when={resumableRun()}>
                    {(run) => (
                      <div {...stylex.attrs(styles.resumableBanner)}>
                        <div {...stylex.attrs(styles.minWidthZero)}>
                          <div {...stylex.attrs(styles.resumableHeading)}>
                            <AlertTriangle {...stylex.attrs(styles.iconSmall)} />
                            Resumable run
                          </div>
                          <div {...stylex.attrs(styles.resumableStatus)}>
                            Status: {run().status}. Failed subtasks: {failedSubtaskCount()}.
                          </div>
                          <div {...stylex.attrs(styles.resumableDetail)}>
                            Resume reruns failed or pending subtasks only. Composer text becomes extra guidance.
                          </div>
                        </div>
                        <ActionButton
                          tooltip="Resume failed or pending subagents"
                          disabledReason={
                            executionPaused()
                              ? executionPauseReason()
                              : activeThreadIsStreaming()
                                ? "Project is streaming"
                                : "No resumable run"
                          }
                          disabled={executionPaused() || !resumableRun() || activeThreadIsStreaming()}
                          icon={<RefreshCcw class={stylex.attrs(chatUtilityStyles.h4, chatUtilityStyles.w4).class} />}
                          type="button"
                          onClick={handleResume}
                        >
                          Resume failed agents
                        </ActionButton>
                      </div>
                    )}
                  </Show>

                  <Switch>
<ChatTranscriptMessages selectedTab={selectedTab} />
<ChatTranscriptPlan selectedTab={selectedTab} />
<ChatTranscriptRun selectedTab={selectedTab} />
<ChatTranscriptEvents selectedTab={selectedTab} />
                    <Match when={selectedTab === "memory"}>
                      <MemoryPane
                        projectId={project().id}
                        entries={activeProject()?.memoryEntries ?? []}
                        fileLinks={chatFileLinks()}
                      />
                    </Match>
                  </Switch>
                </div>
              )}
            </Show>
            </div>;
}
