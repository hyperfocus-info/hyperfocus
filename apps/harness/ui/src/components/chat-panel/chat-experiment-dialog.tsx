import { typography } from "@hyperfocus/ui";
import * as stylex from "@stylexjs/stylex";
import { For,Show } from "solid-js";
import { chatUtilityStyles } from "../chat-panel.utilities";
import { MarkdownContent } from "../markdown-content";
import { Button } from "../primitives/button";
import { Dialog } from "../primitives/dialog";
import { chatTaskStyles as taskStyles } from "./chat-task.styles";
import { useChatPanel } from "./state/panel-context";

export function ChatExperimentDialog() {
  const controller = useChatPanel();
  const {
    activeProject, experimentDialogOpen, experimentRun, selectedExperimentFilePath, setExperimentDialogOpen,
    setSelectedExperimentFilePath,
  } = controller;
  return <Dialog open={experimentDialogOpen()} onClose={() => setExperimentDialogOpen(false)} title="Experiment review">
              <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap3, typography.control, chatUtilityStyles.leading6, chatUtilityStyles.textVariableForeground).class}>
                <Show when={experimentRun()}>
                  {(experiment) => (
                    <div>
                      <div class={stylex.attrs(chatUtilityStyles.fontSemibold).class}>{experiment().virtualBranchName}</div>
                      <div class={stylex.attrs(chatUtilityStyles.textVariableMuted).class}>
                        {experiment().filesChanged} files | +{experiment().insertions} / -{experiment().deletions}
                      </div>
                    </div>
                  )}
                </Show>
                <Show
                  when={activeProject()?.experimentInspection}
                  fallback={<div class={stylex.attrs(chatUtilityStyles.textVariableMuted).class}>Loading experiment diff...</div>}
                >
                  {(inspection) => {
                    const files = () => inspection().files ?? [];
                    const selectedFile = () => files().find((file) => file.path === selectedExperimentFilePath()) ?? files()[0];
                    return (
                      <Show when={files().length > 0} fallback={<MarkdownContent content={() => `\`\`\`diff\n${inspection().diffText}\n\`\`\``} size="compact" />}>
                        <div class={stylex.attrs(taskStyles.experiment).class}>
                          <div class={stylex.attrs(chatUtilityStyles.minH0, chatUtilityStyles.rounded2xl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite65, chatUtilityStyles.p2).class}>
                            <div class={stylex.attrs(chatUtilityStyles.px2, chatUtilityStyles.pb2, typography.caption, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking016em, chatUtilityStyles.textVariableMuted).class}>
                              {files().length} changed paths
                            </div>
                            <div class={stylex.attrs(chatUtilityStyles.grid, chatUtilityStyles.maxH72, chatUtilityStyles.gap1, chatUtilityStyles.overflowAuto).class}>
                              <For each={files()}>
                                {(file) => (
                                  <Button
                                    type="button"
                                    variant={selectedFile()?.path === file.path ? "default" : "ghost"}
                                    justificationForNoTooltip="The complete file path and change counts are visible"
                                    aria-pressed={selectedFile()?.path === file.path}
                                    class={stylex.attrs(
                                      taskStyles.file,
                                      chatUtilityStyles.roundedXl,
                                      chatUtilityStyles.px2,
                                      chatUtilityStyles.py2,
                                      chatUtilityStyles.textLeft,
                                      chatUtilityStyles.transition,
                                      taskStyles.readable
                                    ).class}
                                    onClick={() => setSelectedExperimentFilePath(file.path)}
                                  >
                                    <span {...stylex.attrs(taskStyles.attachmentCopy)}><span class={stylex.attrs(taskStyles.readable, taskStyles.caption, chatUtilityStyles.fontSemibold).class}>{file.path}</span>
                                    <span class={stylex.attrs(typography.control, chatUtilityStyles.opacity75).class}>+{file.additions} / -{file.deletions}</span></span>
                                  </Button>
                                )}
                              </For>
                            </div>
                          </div>
                          <div class={stylex.attrs(chatUtilityStyles.minW0, chatUtilityStyles.rounded2xl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite65, chatUtilityStyles.p3).class}>
                            <Show when={inspection().staleReason}>
                              {(reason) => <div class={stylex.attrs(chatUtilityStyles.mb3, chatUtilityStyles.roundedXl, chatUtilityStyles.border, chatUtilityStyles.borderAmber300, chatUtilityStyles.bgAmber50, chatUtilityStyles.px3, chatUtilityStyles.py2, typography.body, chatUtilityStyles.textAmber900).class}>{reason()}</div>}
                            </Show>
                            <div class={stylex.attrs(chatUtilityStyles.mb2, chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyBetween, chatUtilityStyles.gap2, typography.body, chatUtilityStyles.textVariableMuted).class}>
                              <span class={stylex.attrs(taskStyles.readable, chatUtilityStyles.fontSemibold, chatUtilityStyles.textVariableForeground).class}>{selectedFile()?.path}</span>
                              <span>+{selectedFile()?.additions ?? 0} / -{selectedFile()?.deletions ?? 0}</span>
                            </div>
                            <MarkdownContent content={() => `\`\`\`diff\n${selectedFile()?.hunksPreview || inspection().diffText}\n\`\`\``} size="compact" />
                          </div>
                        </div>
                      </Show>
                    );
                  }}
                </Show>
              </div>
            </Dialog>;
}
