import { For, Match, Show, Switch, createEffect, createMemo, createSignal, getOwner, onCleanup, onMount, runWithOwner, type JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { MarkdownContent } from "../markdown-content";
import { Dialog } from "../primitives/dialog";
import { chatPanelStyles as styles } from "../chat-panel.styles";
import { chatUtilityStyles } from "../chat-panel.utilities";
import type { ChatPanelController } from "../chat-panel";

export function ChatExperimentDialog(props: { controller: ChatPanelController }) {
  const {
    activeProject, experimentDialogOpen, experimentRun, selectedExperimentFilePath, setExperimentDialogOpen,
    setSelectedExperimentFilePath,
  } = props.controller;
  return <Dialog open={experimentDialogOpen()} onClose={() => setExperimentDialogOpen(false)} title="Experiment review">
              <div class={stylex.attrs(chatUtilityStyles.flex, chatUtilityStyles.flexCol, chatUtilityStyles.gap3, chatUtilityStyles.text07rem, chatUtilityStyles.leading6, chatUtilityStyles.textVariableForeground).class}>
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
                        <div class={stylex.attrs(chatUtilityStyles.grid, chatUtilityStyles.minH0, chatUtilityStyles.gap3, chatUtilityStyles.lgGridColsMinmax12rem18remMinmax01fr).class}>
                          <div class={stylex.attrs(chatUtilityStyles.minH0, chatUtilityStyles.rounded2xl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite65, chatUtilityStyles.p2).class}>
                            <div class={stylex.attrs(chatUtilityStyles.px2, chatUtilityStyles.pb2, chatUtilityStyles.text0585rem, chatUtilityStyles.fontSemibold, chatUtilityStyles.uppercase, chatUtilityStyles.tracking016em, chatUtilityStyles.textVariableMuted).class}>
                              {files().length} changed paths
                            </div>
                            <div class={stylex.attrs(chatUtilityStyles.grid, chatUtilityStyles.maxH72, chatUtilityStyles.gap1, chatUtilityStyles.overflowAuto).class}>
                              <For each={files()}>
                                {(file) => (
                                  <button
                                    type="button"
                                    class={stylex.attrs(
                                      chatUtilityStyles.minW0,
                                      chatUtilityStyles.roundedXl,
                                      chatUtilityStyles.px2,
                                      chatUtilityStyles.py2,
                                      chatUtilityStyles.textLeft,
                                      chatUtilityStyles.transition,
                                      selectedFile()?.path === file.path ? styles.experimentFileSelected : styles.experimentFileDefault
                                    ).class}
                                    onClick={() => setSelectedExperimentFilePath(file.path)}
                                  >
                                    <div class={stylex.attrs(chatUtilityStyles.truncate, chatUtilityStyles.text07rem, chatUtilityStyles.fontSemibold).class}>{file.path}</div>
                                    <div class={stylex.attrs(chatUtilityStyles.text06rem, chatUtilityStyles.opacity75).class}>+{file.additions} / -{file.deletions}</div>
                                  </button>
                                )}
                              </For>
                            </div>
                          </div>
                          <div class={stylex.attrs(chatUtilityStyles.minW0, chatUtilityStyles.rounded2xl, chatUtilityStyles.border, chatUtilityStyles.borderVariableBorder, chatUtilityStyles.bgWhite65, chatUtilityStyles.p3).class}>
                            <Show when={inspection().staleReason}>
                              {(reason) => <div class={stylex.attrs(chatUtilityStyles.mb3, chatUtilityStyles.roundedXl, chatUtilityStyles.border, chatUtilityStyles.borderAmber300, chatUtilityStyles.bgAmber50, chatUtilityStyles.px3, chatUtilityStyles.py2, chatUtilityStyles.text0675rem, chatUtilityStyles.textAmber900).class}>{reason()}</div>}
                            </Show>
                            <div class={stylex.attrs(chatUtilityStyles.mb2, chatUtilityStyles.flex, chatUtilityStyles.flexWrap, chatUtilityStyles.itemsCenter, chatUtilityStyles.justifyBetween, chatUtilityStyles.gap2, chatUtilityStyles.text0675rem, chatUtilityStyles.textVariableMuted).class}>
                              <span class={stylex.attrs(chatUtilityStyles.fontSemibold, chatUtilityStyles.textVariableForeground).class}>{selectedFile()?.path}</span>
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

